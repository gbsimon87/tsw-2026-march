import { forwardRef } from 'react';

function formatTimestamp(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleString();
}

export const FullScreenPost = forwardRef(function FullScreenPost(
  { post, onDelete, children },
  ref
) {
  return (
    <div
      ref={ref}
      data-feed-slide
      className="relative flex h-dvh w-full flex-shrink-0 snap-start items-stretch overflow-hidden bg-slate-950"
    >
      {/* Content fills the full slide */}
      <div className="absolute inset-0">{children}</div>

      {/* Bottom overlay: creator info + delete */}
      <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-4 pb-20">
        <div className="flex items-end justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {/* Avatar */}
            {post.creator.avatarUrl ? (
              <img
                src={post.creator.avatarUrl}
                alt={post.creator.name}
                className="h-10 w-10 shrink-0 rounded-full border-2 border-white/30 object-cover"
              />
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-white/30 bg-white/20 text-sm font-black text-white backdrop-blur-sm">
                {post.creator.name.charAt(0).toUpperCase()}
              </div>
            )}

            {/* Name, caption, timestamp */}
            <div className="min-w-0">
              <p className="text-sm font-bold uppercase tracking-[0.14em] text-white drop-shadow">
                {post.creator.name}
              </p>
              {post.caption ? (
                <p className="mt-0.5 max-w-[70vw] truncate text-sm text-white/80 drop-shadow">
                  {post.caption}
                </p>
              ) : null}
              <p className="mt-0.5 text-xs text-white/50">{formatTimestamp(post.createdAt)}</p>
            </div>
          </div>

          {post.canDelete ? (
            <button
              type="button"
              onClick={() => onDelete(post.id)}
              className="shrink-0 rounded-full border border-red-400/60 bg-black/40 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-red-400 backdrop-blur-sm"
            >
              Delete
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
});
