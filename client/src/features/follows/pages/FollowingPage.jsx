import { Link } from 'react-router-dom';
import { SportsLoader } from '../../../components/SportsLoader';
import { DarkPageHeader } from '../../../components/DarkPageHeader';
import { CloudinaryImage } from '../../media/CloudinaryImage';
import { useDocumentMeta } from '../../../hooks/useDocumentMeta';
import { FollowButton } from '../components/FollowButton';
import { useFollowing } from '../hooks/useFollowing';
import playerPlaceholder from '../../../assets/placeholders/player-placeholder.svg';

function FollowingCard({ entry }) {
  const avatar = (
    <CloudinaryImage
      src={entry.avatarUrl || playerPlaceholder}
      alt=""
      width={48}
      height={48}
      loading="lazy"
      decoding="async"
      srcSetWidths={[48, 96, 144]}
      sizes="48px"
      className="h-12 w-12 shrink-0 rounded-full border border-slate-200 bg-white object-cover"
    />
  );

  return (
    <li className="flex h-full flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4 transition hover:border-[#F4A300]/60 hover:bg-white">
      <div className="flex items-center gap-3">
        {entry.hasPublicProfile ? (
          <Link to={entry.profileHref} className="shrink-0" aria-label={`View ${entry.name}`}>
            {avatar}
          </Link>
        ) : (
          avatar
        )}
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-900">{entry.name}</p>
          {entry.hasPublicProfile ? (
            <Link
              to={entry.profileHref}
              className="text-xs font-semibold text-slate-500 underline decoration-[#F4A300] decoration-2 underline-offset-4 hover:text-[#1B4332]"
            >
              View profile →
            </Link>
          ) : (
            <span className="text-xs text-slate-400">No public profile yet</span>
          )}
        </div>
      </div>
      <div className="mt-auto">
        <FollowButton targetUserId={entry.userId} size="compact" />
      </div>
    </li>
  );
}

export function FollowingPage() {
  const { data: following = [], isLoading, isError, error } = useFollowing();

  useDocumentMeta({
    title: 'Following — The Sporty Way',
    description: 'Players you follow on The Sporty Way.',
  });

  if (isLoading) {
    return <SportsLoader label="Loading who you follow" fullPage />;
  }

  return (
    <main className="-m-4 space-y-6 bg-[#F7F5F0] p-4 md:-m-6 md:p-6">
      <DarkPageHeader
        eyebrow="Following"
        title="Players you follow"
        titleAriaLabel="Players you follow"
        description="Everyone you follow, in one place. Jump straight to any profile."
      />

      <section className="rounded-2xl border border-slate-200 bg-white p-6 md:p-8">
        {isError ? (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700"
          >
            {error?.message || 'Failed to load who you follow.'}
          </p>
        ) : following.length === 0 ? (
          <p
            role="status"
            className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-6 text-center text-sm text-slate-600"
          >
            You&rsquo;re not following anyone yet. Discover players and tap{' '}
            <span className="font-semibold text-slate-900">Follow</span> to see them here.
          </p>
        ) : (
          <ul className="grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {following.map((entry) => (
              <FollowingCard key={entry.userId} entry={entry} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
