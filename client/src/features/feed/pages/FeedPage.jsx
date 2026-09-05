import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../../app/store/AuthContext';
import { trackEvent } from '../../analytics/trackEvent';
import { SIGNUP_SOURCE, trackSignupCtaClicked } from '../../analytics/signupEvents';
import { SportsLoader } from '../../../components/SportsLoader';
import { FloatingActionButton } from '../../../components/ui/FloatingActionButton';
import { Modal } from '../../../components/ui/Modal';
import { setPendingInstagramDraft } from '../../social/instagramDraftHandoff';
import { feedApi } from '../api/feedApi';
import { FeedComposer } from '../components/FeedComposer';
import { FeedList } from '../components/FeedList';

const FEED_QUERY_KEY = ['feed'];

export function FeedPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [error, setError] = useState('');
  const composeRedirectTarget = useMemo(() => '/pulse?compose=1', []);
  const isComposerOpen = Boolean(user) && searchParams.get('compose') === '1';
  // Cosmetic gate only — /admin/social/instagram and every Instagram route
  // behind it are enforced server-side by platformOperatorMiddleware.
  const isPlatformOperator = Boolean(user?.roles?.includes('platform_operator'));

  const {
    data,
    isLoading,
    isError,
    error: queryError,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: FEED_QUERY_KEY,
    queryFn: ({ pageParam }) => feedApi.listFeed({ cursor: pageParam }),
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
  });

  const posts = useMemo(() => data?.pages.flatMap((page) => page.posts || []) || [], [data]);

  async function loadMore() {
    if (isFetchingNextPage || !hasNextPage) return;
    trackEvent('feed_load_more');
    try {
      await fetchNextPage();
    } catch (loadMoreError) {
      setError(loadMoreError.message || 'Failed to load more posts');
    }
  }

  async function onDelete(postId) {
    try {
      await feedApi.deletePost(postId);
      queryClient.setQueryData(FEED_QUERY_KEY, (current) => ({
        ...current,
        pages: current.pages.map((page) => ({
          ...page,
          posts: (page.posts || []).filter((post) => post.id !== postId),
        })),
      }));
      trackEvent('feed_post_deleted');
    } catch (deleteError) {
      setError(deleteError.message || 'Failed to delete post');
    }
  }

  function onCreated(post) {
    queryClient.setQueryData(FEED_QUERY_KEY, (current) => {
      if (!current || current.pages.length === 0) {
        return { pages: [{ posts: [post], nextCursor: null }], pageParams: [null] };
      }
      const [firstPage, ...restPages] = current.pages;
      return {
        ...current,
        pages: [{ ...firstPage, posts: [post, ...(firstPage.posts || [])] }, ...restPages],
      };
    });
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
    trackSignupCtaClicked(SIGNUP_SOURCE.FEED_COMPOSER);
    navigate(`/register?redirectTo=${encodeURIComponent(composeRedirectTarget)}`);
  }

  function closeComposer() {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('compose');
    setSearchParams(nextParams, { replace: true });
  }

  // Hands the rendered card to the Instagram review screen. Nothing is created
  // or published here — the operator still writes the caption, signs both
  // declarations, and approves there.
  function prepareInstagramPost(draft) {
    setPendingInstagramDraft(draft);
    navigate('/admin/social/instagram');
  }

  if (isLoading) {
    return <SportsLoader label="Loading feed" fullPage />;
  }

  const displayedError = error || (isError && (queryError?.message || 'Failed to load feed'));

  return (
    <>
      {displayedError ? (
        <p className="fixed left-4 right-4 top-20 z-50 rounded-lg bg-red-600 px-4 py-2 text-sm text-white shadow-lg md:static md:mb-4">
          {displayedError}
        </p>
      ) : null}

      {!user ? (
        <div className="fixed left-1/2 top-16 z-30 -translate-x-1/2 md:hidden">
          <Link
            to="/register"
            onClick={() => trackSignupCtaClicked(SIGNUP_SOURCE.PULSE)}
            className="inline-flex whitespace-nowrap rounded-full bg-[#F4A300] px-4 py-2 text-sm font-semibold text-[#141414] shadow-lg transition-colors hover:bg-[#d98f00]"
          >
            Join The Sporty Way
          </Link>
        </div>
      ) : null}

      {/* FeedList handles its own layout: fixed snap-scroll on mobile, normal flow on desktop */}
      <FeedList
        posts={posts}
        onDelete={onDelete}
        onNearEnd={loadMore}
        onPrepareInstagram={isPlatformOperator ? prepareInstagramPost : undefined}
      />

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
