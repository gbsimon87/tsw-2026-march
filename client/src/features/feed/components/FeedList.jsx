import { useRef } from 'react';
import { useSnapScrollAutoplay } from '../hooks/useSnapScrollAutoplay';
import { FullScreenPost } from './FullScreenPost';
import { FullScreenGameCard } from './posts/FullScreenGameCard';
import { FullScreenImagePost } from './posts/FullScreenImagePost';
import { FullScreenPlayerCard } from './posts/FullScreenPlayerCard';
import { FullScreenTeamCard } from './posts/FullScreenTeamCard';
import { FullScreenVideoPost } from './posts/FullScreenVideoPost';
import { FeedPostCard } from './FeedPostCard';

function FullScreenSlide({ post, onDelete, observeSlide }) {
  let content = null;

  if (post.type === 'image') {
    content = <FullScreenImagePost image={post.image} />;
  } else if (post.type === 'video') {
    content = <FullScreenVideoPost video={post.video} />;
  } else if (post.type === 'game_card') {
    content = <FullScreenGameCard gameCard={post.gameCard} />;
  } else if (post.type === 'player_card') {
    content = <FullScreenPlayerCard playerCard={post.playerCard} />;
  } else if (post.type === 'team_card') {
    content = <FullScreenTeamCard teamCard={post.teamCard} />;
  }

  return (
    <FullScreenPost ref={observeSlide} post={post} onDelete={onDelete}>
      {content}
    </FullScreenPost>
  );
}

export function FeedList({ posts, onDelete, onNearEnd }) {
  const containerRef = useRef(null);
  const { observeSlide } = useSnapScrollAutoplay(containerRef);

  if (!posts.length) {
    return (
      <>
        {/* Mobile empty state */}
        <div className="md:hidden flex h-dvh items-center justify-center bg-slate-950">
          <p className="text-sm text-slate-400">No posts yet.</p>
        </div>
        {/* Desktop empty state */}
        <div className="hidden md:block">
          <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-6 text-sm text-slate-600">
            No posts yet.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      {/* ── Mobile: full-screen snap-scroll ── */}
      <div
        ref={containerRef}
        className="md:hidden fixed inset-0 bottom-16 overflow-y-scroll snap-y snap-mandatory"
        style={{ scrollbarWidth: 'none' }}
        onScroll={(e) => {
          if (!onNearEnd) return;
          const el = e.currentTarget;
          const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
          if (distanceFromBottom < el.clientHeight * 2) {
            onNearEnd();
          }
        }}
      >
        {posts.map((post) => (
          <FullScreenSlide
            key={post.id}
            post={post}
            onDelete={onDelete}
            observeSlide={observeSlide}
          />
        ))}
      </div>

      {/* ── Desktop: card grid ── */}
      <div className="hidden md:block space-y-4">
        {posts.map((post) => (
          <FeedPostCard key={post.id} post={post} onDelete={onDelete} />
        ))}
      </div>
    </>
  );
}
