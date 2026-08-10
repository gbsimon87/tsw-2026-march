import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

const TABS = [
  {
    id: 'leagues',
    label: 'My Leagues',
    icon: (
      <svg
        viewBox="0 0 16 16"
        className="h-4 w-4 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path d="M8 1l1.5 3 3.5.5-2.5 2.5.5 3.5L8 9l-3 1.5.5-3.5L3 4.5 6.5 4z" />
      </svg>
    ),
  },
  {
    id: 'teams',
    label: 'One-off Teams',
    icon: (
      <svg
        viewBox="0 0 16 16"
        className="h-4 w-4 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <circle cx="6" cy="5" r="2.5" />
        <path d="M1 13c0-2.2 2.2-4 5-4s5 1.8 5 4" />
        <path d="M11 7c1.4 0 3 .9 3 3" />
        <circle cx="13" cy="4.5" r="1.8" />
      </svg>
    ),
  },
];
import { useAuth } from '../../app/store/AuthContext';
import { teamsApi } from '../teams/api/teamsApi';
import { leaguesApi } from '../leagues/api/leaguesApi';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import { DarkPageHeader } from '../../components/DarkPageHeader';
import { getLeagueHeaderImage } from '../feed/cardImage';
import teamPlaceholder from '../../assets/placeholders/team-logo-placeholder.svg';
import { CloudinaryImage } from '../media/CloudinaryImage';
import { BillingStatusPill } from '../billing/components/BillingStatusPill';

function getLeagueRoleLabel(viewerRole) {
  if (viewerRole === 'owner') return 'League Owner';
  if (viewerRole === 'league_manager') return 'League Admin';
  if (viewerRole === 'team_manager') return 'Team Manager';
  if (viewerRole === 'player') return 'Player';
  if (viewerRole === 'helper') return 'Helper';
  return 'Member';
}

export function AdminPage() {
  const { user } = useAuth();
  const [teams, setTeams] = useState([]);
  const [leagues, setLeagues] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('leagues');

  useEffect(() => {
    Promise.all([teamsApi.list(), leaguesApi.list()])
      .then(([teamsResponse, leaguesResponse]) => {
        setTeams(teamsResponse.teams || []);
        setLeagues(leaguesResponse.leagues || []);
      })
      .catch((loadError) => setError(loadError.message || 'Failed to load admin'))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <main className="space-y-6 bg-[#F7F5F0] -m-4 p-4 md:-m-6 md:p-6">
      <Breadcrumbs crumbs={[{ label: 'Admin' }]} />

      <DarkPageHeader
        titleAriaLabel="Admin"
        eyebrow="Dashboard"
        title="Admin"
        description="Manage your leagues and non-league teams all in one place."
      >
        {user?.name ? <p className="text-sm text-white/60">Welcome back, {user.name}.</p> : null}
      </DarkPageHeader>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <article className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs text-slate-500">Leagues</p>
          <p
            className="mt-0.5 text-xl leading-none text-[#F4A300]"
            style={{ fontFamily: "'IBM Plex Mono', monospace" }}
          >
            {isLoading ? '—' : leagues.length}
          </p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs text-slate-500">One-off Teams</p>
          <p
            className="mt-0.5 text-xl leading-none text-[#F4A300]"
            style={{ fontFamily: "'IBM Plex Mono', monospace" }}
          >
            {isLoading ? '—' : teams.length}
          </p>
        </article>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div
          className="grid border-b border-slate-200"
          style={{ gridTemplateColumns: `repeat(${TABS.length}, minmax(0, 1fr))` }}
        >
          {TABS.map((tab, index) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              aria-label={tab.label}
              className={`flex flex-col items-center gap-1 py-3 text-xs font-semibold transition ${
                index < TABS.length - 1 ? 'border-r border-slate-200' : ''
              } ${
                activeTab === tab.id
                  ? 'bg-[#141414] text-white'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-5">
          {activeTab === 'leagues' ? (
            <div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2
                    className="text-lg text-slate-900"
                    style={{ fontFamily: "'Archivo Black', sans-serif" }}
                  >
                    My Leagues
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Manage multiple teams within a single league, including standings, fixtures, and
                    join requests from one central location.
                  </p>
                </div>
                <Link
                  to="/pricing"
                  className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-[#F4A300]/60 hover:bg-slate-50"
                >
                  New League
                </Link>
              </div>
              {isLoading ? (
                <p className="mt-3 text-sm text-slate-500">Loading leagues…</p>
              ) : leagues.length === 0 ? (
                <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center">
                  <p className="text-sm text-slate-600">
                    No leagues yet.{' '}
                    <Link
                      to="/pricing"
                      className="font-medium text-slate-900 underline decoration-[#F4A300] decoration-2 underline-offset-4 hover:text-[#1B4332]"
                    >
                      Start your 14-day trial →
                    </Link>
                  </p>
                </div>
              ) : (
                <div className="mt-4 grid gap-3">
                  {leagues.map((league) => (
                    <Link
                      key={league.id}
                      to={`/admin/leagues/${league.id}`}
                      className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4 transition hover:border-[#F4A300]/60 hover:bg-white"
                    >
                      <CloudinaryImage
                        src={getLeagueHeaderImage(league)}
                        alt=""
                        width={40}
                        height={40}
                        loading="lazy"
                        decoding="async"
                        srcSetWidths={[40, 80, 120]}
                        sizes="40px"
                        className="h-10 w-10 shrink-0 rounded-full border border-slate-200 bg-white object-cover"
                      />
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900">{league.name}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span>{league.seasonLabel || 'Season TBD'}</span>
                          <span>•</span>
                          <span>{league.status}</span>
                          <span className="rounded-full bg-slate-200 px-2 py-0.5 font-semibold text-slate-700">
                            {getLeagueRoleLabel(league.viewerContext?.viewerRole)}
                          </span>
                        </div>
                        {league.id ? (
                          <div className="mt-2">
                            <BillingStatusPill
                              billing={league.billing}
                              scope="league"
                              resourceId={league.id}
                            />
                          </div>
                        ) : null}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {activeTab === 'teams' ? (
            <div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2
                    className="text-lg text-slate-900"
                    style={{ fontFamily: "'Archivo Black', sans-serif" }}
                  >
                    One-off Teams
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Standalone teams managed independently from any league.
                  </p>
                </div>
                <Link
                  to="/teams/new"
                  className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-[#F4A300]/60 hover:bg-slate-50"
                >
                  New Team
                </Link>
              </div>
              {isLoading ? (
                <p className="mt-3 text-sm text-slate-500">Loading teams…</p>
              ) : teams.length === 0 ? (
                <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center">
                  <p className="text-sm text-slate-600">
                    No teams yet.{' '}
                    <Link
                      to="/teams/new"
                      className="font-medium text-slate-900 underline decoration-[#F4A300] decoration-2 underline-offset-4 hover:text-[#1B4332]"
                    >
                      Create your first team →
                    </Link>
                  </p>
                </div>
              ) : (
                <div className="mt-4 grid gap-3">
                  {teams.map((team) => {
                    const teamId = team.id || team._id;
                    const activePlayerCount = (team.players || []).filter(
                      (player) => player.isActive
                    ).length;

                    return (
                      <Link
                        key={teamId}
                        to={`/admin/teams/${teamId}`}
                        className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4 transition hover:border-[#F4A300]/60 hover:bg-white"
                      >
                        <CloudinaryImage
                          src={team.logo?.url || teamPlaceholder}
                          alt=""
                          width={40}
                          height={40}
                          loading="lazy"
                          decoding="async"
                          srcSetWidths={[40, 80, 120]}
                          sizes="40px"
                          className="h-10 w-10 shrink-0 rounded-full border border-slate-200 bg-white object-cover"
                        />
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900">
                            {team.name || 'Unnamed Team'}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            <span>Active roster: {activePlayerCount}</span>
                          </div>
                          {teamId ? (
                            <div className="mt-2">
                              <BillingStatusPill
                                billing={team.billing}
                                scope="team"
                                resourceId={teamId}
                              />
                            </div>
                          ) : null}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
