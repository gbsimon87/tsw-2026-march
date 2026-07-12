import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import CloudinaryImage from '../features/media/CloudinaryImage';
import { teamsApi } from '../features/teams/api/teamsApi';
import { leaguesApi } from '../features/leagues/api/leaguesApi';
import { DiscoverablePlayers } from '../features/players/components/DiscoverablePlayers';
import { getLeagueHeaderImage } from '../features/feed/cardImage';
import { SportsLoader } from '../components/SportsLoader';
import { Tabs } from '../components/Tabs';
import { useDocumentMeta } from '../hooks/useDocumentMeta';
import { resolveShareImage } from '../hooks/resolveShareImage';
import { DarkPageHeader } from '../components/DarkPageHeader';

function LeaguesTabIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M2 12h12M5 12V6M8 12V3M11 12V8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TeamsTabIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <circle cx="5.5" cy="5.5" r="2" />
      <circle cx="10.5" cy="5.5" r="2" />
      <path
        d="M2 13c0-2 1.6-3.5 3.5-3.5S9 11 9 13M7 13c0-2 1.6-3.5 3.5-3.5S14 11 14 13"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PlayersTabIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <circle cx="8" cy="5" r="2.5" />
      <path d="M3 13c0-2.8 2.2-5 5-5s5 2.2 5 5" strokeLinecap="round" />
    </svg>
  );
}

function StatReadout({ value, label }) {
  return (
    <div className="flex flex-col">
      <span
        className="text-3xl text-[#F4A300] md:text-4xl"
        style={{ fontFamily: "'IBM Plex Mono', monospace" }}
      >
        {String(value).padStart(2, '0')}
      </span>
      <span className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/50">
        {label}
      </span>
    </div>
  );
}

function matchesSearch(text, query) {
  if (!query) {
    return true;
  }

  return String(text || '')
    .toLowerCase()
    .includes(query.toLowerCase());
}

export function HomePage() {
  const [publicLeagues, setPublicLeagues] = useState([]);
  const [publicTeams, setPublicTeams] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [leagueQuery, setLeagueQuery] = useState('');
  const [teamQuery, setTeamQuery] = useState('');

  useDocumentMeta({
    title: 'Discover Leagues & Teams — The Sporty Way',
    description:
      'Browse public basketball leagues, standings, and games from teams currently competing.',
    image: resolveShareImage(),
    url: `${window.location.origin}/home`,
  });

  useEffect(() => {
    Promise.all([
      teamsApi.listPublic().catch(() => ({ teams: [] })),
      leaguesApi.listPublic().catch(() => ({ leagues: [] })),
    ])
      .then(([teamsResult, leaguesResult]) => {
        const activeLeagues = (leaguesResult.leagues || []).filter(
          (league) => league.isPublic && league.status === 'active'
        );
        setPublicLeagues(activeLeagues);

        const leagueTeams = activeLeagues.flatMap((league) =>
          (league.teams || []).map((team) => ({
            ...team,
            _kind: 'league',
            leagueSlug: league.slug,
            leagueName: league.name,
          }))
        );
        const standaloneTeams = (teamsResult.teams || []).map((team) => ({
          ...team,
          _kind: 'standalone',
        }));
        setPublicTeams([...leagueTeams, ...standaloneTeams]);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const filteredLeagues = publicLeagues.filter((league) => matchesSearch(league.name, leagueQuery));
  const filteredTeams = publicTeams.filter(
    (team) => matchesSearch(team.name, teamQuery) || matchesSearch(team.leagueName, teamQuery)
  );

  return (
    <main className="space-y-6 bg-[#F7F5F0] -m-4 p-4 md:-m-6 md:p-6">
      {/* Hero: scoreboard band */}
      <DarkPageHeader
        size="hero"
        titleAriaLabel="The Sporty Way"
        eyebrow="The Sporty Way"
        title="Live leagues. Real stats. Every possession."
        description="Browse public basketball leagues, standings, and games from teams currently competing — no login required."
      >
        <dl className="flex flex-wrap gap-x-10 gap-y-5 border-t border-white/10 pt-6">
          <StatReadout value={publicLeagues.length} label="Active leagues" />
          <StatReadout value={publicTeams.length} label="Teams on the board" />
        </dl>
      </DarkPageHeader>

      {/* Discover: leagues, teams, players */}
      <section aria-label="Discover leagues, teams, and players">
        <Tabs
          defaultValue="leagues"
          items={[
            {
              value: 'leagues',
              label: 'Leagues',
              icon: <LeaguesTabIcon />,
              content: (
                <div>
                  <header className="gap-4 pb-4 md:flex md:items-end md:justify-between">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#1B4332]">
                        On the schedule
                      </p>
                      <h2
                        className="mt-1 text-2xl text-slate-900"
                        style={{ fontFamily: "'Archivo Black', sans-serif" }}
                      >
                        Featured Leagues
                      </h2>
                    </div>
                    <label className="mt-4 block md:mt-0 md:w-72">
                      <span className="sr-only">Search leagues</span>
                      <input
                        type="search"
                        value={leagueQuery}
                        onChange={(event) => setLeagueQuery(event.target.value)}
                        placeholder="Search leagues"
                        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[#1B4332] focus:ring-2 focus:ring-[#1B4332]/20"
                      />
                    </label>
                  </header>
                  <p className="max-w-2xl text-slate-600">
                    Standings and games from leagues currently competing.
                  </p>

                  {isLoading ? (
                    <SportsLoader label="Loading featured leagues" className="mt-4" />
                  ) : filteredLeagues.length === 0 ? (
                    <p
                      role="status"
                      className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-4 text-sm text-slate-600"
                    >
                      {publicLeagues.length === 0
                        ? 'No public leagues yet.'
                        : 'No leagues match your search.'}
                    </p>
                  ) : (
                    <ul className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3 list-none p-0">
                      {filteredLeagues.map((league, index) => (
                        <li key={league.id}>
                          <article className="group rounded-xl border border-slate-200 bg-slate-50/60 p-4 transition hover:border-[#F4A300]/60 hover:bg-white">
                            <div className="flex items-center gap-3">
                              <span
                                className="w-8 shrink-0 text-sm text-slate-300"
                                style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                              >
                                {String(index + 1).padStart(2, '0')}
                              </span>
                              <CloudinaryImage
                                src={getLeagueHeaderImage(league)}
                                alt={`${league.name} logo`}
                                width={40}
                                height={40}
                                className="h-10 w-10 shrink-0 rounded-full border border-slate-200 bg-white object-cover"
                                loading="lazy"
                                decoding="async"
                              />
                              <h3
                                className="text-lg font-semibold text-slate-900"
                                aria-label={league.name}
                              >
                                {league.name}
                              </h3>
                            </div>
                            <p className="mt-2 pl-11 text-sm text-slate-600">
                              {league.seasonLabel || 'Season TBD'}
                            </p>
                            <footer className="mt-4 flex flex-wrap gap-4 pl-11 text-sm font-semibold">
                              <Link
                                to={`/league/${league.slug}`}
                                className="text-slate-900 underline decoration-[#F4A300] decoration-2 underline-offset-4 hover:text-[#1B4332]"
                              >
                                Overview
                              </Link>
                              <Link
                                to={`/league/${league.slug}/games`}
                                className="text-slate-900 underline decoration-[#F4A300] decoration-2 underline-offset-4 hover:text-[#1B4332]"
                              >
                                Games
                              </Link>
                            </footer>
                          </article>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ),
            },
            {
              value: 'teams',
              label: 'Teams',
              icon: <TeamsTabIcon />,
              content: (
                <div>
                  <header className="gap-4 pb-4 md:flex md:items-end md:justify-between">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#1B4332]">
                        On the roster
                      </p>
                      <h2
                        className="mt-1 text-2xl text-slate-900"
                        style={{ fontFamily: "'Archivo Black', sans-serif" }}
                      >
                        Featured Teams
                      </h2>
                      <p className="mt-3 max-w-2xl text-slate-600">
                        Open public team pages to review rosters, players, and recent games.
                        Includes league and non-league teams.
                      </p>
                    </div>
                    <label className="mt-4 block md:mt-0 md:w-72">
                      <span className="sr-only">Search teams</span>
                      <input
                        type="search"
                        value={teamQuery}
                        onChange={(event) => setTeamQuery(event.target.value)}
                        placeholder="Search teams"
                        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[#1B4332] focus:ring-2 focus:ring-[#1B4332]/20"
                      />
                    </label>
                  </header>

                  {isLoading ? (
                    <SportsLoader label="Loading featured teams" className="mt-4" />
                  ) : filteredTeams.length === 0 ? (
                    <p
                      role="status"
                      className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-4 text-sm text-slate-600"
                    >
                      {publicTeams.length === 0
                        ? 'No public teams yet.'
                        : 'No teams match your search.'}
                    </p>
                  ) : (
                    <ul className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3 list-none p-0">
                      {filteredTeams.map((team) => {
                        const href =
                          team._kind === 'league'
                            ? `/league/${team.leagueSlug}/teams/${team.slug}`
                            : `/teams/${team.id}`;
                        const subtitle =
                          team._kind === 'league' ? team.leagueName : 'Open public team page';

                        return (
                          <li
                            key={
                              team._kind === 'league' ? `league-team-${team.id}` : `team-${team.id}`
                            }
                          >
                            <Link
                              to={href}
                              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4 transition hover:border-[#F4A300]/60 hover:bg-white"
                            >
                              {team.logo?.url ? (
                                <CloudinaryImage
                                  src={team.logo.url}
                                  alt={`${team.name} logo`}
                                  width={48}
                                  height={48}
                                  className="h-12 w-12 shrink-0 rounded-full border border-slate-200 object-cover"
                                  loading="lazy"
                                  decoding="async"
                                />
                              ) : (
                                <div
                                  aria-hidden="true"
                                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-[#141414] bg-[#141414] text-xs font-semibold text-[#F4A300]"
                                  style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                                >
                                  TSW
                                </div>
                              )}
                              <div>
                                <h3 className="text-lg font-semibold text-slate-900">
                                  {team.name}
                                </h3>
                                <p className="text-sm text-slate-600">{subtitle}</p>
                              </div>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              ),
            },
            {
              value: 'players',
              label: 'Players',
              icon: <PlayersTabIcon />,
              content: <DiscoverablePlayers />,
            },
          ]}
        />
      </section>
    </main>
  );
}
