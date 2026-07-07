import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../../../components/PageHeader';
import { SportsLoader } from '../../../components/SportsLoader';
import { teamsApi } from '../api/teamsApi';

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

export function OpponentPlaceholderPage() {
  const { opponentSlug } = useParams();
  // OPT-014b: read migrated to React Query, keyed by opponentSlug so navigating
  // between opponents caches each one.
  const {
    data,
    isLoading,
    isError,
    error: queryError,
  } = useQuery({
    queryKey: ['publicOpponent', opponentSlug],
    queryFn: () => teamsApi.getPublicOpponentBySlug(opponentSlug),
    enabled: Boolean(opponentSlug),
  });

  const error = isError ? queryError?.message || 'Failed to load opponent' : '';

  if (isLoading) {
    return <SportsLoader label="Loading opponent" fullPage />;
  }

  if (!data) {
    return <p className="text-sm text-red-600">{error || 'Opponent not found'}</p>;
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        eyebrow="Opponent"
        title={data.opponent.displayName}
        description="This opponent does not have a public team page on TSW yet."
      />

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Games tracked against this opponent
        </p>
        <p className="mt-2 text-3xl font-bold text-slate-900">{data.summary.gamesCount}</p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-slate-900">Related Games</h2>
        </div>

        <div className="mt-4 space-y-3">
          {data.relatedGames.map((game) => (
            <article
              key={game.id}
              className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="space-y-1">
                <Link
                  to={`/teams/${game.team.id}`}
                  className="font-medium text-slate-900 underline decoration-slate-300 underline-offset-4 transition hover:text-sky-700 hover:decoration-sky-500"
                >
                  {game.team.name}
                </Link>
                <p className="text-sm text-slate-600">
                  {formatGameDate(game)}
                  {typeof game.teamPoints === 'number' ? ` • ${game.teamPoints} pts` : ''}
                </p>
              </div>
              <Link
                to={`/games/${game.id}`}
                className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
              >
                View game
              </Link>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
