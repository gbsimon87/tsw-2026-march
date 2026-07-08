import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { leaguesApi } from '../api/leaguesApi';
import { authApi } from '../../auth/api/authApi';
import { useAuth } from '../../../app/store/AuthContext';
import { SportsLoader } from '../../../components/SportsLoader';
import { getLeagueHeaderImage } from '../../feed/cardImage';
import teamPlaceholder from '../../../assets/placeholders/team-logo-placeholder.svg';
import playerPlaceholder from '../../../assets/placeholders/player-placeholder.svg';
import { CloudinaryImage } from '../../media/CloudinaryImage';

function ProfileCard({ profile, avatarUrl }) {
  const inner = (
    <div className="group flex flex-col gap-4 rounded-xl border border-slate-200 bg-slate-50/60 p-5 transition hover:border-[#F4A300]/60 hover:bg-white">
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          <CloudinaryImage
            src={avatarUrl || playerPlaceholder}
            alt=""
            width={48}
            height={48}
            loading="lazy"
            decoding="async"
            srcSetWidths={[48, 96, 144]}
            sizes="48px"
            className="h-12 w-12 rounded-2xl border border-slate-200 bg-white object-cover"
          />
          {profile.jerseyNumber != null && (
            <span
              className="absolute -bottom-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-[#141414] text-[11px] text-[#F4A300]"
              style={{ fontFamily: "'IBM Plex Mono', monospace" }}
            >
              {profile.jerseyNumber}
            </span>
          )}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-semibold text-slate-900">{profile.displayName}</p>
            {profile.memberRoleLabel && (
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                {profile.memberRoleLabel}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500">{profile.position || 'No position set'}</p>
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
        <span className="text-sm font-semibold text-slate-900 underline decoration-[#F4A300] decoration-2 underline-offset-4 group-hover:text-[#1B4332]">
          View profile →
        </span>
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
    <main className="space-y-6 bg-[#F7F5F0] -m-4 p-4 md:-m-6 md:p-6">
      {/* Player card header */}
      <section
        aria-label="My Sporty"
        className="relative overflow-hidden rounded-2xl bg-[#141414] px-6 py-8 md:px-10 md:py-10"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(90deg, #fff 0, #fff 1px, transparent 1px, transparent 64px)',
          }}
        />
        <div className="relative flex flex-wrap items-center gap-5">
          <label className="group relative block cursor-pointer shrink-0">
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
                  width={80}
                  height={80}
                  loading="lazy"
                  decoding="async"
                  srcSetWidths={[80, 160, 240]}
                  sizes="80px"
                  className="h-20 w-20 rounded-2xl border-2 border-white/10 bg-white object-cover transition group-hover:opacity-60"
                />
                <span className="pointer-events-none absolute -bottom-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#141414] bg-[#F4A300] shadow-sm transition group-hover:brightness-95">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-3.5 w-3.5 text-[#141414]"
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
              <span className="flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-dashed border-white/25 bg-white/5 text-white/40 transition group-hover:border-[#F4A300]/60 group-hover:text-[#F4A300]">
                {avatarUploading ? (
                  <svg
                    viewBox="0 0 24 24"
                    className="h-7 w-7 animate-spin"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                ) : (
                  <svg
                    viewBox="0 0 24 24"
                    className="h-7 w-7"
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
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#F4A300]">
              My Account
            </p>
            <h1
              className="mt-2 truncate text-3xl leading-none text-white md:text-4xl"
              style={{ fontFamily: "'Archivo Black', sans-serif" }}
            >
              {user?.name || 'My Sporty'}
            </h1>
            <p className="mt-3 text-white/60">Claimed league profiles for your account.</p>
            {avatarError ? <p className="mt-2 text-sm text-[#F4A300]">{avatarError}</p> : null}
          </div>
        </div>
      </section>

      <section className="rounded-2xl bg-white border border-slate-200 p-6 md:p-8">
        <header className="border-b border-slate-100 pb-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#1B4332]">
            On the roster
          </p>
          <h2
            className="mt-1 text-2xl text-slate-900"
            style={{ fontFamily: "'Archivo Black', sans-serif" }}
          >
            League Profiles
          </h2>
        </header>

        {error ? (
          <p className="mt-4 text-sm text-red-600">{error}</p>
        ) : profiles.length === 0 ? (
          <p
            role="status"
            className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-4 text-sm text-slate-600"
          >
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
