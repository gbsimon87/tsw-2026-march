import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { Breadcrumbs } from '../../../components/Breadcrumbs';
import { PageHeader } from '../../../components/PageHeader';
import { SportsLoader } from '../../../components/SportsLoader';
import { leaguesApi } from '../api/leaguesApi';
import { getLeagueHeaderImage } from '../../feed/cardImage';
import { LeagueGameCard } from '../../../components/ui/LeagueGameCard';
import { CloudinaryImage } from '../../media/CloudinaryImage';
import { usePublicLeague } from '../hooks/usePublicLeague';

export function PublicLeagueGamesPage() {
  const { leagueSlug } = useParams();
  const {
    data: league,
    isLoading: isLeagueLoading,
    isError: isLeagueError,
  } = usePublicLeague(leagueSlug);
  const {
    data: gamesData,
    isLoading: isGamesLoading,
    isError: isGamesError,
  } = useQuery({
    queryKey: ['publicLeagueGames', leagueSlug],
    queryFn: () => leaguesApi.getPublicGames(leagueSlug),
    enabled: Boolean(leagueSlug),
  });

  const games = gamesData?.games || [];
  const isLoading = isLeagueLoading || isGamesLoading;
  const error = isLeagueError || isGamesError ? 'Failed to load games' : '';

  if (isLoading) {
    return <SportsLoader label="Loading league games" fullPage />;
  }

  if (!league) {
    return <p className="text-sm text-red-600">{error || 'League not found'}</p>;
  }

  const breadcrumbs = [
    { label: 'Discover', href: '/home' },
    { label: league.name, href: `/league/${league.slug}` },
    { label: 'Games' },
  ];

  return (
    <main className="space-y-8">
      <Breadcrumbs crumbs={breadcrumbs} />
      <PageHeader
        eyebrow="Public League Games"
        title={league.name}
        description={`${league.seasonLabel || 'Season TBD'} schedule and completed results.`}
        media={
          <CloudinaryImage
            src={getLeagueHeaderImage(league)}
            alt={`${league.name} logo`}
            width={64}
            height={64}
            loading="eager"
            decoding="async"
            srcSetWidths={[64, 128, 192]}
            sizes="64px"
            className="h-16 w-16 rounded-full border border-slate-200 bg-white object-cover"
          />
        }
      >
        <div className="flex flex-wrap gap-3 text-sm">
          <Link to={`/league/${league.slug}`} className="font-medium text-sky-700 hover:underline">
            League overview
          </Link>
          <Link
            to={`/league/${league.slug}/standings`}
            className="font-medium text-sky-700 hover:underline"
          >
            League standings
          </Link>
        </div>
      </PageHeader>

      <section>
        {games.length === 0 ? (
          <p className="text-sm text-slate-600">No league games yet.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {games.map((game) => (
              <LeagueGameCard key={game.id} game={game} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
