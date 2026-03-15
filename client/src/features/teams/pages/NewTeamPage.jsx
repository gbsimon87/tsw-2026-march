import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { teamsApi } from '../api/teamsApi';

function nextPlayer() {
  return { displayName: '', jerseyNumber: '' };
}

export function NewTeamPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [teamName, setTeamName] = useState('');
  const [players, setPlayers] = useState([nextPlayer()]);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const redirectTo = searchParams.get('redirectTo') || '';

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

      navigate(redirectTo || '/games/new');
    } catch (submitError) {
      setError(submitError.message || 'Failed to create team');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-8">
      <section className="rounded-3xl bg-gradient-to-r from-amber-50 via-white to-sky-50 p-8 md:p-10">
        <h1 className="text-3xl font-bold leading-tight text-slate-900 md:text-4xl">Create Team</h1>
        <p className="mt-2 text-base text-slate-700">
          Build your roster once, then start tracking games with confidence.
        </p>
      </section>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <form
        className="space-y-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        onSubmit={onSubmit}
      >
        <section aria-labelledby="team-details-heading" className="space-y-3">
          <h2 id="team-details-heading" className="text-xl font-semibold text-slate-900">
            Team Details
          </h2>
          <label className="block">
            <span className="mb-1 block text-sm text-slate-700">Team Name</span>
            <input
              type="text"
              required
              className="w-full rounded border border-slate-300 px-3 py-2"
              value={teamName}
              onChange={(event) => setTeamName(event.target.value)}
            />
          </label>
        </section>

        <section aria-labelledby="roster-heading" className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 id="roster-heading" className="text-xl font-semibold text-slate-900">
              Roster
            </h2>
            <button
              type="button"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
              onClick={addPlayerRow}
            >
              Add Player
            </button>
          </div>

          <p className="text-sm text-slate-600">
            Add player names now. Jersey numbers are optional and can be updated later.
          </p>

          <div className="space-y-2">
            {playerRows.map((player) => (
              <div
                key={player.index}
                className="grid grid-cols-1 gap-2 rounded-xl border border-slate-200 bg-slate-50/50 p-3 md:grid-cols-[1fr,1fr,auto]"
              >
                <input
                  type="text"
                  placeholder="Player Name"
                  className="rounded border border-slate-300 px-3 py-2"
                  value={player.displayName}
                  onChange={(event) =>
                    updatePlayer(player.index, 'displayName', event.target.value)
                  }
                />
                <input
                  type="number"
                  placeholder="Jersey #"
                  className="rounded border border-slate-300 px-3 py-2"
                  value={player.jerseyNumber}
                  onChange={(event) =>
                    updatePlayer(player.index, 'jerseyNumber', event.target.value)
                  }
                />
                <button
                  type="button"
                  className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => removePlayerRow(player.index)}
                  disabled={players.length <= 1}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60"
          >
            {isSubmitting ? 'Saving...' : 'Create Team'}
          </button>
        </div>
      </form>
    </main>
  );
}
