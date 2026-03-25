import { Link } from 'react-router-dom';
import { getGameCardLogo } from '../../cardImage';
import {
  ShareCardClamp,
  ShareCardHeader,
  ShareCardLogoBadge,
  ShareCardMetaStrip,
  ShareCardShell,
  ShareCardStatPill,
} from '../cards/ShareCardPrimitives';
import { buildInitials, formatCompactDate } from './cardUtils';

function buildSummaryLine(gameCard) {
  const topPerformer = gameCard?.recap?.topPerformers?.[0];

  if (topPerformer?.displayName) {
    return `${topPerformer.displayName} led the way with ${topPerformer.points || 0} PTS.`;
  }

  if (gameCard?.opponent) {
    return `${gameCard.teamName} closed out against ${gameCard.opponent}.`;
  }

  return `${gameCard.teamName} final recap.`;
}

export function GameCardPost({ gameCard }) {
  const teamLogo = getGameCardLogo(gameCard);
  const teamPoints = gameCard?.recap?.team?.points || 0;
  const opponentPoints = gameCard?.recap?.opponent?.points || 0;
  const opponentName = gameCard?.recap?.opponent?.name || gameCard?.opponent || 'Opponent';
  const statusLabel = gameCard?.recap?.statusLabel || 'Final';
  const teamColors = gameCard?.teamColors || [];

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

        <div className="mt-5 flex items-start gap-4">
          <ShareCardLogoBadge
            src={teamLogo}
            alt={`${gameCard.teamName} logo badge`}
            initials={buildInitials(gameCard.teamName, 'TM')}
            teamColors={teamColors}
            accent="amber"
          />

          <div className="min-w-0 flex-1">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-4 border-b border-white/10 pb-4">
              <p className="min-w-0 text-lg font-black uppercase tracking-[0.08em] text-white">
                {gameCard.teamName}
              </p>
              <p className="text-[2.7rem] font-black leading-none text-white">{teamPoints}</p>

              <p className="min-w-0 text-base font-semibold uppercase tracking-[0.08em] text-slate-300">
                {opponentName}
              </p>
              <p className="text-[2.2rem] font-black leading-none text-slate-200">
                {opponentPoints}
              </p>
            </div>

            <div
              className="mt-4 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.24em]"
              style={{ color: teamColors[1] || teamColors[0] || '#fde68a' }}
            >
              <span>{statusLabel}</span>
              <span
                className="h-1 w-1 rounded-full"
                style={{ backgroundColor: teamColors[2] || teamColors[1] || '#fde68a' }}
              />
              <span>Live Box Score</span>
            </div>
          </div>
        </div>

        <ShareCardMetaStrip>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <ShareCardClamp lines={1} className="text-sm text-slate-200">
              {buildSummaryLine(gameCard)}
            </ShareCardClamp>
            <div className="grid grid-cols-3 gap-2">
              <ShareCardStatPill label="PTS" value={gameCard?.recap?.teamStats?.points || 0} />
              <ShareCardStatPill label="REB" value={gameCard?.recap?.teamStats?.reb || 0} />
              <ShareCardStatPill label="AST" value={gameCard?.recap?.teamStats?.ast || 0} />
            </div>
          </div>
        </ShareCardMetaStrip>
      </ShareCardShell>
    </Link>
  );
}
