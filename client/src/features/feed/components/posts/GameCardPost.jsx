import { Link } from 'react-router-dom';
import {
  ShareCardClamp,
  ShareCardHeader,
  ShareCardLogoBadge,
  ShareCardMetaStrip,
  ShareCardShell,
  ShareCardStatPill,
} from '../cards/ShareCardPrimitives';
import { buildGameCardDisplay, buildInitials, formatCompactDate } from './cardUtils';

function buildSummaryLine(gameCard) {
  const topPerformer = gameCard?.recap?.topPerformers?.[0];

  if (topPerformer?.displayName) {
    return `${topPerformer.displayName} led the way with ${topPerformer.points || 0} PTS.`;
  }

  if (gameCard?.opponent) {
    return `${gameCard.teamName} closed out against ${gameCard.opponent}.`;
  }

  return `${gameCard.teamName || 'Game'} final recap.`;
}

export function GameCardPost({ gameCard }) {
  const teamColors = gameCard?.teamColors || [];
  const {
    isDualTeam,
    statusLabel,
    homeName,
    awayName,
    homePoints,
    awayPoints,
    homeLogo,
    awayLogo,
    homeIsWinner,
    awayIsWinner,
  } = buildGameCardDisplay(gameCard);

  return (
    <Link
      to={gameCard.gameUrl}
      className="block transition duration-200 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
    >
      <ShareCardShell accent="amber" teamColors={teamColors} className="min-h-[19rem]">
        <ShareCardHeader
          kicker="Game Recap"
          badge={formatCompactDate(gameCard?.recap?.playedAt)}
          accentColor={teamColors[1] || teamColors[0] || '#fcd34d'}
        />

        {isDualTeam ? (
          <div className="mt-5 space-y-3">
            {[
              {
                name: homeName,
                points: homePoints,
                logo: homeLogo,
                isWinner: homeIsWinner,
              },
              {
                name: awayName,
                points: awayPoints,
                logo: awayLogo,
                isWinner: awayIsWinner,
              },
            ].map((side) => (
              <div key={side.name} className="flex items-center gap-3">
                <ShareCardLogoBadge
                  src={side.logo}
                  alt={`${side.name} logo`}
                  initials={buildInitials(side.name, 'TM')}
                  teamColors={teamColors}
                  accent="amber"
                  className="flex-shrink-0 !h-[50px] !w-[50px] !rounded-full"
                />
                <p
                  className={`min-w-0 flex-1 whitespace-normal text-base font-black uppercase tracking-[0.08em] ${side.isWinner ? 'text-white' : 'text-slate-400'}`}
                >
                  {side.name}
                </p>
                <p
                  className={`tabular-nums text-[2.2rem] font-black leading-none ${side.isWinner ? 'text-white' : 'text-slate-500'}`}
                >
                  {side.points}
                </p>
              </div>
            ))}
            <div
              className="pt-1 text-[11px] font-bold uppercase tracking-[0.24em]"
              style={{ color: teamColors[1] || teamColors[0] || '#fde68a' }}
            >
              {statusLabel}
            </div>
          </div>
        ) : (
          <div className="mt-5 flex items-start gap-4">
            <ShareCardLogoBadge
              src={homeLogo}
              alt={`${homeName} logo badge`}
              initials={buildInitials(homeName, 'TM')}
              teamColors={teamColors}
              accent="amber"
            />

            <div className="min-w-0 flex-1">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-4 border-b border-white/10 pb-4">
                <p className="min-w-0 text-lg font-black uppercase tracking-[0.08em] text-white">
                  {homeName}
                </p>
                <p className="text-[2.7rem] font-black leading-none text-white">{homePoints}</p>

                <p className="min-w-0 text-base font-semibold uppercase tracking-[0.08em] text-slate-300">
                  {awayName}
                </p>
                <p className="text-[2.2rem] font-black leading-none text-slate-200">{awayPoints}</p>
              </div>

              <div
                className="mt-4 text-[11px] font-bold uppercase tracking-[0.24em]"
                style={{ color: teamColors[1] || teamColors[0] || '#fde68a' }}
              >
                {statusLabel}
              </div>
            </div>
          </div>
        )}

        <ShareCardMetaStrip>
          {isDualTeam ? (
            <ShareCardClamp lines={2} className="text-sm text-slate-200">
              {buildSummaryLine(gameCard)}
            </ShareCardClamp>
          ) : (
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <ShareCardClamp lines={1} className="text-sm text-slate-200">
                {buildSummaryLine(gameCard)}
              </ShareCardClamp>
              <div className="grid grid-cols-3 gap-2">
                <ShareCardStatPill label="PTS" value={gameCard?.recap?.teamStats?.points || 0} />
                <ShareCardStatPill label="REB" value={gameCard?.recap?.teamStats?.reb || 0} />
                <ShareCardStatPill label="AST" value={gameCard?.recap?.teamStats?.ast || 0} />
              </div>
            </div>
          )}
        </ShareCardMetaStrip>
      </ShareCardShell>
    </Link>
  );
}
