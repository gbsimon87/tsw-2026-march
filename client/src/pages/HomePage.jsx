import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../app/store/AuthContext';
import { teamsApi } from '../features/teams/api/teamsApi';
import { leaguesApi } from '../features/leagues/api/leaguesApi';
import basketballImage1 from '../assets/home/basketball_image_1.png';
import basketballImage2 from '../assets/home/basketball_image_2.png';
import basketballImage3 from '../assets/home/basketball_image_3.png';

function formatGameDate(game) {
  const rawValue = game.scheduledAt || game.completedAt || game.createdAt || null;
  if (!rawValue) {
    return 'Date unavailable';
  }

  const parsed = new Date(rawValue);
  if (Number.isNaN(parsed.getTime())) {
    return 'Date unavailable';
  }

  return parsed.toLocaleDateString();
}

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
  const { user } = useAuth();
  const [exploreGames, setExploreGames] = useState([]);
  const [publicLeagues, setPublicLeagues] = useState([]);
  const [publicTeams, setPublicTeams] = useState([]);

  useEffect(() => {
    Promise.all([
      teamsApi.listPublicExploreGames().catch(() => ({ games: [] })),
      teamsApi.listPublic().catch(() => ({ teams: [] })),
      leaguesApi.listPublic().catch(() => ({ leagues: [] })),
    ]).then(([gamesResult, teamsResult, leaguesResult]) => {
      setExploreGames(gamesResult.games || []);
      setPublicTeams(teamsResult.teams || []);
      setPublicLeagues(
        (leaguesResult.leagues || []).filter(
          (league) => league.isPublic && league.status === 'active'
        )
      );
    });
  }, []);

  return (
    <main className="space-y-16">
      <section className="rounded-3xl bg-gradient-to-r from-amber-50 via-white to-sky-50 p-8 md:p-12">
        <p className="text-sm font-semibold uppercase tracking-wide text-sky-700">TSW Basketball</p>
        <h1 className="mt-3 max-w-3xl text-3xl font-bold leading-tight text-slate-900 md:text-5xl">
          Turn every game into progress your team can see and feel.
        </h1>
        <p className="mt-4 max-w-2xl text-base text-slate-700 md:text-lg">
          TSW helps teams capture game stats quickly, understand what is working, and stay connected
          to growth all season long.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {user ? (
            <Link
              to="/feed"
              className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
            >
              Go to Feed
            </Link>
          ) : (
            <>
              <Link
                to="/login"
                className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
              >
                Login
              </Link>
              <Link
                to="/register"
                className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
              >
                Register
              </Link>
            </>
          )}
        </div>
      </section>

      {homeAudienceSections.map((section) => {
        const imageIsSecond = section.imageOrder === 'second';

        return (
          <section
            key={section.id}
            aria-labelledby={section.headingId}
            className="grid items-center gap-8 rounded-2xl border border-slate-200 p-6 md:grid-cols-2 md:p-8"
          >
            <div className={imageIsSecond ? 'order-2 md:order-1' : undefined}>
              <h2
                id={section.headingId}
                aria-label={section.title}
                className="text-2xl font-semibold text-slate-900"
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

      <section
        aria-labelledby="active-leagues-heading"
        className="rounded-2xl border border-slate-200 p-6 md:p-8"
      >
        <div>
          <h2 id="active-leagues-heading" className="text-2xl font-semibold text-slate-900">
            Active Leagues
          </h2>
          <p className="mt-2 max-w-2xl text-slate-700">
            Browse public leagues, standings, and games from teams currently competing.
          </p>
        </div>

        {publicLeagues.length === 0 ? (
          <p className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-4 text-sm text-slate-600">
            No public leagues yet.
          </p>
        ) : (
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {publicLeagues.map((league) => (
              <article
                key={league.id}
                className="rounded-xl border border-slate-200 bg-slate-50/60 p-4"
              >
                <h3 aria-label={league.name} className="text-lg font-semibold text-slate-900">
                  {league.name}
                </h3>
                <p className="mt-2 text-sm text-slate-600">{league.seasonLabel || 'Season TBD'}</p>
                <div className="mt-4 flex flex-wrap gap-3 text-sm font-semibold">
                  <Link to={`/league/${league.slug}`} className="text-sky-700 hover:underline">
                    Overview
                  </Link>
                  <Link
                    to={`/league/${league.slug}/games`}
                    className="text-sky-700 hover:underline"
                  >
                    Games
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section
        aria-labelledby="featured-teams-heading"
        className="rounded-2xl border border-slate-200 p-6 md:p-8"
      >
        <div>
          <h2 id="featured-teams-heading" className="text-2xl font-semibold text-slate-900">
            Featured Public Teams
          </h2>
          <p className="mt-2 max-w-2xl text-slate-700">
            Open public team pages to review rosters, players, and recent games.
          </p>
        </div>

        {publicTeams.length === 0 ? (
          <p className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-4 text-sm text-slate-600">
            No public teams yet.
          </p>
        ) : (
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {publicTeams.map((team) => (
              <Link
                key={team.id}
                to={`/teams/${team.id}`}
                className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 transition hover:border-slate-300"
              >
                <div className="flex items-center gap-3">
                  {team.logo?.url ? (
                    <img
                      src={team.logo.url}
                      alt={`${team.name} logo`}
                      className="h-12 w-12 rounded-full border border-slate-200 object-cover"
                    />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-semibold text-slate-500">
                      TSW
                    </div>
                  )}
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">{team.name}</h3>
                    <p className="text-sm text-slate-600">Open public team page</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section
        aria-labelledby="explore-heading"
        className="rounded-2xl border border-slate-200 p-6 md:p-8"
      >
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 id="explore-heading" className="text-2xl font-semibold text-slate-900">
              Explore
            </h2>
            <p className="mt-2 max-w-2xl text-slate-700">
              See the latest public games across teams, with one recent game per team to keep the
              feed varied and useful.
            </p>
          </div>
        </div>

        {exploreGames.length === 0 ? (
          <p className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-4 text-sm text-slate-600">
            No public games to explore yet.
          </p>
        ) : (
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {exploreGames.map((game) => {
              const primaryText = game.opponent || game.title || 'Opponent TBD';

              return (
                <article
                  key={game.id}
                  className="rounded-xl border border-slate-200 bg-slate-50/60 p-4"
                >
                  <Link
                    to={`/teams/${game.team.id}`}
                    className="text-xs font-semibold uppercase tracking-wide text-sky-700 underline decoration-sky-200 underline-offset-4 transition hover:text-sky-800 hover:decoration-sky-500"
                  >
                    {game.team.name}
                  </Link>
                  <h3 className="mt-2 text-lg font-semibold text-slate-900">{primaryText}</h3>
                  <p className="mt-2 text-sm text-slate-600">
                    {formatGameDate(game)}
                    {typeof game.teamPoints === 'number' ? ` • ${game.teamPoints} pts` : ''}
                  </p>
                  <div className="mt-4">
                    <Link
                      to={`/games/${game.id}`}
                      aria-label={`Open ${primaryText}`}
                      className="text-sm font-semibold text-slate-900 underline decoration-slate-300 underline-offset-4 transition hover:text-sky-700 hover:decoration-sky-500"
                    >
                      View game
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
