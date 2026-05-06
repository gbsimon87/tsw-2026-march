import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../../components/PageHeader';
import { SportsLoader } from '../../../components/SportsLoader';
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
  const [videoUrl, setVideoUrl] = useState('');
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

      if (videoUrl.trim()) {
        payload.videoUrl = videoUrl.trim();
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
    return <SportsLoader label="Loading teams" fullPage />;
  }

  if (teams.length === 0) {
    return (
      <main className="space-y-6">
        <PageHeader
          title="Create Game"
          description="Set up game details and start tracking your team performance."
        />

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-600">You need a team before creating a game.</p>
          <button
            type="button"
            className="mt-3 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
            onClick={() => navigate('/teams/new')}
          >
            Create Team First
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        title="Create Game"
        description="Prepare game details in seconds and move directly into live tracking."
      />

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <form
        className="space-y-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        onSubmit={onSubmit}
      >
        <section aria-labelledby="game-details-heading" className="space-y-3">
          <h2 id="game-details-heading" className="text-xl font-semibold text-slate-900">
            Game Details
          </h2>
          <label className="block">
            <span className="mb-1 block text-sm text-slate-700">Team</span>
            <select
              className="w-full rounded border border-slate-300 px-3 py-2"
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
            <span className="mb-1 block text-sm text-slate-700">Game Title</span>
            <input
              type="text"
              required
              className="w-full rounded border border-slate-300 px-3 py-2"
              placeholder="vs Wildcats - March 12"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
        </section>

        <section aria-labelledby="opponent-heading" className="space-y-3">
          <h2 id="opponent-heading" className="text-xl font-semibold text-slate-900">
            Opponent
          </h2>
          <p className="text-sm text-slate-600">
            Optional: choose a previous opponent or add a new one for this game.
          </p>
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
                  className="w-full rounded border border-slate-300 px-3 py-2"
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
                  className="w-full rounded border border-slate-300 px-3 py-2"
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
                className="w-full rounded border border-slate-300 px-3 py-2"
                placeholder="Enter opponent name"
                value={newOpponent}
                onChange={(event) => setNewOpponent(event.target.value)}
              />
              <p className="text-xs text-slate-500">No previous opponents yet. You can type one.</p>
            </div>
          )}
        </section>

        <section aria-labelledby="schedule-heading" className="space-y-3">
          <h2 id="schedule-heading" className="text-xl font-semibold text-slate-900">
            Schedule
          </h2>
          <label className="block">
            <span className="mb-1 block text-sm text-slate-700">Scheduled At (optional)</span>
            <input
              type="datetime-local"
              className="w-full rounded border border-slate-300 px-3 py-2"
              value={scheduledAt}
              onChange={(event) => setScheduledAt(event.target.value)}
            />
          </label>
        </section>

        <section aria-labelledby="video-heading" className="space-y-3">
          <h2 id="video-heading" className="text-xl font-semibold text-slate-900">
            Video
          </h2>
          <label className="block">
            <span className="mb-1 block text-sm text-slate-700">YouTube URL (optional)</span>
            <input
              type="url"
              className="w-full rounded border border-slate-300 px-3 py-2"
              placeholder="https://www.youtube.com/watch?v=..."
              value={videoUrl}
              onChange={(event) => setVideoUrl(event.target.value)}
            />
          </label>
          <p className="text-sm text-slate-600">
            Use an unlisted YouTube link to test playback without paying for app-side video storage.
          </p>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60"
          >
            {isSubmitting ? 'Creating...' : 'Create and Start Tracking'}
          </button>
        </div>
      </form>
    </main>
  );
}
