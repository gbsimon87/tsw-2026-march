import { Link } from 'react-router-dom';
import teamPlaceholder from '../../../assets/placeholders/team-logo-placeholder.svg';
import { CloudinaryImage } from '../../media/CloudinaryImage';
import { formatVenueAddress, VenueMapLink } from './VenueMapLink';

function formatDateTime(value) {
  if (!value) return 'Date and time to be confirmed';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Date and time to be confirmed';
  return parsed.toLocaleString([], {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function PreviewTeam({ participant, leagueSlug }) {
  const content = (
    <>
      <CloudinaryImage
        src={participant?.logo?.url || teamPlaceholder}
        alt=""
        width={88}
        height={88}
        loading="eager"
        decoding="async"
        srcSetWidths={[88, 176, 264]}
        sizes="88px"
        className="mx-auto h-20 w-20 rounded-full border border-slate-200 bg-white object-cover shadow-sm sm:h-[5.5rem] sm:w-[5.5rem]"
      />
      <h2 className="mt-3 text-lg font-bold text-slate-900 sm:text-xl">
        {participant?.displayName || 'Team to be confirmed'}
      </h2>
      <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {participant?.players?.length || 0}{' '}
        {(participant?.players?.length || 0) === 1 ? 'rostered player' : 'rostered players'}
      </p>
    </>
  );
  const href =
    leagueSlug && participant?.slug ? `/league/${leagueSlug}/teams/${participant.slug}` : null;

  return href ? (
    <Link to={href} className="block rounded-2xl p-3 text-center transition hover:bg-slate-50">
      {content}
    </Link>
  ) : (
    <div className="rounded-2xl p-3 text-center">{content}</div>
  );
}

export function GameMatchupPreview({ game, league, participants, canManageGame }) {
  const awayName = participants?.away?.displayName || 'Away';
  const homeName = participants?.home?.displayName || 'Home';

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="bg-[#141414] px-5 py-6 text-center text-white sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#F4A300]">
          Matchup preview
        </p>
        <h1 className="mt-2 text-2xl font-black sm:text-3xl">
          {awayName} at {homeName}
        </h1>
        <p className="mt-2 text-sm text-white/65">{formatDateTime(game.scheduledAt)}</p>
      </div>

      <div className="p-5 sm:p-8">
        {/* Top-aligned so a team name that wraps to two lines cannot push its
            own crest out of line with the opponent's. The badge offset keeps
            "AT" on the crests' centre line: p-3 column padding + half the
            crest (h-20, sm:h-[5.5rem]) less half the badge's own height. */}
        <div className="grid grid-cols-[minmax(0,1fr),auto,minmax(0,1fr)] items-start gap-2 sm:gap-6">
          <PreviewTeam participant={participants?.away} leagueSlug={league?.slug} />
          <span className="mt-9 rounded-full bg-slate-100 px-3 py-2 text-xs font-black text-slate-400 sm:mt-10">
            AT
          </span>
          <PreviewTeam participant={participants?.home} leagueSlug={league?.slug} />
        </div>

        <dl className="mt-6 grid gap-3 rounded-2xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Tip-off
            </dt>
            <dd className="mt-1 font-semibold text-slate-800">
              {formatDateTime(game.scheduledAt)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Venue</dt>
            <dd className="mt-1 font-semibold text-slate-800">
              {game.venue || 'Venue to be confirmed'}
            </dd>
            {formatVenueAddress(game.venueAddress) ? (
              <dd className="mt-1 text-slate-600">{formatVenueAddress(game.venueAddress)}</dd>
            ) : null}
            <dd className="mt-2">
              <VenueMapLink venue={game.venue} venueAddress={game.venueAddress} />
            </dd>
          </div>
        </dl>

        {canManageGame ? (
          <div className="mt-5 flex justify-center">
            <Link
              to={`/games/${game.id}/track`}
              className="inline-flex rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-700"
            >
              Start Tracking
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}
