import { Link } from 'react-router-dom';

export function ScrimmageResultsReview({ session, games, busy, onPublish }) {
  const unfinished = games.some((game) => game.status !== 'completed');
  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-xl font-bold">Review weekly results</h2>
      <p className="text-sm text-slate-600">
        {session.publishedAt
          ? 'Published. Corrections update these results immediately.'
          : 'Draft standings and player plays are visible to admins. Review scores and video coverage before publishing.'}
      </p>
      {!games.length && <p className="text-sm text-slate-600">No games to publish yet.</p>}
      <ul className="list-none space-y-3 p-0">
        {games.map((game) => (
          <li key={game.id} className="rounded-lg border border-slate-200 p-3">
            <div className="flex justify-between gap-3">
              <Link className="font-semibold underline" to={`/games/${game.id}/track`}>
                {game.title}
              </Link>
              <span>
                {game.finalScore.home}–{game.finalScore.away}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-600">
              {game.status === 'completed' ? 'Finished' : 'Unfinished'} · {game.statCount ?? 0} stat
              events · {game.missingTimestamps ?? 0} missing video timestamps
            </p>
            {game.missingTimestamps > 0 && (
              <p className="mt-1 text-xs text-amber-700">
                These plays will have no video clip until their timestamps are corrected.
              </p>
            )}
          </li>
        ))}
      </ul>
      {!session.videoUrl && (
        <p className="text-sm text-amber-700">
          No weekly recording attached. Player video clips will be unavailable.
        </p>
      )}
      {!session.publishedAt && (
        <button
          className="rounded-lg bg-[#1B4332] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          disabled={busy || unfinished || !games.length || session.status !== 'completed'}
          onClick={onPublish}
        >
          {busy ? 'Publishing…' : 'Publish results'}
        </button>
      )}
      {session.status === 'open' && (
        <p className="text-xs text-slate-500">
          Finish all games and the weekly session before publishing.
        </p>
      )}
    </section>
  );
}
