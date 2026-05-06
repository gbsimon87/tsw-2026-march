import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { SportsLoader } from '../../../components/SportsLoader';
import { gamesApi } from '../api/gamesApi';
import { teamsApi } from '../../teams/api/teamsApi';
import { InteractiveCourtImage } from '../components/InteractiveCourtImage';
import {
  buildFreeThrowPayload,
  buildShotStatType,
  inferCourtSelection,
} from '../court/courtInference';
import { DEFAULT_COURT_IMAGE_CALIBRATION } from '../court/courtImageCalibration';
import gameConstants from '../constants';

const { STAT_LABELS, ZONE_LABELS, TEAM_SIDES } = gameConstants;

function formatEventMeta(event) {
  const parts = [];

  if (event.zoneId) {
    parts.push(ZONE_LABELS[event.zoneId] || event.zoneId);
  }

  if (typeof event.x === 'number' && typeof event.y === 'number') {
    parts.push(`(${event.x.toFixed(1)}, ${event.y.toFixed(1)})`);
  }

  return parts.length ? ` @ ${parts.join(' ')}` : '';
}

function formatEventLabel(event, playersById, participantsBySide, isDualTeam) {
  const player = event.playerId ? playersById.get(event.playerId) : null;
  const actor =
    event.statType === 'SUB_IN'
      ? `${player?.displayName || 'Unknown'} subbed in`
      : event.statType === 'SUB_OUT'
        ? `${player?.displayName || 'Unknown'} subbed out`
        : event.playerId
          ? player?.displayName || 'Unknown'
          : 'Opponent';
  const statLabel = STAT_LABELS[event.statType] || event.statType;
  const sideLabel =
    isDualTeam && event.teamSide
      ? `${participantsBySide[event.teamSide]?.displayName || event.teamSide}: `
      : '';

  return event.statType === 'SUB_IN' || event.statType === 'SUB_OUT'
    ? `${sideLabel}${actor}`
    : `${sideLabel}${actor} - ${statLabel}${formatEventMeta(event)}`;
}

function formatThreePointPercentage(made, attempts) {
  if (!attempts) {
    return '--';
  }

  return `${((made / attempts) * 100).toFixed(1)}%`;
}

function formatPercentage(made, attempts) {
  if (!attempts) {
    return '--';
  }

  return `${((made / attempts) * 100).toFixed(1)}%`;
}

function isReasonLabel(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function createEmptySideState() {
  return {
    lineupDraft: [],
    selectedPlayerId: '',
    substitutionState: { playerOutId: '', playerInId: '' },
  };
}

export function GameTrackPage() {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [rosterOverride, setRosterOverride] = useState(null);
  const [selectedShot, setSelectedShot] = useState(null);
  const [pendingFollowUpPrompt, setPendingFollowUpPrompt] = useState(null);
  const [lastTappedHoop, setLastTappedHoop] = useState('south');
  const [isSaving, setIsSaving] = useState(false);
  const [isTrackingFullscreen, setIsTrackingFullscreen] = useState(false);
  const [error, setError] = useState('');
  const [lastActionLabel, setLastActionLabel] = useState('');
  const [showAllRecentEvents, setShowAllRecentEvents] = useState(false);
  const [activeSide, setActiveSide] = useState(TEAM_SIDES.HOME);
  const [sideState, setSideState] = useState({
    [TEAM_SIDES.HOME]: createEmptySideState(),
    [TEAM_SIDES.AWAY]: createEmptySideState(),
    oneSided: createEmptySideState(),
  });
  const isEventPickerOpen = Boolean(selectedShot || pendingFollowUpPrompt);

  useEffect(() => {
    async function loadGame() {
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
    }

    loadGame();
  }, [gameId]);

  useEffect(() => {
    if (!isEventPickerOpen) {
      return undefined;
    }

    const originalOverflow = document.body.style.overflow;
    const originalTouchAction = document.body.style.touchAction;
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.touchAction = originalTouchAction;
    };
  }, [isEventPickerOpen]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    if (isTrackingFullscreen) {
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isTrackingFullscreen]);

  const isDualTeam = data?.game?.trackingMode === 'dual_team';
  const isLeagueGame = data?.game?.gameContext === 'league';
  const participantsBySide = useMemo(() => data?.participants || {}, [data?.participants]);
  const activeKey = isDualTeam ? activeSide : 'oneSided';
  const currentSideState = sideState[activeKey] || createEmptySideState();
  const team = data?.team || null;
  const teamId = data?.game?.teamId || null;
  const lineupIds = isDualTeam
    ? data?.lineups?.[activeSide]?.currentPlayerIds || []
    : data?.game?.currentLineupPlayerIds || [];
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
  const onCourtPlayers = lineupIds.map((id) => playersById.get(id)).filter(Boolean);
  const benchPlayers = players.filter((player) => !lineupIds.includes(player.id));
  const otherSide = activeSide === TEAM_SIDES.HOME ? TEAM_SIDES.AWAY : TEAM_SIDES.HOME;
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
  const otherTeamOnCourtPlayers = useMemo(() => {
    if (!isDualTeam) return [];
    const otherLineupIds = data?.lineups?.[otherSide]?.currentPlayerIds || [];
    return otherLineupIds.map((id) => playersById.get(id)).filter(Boolean);
  }, [isDualTeam, data, otherSide, playersById]);
  const boxScore = data?.boxScore || null;
  const game = data?.game || null;

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

  function requireLineup() {
    if (isDualTeam) {
      const homeReady = (data?.lineups?.[TEAM_SIDES.HOME]?.currentPlayerIds || []).length === 5;
      const awayReady = (data?.lineups?.[TEAM_SIDES.AWAY]?.currentPlayerIds || []).length === 5;
      if (!homeReady || !awayReady) {
        setError('Set both starting fives before tracking');
        return false;
      }
      return true;
    }

    if (lineupIds.length !== 5) {
      setError('Set starting five before tracking');
      return false;
    }

    return true;
  }

  function requirePlayerSelection() {
    if (isSaving) {
      return false;
    }

    if (!requireLineup()) {
      return false;
    }

    if (!currentSideState.selectedPlayerId) {
      setError('Select a player first');
      return false;
    }

    return true;
  }

  function buildEventPayload(payload) {
    return isDualTeam ? { ...payload, teamSide: activeSide } : payload;
  }

  function onCourtSelect(point) {
    if (isSaving || !requireLineup()) {
      return;
    }

    const inferred = inferCourtSelection(point.x, point.y, DEFAULT_COURT_IMAGE_CALIBRATION);
    setSelectedShot(inferred);
    setPendingFollowUpPrompt(null);
    setLastTappedHoop(inferred.nearestHoop);
    setError('');
  }

  function openTrackingOverlay() {
    if (!requireLineup()) {
      return;
    }

    setError('');
    setIsTrackingFullscreen(true);
  }

  function closeTrackingOverlay() {
    setSelectedShot(null);
    setPendingFollowUpPrompt(null);
    setIsTrackingFullscreen(false);
  }

  function resetTransientTrackingState() {
    setSelectedShot(null);
    setPendingFollowUpPrompt(null);
    setError('');
  }

  function changeActiveSide(nextSide) {
    if (!isDualTeam || nextSide === activeSide) {
      return;
    }

    resetTransientTrackingState();
    setActiveSide(nextSide);
  }

  function clearEventPicker(reason = '') {
    setSelectedShot(null);
    setPendingFollowUpPrompt(null);
    if (isReasonLabel(reason)) {
      setLastActionLabel(reason);
    }
  }

  async function addReboundEvent(statType, playerIdOverride) {
    if (isSaving) {
      return;
    }

    const reboundPlayerId = playerIdOverride || currentSideState.selectedPlayerId;
    if (!reboundPlayerId) {
      setError('Select a player first');
      return;
    }

    setError('');
    setIsSaving(true);

    try {
      const response = await gamesApi.appendEvent(
        gameId,
        buildEventPayload({
          playerId: reboundPlayerId,
          statType,
        })
      );
      updateData(response, STAT_LABELS[statType] || statType);
      clearEventPicker();
    } catch (submitError) {
      setError(submitError.message || 'Failed to add rebound event');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleFollowUpSelection(option) {
    if (!pendingFollowUpPrompt) {
      clearEventPicker();
      return;
    }

    if (option === 'NO_ASSIST') {
      clearEventPicker('Assist skipped');
      setError('');
      return;
    }

    setError('');
    setIsSaving(true);

    try {
      let payload;
      let label;

      if (option === 'OPP_REB') {
        payload = { statType: 'OPP_REB' };
        label = 'Opponent Rebound';
      } else if (isDualTeam && pendingFollowUpPrompt.kind === 'rebound') {
        const rebounderSide = playerSideMap.get(option) || activeSide;
        const isOffensive = rebounderSide === activeSide;
        const statType = isOffensive ? 'OREB' : 'DREB';
        payload = { playerId: option, statType, teamSide: rebounderSide };
        label = STAT_LABELS[statType] || statType;
      } else {
        payload = buildEventPayload({
          playerId: option,
          statType: pendingFollowUpPrompt.statType,
        });
        label = STAT_LABELS[pendingFollowUpPrompt.statType] || pendingFollowUpPrompt.statType;
      }

      const response = await gamesApi.appendEvent(gameId, payload);
      updateData(response, label);
      clearEventPicker();
    } catch (submitError) {
      setError(
        submitError.message ||
          (pendingFollowUpPrompt.kind === 'assist'
            ? 'Basket recorded, but failed to add assist'
            : 'Miss recorded, but failed to add rebound')
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function addShotEvent(outcome) {
    if (!requirePlayerSelection()) {
      return;
    }

    if (!selectedShot) {
      setError('Tap the court first to select a shot location');
      return;
    }

    setError('');
    setIsSaving(true);

    try {
      const payload = buildEventPayload({
        playerId: currentSideState.selectedPlayerId,
        statType: buildShotStatType(selectedShot.shotFamily, outcome),
        zoneId: selectedShot.zoneId,
        x: Number(selectedShot.x.toFixed(2)),
        y: Number(selectedShot.y.toFixed(2)),
      });

      const response = await gamesApi.appendEvent(gameId, payload);
      updateData(response, STAT_LABELS[payload.statType] || payload.statType);
      if (outcome === 'miss') {
        setPendingFollowUpPrompt({
          kind: 'rebound',
          statType: 'OREB',
          actorPlayerId: currentSideState.selectedPlayerId,
        });
      } else if (payload.statType === 'FG2_MADE' || payload.statType === 'FG3_MADE') {
        setPendingFollowUpPrompt({
          kind: 'assist',
          statType: 'AST',
          actorPlayerId: currentSideState.selectedPlayerId,
        });
      } else {
        clearEventPicker();
      }
    } catch (submitError) {
      setError(submitError.message || 'Failed to add shot event');
    } finally {
      setIsSaving(false);
    }
  }

  async function addFreeThrowEvent(outcome) {
    if (!requirePlayerSelection()) {
      return;
    }

    setError('');
    setIsSaving(true);

    try {
      const inferred = buildFreeThrowPayload(
        selectedShot?.nearestHoop || lastTappedHoop,
        outcome,
        DEFAULT_COURT_IMAGE_CALIBRATION
      );
      const payload = buildEventPayload({
        playerId: currentSideState.selectedPlayerId,
        statType: inferred.statType,
        zoneId: inferred.zoneId,
        x: inferred.x,
        y: inferred.y,
      });

      const response = await gamesApi.appendEvent(gameId, payload);
      updateData(response, STAT_LABELS[payload.statType] || payload.statType);
      if (outcome === 'miss' && !isDualTeam) {
        setPendingFollowUpPrompt({
          kind: 'rebound',
          statType: 'OREB',
          actorPlayerId: currentSideState.selectedPlayerId,
        });
      } else {
        clearEventPicker();
      }
    } catch (submitError) {
      setError(submitError.message || 'Failed to add free throw event');
    } finally {
      setIsSaving(false);
    }
  }

  async function removeEvent(eventId) {
    if (isSaving) {
      return;
    }

    setError('');
    setIsSaving(true);
    try {
      const response = await gamesApi.removeEvent(gameId, eventId);
      updateData(response, 'Event removed');
    } catch (removeError) {
      setError(removeError.message || 'Failed to remove event');
    } finally {
      setIsSaving(false);
    }
  }

  async function addQuickStatEvent(statType) {
    if (!requirePlayerSelection()) {
      return;
    }

    setError('');
    setIsSaving(true);

    try {
      const response = await gamesApi.appendEvent(
        gameId,
        buildEventPayload({
          playerId: currentSideState.selectedPlayerId,
          statType,
        })
      );
      updateData(response, STAT_LABELS[statType] || statType);
      clearEventPicker();
    } catch (submitError) {
      setError(submitError.message || 'Failed to add event');
    } finally {
      setIsSaving(false);
    }
  }

  async function addOpponentScore(statType) {
    if (isSaving) {
      return;
    }

    setError('');
    setIsSaving(true);

    try {
      const response = await gamesApi.appendEvent(gameId, { statType });
      updateData(response, STAT_LABELS[statType] || statType);
      clearEventPicker();
    } catch (submitError) {
      setError(submitError.message || 'Failed to add opponent score');
    } finally {
      setIsSaving(false);
    }
  }

  async function undoLastEvent() {
    if (isSaving) {
      return;
    }

    const lastEvent = data?.game?.events?.[data.game.events.length - 1];
    if (!lastEvent) {
      setError('No event to undo');
      return;
    }

    await removeEvent(lastEvent.id);
  }

  async function saveLineup() {
    if (isSaving) {
      return;
    }

    if (currentSideState.lineupDraft.length !== 5) {
      setError('Select exactly 5 players for the starting five');
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
      await gamesApi.appendEvent(gameId, {
        playerId: currentSideState.substitutionState.playerOutId,
        relatedPlayerId: currentSideState.substitutionState.playerInId,
        statType: 'SUB_OUT',
        ...commonPayload,
      });
      const subInResponse = await gamesApi.appendEvent(gameId, {
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
    } catch (saveError) {
      setError(saveError.message || 'Failed to save substitution');
    } finally {
      setIsSaving(false);
    }
  }

  async function finishGame() {
    setError('');
    setIsSaving(true);
    try {
      await gamesApi.finish(gameId);
      navigate(`/games/${gameId}`);
    } catch (finishError) {
      setError(finishError.message || 'Failed to finish game');
    } finally {
      setIsSaving(false);
    }
  }

  if (!data || !game || !boxScore) {
    return <SportsLoader label="Loading tracking session" fullPage />;
  }

  const gameSummary = data.gameSummary || {
    teamPoints: boxScore.teamTotals?.points || 0,
    opponentPoints: boxScore.opponentTotals?.points || 0,
  };
  const recentEvents = [...game.events].slice(-5).reverse();
  const visibleRecentEvents = showAllRecentEvents ? recentEvents : recentEvents.slice(0, 3);

  const followUpPlayers = pendingFollowUpPrompt
    ? pendingFollowUpPrompt.kind === 'assist'
      ? onCourtPlayers.filter((player) => player.id !== pendingFollowUpPrompt.actorPlayerId)
      : onCourtPlayers
    : onCourtPlayers;
  const eventPickerShellClass =
    'fixed inset-0 z-[60] flex items-stretch justify-center bg-slate-950/35 p-2 backdrop-blur-[1px] sm:p-3';
  const eventPickerPanelClass =
    'flex h-full min-h-0 w-full max-w-5xl rounded-2xl border border-slate-200 bg-white p-3 text-slate-900 shadow-2xl';
  const eventPickerBodyClass = 'flex h-full min-h-0 w-full flex-col';
  const eventPickerGridClass =
    'mt-3 grid min-h-0 flex-1 grid-rows-[minmax(0,1fr),auto] gap-3 landscape:grid-cols-[minmax(0,1fr),minmax(12rem,0.78fr)] landscape:grid-rows-none md:grid-cols-[minmax(0,1fr),minmax(13rem,0.8fr)]';
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
  const actionScrollerClass = 'min-h-0 overflow-y-auto landscape:flex-1 md:flex-1';
  const actionGridClass =
    'grid grid-cols-2 gap-2 landscape:grid-cols-1 landscape:gap-1.5 md:grid-cols-1';
  const actionGroupClass = 'min-w-0';
  const actionPairClass = 'grid grid-cols-2 gap-1.5';
  const actionTripleClass = 'grid grid-cols-3 gap-1.5';
  const actionButtonClass = (tone = 'slate') => {
    const tones = {
      make: 'bg-emerald-700 text-white hover:bg-emerald-600',
      miss: 'bg-rose-700 text-white hover:bg-rose-600',
      ft: 'bg-sky-700 text-white hover:bg-sky-600',
      rebound: 'bg-amber-600 text-white hover:bg-amber-500',
      defense: 'bg-indigo-700 text-white hover:bg-indigo-600',
      foul: 'bg-orange-700 text-white hover:bg-orange-600',
      opponent: 'bg-rose-800 text-white hover:bg-rose-700',
      slate: 'bg-slate-100 text-slate-800 hover:bg-slate-200',
    };

    return `w-full rounded-xl px-3 py-3 text-center text-base font-bold transition disabled:opacity-60 landscape:py-2 landscape:text-sm md:py-3 md:text-base ${tones[tone] || tones.slate}`;
  };

  const eventPicker = isEventPickerOpen ? (
    <div
      aria-modal="true"
      className={eventPickerShellClass}
      role="dialog"
      onClick={clearEventPicker}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div
        className={eventPickerPanelClass}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className={eventPickerBodyClass}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">Add Event</p>
              <p className="text-xs text-slate-600">
                {pendingFollowUpPrompt
                  ? pendingFollowUpPrompt.kind === 'assist'
                    ? 'Who assisted?'
                    : 'Who got the rebound?'
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

          <div className={eventPickerGridClass}>
            <div className="flex min-h-0 flex-col space-y-1 overflow-hidden">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {pendingFollowUpPrompt
                  ? pendingFollowUpPrompt.kind === 'assist'
                    ? 'Pick Assister'
                    : 'Pick Rebounder'
                  : 'Pick Player'}
              </p>
              <div className="min-h-0 overflow-y-auto pr-1">
                {isDualTeam && pendingFollowUpPrompt?.kind === 'rebound' ? (
                  <div className="space-y-3">
                    {[
                      {
                        side: activeSide,
                        label: participantsBySide[activeSide]?.displayName || activeSide,
                        reboundType: 'OREB',
                        players: onCourtPlayers,
                      },
                      {
                        side: otherSide,
                        label: participantsBySide[otherSide]?.displayName || otherSide,
                        reboundType: 'DREB',
                        players: otherTeamOnCourtPlayers,
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
                          No Assist
                        </button>
                      ) : !isDualTeam ? (
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
                        Dismiss
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
    <main className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{game.title}</p>
        {isDualTeam ? (
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="text-center">
              <p className="text-xs font-medium text-slate-500">
                {participantsBySide.home?.displayName || 'Home'}
              </p>
              <p className="text-3xl font-bold text-slate-900">{gameSummary.homePoints || 0}</p>
            </div>
            <span className="text-xl font-bold text-slate-300">—</span>
            <div className="text-center">
              <p className="text-xs font-medium text-slate-500">
                {participantsBySide.away?.displayName || 'Away'}
              </p>
              <p className="text-3xl font-bold text-slate-900">{gameSummary.awayPoints || 0}</p>
            </div>
          </div>
        ) : (
          <div className="mt-2 flex flex-wrap items-end gap-x-6 gap-y-2">
            <div className="flex items-end gap-4">
              <div>
                <p className="text-xs font-medium text-slate-500">{team?.name || 'Team'}</p>
                <p className="text-3xl font-bold text-slate-900">{gameSummary.teamPoints || 0}</p>
              </div>
              <span className="mb-1 text-xl font-bold text-slate-300">—</span>
              <div>
                <p className="text-xs font-medium text-slate-500">Opponent</p>
                <p className="text-3xl font-bold text-slate-900">
                  {gameSummary.opponentPoints || 0}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-slate-500">
              <span>
                REB <strong className="text-slate-700">{boxScore.teamTotals?.reb || 0}</strong>
              </span>
              <span>
                AST <strong className="text-slate-700">{boxScore.teamTotals?.ast || 0}</strong>
              </span>
              <span>
                FG2%{' '}
                <strong className="text-slate-700">
                  {formatPercentage(boxScore.teamTotals?.fg2m, boxScore.teamTotals?.fg2a)}
                </strong>
              </span>
              <span>
                FG3%{' '}
                <strong className="text-slate-700">
                  {formatThreePointPercentage(boxScore.teamTotals?.fg3m, boxScore.teamTotals?.fg3a)}
                </strong>
              </span>
            </div>
          </div>
        )}
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2 justify-between">
                {isDualTeam
                  ? [TEAM_SIDES.HOME, TEAM_SIDES.AWAY].map((side) => (
                      <button
                        key={side}
                        type="button"
                        onClick={() => changeActiveSide(side)}
                        className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                          activeSide === side
                            ? 'bg-slate-900 text-white'
                            : 'border border-slate-300 bg-white text-slate-800'
                        }`}
                      >
                        {participantsBySide[side]?.displayName || side}
                      </button>
                    ))
                  : null}
                <button
                  type="button"
                  onClick={openTrackingOverlay}
                  aria-label="Open fullscreen tracking"
                  className="rounded-lg border border-slate-300 bg-white p-1.5 text-slate-700 transition hover:bg-slate-50"
                >
                  <svg
                    viewBox="0 0 20 20"
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  >
                    <path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="relative mt-4">
              <InteractiveCourtImage
                onSelect={onCourtSelect}
                containerClassName="min-h-[26rem]"
                courtClassName="min-h-[22rem]"
              />
              {eventPicker}
            </div>

            {lastActionLabel ? (
              <div className="relative mt-4">
                <p className="text-sm font-medium text-emerald-700">{lastActionLabel}</p>
              </div>
            ) : null}
          </div>

          {lineupIds.length < 5 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Starting Lineup</h2>
                  <p className="text-sm text-slate-500">
                    {isDualTeam
                      ? `${participantsBySide[activeSide]?.displayName || activeSide} — `
                      : ''}
                    {currentSideState.lineupDraft.length} / 5 selected
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {isDualTeam
                    ? [TEAM_SIDES.HOME, TEAM_SIDES.AWAY].map((side) => (
                        <button
                          key={`lineup-${side}`}
                          type="button"
                          onClick={() => changeActiveSide(side)}
                          className={`rounded-lg px-3 py-2 text-sm font-semibold ${activeSide === side ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white text-slate-800'}`}
                        >
                          {participantsBySide[side]?.displayName || side}
                        </button>
                      ))
                    : null}
                  <button
                    type="button"
                    onClick={saveLineup}
                    disabled={isSaving || currentSideState.lineupDraft.length !== 5}
                    className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50"
                  >
                    {isSaving ? 'Saving...' : 'Save Lineup'}
                  </button>
                </div>
              </div>

              {players.length === 0 ? (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <p className="font-semibold">No players found on this roster.</p>
                  {teamId ? (
                    <Link to={`/teams/${teamId}/edit`} className="mt-1 inline-block underline">
                      Add players to this team
                    </Link>
                  ) : (
                    <p className="mt-1">Go to Teams to add players before tracking.</p>
                  )}
                </div>
              ) : (
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {players.map((player) => {
                    const checked = currentSideState.lineupDraft.includes(player.id);
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
                          className="shrink-0 accent-white"
                          checked={checked}
                          disabled={isInactive}
                          onChange={(event) => {
                            if (isInactive) return;
                            const nextDraft = event.target.checked
                              ? [...currentSideState.lineupDraft, player.id]
                              : currentSideState.lineupDraft.filter((id) => id !== player.id);
                            updateSideState(activeKey, { lineupDraft: nextDraft });
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
          ) : null}
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-900">Substitution</h2>
              {isDualTeam ? (
                <div className="flex flex-wrap items-center gap-2">
                  {[TEAM_SIDES.HOME, TEAM_SIDES.AWAY].map((side) => (
                    <button
                      key={`sub-${side}`}
                      type="button"
                      onClick={() => changeActiveSide(side)}
                      className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${activeSide === side ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white text-slate-800'}`}
                    >
                      {participantsBySide[side]?.displayName || side}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <label className="block">
                <span className="mb-1 block text-sm text-slate-700">Player Out</span>
                <select
                  className="w-full rounded border border-slate-300 px-3 py-2"
                  value={currentSideState.substitutionState.playerOutId}
                  onChange={(event) =>
                    updateSideState(activeKey, {
                      substitutionState: {
                        ...currentSideState.substitutionState,
                        playerOutId: event.target.value,
                      },
                    })
                  }
                >
                  <option value="">Select on-court player</option>
                  {onCourtPlayers.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.jerseyNumber != null ? `#${player.jerseyNumber} ` : ''}
                      {player.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm text-slate-700">Player In</span>
                <select
                  className="w-full rounded border border-slate-300 px-3 py-2"
                  value={currentSideState.substitutionState.playerInId}
                  onChange={(event) =>
                    updateSideState(activeKey, {
                      substitutionState: {
                        ...currentSideState.substitutionState,
                        playerInId: event.target.value,
                      },
                    })
                  }
                >
                  <option value="">Select bench player</option>
                  {benchPlayers.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.jerseyNumber != null ? `#${player.jerseyNumber} ` : ''}
                      {player.displayName}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={saveSubstitution}
                disabled={isSaving}
                className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50"
              >
                <svg
                  viewBox="0 0 20 20"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path d="M4 7h12M13 4l3 3-3 3" />
                  <path d="M16 13H4M7 10l-3 3 3 3" />
                </svg>
                Record Sub
              </button>
            </div>
          </div>

          {!isLeagueGame ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-slate-900">Player Selection</h2>
                {currentSideState.selectedPlayerId ? (
                  <span className="rounded-full bg-slate-900 px-2.5 py-0.5 text-xs font-semibold text-white">
                    {players.find((p) => p.id === currentSideState.selectedPlayerId)?.displayName ||
                      'Selected'}
                  </span>
                ) : null}
              </div>
              {lineupIds.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">Set and save a starting lineup first.</p>
              ) : (
                <div className="mt-3 space-y-1.5">
                  {onCourtPlayers.map((player) => (
                    <button
                      key={player.id}
                      type="button"
                      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left transition ${
                        currentSideState.selectedPlayerId === player.id
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
                      }`}
                      onClick={() => updateSideState(activeKey, { selectedPlayerId: player.id })}
                    >
                      {player.jerseyNumber != null ? (
                        <span className="w-6 shrink-0 text-center text-xs font-bold opacity-60">
                          {player.jerseyNumber}
                        </span>
                      ) : null}
                      <span className="font-medium">{player.displayName}</span>
                    </button>
                  ))}
                  {benchPlayers.filter((p) => p.isActive !== false).length > 0 ? (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-700">
                        Bench ({benchPlayers.filter((p) => p.isActive !== false).length})
                      </summary>
                      <div className="mt-1.5 space-y-1.5">
                        {benchPlayers
                          .filter((p) => p.isActive !== false)
                          .map((player) => (
                            <button
                              key={player.id}
                              type="button"
                              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left transition ${
                                currentSideState.selectedPlayerId === player.id
                                  ? 'bg-slate-900 text-white'
                                  : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                              }`}
                              onClick={() =>
                                updateSideState(activeKey, { selectedPlayerId: player.id })
                              }
                            >
                              {player.jerseyNumber != null ? (
                                <span className="w-6 shrink-0 text-center text-xs font-bold opacity-60">
                                  {player.jerseyNumber}
                                </span>
                              ) : null}
                              <span className="font-medium">{player.displayName}</span>
                            </button>
                          ))}
                      </div>
                    </details>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </section>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Recent Events</h2>
          <div className="mt-2 flex items-center gap-2">
            {recentEvents.length > 3 ? (
              <button
                type="button"
                onClick={() => setShowAllRecentEvents((value) => !value)}
                className="text-sm font-medium text-sky-700 hover:underline"
              >
                {showAllRecentEvents ? 'Show less' : 'Show all'}
              </button>
            ) : null}
            <button
              type="button"
              onClick={undoLastEvent}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-800"
            >
              Undo Last
            </button>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          {visibleRecentEvents.map((event) => (
            <div
              key={event.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2"
            >
              <div className="text-sm text-slate-800">
                {formatEventLabel(event, playersById, participantsBySide, isDualTeam)}
              </div>
              <button
                type="button"
                onClick={() => removeEvent(event.id)}
                className="text-xs font-semibold text-rose-700"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={finishGame}
          disabled={isSaving}
          className="rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60"
        >
          Finish Game
        </button>
      </div>

      {isTrackingFullscreen ? (
        <div
          className="fixed z-50 flex flex-col bg-white"
          style={{ top: 0, left: 0, right: 0, bottom: 0, margin: 0 }}
        >
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
                          ? 'bg-slate-900 text-white'
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
            />
            {eventPicker}
          </div>
        </div>
      ) : null}
    </main>
  );
}
