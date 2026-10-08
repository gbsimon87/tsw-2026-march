import { useEffect, useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { scrimmagesApi } from '../api/scrimmagesApi';
import { formatVideoTime, gameVideoLink } from '../videoTime';

export function ScrimmageGameNavigator({
  scrimmageId,
  sessionId,
  currentGameId,
  currentScore,
  onClose,
  onSelect,
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setData(null);
    scrimmagesApi
      .session(scrimmageId, sessionId)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Could not load this week’s games');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scrimmageId, sessionId, retry]);
  return (
    <Modal open title="This week’s games" onClose={onClose} panelClassName="max-w-2xl">
      <p className="text-sm text-slate-600">
        Playback and the game clock are paused while you browse. Open a game to continue tracking or
        correct its events. Resume playback and the clock when you return.
      </p>
      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Loading games…</p>
      ) : error ? (
        <div className="mt-4">
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
          <button
            type="button"
            className="mt-2 text-sm underline"
            onClick={() => setRetry((count) => count + 1)}
          >
            Retry loading games
          </button>
        </div>
      ) : (
        <>
          <h3 className="mt-4 font-semibold">{data.session.label}</h3>
          {!data.games.length && (
            <p className="mt-3 text-sm text-slate-600">No games in this week yet.</p>
          )}
          <ol className="mt-3 list-none space-y-3 p-0">
            {data.games.map((game) => {
              const current = game.id === currentGameId;
              const score =
                current &&
                currentScore &&
                Number.isFinite(currentScore.home) &&
                Number.isFinite(currentScore.away)
                  ? currentScore
                  : game.finalScore;
              const videoLink = gameVideoLink(data.session.videoUrl, game.videoStartTimestamp);
              return (
                <li
                  key={game.id}
                  aria-current={current ? 'step' : undefined}
                  className={`rounded-xl border p-4 ${current ? 'border-[#1B4332]/40 bg-[#1B4332]/5' : 'border-slate-200'}`}
                >
                  <div className="flex justify-between gap-3">
                    <p className="font-semibold">{game.title}</p>
                    <p className="font-semibold tabular-nums">
                      {score.home}–{score.away}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {current ? 'Current game · ' : ''}
                    {game.status === 'completed'
                      ? 'Completed'
                      : game.status === 'in_progress'
                        ? 'In progress'
                        : 'Ready to track'}{' '}
                    · Video {formatVideoTime(game.videoStartTimestamp || 0)}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-4">
                    <button
                      type="button"
                      className="rounded-lg bg-[#1B4332] px-3 py-2 text-sm font-semibold text-white disabled:bg-slate-200 disabled:text-slate-500"
                      disabled={current}
                      aria-label={
                        current
                          ? 'Tracking this game'
                          : `${game.status === 'completed' ? 'Correct' : 'Track'} ${game.title}`
                      }
                      onClick={() => onSelect(game.id)}
                    >
                      {current
                        ? 'Tracking this game'
                        : game.status === 'completed'
                          ? 'Correct game'
                          : 'Track game'}
                    </button>
                    {videoLink && (
                      <a
                        className="text-sm underline"
                        href={videoLink}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Watch from {formatVideoTime(game.videoStartTimestamp || 0)}
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      )}
      <button type="button" className="mt-5 text-sm underline" onClick={onClose}>
        Return to current game
      </button>
    </Modal>
  );
}
