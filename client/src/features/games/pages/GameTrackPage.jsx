import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { gamesApi } from '../api/gamesApi';
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
  const [selectedShot, setSelectedShot] = useState(null);
  const [pendingFollowUpPrompt, setPendingFollowUpPrompt] = useState(null);
  const [lastTappedHoop, setLastTappedHoop] = useState('south');
  const [isSaving, setIsSaving] = useState(false);
  const [isTrackingFullscreen, setIsTrackingFullscreen] = useState(false);
  const [isLandscape, setIsLandscape] = useState(
    typeof window !== 'undefined' ? window.innerWidth > window.innerHeight : false
  );
  const [error, setError] = useState('');
  const [lastActionLabel, setLastActionLabel] = useState('');
  const [showAllRecentEvents, setShowAllRecentEvents] = useState(false);
  const [activeSide, setActiveSide] = useState(TEAM_SIDES.HOME);
  const [sideState, setSideState] = useState({
    [TEAM_SIDES.HOME]: createEmptySideState(),
    [TEAM_SIDES.AWAY]: createEmptySideState(),
    oneSided: createEmptySideState(),
  });

  useEffect(() => {
    gamesApi
      .getById(gameId)
      .then((response) => {
        setData(response);

        const isDualTeam = response.game?.trackingMode === 'dual_team';
        const nextState = {
          [TEAM_SIDES.HOME]: createEmptySideState(),
          [TEAM_SIDES.AWAY]: createEmptySideState(),
          oneSided: createEmptySideState(),
        };

        if (isDualTeam) {
          for (const side of [TEAM_SIDES.HOME, TEAM_SIDES.AWAY]) {
            const players = response.participants?.[side]?.players || [];
            const currentLineupIds = response.lineups?.[side]?.currentPlayerIds || [];
            nextState[side] = {
              lineupDraft: response.lineups?.[side]?.startingPlayerIds || currentLineupIds || [],
              selectedPlayerId: currentLineupIds[0] || players[0]?.id || '',
              substitutionState: { playerOutId: '', playerInId: '' },
            };
          }
          setActiveSide(response.game?.activeSideDefault || TEAM_SIDES.HOME);
        } else {
          const lineupIds = response.game?.currentLineupPlayerIds || [];
          const activePlayers = (response.team?.players || []).filter((player) => player.isActive);
          nextState.oneSided = {
            lineupDraft: response.game?.startingLineupPlayerIds || lineupIds || [],
            selectedPlayerId: lineupIds[0] || activePlayers[0]?.id || '',
            substitutionState: { playerOutId: '', playerInId: '' },
          };
        }

        setSideState(nextState);
      })
      .catch((loadError) => setError(loadError.message || 'Failed to load game'));
  }, [gameId]);

  useEffect(() => {
    function syncOrientation() {
      setIsLandscape(window.innerWidth > window.innerHeight);
    }

    syncOrientation();
    window.addEventListener('resize', syncOrientation);

    return () => {
      window.removeEventListener('resize', syncOrientation);
    };
  }, []);

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
  const participantsBySide = useMemo(() => data?.participants || {}, [data?.participants]);
  const activeKey = isDualTeam ? activeSide : 'oneSided';
  const currentSideState = sideState[activeKey] || createEmptySideState();
  const team = data?.team || null;
  const lineupIds = isDualTeam
    ? data?.lineups?.[activeSide]?.currentPlayerIds || []
    : data?.game?.currentLineupPlayerIds || [];
  const players = useMemo(() => {
    if (isDualTeam) {
      return (participantsBySide[activeSide]?.players || []).filter((player) => player.isActive);
    }
    return (team?.players || []).filter((player) => player.isActive);
  }, [activeSide, isDualTeam, participantsBySide, team]);
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
      const payload =
        option === 'OPP_REB'
          ? { statType: 'OPP_REB' }
          : buildEventPayload({
              playerId: option,
              statType: pendingFollowUpPrompt.statType,
            });
      const response = await gamesApi.appendEvent(gameId, payload);
      updateData(
        response,
        option === 'OPP_REB'
          ? 'Opponent Rebound'
          : STAT_LABELS[pendingFollowUpPrompt.statType] || pendingFollowUpPrompt.statType
      );
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
    return <p className="text-sm">Loading tracking session...</p>;
  }

  const gameSummary = data.gameSummary || {
    teamPoints: boxScore.teamTotals?.points || 0,
    opponentPoints: boxScore.opponentTotals?.points || 0,
  };
  const recentEvents = [...game.events].slice(-5).reverse();
  const visibleRecentEvents = showAllRecentEvents ? recentEvents : recentEvents.slice(0, 3);

  if (game.status === 'completed') {
    return (
      <section className="space-y-3">
        <p className="text-sm text-slate-700">This game is completed.</p>
        <button
          className="rounded border px-3 py-2 text-sm"
          onClick={() => navigate(`/games/${game.id}`)}
        >
          View Box Score
        </button>
      </section>
    );
  }

  const followUpPlayers = pendingFollowUpPrompt
    ? pendingFollowUpPrompt.kind === 'assist'
      ? onCourtPlayers.filter((player) => player.id !== pendingFollowUpPrompt.actorPlayerId)
      : onCourtPlayers
    : onCourtPlayers;

  const activeParticipant = isDualTeam ? participantsBySide[activeSide] : team;

  const eventPicker =
    selectedShot || pendingFollowUpPrompt ? (
      <>
        <button
          type="button"
          aria-label="Cancel event input"
          className="absolute inset-0 bg-slate-950/20"
          onClick={clearEventPicker}
        />
        <div className="absolute inset-0 flex items-center justify-center px-3 landscape:justify-end landscape:px-3 landscape:pr-4">
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-3 text-slate-900 shadow-lg landscape:w-[26rem] landscape:max-w-none landscape:-rotate-90 landscape:origin-center"
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div className="w-full min-h-[26rem] landscape:h-[19rem] landscape:min-h-0">
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

              <div className="mt-3 grid h-[18rem] grid-cols-[minmax(0,1fr),8.5rem] gap-3 landscape:h-[calc(100%-2.25rem)] landscape:grid-cols-[minmax(0,1fr),8.5rem]">
                <div className="flex min-h-0 flex-col space-y-1 overflow-hidden">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {pendingFollowUpPrompt
                      ? pendingFollowUpPrompt.kind === 'assist'
                        ? 'Pick Assister'
                        : 'Pick Rebounder'
                      : 'Pick Player'}
                  </p>
                  <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                    <div className="space-y-2">
                      {followUpPlayers.map((player) => (
                        <button
                          key={player.id}
                          type="button"
                          className={`flex min-h-11 w-full items-center justify-between rounded-lg px-3 py-3 text-left transition ${
                            currentSideState.selectedPlayerId === player.id
                              ? 'bg-slate-900 text-white'
                              : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
                          }`}
                          onClick={() =>
                            pendingFollowUpPrompt
                              ? handleFollowUpSelection(player.id)
                              : updateSideState(activeKey, { selectedPlayerId: player.id })
                          }
                        >
                          <span className="text-base font-semibold">{player.displayName}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex min-h-0 flex-col space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Action
                  </p>
                  <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                    <div className="grid gap-2 landscape:content-start">
                      {pendingFollowUpPrompt ? (
                        <>
                          {pendingFollowUpPrompt.kind === 'assist' ? (
                            <button
                              type="button"
                              className="min-h-11 rounded-lg bg-slate-100 px-3 py-3 text-left text-sm font-semibold text-slate-800 transition hover:bg-slate-200"
                              disabled={isSaving}
                              onClick={() => handleFollowUpSelection('NO_ASSIST')}
                            >
                              No Assist
                            </button>
                          ) : !isDualTeam ? (
                            <button
                              type="button"
                              className="min-h-11 rounded-lg bg-rose-100 px-3 py-3 text-left text-sm font-semibold text-rose-800 transition hover:bg-rose-200"
                              disabled={isSaving}
                              onClick={() => handleFollowUpSelection('OPP_REB')}
                            >
                              Opponent Rebound
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-3 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                            disabled={isSaving}
                            onClick={() => clearEventPicker()}
                          >
                            Dismiss Prompt
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60"
                            disabled={isSaving}
                            onClick={() => addShotEvent('made')}
                          >
                            Make
                          </button>
                          <button
                            type="button"
                            className="rounded-lg bg-slate-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-600 disabled:opacity-60"
                            disabled={isSaving}
                            onClick={() => addShotEvent('miss')}
                          >
                            Miss
                          </button>
                          <button
                            type="button"
                            className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-60"
                            disabled={isSaving}
                            onClick={() => addFreeThrowEvent('made')}
                          >
                            FT+
                          </button>
                          <button
                            type="button"
                            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60"
                            disabled={isSaving}
                            onClick={() => addFreeThrowEvent('miss')}
                          >
                            FT-
                          </button>
                          <button
                            type="button"
                            className="rounded-lg bg-amber-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:opacity-60"
                            disabled={isSaving}
                            onClick={() => addReboundEvent('DREB')}
                          >
                            DREB
                          </button>
                          <button
                            type="button"
                            className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60"
                            disabled={isSaving}
                            onClick={() => addQuickStatEvent('STL')}
                          >
                            STL
                          </button>
                          <button
                            type="button"
                            className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60"
                            disabled={isSaving}
                            onClick={() => addQuickStatEvent('TOV')}
                          >
                            TOV
                          </button>
                          <button
                            type="button"
                            className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60"
                            disabled={isSaving}
                            onClick={() => addQuickStatEvent('FOUL')}
                          >
                            FOUL
                          </button>
                          {!isDualTeam ? (
                            <>
                              <button
                                type="button"
                                className="rounded-lg bg-rose-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-rose-600 disabled:opacity-60"
                                disabled={isSaving}
                                onClick={() => addOpponentScore('OPP_FT_MADE')}
                              >
                                Opp +1
                              </button>
                              <button
                                type="button"
                                className="rounded-lg bg-rose-800 px-3 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-60"
                                disabled={isSaving}
                                onClick={() => addOpponentScore('OPP_FG2_MADE')}
                              >
                                Opp +2
                              </button>
                              <button
                                type="button"
                                className="rounded-lg bg-rose-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-rose-800 disabled:opacity-60"
                                disabled={isSaving}
                                onClick={() => addOpponentScore('OPP_FG3_MADE')}
                              >
                                Opp +3
                              </button>
                            </>
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
      </>
    ) : null;

  const boxScoreTotals = isDualTeam
    ? {
        home: boxScore.home?.totals,
        away: boxScore.away?.totals,
      }
    : null;

  return (
    <main className="space-y-6">
      <section className="rounded-3xl bg-gradient-to-r from-amber-50 via-white to-sky-50 p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 md:text-4xl">{game.title}</h1>
            {isDualTeam ? (
              <div className="mt-3 space-y-1 text-sm text-slate-700">
                <p>
                  {participantsBySide.home?.displayName || 'Home'} {gameSummary.homePoints || 0} -{' '}
                  {gameSummary.awayPoints || 0} {participantsBySide.away?.displayName || 'Away'}
                </p>
                <p>Active side: {activeParticipant?.displayName || activeSide}</p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-700">
                {team?.name || 'Team'} {gameSummary.teamPoints || 0} -{' '}
                {gameSummary.opponentPoints || 0} Opponent
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={finishGame}
              disabled={isSaving}
              className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white"
            >
              Finish Game
            </button>
          </div>
        </div>
        {isDualTeam ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {[TEAM_SIDES.HOME, TEAM_SIDES.AWAY].map((side) => (
              <button
                key={side}
                type="button"
                onClick={() => setActiveSide(side)}
                className={`rounded-lg px-4 py-2 text-sm font-semibold ${
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
      </section>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {lastActionLabel ? (
        <p className="text-sm font-medium text-emerald-700">{lastActionLabel}</p>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Tracking Surface</h2>
                <p className="text-sm text-slate-600">
                  {activeParticipant?.displayName || 'Team'} offense and stat capture
                </p>
              </div>
              <button
                type="button"
                onClick={openTrackingOverlay}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800"
              >
                Fullscreen
              </button>
            </div>
            <div className="mt-4">
              <InteractiveCourtImage
                onSelect={onCourtSelect}
                containerClassName="min-h-[26rem]"
                courtClassName="min-h-[22rem]"
              />
            </div>
            {eventPicker}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900">Lineup</h2>
              <button
                type="button"
                onClick={saveLineup}
                disabled={isSaving}
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
              >
                Save Starting Five
              </button>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {players.map((player) => {
                const checked = currentSideState.lineupDraft.includes(player.id);
                return (
                  <label
                    key={player.id}
                    className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => {
                        const nextDraft = event.target.checked
                          ? [...currentSideState.lineupDraft, player.id]
                          : currentSideState.lineupDraft.filter((id) => id !== player.id);
                        updateSideState(activeKey, { lineupDraft: nextDraft });
                      }}
                    />
                    <span className="text-sm font-medium text-slate-900">{player.displayName}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900">Substitution</h2>
              <button
                type="button"
                onClick={saveSubstitution}
                disabled={isSaving}
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
              >
                Record Sub
              </button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
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
                      {player.displayName}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Player Selection</h2>
            <div className="mt-4 space-y-2">
              {players.map((player) => (
                <button
                  key={player.id}
                  type="button"
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left ${
                    currentSideState.selectedPlayerId === player.id
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-800'
                  }`}
                  onClick={() => updateSideState(activeKey, { selectedPlayerId: player.id })}
                >
                  <span className="font-medium">{player.displayName}</span>
                  {lineupIds.includes(player.id) ? <span className="text-xs">On court</span> : null}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Quick Actions</h2>
              <button
                type="button"
                onClick={undoLastEvent}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800"
              >
                Undo Last
              </button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => addQuickStatEvent('STL')}
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
              >
                STL
              </button>
              <button
                type="button"
                onClick={() => addQuickStatEvent('TOV')}
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
              >
                TOV
              </button>
              <button
                type="button"
                onClick={() => addQuickStatEvent('FOUL')}
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
              >
                FOUL
              </button>
              <button
                type="button"
                onClick={() => addReboundEvent('DREB')}
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
              >
                DREB
              </button>
              {!isDualTeam ? (
                <>
                  <button
                    type="button"
                    onClick={() => addOpponentScore('OPP_FT_MADE')}
                    className="rounded-lg bg-rose-700 px-3 py-2 text-sm font-semibold text-white"
                  >
                    Opp +1
                  </button>
                  <button
                    type="button"
                    onClick={() => addOpponentScore('OPP_FG2_MADE')}
                    className="rounded-lg bg-rose-800 px-3 py-2 text-sm font-semibold text-white"
                  >
                    Opp +2
                  </button>
                  <button
                    type="button"
                    onClick={() => addOpponentScore('OPP_FG3_MADE')}
                    className="rounded-lg bg-rose-900 px-3 py-2 text-sm font-semibold text-white"
                  >
                    Opp +3
                  </button>
                </>
              ) : (
                <div className="col-span-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  Switch sides to record stats for the other team.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900">Recent Events</h2>
              {recentEvents.length > 3 ? (
                <button
                  type="button"
                  onClick={() => setShowAllRecentEvents((value) => !value)}
                  className="text-sm font-medium text-sky-700 hover:underline"
                >
                  {showAllRecentEvents ? 'Show less' : 'Show all'}
                </button>
              ) : null}
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

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Live Box Score</h2>
            {isDualTeam ? (
              <div className="mt-4 grid gap-4">
                {[TEAM_SIDES.HOME, TEAM_SIDES.AWAY].map((side) => (
                  <div key={side} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-semibold text-slate-900">
                        {participantsBySide[side]?.displayName || side}
                      </span>
                      <span className="text-slate-600">
                        {boxScoreTotals?.[side]?.points || 0} PTS
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 space-y-2 text-sm text-slate-700">
                <p>PTS: {boxScore.teamTotals?.points || 0}</p>
                <p>REB: {boxScore.teamTotals?.reb || 0}</p>
                <p>AST: {boxScore.teamTotals?.ast || 0}</p>
                <p>
                  FG2%: {formatPercentage(boxScore.teamTotals?.fg2m, boxScore.teamTotals?.fg2a)}
                </p>
                <p>
                  FG3%:{' '}
                  {formatThreePointPercentage(boxScore.teamTotals?.fg3m, boxScore.teamTotals?.fg3a)}
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {isTrackingFullscreen ? (
        <div className="fixed inset-0 z-50 bg-black/50 p-4">
          <div className="mx-auto flex h-full max-w-6xl flex-col rounded-3xl bg-white p-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Fullscreen Tracking</h2>
              <button
                type="button"
                onClick={closeTrackingOverlay}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800"
              >
                Close
              </button>
            </div>
            <div className={`min-h-0 flex-1 ${isLandscape ? 'h-[calc(100%-3.5rem)]' : ''}`}>
              <InteractiveCourtImage
                onSelect={onCourtSelect}
                containerClassName="h-full min-h-[28rem]"
                courtClassName="h-full min-h-[24rem]"
              />
            </div>
            {eventPicker}
          </div>
        </div>
      ) : null}
    </main>
  );
}
