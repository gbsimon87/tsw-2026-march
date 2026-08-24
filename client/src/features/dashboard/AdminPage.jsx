import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../app/store/AuthContext';
import { teamsApi } from '../teams/api/teamsApi';
import { leaguesApi } from '../leagues/api/leaguesApi';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import { DarkPageHeader } from '../../components/DarkPageHeader';
import { getLeagueHeaderImage } from '../feed/cardImage';
import teamPlaceholder from '../../assets/placeholders/team-logo-placeholder.svg';
import { CloudinaryImage } from '../media/CloudinaryImage';
import { BillingStatusPill } from '../billing/components/BillingStatusPill';

const LeagueIcon = (
  <svg
    viewBox="0 0 16 16"
    className="h-4 w-4 shrink-0"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    aria-hidden="true"
  >
    <path d="M8 1l1.5 3 3.5.5-2.5 2.5.5 3.5L8 9l-3 1.5.5-3.5L3 4.5 6.5 4z" />
  </svg>
);

const TeamIcon = (
  <svg
    viewBox="0 0 16 16"
    className="h-4 w-4 shrink-0"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    aria-hidden="true"
  >
    <circle cx="6" cy="5" r="2.5" />
    <path d="M1 13c0-2.2 2.2-4 5-4s5 1.8 5 4" />
    <path d="M11 7c1.4 0 3 .9 3 3" />
    <circle cx="13" cy="4.5" r="1.8" />
  </svg>
);

const primaryButtonClass =
  'inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#141414] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#2a2a2a] active:bg-black';

function getLeagueRoleLabel(viewerRole) {
  if (viewerRole === 'owner') return 'League Owner';
  if (viewerRole === 'league_manager') return 'League Admin';
  if (viewerRole === 'team_manager') return 'Team Manager';
  if (viewerRole === 'player') return 'Player';
  if (viewerRole === 'helper') return 'Helper';
  return 'Member';
}

/**
 * One empty state, one action. The previous version offered the same
 * destination twice — a header button and an underlined sentence link — which
 * made the panel read as two competing choices for one job.
 */
function EmptyState({ headline, body, actionLabel, actionTo }) {
  return (
    <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center">
      <p className="text-base font-semibold text-slate-900">{headline}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">{body}</p>
      <Link to={actionTo} className={`${primaryButtonClass} mt-5`}>
        {actionLabel}
      </Link>
    </div>
  );
}

export function AdminPage() {
  const { user } = useAuth();
  const [teams, setTeams] = useState([]);
  const [leagues, setLeagues] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  // Null until the data lands, so the opening tab can follow what the user
  // actually owns instead of always showing "Leagues" to a coach with one team.
  const [activeTab, setActiveTab] = useState(null);

  useEffect(() => {
    Promise.all([teamsApi.list(), leaguesApi.list()])
      .then(([teamsResponse, leaguesResponse]) => {
        const nextTeams = teamsResponse.teams || [];
        const nextLeagues = leaguesResponse.leagues || [];
        setTeams(nextTeams);
        setLeagues(nextLeagues);
        setActiveTab((current) => {
          if (current) return current;
          // Only open on Leagues if the user actually has one. Otherwise Teams
          // is the right first surface: it is the free path, and a brand-new
          // account should not land on a trial pitch.
          return nextLeagues.length > 0 ? 'leagues' : 'teams';
        });
      })
      .catch((loadError) => setError(loadError.message || 'Failed to load admin'))
      .finally(() => setIsLoading(false));
  }, []);

  const tabs = [
    { id: 'leagues', label: 'Leagues', icon: LeagueIcon, count: leagues.length },
    { id: 'teams', label: 'Teams', icon: TeamIcon, count: teams.length },
  ];
  const currentTab = activeTab || 'leagues';

  return (
    <main className="space-y-6">
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
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </p>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white">
        {/* The tab strip sits inside the card's padding rather than bleeding to
            its edge, so the active tab is a rounded pill instead of a
            square-cornered block overhanging a rounded container. */}
        <div
          className="flex gap-1 border-b border-slate-200 p-2"
          role="tablist"
          aria-label="Admin sections"
        >
          {tabs.map((tab) => {
            const isActive = tab.id === currentTab;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`admin-tab-${tab.id}`}
                aria-selected={isActive}
                aria-controls={`admin-panel-${tab.id}`}
                tabIndex={isActive ? 0 : -1}
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                  isActive
                    ? 'bg-[#141414] text-white'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {tab.icon}
                {tab.label}
                {isLoading ? null : (
                  <span
                    className={`tsw-tnum rounded-full px-1.5 py-0.5 text-xs font-semibold ${
                      isActive ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div
          // Keyed on the tab so switching replays the reveal instead of
          // swapping content with no feedback at all.
          key={currentTab}
          id={`admin-panel-${currentTab}`}
          role="tabpanel"
          aria-labelledby={`admin-tab-${currentTab}`}
          className="t-panel p-5"
        >
          {currentTab === 'leagues' ? (
            <div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2
                    className="text-lg text-slate-900"
                    style={{ fontFamily: "'Archivo Black', sans-serif" }}
                  >
                    Leagues
                  </h2>
                  <p className="mt-1 max-w-xl text-sm text-slate-600">
                    Run several teams together with standings, fixtures, and join requests in one
                    place.
                  </p>
                </div>
                {leagues.length > 0 ? (
                  <Link
                    to="/pricing?resourceType=league&action=create"
                    className={`${primaryButtonClass} shrink-0`}
                  >
                    New league
                  </Link>
                ) : null}
              </div>

              {isLoading ? (
                <p className="mt-3 text-sm text-slate-500">Loading leagues…</p>
              ) : leagues.length === 0 ? (
                <EmptyState
                  headline="No leagues yet"
                  body="A league keeps several teams, a schedule, and a standings table together. Team Pro is included for every team in it."
                  actionLabel="Start a 14-day league trial"
                  actionTo="/pricing?resourceType=league&action=create"
                />
              ) : (
                <div className="mt-4 grid gap-3">
                  {leagues.map((league) => (
                    // A card holding two destinations (the league, and billing)
                    // cannot be one anchor: nesting <a> inside <a> is invalid
                    // HTML and React rejected it at runtime. The title is the
                    // link; the pill is a sibling.
                    <div
                      key={league.id}
                      className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4 transition-colors hover:border-[#F4A300]/60 hover:bg-white"
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
                      <div className="min-w-0 flex-1">
                        <Link
                          to={`/admin/leagues/${league.id}`}
                          className="font-semibold text-slate-900 underline-offset-4 hover:underline"
                        >
                          {league.name}
                        </Link>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span>{league.seasonLabel || 'Season TBD'}</span>
                          <span aria-hidden="true">•</span>
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
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2
                    className="text-lg text-slate-900"
                    style={{ fontFamily: "'Archivo Black', sans-serif" }}
                  >
                    Teams
                  </h2>
                  <p className="mt-1 max-w-xl text-sm text-slate-600">
                    Standalone teams, managed on their own rather than inside a league.
                  </p>
                </div>
                {teams.length > 0 ? (
                  <Link to="/teams/new" className={`${primaryButtonClass} shrink-0`}>
                    New team
                  </Link>
                ) : null}
              </div>

              {isLoading ? (
                <p className="mt-3 text-sm text-slate-500">Loading teams…</p>
              ) : teams.length === 0 ? (
                <EmptyState
                  headline="Add your team to start tracking"
                  body="A name is all it takes. Add players now or later, then track your first game — live stats and box scores are free."
                  actionLabel="Create your team"
                  actionTo="/teams/new"
                />
              ) : (
                <div className="mt-4 grid gap-3">
                  {teams.map((team) => {
                    const teamId = team.id || team._id;
                    const activePlayerCount = (team.players || []).filter(
                      (player) => player.isActive
                    ).length;

                    return (
                      <div
                        key={teamId}
                        className="flex flex-wrap items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4 transition-colors hover:border-[#F4A300]/60 hover:bg-white"
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
                        <div className="min-w-0 flex-1">
                          <Link
                            to={`/admin/teams/${teamId}`}
                            className="font-semibold text-slate-900 underline-offset-4 hover:underline"
                          >
                            {team.name || 'Unnamed Team'}
                          </Link>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            <span>
                              {activePlayerCount} {activePlayerCount === 1 ? 'player' : 'players'}
                            </span>
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
                        {/* The reason a coach opens this page. It was previously
                            two clicks deeper, behind the card and the team page. */}
                        <Link
                          to={`/games/new?teamId=${teamId}`}
                          className={`${primaryButtonClass} shrink-0`}
                        >
                          Track a game
                        </Link>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
