import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../../app/store/AuthContext';
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
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const composeRedirectTarget = useMemo(() => '/feed?compose=1', []);
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

  async function onDelete(postId) {
    try {
      await feedApi.deletePost(postId);
      setPosts((current) => current.filter((post) => post.id !== postId));
    } catch (deleteError) {
      setError(deleteError.message || 'Failed to delete post');
    }
  }

  function onCreated(post) {
    setPosts((current) => [post, ...current]);
    closeComposer();
  }

  function openComposer() {
    if (user) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set('compose', '1');
      setSearchParams(nextParams, { replace: true });
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
    return <p className="text-sm">Loading feed...</p>;
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6">
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <FeedList posts={posts} onDelete={onDelete} />

      {nextCursor ? (
        <div className="flex justify-center">
          <button
            type="button"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
            disabled={isLoadingMore}
            onClick={async () => {
              setIsLoadingMore(true);
              try {
                await loadFeed(nextCursor, true);
              } catch (loadMoreError) {
                setError(loadMoreError.message || 'Failed to load more posts');
              } finally {
                setIsLoadingMore(false);
              }
            }}
          >
            {isLoadingMore ? 'Loading...' : 'Load More'}
          </button>
        </div>
      ) : null}

      <FloatingActionButton label="Create post" onClick={openComposer} />
      <Modal open={isComposerOpen} onClose={closeComposer} title="Create Post">
        <FeedComposer onCreated={onCreated} onCancel={closeComposer} />
      </Modal>
    </main>
  );
}
