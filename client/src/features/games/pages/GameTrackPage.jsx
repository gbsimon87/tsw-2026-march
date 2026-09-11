import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { trackEvent } from '../../analytics/trackEvent';
import { SportsLoader } from '../../../components/SportsLoader';
import { Modal } from '../../../components/ui/Modal';
import { gamesApi } from '../api/gamesApi';
import { teamsApi } from '../../teams/api/teamsApi';
import { GameVideoEmbed } from '../components/GameVideoEmbed';
import { InteractiveCourtImage } from '../components/InteractiveCourtImage';
import { AddRosterPlayerDialog } from '../components/AddRosterPlayerDialog';
import { GameTrackScoreHeader } from '../components/GameTrackScoreHeader';
import { GameClockControls } from '../components/GameClockControls';
import { VoiceTrackingControl } from '../components/VoiceTrackingControl';
import { clockSnapshot, formatClock, segmentLabel } from '../gameClock';
import {
  buildFreeThrowPayload,
  buildShotStatType,
  inferCourtSelection,
} from '../court/courtInference';
import { useCourtLayout } from '../court/useCourtLayout';
import gameConstants from '../constants';
import teamPlaceholder from '../../../assets/placeholders/team-logo-placeholder.svg';
import { CloudinaryImage } from '../../media/CloudinaryImage';
import { createParticipantIndex, resolveParticipant } from '../voice/resolveParticipant';
import { getVoiceAdapter } from '../voice/voiceAdapters';
import { getSpeechRecognitionSupport } from '../voice/useSpeechRecognition';

const { STAT_LABELS, ZONE_LABELS, TEAM_SIDES } = gameConstants;

function formatEventMeta(event, gameFormat) {
  const parts = [];

  if (
    gameFormat &&
    event.segmentKind &&
    event.segmentNumber &&
    typeof event.clockMillisecondsRemaining === 'number'
  ) {
    parts.push(
      `${segmentLabel(gameFormat, event.segmentKind, event.segmentNumber)} ${formatClock(event.clockMillisecondsRemaining)}`
    );
  }

  if (event.zoneId) {
    parts.push(ZONE_LABELS[event.zoneId] || event.zoneId);
  }

  return parts.join(' ');
}

function parseEventParts(event, playersById, gameFormat) {
  const player = event.playerId ? playersById.get(event.playerId) : null;
  const isSub = event.statType === 'SUB_IN' || event.statType === 'SUB_OUT';

  const actor =
    event.statType === 'SUB_IN'
      ? `${player?.displayName || 'Unknown'} subbed in`
      : event.statType === 'SUB_OUT'
        ? `${player?.displayName || 'Unknown'} subbed out`
        : event.playerId
          ? player?.displayName || 'Unknown'
          : 'Opponent';

  return {
    actor,
    statLabel: isSub ? null : STAT_LABELS[event.statType] || event.statType,
    meta: formatEventMeta(event, gameFormat) || null,
  };
}

function isReasonLabel(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

// The spoken confirmation for an answered follow-up. Dual-team rebounds are the only
// prompt whose stat depends on which side answered, mirroring handleFollowUpSelection.
function followUpLabelFor(prompt, resolved) {
  if (prompt.kind === 'rebound' && prompt.actorTeamSide) {
    return STAT_LABELS[resolved.side === prompt.actorTeamSide ? 'OREB' : 'DREB'];
  }
  return STAT_LABELS[prompt.statType] || prompt.statType || 'Event';
}

function createEmptySideState() {
  return {
    lineupDraft: [],
    selectedPlayerId: '',
    substitutionState: { playerOutId: '', playerInId: '' },
  };
}

function readLocalStorageFlag(key, defaultValue) {
  try {
    const stored = window.localStorage.getItem(key);
    return stored === null ? defaultValue : stored === 'true';
  } catch {
    return defaultValue;
  }
}

function writeLocalStorageFlag(key, value) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // ignore — e.g. storage disabled/unavailable; preference just won't persist
  }
}

function LineupPicker({
  isDualTeam,
  teamDisplayName,
  players,
  lineupDraft,
  onToggle,
  onSave,
  isSaving,
  variant = 'inline',
  stepLabel,
  canManageRoster,
  onAddPlayer,
  onExit = null,
}) {
  const content = (
    <div
      className={
        variant === 'fullscreen'
          ? 'w-full max-w-lg rounded-xl border border-slate-200 bg-slate-50 p-4'
          : 'rounded-xl border border-slate-200 bg-slate-50 p-4'
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Starting Lineup</h2>
          <p className="text-sm text-slate-500">
            {isDualTeam ? `${teamDisplayName} — ` : ''}
            {lineupDraft.length} / 5 selected
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onExit ? (
            <button
              type="button"
              onClick={onExit}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Back to game
            </button>
          ) : null}
          {canManageRoster ? (
            <button
              type="button"
              onClick={onAddPlayer}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              + Add player
            </button>
          ) : null}
          <button
            type="button"
            onClick={onSave}
            disabled={isSaving || lineupDraft.length === 0 || lineupDraft.length > 5}
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save Lineup'}
          </button>
        </div>
      </div>
      {players.length === 0 ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-semibold">No players found on this roster.</p>
          {canManageRoster ? (
            <p className="mt-1">Use “+ Add player” above to build this roster.</p>
          ) : (
            <p className="mt-1">Ask a league or team manager to add players before tracking.</p>
          )}
        </div>
      ) : (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {players.map((player) => {
            const checked = lineupDraft.includes(player.id);
            const isInactive = player.isActive === false;
            return (
              <label
                key={player.id}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition ${
                  checked
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : isInactive
                      ? 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-50'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <input
                  type="checkbox"
                  aria-label={`Select ${player.displayName} for the starting lineup`}
                  className="shrink-0 accent-white"
                  checked={checked}
                  disabled={isInactive}
                  onChange={(event) => {
                    if (isInactive) return;
                    onToggle(player.id, event.target.checked);
                  }}
                />
                <span className="text-sm font-medium">
                  {player.jerseyNumber != null ? `#${player.jerseyNumber} ` : ''}
                  {player.displayName}
                  {isInactive ? ' (inactive)' : ''}
                </span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );

  if (variant !== 'fullscreen') {
    return content;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-4">
      <div className="mb-4 text-center">
        {stepLabel ? (
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {stepLabel}
          </p>
        ) : null}
        <h1 className="mt-1 text-xl font-bold text-slate-900">
          Set {teamDisplayName} Starting Lineup
        </h1>
      </div>
      {content}
    </div>
  );
}

function GameVideoPanel({ videoUrl, title, videoIframeRef }) {
  if (!videoUrl) {
    return null;
  }

  // Always fills its container edge-to-edge (no card chrome / border radius) — both the
  // desktop left column and the mobile video-first view want the video as large as possible.
  return <GameVideoEmbed ref={videoIframeRef} videoUrl={videoUrl} title={title} fill />;
}

function VoiceHelpTable({ title, description, columns, rows }) {
  const headingId = `voice-help-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

  return (
    <section>
      <h3 id={headingId} className="font-semibold text-slate-900">
        {title}
      </h3>
      {description ? <p className="mt-1 text-xs text-slate-500">{description}</p> : null}
      <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
        <table aria-labelledby={headingId} className="w-full min-w-[36rem] text-left text-xs">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              {columns.map((column) => (
                <th key={column} scope="col" className="px-3 py-2.5 font-semibold">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white align-top">
            {rows.map((row) => (
              <tr key={row.join('|')}>
                {row.map((cell, index) => (
                  <td key={`${index}-${cell}`} className="px-3 py-2.5 text-slate-600">
                    {index === 1 ? (
                      <code className="font-mono font-semibold text-slate-900">{cell}</code>
                    ) : (
                      cell
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function GameTrackPage() {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [serverOffsetMilliseconds, setServerOffsetMilliseconds] = useState(0);
  const [rosterOverride, setRosterOverride] = useState(null);
  const [selectedShot, setSelectedShot] = useState(null);
  const [pendingFollowUpPrompt, setPendingFollowUpPrompt] = useState(null);
  const [lastTappedHoop, setLastTappedHoop] = useState('south');
  const [isSaving, setIsSaving] = useState(false);
  const [isTrackingFullscreen, setIsTrackingFullscreen] = useState(false);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const [videoUrlDraft, setVideoUrlDraft] = useState('');
  const [isVideoUrlEditOpen, setIsVideoUrlEditOpen] = useState(false);
  const [error, setError] = useState('');
  const [lastActionLabel, setLastActionLabel] = useState('');
  const [lastActionMeta, setLastActionMeta] = useState({ playerId: null });
  const [showAllRecentEvents, setShowAllRecentEvents] = useState(false);
  const [insertBeforeEventId, setInsertBeforeEventId] = useState('');
  const [currentVideoTimestamp, setCurrentVideoTimestamp] = useState(null);
  const [editingEvent, setEditingEvent] = useState(null);
  const [activeSide, setActiveSide] = useState(TEAM_SIDES.HOME);
  const [activePanel, setActivePanel] = useState('court');
  // Set when the short-lineup warning sends the user back to build a lineup.
  // The derived step below exits as soon as a side has ONE player, so without
  // this there is no way to reopen it — see returnToShortLineup.
  const [lineupRevisitSide, setLineupRevisitSide] = useState(null);
  const [isStandaloneLineupEditing, setIsStandaloneLineupEditing] = useState(false);
  const [sideState, setSideState] = useState({
    [TEAM_SIDES.HOME]: createEmptySideState(),
    [TEAM_SIDES.AWAY]: createEmptySideState(),
    oneSided: createEmptySideState(),
  });
  const [courtOrientation, setCourtOrientation] = useState('horizontal');
  const [isDesktopLayout, setIsDesktopLayout] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
  );
  const [isMobileEntryMode, setIsMobileEntryMode] = useState(false);
  const [pauseVideoOnEntry, setPauseVideoOnEntry] = useState(() =>
    readLocalStorageFlag('gameTrack.pauseVideoOnEntry', true)
  );
  const [isAddPlayerOpen, setIsAddPlayerOpen] = useState(false);
  const [showClockRecovery, setShowClockRecovery] = useState(false);
  const [showShortLineupWarning, setShowShortLineupWarning] = useState(false);
  const [pendingExitDestination, setPendingExitDestination] = useState('');
  const [isClockRecoveryCorrectionOpen, setIsClockRecoveryCorrectionOpen] = useState(false);
  const [clockRecoveryTimeDraft, setClockRecoveryTimeDraft] = useState('10:00');
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [isVoiceHelpOpen, setIsVoiceHelpOpen] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceFeedback, setVoiceFeedback] = useState(null);
  const [courtVoiceStartRequest, setCourtVoiceStartRequest] = useState(0);
  const [isCourtVoiceAttempt, setIsCourtVoiceAttempt] = useState(false);
  const isEventPickerOpen = Boolean(
    pendingFollowUpPrompt || (selectedShot && !isCourtVoiceAttempt)
  );
  const ghostClickGuardRef = useRef(null);
  const eventPickerRef = useRef(null);
  const inflightRef = useRef(Promise.resolve());
  const videoIframeRef = useRef(null);
  const videoCurrentTimeRef = useRef(null);
  const entryClockSnapshotRef = useRef(null);
  const entryClockWasRunningRef = useRef(false);
  const entryVideoWasPausedRef = useRef(false);
  const entryClockTransitionRef = useRef(Promise.resolve());
  const clockOperatedThisMountRef = useRef(false);
  const rotateCourt = courtOrientation === 'horizontal';
  // Resolved once from the game's immutable stamp, then used for BOTH the
  // rendered image and the click inference. Splitting those would let a
  // correct-looking court be read with another layout's calibration.
  const courtLayout = useCourtLayout(data?.game?.courtLayoutId);

  useEffect(() => {
    function onMessage(event) {
      // Only trust messages coming from our own YouTube iframe. This guards against any
      // other frame/script on the page spoofing an infoDelivery payload to poison the
      // captured playback timestamp. We compare event.source to the iframe's contentWindow
      // rather than event.origin because YouTube serves embeds from multiple origins
      // (youtube.com / youtube-nocookie.com). When no iframe is mounted there is no
      // legitimate infoDelivery source, so reject everything.
      if (!videoIframeRef.current || event.source !== videoIframeRef.current.contentWindow) {
        return;
      }
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        // infoDelivery fires continuously while playing and also on seek/pause
        if (data?.event === 'infoDelivery' && typeof data?.info?.currentTime === 'number') {
          videoCurrentTimeRef.current = data.info.currentTime;
        }
      } catch {
        // ignore non-JSON messages
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const update = () => setIsDesktopLayout(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    // The video remounts in a new location when the layout mode flips (see GameVideoPanel
    // usages below), so any previously-captured playback position is stale until the new
    // iframe reports its own infoDelivery event — clear it rather than risk tagging a stat
    // with a wrong timestamp from the just-destroyed iframe.
    videoCurrentTimeRef.current = null;
  }, [isDesktopLayout]);

  useEffect(() => {
    if (activePanel !== 'court') {
      setIsMobileEntryMode(false);
    }
  }, [activePanel]);

  useEffect(() => {
    if (!gameId || data?.game?.clock?.status !== 'running') return;
    // Recovery applies only when this page *loaded* an already-running clock.
    // A local Start/resume command naturally transitions the response to
    // `running`, but that is not an interrupted tracking session.
    if (clockOperatedThisMountRef.current) {
      sessionStorage.setItem(`gameClock:${gameId}`, 'active');
      return;
    }
    const navigation = performance.getEntriesByType?.('navigation')?.[0];
    const sameTabReload =
      navigation?.type === 'reload' && sessionStorage.getItem(`gameClock:${gameId}`) === 'active';
    sessionStorage.setItem(`gameClock:${gameId}`, 'active');
    if (!sameTabReload) setShowClockRecovery(true);
  }, [data?.game?.clock?.status, gameId]);

  useEffect(() => {
    if (data?.game?.clock?.status !== 'running') return undefined;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [data?.game?.clock?.status]);

  function togglePauseVideoOnEntry() {
    const next = !pauseVideoOnEntry;
    writeLocalStorageFlag('gameTrack.pauseVideoOnEntry', next);
    setPauseVideoOnEntry(next);
    // Turning the preference off means "stop controlling playback for stat entry".
    // If the video was auto-paused for an in-progress entry, resume it now — otherwise
    // it would be stranded paused, since no resume path fires while the pref is off.
    // (playVideo on an already-playing video is a harmless no-op.)
    if (!next) {
      entryVideoWasPausedRef.current = false;
      playVideo();
    }
  }

  function pauseVideo() {
    videoIframeRef.current?.contentWindow?.postMessage(
      '{"event":"command","func":"pauseVideo","args":""}',
      '*'
    );
  }

  function playVideo() {
    videoIframeRef.current?.contentWindow?.postMessage(
      '{"event":"command","func":"playVideo","args":""}',
      '*'
    );
  }

  function pauseVideoForEntry() {
    if (!pauseVideoOnEntry || entryVideoWasPausedRef.current) return;
    entryVideoWasPausedRef.current = true;
    pauseVideo();
  }

  function resumeVideoAfterEntry() {
    if (!entryVideoWasPausedRef.current) return;
    entryVideoWasPausedRef.current = false;
    playVideo();
  }

  const loadGame = useCallback(async () => {
    try {
      const response = await gamesApi.getById(gameId);
      const isDualTeam = response.game?.trackingMode === 'dual_team';
      const isStandalone =
        response.game?.gameContext === 'standalone' || !response.game?.gameContext;

      let resolvedResponse = response;

      if (!isDualTeam && isStandalone && response.game?.teamId) {
        const fromGame = response.team?.players || [];
        const hasActivePlayers = fromGame.some((p) => p.isActive !== false);
        if (!hasActivePlayers) {
          try {
            const teamRes = await teamsApi.getById(response.game.teamId);
            if (teamRes.team?.players?.length) {
              setRosterOverride(teamRes.team.players);
            }
          } catch {
            // fall through — use whatever the game response has
          }
        }
      }

      if (response.serverTime) {
        setServerOffsetMilliseconds(new Date(response.serverTime).getTime() - Date.now());
      }
      setData(resolvedResponse);

      const nextState = {
        [TEAM_SIDES.HOME]: createEmptySideState(),
        [TEAM_SIDES.AWAY]: createEmptySideState(),
        oneSided: createEmptySideState(),
      };

      if (isDualTeam) {
        for (const side of [TEAM_SIDES.HOME, TEAM_SIDES.AWAY]) {
          const sidePlayers = response.participants?.[side]?.players || [];
          const currentLineupIds = response.lineups?.[side]?.currentPlayerIds || [];
          nextState[side] = {
            lineupDraft: response.lineups?.[side]?.startingPlayerIds || currentLineupIds || [],
            selectedPlayerId: currentLineupIds[0] || sidePlayers[0]?.id || '',
            substitutionState: { playerOutId: '', playerInId: '' },
          };
        }
        setActiveSide(response.game?.activeSideDefault || TEAM_SIDES.HOME);
      } else {
        const lineupIds = response.game?.currentLineupPlayerIds || [];
        const roster = response.team?.players || [];
        nextState.oneSided = {
          lineupDraft: response.game?.startingLineupPlayerIds || lineupIds || [],
          selectedPlayerId: lineupIds[0] || roster[0]?.id || '',
          substitutionState: { playerOutId: '', playerInId: '' },
        };
      }

      setSideState(nextState);
    } catch (loadError) {
      setError(loadError.message || 'Failed to load game');
    }
  }, [gameId]);

  useEffect(() => {
    loadGame();
  }, [loadGame]);

  useEffect(() => {
    const shouldLock = isEventPickerOpen || isTrackingFullscreen;
    document.body.style.overflow = shouldLock ? 'hidden' : '';
    document.body.style.touchAction = shouldLock ? 'none' : '';
    return () => {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    };
  }, [isEventPickerOpen, isTrackingFullscreen]);

  const isDualTeam = data?.game?.trackingMode === 'dual_team';
  const isLeagueGame = data?.game?.gameContext === 'league';
  const canManageRoster = Boolean(data?.canManageRoster);
  // Reaching this page for a league game already requires being the league
  // owner, an active league manager, or a manager of one of the two teams —
  // assertGameAccess -> canManageLeagueGame. canManageGameRoster allows exactly
  // that same set, so for a league game the roster flag can only ever produce a
  // false negative: someone who is allowed to add players but sees no way to.
  // The server stays authoritative on the write either way.
  const canAddRosterPlayer = canManageRoster || isLeagueGame;
  const participantsBySide = useMemo(() => data?.participants || {}, [data?.participants]);
  const activeKey = isDualTeam ? activeSide : 'oneSided';
  const currentSideState = sideState[activeKey] || createEmptySideState();
  const team = data?.team || null;
  // OPT-016: memoised — `|| []` was a fresh array every render whenever the
  // lineup was empty, which alone defeated the onCourtPlayers/benchPlayers
  // memoisation below (their deps never looked equal).
  const lineupIds = useMemo(
    () =>
      isDualTeam
        ? data?.lineups?.[activeSide]?.currentPlayerIds || []
        : data?.game?.currentLineupPlayerIds || [],
    [isDualTeam, data, activeSide]
  );
  const players = useMemo(() => {
    if (isDualTeam) {
      return participantsBySide[activeSide]?.players || [];
    }
    const roster = rosterOverride || team?.players || [];
    return roster;
  }, [activeSide, isDualTeam, participantsBySide, rosterOverride, team]);
  const playersById = useMemo(() => {
    const entries = [];
    if (isDualTeam) {
      for (const side of [TEAM_SIDES.HOME, TEAM_SIDES.AWAY]) {
        for (const player of participantsBySide[side]?.players || []) {
          entries.push([player.id, player]);
        }
      }
    } else {
      for (const player of team?.players || []) {
        entries.push([player.id, player]);
      }
    }
    return new Map(entries);
  }, [isDualTeam, participantsBySide, team]);
  // OPT-016: memoised — these were recreated on every render (even ones that
  // touch unrelated state like the shot picker or follow-up prompts), forcing
  // every consumer to re-render and recompute derived data off a "new" array.
  const onCourtPlayers = useMemo(
    () => lineupIds.map((id) => playersById.get(id)).filter(Boolean),
    [lineupIds, playersById]
  );
  const onCourtPlayersBySide = useMemo(() => {
    if (!isDualTeam) return {};
    return Object.fromEntries(
      [TEAM_SIDES.HOME, TEAM_SIDES.AWAY].map((side) => [
        side,
        (data?.lineups?.[side]?.currentPlayerIds || [])
          .map((id) => playersById.get(id))
          .filter(Boolean),
      ])
    );
  }, [data?.lineups, isDualTeam, playersById]);
  const benchPlayers = useMemo(
    () => players.filter((player) => !lineupIds.includes(player.id)),
    [players, lineupIds]
  );
  const playerSideMap = useMemo(() => {
    if (!isDualTeam) return new Map();
    const map = new Map();
    for (const side of [TEAM_SIDES.HOME, TEAM_SIDES.AWAY]) {
      for (const player of participantsBySide[side]?.players || []) {
        map.set(player.id, side);
      }
    }
    return map;
  }, [isDualTeam, participantsBySide]);
  const boxScore = data?.boxScore || null;
  const game = data?.game || null;
  const isCompleted = game?.status === 'completed';
  const homeLineupCount = (data?.lineups?.[TEAM_SIDES.HOME]?.currentPlayerIds || []).length;
  const awayLineupCount = (data?.lineups?.[TEAM_SIDES.AWAY]?.currentPlayerIds || []).length;
  const homeLineupReady = homeLineupCount > 0;
  const awayLineupReady = awayLineupCount > 0;
  const homeStartingLineupSet =
    (data?.lineups?.[TEAM_SIDES.HOME]?.startingPlayerIds || []).length > 0;
  const awayStartingLineupSet =
    (data?.lineups?.[TEAM_SIDES.AWAY]?.startingPlayerIds || []).length > 0;
  const startingLineupsSet = isDualTeam
    ? homeStartingLineupSet && awayStartingLineupSet
    : (game?.startingLineupPlayerIds || []).length > 0;
  const allStartingLineupsReady = isDualTeam
    ? homeLineupReady && awayLineupReady
    : (game?.currentLineupPlayerIds || []).length > 0;
  const hasShortStartingLineup = isDualTeam
    ? homeLineupCount < 5 || awayLineupCount < 5
    : (game?.currentLineupPlayerIds || []).length < 5;
  const derivedLineupSetupStep = !isCompleted
    ? isDualTeam
      ? !homeStartingLineupSet
        ? 'home'
        : !awayStartingLineupSet
          ? 'away'
          : null
      : !startingLineupsSet
        ? 'oneSided'
        : null
    : null;
  // A side counts as "ready" at one player, so both sides can be ready while
  // still being short of five. lineupRevisitSide reopens the step in that case.
  const lineupSetupStep =
    derivedLineupSetupStep || (isLeagueGame && isDualTeam ? lineupRevisitSide : null);
  const voiceParticipantIndex = useMemo(
    () =>
      createParticipantIndex({
        trackingMode: isDualTeam ? 'dual_team' : 'one_sided',
        playersBySide: isDualTeam
          ? {
              [TEAM_SIDES.HOME]: participantsBySide[TEAM_SIDES.HOME]?.players || [],
              [TEAM_SIDES.AWAY]: participantsBySide[TEAM_SIDES.AWAY]?.players || [],
            }
          : { tracked: rosterOverride || team?.players || [] },
        lineupIdsBySide: isDualTeam
          ? {
              [TEAM_SIDES.HOME]: data?.lineups?.[TEAM_SIDES.HOME]?.currentPlayerIds || [],
              [TEAM_SIDES.AWAY]: data?.lineups?.[TEAM_SIDES.AWAY]?.currentPlayerIds || [],
            }
          : { tracked: game?.currentLineupPlayerIds || [] },
      }),
    [
      data?.lineups,
      game?.currentLineupPlayerIds,
      isDualTeam,
      participantsBySide,
      rosterOverride,
      team,
    ]
  );
  // The single source of truth for "who may answer this follow-up". The picker renders
  // `groups`; a voice answer resolves against `pools`. Sides are always null outside a
  // dual-team game — resolveParticipant rejects a truthy side in one_sided mode.
  function followUpGroupsFor(prompt) {
    const actorSide = isDualTeam ? prompt.actorTeamSide || activeSide : null;
    const otherSide = actorSide === TEAM_SIDES.HOME ? TEAM_SIDES.AWAY : TEAM_SIDES.HOME;
    const sameSidePlayers = isDualTeam ? onCourtPlayersBySide[actorSide] || [] : onCourtPlayers;
    const otherSidePlayers = isDualTeam ? onCourtPlayersBySide[otherSide] || [] : [];

    let rawGroups;
    let allowUnassisted = false;
    let allowOpponent = false;
    let skipOnly = false;

    if (prompt.kind === 'assist') {
      rawGroups = [
        {
          side: actorSide,
          players: sameSidePlayers.filter((player) => player.id !== prompt.actorPlayerId),
        },
      ];
      allowUnassisted = true;
    } else if (prompt.kind === 'rebound') {
      if (isDualTeam) {
        // Either lineup can rebound, the shooter included; the side decides OREB vs DREB.
        rawGroups = [
          { side: actorSide, players: sameSidePlayers },
          { side: otherSide, players: otherSidePlayers },
        ];
      } else {
        rawGroups = [{ side: null, players: onCourtPlayers }];
        allowOpponent = true;
      }
    } else if (prompt.kind === 'who_was_fouled') {
      // The model stores no foul victim, so this prompt can only be closed.
      rawGroups = [{ side: otherSide, players: otherSidePlayers }];
      skipOnly = true;
    } else if (prompt.playerPool === 'other') {
      rawGroups = [{ side: otherSide, players: otherSidePlayers }];
    } else {
      rawGroups = [{ side: actorSide, players: sameSidePlayers }];
    }

    const groups = rawGroups.map((group) => ({
      side: isDualTeam ? group.side : null,
      players: group.players,
    }));

    return {
      kind: prompt.kind,
      statType: prompt.statType ?? null,
      actorPlayerId: prompt.actorPlayerId ?? null,
      actorTeamSide: actorSide,
      courtLocation: prompt.courtLocation || null,
      groups,
      pools: skipOnly
        ? []
        : groups.map((group) => ({
            side: group.side,
            playerIds: group.players.map((player) => player.id),
          })),
      allowUnassisted,
      allowOpponent,
      skipOnly,
    };
  }

  const voiceContextVersion = useMemo(
    () =>
      JSON.stringify({
        gameId: game?.id,
        sport: game?.sport,
        trackingMode: game?.trackingMode,
        lineups: isDualTeam ? data?.lineups : game?.currentLineupPlayerIds,
        selectedShot,
        pendingFollowUpPrompt,
        insertBeforeEventId,
        editingEventId: editingEvent?.id,
        lineupSetupStep,
        showClockRecovery,
        isCompleted,
      }),
    [
      data?.lineups,
      editingEvent?.id,
      game?.currentLineupPlayerIds,
      game?.id,
      game?.sport,
      game?.trackingMode,
      insertBeforeEventId,
      isCompleted,
      isDualTeam,
      lineupSetupStep,
      pendingFollowUpPrompt,
      selectedShot,
      showClockRecovery,
    ]
  );
  const speechSupport = getSpeechRecognitionSupport();
  const voiceSportSupported = Boolean(getVoiceAdapter(game?.sport || 'basketball'));
  const voiceDisabled = Boolean(
    isSaving ||
    lineupSetupStep ||
    !allStartingLineupsReady ||
    insertBeforeEventId ||
    editingEvent ||
    showClockRecovery ||
    isCompleted ||
    showFinishConfirm ||
    pendingExitDestination ||
    isStandaloneLineupEditing
  );
  const prevLineupStepRef = useRef(lineupSetupStep);

  useEffect(() => {
    if (lineupSetupStep === 'home' && activeSide !== TEAM_SIDES.HOME) {
      setActiveSide(TEAM_SIDES.HOME);
    } else if (lineupSetupStep === 'away' && activeSide !== TEAM_SIDES.AWAY) {
      setActiveSide(TEAM_SIDES.AWAY);
    } else if (prevLineupStepRef.current === 'away' && lineupSetupStep === null) {
      setActiveSide(TEAM_SIDES.HOME);
    }
    prevLineupStepRef.current = lineupSetupStep;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineupSetupStep]);

  function updateSideState(key, updates) {
    setSideState((current) => ({
      ...current,
      [key]: {
        ...current[key],
        ...updates,
      },
    }));
  }

  function updateData(response, actionLabel = '') {
    if (response.serverTime) {
      setServerOffsetMilliseconds(new Date(response.serverTime).getTime() - Date.now());
    }
    setData((current) => ({ ...current, ...response }));
    if (isDualTeam) {
      for (const side of [TEAM_SIDES.HOME, TEAM_SIDES.AWAY]) {
        const nextLineupIds = response.lineups?.[side]?.currentPlayerIds || [];
        updateSideState(side, {
          selectedPlayerId:
            nextLineupIds.includes(sideState[side].selectedPlayerId) &&
            sideState[side].selectedPlayerId
              ? sideState[side].selectedPlayerId
              : nextLineupIds[0] || participantsBySide[side]?.players?.[0]?.id || '',
        });
      }
    } else {
      const nextLineupIds = response.game?.currentLineupPlayerIds || [];
      updateSideState('oneSided', {
        selectedPlayerId:
          nextLineupIds.includes(sideState.oneSided.selectedPlayerId) &&
          sideState.oneSided.selectedPlayerId
            ? sideState.oneSided.selectedPlayerId
            : nextLineupIds[0] || team?.players?.[0]?.id || '',
      });
    }

    if (actionLabel) {
      setLastActionLabel(actionLabel);
    }
  }

  function updateLastAction(label, playerId = null) {
    setLastActionLabel(label);
    setLastActionMeta({ playerId });
  }

  function requireLineup() {
    if (showClockRecovery) {
      setError('Resolve the running clock recovery before tracking an event');
      return false;
    }
    if (data?.game?.clock?.status === 'ready') {
      setError('Start the game clock before recording an event');
      return false;
    }
    if (isDualTeam) {
      const homeReady = (data?.lineups?.[TEAM_SIDES.HOME]?.currentPlayerIds || []).length > 0;
      const awayReady = (data?.lineups?.[TEAM_SIDES.AWAY]?.currentPlayerIds || []).length > 0;
      if (!homeReady || !awayReady) {
        setError('Set a starting lineup for both teams before tracking');
        return false;
      }
      return true;
    }

    if (lineupIds.length === 0) {
      setError('Set a starting lineup before tracking');
      return false;
    }

    return true;
  }

  function requirePlayerSelection(playerId = currentSideState.selectedPlayerId) {
    if (isSaving) {
      return false;
    }

    if (!requireLineup()) {
      return false;
    }

    if (!playerId) {
      setError('Select a player first');
      return false;
    }

    return true;
  }

  function buildEventPayload(payload, eventContext = {}) {
    const resolvedVideoTimestamp = Object.prototype.hasOwnProperty.call(
      eventContext,
      'videoTimestamp'
    )
      ? eventContext.videoTimestamp
      : currentVideoTimestamp;
    const withTimestamp =
      typeof resolvedVideoTimestamp === 'number'
        ? { ...payload, videoTimestamp: resolvedVideoTimestamp }
        : payload;
    const snapshot =
      eventContext.clockSnapshot ||
      entryClockSnapshotRef.current ||
      (data?.game?.clock ? clockSnapshot(data.game, Date.now() + serverOffsetMilliseconds) : {});
    const withClock = { ...withTimestamp, ...snapshot };
    // Write precondition for coordinate-bearing events only: the server
    // compares it with the game's own stamp and rejects a mismatch, so a stale
    // tab cannot record clicks captured on a different court image.
    const withLayout =
      typeof withClock.x === 'number' || typeof withClock.y === 'number'
        ? { ...withClock, courtLayoutId: eventContext.courtLayoutId || courtLayout.id }
        : withClock;
    const isOpponentAggregate = String(payload.statType || '').startsWith('OPP_');
    if (!isDualTeam || isOpponentAggregate) return withLayout;
    return { ...withLayout, teamSide: payload.teamSide || eventContext.teamSide || activeSide };
  }

  async function submitEvent(payload, { insertBeforeId = '', ...eventContext } = {}) {
    if (!eventContext.clockSnapshot) captureEntrySnapshot();
    const eventPayload = buildEventPayload(payload, eventContext);
    // Pausing/resuming the clock writes the same optimistically-concurrent Game
    // document as a stat. Wait for any entry clock transition so a quick tap on
    // FT+ (or another stat) cannot race that write and receive a false 409.
    await entryClockTransitionRef.current.catch(() => undefined);
    try {
      return insertBeforeId
        ? await gamesApi.insertEventBefore(gameId, insertBeforeId, eventPayload)
        : await gamesApi.appendEvent(gameId, eventPayload);
    } catch (submitError) {
      // A conflict or transport failure can mean that local Events are stale, or that the
      // response was lost after the server wrote. Reconcile once, but never replay a mutation.
      if (submitError?.status === 409 || submitError?.status == null) {
        await loadGame();
      }
      throw submitError;
    }
  }

  function buildCourtFields(shot) {
    if (!shot) return {};
    return {
      zoneId: shot.zoneId,
      x: Number(shot.x.toFixed(2)),
      y: Number(shot.y.toFixed(2)),
    };
  }

  function captureVideoTimestamp() {
    const timestamp =
      typeof videoCurrentTimeRef.current === 'number'
        ? Math.round(videoCurrentTimeRef.current)
        : null;
    setCurrentVideoTimestamp(timestamp);
    return timestamp;
  }

  function captureEntrySnapshot() {
    if (!entryClockSnapshotRef.current && data?.game?.clock) {
      entryClockSnapshotRef.current = clockSnapshot(
        data.game,
        Date.now() + serverOffsetMilliseconds
      );
    }
    return entryClockSnapshotRef.current;
  }

  function pauseClockForEntry() {
    if (
      !pauseVideoOnEntry ||
      data?.game?.clock?.status !== 'running' ||
      entryClockWasRunningRef.current
    )
      return entryClockTransitionRef.current;
    entryClockWasRunningRef.current = true;
    const transition = entryClockTransitionRef.current
      .catch(() => undefined)
      .then(() => gamesApi.updateClock(gameId, { action: 'pause' }))
      .then((response) => updateData(response))
      .catch((clockError) => {
        entryClockWasRunningRef.current = false;
        setError(clockError.message || 'Failed to pause the game clock');
      });
    entryClockTransitionRef.current = transition;
    return transition;
  }

  function resumeClockAfterEntry() {
    if (!entryClockWasRunningRef.current) return entryClockTransitionRef.current;
    entryClockWasRunningRef.current = false;
    const transition = entryClockTransitionRef.current
      .catch(() => undefined)
      .then(() => gamesApi.updateClock(gameId, { action: 'start' }))
      .then((response) => updateData(response))
      .catch((clockError) => {
        setError(clockError.message || 'Stat saved, but the game clock remains paused');
      });
    entryClockTransitionRef.current = transition;
    return transition;
  }

  function onCourtSelect(point) {
    if (isSaving || voiceBusy || !requireLineup()) {
      return;
    }

    const inferred = inferCourtSelection(point.x, point.y, courtLayout.calibration);
    setSelectedShot(inferred);
    setPendingFollowUpPrompt(null);
    setLastTappedHoop(inferred.nearestHoop);
    setError('');
    ghostClickGuardRef.current = Date.now();
    if (pauseVideoOnEntry) {
      pauseVideoForEntry();
      pauseClockForEntry();
    }
    captureVideoTimestamp();
    captureEntrySnapshot();

    if (voiceEnabled && voiceSportSupported && !voiceDisabled) {
      // Keep the court surface mounted while recognition starts. The request counter is consumed
      // by VoiceTrackingControl after this selectedShot render commits, so beginVoiceAttempt
      // captures the location from this exact tap.
      setIsCourtVoiceAttempt(true);
      setCourtVoiceStartRequest((request) => request + 1);
    } else {
      setIsCourtVoiceAttempt(false);
    }
  }

  function openTrackingOverlay() {
    if (voiceBusy || !requireLineup()) {
      return;
    }

    setError('');
    setIsTrackingFullscreen(true);
    trackEvent('game_tracking_overlay_opened', { game_id: gameId });
  }

  function closeTrackingOverlay() {
    if (voiceBusy) return;
    setSelectedShot(null);
    setPendingFollowUpPrompt(null);
    setIsTrackingFullscreen(false);
    trackEvent('game_tracking_overlay_closed', { game_id: gameId });
  }

  function resetTransientTrackingState() {
    setSelectedShot(null);
    setPendingFollowUpPrompt(null);
    setError('');
  }

  function changeActiveSide(nextSide) {
    if (voiceBusy || !isDualTeam || nextSide === activeSide) {
      return;
    }

    resetTransientTrackingState();
    setActiveSide(nextSide);
  }

  function clearEventPicker(reason = '', { resume = false } = {}) {
    setIsCourtVoiceAttempt(false);
    setSelectedShot(null);
    setPendingFollowUpPrompt(null);
    setCurrentVideoTimestamp(null);
    entryClockSnapshotRef.current = null;
    if (isReasonLabel(reason)) {
      setLastActionLabel(reason);
    }
    if (resume) {
      setIsMobileEntryMode(false);
      resumeVideoAfterEntry();
      resumeClockAfterEntry();
    }
  }

  async function addReboundEvent(
    statType,
    {
      playerId = currentSideState.selectedPlayerId,
      teamSide = activeSide,
      shot = selectedShot,
      eventContext = {},
    } = {}
  ) {
    if (isSaving || (voiceBusy && eventContext.source !== 'voice')) {
      return;
    }

    const reboundPlayerId = playerId;
    if (!reboundPlayerId) {
      setError('Select a player first');
      return;
    }

    setError('');
    setIsSaving(true);

    const isInsert = Boolean(insertBeforeEventId);
    const courtFields = buildCourtFields(shot);
    const payload = { playerId: reboundPlayerId, statType, ...courtFields };
    const label = STAT_LABELS[statType] || statType;

    // Transition UI immediately.
    if (isInsert) {
      // Keep picker open until confirmed.
    } else {
      setSelectedShot(null);
      if (statType === 'DREB' && isDualTeam) {
        setPendingFollowUpPrompt({
          kind: 'who_missed_shot',
          statType: 'FG2_MISS',
          actorPlayerId: reboundPlayerId,
          actorTeamSide: isDualTeam ? teamSide : null,
          playerPool: 'other',
          courtLocation: courtFields,
        });
      } else if (statType === 'OREB') {
        setPendingFollowUpPrompt({
          kind: 'who_missed_shot',
          statType: 'FG2_MISS',
          actorPlayerId: reboundPlayerId,
          actorTeamSide: isDualTeam ? teamSide : null,
          playerPool: 'same',
          courtLocation: courtFields,
        });
      } else {
        setPendingFollowUpPrompt(null);
      }
    }

    inflightRef.current = submitEvent(payload, {
      insertBeforeId: isInsert ? insertBeforeEventId : '',
      teamSide,
      ...eventContext,
    })
      .then((response) => {
        updateData(response, label);
        updateLastAction(label, reboundPlayerId);
        if (isInsert) {
          setInsertBeforeEventId('');
          clearEventPicker('', { resume: true });
        }
      })
      .catch((err) => {
        setError(err.message || 'Failed to add rebound event');
        clearEventPicker('', { resume: true });
        throw err;
      })
      .finally(() => setIsSaving(false));
    try {
      await inflightRef.current;
      return true;
    } catch {
      return false;
    }
  }

  // Returns whether the answer was stored (or deliberately stored nothing, as with
  // Unassisted). Voice needs that outcome; the buttons ignore it.
  async function handleFollowUpSelection(option, { source = 'manual' } = {}) {
    if (voiceBusy && source !== 'voice') return false;
    if (!pendingFollowUpPrompt) {
      clearEventPicker();
      return false;
    }

    const prompt = pendingFollowUpPrompt;

    if (option === 'NO_ASSIST') {
      clearEventPicker('', { resume: true });
      setError('');
      return true;
    }

    setError('');
    setIsSaving(true);

    // Chain onto the primary event. inflightRef always holds a Promise, so
    // this await is always real. If the primary failed (re-threw), we bail here
    // — the primary's catch already reset the UI so nothing more to do.
    try {
      await inflightRef.current;
    } catch {
      setIsSaving(false);
      return false;
    }

    try {
      let payload;
      let label;

      const followUpCourt = prompt.courtLocation || {};
      const actorTeamSide = prompt.actorTeamSide || activeSide;
      const opposingActorSide =
        actorTeamSide === TEAM_SIDES.HOME ? TEAM_SIDES.AWAY : TEAM_SIDES.HOME;

      if (option === 'OPP_REB') {
        payload = { statType: 'OPP_REB', ...followUpCourt };
        label = 'Opponent Rebound';
      } else if (isDualTeam && prompt.kind === 'rebound') {
        const rebounderSide = playerSideMap.get(option) || actorTeamSide;
        const isOffensive = rebounderSide === actorTeamSide;
        const statType = isOffensive ? 'OREB' : 'DREB';
        payload = { playerId: option, statType, teamSide: rebounderSide, ...followUpCourt };
        label = STAT_LABELS[statType] || statType;
      } else if (prompt.kind === 'who_missed_shot') {
        const playerSide = isDualTeam
          ? playerSideMap.get(option) ||
            (prompt.playerPool === 'other' ? opposingActorSide : actorTeamSide)
          : undefined;
        payload = {
          playerId: option,
          statType: 'FG2_MISS',
          ...followUpCourt,
          ...(playerSide ? { teamSide: playerSide } : {}),
        };
        label = STAT_LABELS['FG2_MISS'] || 'FG2 Miss';
      } else if (prompt.kind === 'who_turned_over' || prompt.kind === 'who_got_steal') {
        const playerSide = isDualTeam ? playerSideMap.get(option) || opposingActorSide : undefined;
        payload = {
          playerId: option,
          statType: prompt.statType,
          ...followUpCourt,
          ...(playerSide ? { teamSide: playerSide } : {}),
        };
        label = STAT_LABELS[prompt.statType] || prompt.statType;
      } else if (prompt.kind === 'who_was_fouled') {
        clearEventPicker('', { resume: true });
        return true;
      } else {
        payload = {
          playerId: option,
          statType: prompt.statType,
          ...followUpCourt,
        };
        label = STAT_LABELS[prompt.statType] || prompt.statType;
      }

      const followUpKind = prompt.kind;
      inflightRef.current = submitEvent(payload, { teamSide: actorTeamSide })
        .then((response) => {
          updateData(response, label);
          clearEventPicker('', { resume: true });
        })
        .catch((submitError) => {
          setError(
            submitError.message ||
              (followUpKind === 'assist'
                ? 'Basket recorded, but failed to add assist'
                : 'Miss recorded, but failed to add rebound')
          );
          // The prompt stays open after a failed answer. Leaving a rejected promise in
          // inflightRef would make the next attempt bail at its own await and no-op.
          inflightRef.current = Promise.resolve();
          throw submitError;
        })
        .finally(() => setIsSaving(false));

      await inflightRef.current;
      return true;
    } catch {
      // Error already handled and displayed by the promise chain above.
      return false;
    }
  }

  async function addShotEvent(
    outcome,
    {
      playerId = currentSideState.selectedPlayerId,
      teamSide = activeSide,
      shot = selectedShot,
      eventContext = {},
    } = {}
  ) {
    if (voiceBusy && eventContext.source !== 'voice') return false;
    if (!requirePlayerSelection(playerId)) {
      return;
    }

    if (!shot) {
      setError('Tap the court first to select a shot location');
      return;
    }

    setError('');
    setIsSaving(true);

    const payload = {
      playerId,
      statType: buildShotStatType(shot.shotFamily, outcome),
      ...buildCourtFields(shot),
    };
    const shotLabel = STAT_LABELS[payload.statType] || payload.statType;
    const actorPlayerId = playerId;
    const isInsert = Boolean(insertBeforeEventId);

    const shotCourtFields = {
      zoneId: shot.zoneId,
      x: Number(shot.x.toFixed(2)),
      y: Number(shot.y.toFixed(2)),
    };

    // Transition UI immediately — don't wait for the API.
    if (isInsert) {
      // Insert mode: keep picker open until confirmed.
    } else if (outcome === 'miss') {
      setSelectedShot(null);
      setPendingFollowUpPrompt({
        kind: 'rebound',
        statType: 'OREB',
        actorPlayerId,
        actorTeamSide: isDualTeam ? teamSide : null,
        courtLocation: shotCourtFields,
      });
    } else if (payload.statType === 'FG2_MADE' || payload.statType === 'FG3_MADE') {
      setSelectedShot(null);
      setPendingFollowUpPrompt({
        kind: 'assist',
        statType: 'AST',
        actorPlayerId,
        actorTeamSide: isDualTeam ? teamSide : null,
        courtLocation: shotCourtFields,
      });
    } else {
      clearEventPicker('', { resume: true });
    }

    inflightRef.current = submitEvent(payload, {
      insertBeforeId: isInsert ? insertBeforeEventId : '',
      teamSide,
      ...eventContext,
    })
      .then((response) => {
        updateData(response, shotLabel);
        updateLastAction(shotLabel, actorPlayerId);
        if (isInsert) {
          setInsertBeforeEventId('');
          clearEventPicker('', { resume: true });
        }
      })
      .catch((err) => {
        setError(err.message || 'Failed to add shot event');
        clearEventPicker('', { resume: true });
        throw err;
      })
      .finally(() => setIsSaving(false));
    try {
      await inflightRef.current;
      return true;
    } catch {
      return false;
    }
  }

  async function addFreeThrowEvent(
    outcome,
    {
      playerId = currentSideState.selectedPlayerId,
      teamSide = activeSide,
      shot = selectedShot,
      eventContext = {},
    } = {}
  ) {
    if (voiceBusy && eventContext.source !== 'voice') return false;
    if (!requirePlayerSelection(playerId)) {
      return;
    }

    setError('');
    setIsSaving(true);

    const inferred = buildFreeThrowPayload(
      shot?.nearestHoop || lastTappedHoop,
      outcome,
      courtLayout.calibration
    );
    const payload = {
      playerId,
      statType: inferred.statType,
      zoneId: inferred.zoneId,
      x: inferred.x,
      y: inferred.y,
    };
    const ftLabel = STAT_LABELS[payload.statType] || payload.statType;
    const actorPlayerId = playerId;
    const isInsert = Boolean(insertBeforeEventId);

    // Transition UI immediately.
    if (isInsert) {
      // Keep picker open until confirmed.
    } else if (outcome === 'miss') {
      setSelectedShot(null);
      setPendingFollowUpPrompt({
        kind: 'rebound',
        statType: 'OREB',
        actorPlayerId,
        actorTeamSide: isDualTeam ? teamSide : null,
        courtLocation: { zoneId: inferred.zoneId, x: inferred.x, y: inferred.y },
      });
    } else {
      clearEventPicker('', { resume: true });
    }

    inflightRef.current = submitEvent(payload, {
      insertBeforeId: isInsert ? insertBeforeEventId : '',
      teamSide,
      ...eventContext,
    })
      .then((response) => {
        updateData(response, ftLabel);
        updateLastAction(ftLabel, actorPlayerId);
        if (isInsert) {
          setInsertBeforeEventId('');
          clearEventPicker('', { resume: true });
        }
      })
      .catch((err) => {
        setError(err.message || 'Failed to add free throw event');
        clearEventPicker('', { resume: true });
        throw err;
      })
      .finally(() => setIsSaving(false));
    try {
      await inflightRef.current;
      return true;
    } catch {
      return false;
    }
  }

  async function removeEvent(eventId) {
    if (isSaving) {
      return false;
    }

    setError('');
    setIsSaving(true);
    try {
      const response = await gamesApi.removeEvent(gameId, eventId);
      updateData(response, 'Event removed');
      return true;
    } catch (removeError) {
      setError(removeError.message || 'Failed to remove event');
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  async function addQuickStatEvent(
    statType,
    {
      playerId = currentSideState.selectedPlayerId,
      teamSide = activeSide,
      shot = selectedShot,
      eventContext = {},
    } = {}
  ) {
    if (voiceBusy && eventContext.source !== 'voice') return false;
    if (!requirePlayerSelection(playerId)) {
      return;
    }

    setError('');
    setIsSaving(true);

    const isInsert = Boolean(insertBeforeEventId);
    const courtFields = buildCourtFields(shot);
    const payload = {
      playerId,
      statType,
      ...courtFields,
    };
    const quickLabel = STAT_LABELS[statType] || statType;
    const actorPlayerId = playerId;

    // Transition UI immediately.
    if (isInsert) {
      // Keep picker open until confirmed.
    } else if (statType === 'STL' && isDualTeam) {
      setSelectedShot(null);
      setPendingFollowUpPrompt({
        kind: 'who_turned_over',
        statType: 'TOV',
        actorPlayerId,
        actorTeamSide: teamSide,
        playerPool: 'other',
        courtLocation: courtFields,
      });
    } else if (statType === 'BLK' && isDualTeam) {
      setSelectedShot(null);
      setPendingFollowUpPrompt({
        kind: 'who_missed_shot',
        statType: 'FG2_MISS',
        actorPlayerId,
        actorTeamSide: teamSide,
        playerPool: 'other',
        courtLocation: courtFields,
      });
    } else if (statType === 'TOV' && isDualTeam) {
      setSelectedShot(null);
      setPendingFollowUpPrompt({
        kind: 'who_got_steal',
        statType: 'STL',
        actorPlayerId,
        actorTeamSide: teamSide,
        playerPool: 'other',
        courtLocation: courtFields,
      });
    } else if (statType === 'FOUL' && isDualTeam) {
      setSelectedShot(null);
      setPendingFollowUpPrompt({
        kind: 'who_was_fouled',
        statType: null,
        actorPlayerId,
        actorTeamSide: teamSide,
        playerPool: 'other',
        courtLocation: courtFields,
      });
    } else {
      clearEventPicker('', { resume: true });
    }

    inflightRef.current = submitEvent(payload, {
      insertBeforeId: isInsert ? insertBeforeEventId : '',
      teamSide,
      ...eventContext,
    })
      .then((response) => {
        updateData(response, quickLabel);
        updateLastAction(quickLabel, actorPlayerId);
        if (isInsert) {
          setInsertBeforeEventId('');
          clearEventPicker('', { resume: true });
        }
      })
      .catch((err) => {
        setError(err.message || 'Failed to add event');
        clearEventPicker('', { resume: true });
        throw err;
      })
      .finally(() => setIsSaving(false));
    try {
      await inflightRef.current;
      return true;
    } catch {
      return false;
    }
  }

  async function addOpponentScore(statType, { shot = selectedShot, eventContext = {} } = {}) {
    if (isSaving || (voiceBusy && eventContext.source !== 'voice')) {
      return false;
    }

    setError('');
    setIsSaving(true);
    const resolvedEventContext = Object.prototype.hasOwnProperty.call(
      eventContext,
      'videoTimestamp'
    )
      ? eventContext
      : { ...eventContext, videoTimestamp: captureVideoTimestamp() };

    try {
      const response = await submitEvent(
        {
          statType,
          ...buildCourtFields(shot),
        },
        resolvedEventContext
      );
      updateData(response, STAT_LABELS[statType] || statType);
      clearEventPicker('', { resume: true });
      return true;
    } catch (submitError) {
      setError(submitError.message || 'Failed to add opponent score');
      if (eventContext.source === 'voice') {
        // A lost response may still mean the server wrote the event. Do not reopen the picker and
        // offer a second chance to record the same score.
        clearEventPicker('', { resume: true });
      }
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  function openEditEvent(event) {
    setEditingEvent({
      id: event.id,
      playerId: event.playerId || '',
      teamSide: event.teamSide || activeSide,
      statType: event.statType || '',
      zoneId: event.zoneId || '',
      x: event.x ?? '',
      y: event.y ?? '',
      segmentKind: event.segmentKind || 'regulation',
      segmentNumber: event.segmentNumber || 1,
      clockMillisecondsRemaining: event.clockMillisecondsRemaining ?? 0,
    });
  }

  async function saveEventEdit() {
    if (!editingEvent || isSaving) return;
    setIsSaving(true);
    setError('');
    const patch = {};
    if (editingEvent.playerId) patch.playerId = editingEvent.playerId;
    if (isDualTeam && editingEvent.teamSide) patch.teamSide = editingEvent.teamSide;
    if (editingEvent.statType) patch.statType = editingEvent.statType;
    if (editingEvent.zoneId) patch.zoneId = editingEvent.zoneId;
    if (editingEvent.x !== '') patch.x = Number(editingEvent.x);
    if (editingEvent.y !== '') patch.y = Number(editingEvent.y);
    if (patch.x !== undefined || patch.y !== undefined) {
      patch.courtLayoutId = courtLayout.id;
    }
    patch.segmentKind = editingEvent.segmentKind;
    patch.segmentNumber = Number(editingEvent.segmentNumber);
    patch.clockMillisecondsRemaining = Number(editingEvent.clockMillisecondsRemaining);
    try {
      const response = await gamesApi.updateEvent(gameId, editingEvent.id, patch);
      updateData(response, 'Event updated');
      setEditingEvent(null);
    } catch (err) {
      setError(err.message || 'Failed to update event');
    } finally {
      setIsSaving(false);
    }
  }

  async function undoLastEvent({
    source = 'manual',
    expectedEventId = null,
    allowSelectedShot = false,
  } = {}) {
    if (isSaving) return false;
    // voiceBusy is true for the whole cycle that is calling this, so only other sources
    // are held off.
    if (voiceBusy && source !== 'voice') return false;
    if (pendingFollowUpPrompt || (selectedShot && !allowSelectedShot)) {
      if (source !== 'voice') setError('Close the open event question first');
      return false;
    }

    // Never remove an event while its own write, or an entry clock transition, is still
    // settling — the tail is not final until both have.
    await entryClockTransitionRef.current.catch(() => undefined);
    await inflightRef.current.catch(() => undefined);

    const lastEvent = data?.game?.events?.[data.game.events.length - 1];
    if (!lastEvent) {
      if (source !== 'voice') setError('No event to undo');
      return false;
    }
    if (expectedEventId && lastEvent.id !== expectedEventId) return false;

    return removeEvent(lastEvent.id);
  }

  async function handleAddRosterPlayer({ displayName, jerseyNumber }) {
    await gamesApi.addRosterPlayer(gameId, {
      ...(isDualTeam ? { side: activeSide } : {}),
      displayName,
      jerseyNumber,
    });
    // Refetch rather than patch local state: the roster is derived from either
    // participantsBySide or team.players depending on game shape, and the server
    // is the only thing that knows which snapshot it just appended to.
    await loadGame();
    setIsAddPlayerOpen(false);
  }

  async function saveLineup() {
    if (isSaving) {
      return;
    }

    if (currentSideState.lineupDraft.length === 0 || currentSideState.lineupDraft.length > 5) {
      setError('Select between 1 and 5 players for the starting lineup');
      return;
    }

    setError('');
    setIsSaving(true);
    try {
      const response = await gamesApi.setLineup(
        gameId,
        isDualTeam
          ? { playerIds: currentSideState.lineupDraft, teamSide: activeSide }
          : { playerIds: currentSideState.lineupDraft }
      );
      updateData(
        response,
        isDualTeam
          ? `${participantsBySide[activeSide]?.displayName || activeSide} starting five set`
          : 'Starting five set'
      );
      updateSideState(activeKey, {
        selectedPlayerId: currentSideState.lineupDraft[0] || '',
      });
      // Leaving the reopened step on save keeps the exit predictable: press
      // Start again and the warning re-targets whichever side is now emptier.
      setLineupRevisitSide(null);
      setIsStandaloneLineupEditing(false);
    } catch (saveError) {
      setError(saveError.message || 'Failed to save lineup');
    } finally {
      setIsSaving(false);
    }
  }

  async function saveSubstitution() {
    if (isSaving) {
      return;
    }

    if (!requireLineup()) {
      return;
    }

    if (
      !currentSideState.substitutionState.playerOutId ||
      !currentSideState.substitutionState.playerInId
    ) {
      setError('Choose one player out and one player in');
      return;
    }

    setError('');
    setIsSaving(true);
    try {
      const commonPayload = isDualTeam ? { teamSide: activeSide, relatedTeamSide: activeSide } : {};
      await submitEvent({
        playerId: currentSideState.substitutionState.playerOutId,
        relatedPlayerId: currentSideState.substitutionState.playerInId,
        statType: 'SUB_OUT',
        ...commonPayload,
      });
      const subInResponse = await submitEvent({
        playerId: currentSideState.substitutionState.playerInId,
        relatedPlayerId: currentSideState.substitutionState.playerOutId,
        statType: 'SUB_IN',
        ...commonPayload,
      });
      updateData(subInResponse, 'Substitution recorded');
      updateSideState(activeKey, {
        selectedPlayerId:
          currentSideState.selectedPlayerId === currentSideState.substitutionState.playerOutId
            ? currentSideState.substitutionState.playerInId
            : currentSideState.selectedPlayerId,
        substitutionState: { playerOutId: '', playerInId: '' },
      });
      setCurrentVideoTimestamp(null);
    } catch (saveError) {
      setError(saveError.message || 'Failed to save substitution');
    } finally {
      setIsSaving(false);
    }
  }

  function toggleSubstitutionPlayer(field, playerId) {
    const currentId = currentSideState.substitutionState[field];
    if (
      !currentId &&
      !currentSideState.substitutionState.playerOutId &&
      !currentSideState.substitutionState.playerInId
    ) {
      captureVideoTimestamp();
      captureEntrySnapshot();
      pauseClockForEntry();
    }
    updateSideState(activeKey, {
      substitutionState: {
        ...currentSideState.substitutionState,
        [field]: currentId === playerId ? '' : playerId,
      },
    });
  }

  async function saveVideoUrl() {
    if (isSaving) return;
    setError('');
    setIsSaving(true);
    try {
      // Send null (not '') when cleared, so the server can detach the video — an empty
      // string fails the server's youtubeUrlSchema.min(1), whereas null is accepted.
      const trimmed = videoUrlDraft.trim();
      const response = await gamesApi.update(gameId, { videoUrl: trimmed || null });
      updateData(response);
      setIsVideoUrlEditOpen(false);
    } catch (err) {
      setError(err.message || 'Failed to save video URL');
    } finally {
      setIsSaving(false);
    }
  }

  async function finishGame() {
    setError('');
    setIsSaving(true);
    trackEvent('game_tracking_finished', { game_id: gameId });
    try {
      await gamesApi.finish(gameId);
      navigate(`/games/${gameId}`);
    } catch (finishError) {
      setError(finishError.message || 'Failed to finish game');
    } finally {
      setIsSaving(false);
    }
  }

  async function executeClockCommand(command) {
    if (isSaving || voiceBusy) return false;
    clockOperatedThisMountRef.current = true;
    setError('');
    setIsSaving(true);
    try {
      const response = await gamesApi.updateClock(gameId, command);
      updateData(response);
      return true;
    } catch (clockError) {
      if (clockError.status === 409) {
        await loadGame();
        setError('The game changed in another tracking session. The latest clock was loaded.');
      } else {
        setError(clockError.message || 'Failed to update game clock');
      }
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  function runClockCommand(command) {
    const isStartingGame =
      command.action === 'start' &&
      game?.status === 'scheduled' &&
      game?.clock?.segmentKind === 'regulation' &&
      game?.clock?.segmentNumber === 1;

    if (isStartingGame && hasShortStartingLineup) {
      setIsTrackingFullscreen(false);
      setShowShortLineupWarning(true);
      return;
    }

    return executeClockCommand(command);
  }

  function finishVoiceAttempt(context) {
    if (!context?.entryOwnedByVoice) return;
    setCurrentVideoTimestamp(null);
    entryClockSnapshotRef.current = null;
    resumeVideoAfterEntry();
    resumeClockAfterEntry();
  }

  function beginVoiceAttempt() {
    setVoiceFeedback(null);
    const entryAlreadyActive = Boolean(
      selectedShot ||
      pendingFollowUpPrompt ||
      entryClockSnapshotRef.current ||
      entryClockWasRunningRef.current ||
      entryVideoWasPausedRef.current
    );

    // Skipping a follow-up clears currentVideoTimestamp but leaves the entry refs set, so
    // an entry that is "already active" can still be missing its timestamp. Recapture.
    let voiceVideoTimestamp = currentVideoTimestamp ?? captureVideoTimestamp();
    if (!entryAlreadyActive) {
      pauseVideoForEntry();
      pauseClockForEntry();
      voiceVideoTimestamp = captureVideoTimestamp();
      captureEntrySnapshot();
    }

    return Object.freeze({
      version: voiceContextVersion,
      gameId: game.id,
      sport: game.sport || 'basketball',
      trackingMode: isDualTeam ? 'dual_team' : 'one_sided',
      participantIndex: voiceParticipantIndex,
      selectedShot: selectedShot ? { ...selectedShot } : null,
      followUp: pendingFollowUpPrompt ? followUpGroupsFor(pendingFollowUpPrompt) : null,
      lastEventId: data?.game?.events?.[data.game.events.length - 1]?.id ?? null,
      clockSnapshot: entryClockSnapshotRef.current
        ? { ...entryClockSnapshotRef.current }
        : captureEntrySnapshot(),
      videoTimestamp: voiceVideoTimestamp,
      courtLayoutId: courtLayout.id,
      entryOwnedByVoice: !entryAlreadyActive,
      courtTriggered: isCourtVoiceAttempt,
    });
  }

  function openCourtVoiceFallback(context, message = '') {
    if (!context?.courtTriggered || !context.selectedShot) {
      finishVoiceAttempt(context);
      return;
    }

    // Recognition failed before a write was attempted. Keep the original tap and entry snapshot
    // so the existing buttons can finish the event without making the scorekeeper tap again.
    setSelectedShot(context.selectedShot);
    setPendingFollowUpPrompt(null);
    setCurrentVideoTimestamp(context.videoTimestamp);
    entryClockSnapshotRef.current = context.clockSnapshot ? { ...context.clockSnapshot } : null;
    setIsCourtVoiceAttempt(false);
    if (message) setError(message);
  }

  function voiceRejection(reason) {
    const messages = {
      empty: 'No command was heard. No stat was recorded.',
      too_long: 'That command was too long. Say one player and one stat.',
      missing_side: 'Say “home” or “away” before the player.',
      unexpected_side: 'Do not say a side for this one-team game.',
      missing_participant: 'Say a player number or exact name.',
      incomplete: 'Say one player and one supported stat.',
      conflicting_action: 'The command contained conflicting actions. No stat was recorded.',
      conflicting_points: 'The command contained conflicting point values. No stat was recorded.',
      unsupported_action: 'That stat command is not supported. No stat was recorded.',
      opponent_score_unavailable: 'Opponent scoring commands are only available in one-team games.',
      unrecognised_words: 'Some of that command was not understood. Try “21 made” or “21 steal”.',
      ambiguous: 'More than one on-court player matched. No stat was recorded.',
      inactive: 'That player is inactive. No stat was recorded.',
      off_court: 'That player is not currently on the court.',
      not_found: 'No on-court player matched that number or name.',
      not_allowed: 'That player is not valid for this question.',
      location_required: 'Tap the court before recording a shot by voice.',
      location_conflict: 'The spoken point value does not match the court location.',
      unsupported_answer:
        'That answer is not valid for this question. Say a player number, or “skip”.',
      wrong_side: 'This question is about the other team.',
      invalid_side: 'That team is not part of this question.',
      answer_not_stored:
        'The fouled player is not recorded yet. Say “skip” to close this question.',
      undo_not_allowed: 'Finish or skip the open question before saying “undo”.',
      undo_unavailable: 'There is no event to undo.',
      undo_changed: 'The event log changed. Nothing was undone.',
      undo_failed: 'The last event could not be removed.',
      unsupported_control: 'That voice control is not available yet.',
      unsupported_sport: 'Voice tracking is not available for this sport.',
      stale: 'Tracking changed while listening. No stat was recorded.',
      write_failed: 'The command was understood, but the stat was not saved.',
    };
    return { ok: false, reason, message: messages[reason] || 'No stat was recorded.' };
  }

  // One microphone cycle produces one intent. Branching on the CAPTURED prompt is what
  // stops the transcript that opens a prompt from also answering it.
  async function handleVoiceCommand(transcript, context) {
    if (!context || context.version !== voiceContextVersion || context.gameId !== game.id) {
      finishVoiceAttempt(context);
      const result = voiceRejection('stale');
      if (context?.courtTriggered) openCourtVoiceFallback(context, result.message);
      setVoiceFeedback({ message: result.message, ok: false });
      return result;
    }

    const adapter = getVoiceAdapter(context.sport);
    if (!adapter) {
      finishVoiceAttempt(context);
      const result = voiceRejection('unsupported_sport');
      if (context.courtTriggered) openCourtVoiceFallback(context, result.message);
      setVoiceFeedback({ message: result.message, ok: false });
      return result;
    }

    const result = await (context.followUp
      ? handleVoiceFollowUp(transcript, context, adapter)
      : handleVoicePrimary(transcript, context, adapter));

    if (context.courtTriggered) {
      // The court's ghost-click guard is only needed for the picker opened directly by that
      // pointerdown. A voice-created follow-up arrives later and its microphone must accept its
      // first intentional click.
      ghostClickGuardRef.current = null;
      if (result.ok) {
        setIsCourtVoiceAttempt(false);
      } else if (result.reason !== 'write_failed' && !result.skipCourtFallback) {
        openCourtVoiceFallback(context, result.message);
      } else {
        // A write failure may be an uncertain network outcome, so never present buttons that could
        // replay it. The handler has already reconciled and cleared its optimistic picker state.
        setIsCourtVoiceAttempt(false);
      }
    }
    setVoiceFeedback({ message: result.message, ok: result.ok });
    return result;
  }

  function resolveFollowUpAnswer(context, intent) {
    const { pools } = context.followUp;
    if (!context.followUp.actorTeamSide && intent.side) {
      return { ok: false, reason: 'unexpected_side' };
    }
    const candidates = intent.side ? pools.filter((pool) => pool.side === intent.side) : pools;
    if (candidates.length === 0) return { ok: false, reason: 'wrong_side' };

    // Scoping each pool by its own allowedPlayerIds is what lets a dual-team rebound be
    // answered without a spoken side, and turns a cross-team jersey clash into `ambiguous`
    // rather than a rebound credited to the wrong team.
    const results = candidates.map((pool) =>
      resolveParticipant(context.participantIndex, {
        side: pool.side,
        participant: intent.participant,
        allowedPlayerIds: pool.playerIds,
      })
    );
    const hits = results.filter((result) => result.ok);
    if (hits.length > 1) return { ok: false, reason: 'ambiguous' };
    if (hits.length === 1) return hits[0];

    const order = ['ambiguous', 'inactive', 'not_allowed', 'off_court', 'not_found'];
    return {
      ok: false,
      reason:
        order.find((reason) => results.some((result) => result.reason === reason)) || 'not_found',
    };
  }

  async function handleVoiceFollowUp(transcript, context, adapter) {
    const prompt = context.followUp;
    const parsed = adapter.parseFollowUp(transcript, {
      kind: prompt.kind,
      trackingMode: context.trackingMode,
    });
    // A rejected answer leaves the prompt open, so the entry stays as it is.
    if (!parsed.ok) return voiceRejection(parsed.reason);

    const intent = parsed.intent;
    if (intent.kind === 'control') {
      if (intent.action === 'undo') return voiceRejection('undo_not_allowed');
      if (intent.action !== 'skip') return voiceRejection('unsupported_control');
      // Parity with the manual "Skip this question" button, quirks included.
      clearEventPicker();
      return { ok: true, message: 'Question skipped. No stat was recorded.' };
    }

    if (intent.answer === 'unassisted') {
      if (!prompt.allowUnassisted) return voiceRejection('unsupported_answer');
      const saved = await handleFollowUpSelection('NO_ASSIST', { source: 'voice' });
      return saved
        ? { ok: true, message: 'Unassisted. No assist recorded.' }
        : voiceRejection('write_failed');
    }

    if (intent.answer === 'opponent') {
      if (!prompt.allowOpponent) return voiceRejection('unsupported_answer');
      const saved = await handleFollowUpSelection('OPP_REB', { source: 'voice' });
      return saved
        ? { ok: true, message: 'Opponent rebound recorded.' }
        : voiceRejection('write_failed');
    }

    // Reject before resolution so naming a player does not imply the player was wrong.
    if (prompt.skipOnly) return voiceRejection('answer_not_stored');

    const resolved = resolveFollowUpAnswer(context, intent);
    if (!resolved.ok) return voiceRejection(resolved.reason);

    // The live prompt is deliberately re-read by handleFollowUpSelection so the voice and
    // button payloads stay identical; context.version already proves it is the same prompt.
    const saved = await handleFollowUpSelection(resolved.playerId, { source: 'voice' });
    return saved
      ? {
          ok: true,
          message: `${resolved.player.displayName}: ${followUpLabelFor(prompt, resolved)} recorded.`,
        }
      : voiceRejection('write_failed');
  }

  async function handleVoiceUndo(context) {
    const liveLastEventId = data?.game?.events?.[data.game.events.length - 1]?.id ?? null;
    const hadEvent = Boolean(context.lastEventId);
    const changed = hadEvent && liveLastEventId !== context.lastEventId;
    const removed =
      hadEvent &&
      !changed &&
      (await undoLastEvent({
        source: 'voice',
        expectedEventId: context.lastEventId,
        allowSelectedShot: context.courtTriggered,
      }));

    // A court-triggered undo borrowed a selected location solely as its push-to-talk gesture.
    // Discard that unused location and hand the entry clock/video back.
    if (context.courtTriggered) {
      clearEventPicker('', { resume: true });
    } else {
      finishVoiceAttempt(context);
    }

    const result = !hadEvent
      ? voiceRejection('undo_unavailable')
      : changed
        ? voiceRejection('undo_changed')
        : removed
          ? { ok: true, message: 'Last event undone.' }
          : voiceRejection('undo_failed');
    return { ...result, skipCourtFallback: true };
  }

  async function handleVoicePrimary(transcript, context, adapter) {
    const parsed = adapter.parsePrimary(transcript, { trackingMode: context.trackingMode });
    if (!parsed.ok) {
      finishVoiceAttempt(context);
      return voiceRejection(parsed.reason);
    }
    if (parsed.intent.kind === 'control') {
      if (parsed.intent.action !== 'undo') {
        finishVoiceAttempt(context);
        return voiceRejection('unsupported_control');
      }
      return handleVoiceUndo(context);
    }
    if (parsed.intent.kind === 'opponent_score') {
      if (!context.selectedShot) {
        finishVoiceAttempt(context);
        return voiceRejection('location_required');
      }
      if (
        parsed.intent.action === 'field_goal' &&
        parsed.intent.points &&
        parsed.intent.points !== (context.selectedShot.shotFamily === 'FG3' ? 3 : 2)
      ) {
        return voiceRejection('location_conflict');
      }

      const points =
        parsed.intent.action === 'free_throw'
          ? 1
          : parsed.intent.points || (context.selectedShot.shotFamily === 'FG3' ? 3 : 2);
      const statTypes = {
        1: 'OPP_FT_MADE',
        2: 'OPP_FG2_MADE',
        3: 'OPP_FG3_MADE',
      };
      const statType = statTypes[points];
      if (!statType) {
        finishVoiceAttempt(context);
        return voiceRejection('unsupported_action');
      }

      const saved = await addOpponentScore(statType, {
        shot: context.selectedShot,
        eventContext: {
          source: 'voice',
          clockSnapshot: context.clockSnapshot,
          videoTimestamp: context.videoTimestamp,
          courtLayoutId: context.courtLayoutId,
        },
      });
      if (!saved) {
        finishVoiceAttempt(context);
        return voiceRejection('write_failed');
      }
      return { ok: true, message: `${STAT_LABELS[statType]} recorded.` };
    }
    if (parsed.intent.kind !== 'primary') {
      finishVoiceAttempt(context);
      return voiceRejection('unsupported_control');
    }

    const isShot = ['field_goal', 'free_throw'].includes(parsed.intent.action);
    if (isShot && !context.selectedShot) {
      finishVoiceAttempt(context);
      return voiceRejection('location_required');
    }
    if (
      parsed.intent.action === 'field_goal' &&
      parsed.intent.points &&
      parsed.intent.points !== (context.selectedShot.shotFamily === 'FG3' ? 3 : 2)
    ) {
      return voiceRejection('location_conflict');
    }

    const eventContext = {
      source: 'voice',
      clockSnapshot: context.clockSnapshot,
      videoTimestamp: context.videoTimestamp,
      courtLayoutId: context.courtLayoutId,
    };

    const participant = resolveParticipant(context.participantIndex, {
      side: parsed.intent.side,
      participant: parsed.intent.participant,
    });
    if (!participant.ok) {
      finishVoiceAttempt(context);
      return voiceRejection(participant.reason);
    }

    const handlerOptions = {
      playerId: participant.playerId,
      teamSide: participant.side,
      shot: context.selectedShot,
      eventContext,
    };

    let savePromise;
    let label;
    if (parsed.intent.action === 'field_goal') {
      savePromise = addShotEvent(parsed.intent.outcome, handlerOptions);
      label =
        STAT_LABELS[buildShotStatType(context.selectedShot.shotFamily, parsed.intent.outcome)];
    } else if (parsed.intent.action === 'free_throw') {
      savePromise = addFreeThrowEvent(parsed.intent.outcome, handlerOptions);
      label = `${parsed.intent.outcome === 'made' ? 'Free throw made' : 'Free throw missed'}`;
    } else if (parsed.intent.action === 'defensive_rebound') {
      savePromise = addReboundEvent('DREB', handlerOptions);
      label = 'Defensive rebound';
    } else if (parsed.intent.action === 'offensive_rebound') {
      savePromise = addReboundEvent('OREB', handlerOptions);
      label = 'Offensive rebound';
    } else {
      const statTypes = { steal: 'STL', block: 'BLK', turnover: 'TOV', foul: 'FOUL' };
      const statType = statTypes[parsed.intent.action];
      if (!statType) {
        finishVoiceAttempt(context);
        return voiceRejection('unsupported_action');
      }
      savePromise = addQuickStatEvent(statType, handlerOptions);
      label = STAT_LABELS[statType] || statType;
    }

    if (isDualTeam && participant.side) setActiveSide(participant.side);
    updateSideState(isDualTeam ? participant.side : 'oneSided', {
      selectedPlayerId: participant.playerId,
    });

    const saved = await savePromise;
    if (!saved) {
      finishVoiceAttempt(context);
      return voiceRejection('write_failed');
    }
    return { ok: true, message: `${participant.player.displayName}: ${label} recorded.` };
  }

  function handleVoiceFailure({ context, message = '' }) {
    if (message) setVoiceFeedback({ message, ok: false });
    if (context?.courtTriggered) {
      openCourtVoiceFallback(context, message);
    } else if (isCourtVoiceAttempt && selectedShot) {
      // Permission denial and start() failures may arrive before SpeechRecognition fires onstart,
      // so the hook has no captured context yet. The court tap already owns a complete entry.
      openCourtVoiceFallback(
        {
          courtTriggered: true,
          selectedShot: { ...selectedShot },
          clockSnapshot: entryClockSnapshotRef.current
            ? { ...entryClockSnapshotRef.current }
            : null,
          videoTimestamp: currentVideoTimestamp,
        },
        message
      );
    } else {
      finishVoiceAttempt(context);
    }
  }

  function returnToShortLineup() {
    setShowShortLineupWarning(false);

    // Reopen the lineup step instead of dropping the user on the court tab,
    // where the only way to add another player sits below the court image.
    // Target the emptier side so repeated trips through the warning can reach
    // both teams rather than always landing on home.
    if (isLeagueGame && isDualTeam) {
      const side = homeLineupCount <= awayLineupCount ? TEAM_SIDES.HOME : TEAM_SIDES.AWAY;
      setLineupRevisitSide(side);
      setActiveSide(side);
      return;
    }

    setActivePanel('court');
    setIsStandaloneLineupEditing(true);
    if (isDualTeam) {
      setActiveSide(homeLineupCount < 5 ? TEAM_SIDES.HOME : TEAM_SIDES.AWAY);
    }
  }

  function leaveTracker(destination) {
    if (data?.game?.clock?.status === 'running') {
      setPendingExitDestination(destination);
      return;
    }
    navigate(destination);
  }

  async function pauseClockAndLeave() {
    if (!pendingExitDestination || isSaving) return;
    setIsSaving(true);
    try {
      await gamesApi.updateClock(gameId, { action: 'pause' });
      navigate(pendingExitDestination);
      setPendingExitDestination('');
    } catch (clockError) {
      setError(clockError.message || 'Could not pause the clock; tracking remains open');
    } finally {
      setIsSaving(false);
    }
  }

  async function correctRecoveredClock() {
    const match = clockRecoveryTimeDraft.trim().match(/^(\d+):([0-5]?\d(?:\.\d)?)$/);
    if (!match) {
      setError('Enter the clock time as minutes:seconds, for example 4:32.5');
      return;
    }
    const remainingMilliseconds = (Number(match[1]) * 60 + Number(match[2])) * 1000;
    const corrected = await executeClockCommand({
      action: 'correct',
      segmentKind: game.clock.segmentKind,
      segmentNumber: game.clock.segmentNumber,
      remainingMilliseconds,
    });
    if (corrected) {
      setIsClockRecoveryCorrectionOpen(false);
      setShowClockRecovery(false);
    }
  }

  const clearEventPickerRef = useRef(clearEventPicker);
  clearEventPickerRef.current = clearEventPicker;

  useEffect(() => {
    if (!isEventPickerOpen) return undefined;

    // Focus the dialog itself rather than its first button: the first button is
    // a player row, and focusing it would read as a selection the user did not
    // make. The container is focusable via tabIndex={-1}.
    eventPickerRef.current?.focus({ preventScroll: true });

    // Escape was handled by an onKeyDown on the dialog element, which only ever
    // fires when focus is already inside it. Opening the picker is a court tap,
    // so focus is wherever the tap left it and the key never reached the
    // handler. A document listener does not care where focus is.
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        clearEventPickerRef.current();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isEventPickerOpen]);

  if (!data || !game || !boxScore) {
    return <SportsLoader label="Loading tracking session" fullPage />;
  }

  // Every current Team feature is included; resource capacity is enforced by the API.

  const gameSummary = data.gameSummary || {
    teamPoints: boxScore.teamTotals?.points || 0,
    opponentPoints: boxScore.opponentTotals?.points || 0,
  };
  const recentEvents = [...game.events].reverse();
  const visibleRecentEvents = showAllRecentEvents ? recentEvents : recentEvents.slice(0, 3);
  const trackingShellClassName = game.videoUrl
    ? 'mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col lg:flex-row lg:gap-4'
    : 'mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col';

  // The mobile "watch" view (video-first, not yet in entry mode) fills the whole remaining
  // area edge-to-edge — no padding, no scroll — so the video is as large as possible below
  // the header/tabs/Track-Stat button.
  const isMobileVideoWatchView =
    activePanel === 'court' && game.videoUrl && !isDesktopLayout && !isMobileEntryMode;

  const followUpActorSide = pendingFollowUpPrompt?.actorTeamSide || activeSide;
  const followUpOtherSide =
    followUpActorSide === TEAM_SIDES.HOME ? TEAM_SIDES.AWAY : TEAM_SIDES.HOME;
  const followUpGroups = pendingFollowUpPrompt ? followUpGroupsFor(pendingFollowUpPrompt) : null;
  // Dual-team rebound is the one prompt whose flattened pool differs from what renders
  // here: that case branches to the two-group layout below, so this value is unused.
  const followUpPlayers = followUpGroups
    ? followUpGroups.groups.flatMap((group) => group.players)
    : onCourtPlayers;
  const eventPickerShellClass =
    'fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-slate-950/45 p-2 backdrop-blur-[1px] sm:p-3';
  const eventPickerPanelClass =
    't-modal relative z-10 flex max-h-full min-h-0 w-full max-w-5xl rounded-2xl border border-slate-200 bg-white p-3 text-slate-900 shadow-2xl';
  const eventPickerBodyClass = 'flex min-h-0 w-full flex-col';
  const eventPickerGridClass =
    'mt-3 grid min-h-0 grid-rows-[auto,auto] gap-3 landscape:grid-cols-[minmax(0,1fr),minmax(12rem,0.78fr)] landscape:grid-rows-none md:grid-cols-[minmax(0,1fr),minmax(13rem,0.8fr)]';
  const playerButtonClass = (isSelected = false) =>
    `grid min-h-12 w-full grid-cols-[2.5rem,3.5rem,minmax(0,1fr)] items-center gap-2 rounded-xl px-3 py-2 text-left transition landscape:min-h-10 landscape:grid-cols-[2.25rem,3rem,minmax(0,1fr)] landscape:py-1.5 md:min-h-14 md:grid-cols-[2.75rem,4rem,minmax(0,1fr)] md:py-2.5 ${
      isSelected ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
    }`;
  const playerAvatarClass =
    'flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-black text-slate-500 ring-2 ring-white/80 landscape:h-8 landscape:w-8 md:h-10 md:w-10';
  const playerNumberClass =
    'flex h-9 w-12 shrink-0 items-center justify-center rounded-lg bg-white/80 text-xl font-black tabular-nums text-slate-950 shadow-sm landscape:h-8 landscape:w-10 landscape:text-lg md:h-11 md:w-14 md:text-2xl';
  const playerNameClass =
    'min-w-0 truncate text-base font-semibold leading-tight text-current opacity-85 landscape:text-sm md:text-sm';
  const actionColumnClass = 'flex min-h-0 flex-col overflow-hidden';
  const actionScrollerClass = 'min-h-0 overflow-y-auto';
  const actionGridClass =
    'grid grid-cols-2 gap-2 landscape:grid-cols-1 landscape:gap-1.5 md:grid-cols-1';
  const actionGroupClass = 'min-w-0';
  const actionPairClass = 'grid grid-cols-2 gap-1.5';
  const actionTripleClass = 'grid grid-cols-3 gap-1.5';
  // Seven unrelated hues (emerald, rose, sky, amber, indigo, orange, dark rose)
  // used to share this panel, none of them from the app's own palette, and the
  // rebound amber failed WCAG AA on white text (3.19:1). The set is now four
  // meanings drawn from the incumbent world — ink, forest, amber, red — so the
  // colour tells the tracker what kind of outcome they are recording rather
  // than which button it is. Every pair clears AA:
  //   forest #1B4332 / white 11.08 · red #B42318 / white 6.57
  //   ink #141414 / white 18.42   · amber #F4A300 / ink 8.85
  const actionButtonClass = (tone = 'slate') => {
    const tones = {
      // Points scored.
      make: 'bg-[#1B4332] text-white hover:bg-[#245c44]',
      ft: 'bg-[#1B4332] text-white hover:bg-[#245c44]',
      // Possession lost or a shot missed.
      miss: 'bg-[#B42318] text-white hover:bg-[#912013]',
      // Neutral team stats — rebounds, steals, blocks.
      rebound: 'bg-[#141414] text-white hover:bg-[#2a2a2a]',
      defense: 'bg-[#141414] text-white hover:bg-[#2a2a2a]',
      // Attention: something went against us but no shot was involved.
      foul: 'bg-[#F4A300] text-[#141414] hover:bg-[#dc9200]',
      // The other team. Visibly not one of ours.
      opponent:
        'border border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50',
      slate: 'bg-slate-100 text-slate-800 hover:bg-slate-200',
    };

    return `w-full rounded-xl px-3 py-3 text-center text-base font-bold transition-colors disabled:opacity-60 landscape:py-2 landscape:text-sm md:py-3 md:text-base ${tones[tone] || tones.slate}`;
  };

  const courtVoiceControl =
    voiceEnabled && voiceSportSupported && !lineupSetupStep ? (
      <VoiceTrackingControl
        disabled={voiceDisabled}
        contextVersion={voiceContextVersion}
        courtTapOnly
        startRequest={isCourtVoiceAttempt ? courtVoiceStartRequest : 0}
        onStartRequestHandled={() => setCourtVoiceStartRequest(0)}
        onListeningStart={beginVoiceAttempt}
        onCommand={handleVoiceCommand}
        onFailure={handleVoiceFailure}
        onBusyChange={setVoiceBusy}
      />
    ) : null;

  // A shot picker never gets a second microphone: with voice enabled, the court tap itself starts
  // the single court control. The picker retains a microphone only for a real follow-up question.
  const followUpVoiceControl =
    voiceEnabled && voiceSportSupported && pendingFollowUpPrompt && !lineupSetupStep ? (
      <VoiceTrackingControl
        disabled={voiceDisabled}
        contextVersion={voiceContextVersion}
        promptActive
        onListeningStart={beginVoiceAttempt}
        onCommand={handleVoiceCommand}
        onFailure={handleVoiceFailure}
        onBusyChange={setVoiceBusy}
      />
    ) : null;

  const inlineVoiceControl = isEventPickerOpen || isTrackingFullscreen ? null : courtVoiceControl;

  const eventPicker = isEventPickerOpen ? (
    // onKeyDown/onClickCapture below are Escape handling + a ghost-click guard, not
    // user-facing interactions — the actual dismiss control is the invisible backdrop
    // <button> beneath this dialog.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      ref={eventPickerRef}
      tabIndex={-1}
      aria-modal="true"
      aria-label="Add event"
      className={`${eventPickerShellClass} t-modal-backdrop focus:outline-none`}
      role="dialog"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          clearEventPicker();
        }
      }}
      onClickCapture={(event) => {
        if (ghostClickGuardRef.current !== null && Date.now() - ghostClickGuardRef.current < 350) {
          event.stopPropagation();
          event.preventDefault();
          ghostClickGuardRef.current = null;
        }
      }}
    >
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        className="fixed inset-0 h-full w-full cursor-default"
        onClick={clearEventPicker}
        onPointerDown={(event) => event.stopPropagation()}
      />
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions --
          stop-propagation guard only, not an interactive control. */}
      <div
        className={eventPickerPanelClass}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className={eventPickerBodyClass}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {insertBeforeEventId ? 'Insert Event Before' : 'Add Event'}
              </p>
              <p className="text-xs text-slate-600">
                {pendingFollowUpPrompt
                  ? {
                      assist: 'Who assisted?',
                      rebound: 'Who got the rebound?',
                      who_missed_shot: 'Who missed the shot?',
                      who_turned_over: 'Who turned over the ball?',
                      who_got_steal: 'Who got the steal?',
                      who_was_fouled: 'Who was fouled?',
                    }[pendingFollowUpPrompt.kind] || 'Follow up'
                  : `${ZONE_LABELS[selectedShot.zoneId] || selectedShot.zoneId} • ${selectedShot.shotFamily}`}
              </p>
            </div>
            <button
              type="button"
              aria-label="Close event picker"
              className="rounded-md border border-slate-300 p-1 text-slate-600 transition hover:bg-slate-50"
              onClick={() => clearEventPicker()}
            >
              <svg
                viewBox="0 0 20 20"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path d="m5 5 10 10" />
                <path d="M15 5 5 15" />
              </svg>
            </button>
          </div>

          {followUpVoiceControl ? <div className="mb-3">{followUpVoiceControl}</div> : null}

          <div className={eventPickerGridClass}>
            <div className="flex min-h-0 flex-col space-y-1 overflow-hidden">
              {isDualTeam && !pendingFollowUpPrompt ? (
                <div className="mb-3 flex gap-2">
                  {[TEAM_SIDES.HOME, TEAM_SIDES.AWAY].map((side) => {
                    const isActive = activeSide === side;
                    const logoUrl = participantsBySide[side]?.logo?.url;
                    const name = participantsBySide[side]?.displayName || side;
                    return (
                      <button
                        key={side}
                        type="button"
                        onClick={() => setActiveSide(side)}
                        className={`flex flex-1 items-center gap-2 rounded-xl border px-3 py-2 transition ${
                          isActive
                            ? 'border-[#141414] bg-[#141414] text-white shadow-sm'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        {logoUrl ? (
                          <CloudinaryImage
                            src={logoUrl}
                            alt=""
                            width={24}
                            height={24}
                            loading="lazy"
                            decoding="async"
                            srcSetWidths={[24, 48, 72]}
                            sizes="24px"
                            className={`h-6 w-6 shrink-0 rounded-full object-cover ${isActive ? 'ring-2 ring-white/50' : 'border border-slate-200'}`}
                          />
                        ) : (
                          <span
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-black ${
                              isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {name.charAt(0).toUpperCase()}
                          </span>
                        )}
                        <span className="truncate text-xs font-semibold">{name}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {pendingFollowUpPrompt
                  ? pendingFollowUpPrompt.kind === 'assist'
                    ? 'Pick Assister'
                    : pendingFollowUpPrompt.kind === 'rebound'
                      ? 'Pick Rebounder'
                      : 'Pick Player'
                  : 'Pick Player'}
              </p>
              <div className="min-h-0 overflow-y-auto pr-1">
                {isDualTeam && pendingFollowUpPrompt?.kind === 'rebound' ? (
                  <div className="space-y-3">
                    {[
                      {
                        side: followUpActorSide,
                        label:
                          participantsBySide[followUpActorSide]?.displayName || followUpActorSide,
                        reboundType: 'OREB',
                        players: onCourtPlayersBySide[followUpActorSide] || [],
                      },
                      {
                        side: followUpOtherSide,
                        label:
                          participantsBySide[followUpOtherSide]?.displayName || followUpOtherSide,
                        reboundType: 'DREB',
                        players: onCourtPlayersBySide[followUpOtherSide] || [],
                      },
                    ].map((group) => (
                      <div key={group.side}>
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                          {group.label} — {group.reboundType}
                        </p>
                        <div className="space-y-1.5">
                          {group.players.map((player) => (
                            <button
                              key={player.id}
                              type="button"
                              aria-label={player.displayName}
                              className={playerButtonClass(false)}
                              onClick={() => handleFollowUpSelection(player.id)}
                            >
                              <span className={playerAvatarClass} aria-hidden="true">
                                {(player.displayName || '?').trim().charAt(0).toUpperCase() || '?'}
                              </span>
                              <span className={playerNumberClass}>
                                {player.jerseyNumber ?? '—'}
                              </span>
                              <span className={playerNameClass}>{player.displayName}</span>
                            </button>
                          ))}
                          {group.players.length === 0 ? (
                            <p className="px-1 text-xs text-slate-400">No players on court</p>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {followUpPlayers.map((player) => (
                      <button
                        key={player.id}
                        type="button"
                        aria-label={player.displayName}
                        className={playerButtonClass(
                          currentSideState.selectedPlayerId === player.id
                        )}
                        onClick={() =>
                          pendingFollowUpPrompt
                            ? handleFollowUpSelection(player.id)
                            : updateSideState(activeKey, { selectedPlayerId: player.id })
                        }
                      >
                        <span className={playerAvatarClass} aria-hidden="true">
                          {/* {(player.displayName || '?').trim().charAt(0).toUpperCase() || '?'} */}
                        </span>
                        <span className={playerNumberClass}>{player.jerseyNumber ?? '—'}</span>
                        <span className={playerNameClass}>{player.displayName}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className={actionColumnClass}>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Action</p>
              <div className={actionScrollerClass}>
                <div className={actionGridClass}>
                  {pendingFollowUpPrompt ? (
                    <>
                      {pendingFollowUpPrompt.kind === 'assist' ? (
                        <button
                          type="button"
                          className={actionButtonClass('slate')}
                          disabled={isSaving}
                          onClick={() => handleFollowUpSelection('NO_ASSIST')}
                        >
                          Unassisted
                        </button>
                      ) : pendingFollowUpPrompt.kind === 'rebound' && !isDualTeam ? (
                        <button
                          type="button"
                          className={actionButtonClass('opponent')}
                          disabled={isSaving}
                          onClick={() => handleFollowUpSelection('OPP_REB')}
                        >
                          Opp Rebound
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-center text-xs font-bold text-slate-700 transition hover:bg-slate-50"
                        disabled={isSaving}
                        onClick={() => clearEventPicker()}
                      >
                        Skip this question
                      </button>
                    </>
                  ) : (
                    <>
                      <div className={actionGroupClass}>
                        <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                          Shot
                        </p>
                        <div className={actionPairClass}>
                          <button
                            type="button"
                            className={actionButtonClass('make')}
                            disabled={isSaving}
                            onClick={() => addShotEvent('made')}
                          >
                            Make
                          </button>
                          <button
                            type="button"
                            className={actionButtonClass('miss')}
                            disabled={isSaving}
                            onClick={() => addShotEvent('miss')}
                          >
                            Miss
                          </button>
                        </div>
                      </div>
                      <div className={actionGroupClass}>
                        <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                          Free Throw
                        </p>
                        <div className={actionPairClass}>
                          <button
                            type="button"
                            className={actionButtonClass('ft')}
                            disabled={isSaving}
                            onClick={() => addFreeThrowEvent('made')}
                          >
                            FT+
                          </button>
                          <button
                            type="button"
                            className={actionButtonClass('miss')}
                            disabled={isSaving}
                            onClick={() => addFreeThrowEvent('miss')}
                          >
                            FT-
                          </button>
                        </div>
                      </div>
                      <div className={actionGroupClass}>
                        <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                          Rebound
                        </p>
                        <div className={actionPairClass}>
                          <button
                            type="button"
                            className={actionButtonClass('rebound')}
                            disabled={isSaving}
                            onClick={() => addReboundEvent('DREB')}
                          >
                            DREB
                          </button>
                          <button
                            type="button"
                            className={actionButtonClass('rebound')}
                            disabled={isSaving}
                            onClick={() => addReboundEvent('OREB')}
                          >
                            OREB
                          </button>
                        </div>
                      </div>
                      <div className={actionGroupClass}>
                        <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                          Possession
                        </p>
                        <div className={actionTripleClass}>
                          <button
                            type="button"
                            className={actionButtonClass('defense')}
                            disabled={isSaving}
                            onClick={() => addQuickStatEvent('STL')}
                          >
                            STL
                          </button>
                          <button
                            type="button"
                            className={actionButtonClass('defense')}
                            disabled={isSaving}
                            onClick={() => addQuickStatEvent('BLK')}
                          >
                            BLK
                          </button>
                          <button
                            type="button"
                            className={actionButtonClass('foul')}
                            disabled={isSaving}
                            onClick={() => addQuickStatEvent('TOV')}
                          >
                            TOV
                          </button>
                        </div>
                      </div>
                      <div className={actionGroupClass}>
                        <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                          Foul
                        </p>
                        <button
                          type="button"
                          className={actionButtonClass('foul')}
                          disabled={isSaving}
                          onClick={() => addQuickStatEvent('FOUL')}
                        >
                          FOUL
                        </button>
                      </div>
                      {!isDualTeam ? (
                        <div className={actionGroupClass}>
                          <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                            Opponent
                          </p>
                          <div className={actionTripleClass}>
                            <button
                              type="button"
                              className={actionButtonClass('opponent')}
                              disabled={isSaving}
                              onClick={() => addOpponentScore('OPP_FT_MADE')}
                            >
                              +1
                            </button>
                            <button
                              type="button"
                              className={actionButtonClass('opponent')}
                              disabled={isSaving}
                              onClick={() => addOpponentScore('OPP_FG2_MADE')}
                            >
                              +2
                            </button>
                            <button
                              type="button"
                              className={actionButtonClass('opponent')}
                              disabled={isSaving}
                              onClick={() => addOpponentScore('OPP_FG3_MADE')}
                            >
                              +3
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div className="fixed inset-0 flex flex-col bg-slate-50">
      {isCompleted ? (
        <div className="px-4 pt-3">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <span className="font-semibold">Editing completed game.</span> Changes are saved
            immediately and will update the game record.
          </div>
        </div>
      ) : null}

      <GameTrackScoreHeader
        gameSummary={gameSummary}
        activeSide={activeSide}
        onChangeActiveSide={changeActiveSide}
        isDualTeam={isDualTeam}
        participantsBySide={participantsBySide}
        team={team}
        clockControls={
          <GameClockControls
            game={game}
            onCommand={runClockCommand}
            disabled={isSaving || !allStartingLineupsReady}
            disabledReason={
              allStartingLineupsReady ? '' : 'Save a starting five below to start the clock.'
            }
            serverOffsetMilliseconds={serverOffsetMilliseconds}
          />
        }
      />

      <div className={trackingShellClassName}>
        {game.videoUrl && isDesktopLayout ? (
          <div className="lg:flex lg:w-[65%] lg:shrink-0 lg:flex-col">
            <GameVideoPanel
              videoUrl={game.videoUrl}
              title={game.title}
              videoIframeRef={videoIframeRef}
            />
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col">
          {error ? (
            <p className="shrink-0 border-b border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          {voiceFeedback?.message && voiceFeedback.message !== error ? (
            <p
              aria-live="polite"
              className={`shrink-0 border-b px-4 py-2.5 text-sm ${
                voiceFeedback.ok
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-amber-200 bg-amber-50 text-amber-900'
              }`}
            >
              {voiceFeedback.message}
            </p>
          ) : null}

          {lineupSetupStep ? (
            <div className="flex min-h-0 flex-1 flex-col border-x border-slate-200 bg-white shadow-sm">
              <LineupPicker
                variant="fullscreen"
                stepLabel={
                  lineupRevisitSide
                    ? 'Add players'
                    : !isDualTeam
                      ? null
                      : lineupSetupStep === 'home'
                        ? 'Step 1 of 2'
                        : 'Step 2 of 2'
                }
                isDualTeam={isDualTeam}
                teamDisplayName={
                  isDualTeam
                    ? participantsBySide[lineupSetupStep]?.displayName || lineupSetupStep
                    : team?.name || 'Team'
                }
                players={isDualTeam ? participantsBySide[lineupSetupStep]?.players || [] : players}
                canManageRoster={canAddRosterPlayer}
                onAddPlayer={() => setIsAddPlayerOpen(true)}
                onExit={lineupRevisitSide ? () => setLineupRevisitSide(null) : null}
                lineupDraft={sideState[lineupSetupStep]?.lineupDraft || []}
                onToggle={(playerId, checked) => {
                  const draft = sideState[lineupSetupStep]?.lineupDraft || [];
                  const nextDraft = checked
                    ? [...draft, playerId]
                    : draft.filter((id) => id !== playerId);
                  updateSideState(lineupSetupStep, { lineupDraft: nextDraft });
                }}
                onSave={saveLineup}
                isSaving={isSaving}
              />
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col border-x border-slate-200 bg-white shadow-sm">
              <div className="shrink-0 grid grid-cols-4 gap-1 border-b border-slate-200 p-1.5 landscape-compact:p-1">
                {[
                  {
                    id: 'court',
                    label: 'Court',
                    icon: (
                      <svg
                        viewBox="0 0 16 16"
                        className="h-4 w-4 shrink-0"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      >
                        <rect x="2" y="2" width="12" height="12" rx="1.5" />
                        <path d="M8 2v12M2 8h12" />
                      </svg>
                    ),
                  },
                  {
                    id: 'substitutions',
                    label: 'Subs',
                    icon: (
                      <svg
                        viewBox="0 0 16 16"
                        className="h-4 w-4 shrink-0"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      >
                        <path d="M3 5h10M11 3l2 2-2 2" />
                        <path d="M13 11H3M5 9l-2 2 2 2" />
                      </svg>
                    ),
                  },
                  {
                    id: 'events',
                    label: 'Events',
                    icon: (
                      <svg
                        viewBox="0 0 16 16"
                        className="h-4 w-4 shrink-0"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      >
                        <path d="M3 4h10M3 8h7M3 12h5" />
                      </svg>
                    ),
                  },
                  {
                    id: 'more',
                    label: 'More',
                    icon: (
                      <svg
                        viewBox="0 0 16 16"
                        className="h-4 w-4 shrink-0"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      >
                        <circle cx="4" cy="8" r="1" fill="currentColor" stroke="none" />
                        <circle cx="8" cy="8" r="1" fill="currentColor" stroke="none" />
                        <circle cx="12" cy="8" r="1" fill="currentColor" stroke="none" />
                      </svg>
                    ),
                  },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActivePanel(tab.id)}
                    disabled={voiceBusy}
                    aria-label={tab.label}
                    aria-pressed={activePanel === tab.id}
                    className={`flex flex-col items-center gap-1 rounded-xl py-2.5 text-xs font-semibold transition-colors landscape-compact:flex-row landscape-compact:justify-center landscape-compact:gap-1.5 landscape-compact:py-1.5 ${
                      activePanel === tab.id
                        ? 'bg-[#141414] text-white'
                        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {/* Persistent mobile video layer — stays mounted across tab switches and
                    entry-mode toggles so playback position is never lost. It's only shown in
                    the video-first "watch" view; otherwise it's hidden (not unmounted). The
                    desktop video lives in its own persistent left column, so this mobile layer
                    only renders when !isDesktopLayout, avoiding a second live iframe. */}
                {game.videoUrl && !isDesktopLayout ? (
                  <div
                    className={isMobileVideoWatchView ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}
                  >
                    {!isDualTeam && (lineupIds.length === 0 || isStandaloneLineupEditing) ? (
                      <div className="min-h-0 flex-1 overflow-y-auto p-4">
                        <LineupPicker
                          isDualTeam={false}
                          teamDisplayName={team?.name || 'Team'}
                          players={players}
                          canManageRoster={canAddRosterPlayer}
                          onAddPlayer={() => setIsAddPlayerOpen(true)}
                          lineupDraft={currentSideState.lineupDraft}
                          onToggle={(playerId, checked) => {
                            const nextDraft = checked
                              ? [...currentSideState.lineupDraft, playerId]
                              : currentSideState.lineupDraft.filter((id) => id !== playerId);
                            updateSideState(activeKey, { lineupDraft: nextDraft });
                          }}
                          onSave={saveLineup}
                          isSaving={isSaving}
                        />
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setIsMobileEntryMode(true);
                            pauseVideoForEntry();
                          }}
                          className="m-3 mb-2 flex shrink-0 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
                        >
                          <svg
                            viewBox="0 0 20 20"
                            className="h-5 w-5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                          >
                            <rect x="2" y="2" width="16" height="16" rx="2" />
                            <path d="M10 2v16M2 10h16" />
                          </svg>
                          Track Stat
                        </button>
                        <div className="min-h-0 flex-1">
                          <GameVideoPanel
                            videoUrl={game.videoUrl}
                            title={game.title}
                            videoIframeRef={videoIframeRef}
                          />
                        </div>
                      </>
                    )}
                  </div>
                ) : null}

                {/* Scrollable/padded content region — holds every tab's content EXCEPT the
                    mobile watch view (which is the persistent layer above). Hidden entirely
                    while the mobile watch view is showing. */}
                <div
                  className={`min-h-0 flex-1 overflow-y-auto p-4 landscape-compact:p-2 ${
                    isMobileVideoWatchView ? 'hidden' : ''
                  }`}
                >
                  {activePanel === 'court' &&
                  game.videoUrl &&
                  !isDesktopLayout &&
                  isMobileEntryMode ? (
                    <div className="flex min-h-0 flex-1 flex-col landscape-compact:flex-row landscape-compact:items-start landscape-compact:gap-1.5">
                      <button
                        type="button"
                        onClick={() => setIsMobileEntryMode(false)}
                        disabled={voiceBusy}
                        aria-label="Back to Video"
                        className="mb-2 flex shrink-0 items-center gap-2 self-start rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 landscape-compact:mb-0 landscape-compact:shrink-0 landscape-compact:gap-0 landscape-compact:px-2 landscape-compact:py-1"
                      >
                        <svg
                          viewBox="0 0 20 20"
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                        >
                          <path d="M12 15l-5-5 5-5" />
                        </svg>
                        <span className="landscape-compact:sr-only">Back to Video</span>
                      </button>
                      <div className="space-y-4 landscape-compact:min-w-0 landscape-compact:flex-1">
                        {insertBeforeEventId ? (
                          <div className="flex items-center justify-between gap-2 rounded-lg border border-[#F4A300]/40 bg-[#FFF7E6] px-3 py-2">
                            <p className="text-xs font-medium text-[#7a5200]">
                              Tap the court to insert a shot before the selected event.
                            </p>
                            <button
                              type="button"
                              onClick={() => {
                                setInsertBeforeEventId('');
                                setActivePanel('events');
                              }}
                              className="shrink-0 text-xs font-semibold text-[#7a5200] hover:underline"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : null}
                        <div>
                          <div className="relative">
                            <InteractiveCourtImage
                              onSelect={onCourtSelect}
                              containerClassName="min-h-[26rem] landscape-compact:h-[max(11rem,calc(100dvh_-_6.5rem))] landscape-compact:min-h-[11rem]"
                              courtClassName="min-h-[22rem] landscape-compact:min-h-0"
                              rotate90={rotateCourt}
                              layout={courtLayout}
                            />
                            {eventPicker}
                          </div>
                        </div>
                        {inlineVoiceControl}
                      </div>
                    </div>
                  ) : activePanel === 'court' && !(game.videoUrl && !isDesktopLayout) ? (
                    <div className="space-y-4">
                      {insertBeforeEventId ? (
                        <div className="flex items-center justify-between gap-2 rounded-lg border border-[#F4A300]/40 bg-[#FFF7E6] px-3 py-2">
                          <p className="text-xs font-medium text-[#7a5200]">
                            Tap the court to insert a shot before the selected event.
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setInsertBeforeEventId('');
                              setActivePanel('events');
                            }}
                            className="shrink-0 text-xs font-semibold text-[#7a5200] hover:underline"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : null}
                      <div>
                        <div className="relative">
                          <InteractiveCourtImage
                            onSelect={onCourtSelect}
                            containerClassName="mx-auto min-h-[26rem] w-full max-w-[calc(min(78vw,26rem))] sm:h-[min(64vh,40rem)] sm:min-h-[26rem] sm:max-w-[calc(min(64vh,40rem)*0.5526)] landscape-compact:h-[max(11rem,calc(100dvh_-_6.5rem))] landscape-compact:min-h-[11rem] landscape-compact:max-w-none"
                            courtClassName="min-h-[22rem] landscape-compact:min-h-0"
                            rotate90={rotateCourt}
                            layout={courtLayout}
                          />
                          {eventPicker}
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-2">
                          {lastActionLabel ? (
                            (() => {
                              const lastPlayer = lastActionMeta.playerId
                                ? playersById.get(lastActionMeta.playerId)
                                : null;
                              const lastLogoUrl = lastActionMeta.playerId
                                ? isDualTeam
                                  ? participantsBySide[playerSideMap.get(lastActionMeta.playerId)]
                                      ?.logo?.url || teamPlaceholder
                                  : team?.logo?.url || teamPlaceholder
                                : null;
                              return (
                                <div className="flex min-w-0 items-center gap-2">
                                  {lastLogoUrl ? (
                                    <CloudinaryImage
                                      src={lastLogoUrl}
                                      alt=""
                                      width={24}
                                      height={24}
                                      loading="lazy"
                                      decoding="async"
                                      srcSetWidths={[24, 48, 72]}
                                      sizes="24px"
                                      className="h-6 w-6 shrink-0 rounded-full border border-slate-200 bg-white object-cover"
                                    />
                                  ) : null}
                                  {lastPlayer?.jerseyNumber != null ? (
                                    <span className="shrink-0 text-xs font-bold text-slate-500">
                                      #{lastPlayer.jerseyNumber}
                                    </span>
                                  ) : null}
                                  <span className="truncate text-sm font-medium text-[#1B4332]">
                                    {lastActionLabel}
                                  </span>
                                </div>
                              );
                            })()
                          ) : (
                            <div />
                          )}
                          <button
                            type="button"
                            onClick={openTrackingOverlay}
                            aria-label="Open fullscreen tracking"
                            className="rounded-lg border border-slate-300 bg-white p-1.5 text-slate-700 transition hover:bg-slate-50"
                          >
                            <svg
                              viewBox="0 0 20 20"
                              className="h-4 w-4"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                            >
                              <path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4" />
                            </svg>
                          </button>
                        </div>
                      </div>

                      {inlineVoiceControl}

                      {lineupIds.length === 0 || (!isDualTeam && isStandaloneLineupEditing) ? (
                        <LineupPicker
                          variant="inline"
                          isDualTeam={isDualTeam}
                          teamDisplayName={
                            participantsBySide[activeSide]?.displayName || activeSide
                          }
                          players={players}
                          canManageRoster={canAddRosterPlayer}
                          onAddPlayer={() => setIsAddPlayerOpen(true)}
                          lineupDraft={currentSideState.lineupDraft}
                          onToggle={(playerId, checked) => {
                            const nextDraft = checked
                              ? [...currentSideState.lineupDraft, playerId]
                              : currentSideState.lineupDraft.filter((id) => id !== playerId);
                            updateSideState(activeKey, { lineupDraft: nextDraft });
                          }}
                          onSave={saveLineup}
                          isSaving={isSaving}
                        />
                      ) : null}
                    </div>
                  ) : null}

                  {activePanel === 'substitutions'
                    ? (() => {
                        const { playerOutId, playerInId } = currentSideState.substitutionState;
                        const playerOut = playerOutId ? playersById.get(playerOutId) : null;
                        const playerIn = playerInId ? playersById.get(playerInId) : null;
                        const bothSelected = Boolean(playerOutId && playerInId);

                        function SubPlayerCard({ player, isSelected, tone, onToggle }) {
                          const baseRing = tone === 'out' ? 'ring-[#B42318]' : 'ring-[#1B4332]';
                          const selectedBg = tone === 'out' ? 'bg-[#FDF3F2]' : 'bg-[#EEF6F1]';
                          const avatarBg =
                            tone === 'out'
                              ? 'bg-[#FBE3E1] text-[#8f1c12]'
                              : 'bg-[#DCEBE3] text-[#1B4332]';
                          const defaultAvatarBg = 'bg-slate-100 text-slate-600';
                          return (
                            <button
                              type="button"
                              onClick={onToggle}
                              aria-label={player.displayName}
                              aria-pressed={isSelected}
                              className={`flex flex-col items-center gap-1.5 rounded-xl border p-2.5 transition ${
                                isSelected
                                  ? `${selectedBg} border-transparent ring-2 ${baseRing}`
                                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                              }`}
                            >
                              <span
                                className={`flex h-11 w-11 items-center justify-center rounded-full text-lg font-black tabular-nums ${
                                  isSelected ? avatarBg : defaultAvatarBg
                                }`}
                              >
                                {player.jerseyNumber ?? '?'}
                              </span>
                              <span className="w-full overflow-hidden text-center text-[11px] font-semibold leading-tight text-slate-700">
                                {player.displayName}
                              </span>
                            </button>
                          );
                        }

                        return (
                          <div className="relative">
                            <div
                              className={`space-y-5 transition-all ${bothSelected ? 'pb-20' : ''}`}
                            >
                              <div>
                                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                                  On Court — tap to sub out
                                </p>
                                {onCourtPlayers.length === 0 ? (
                                  <p className="text-sm text-slate-400">No players on court yet.</p>
                                ) : (
                                  <div className="grid grid-cols-5 gap-1">
                                    {onCourtPlayers.map((player) => (
                                      <SubPlayerCard
                                        key={player.id}
                                        player={player}
                                        tone="out"
                                        isSelected={playerOutId === player.id}
                                        onToggle={() =>
                                          toggleSubstitutionPlayer('playerOutId', player.id)
                                        }
                                      />
                                    ))}
                                  </div>
                                )}
                              </div>

                              <div>
                                <div className="mb-2 flex items-center justify-between gap-2">
                                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                                    On Bench — tap to sub in
                                  </p>
                                  {canAddRosterPlayer ? (
                                    <button
                                      type="button"
                                      onClick={() => setIsAddPlayerOpen(true)}
                                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                                    >
                                      + Add player
                                    </button>
                                  ) : null}
                                </div>
                                {benchPlayers.filter((p) => p.isActive !== false).length === 0 ? (
                                  <p className="text-sm text-slate-400">
                                    No bench players available.
                                  </p>
                                ) : (
                                  <div className="grid grid-cols-5 gap-1">
                                    {benchPlayers
                                      .filter((p) => p.isActive !== false)
                                      .map((player) => (
                                        <SubPlayerCard
                                          key={player.id}
                                          player={player}
                                          tone="in"
                                          isSelected={playerInId === player.id}
                                          onToggle={() =>
                                            toggleSubstitutionPlayer('playerInId', player.id)
                                          }
                                        />
                                      ))}
                                  </div>
                                )}
                              </div>
                            </div>

                            {bothSelected ? (
                              <div className="absolute inset-x-0 bottom-0 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
                                <div className="mb-3 flex items-center justify-center gap-3">
                                  <div className="flex flex-col items-center gap-0.5">
                                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#FBE3E1] text-sm font-black text-[#8f1c12]">
                                      {playerOut?.jerseyNumber ?? '?'}
                                    </span>
                                    <span className="max-w-[4.5rem] truncate text-[10px] font-semibold text-slate-600">
                                      {playerOut?.displayName}
                                    </span>
                                  </div>
                                  <svg
                                    viewBox="0 0 20 20"
                                    className="h-5 w-5 shrink-0 text-slate-400"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.8"
                                  >
                                    <path d="M4 7h12M13 4l3 3-3 3M16 13H4M7 10l-3 3 3 3" />
                                  </svg>
                                  <div className="flex flex-col items-center gap-0.5">
                                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#DCEBE3] text-sm font-black text-[#1B4332]">
                                      {playerIn?.jerseyNumber ?? '?'}
                                    </span>
                                    <span className="max-w-[4.5rem] truncate text-[10px] font-semibold text-slate-600">
                                      {playerIn?.displayName}
                                    </span>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={saveSubstitution}
                                  disabled={isSaving}
                                  className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50"
                                >
                                  {isSaving ? 'Saving…' : 'Record Sub'}
                                </button>
                              </div>
                            ) : null}
                          </div>
                        );
                      })()
                    : null}

                  {activePanel === 'events' ? (
                    <div>
                      <div className="flex items-center justify-between gap-3">
                        <h2 className="text-base font-semibold text-slate-900">Recent Events</h2>
                        <div className="flex items-center gap-2">
                          {recentEvents.length > 3 ? (
                            <button
                              type="button"
                              onClick={() => setShowAllRecentEvents((value) => !value)}
                              className="text-sm font-medium text-[#1B4332] hover:underline"
                            >
                              {showAllRecentEvents ? 'Show less' : 'Show all'}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => undoLastEvent()}
                            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-800"
                          >
                            Undo Last
                          </button>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                        <span className="text-xs text-slate-400">On each row:</span>
                        <span className="flex items-center gap-1.5 text-xs text-slate-500">
                          <svg
                            viewBox="0 0 16 16"
                            className="h-3.5 w-3.5 shrink-0 text-slate-400"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                          >
                            <path d="M11 2.5a1.5 1.5 0 0 1 2.121 2.121L5 12.75l-3 .75.75-3L11 2.5Z" />
                          </svg>
                          Edit event
                        </span>
                        <span className="flex items-center gap-1.5 text-xs text-slate-500">
                          <svg
                            viewBox="0 0 16 16"
                            className="h-3.5 w-3.5 shrink-0 text-[#1B4332]"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                          >
                            <path d="M8 3v8M5 8l3 3 3-3" />
                            <path d="M3 13h10" />
                          </svg>
                          Insert stat before
                        </span>
                        <span className="flex items-center gap-1.5 text-xs text-slate-500">
                          <svg
                            viewBox="0 0 16 16"
                            className="h-3.5 w-3.5 shrink-0 text-[#B42318]"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                          >
                            <path d="M3 4h10M6 4V3h4v1M5 4l.5 9h5l.5-9" />
                          </svg>
                          Delete event
                        </span>
                      </div>
                      <div className="mt-4 space-y-2">
                        {visibleRecentEvents.map((event) => {
                          const eventLogoUrl = isDualTeam
                            ? participantsBySide[event.teamSide]?.logo?.url || teamPlaceholder
                            : event.playerId
                              ? team?.logo?.url || teamPlaceholder
                              : null;
                          const { actor, statLabel, meta } = parseEventParts(
                            event,
                            playersById,
                            game.gameFormat
                          );
                          return (
                            <div
                              key={event.id}
                              className="rounded-lg border border-slate-200 px-3 py-2"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex items-start gap-2">
                                  {eventLogoUrl ? (
                                    <CloudinaryImage
                                      src={eventLogoUrl}
                                      alt=""
                                      width={24}
                                      height={24}
                                      loading="lazy"
                                      decoding="async"
                                      srcSetWidths={[24, 48, 72]}
                                      sizes="24px"
                                      className="mt-0.5 h-6 w-6 shrink-0 rounded-full border border-slate-200 bg-white object-cover"
                                    />
                                  ) : null}
                                  <div>
                                    <p className="text-sm font-semibold text-slate-900">{actor}</p>
                                    {statLabel ? (
                                      <p className="text-xs text-slate-600">{statLabel}</p>
                                    ) : null}
                                    {meta ? <p className="text-xs text-slate-400">{meta}</p> : null}
                                  </div>
                                </div>
                                <div className="flex shrink-0 items-center gap-1">
                                  <button
                                    type="button"
                                    aria-label="Edit this event"
                                    onClick={() => openEditEvent(event)}
                                    className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-50"
                                  >
                                    <svg
                                      viewBox="0 0 16 16"
                                      className="h-4 w-4"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="1.8"
                                    >
                                      <path d="M11 2.5a1.5 1.5 0 0 1 2.121 2.121L5 12.75l-3 .75.75-3L11 2.5Z" />
                                    </svg>
                                  </button>
                                  <button
                                    type="button"
                                    aria-label="Insert stat before this event"
                                    onClick={() => {
                                      setInsertBeforeEventId(event.id);
                                      entryClockSnapshotRef.current = {
                                        segmentKind: event.segmentKind,
                                        segmentNumber: event.segmentNumber,
                                        clockMillisecondsRemaining:
                                          event.clockMillisecondsRemaining,
                                      };
                                      setActivePanel('court');
                                    }}
                                    className="rounded-md p-1.5 text-[#1B4332] transition-colors hover:bg-[#1B4332]/10"
                                  >
                                    <svg
                                      viewBox="0 0 16 16"
                                      className="h-4 w-4"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="1.8"
                                    >
                                      <path d="M8 3v8M5 8l3 3 3-3" />
                                      <path d="M3 13h10" />
                                    </svg>
                                  </button>
                                  <button
                                    type="button"
                                    aria-label="Remove this event"
                                    onClick={() => removeEvent(event.id)}
                                    className="rounded-md p-1.5 text-[#B42318] transition-colors hover:bg-[#B42318]/10"
                                  >
                                    <svg
                                      viewBox="0 0 16 16"
                                      className="h-4 w-4"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="1.8"
                                    >
                                      <path d="M3 4h10M6 4V3h4v1M5 4l.5 9h5l.5-9" />
                                    </svg>
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  {activePanel === 'more' ? (
                    <div className="space-y-6 pb-2">
                      <section aria-labelledby="voice-tracking-settings-heading">
                        <h2
                          id="voice-tracking-settings-heading"
                          className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-slate-500"
                        >
                          Voice tracking
                        </h2>
                        <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
                          <button
                            type="button"
                            aria-pressed={voiceEnabled}
                            disabled={!speechSupport.supported || !voiceSportSupported || isSaving}
                            onClick={() => setVoiceEnabled((enabled) => !enabled)}
                            className="flex w-full items-center gap-3 px-4 py-4 text-left transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                              <svg
                                viewBox="0 0 24 24"
                                className="h-5 w-5"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                aria-hidden="true"
                              >
                                <rect x="9" y="3" width="6" height="11" rx="3" />
                                <path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6" />
                              </svg>
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-900">Voice Tracking</p>
                              <p className="text-xs text-slate-500">
                                {!voiceSportSupported
                                  ? 'Not available for this sport.'
                                  : !speechSupport.supported
                                    ? speechSupport.reason === 'insecure'
                                      ? 'Requires a secure HTTPS connection.'
                                      : 'Not supported by this browser.'
                                    : voiceEnabled
                                      ? 'On — select a court position to start listening.'
                                      : 'Off — tap to enable for this tracking session.'}
                              </p>
                              {speechSupport.supported && voiceSportSupported ? (
                                <p className="mt-1 text-[11px] leading-4 text-slate-400">
                                  Your browser may process audio remotely. TSW does not store audio
                                  or transcripts.
                                </p>
                              ) : null}
                            </div>
                            <span
                              className={`ml-auto shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${voiceEnabled ? 'bg-[#1B4332] text-white' : 'bg-slate-200 text-slate-700'}`}
                            >
                              {voiceEnabled ? 'On' : 'Off'}
                            </span>
                          </button>

                          {voiceSportSupported ? (
                            <button
                              type="button"
                              aria-haspopup="dialog"
                              aria-label="How to use voice commands"
                              onClick={() => setIsVoiceHelpOpen(true)}
                              className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50"
                            >
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EEF6F1] text-sm font-black text-[#1B4332]">
                                ?
                              </span>
                              <span className="min-w-0">
                                <span className="block text-sm font-semibold text-slate-900">
                                  How to use voice commands
                                </span>
                                <span className="block text-xs text-slate-500">
                                  See the process, phrase structure, and examples.
                                </span>
                              </span>
                              <svg
                                viewBox="0 0 20 20"
                                className="ml-auto h-5 w-5 shrink-0 text-slate-400"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                aria-hidden="true"
                              >
                                <path d="m7 4 6 6-6 6" />
                              </svg>
                            </button>
                          ) : null}
                        </div>
                      </section>

                      <section aria-labelledby="tracking-setup-heading">
                        <h2
                          id="tracking-setup-heading"
                          className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-slate-500"
                        >
                          Tracking setup
                        </h2>
                        <div className="space-y-2">
                          <button
                            type="button"
                            onClick={() =>
                              setCourtOrientation((o) =>
                                o === 'vertical' ? 'horizontal' : 'vertical'
                              )
                            }
                            className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-4 text-left transition hover:bg-slate-50"
                          >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                              <svg
                                viewBox="0 0 20 20"
                                className="h-5 w-5"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                              >
                                <path d="M4 4v5h5M16 16v-5h-5" />
                                <path d="M4.5 9a7.5 7.5 0 0 1 12.6-4M15.5 11a7.5 7.5 0 0 1-12.6 4" />
                              </svg>
                            </span>
                            <div>
                              <p className="text-sm font-semibold text-slate-900">Rotate Court</p>
                              <p className="text-xs text-slate-500">
                                Currently {courtOrientation} — tap to rotate{' '}
                                {courtOrientation === 'vertical' ? 'horizontal' : 'vertical'}
                              </p>
                            </div>
                          </button>

                          {game.videoUrl ? (
                            <button
                              type="button"
                              onClick={togglePauseVideoOnEntry}
                              className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-4 text-left transition hover:bg-slate-50"
                            >
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                                <svg
                                  viewBox="0 0 20 20"
                                  className="h-5 w-5"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.8"
                                >
                                  <path d="M7 4v12M13 4v12" />
                                </svg>
                              </span>
                              <div>
                                <p className="text-sm font-semibold text-slate-900">
                                  Pause Video During Stat Entry
                                </p>
                                <p className="text-xs text-slate-500">
                                  {pauseVideoOnEntry
                                    ? 'On — video pauses while you tag a stat, resumes after.'
                                    : 'Off — video keeps playing while you tag a stat.'}
                                </p>
                              </div>
                              <span
                                className={`ml-auto shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${pauseVideoOnEntry ? 'bg-[#1B4332] text-white' : 'bg-slate-200 text-slate-700'}`}
                              >
                                {pauseVideoOnEntry ? 'On' : 'Off'}
                              </span>
                            </button>
                          ) : null}

                          <div className="rounded-xl border border-slate-200 bg-white px-4 py-4">
                            <button
                              type="button"
                              onClick={() => {
                                if (isVideoUrlEditOpen) {
                                  setIsVideoUrlEditOpen(false);
                                  return;
                                }
                                setVideoUrlDraft(game.videoUrl || '');
                                setIsVideoUrlEditOpen(true);
                              }}
                              className="flex w-full items-center gap-3 text-left"
                            >
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                                <svg
                                  viewBox="0 0 20 20"
                                  className="h-5 w-5"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.8"
                                >
                                  <rect x="2" y="5" width="12" height="10" rx="1.5" />
                                  <path d="M14 8.5l4-2.5v8l-4-2.5" />
                                </svg>
                              </span>
                              <div>
                                <p className="text-sm font-semibold text-slate-900">
                                  {game.videoUrl ? 'Update Video' : 'Add Video'}
                                </p>
                                <p className="text-xs text-slate-500">
                                  {game.videoUrl
                                    ? 'Change the linked game video URL.'
                                    : 'Link a YouTube video to sync with tracking.'}
                                </p>
                              </div>
                            </button>

                            {isVideoUrlEditOpen ? (
                              <div className="mt-3 space-y-2">
                                <input
                                  type="url"
                                  aria-label="Game video URL"
                                  autoComplete="off"
                                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm placeholder:text-slate-400 focus:border-[#F4A300]/60 focus:outline-none focus:ring-2 focus:ring-[#F4A300]/20"
                                  placeholder="https://www.youtube.com/watch?v=..."
                                  value={videoUrlDraft}
                                  onChange={(e) => setVideoUrlDraft(e.target.value)}
                                />
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={saveVideoUrl}
                                    disabled={isSaving}
                                    className="flex-1 rounded-lg bg-slate-900 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50"
                                  >
                                    {isSaving ? 'Saving…' : 'Save'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setIsVideoUrlEditOpen(false)}
                                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </section>

                      <section aria-labelledby="game-actions-heading">
                        <h2
                          id="game-actions-heading"
                          className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-slate-500"
                        >
                          Game actions
                        </h2>
                        <div className="space-y-2">
                          <button
                            type="button"
                            onClick={() => leaveTracker('/admin')}
                            className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-4 text-left transition hover:bg-slate-50"
                          >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                              <svg
                                viewBox="0 0 20 20"
                                className="h-5 w-5"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                              >
                                <path d="M3 10h14M10 3l7 7-7 7" />
                              </svg>
                            </span>
                            <div>
                              <p className="text-sm font-semibold text-slate-900">
                                Save &amp; Exit
                              </p>
                              <p className="text-xs text-slate-500">
                                Return to admin. All changes are already saved.
                              </p>
                            </div>
                          </button>

                          {isCompleted ? (
                            <button
                              type="button"
                              onClick={() => leaveTracker(`/games/${gameId}`)}
                              disabled={isSaving}
                              className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-4 text-left transition hover:bg-slate-50 disabled:opacity-60"
                            >
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                                <svg
                                  viewBox="0 0 20 20"
                                  className="h-5 w-5"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.8"
                                >
                                  <path d="M5 13l4 4L19 7" />
                                </svg>
                              </span>
                              <div>
                                <p className="text-sm font-semibold text-slate-900">Done Editing</p>
                                <p className="text-xs text-slate-500">
                                  View the finalized game record.
                                </p>
                              </div>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setShowFinishConfirm(true)}
                              disabled={isSaving}
                              className="flex w-full items-center gap-3 rounded-xl border border-[#1B4332]/25 bg-[#EEF6F1] px-4 py-4 text-left transition-colors hover:bg-[#DCEBE3] disabled:opacity-60"
                            >
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1B4332] text-white">
                                <svg
                                  viewBox="0 0 20 20"
                                  className="h-5 w-5"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.8"
                                >
                                  <path d="M5 13l4 4L19 7" />
                                </svg>
                              </span>
                              <div>
                                <p className="text-sm font-semibold text-[#1B4332]">Finish Game</p>
                                <p className="text-xs text-[#2c5c47]">Mark the game as complete.</p>
                              </div>
                            </button>
                          )}
                        </div>
                      </section>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          )}
        </div>

        {editingEvent
          ? (() => {
              const allStatTypes = Object.keys(STAT_LABELS);
              return (
                // Escape handling only — the actual dismiss control is the invisible
                // backdrop <button> beneath this dialog.
                // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
                <div
                  role="dialog"
                  aria-modal="true"
                  aria-label="Edit event"
                  className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-[1px]"
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setEditingEvent(null);
                  }}
                >
                  <button
                    type="button"
                    aria-label="Close"
                    tabIndex={-1}
                    className="fixed inset-0 h-full w-full cursor-default"
                    onClick={() => setEditingEvent(null)}
                  />
                  {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions --
                      stop-propagation guard only, not an interactive control. */}
                  <div
                    className="relative z-10 w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <p className="text-base font-semibold text-slate-900">Edit Event</p>
                      <button
                        type="button"
                        aria-label="Close"
                        onClick={() => setEditingEvent(null)}
                        className="rounded-md border border-slate-300 p-1 text-slate-500 hover:bg-slate-50"
                      >
                        <svg
                          viewBox="0 0 20 20"
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                        >
                          <path d="m5 5 10 10M15 5 5 15" />
                        </svg>
                      </button>
                    </div>

                    <div className="space-y-4">
                      {isDualTeam ? (
                        <div>
                          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Team
                          </p>
                          <div className="flex gap-2">
                            {[TEAM_SIDES.HOME, TEAM_SIDES.AWAY].map((side) => (
                              <button
                                key={side}
                                type="button"
                                onClick={() => {
                                  const sidePlayers = participantsBySide[side]?.players || [];
                                  const playerStillValid = sidePlayers.some(
                                    (p) => p.id === editingEvent.playerId
                                  );
                                  setEditingEvent((ev) => ({
                                    ...ev,
                                    teamSide: side,
                                    playerId: playerStillValid ? ev.playerId : '',
                                  }));
                                }}
                                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${editingEvent.teamSide === side ? 'border-[#141414] bg-[#141414] text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
                              >
                                {participantsBySide[side]?.displayName || side}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      <div>
                        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Player
                        </p>
                        <select
                          aria-label="Player"
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400"
                          value={editingEvent.playerId}
                          onChange={(e) =>
                            setEditingEvent((ev) => ({ ...ev, playerId: e.target.value }))
                          }
                        >
                          <option value="">— No player (opponent) —</option>
                          {(isDualTeam
                            ? participantsBySide[editingEvent.teamSide]?.players || []
                            : players
                          ).map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.jerseyNumber != null ? `#${p.jerseyNumber} ` : ''}
                              {p.displayName}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Stat
                        </p>
                        <select
                          aria-label="Stat type"
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400"
                          value={editingEvent.statType}
                          onChange={(e) =>
                            setEditingEvent((ev) => ({ ...ev, statType: e.target.value }))
                          }
                        >
                          {allStatTypes.map((st) => (
                            <option key={st} value={st}>
                              {STAT_LABELS[st]}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Period and game time
                        </p>
                        <div className="grid grid-cols-3 gap-2">
                          <select
                            aria-label="Period kind"
                            value={editingEvent.segmentKind}
                            onChange={(e) =>
                              setEditingEvent((ev) => ({ ...ev, segmentKind: e.target.value }))
                            }
                            className="rounded-lg border border-slate-300 px-2 py-2 text-sm"
                          >
                            <option value="regulation">Regulation</option>
                            <option value="overtime">Overtime</option>
                          </select>
                          <input
                            aria-label="Period number"
                            type="number"
                            min="1"
                            value={editingEvent.segmentNumber}
                            onChange={(e) =>
                              setEditingEvent((ev) => ({ ...ev, segmentNumber: e.target.value }))
                            }
                            className="rounded-lg border border-slate-300 px-2 py-2 text-sm"
                          />
                          <input
                            aria-label="Milliseconds remaining"
                            type="number"
                            min="0"
                            step="100"
                            value={editingEvent.clockMillisecondsRemaining}
                            onChange={(e) =>
                              setEditingEvent((ev) => ({
                                ...ev,
                                clockMillisecondsRemaining: e.target.value,
                              }))
                            }
                            className="rounded-lg border border-slate-300 px-2 py-2 text-sm"
                          />
                        </div>
                      </div>

                      <div>
                        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Zone
                        </p>
                        <select
                          aria-label="Court zone"
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400"
                          value={editingEvent.zoneId}
                          onChange={(e) =>
                            setEditingEvent((ev) => ({ ...ev, zoneId: e.target.value }))
                          }
                        >
                          <option value="">— No zone —</option>
                          {Object.entries(ZONE_LABELS).map(([id, label]) => (
                            <option key={id} value={id}>
                              {label}
                            </option>
                          ))}
                        </select>
                        <div className="mt-2 flex gap-2">
                          <div className="flex-1">
                            <p className="mb-1 text-xs text-slate-500">X (0–100)</p>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.1"
                              aria-label="X coordinate (0–100)"
                              autoComplete="off"
                              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400"
                              value={editingEvent.x}
                              onChange={(e) =>
                                setEditingEvent((ev) => ({ ...ev, x: e.target.value }))
                              }
                            />
                          </div>
                          <div className="flex-1">
                            <p className="mb-1 text-xs text-slate-500">Y (0–100)</p>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.1"
                              aria-label="Y coordinate (0–100)"
                              autoComplete="off"
                              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400"
                              value={editingEvent.y}
                              onChange={(e) =>
                                setEditingEvent((ev) => ({ ...ev, y: e.target.value }))
                              }
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 flex gap-3">
                      <button
                        type="button"
                        onClick={() => setEditingEvent(null)}
                        className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={saveEventEdit}
                        className="flex-1 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60"
                      >
                        {isSaving ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()
          : null}

        <Modal
          open={isVoiceHelpOpen}
          onClose={() => setIsVoiceHelpOpen(false)}
          title="How to use voice tracking"
          panelClassName="max-w-3xl"
        >
          <div className="space-y-6 text-sm text-slate-600">
            <section>
              <h3 className="font-semibold text-slate-900">Track a stat</h3>
              <ol className="mt-3 space-y-3">
                {[
                  'Turn on Voice Tracking in More.',
                  'Make sure the player is currently on the court. If they are on the bench, use Subs to sub them in first.',
                  'Open Court and tap where the event happened. That tap starts the microphone automatically.',
                  'Say one player and one action. The stat is recorded only when the player and command are unambiguous.',
                  'Answer any follow-up question, such as who assisted or rebounded, using the microphone in the question.',
                ].map((step, index) => (
                  <li key={step} className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#EEF6F1] text-xs font-bold text-[#1B4332]">
                      {index + 1}
                    </span>
                    <span className="pt-0.5">{step}</span>
                  </li>
                ))}
              </ol>
            </section>

            <section className="rounded-xl border border-[#B7D8C8] bg-[#EEF6F1] p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#356859]">
                This game
              </p>
              <h3 className="mt-1 font-semibold text-slate-900">
                {isDualTeam ? 'Use dual-team phrases' : 'Use one-team phrases'}
              </h3>
              <p className="mt-1 text-xs text-slate-600">
                {isDualTeam
                  ? 'Start every primary command with home or away. This tells voice tracking which on-court lineup to search.'
                  : 'Do not say home or away. Voice tracking searches the current on-court lineup for your team.'}
              </p>
            </section>

            <section className="rounded-xl bg-slate-50 p-4">
              <h3 className="font-semibold text-slate-900">Phrase structure</h3>
              <div className="mt-3 space-y-2">
                <p>
                  One-team tracking:{' '}
                  <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs font-semibold text-slate-900">
                    player + action
                  </code>
                </p>
                <p>
                  Dual-team tracking:{' '}
                  <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs font-semibold text-slate-900">
                    home/away + player + action
                  </code>
                </p>
                <p className="text-xs text-slate-500">
                  Use a jersey number or a uniquely matching player name. For a field goal, the
                  court location decides whether it is worth two or three points; if you say the
                  point value, it must match the location.
                </p>
              </div>
            </section>

            <VoiceHelpTable
              title="Shots"
              description="Tap the event location first. For a field goal, the tap decides two or three points; an explicitly spoken value must match it."
              columns={['Stat', 'Say', 'What happens']}
              rows={[
                ['Inferred make', '13 made', 'The court location decides 2PT or 3PT.'],
                ['Inferred miss', '13 missed', 'The court location decides 2PT or 3PT.'],
                ['2PT make', '13 two point field goal made', 'Accepted only inside the arc.'],
                ['2PT miss', '13 2pt field goal missed', 'Accepted only inside the arc.'],
                ['3PT make', '13 3pt field goal made', 'Accepted only outside the arc.'],
                ['3PT miss', '13 3pt field goal missed', 'Accepted only outside the arc.'],
                ['Free throw make', 'Alex free throw made', 'Records a made free throw.'],
                ['Free throw miss', 'Alex missed free throw', 'Records a missed free throw.'],
                ['Opponent +1 (one-team)', 'opponent plus one', 'Records an opponent free throw.'],
                ['Opponent +2 (one-team)', 'opponent plus two', 'Accepted only inside the arc.'],
                ['Opponent +3 (one-team)', 'opponent plus three', 'Accepted only outside the arc.'],
              ]}
            />

            <VoiceHelpTable
              title="Non-shot stats"
              description="Use the exact action below after a jersey number or uniquely matching player name."
              columns={['Stat', 'Say', 'What happens']}
              rows={[
                ['Offensive rebound', '13 offensive rebound', 'Records an offensive rebound.'],
                ['Defensive rebound', '13 defensive rebound', 'Records a defensive rebound.'],
                ['Steal', '13 steal', 'Records a steal.'],
                ['Block', 'Alex block', 'Records a block.'],
                ['Turnover', 'twenty three turnover', 'Records a turnover for jersey 23.'],
                ['Foul', 'Alex Morgan foul', 'Records a foul.'],
              ]}
            />

            <VoiceHelpTable
              title="Dual-team tracking"
              description="In a dual-team game, say home or away first on every primary command. In a one-team game, leave the side out."
              columns={['Stat', 'Say', 'What happens']}
              rows={[
                ['Home 3PT make', 'home 13 3pt field goal made', 'Searches the home lineup.'],
                ['Away 3PT miss', 'away 7 3pt field goal missed', 'Searches the away lineup.'],
                ['Home free throw', 'home Alex free throw made', 'Records for the home player.'],
                ['Away rebound', 'away Blake defensive rebound', 'Records for the away player.'],
                ['Home steal', 'home number 13 steal', 'Records for home jersey 13.'],
                ['Away turnover', 'away twenty three turnover', 'Records for away jersey 23.'],
              ]}
            />

            <VoiceHelpTable
              title="Follow-ups and controls"
              description="Follow-ups use the microphone shown beside the question. A player answer must still match an eligible on-court player."
              columns={['Question or control', 'Say or do', 'What happens']}
              rows={[
                ['Who assisted?', '7 or Blake', 'Credits the eligible player with an assist.'],
                ['No assist', 'unassisted', 'Closes an assist question without an assist.'],
                ['Who rebounded?', '7 or Blake', 'Credits the eligible rebounder.'],
                ['One-team opponent rebound', 'opponent', 'Records an opponent rebound.'],
                [
                  'Dual-team player answer',
                  'away 7',
                  'Use the side when needed to remove ambiguity.',
                ],
                ['Any optional question', 'skip', 'Closes the question without another stat.'],
                ['Who was fouled?', 'skip', 'The current data model does not store the victim.'],
                [
                  'Undo last event',
                  'undo',
                  'Works only when no follow-up is open and the event is still last.',
                ],
                [
                  'Stop listening',
                  'Cancel listening button',
                  'Stops the voice turn and opens the button picker.',
                ],
              ]}
            />

            <VoiceHelpTable
              title="Expected refusals"
              description="These phrases intentionally record nothing. The button picker opens with your tapped location retained."
              columns={['Situation', 'Say', 'Why it is refused']}
              rows={[
                ['No matching player', 'Nobody steal', 'No current on-court player matches.'],
                [
                  'Unsupported shot wording',
                  '21 jump shot made',
                  'Jump shot is not accepted vocabulary.',
                ],
                [
                  'Unsupported point value',
                  '13 made four',
                  'Only two- and three-point field goals exist.',
                ],
                ['Conflicting outcome', '13 made miss', 'The command says both made and missed.'],
                ['Conflicting points', '13 made two three', 'The command says both two and three.'],
                ['Unsupported action', '13 travelled', 'Travelled is not a supported action.'],
                ['Missing action', '13', 'A player without an action is incomplete.'],
                ['Side in a one-team game', 'home 13 made', 'Home or away is not allowed.'],
                ['No side in a dual-team game', '13 made', 'Home or away is required.'],
                [
                  'Opponent aggregate in a dual-team game',
                  'opponent plus two',
                  'Dual-team scoring must be attributed to an on-court player.',
                ],
                [
                  'Shot does not match tap',
                  '13 3pt field goal made',
                  'Refused if the tapped location is inside the arc.',
                ],
              ]}
            />

            <section className="rounded-xl bg-slate-50 p-4 text-xs text-slate-500">
              <h3 className="font-semibold text-slate-900">Player names and numbers</h3>
              <p className="mt-2">
                You can say a jersey number from 0–999 or a uniquely matching player name. Number
                words zero through nineteen and combinations such as <code>twenty three</code> are
                supported; say exact multiples of ten such as jersey 20 as digits.
              </p>
            </section>
          </div>
        </Modal>

        <Modal
          open={showClockRecovery}
          onClose={() => {}}
          title="The game clock kept running"
          panelClassName="max-w-md"
          showCloseButton={false}
        >
          {isClockRecoveryCorrectionOpen ? (
            <>
              <label
                htmlFor="recovery-clock-time"
                className="block text-sm font-semibold text-slate-800"
              >
                Corrected time
              </label>
              <input
                id="recovery-clock-time"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={clockRecoveryTimeDraft}
                onChange={(event) => setClockRecoveryTimeDraft(event.target.value)}
                placeholder="10:00"
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-mono text-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
              <p className="mt-2 text-xs text-slate-500">Use minutes:seconds, such as 4:32.5.</p>
              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => setIsClockRecoveryCorrectionOpen(false)}
                  className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={correctRecoveredClock}
                  className="flex-1 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  Apply corrected time
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-600">
                Accept the elapsed time, or correct it before recording more stats.
              </p>
              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => setShowClockRecovery(false)}
                  className="flex-1 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white"
                >
                  Accept elapsed time
                </button>
                <button
                  type="button"
                  onClick={() => setIsClockRecoveryCorrectionOpen(true)}
                  className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-800"
                >
                  Correct time
                </button>
              </div>
            </>
          )}
        </Modal>

        <Modal
          open={Boolean(pendingExitDestination)}
          onClose={() => setPendingExitDestination('')}
          title="Pause the clock and exit?"
          panelClassName="max-w-md"
        >
          <p className="text-sm text-slate-600">
            The game clock is running. Pause it before leaving this tracking session.
          </p>
          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => setPendingExitDestination('')}
              className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"
            >
              Keep tracking
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={pauseClockAndLeave}
              className="flex-1 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {isSaving ? 'Pausing…' : 'Pause and exit'}
            </button>
          </div>
        </Modal>

        {showFinishConfirm ? (
          // Escape handling only — the actual dismiss control is the invisible
          // backdrop <button> beneath this dialog.
          // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Finish tracking"
            className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-[1px]"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setShowFinishConfirm(false);
            }}
          >
            <button
              type="button"
              aria-label="Close"
              tabIndex={-1}
              className="fixed inset-0 h-full w-full cursor-default"
              onClick={() => setShowFinishConfirm(false)}
            />
            {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions --
                stop-propagation guard only, not an interactive control. */}
            <div
              className="relative z-10 w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-base font-semibold text-slate-900">Finish tracking?</p>
              <p className="mt-1 text-sm text-slate-500">
                This will mark the game as complete and lock the stats. You won&apos;t be able to
                track more events unless you reopen it for editing.
              </p>
              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowFinishConfirm(false)}
                  className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => {
                    setShowFinishConfirm(false);
                    finishGame();
                  }}
                  className="flex-1 rounded-xl bg-[#1B4332] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#245c44] disabled:opacity-60"
                >
                  {isSaving ? 'Finishing...' : 'Yes, finish game'}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <AddRosterPlayerDialog
          isOpen={isAddPlayerOpen}
          onClose={() => setIsAddPlayerOpen(false)}
          onSubmit={handleAddRosterPlayer}
          teamName={isDualTeam ? participantsBySide[activeSide]?.displayName : team?.name}
        />

        <Modal
          open={showShortLineupWarning}
          onClose={returnToShortLineup}
          title="Start with fewer than five players?"
          panelClassName="max-w-md"
        >
          <p className="text-sm text-slate-600">
            {isDualTeam
              ? `Selected players: ${participantsBySide[TEAM_SIDES.HOME]?.displayName || 'Home'} ${homeLineupCount}, ${participantsBySide[TEAM_SIDES.AWAY]?.displayName || 'Away'} ${awayLineupCount}.`
              : `This starting lineup has ${(game?.currentLineupPlayerIds || []).length} player${(game?.currentLineupPlayerIds || []).length === 1 ? '' : 's'}.`}{' '}
            Basketball teams normally begin with five players. You can still start and track this
            game with the selected lineup.
          </p>
          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row">
            <button
              type="button"
              onClick={returnToShortLineup}
              className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Go back to lineup
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={() => {
                setShowShortLineupWarning(false);
                executeClockCommand({ action: 'start' });
              }}
              className="flex-1 rounded-xl bg-[#1B4332] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#245c44] disabled:opacity-60"
            >
              Continue and start
            </button>
          </div>
        </Modal>

        {isTrackingFullscreen ? (
          <div
            className="fixed z-50 flex flex-col bg-white"
            style={{ top: 0, left: 0, right: 0, bottom: 0, margin: 0 }}
          >
            <GameTrackScoreHeader
              gameSummary={gameSummary}
              activeSide={activeSide}
              onChangeActiveSide={changeActiveSide}
              isDualTeam={isDualTeam}
              participantsBySide={participantsBySide}
              team={team}
              clockControls={
                <GameClockControls
                  game={game}
                  onCommand={runClockCommand}
                  disabled={isSaving || !allStartingLineupsReady}
                  disabledReason={
                    allStartingLineupsReady ? '' : 'Save a starting five below to start the clock.'
                  }
                  serverOffsetMilliseconds={serverOffsetMilliseconds}
                />
              }
            />
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div className="flex flex-wrap items-center gap-3">
                {isDualTeam ? (
                  <div className="flex flex-wrap gap-2">
                    {[TEAM_SIDES.HOME, TEAM_SIDES.AWAY].map((side) => (
                      <button
                        key={`fullscreen-${side}`}
                        type="button"
                        onClick={() => changeActiveSide(side)}
                        className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                          activeSide === side
                            ? 'bg-[#141414] text-white'
                            : 'border border-slate-300 bg-white text-slate-800'
                        }`}
                      >
                        {participantsBySide[side]?.displayName || side}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={closeTrackingOverlay}
                aria-label="Close fullscreen tracking"
                disabled={voiceBusy}
                className="rounded-lg border border-slate-300 bg-white p-1.5 text-slate-700 transition hover:bg-slate-50"
              >
                <svg
                  viewBox="0 0 20 20"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path d="m5 5 10 10M15 5 5 15" />
                </svg>
              </button>
            </div>
            <div className="relative min-h-0 flex-1">
              <InteractiveCourtImage
                onSelect={onCourtSelect}
                containerClassName="h-full"
                courtClassName="h-full"
                helperText=""
                flat
                rotate90={rotateCourt}
                layout={courtLayout}
              />
              {eventPicker}
              {isTrackingFullscreen && !isEventPickerOpen && courtVoiceControl ? (
                <div className="absolute bottom-3 left-3 right-3 mx-auto max-w-sm">
                  {courtVoiceControl}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
