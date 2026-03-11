import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { gamesApi } from '../api/gamesApi';
import { SHOT_STAT_OPTIONS, SHOT_ZONE_OPTIONS } from '../constants';

function formatEventLabel(event, playersById) {
  const player = playersById.get(event.playerId);
  const playerName = player?.displayName || 'Unknown';
  return `${playerName} - ${event.statType} @ ${event.zoneId}`;
}

export function GameTrackPage() {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [selectedStatType, setSelectedStatType] = useState('FT_MADE');
  const [selectedZoneId, setSelectedZoneId] = useState('PAINT');
  const [x, setX] = useState('');
  const [y, setY] = useState('');
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

  async function addEvent() {
    if (!selectedPlayerId) {
      setError('Select a player first');
      return;
    }

    setError('');
    setIsSaving(true);

    try {
      const payload = {
        playerId: selectedPlayerId,
        statType: selectedStatType,
        zoneId: selectedZoneId,
      };

      if (x !== '' && y !== '') {
        payload.x = Number(x);
        payload.y = Number(y);
      }

      const response = await gamesApi.appendEvent(gameId, payload);
      setData((current) => ({ ...current, ...response }));
    } catch (submitError) {
      setError(submitError.message || 'Failed to add event');
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

        <label className="block">
          <span className="mb-1 block text-sm">Stat</span>
          <select
            value={selectedStatType}
            onChange={(event) => setSelectedStatType(event.target.value)}
            className="w-full rounded border px-3 py-2"
          >
            {SHOT_STAT_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm">Court Zone</span>
          <select
            value={selectedZoneId}
            onChange={(event) => setSelectedZoneId(event.target.value)}
            className="w-full rounded border px-3 py-2"
          >
            {SHOT_ZONE_OPTIONS.map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.label}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-sm">X (0-100)</span>
            <input
              type="number"
              min="0"
              max="100"
              className="w-full rounded border px-3 py-2"
              value={x}
              onChange={(event) => setX(event.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm">Y (0-100)</span>
            <input
              type="number"
              min="0"
              max="100"
              className="w-full rounded border px-3 py-2"
              value={y}
              onChange={(event) => setY(event.target.value)}
            />
          </label>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-60"
            disabled={isSaving}
            onClick={addEvent}
          >
            Add Event
          </button>
          <button
            type="button"
            className="rounded bg-emerald-700 px-4 py-2 text-white disabled:opacity-60"
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
