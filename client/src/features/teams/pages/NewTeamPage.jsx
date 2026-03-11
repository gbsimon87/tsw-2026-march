import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { teamsApi } from '../api/teamsApi';

function nextPlayer() {
  return { displayName: '', jerseyNumber: '' };
}

export function NewTeamPage() {
  const navigate = useNavigate();
  const [teamName, setTeamName] = useState('');
  const [players, setPlayers] = useState([nextPlayer()]);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const playerRows = useMemo(
    () =>
      players.map((player, index) => ({
        ...player,
        index,
      })),
    [players]
  );

  function updatePlayer(index, field, value) {
    setPlayers((current) =>
      current.map((player, idx) => (idx === index ? { ...player, [field]: value } : player))
    );
  }

  function addPlayerRow() {
    setPlayers((current) => [...current, nextPlayer()]);
  }

  function removePlayerRow(index) {
    setPlayers((current) => current.filter((_, idx) => idx !== index));
  }

  async function onSubmit(event) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const normalizedPlayers = players
        .map((player) => ({
          displayName: player.displayName.trim(),
          jerseyNumber:
            player.jerseyNumber === '' || Number.isNaN(Number(player.jerseyNumber))
              ? undefined
              : Number(player.jerseyNumber),
        }))
        .filter((player) => player.displayName.length > 0);

      await teamsApi.create({
        name: teamName,
        players: normalizedPlayers,
      });

      navigate('/games/new');
    } catch (submitError) {
      setError(submitError.message || 'Failed to create team');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">Create Team</h1>
      <p className="text-sm text-slate-600">Set up your roster before tracking games.</p>
      <form className="space-y-4 rounded border bg-white p-4 shadow-sm" onSubmit={onSubmit}>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <label className="block">
          <span className="mb-1 block text-sm">Team Name</span>
          <input
            type="text"
            required
            className="w-full rounded border px-3 py-2"
            value={teamName}
            onChange={(event) => setTeamName(event.target.value)}
          />
        </label>

        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Players</h2>
          {playerRows.map((player) => (
            <div
              key={player.index}
              className="grid grid-cols-1 gap-2 rounded border p-3 md:grid-cols-3"
            >
              <input
                type="text"
                placeholder="Player Name"
                className="rounded border px-3 py-2"
                value={player.displayName}
                onChange={(event) => updatePlayer(player.index, 'displayName', event.target.value)}
              />
              <input
                type="number"
                placeholder="Jersey #"
                className="rounded border px-3 py-2"
                value={player.jerseyNumber}
                onChange={(event) => updatePlayer(player.index, 'jerseyNumber', event.target.value)}
              />
              <button
                type="button"
                className="rounded border px-3 py-2 text-sm"
                onClick={() => removePlayerRow(player.index)}
                disabled={players.length <= 1}
              >
                Remove
              </button>
            </div>
          ))}
          <button type="button" className="rounded border px-3 py-2 text-sm" onClick={addPlayerRow}>
            Add Player
          </button>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-60"
        >
          {isSubmitting ? 'Saving...' : 'Create Team'}
        </button>
      </form>
    </section>
  );
}
