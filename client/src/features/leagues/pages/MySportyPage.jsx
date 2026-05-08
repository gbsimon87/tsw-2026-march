import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { leaguesApi } from '../api/leaguesApi';
import { useAuth } from '../../../app/store/AuthContext';
import { PageHeader } from '../../../components/PageHeader';
import { SportsLoader } from '../../../components/SportsLoader';
import { getLeagueHeaderImage } from '../../feed/cardImage';
import teamPlaceholder from '../../../assets/placeholders/team-logo-placeholder.svg';
import playerPlaceholder from '../../../assets/placeholders/player-placeholder.svg';

function ProfileCard({ profile }) {
  const inner = (
    <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-slate-300 hover:shadow-sm">
      <div className="flex items-center gap-3">
        <img
          src={playerPlaceholder}
          alt=""
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
            <img
              src={profile.team.logo?.url || teamPlaceholder}
              alt=""
              className="h-5 w-5 shrink-0 rounded-full border border-slate-200 bg-white object-cover"
            />
            <span className="truncate font-medium text-slate-700">{profile.team.name}</span>
          </div>
        )}
        {profile.league && (
          <div className="flex items-center gap-2 text-sm">
            <img
              src={getLeagueHeaderImage(profile.league)}
              alt=""
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
  const { user } = useAuth();
  const [profiles, setProfiles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    leaguesApi
      .getMyProfiles()
      .then((data) => setProfiles(data.profiles || []))
      .catch((loadError) => setError(loadError.message || 'Failed to load profiles'))
      .finally(() => setIsLoading(false));
  }, []);

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
              <ProfileCard key={profile.id} profile={profile} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
