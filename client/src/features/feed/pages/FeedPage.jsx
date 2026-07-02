import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../../app/store/AuthContext';
import { trackEvent } from '../../analytics/trackEvent';
import { SportsLoader } from '../../../components/SportsLoader';
import { FloatingActionButton } from '../../../components/ui/FloatingActionButton';
import { Modal } from '../../../components/ui/Modal';
import { feedApi } from '../api/feedApi';
import { FeedComposer } from '../components/FeedComposer';
import { FeedList } from '../components/FeedList';

export function FeedPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [posts, setPosts] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const isLoadingMoreRef = useRef(false);
  const composeRedirectTarget = useMemo(() => '/pulse?compose=1', []);
  const isComposerOpen = Boolean(user) && searchParams.get('compose') === '1';

  async function loadFeed(cursor = null, append = false) {
    const result = await feedApi.listFeed({ cursor });
    setPosts((current) => (append ? [...current, ...(result.posts || [])] : result.posts || []));
    setNextCursor(result.nextCursor || null);
  }

  useEffect(() => {
    loadFeed()
      .catch((loadError) => setError(loadError.message || 'Failed to load feed'))
      .finally(() => setIsLoading(false));
  }, []);

  async function loadMore() {
    if (isLoadingMoreRef.current || !nextCursor) return;
    isLoadingMoreRef.current = true;
    trackEvent('feed_load_more');
    try {
      await loadFeed(nextCursor, true);
    } catch (loadMoreError) {
      setError(loadMoreError.message || 'Failed to load more posts');
    } finally {
      isLoadingMoreRef.current = false;
    }
  }

  async function onDelete(postId) {
    try {
      await feedApi.deletePost(postId);
      setPosts((current) => current.filter((post) => post.id !== postId));
      trackEvent('feed_post_deleted');
    } catch (deleteError) {
      setError(deleteError.message || 'Failed to delete post');
    }
  }

  function onCreated(post) {
    setPosts((current) => [post, ...current]);
    trackEvent('feed_post_created', { post_type: post.type || 'unknown' });
    closeComposer();
  }

  function openComposer() {
    if (user) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set('compose', '1');
      setSearchParams(nextParams, { replace: true });
      trackEvent('feed_composer_opened');
      return;
    }
    navigate(`/login?redirectTo=${encodeURIComponent(composeRedirectTarget)}`);
  }

  function closeComposer() {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('compose');
    setSearchParams(nextParams, { replace: true });
  }

  if (isLoading) {
    return <SportsLoader label="Loading feed" fullPage />;
  }

  return (
    <>
      {error ? (
        <p className="fixed left-4 right-4 top-20 z-50 rounded-lg bg-red-600 px-4 py-2 text-sm text-white shadow-lg md:static md:mb-4">
          {error}
        </p>
      ) : null}

      {/* FeedList handles its own layout: fixed snap-scroll on mobile, normal flow on desktop */}
      <FeedList posts={posts} onDelete={onDelete} onNearEnd={loadMore} />

      {/* FAB — lifted above the tab bar on mobile */}
      <FloatingActionButton
        label="Create post"
        onClick={openComposer}
        className="bottom-[calc(4rem+env(safe-area-inset-bottom,0px)+1rem)] md:bottom-6"
      />

      <Modal open={isComposerOpen} onClose={closeComposer} title="Create Post">
        <FeedComposer onCreated={onCreated} onCancel={closeComposer} />
      </Modal>
    </>
  );
}
