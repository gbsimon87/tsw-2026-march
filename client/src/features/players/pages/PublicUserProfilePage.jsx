import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { SportsLoader } from '../../../components/SportsLoader';
import { ProfileCard } from '../components/ProfileCard';
import { playersApi } from '../api/playersApi';
import { useDocumentMeta } from '../../../hooks/useDocumentMeta';
import { resolveShareImage } from '../../../hooks/resolveShareImage';
import { CloudinaryImage } from '../../media/CloudinaryImage';
import { FollowButton } from '../../follows/components/FollowButton';
import playerPlaceholder from '../../../assets/placeholders/player-placeholder.svg';

export function PublicUserProfilePage() {
  const { userId } = useParams();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['publicUserProfiles', userId],
    queryFn: () => playersApi.getPublicUserProfiles(userId),
    retry: false,
  });

  const isNotFound = isError && error?.status === 404;

  useDocumentMeta({
    title: data?.user ? `${data.user.name} — The Sporty Way` : 'Player Profile — The Sporty Way',
    description: data?.user
      ? `${data.user.name}'s player profiles on The Sporty Way.`
      : 'Player profile on The Sporty Way.',
    image: resolveShareImage(),
    url: window.location.href,
  });

  if (isLoading) {
    return <SportsLoader label="Loading player profile" fullPage />;
  }

  if (isNotFound) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <p
          role="status"
          className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-4 text-sm text-slate-600"
        >
          No public profiles for this player.
        </p>
      </main>
    );
  }

  if (isError) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700"
        >
          Failed to load player profile.
        </p>
      </main>
    );
  }

  const { user, profiles } = data;

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <header className="flex flex-wrap items-center gap-4">
        <CloudinaryImage
          src={user.avatarUrl || playerPlaceholder}
          alt=""
          width={64}
          height={64}
          loading="lazy"
          decoding="async"
          srcSetWidths={[64, 128, 192]}
          sizes="64px"
          className="h-16 w-16 rounded-2xl border border-slate-200 bg-white object-cover"
        />
        <h1
          className="text-2xl text-slate-900"
          style={{ fontFamily: "'Archivo Black', sans-serif" }}
        >
          {user.name}
        </h1>
        <div className="ml-auto">
          <FollowButton targetUserId={user.id} />
        </div>
      </header>

      <ul className="grid list-none gap-4 p-0 md:grid-cols-2 xl:grid-cols-3">
        {profiles.map((profile) => (
          <li key={profile.id}>
            <ProfileCard profile={profile} avatarUrl={user.avatarUrl} />
          </li>
        ))}
      </ul>
    </main>
  );
}
