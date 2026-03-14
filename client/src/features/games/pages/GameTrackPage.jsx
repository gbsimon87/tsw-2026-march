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

function formatEventLabel(event, playersById) {
  const player = playersById.get(event.playerId);
  const playerName = player?.displayName || 'Unknown';
  const statLabel = STAT_LABELS[event.statType] || event.statType;
  const zoneLabel = ZONE_LABELS[event.zoneId] || event.zoneId;
  const x = typeof event.x === 'number' ? event.x.toFixed(1) : '?';
  const y = typeof event.y === 'number' ? event.y.toFixed(1) : '?';
  return `${playerName} - ${statLabel} @ ${zoneLabel} (${x}, ${y})`;
}

export function GameTrackPage() {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [selectedShot, setSelectedShot] = useState(null);
  const [lastTappedHoop, setLastTappedHoop] = useState('south');
  const [isSaving, setIsSaving] = useState(false);
  const [isTrackingFullscreen, setIsTrackingFullscreen] = useState(false);
  const [isLandscape, setIsLandscape] = useState(
    typeof window !== 'undefined' ? window.innerWidth > window.innerHeight : false
  );
  const [error, setError] = useState('');

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
    setLastTappedHoop(inferred.nearestHoop);
    setError('');
  }

  function openTrackingOverlay() {
    setError('');
    setIsTrackingFullscreen(true);
  }

  function closeTrackingOverlay() {
    setSelectedShot(null);
    setIsTrackingFullscreen(false);
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
      setSelectedShot(null);
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
      setSelectedShot(null);
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
    } catch (removeError) {
      setError(removeError.message || 'Failed to remove event');
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

  if (!data) {
    return <p className="text-sm">Loading tracking session...</p>;
  }

  const { game, boxScore } = data;

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

  const eventPicker = selectedShot ? (
    <>
      <button
        type="button"
        aria-label="Cancel event input"
        className="absolute inset-0 bg-slate-950/20"
        onClick={() => setSelectedShot(null)}
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
                  {ZONE_LABELS[selectedShot.zoneId] || selectedShot.zoneId} •{' '}
                  {selectedShot.shotFamily}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close event picker"
                className="rounded-md border border-slate-300 p-1 text-slate-600 transition hover:bg-slate-50"
                onClick={() => setSelectedShot(null)}
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
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Player
                </p>
                <div className="max-h-36 overflow-y-auto pr-1 landscape:h-[calc(100%-1.25rem)] landscape:max-h-none">
                  <div className="space-y-1">
                    {players.map((player) => (
                      <button
                        key={player.id}
                        type="button"
                        className={`flex min-h-10 w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
                          selectedPlayerId === player.id
                            ? 'bg-slate-900 text-white'
                            : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
                        }`}
                        onClick={() => setSelectedPlayerId(player.id)}
                      >
                        <span>{player.displayName}</span>
                        {selectedPlayerId === player.id ? (
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
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Action
                </p>
                <div className="grid gap-1 landscape:content-start">
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
              className="rounded bg-emerald-800 px-4 py-2 text-white disabled:opacity-60"
              disabled={isSaving}
              onClick={finishGame}
            >
              Finish Game
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded border bg-white p-4">
            <h2 className="mb-2 text-lg font-semibold">Live Box Score</h2>
            <ul className="space-y-1 text-sm">
              {boxScore.players.map((row) => (
                <li key={row.playerId} className="flex items-center justify-between">
                  <span>{row.displayName}</span>
                  <span>{row.points} pts</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-sm font-semibold">Team Points: {boxScore.teamTotals.points}</p>
          </div>

          <div className="rounded border bg-white p-4">
            <h2 className="mb-2 text-lg font-semibold">Event Log</h2>
            {game.events.length === 0 ? (
              <p className="text-sm text-slate-600">No events yet.</p>
            ) : null}
            <ul className="space-y-2 text-sm">
              {[...game.events].reverse().map((event) => (
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
