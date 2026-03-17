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

const { STAT_LABELS, ZONE_LABELS } = gameConstants;

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

function formatEventLabel(event, playersById) {
  const player = event.playerId ? playersById.get(event.playerId) : null;
  const playerName = event.playerId ? player?.displayName || 'Unknown' : 'Opponent';
  const statLabel = STAT_LABELS[event.statType] || event.statType;
  return `${playerName} - ${statLabel}${formatEventMeta(event)}`;
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

export function GameTrackPage() {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
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

  useEffect(() => {
    gamesApi
      .getById(gameId)
      .then((response) => {
        setData(response);
        const activePlayers = (response.team?.players || []).filter((player) => player.isActive);
        if (activePlayers.length > 0) {
          setSelectedPlayerId(activePlayers[0].id);
        }
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

  const players = useMemo(
    () => (data?.team?.players || []).filter((player) => player.isActive),
    [data]
  );

  const playersById = useMemo(
    () => new Map((data?.team?.players || []).map((player) => [player.id, player])),
    [data]
  );

  function requirePlayerSelection() {
    if (!selectedPlayerId) {
      setError('Select a player first');
      return false;
    }

    return true;
  }

  function onCourtSelect(point) {
    const inferred = inferCourtSelection(point.x, point.y, DEFAULT_COURT_IMAGE_CALIBRATION);
    setSelectedShot(inferred);
    setPendingFollowUpPrompt(null);
    setLastTappedHoop(inferred.nearestHoop);
    setError('');
  }

  function openTrackingOverlay() {
    setError('');
    setIsTrackingFullscreen(true);
  }

  function closeTrackingOverlay() {
    setSelectedShot(null);
    setPendingFollowUpPrompt(null);
    setIsTrackingFullscreen(false);
  }

  function clearEventPicker() {
    setSelectedShot(null);
    setPendingFollowUpPrompt(null);
  }

  async function addReboundEvent(statType, playerIdOverride) {
    const reboundPlayerId = playerIdOverride || selectedPlayerId;
    if (!reboundPlayerId) {
      setError('Select a player first');
      return;
    }

    setError('');
    setIsSaving(true);

    try {
      const response = await gamesApi.appendEvent(gameId, {
        playerId: reboundPlayerId,
        statType,
      });
      setData((current) => ({ ...current, ...response }));
      setLastActionLabel(STAT_LABELS[statType] || statType);
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

    if (option === 'NO_REBOUND') {
      clearEventPicker();
      setError('');
      return;
    }

    if (option === 'NO_ASSIST') {
      clearEventPicker();
      setError('');
      return;
    }

    setError('');
    setIsSaving(true);

    try {
      const response = await gamesApi.appendEvent(gameId, {
        playerId: option,
        statType: pendingFollowUpPrompt.statType,
      });
      setData((current) => ({ ...current, ...response }));
      setLastActionLabel(
        STAT_LABELS[pendingFollowUpPrompt.statType] || pendingFollowUpPrompt.statType
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
      const payload = {
        playerId: selectedPlayerId,
        statType: buildShotStatType(selectedShot.shotFamily, outcome),
        zoneId: selectedShot.zoneId,
        x: Number(selectedShot.x.toFixed(2)),
        y: Number(selectedShot.y.toFixed(2)),
      };

      const response = await gamesApi.appendEvent(gameId, payload);
      setData((current) => ({ ...current, ...response }));
      setLastActionLabel(STAT_LABELS[payload.statType] || payload.statType);
      if (outcome === 'miss') {
        setPendingFollowUpPrompt({
          kind: 'rebound',
          statType: 'OREB',
          actorPlayerId: selectedPlayerId,
        });
      } else {
        const shouldPromptAssist =
          payload.statType === 'FG2_MADE' || payload.statType === 'FG3_MADE';
        if (shouldPromptAssist) {
          setPendingFollowUpPrompt({
            kind: 'assist',
            statType: 'AST',
            actorPlayerId: selectedPlayerId,
          });
        } else {
          clearEventPicker();
        }
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
      const payload = {
        playerId: selectedPlayerId,
        statType: inferred.statType,
        zoneId: inferred.zoneId,
        x: inferred.x,
        y: inferred.y,
      };

      const response = await gamesApi.appendEvent(gameId, payload);
      setData((current) => ({ ...current, ...response }));
      setLastActionLabel(STAT_LABELS[payload.statType] || payload.statType);
      if (outcome === 'miss') {
        setPendingFollowUpPrompt({
          kind: 'rebound',
          statType: 'OREB',
          actorPlayerId: selectedPlayerId,
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
    setError('');
    try {
      const response = await gamesApi.removeEvent(gameId, eventId);
      setData((current) => ({ ...current, ...response }));
      setLastActionLabel('Event removed');
    } catch (removeError) {
      setError(removeError.message || 'Failed to remove event');
    }
  }

  async function addQuickStatEvent(statType) {
    if (!requirePlayerSelection()) {
      return;
    }

    setError('');
    setIsSaving(true);

    try {
      const response = await gamesApi.appendEvent(gameId, {
        playerId: selectedPlayerId,
        statType,
      });
      setData((current) => ({ ...current, ...response }));
      setLastActionLabel(STAT_LABELS[statType] || statType);
    } catch (submitError) {
      setError(submitError.message || 'Failed to add event');
    } finally {
      setIsSaving(false);
    }
  }

  async function addOpponentScore(statType) {
    setError('');
    setIsSaving(true);

    try {
      const response = await gamesApi.appendEvent(gameId, { statType });
      setData((current) => ({ ...current, ...response }));
      setLastActionLabel(STAT_LABELS[statType] || statType);
    } catch (submitError) {
      setError(submitError.message || 'Failed to add opponent score');
    } finally {
      setIsSaving(false);
    }
  }

  async function undoLastEvent() {
    const lastEvent = data?.game?.events?.[data.game.events.length - 1];
    if (!lastEvent) {
      setError('No event to undo');
      return;
    }

    await removeEvent(lastEvent.id);
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

  if (!data) {
    return <p className="text-sm">Loading tracking session...</p>;
  }

  const { game, boxScore } = data;
  const scoreSummary = data.gameSummary || {
    teamPoints: boxScore.teamTotals.points,
    opponentPoints: boxScore.opponentTotals?.points || 0,
  };
  const recentEvents = [...game.events].slice(-5).reverse();

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
      ? players.filter((player) => player.id !== pendingFollowUpPrompt.actorPlayerId)
      : players
    : players;

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
            className="w-full rounded-2xl border border-slate-200 bg-white p-3 text-slate-900 shadow-lg landscape:w-[26rem] landscape:-rotate-90 landscape:origin-center"
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div className="w-full landscape:h-[19rem]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Add Event</p>
                  <p className="text-xs text-slate-600">
                    {pendingFollowUpPrompt
                      ? pendingFollowUpPrompt.kind === 'assist'
                        ? 'Who got the assist?'
                        : 'Who got the rebound?'
                      : `${ZONE_LABELS[selectedShot.zoneId] || selectedShot.zoneId} • ${selectedShot.shotFamily}`}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Close event picker"
                  className="rounded-md border border-slate-300 p-1 text-slate-600 transition hover:bg-slate-50"
                  onClick={clearEventPicker}
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

              <div className="mt-3 grid grid-cols-[minmax(0,1fr),auto] gap-3 landscape:grid-cols-[minmax(0,1fr),7rem] landscape:h-[calc(100%-2.25rem)]">
                <div className="space-y-1 overflow-hidden">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {pendingFollowUpPrompt
                      ? pendingFollowUpPrompt.kind === 'assist'
                        ? 'Assister'
                        : 'Rebounder'
                      : 'Player'}
                  </p>
                  <div className="max-h-36 overflow-y-auto pr-1 landscape:h-[calc(100%-1.25rem)] landscape:max-h-none">
                    <div className="space-y-1">
                      {followUpPlayers.map((player) => (
                        <button
                          key={player.id}
                          type="button"
                          className={`flex min-h-10 w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
                            selectedPlayerId === player.id
                              ? 'bg-slate-900 text-white'
                              : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
                          }`}
                          onClick={() =>
                            pendingFollowUpPrompt
                              ? handleFollowUpSelection(player.id)
                              : setSelectedPlayerId(player.id)
                          }
                        >
                          <span>{player.displayName}</span>
                          {!pendingFollowUpPrompt && selectedPlayerId === player.id ? (
                            <svg
                              viewBox="0 0 20 20"
                              className="h-4 w-4"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                            >
                              <path d="M4.5 10.5 8 14l7.5-8" />
                            </svg>
                          ) : null}
                        </button>
                      ))}
                      {pendingFollowUpPrompt ? (
                        <>
                          <button
                            type="button"
                            className="flex min-h-10 w-full items-center rounded-lg bg-slate-100 px-3 py-2 text-left text-sm text-slate-800 transition hover:bg-slate-200"
                            disabled={isSaving}
                            onClick={() =>
                              handleFollowUpSelection(
                                pendingFollowUpPrompt.kind === 'assist' ? 'NO_ASSIST' : 'NO_REBOUND'
                              )
                            }
                          >
                            {pendingFollowUpPrompt.kind === 'assist' ? 'No Assist' : 'No Rebound'}
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Action
                  </p>
                  <div className="grid gap-1 landscape:content-start">
                    {pendingFollowUpPrompt ? (
                      <div className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">
                        {pendingFollowUpPrompt.kind === 'assist' ? (
                          <>
                            Select a teammate or <span className="font-medium">No Assist</span>.
                          </>
                        ) : (
                          <>
                            Select a player or <span className="font-medium">No Rebound</span>.
                          </>
                        )}
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          aria-label="Shot Make"
                          className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60"
                          disabled={isSaving}
                          onClick={() => addShotEvent('made')}
                        >
                          Make
                        </button>
                        <button
                          type="button"
                          aria-label="Shot Miss"
                          className="rounded-lg bg-slate-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-600 disabled:opacity-60"
                          disabled={isSaving}
                          onClick={() => addShotEvent('miss')}
                        >
                          Miss
                        </button>
                        <button
                          type="button"
                          aria-label="FT Make"
                          className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-60"
                          disabled={isSaving}
                          onClick={() => addFreeThrowEvent('made')}
                        >
                          FT+
                        </button>
                        <button
                          type="button"
                          aria-label="FT Miss"
                          className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60"
                          disabled={isSaving}
                          onClick={() => addFreeThrowEvent('miss')}
                        >
                          FT-
                        </button>
                        <button
                          type="button"
                          aria-label="Defensive Rebound"
                          className="rounded-lg bg-amber-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:opacity-60"
                          disabled={isSaving}
                          onClick={() => addReboundEvent('DREB')}
                        >
                          DREB
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </>
    ) : null;

  const trackingOverlay = isTrackingFullscreen ? (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm">
      <div className="flex h-[100dvh] flex-col overflow-hidden text-white">
        <button
          type="button"
          aria-label="Close full screen tracking"
          className="absolute right-3 top-3 z-20 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-900 shadow-lg transition hover:bg-slate-100 md:right-5 md:top-5"
          onClick={closeTrackingOverlay}
        >
          <svg
            viewBox="0 0 20 20"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path d="m5 5 10 10" />
            <path d="M15 5 5 15" />
          </svg>
        </button>

        <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
          <div className="relative h-full w-full overflow-hidden">
            <InteractiveCourtImage
              selectedPoint={selectedShot}
              onSelect={onCourtSelect}
              calibration={DEFAULT_COURT_IMAGE_CALIBRATION}
              containerClassName="rounded-none border-0 bg-transparent p-0"
              courtClassName="h-full"
              helperText=""
              rotate90={isLandscape}
            >
              {eventPicker}
            </InteractiveCourtImage>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      {trackingOverlay}
      <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-4 rounded border bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Game Tracking
              </p>
              <h1 className="mt-1 text-lg font-semibold text-slate-900">Track {game.title}</h1>
            </div>
            <button
              type="button"
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
              onClick={openTrackingOverlay}
            >
              Open Full Screen Tracking
            </button>
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {lastActionLabel ? (
            <p className="text-sm text-emerald-700">Last action: {lastActionLabel}</p>
          ) : null}

          <div className="rounded border border-slate-200 bg-slate-50 p-3 text-sm">
            <p className="font-semibold">Tracking Flow</p>
            <p className="mt-1 text-slate-600">
              Open full screen tracking to use the court in portrait or landscape and record events
              with the on-court picker.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 disabled:opacity-60"
              disabled={isSaving}
              onClick={undoLastEvent}
            >
              Undo Last
            </button>
            <button
              type="button"
              className="rounded bg-emerald-800 px-4 py-2 text-white disabled:opacity-60"
              disabled={isSaving}
              onClick={finishGame}
            >
              Finish Game
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded border border-slate-200 bg-slate-50 p-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Live Score
              </p>
              <div className="mt-2 flex items-end justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">{data.team?.name || 'Team'}</p>
                  <p className="text-3xl font-bold text-slate-900">{scoreSummary.teamPoints}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-slate-900">{game.opponent || 'Opponent'}</p>
                  <p className="text-3xl font-bold text-slate-900">{scoreSummary.opponentPoints}</p>
                </div>
              </div>
            </div>

            <div className="rounded border border-slate-200 bg-slate-50 p-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Opponent Quick Score
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded bg-rose-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  disabled={isSaving}
                  onClick={() => addOpponentScore('OPP_FT_MADE')}
                >
                  Opponent +1
                </button>
                <button
                  type="button"
                  className="rounded bg-rose-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  disabled={isSaving}
                  onClick={() => addOpponentScore('OPP_FG2_MADE')}
                >
                  Opponent +2
                </button>
                <button
                  type="button"
                  className="rounded bg-rose-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  disabled={isSaving}
                  onClick={() => addOpponentScore('OPP_FG3_MADE')}
                >
                  Opponent +3
                </button>
              </div>
            </div>
          </div>

          <div className="rounded border border-slate-200 bg-slate-50 p-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Quick Player Stats
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded bg-slate-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                disabled={isSaving}
                onClick={() => addQuickStatEvent('STL')}
              >
                STL
              </button>
              <button
                type="button"
                className="rounded bg-slate-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                disabled={isSaving}
                onClick={() => addQuickStatEvent('TOV')}
              >
                TOV
              </button>
              <button
                type="button"
                className="rounded bg-slate-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                disabled={isSaving}
                onClick={() => addQuickStatEvent('FOUL')}
              >
                FOUL
              </button>
            </div>
          </div>
        </div>

        <div className="min-w-0 space-y-4">
          <div className="min-w-0 rounded border bg-white p-4">
            <h2 className="mb-2 text-lg font-semibold">Live Box Score</h2>
            <div className="max-w-full overflow-x-auto">
              <table className="w-max min-w-[980px] text-sm">
                <thead className="bg-slate-100 text-slate-600">
                  <tr>
                    <th className="sticky left-0 z-10 bg-slate-100 px-3 py-2 text-left">Player</th>
                    <th className="px-3 py-2 text-right">PTS</th>
                    <th className="px-3 py-2 text-right">REB</th>
                    <th className="px-3 py-2 text-right">AST</th>
                    <th className="px-3 py-2 text-right">STL</th>
                    <th className="px-3 py-2 text-right">TOV</th>
                    <th className="px-3 py-2 text-right">FOUL</th>
                    <th className="px-3 py-2 text-right">2PT FG</th>
                    <th className="px-3 py-2 text-right">2PT FG%</th>
                    <th className="px-3 py-2 text-right">3PT FG</th>
                    <th className="px-3 py-2 text-right">3PT %</th>
                    <th className="px-3 py-2 text-right">Free Throw</th>
                    <th className="px-3 py-2 text-right">OREB</th>
                    <th className="px-3 py-2 text-right">DREB</th>
                  </tr>
                </thead>
                <tbody>
                  {boxScore.players.map((row) => (
                    <tr key={row.playerId} className="border-t">
                      <td className="sticky left-0 bg-white px-3 py-2">{row.displayName}</td>
                      <td className="px-3 py-2 text-right">{row.points}</td>
                      <td className="px-3 py-2 text-right">{row.reb}</td>
                      <td className="px-3 py-2 text-right">{row.ast}</td>
                      <td className="px-3 py-2 text-right">{row.stl}</td>
                      <td className="px-3 py-2 text-right">{row.tov}</td>
                      <td className="px-3 py-2 text-right">{row.foul}</td>
                      <td className="px-3 py-2 text-right">
                        {row.fg2m}/{row.fg2a}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatPercentage(row.fg2m, row.fg2a)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {row.fg3m}/{row.fg3a}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatThreePointPercentage(row.fg3m, row.fg3a)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {row.ftm}/{row.fta}
                      </td>
                      <td className="px-3 py-2 text-right">{row.oreb}</td>
                      <td className="px-3 py-2 text-right">{row.dreb}</td>
                    </tr>
                  ))}
                  <tr className="border-t bg-slate-50 font-semibold">
                    <td className="sticky left-0 bg-slate-50 px-3 py-2">Team Total</td>
                    <td className="px-3 py-2 text-right">{boxScore.teamTotals.points}</td>
                    <td className="px-3 py-2 text-right">{boxScore.teamTotals.reb}</td>
                    <td className="px-3 py-2 text-right">{boxScore.teamTotals.ast}</td>
                    <td className="px-3 py-2 text-right">{boxScore.teamTotals.stl}</td>
                    <td className="px-3 py-2 text-right">{boxScore.teamTotals.tov}</td>
                    <td className="px-3 py-2 text-right">{boxScore.teamTotals.foul}</td>
                    <td className="px-3 py-2 text-right">
                      {boxScore.teamTotals.fg2m}/{boxScore.teamTotals.fg2a}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {formatPercentage(boxScore.teamTotals.fg2m, boxScore.teamTotals.fg2a)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {boxScore.teamTotals.fg3m}/{boxScore.teamTotals.fg3a}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {formatThreePointPercentage(
                        boxScore.teamTotals.fg3m,
                        boxScore.teamTotals.fg3a
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {boxScore.teamTotals.ftm}/{boxScore.teamTotals.fta}
                    </td>
                    <td className="px-3 py-2 text-right">{boxScore.teamTotals.oreb}</td>
                    <td className="px-3 py-2 text-right">{boxScore.teamTotals.dreb}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded border bg-white p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Recent Events</h2>
              <p className="text-xs text-slate-500">{game.events.length} total</p>
            </div>
            {game.events.length === 0 ? (
              <p className="text-sm text-slate-600">No events yet.</p>
            ) : null}
            <ul className="space-y-2 text-sm">
              {recentEvents.map((event) => (
                <li
                  key={event.id}
                  className="flex items-center justify-between gap-2 rounded border p-2"
                >
                  <span>{formatEventLabel(event, playersById)}</span>
                  <button
                    type="button"
                    className="text-xs text-red-600 hover:underline"
                    onClick={() => removeEvent(event.id)}
                  >
                    Undo
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </>
  );
}
