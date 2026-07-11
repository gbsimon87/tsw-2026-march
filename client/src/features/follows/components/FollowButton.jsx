import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../app/store/AuthContext';
import { followsApi } from '../api/followsApi';
import { useFollowStatus, followStatusQueryKey } from '../hooks/useFollowStatus';
import { FOLLOWING_QUERY_KEY } from '../hooks/useFollowing';

const baseClass =
  'inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60';

// Follow/unfollow toggle for a target user account. Only signed-in users can
// follow (decision D6): logged-out visitors get a "Log in to follow" CTA, and
// the button is hidden when viewing your own account. Mutations are plain async
// followsApi calls + manual setQueryData (repo convention — no useMutation).
export function FollowButton({ targetUserId, size = 'default', className = '' }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const isOwnAccount = user && String(user.id) === String(targetUserId);
  const canQuery = Boolean(user) && !isOwnAccount;

  const { data: statuses } = useFollowStatus([targetUserId], { enabled: canQuery });
  const isFollowing = Boolean(statuses?.[String(targetUserId)]);

  // Never render for your own account.
  if (isOwnAccount) {
    return null;
  }

  // Logged-out: explicit CTA to sign in rather than a silent no-op.
  if (!user) {
    return (
      <Link
        to="/login"
        className={`${baseClass} border border-[#141414] text-[#141414] hover:bg-[#141414] hover:text-white ${className}`}
      >
        Log in to follow
      </Link>
    );
  }

  async function onToggle() {
    if (pending) return;
    setPending(true);
    setError('');

    const nextFollowing = !isFollowing;
    try {
      if (nextFollowing) {
        await followsApi.follow(targetUserId);
      } else {
        await followsApi.unfollow(targetUserId);
      }

      // Flip this target's cached status.
      queryClient.setQueryData(followStatusQueryKey([targetUserId]), (current) => ({
        ...(current?.statuses ? current : { statuses: {} }),
        statuses: { ...(current?.statuses || {}), [String(targetUserId)]: nextFollowing },
      }));

      // On unfollow, drop the card from the Following list cache immediately;
      // on follow, invalidate by removing so the list refetches with the new
      // card (it needs the hydrated name/avatar the button doesn't have).
      queryClient.setQueryData(FOLLOWING_QUERY_KEY, (current) => {
        if (!current?.following) return current;
        if (nextFollowing) return current;
        return {
          ...current,
          following: current.following.filter(
            (entry) => String(entry.userId) !== String(targetUserId)
          ),
        };
      });
      if (nextFollowing) {
        queryClient.removeQueries({ queryKey: FOLLOWING_QUERY_KEY });
      }
    } catch (toggleError) {
      setError(toggleError.message || 'Something went wrong');
    } finally {
      setPending(false);
    }
  }

  const sizeClass = size === 'compact' ? 'px-3 py-1 text-xs' : '';
  const styleClass = isFollowing
    ? 'border border-slate-300 bg-white text-slate-700 hover:border-[#F4A300] hover:text-[#141414]'
    : 'bg-[#141414] text-white hover:bg-[#1B4332]';

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={onToggle}
        disabled={pending}
        aria-pressed={isFollowing}
        aria-label={isFollowing ? 'Unfollow this player' : 'Follow this player'}
        className={`${baseClass} ${sizeClass} ${styleClass} ${className}`}
      >
        {isFollowing ? 'Following' : 'Follow'}
      </button>
      {error ? (
        <span role="alert" className="text-xs text-red-600">
          {error}
        </span>
      ) : null}
    </span>
  );
}
