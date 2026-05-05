import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { gamesApi } from '../../games/api/gamesApi';
import { TEAM_SIDES } from '../../games/constants';
import { leaguesApi } from '../api/leaguesApi';
import { Breadcrumbs } from '../../../components/Breadcrumbs';

export function AdminNewLeagueGamePage() {
  const { leagueId } = useParams();
  const navigate = useNavigate();
  const [league, setLeague] = useState(null);
  const [teams, setTeams] = useState([]);
  const [homeLeagueTeamId, setHomeLeagueTeamId] = useState('');
  const [awayLeagueTeamId, setAwayLeagueTeamId] = useState('');
  const [initialActiveSide, setInitialActiveSide] = useState(TEAM_SIDES.HOME);
  const [title, setTitle] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([leaguesApi.getById(leagueId), leaguesApi.listTeams(leagueId)])
      .then(([leagueResponse, teamsResponse]) => {
        setLeague(leagueResponse.league);
        const nextTeams = teamsResponse.teams || [];
        setTeams(nextTeams);
        if (nextTeams.length > 1) {
          setHomeLeagueTeamId(nextTeams[0].id);
          setAwayLeagueTeamId(nextTeams[1].id);
        }
      })
      .catch((loadError) => setError(loadError.message || 'Failed to load league setup'))
      .finally(() => setIsLoading(false));
  }, [leagueId]);

  async function onSubmit(event) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      const response = await gamesApi.create({
        gameContext: 'league',
        trackingMode: 'dual_team',
        leagueId,
        homeLeagueTeamId,
        awayLeagueTeamId,
        initialActiveSide,
        ...(title.trim() ? { title: title.trim() } : {}),
        ...(scheduledAt ? { scheduledAt: new Date(scheduledAt).toISOString() } : {}),
        ...(videoUrl.trim() ? { videoUrl: videoUrl.trim() } : {}),
      });
      navigate(`/games/${response.game.id}/track`);
    } catch (submitError) {
      setError(submitError.message || 'Failed to create league game');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return <p className="text-sm">Loading league teams...</p>;
  }

  const hasValidMatchup =
    homeLeagueTeamId && awayLeagueTeamId && homeLeagueTeamId !== awayLeagueTeamId;
  const homeTeam = teams.find((team) => team.id === homeLeagueTeamId) || null;
  const awayTeam = teams.find((team) => team.id === awayLeagueTeamId) || null;
  const shortRosterTeams = [homeTeam, awayTeam].filter(
    (team) => typeof team?.activeRosterCount === 'number' && team.activeRosterCount < 5
  );

  return (
    <main className="mx-auto max-w-3xl space-y-8">
      <Breadcrumbs
        crumbs={[
          { label: 'Admin', href: '/admin' },
          { label: league?.name || 'League', href: `/admin/leagues/${leagueId}` },
          { label: 'Schedule Game' },
        ]}
      />

      <section className="rounded-3xl bg-gradient-to-r from-sky-50 via-white to-amber-50 p-8 md:p-10">
        <h1 className="text-3xl font-bold text-slate-900 md:text-4xl">Schedule League Game</h1>
        <p className="mt-2 text-base text-slate-700">
          Create a league matchup and jump straight into the existing game tracker.
        </p>
      </section>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <form
        onSubmit={onSubmit}
        className="space-y-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <label className="block">
          <span className="mb-1 block text-sm text-slate-700">Home Team</span>
          <select
            className="w-full rounded border border-slate-300 px-3 py-2"
            value={homeLeagueTeamId}
            onChange={(event) => setHomeLeagueTeamId(event.target.value)}
          >
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-slate-700">Away Team</span>
          <select
            className="w-full rounded border border-slate-300 px-3 py-2"
            value={awayLeagueTeamId}
            onChange={(event) => setAwayLeagueTeamId(event.target.value)}
          >
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-slate-700">Start Tracking On</span>
          <select
            className="w-full rounded border border-slate-300 px-3 py-2"
            value={initialActiveSide}
            onChange={(event) => setInitialActiveSide(event.target.value)}
          >
            <option value={TEAM_SIDES.HOME}>
              {teams.find((team) => team.id === homeLeagueTeamId)?.name || 'Home Team'}
            </option>
            <option value={TEAM_SIDES.AWAY}>
              {teams.find((team) => team.id === awayLeagueTeamId)?.name || 'Away Team'}
            </option>
          </select>
        </label>
        {!hasValidMatchup ? (
          <p className="text-sm text-amber-700">Choose two different teams for this matchup.</p>
        ) : null}
        {hasValidMatchup && shortRosterTeams.length > 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <p className="font-semibold">One or more teams has fewer than five active players.</p>
            <p className="mt-1">
              {shortRosterTeams
                .map((team) => `${team.name}: ${team.activeRosterCount || 0}/5 active`)
                .join(', ')}
            </p>
          </div>
        ) : null}
        <label className="block">
          <span className="mb-1 block text-sm text-slate-700">Title (optional)</span>
          <input
            type="text"
            className="w-full rounded border border-slate-300 px-3 py-2"
            placeholder={league ? `${awayTeam?.name || 'Away'} at ${homeTeam?.name || 'Home'}` : ''}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-slate-700">Scheduled At</span>
          <input
            type="datetime-local"
            className="w-full rounded border border-slate-300 px-3 py-2"
            value={scheduledAt}
            onChange={(event) => setScheduledAt(event.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-slate-700">YouTube URL</span>
          <input
            type="url"
            className="w-full rounded border border-slate-300 px-3 py-2"
            placeholder="https://www.youtube.com/watch?v=..."
            value={videoUrl}
            onChange={(event) => setVideoUrl(event.target.value)}
          />
        </label>
        <button
          type="submit"
          disabled={isSubmitting || !hasValidMatchup}
          className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white"
        >
          {isSubmitting ? 'Creating game...' : 'Create and Start Tracking'}
        </button>
      </form>
    </main>
  );
}
