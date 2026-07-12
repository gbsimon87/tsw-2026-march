import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../app/store/AuthContext';
import { followsApi } from '../api/followsApi';
import { useFollowStatus, followStatusQueryKey } from '../hooks/useFollowStatus';
import { followingQueryKey } from '../hooks/useFollowing';

const baseClass =
  'inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60';

// The id field on a following-list card differs per target type — used to drop
// the right card from the list cache on unfollow.
const LIST_ID_FIELD = {
  user: 'userId',
  league: 'leagueId',
  leagueTeam: 'leagueTeamId',
};

// Follow/unfollow toggle for a target (user account, league, or league team).
// Only signed-in users can follow (decision D6): logged-out visitors get a
// "Log in to follow" CTA. For a user target the button is hidden when viewing
// your own account; following your own league/team is allowed (decision DL3).
// Mutations are plain async followsApi calls + manual setQueryData (repo
// convention — no useMutation).
//
// `knownIsFollowing` lets a parent rendering many buttons at once (e.g. a
// player-discovery grid, or the Following page) batch-fetch status for every
// visible target with one useFollowStatus([...ids]) call and pass each result
// down, instead of every button independently firing its own single-id request.
// When omitted, the button fetches its own status.
//
// `targetUserId` is a back-compat alias for `targetId` when targetType==='user'.
export function FollowButton({
  targetType = 'user',
  targetId,
  targetUserId,
  size = 'default',
  variant = 'default',
  className = '',
  knownIsFollowing,
}) {
  const id = targetId ?? targetUserId;
  const onDark = variant === 'onDark';
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  // Self-follow only applies to user accounts (DL3).
  const isOwnAccount = targetType === 'user' && user && String(user.id) === String(id);
  const hasKnownStatus = knownIsFollowing !== undefined;
  const canQuery = Boolean(user) && !isOwnAccount && !hasKnownStatus && Boolean(id);

  const { data: statuses } = useFollowStatus([id], { targetType, enabled: canQuery });
  const isFollowing = hasKnownStatus ? Boolean(knownIsFollowing) : Boolean(statuses?.[String(id)]);

  // Never render for your own account.
  if (isOwnAccount) {
    return null;
  }

  // Logged-out: explicit CTA to sign in rather than a silent no-op.
  if (!user) {
    const ctaClass = onDark
      ? 'border border-white/30 text-white hover:border-[#F4A300] hover:text-[#F4A300]'
      : 'border border-[#141414] text-[#141414] hover:bg-[#141414] hover:text-white';
    return (
      <Link to="/login" className={`${baseClass} ${ctaClass} ${className}`}>
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
        await followsApi.follow(targetType, id);
      } else {
        await followsApi.unfollow(targetType, id);
      }

      // Flip this target's cached status everywhere it's cached — both this
      // button's own single-id query key and any batched key a parent (e.g. a
      // discovery grid) fetched for multiple ids at once, since both may hold an
      // entry for this id. Scoped to this targetType's status keys.
      queryClient.setQueriesData({ queryKey: ['followStatus', targetType] }, (current) => {
        if (!current?.statuses || !(String(id) in current.statuses)) {
          return current;
        }
        return {
          ...current,
          statuses: { ...current.statuses, [String(id)]: nextFollowing },
        };
      });
      queryClient.setQueryData(followStatusQueryKey(targetType, [id]), (current) => ({
        ...(current?.statuses ? current : { statuses: {} }),
        statuses: { ...(current?.statuses || {}), [String(id)]: nextFollowing },
      }));

      // On unfollow, drop the card from this type's Following list cache
      // immediately; on follow, remove the list so it refetches with the new
      // hydrated card (which carries name/logo the button doesn't have).
      const listKey = followingQueryKey(targetType);
      const idField = LIST_ID_FIELD[targetType] || 'targetId';
      queryClient.setQueryData(listKey, (current) => {
        if (!current?.following) return current;
        if (nextFollowing) return current;
        return {
          ...current,
          following: current.following.filter((entry) => String(entry[idField]) !== String(id)),
        };
      });
      if (nextFollowing) {
        queryClient.removeQueries({ queryKey: listKey });
      }
    } catch (toggleError) {
      setError(toggleError.message || 'Something went wrong');
    } finally {
      setPending(false);
    }
  }

  const sizeClass = size === 'compact' ? 'px-3 py-1 text-xs' : '';
  let styleClass;
  if (isFollowing) {
    styleClass = onDark
      ? 'border border-white/30 bg-white/5 text-white hover:border-[#F4A300] hover:text-[#F4A300]'
      : 'border border-slate-300 bg-white text-slate-700 hover:border-[#F4A300] hover:text-[#141414]';
  } else {
    styleClass = onDark
      ? 'bg-[#F4A300] text-[#141414] hover:bg-white'
      : 'bg-[#141414] text-white hover:bg-[#1B4332]';
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={onToggle}
        disabled={pending}
        aria-pressed={isFollowing}
        aria-label={isFollowing ? 'Unfollow' : 'Follow'}
        className={`${baseClass} ${sizeClass} ${styleClass} ${className}`}
      >
        {isFollowing ? 'Following' : 'Follow'}
      </button>
      {error ? (
        <span role="alert" className={`text-xs ${onDark ? 'text-[#F4A300]' : 'text-red-600'}`}>
          {error}
        </span>
      ) : null}
    </span>
  );
}
