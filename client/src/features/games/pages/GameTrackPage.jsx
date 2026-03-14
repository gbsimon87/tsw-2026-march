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
        lastTappedHoop,
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

  return (
    <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
      <div className="space-y-4 rounded border bg-white p-4">
        <h1 className="text-2xl font-bold">Track Game: {game.title}</h1>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <label className="block">
          <span className="mb-1 block text-sm">Player</span>
          <select
            value={selectedPlayerId}
            onChange={(event) => setSelectedPlayerId(event.target.value)}
            className="w-full rounded border px-3 py-2"
          >
            {players.map((player) => (
              <option key={player.id} value={player.id}>
                {player.displayName}
              </option>
            ))}
          </select>
        </label>

        <InteractiveCourtImage
          selectedPoint={selectedShot}
          onSelect={onCourtSelect}
          calibration={DEFAULT_COURT_IMAGE_CALIBRATION}
        />

        <div className="rounded border border-slate-200 bg-slate-50 p-3 text-sm">
          <p className="font-semibold">Shot Inference</p>
          {selectedShot ? (
            <p className="mt-1 text-slate-700">
              {selectedShot.shotFamily} | {ZONE_LABELS[selectedShot.zoneId] || selectedShot.zoneId}{' '}
              | ({selectedShot.x.toFixed(1)}, {selectedShot.y.toFixed(1)}) | hoop:{' '}
              {selectedShot.nearestHoop}
            </p>
          ) : (
            <p className="mt-1 text-slate-600">Tap the court to infer shot type and zone.</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-60"
            disabled={isSaving}
            onClick={() => addShotEvent('made')}
          >
            Shot Make
          </button>
          <button
            type="button"
            className="rounded bg-slate-700 px-4 py-2 text-white disabled:opacity-60"
            disabled={isSaving}
            onClick={() => addShotEvent('miss')}
          >
            Shot Miss
          </button>
          <button
            type="button"
            className="rounded bg-emerald-700 px-4 py-2 text-white disabled:opacity-60"
            disabled={isSaving}
            onClick={() => addFreeThrowEvent('made')}
          >
            FT Make
          </button>
          <button
            type="button"
            className="rounded bg-emerald-600 px-4 py-2 text-white disabled:opacity-60"
            disabled={isSaving}
            onClick={() => addFreeThrowEvent('miss')}
          >
            FT Miss
          </button>
        </div>

        <p className="text-xs text-slate-500">
          Free throws use a fixed free-throw-line location and follow the most recently tapped hoop
          (fallback: south hoop).
        </p>

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
  );
}
