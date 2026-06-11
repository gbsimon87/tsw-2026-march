import { useEffect, useRef } from 'react';
import { useIsMobileDevice } from '../hooks/useIsMobileDevice';
import { useSnapScrollAutoplay } from '../hooks/useSnapScrollAutoplay';
import { FullScreenPost } from './FullScreenPost';
import { FullScreenGameCard } from './posts/FullScreenGameCard';
import { FullScreenHighlightClipPost } from './posts/FullScreenHighlightClipPost';
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
  } else if (post.type === 'highlight_clip') {
    content = <FullScreenHighlightClipPost highlightClip={post.highlightClip} />;
  }

  return (
    <FullScreenPost ref={observeSlide} post={post} onDelete={onDelete}>
      {content}
    </FullScreenPost>
  );
}

export function FeedList({ posts, onDelete, onNearEnd }) {
  const isMobile = useIsMobileDevice();
  const containerRef = useRef(null);
  const sentinelRef = useRef(null);
  const { observeSlide } = useSnapScrollAutoplay(containerRef);

  // Desktop: trigger onNearEnd when the sentinel at the bottom of the list comes into view.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !onNearEnd) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) onNearEnd();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [onNearEnd]);

  if (!posts.length) {
    return isMobile ? (
      <div className="flex h-dvh items-center justify-center bg-slate-950">
        <p className="text-sm text-slate-400">No posts yet.</p>
      </div>
    ) : (
      <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-6 text-sm text-slate-600">
        No posts yet.
      </p>
    );
  }

  if (isMobile) {
    return (
      <div
        ref={containerRef}
        className="fixed inset-0 overflow-y-scroll snap-y snap-mandatory"
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
    );
  }

  return (
    <div className="space-y-4">
      {posts.map((post) => (
        <FeedPostCard key={post.id} post={post} onDelete={onDelete} />
      ))}
      <div ref={sentinelRef} className="h-px" />
    </div>
  );
}
