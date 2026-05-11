import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../../app/store/AuthContext';
import { LeagueRosterTable } from '../components/LeagueRosterTable';
import { LeagueGameCard } from '../../../components/ui/LeagueGameCard';
import { leaguesApi } from '../api/leaguesApi';
import { getLeagueHeaderImage } from '../../feed/cardImage';
import playerPlaceholder from '../../../assets/placeholders/player-placeholder.svg';
import teamPlaceholder from '../../../assets/placeholders/team-logo-placeholder.svg';
import { Breadcrumbs } from '../../../components/Breadcrumbs';
import { PageHeader } from '../../../components/PageHeader';
import { SportsLoader } from '../../../components/SportsLoader';
import { StatsTable } from '../../teams/components/StatsTable';

const PLAYER_STATS_COLUMNS = [
  {
    id: 'player',
    label: 'Player',
    align: 'left',
    sortable: false,
    render: (row) => (
      <span className="flex items-center gap-2">
        <img
          src={row.avatarUrl || playerPlaceholder}
          alt=""
          className="h-6 w-6 shrink-0 rounded-full border border-slate-200 bg-white object-cover"
        />
        <Link
          to={row.playerHref}
          className="font-medium text-slate-900 underline decoration-slate-300 underline-offset-4 transition hover:text-sky-700 hover:decoration-sky-500"
        >
          {row.displayName}
        </Link>
        {row.jerseyNumber != null || row.position ? (
          <span className="text-xs text-slate-500">
            {[row.jerseyNumber != null ? `#${row.jerseyNumber}` : null, row.position]
              .filter(Boolean)
              .join(' · ')}
          </span>
        ) : null}
      </span>
    ),
  },
  {
    id: 'points',
    label: 'PTS',
    align: 'right',
    render: (row) => row.points,
  },
  {
    id: 'reb',
    label: 'REB',
    align: 'right',
    render: (row) => row.reb,
  },
  {
    id: 'ast',
    label: 'AST',
    align: 'right',
    render: (row) => row.ast,
  },
  {
    id: 'stl',
    label: 'STL',
    align: 'right',
    render: (row) => row.stl,
  },
  {
    id: 'tov',
    label: 'TOV',
    align: 'right',
    render: (row) => row.tov,
  },
];

export function PublicLeagueTeamPage() {
  const { leagueSlug, teamSlug } = useParams();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [rolePlayer, setRolePlayer] = useState(false);
  const [roleTeamManager, setRoleTeamManager] = useState(false);
  const [requestedLeaguePlayerId, setRequestedLeaguePlayerId] = useState('');
  const [requestStatus, setRequestStatus] = useState('');
  const [requestStatusTone, setRequestStatusTone] = useState('success');

  useEffect(() => {
    leaguesApi
      .getPublicTeam(leagueSlug, teamSlug)
      .then(setData)
      .catch((loadError) => setError(loadError.message || 'Failed to load team'))
      .finally(() => setIsLoading(false));
  }, [leagueSlug, teamSlug]);

  if (isLoading) {
    return <SportsLoader label="Loading league team" fullPage />;
  }

  if (!data?.team) {
    return <p className="text-sm text-red-600">{error || 'League team not found'}</p>;
  }

  const { league, team } = data;
  const joinablePlayers = (team.roster || []).filter(
    (player) => !player.isClaimed && player.isActive
  );
  const playerStatsRows = (team.stats || []).map((row) => ({
    ...row,
    id: row.playerId,
    playerHref: `/league/${league.slug}/teams/${team.slug}/players/${row.playerId}`,
  }));

  async function submitJoinRequest(event) {
    event.preventDefault();
    setError('');
    setRequestStatus('');
    setRequestStatusTone('success');

    if (!rolePlayer && !roleTeamManager) {
      setError('Select at least one role.');
      return;
    }

    const roles = [...(rolePlayer ? ['player'] : []), ...(roleTeamManager ? ['team_manager'] : [])];

    const results = [];
    for (const role of roles) {
      try {
        await leaguesApi.createJoinRequest(league.id, team.id, {
          requestedRole: role,
          ...(role === 'player' ? { requestedLeaguePlayerId } : {}),
        });
        results.push({ role, ok: true });
      } catch (submitError) {
        results.push({ role, ok: false, message: submitError.message || 'Failed to submit' });
      }
    }

    const allOk = results.every((r) => r.ok);
    const anyPending = results.some((r) =>
      /pending join request already exists/i.test(r.message || '')
    );
    const anyOk = results.some((r) => r.ok);

    if (allOk) {
      setRequestStatus('Join request submitted.');
      setRequestStatusTone('success');
    } else if (anyPending && !anyOk) {
      setRequestStatus('You already have a pending request for the selected role(s).');
      setRequestStatusTone('warning');
    } else if (anyOk) {
      setRequestStatus('Some requests were submitted; others may already be pending.');
      setRequestStatusTone('warning');
    } else {
      setError(results.map((r) => r.message).join(' '));
    }
  }

  const breadcrumbs = [
    { label: 'Leagues' },
    { label: league.name, href: `/league/${league.slug}` },
    { label: team.name },
  ];

  return (
    <main className="space-y-8">
      <Breadcrumbs crumbs={breadcrumbs} />
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <img
              src={getLeagueHeaderImage(league)}
              alt={`${league.name} logo`}
              className="h-5 w-5 shrink-0 rounded-full border border-slate-200 bg-white object-cover"
            />
            <span>{league.name}</span>
          </span>
        }
        title={team.name}
        description={`Rank: ${team.standingsPosition || 'N/A'}`}
        media={
          <img
            src={team.logo?.url || teamPlaceholder}
            alt={`${team.name} logo`}
            className="h-16 w-16 rounded-full border border-slate-200 bg-white object-cover"
          />
        }
      />

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-xl font-semibold text-slate-900">Player Stats</h2>
        <div className="mt-4 overflow-x-auto">
          <StatsTable
            columns={PLAYER_STATS_COLUMNS}
            rows={playerStatsRows}
            tableClassName="w-full text-sm"
          />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-xl font-semibold text-slate-900">League Games</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {(team.games || []).length === 0 ? (
            <p className="text-sm text-slate-600">No league games yet.</p>
          ) : (
            (team.games || []).map((game) => <LeagueGameCard key={game.id} game={game} />)
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-xl font-semibold text-slate-900">Roster</h2>
        <LeagueRosterTable
          bare
          roster={team.roster || []}
          getPlayerHref={(player) =>
            `/league/${league.slug}/teams/${team.slug}/players/${player.id}`
          }
        />
      </section>

      {user ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-xl font-semibold text-slate-900">Request to Join Team</h2>
          <p className="mt-2 text-sm text-slate-600">
            Select the role(s) you&apos;re requesting. Requests are reviewed manually by the league
            owner or this team&apos;s managers.
          </p>
          <form onSubmit={submitJoinRequest} className="mt-4 space-y-4">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-slate-700">Role</legend>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 transition hover:border-slate-300">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-slate-900"
                  checked={rolePlayer}
                  onChange={(e) => setRolePlayer(e.target.checked)}
                />
                <div>
                  <p className="text-sm font-medium text-slate-900">Player</p>
                  <p className="text-xs text-slate-500">
                    Claim an existing roster slot on this team
                  </p>
                </div>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 transition hover:border-slate-300">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-slate-900"
                  checked={roleTeamManager}
                  onChange={(e) => setRoleTeamManager(e.target.checked)}
                />
                <div>
                  <p className="text-sm font-medium text-slate-900">Team Manager</p>
                  <p className="text-xs text-slate-500">
                    Help manage this team&apos;s roster and games
                  </p>
                </div>
              </label>
            </fieldset>
            {rolePlayer ? (
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Claim roster slot
                </span>
                <select
                  required
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
                  value={requestedLeaguePlayerId}
                  onChange={(event) => setRequestedLeaguePlayerId(event.target.value)}
                >
                  <option value="">Select open player slot</option>
                  {joinablePlayers.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.displayName}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <button
              type="submit"
              className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700"
            >
              Submit Join Request
            </button>
            {requestStatus ? (
              <p
                className={`text-sm ${requestStatusTone === 'warning' ? 'text-amber-700' : 'text-emerald-700'}`}
              >
                {requestStatus}
              </p>
            ) : null}
          </form>
        </section>
      ) : null}
    </main>
  );
}
