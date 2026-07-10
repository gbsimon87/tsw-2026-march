import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import CloudinaryImage from '../features/media/CloudinaryImage';
import { teamsApi } from '../features/teams/api/teamsApi';
import { leaguesApi } from '../features/leagues/api/leaguesApi';
import { DiscoverablePlayers } from '../features/players/components/DiscoverablePlayers';
import { getLeagueHeaderImage } from '../features/feed/cardImage';
import { SportsLoader } from '../components/SportsLoader';
import { useDocumentMeta } from '../hooks/useDocumentMeta';
import { resolveShareImage } from '../hooks/resolveShareImage';
import { DarkPageHeader } from '../components/DarkPageHeader';
import basketballImage1 from '../assets/home/basketball_image_1.png';
import basketballImage2 from '../assets/home/basketball_image_2.png';
import basketballImage3 from '../assets/home/basketball_image_3.png';

const homeAudienceSections = [
  {
    id: 'players',
    headingId: 'players-heading',
    tag: 'Players',
    title: 'Know your game. Keep improving.',
    body: 'Track your performance across games, spot strengths and weaknesses faster, and build confidence with clear evidence of your development over time.',
    imageSrc: basketballImage1,
    imageAlt: 'Players reviewing basketball progress and development',
    imageOrder: 'first',
  },
  {
    id: 'managers',
    headingId: 'managers-heading',
    tag: 'Coaches',
    title: 'See what matters, fast.',
    body: 'Understand team and player performance at a glance, review meaningful insights without extra noise, and make better game-time and training decisions with clearer data.',
    imageSrc: basketballImage2,
    imageAlt: 'Coaches and managers using basketball performance insights',
    imageOrder: 'second',
  },
  {
    id: 'family',
    headingId: 'family-heading',
    tag: 'Family',
    title: 'Stay close to every milestone.',
    body: 'Follow games, keep up with player progress, and celebrate key achievements as the team grows together throughout the season.',
    imageSrc: basketballImage3,
    imageAlt: 'Friends and family following basketball team highlights',
    imageOrder: 'first',
  },
];

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

export function HomePage() {
  const [publicLeagues, setPublicLeagues] = useState([]);
  const [publicTeams, setPublicTeams] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

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

      {/* Featured Leagues */}
      <section
        aria-labelledby="active-leagues-heading"
        className="rounded-2xl bg-white border border-slate-200 p-6 md:p-8"
      >
        <header className="flex items-baseline justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#1B4332]">
              On the schedule
            </p>
            <h2
              id="active-leagues-heading"
              className="mt-1 text-2xl text-slate-900"
              style={{ fontFamily: "'Archivo Black', sans-serif" }}
            >
              Featured Leagues
            </h2>
          </div>
        </header>
        <p className="mt-4 max-w-2xl text-slate-600">
          Standings and games from leagues currently competing.
        </p>

        {isLoading ? (
          <SportsLoader label="Loading featured leagues" className="mt-4" />
        ) : publicLeagues.length === 0 ? (
          <p
            role="status"
            className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-4 text-sm text-slate-600"
          >
            No public leagues yet.
          </p>
        ) : (
          <ul className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3 list-none p-0">
            {publicLeagues.map((league, index) => (
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
                    <h3 className="text-lg font-semibold text-slate-900" aria-label={league.name}>
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
      </section>

      {/* Featured Teams */}
      <section
        aria-labelledby="featured-teams-heading"
        className="rounded-2xl bg-white border border-slate-200 p-6 md:p-8"
      >
        <header className="border-b border-slate-100 pb-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#1B4332]">
            On the roster
          </p>
          <h2
            id="featured-teams-heading"
            className="mt-1 text-2xl text-slate-900"
            style={{ fontFamily: "'Archivo Black', sans-serif" }}
          >
            Featured Teams
          </h2>
          <p className="mt-3 max-w-2xl text-slate-600">
            Open public team pages to review rosters, players, and recent games. Includes league and
            non-league teams.
          </p>
        </header>

        {isLoading ? (
          <SportsLoader label="Loading featured teams" className="mt-4" />
        ) : publicTeams.length === 0 ? (
          <p
            role="status"
            className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-4 text-sm text-slate-600"
          >
            No public teams yet.
          </p>
        ) : (
          <ul className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3 list-none p-0">
            {publicTeams.map((team) => {
              const href =
                team._kind === 'league'
                  ? `/league/${team.leagueSlug}/teams/${team.slug}`
                  : `/teams/${team.id}`;
              const subtitle = team._kind === 'league' ? team.leagueName : 'Open public team page';

              return (
                <li key={team._kind === 'league' ? `league-team-${team.id}` : `team-${team.id}`}>
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
                      <h3 className="text-lg font-semibold text-slate-900">{team.name}</h3>
                      <p className="text-sm text-slate-600">{subtitle}</p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <DiscoverablePlayers />

      {/* Audience sections */}
      {homeAudienceSections.map((section) => {
        const imageIsSecond = section.imageOrder === 'second';

        return (
          <section
            key={section.id}
            aria-labelledby={section.headingId}
            className="grid items-center gap-6 rounded-2xl bg-white border border-slate-200 p-6 md:grid-cols-2 md:p-8"
          >
            <div className={imageIsSecond ? 'order-2 md:order-1' : undefined}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#F4A300]">
                {section.tag}
              </p>
              <h2
                id={section.headingId}
                className="mt-2 text-2xl text-slate-900 md:text-3xl"
                style={{ fontFamily: "'Archivo Black', sans-serif" }}
              >
                {section.title}
              </h2>
              <p className="mt-3 text-slate-700">{section.body}</p>
            </div>
            <div
              className={`h-56 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 md:h-72 ${
                imageIsSecond ? 'order-1 md:order-2' : ''
              }`.trim()}
            >
              <CloudinaryImage
                src={section.imageSrc}
                alt={section.imageAlt}
                width={600}
                height={288}
                className="h-full w-full object-cover"
                loading={section === homeAudienceSections[0] ? 'eager' : 'lazy'}
                decoding="async"
              />
            </div>
          </section>
        );
      })}
    </main>
  );
}
