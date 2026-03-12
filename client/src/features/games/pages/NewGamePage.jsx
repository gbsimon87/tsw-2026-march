import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { teamsApi } from '../../teams/api/teamsApi';
import { gamesApi } from '../api/gamesApi';

export function NewGamePage() {
  const navigate = useNavigate();
  const [teams, setTeams] = useState([]);
  const [knownOpponents, setKnownOpponents] = useState([]);
  const [teamId, setTeamId] = useState('');
  const [title, setTitle] = useState('');
  const [opponentMode, setOpponentMode] = useState('new');
  const [selectedOpponent, setSelectedOpponent] = useState('');
  const [newOpponent, setNewOpponent] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.allSettled([teamsApi.list(), gamesApi.list()])
      .then(([teamsResult, gamesResult]) => {
        if (teamsResult.status === 'fulfilled') {
          const loadedTeams = teamsResult.value.teams || [];
          setTeams(loadedTeams);
          if (loadedTeams.length > 0) {
            setTeamId(loadedTeams[0].id);
          }
        } else {
          setError(teamsResult.reason?.message || 'Failed to load teams');
        }

        if (gamesResult.status === 'fulfilled') {
          const values = [];
          const seen = new Set();

          for (const game of gamesResult.value.games || []) {
            const opponent = game?.opponent?.trim();
            if (!opponent) {
              continue;
            }
            const key = opponent.toLowerCase();
            if (seen.has(key)) {
              continue;
            }
            seen.add(key);
            values.push(opponent);
          }

          values.sort((a, b) => a.localeCompare(b));
          setKnownOpponents(values);
          setOpponentMode(values.length > 0 ? 'existing' : 'new');
        }
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  async function onSubmit(event) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const payload = {
        teamId,
        title,
      };

      const resolvedOpponent = (
        opponentMode === 'existing' ? selectedOpponent : newOpponent
      )?.trim();

      if (resolvedOpponent) {
        payload.opponent = resolvedOpponent;
      }

      if (scheduledAt) {
        payload.scheduledAt = new Date(scheduledAt).toISOString();
      }

      const response = await gamesApi.create(payload);
      navigate(`/games/${response.game.id}/track`);
    } catch (submitError) {
      setError(submitError.message || 'Failed to create game');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return <p className="text-sm">Loading teams...</p>;
  }

  if (teams.length === 0) {
    return (
      <section className="space-y-3">
        <h1 className="text-2xl font-bold">Create Game</h1>
        <p className="text-sm text-slate-600">You need a team before creating a game.</p>
        <button
          type="button"
          className="rounded bg-slate-900 px-4 py-2 text-white"
          onClick={() => navigate('/teams/new')}
        >
          Create Team First
        </button>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl font-bold">Create Game</h1>
      <form className="space-y-4 rounded border bg-white p-4 shadow-sm" onSubmit={onSubmit}>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <label className="block">
          <span className="mb-1 block text-sm">Team</span>
          <select
            className="w-full rounded border px-3 py-2"
            value={teamId}
            onChange={(event) => setTeamId(event.target.value)}
          >
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm">Game Title</span>
          <input
            type="text"
            required
            className="w-full rounded border px-3 py-2"
            placeholder="vs Wildcats - March 12"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>

        <div className="space-y-2">
          <span className="block text-sm">Opponent (optional)</span>
          {knownOpponents.length > 0 ? (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="opponentMode"
                    value="existing"
                    checked={opponentMode === 'existing'}
                    onChange={() => setOpponentMode('existing')}
                  />
                  Choose existing
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="opponentMode"
                    value="new"
                    checked={opponentMode === 'new'}
                    onChange={() => setOpponentMode('new')}
                  />
                  Add new opponent
                </label>
              </div>

              {opponentMode === 'existing' ? (
                <select
                  className="w-full rounded border px-3 py-2"
                  value={selectedOpponent}
                  onChange={(event) => setSelectedOpponent(event.target.value)}
                >
                  <option value="">Select opponent (optional)</option>
                  {knownOpponents.map((opponent) => (
                    <option key={opponent} value={opponent}>
                      {opponent}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  className="w-full rounded border px-3 py-2"
                  placeholder="Enter opponent name"
                  value={newOpponent}
                  onChange={(event) => setNewOpponent(event.target.value)}
                />
              )}
            </div>
          ) : (
            <div className="space-y-1">
              <input
                type="text"
                className="w-full rounded border px-3 py-2"
                placeholder="Enter opponent name"
                value={newOpponent}
                onChange={(event) => setNewOpponent(event.target.value)}
              />
              <p className="text-xs text-slate-500">No previous opponents yet. You can type one.</p>
            </div>
          )}
        </div>

        <label className="block">
          <span className="mb-1 block text-sm">Scheduled At (optional)</span>
          <input
            type="datetime-local"
            className="w-full rounded border px-3 py-2"
            value={scheduledAt}
            onChange={(event) => setScheduledAt(event.target.value)}
          />
        </label>

        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-60"
        >
          {isSubmitting ? 'Creating...' : 'Create and Start Tracking'}
        </button>
      </form>
    </section>
  );
}
