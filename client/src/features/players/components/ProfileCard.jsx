import { Link } from 'react-router-dom';
import { getLeagueHeaderImage } from '../../feed/cardImage';
import teamPlaceholder from '../../../assets/placeholders/team-logo-placeholder.svg';
import playerPlaceholder from '../../../assets/placeholders/player-placeholder.svg';
import { CloudinaryImage } from '../../media/CloudinaryImage';

function formatAverage(value) {
  return Number.isFinite(value) ? value.toFixed(1) : '0.0';
}

export function ProfileCard({ profile, avatarUrl }) {
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

      {profile.summary && (
        <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-4 text-sm">
          <span className="font-semibold text-slate-900">{profile.summary.gamesCount} GP</span>
          <span
            className="flex gap-3 text-slate-600"
            style={{ fontFamily: "'IBM Plex Mono', monospace" }}
          >
            <span>{formatAverage(profile.summary.pointsPerGame)} PPG</span>
            <span>{formatAverage(profile.summary.reboundsPerGame)} RPG</span>
            <span>{formatAverage(profile.summary.assistsPerGame)} APG</span>
          </span>
        </div>
      )}

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
