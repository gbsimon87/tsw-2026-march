import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { teamsApi } from '../../teams/api/teamsApi';
import { gamesApi } from '../api/gamesApi';

export function NewGamePage() {
  const navigate = useNavigate();
  const [teams, setTeams] = useState([]);
  const [teamId, setTeamId] = useState('');
  const [title, setTitle] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    teamsApi
      .list()
      .then((response) => {
        setTeams(response.teams || []);
        if ((response.teams || []).length > 0) {
          setTeamId(response.teams[0].id);
        }
      })
      .catch((loadError) => {
        setError(loadError.message || 'Failed to load teams');
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
