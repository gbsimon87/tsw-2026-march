import { Link } from 'react-router-dom';
import { SportsLoader } from '../../../components/SportsLoader';
import { DarkPageHeader } from '../../../components/DarkPageHeader';
import { CloudinaryImage } from '../../media/CloudinaryImage';
import { useDocumentMeta } from '../../../hooks/useDocumentMeta';
import { FollowButton } from '../components/FollowButton';
import { useFollowing } from '../hooks/useFollowing';
import playerPlaceholder from '../../../assets/placeholders/player-placeholder.svg';

// One card shape shared by all three target types: a 48px image (round for
// users, rounded-square for leagues/teams), a name, an optional profile link,
// and a compact FollowButton. Every entry on this page is by definition already
// followed, so knownIsFollowing is passed unconditionally (no status fetch).
function FollowingEntryCard({
  targetType,
  id,
  name,
  imageUrl,
  profileHref,
  subtitle,
  linkLabel,
  rounded,
}) {
  const image = (
    <CloudinaryImage
      src={imageUrl || playerPlaceholder}
      alt=""
      width={48}
      height={48}
      loading="lazy"
      decoding="async"
      srcSetWidths={[48, 96, 144]}
      sizes="48px"
      className={`h-12 w-12 shrink-0 border border-slate-200 bg-white object-cover ${
        rounded ? 'rounded-full' : 'rounded-lg'
      }`}
    />
  );

  return (
    <li className="flex h-full flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4 transition hover:border-[#F4A300]/60 hover:bg-white">
      <div className="flex items-center gap-3">
        {profileHref ? (
          <Link to={profileHref} className="shrink-0" aria-label={`View ${name}`}>
            {image}
          </Link>
        ) : (
          image
        )}
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-900">{name}</p>
          {profileHref ? (
            <Link
              to={profileHref}
              className="text-xs font-semibold text-slate-500 underline decoration-[#F4A300] decoration-2 underline-offset-4 hover:text-[#1B4332]"
            >
              {linkLabel} →
            </Link>
          ) : (
            <span className="text-xs text-slate-400">{subtitle}</span>
          )}
        </div>
      </div>
      <div className="mt-auto">
        <FollowButton targetType={targetType} targetId={id} size="compact" knownIsFollowing />
      </div>
    </li>
  );
}

// A section wraps one target type's list: its own loading/empty/error state
// driven by its own useFollowing(type) query. Rendered independently so a slow
// or empty type never blocks the others.
function FollowingSection({ heading, query, emptyLabel, renderCard }) {
  const { data: entries = [], isLoading, isError, error } = query;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 md:p-8">
      <div className="mb-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#1B4332]">
          Following
        </p>
        <h2
          className="text-xl font-semibold text-slate-900"
          style={{ fontFamily: 'Archivo Black' }}
        >
          {heading}
        </h2>
      </div>
      {isLoading ? (
        <SportsLoader label={`Loading ${heading.toLowerCase()}`} />
      ) : isError ? (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700"
        >
          {error?.message || `Failed to load ${heading.toLowerCase()}.`}
        </p>
      ) : entries.length === 0 ? (
        <p
          role="status"
          className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-6 text-center text-sm text-slate-600"
        >
          {emptyLabel}
        </p>
      ) : (
        <ul className="grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map(renderCard)}
        </ul>
      )}
    </section>
  );
}

export function FollowingPage() {
  const usersQuery = useFollowing('user');
  const leaguesQuery = useFollowing('league');
  const teamsQuery = useFollowing('leagueTeam');

  useDocumentMeta({
    title: 'Following — The Sporty Way',
    description: 'Players, leagues, and teams you follow on The Sporty Way.',
  });

  return (
    <main className="-m-4 space-y-6 bg-[#F7F5F0] p-4 md:-m-6 md:p-6">
      <DarkPageHeader
        eyebrow="Following"
        title="Everyone you follow"
        titleAriaLabel="Everyone you follow"
        description="Players, leagues, and teams you follow — in one place. Jump straight to any page."
      />

      <FollowingSection
        heading="Players"
        query={usersQuery}
        emptyLabel="You're not following any players yet. Discover players and tap Follow to see them here."
        renderCard={(entry) => (
          <FollowingEntryCard
            key={entry.userId}
            targetType="user"
            id={entry.userId}
            name={entry.name}
            imageUrl={entry.avatarUrl}
            profileHref={entry.hasPublicProfile ? entry.profileHref : null}
            subtitle="No public profile yet"
            linkLabel="View profile"
            rounded
          />
        )}
      />

      <FollowingSection
        heading="Leagues"
        query={leaguesQuery}
        emptyLabel="You're not following any leagues yet. Open a public league and tap Follow."
        renderCard={(entry) => (
          <FollowingEntryCard
            key={entry.leagueId}
            targetType="league"
            id={entry.leagueId}
            name={entry.name}
            imageUrl={entry.logo}
            profileHref={entry.profileHref}
            subtitle="Not currently public"
            linkLabel="View league"
          />
        )}
      />

      <FollowingSection
        heading="Teams"
        query={teamsQuery}
        emptyLabel="You're not following any teams yet. Open a team within a public league and tap Follow."
        renderCard={(entry) => (
          <FollowingEntryCard
            key={entry.leagueTeamId}
            targetType="leagueTeam"
            id={entry.leagueTeamId}
            name={entry.name}
            imageUrl={entry.logo}
            profileHref={entry.profileHref}
            subtitle="Not currently public"
            linkLabel="View team"
          />
        )}
      />
    </main>
  );
}
