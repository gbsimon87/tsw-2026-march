import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { leaguesApi } from '../api/leaguesApi';
import { authApi } from '../../auth/api/authApi';
import { useAuth } from '../../../app/store/AuthContext';
import { PageHeader } from '../../../components/PageHeader';
import { SportsLoader } from '../../../components/SportsLoader';
import { getLeagueHeaderImage } from '../../feed/cardImage';
import teamPlaceholder from '../../../assets/placeholders/team-logo-placeholder.svg';
import playerPlaceholder from '../../../assets/placeholders/player-placeholder.svg';
import { CloudinaryImage } from '../../media/CloudinaryImage';

function ProfileCard({ profile, avatarUrl }) {
  const inner = (
    <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-slate-300 hover:shadow-sm">
      <div className="flex items-center gap-3">
        <CloudinaryImage
          src={avatarUrl || playerPlaceholder}
          alt=""
          width={48}
          height={48}
          loading="lazy"
          decoding="async"
          srcSetWidths={[48, 96, 144]}
          sizes="48px"
          className="h-12 w-12 shrink-0 rounded-2xl border border-slate-200 bg-white object-cover"
        />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-semibold text-slate-900">{profile.displayName}</p>
            {profile.memberRoleLabel && (
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                {profile.memberRoleLabel}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500">
            {[profile.jerseyNumber != null ? `#${profile.jerseyNumber}` : null, profile.position]
              .filter(Boolean)
              .join(' · ') || 'No position set'}
          </p>
        </div>
      </div>

      <div className="space-y-2 border-t border-slate-100 pt-4">
        {profile.team && (
          <div className="flex items-center gap-2 text-sm">
            <CloudinaryImage
              src={profile.team.logo?.url || teamPlaceholder}
              alt=""
              width={20}
              height={20}
              loading="lazy"
              decoding="async"
              srcSetWidths={[20, 40, 60]}
              sizes="20px"
              className="h-5 w-5 shrink-0 rounded-full border border-slate-200 bg-white object-cover"
            />
            <span className="truncate font-medium text-slate-700">{profile.team.name}</span>
          </div>
        )}
        {profile.league && (
          <div className="flex items-center gap-2 text-sm">
            <CloudinaryImage
              src={getLeagueHeaderImage(profile.league)}
              alt=""
              width={20}
              height={20}
              loading="lazy"
              decoding="async"
              srcSetWidths={[20, 40, 60]}
              sizes="20px"
              className="h-5 w-5 shrink-0 rounded-full border border-slate-200 bg-white object-cover"
            />
            <span className="truncate text-slate-500">{profile.league.name}</span>
            {profile.league.seasonLabel && (
              <span className="ml-auto shrink-0 text-xs text-slate-400">
                {profile.league.seasonLabel}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-end">
        <span className="text-sm font-medium text-sky-700">View profile →</span>
      </div>
    </div>
  );

  if (profile.profileHref) {
    return <Link to={profile.profileHref}>{inner}</Link>;
  }

  return inner;
}

export function MySportyPage() {
  const { user, updateUser } = useAuth();
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const fileInputRef = useRef(null);

  // OPT-014b: read migrated to React Query. The avatar upload below is a
  // mutation that flows through AuthContext.updateUser (already on React
  // Query), so it stays as-is — only the profiles read changes here.
  const {
    data,
    isLoading,
    isError,
    error: queryError,
  } = useQuery({
    queryKey: ['myProfiles'],
    queryFn: () => leaguesApi.getMyProfiles(),
  });

  const profiles = data?.profiles || [];
  const error = isError ? queryError?.message || 'Failed to load profiles' : '';

  async function handleAvatarChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setAvatarError('');
    setAvatarUploading(true);
    try {
      const formData = new FormData();
      formData.append('avatar', file);
      const result = await authApi.uploadAvatar(formData);
      updateUser(result.user);
    } catch (uploadError) {
      setAvatarError(uploadError.message || 'Failed to upload avatar');
    } finally {
      setAvatarUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  if (isLoading) {
    return <SportsLoader label="Loading profiles" fullPage />;
  }

  return (
    <main className="space-y-8">
      <PageHeader
        eyebrow="My Account"
        title="My Sporty"
        description={`Claimed league profiles for ${user?.name || 'your account'}.`}
      />

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center gap-4">
          <label className="group relative block cursor-pointer">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              aria-label="Upload profile picture"
              disabled={avatarUploading}
              onChange={handleAvatarChange}
            />
            {user?.avatarUrl ? (
              <>
                <CloudinaryImage
                  src={user.avatarUrl}
                  alt=""
                  width={64}
                  height={64}
                  loading="lazy"
                  decoding="async"
                  srcSetWidths={[64, 128, 256]}
                  sizes="64px"
                  className="h-16 w-16 rounded-full border border-slate-200 bg-white object-cover transition group-hover:opacity-60"
                />
                <span className="pointer-events-none absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm transition group-hover:bg-slate-100">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-3.5 w-3.5 text-slate-600"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                </span>
              </>
            ) : (
              <span className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-slate-300 bg-white text-slate-400 transition group-hover:border-slate-400 group-hover:text-slate-600">
                {avatarUploading ? (
                  <svg
                    viewBox="0 0 24 24"
                    className="h-6 w-6 animate-spin"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                ) : (
                  <svg
                    viewBox="0 0 24 24"
                    className="h-6 w-6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                )}
              </span>
            )}
          </label>
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Profile Picture</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Your photo appears on all your league profiles.
            </p>
            {avatarError ? <p className="mt-1 text-xs text-red-600">{avatarError}</p> : null}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-xl font-semibold text-slate-900">League Profiles</h2>

        {error ? (
          <p className="mt-4 text-sm text-red-600">{error}</p>
        ) : profiles.length === 0 ? (
          <p className="mt-4 text-sm text-slate-600">
            You have no claimed league profiles yet. When a league manager links your account to a
            player slot, it will appear here.
          </p>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {profiles.map((profile) => (
              <ProfileCard key={profile.id} profile={profile} avatarUrl={user?.avatarUrl} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
