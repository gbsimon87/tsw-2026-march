import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { teamsApi } from '../features/teams/api/teamsApi';
import { leaguesApi } from '../features/leagues/api/leaguesApi';
import { getLeagueHeaderImage } from '../features/feed/cardImage';
import { SportsLoader } from '../components/SportsLoader';
import { useDocumentMeta } from '../hooks/useDocumentMeta';
import { resolveShareImage } from '../hooks/resolveShareImage';
import basketballImage1 from '../assets/home/basketball_image_1.png';
import basketballImage2 from '../assets/home/basketball_image_2.png';
import basketballImage3 from '../assets/home/basketball_image_3.png';

const homeAudienceSections = [
  {
    id: 'players',
    headingId: 'players-heading',
    title: 'For Players: Know your game and keep improving',
    body: 'Track your performance across games, spot strengths and weaknesses faster, and build confidence with clear evidence of your development over time.',
    imageSrc: basketballImage1,
    imageAlt: 'Players reviewing basketball progress and development',
    imageOrder: 'first',
  },
  {
    id: 'managers',
    headingId: 'managers-heading',
    title: 'For Managers and Coaches: See what matters quickly',
    body: 'Understand team and player performance at a glance, review meaningful insights without extra noise, and make better game-time and training decisions with clearer data.',
    imageSrc: basketballImage2,
    imageAlt: 'Coaches and managers using basketball performance insights',
    imageOrder: 'second',
  },
  {
    id: 'family',
    headingId: 'family-heading',
    title: 'For Friends and Family: Stay close to every milestone',
    body: 'Follow games, keep up with player progress, and celebrate key achievements as the team grows together throughout the season.',
    imageSrc: basketballImage3,
    imageAlt: 'Friends and family following basketball team highlights',
    imageOrder: 'first',
  },
];

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
    <main className="space-y-6">
      <section
        aria-labelledby="active-leagues-heading"
        className="rounded-2xl bg-white border border-slate-200 p-6 md:p-8"
      >
        <header>
          <h2 id="active-leagues-heading" className="text-2xl font-semibold text-slate-900">
            Featured Leagues
          </h2>
          <p className="mt-2 max-w-2xl text-slate-700">
            Browse public leagues, standings, and games from teams currently competing.
          </p>
        </header>

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
            {publicLeagues.map((league) => (
              <li key={league.id}>
                <article className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                  <div className="flex items-center gap-3">
                    <img
                      src={getLeagueHeaderImage(league)}
                      alt={`${league.name} logo`}
                      className="h-10 w-10 shrink-0 rounded-full border border-slate-200 bg-white object-cover"
                    />
                    <h3 className="text-lg font-semibold text-slate-900" aria-label={league.name}>
                      {league.name}
                    </h3>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    {league.seasonLabel || 'Season TBD'}
                  </p>
                  <footer className="mt-4 flex flex-wrap gap-3 text-sm font-semibold">
                    <Link to={`/league/${league.slug}`} className="text-sky-700 hover:underline">
                      Overview
                    </Link>
                    <Link
                      to={`/league/${league.slug}/games`}
                      className="text-sky-700 hover:underline"
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

      <section
        aria-labelledby="featured-teams-heading"
        className="rounded-2xl bg-white border border-slate-200 p-6 md:p-8"
      >
        <header>
          <h2 id="featured-teams-heading" className="text-2xl font-semibold text-slate-900">
            Featured Teams
          </h2>
          <p className="mt-2 max-w-2xl text-slate-700">
            Open public team pages to review rosters, players, and recent games.
          </p>
          <p className="mt-2 max-w-2xl text-slate-700">Includes league and non-league teams.</p>
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
                    className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4 transition hover:border-slate-300"
                  >
                    {team.logo?.url ? (
                      <img
                        src={team.logo.url}
                        alt={`${team.name} logo`}
                        className="h-12 w-12 shrink-0 rounded-full border border-slate-200 object-cover"
                      />
                    ) : (
                      <div
                        aria-hidden="true"
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-semibold text-slate-500"
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

      {homeAudienceSections.map((section) => {
        const imageIsSecond = section.imageOrder === 'second';

        return (
          <section
            key={section.id}
            aria-labelledby={section.headingId}
            className="grid items-center gap-6 rounded-2xl bg-white border border-slate-200 p-6 md:grid-cols-2 md:p-8"
          >
            <div className={imageIsSecond ? 'order-2 md:order-1' : undefined}>
              <h2
                id={section.headingId}
                className="text-2xl font-semibold text-slate-900"
                aria-label={section.title}
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
              <img
                src={section.imageSrc}
                alt={section.imageAlt}
                className="h-full w-full object-cover"
              />
            </div>
          </section>
        );
      })}
    </main>
  );
}
