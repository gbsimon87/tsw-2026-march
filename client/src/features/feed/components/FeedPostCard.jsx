import { GameCardPost } from './posts/GameCardPost';
import { ImagePostCard } from './posts/ImagePostCard';
import { PlayerCardPost } from './posts/PlayerCardPost';
import { TeamCardPost } from './posts/TeamCardPost';

function formatTimestamp(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  return parsed.toLocaleString();
}

export function FeedPostCard({ post, onDelete }) {
  let content = null;

  if (post.type === 'image') {
    content = <ImagePostCard image={post.image} caption={post.caption} />;
  } else if (post.type === 'game_card') {
    content = (
      <div className="space-y-3">
        {post.caption ? <p className="text-sm text-slate-700">{post.caption}</p> : null}
        {post.gameCard ? (
          <GameCardPost gameCard={post.gameCard} />
        ) : (
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5">
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5 shrink-0 text-slate-400"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
            <p className="text-sm text-slate-500">This game is no longer available.</p>
          </div>
        )}
      </div>
    );
  } else if (post.type === 'player_card') {
    content = (
      <div className="space-y-3">
        {post.caption ? <p className="text-sm text-slate-700">{post.caption}</p> : null}
        <PlayerCardPost playerCard={post.playerCard} />
      </div>
    );
  } else if (post.type === 'team_card') {
    content = (
      <div className="space-y-3">
        {post.caption ? <p className="text-sm text-slate-700">{post.caption}</p> : null}
        <TeamCardPost teamCard={post.teamCard} />
      </div>
    );
  }

  return (
    <article className="space-y-4 rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/60">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-slate-900">
            {post.creator.name}
          </p>
          <p className="mt-1 text-xs font-medium text-slate-500">
            {formatTimestamp(post.createdAt)}
          </p>
        </div>
        {post.canDelete ? (
          <button
            type="button"
            onClick={() => onDelete(post.id)}
            className="rounded-full border border-red-200 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-red-600 hover:bg-red-50"
          >
            Delete
          </button>
        ) : null}
      </div>
      {content}
    </article>
  );
}
