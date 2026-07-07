import { Link } from 'react-router-dom';
import { getGameCardLogo } from '../../cardImage';
import { buildInitials, formatCompactDate } from './cardUtils';
import CloudinaryImage from '../../../media/CloudinaryImage';

export function FullScreenGameCard({ gameCard }) {
  if (!gameCard) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-900">
        <p className="text-sm text-slate-400">This game is no longer available.</p>
      </div>
    );
  }

  const isDualTeam = !!gameCard?.participants;
  const teamColors = gameCard?.teamColors || [];
  const primary = teamColors[0] || '#334155';
  const secondary = teamColors[1] || '#94a3b8';
  const statusLabel = gameCard?.recap?.statusLabel || 'Final';

  const homeName = isDualTeam
    ? gameCard?.recap?.home?.name || gameCard?.participants?.home?.displayName || 'Home'
    : gameCard.teamName || 'Team';
  const awayName = isDualTeam
    ? gameCard?.recap?.away?.name || gameCard?.participants?.away?.displayName || 'Away'
    : gameCard?.recap?.opponent?.name || gameCard?.opponent || 'Opponent';
  const homePoints = isDualTeam
    ? (gameCard?.recap?.home?.points ?? 0)
    : (gameCard?.recap?.team?.points ?? 0);
  const awayPoints = isDualTeam
    ? (gameCard?.recap?.away?.points ?? 0)
    : (gameCard?.recap?.opponent?.points ?? 0);
  const homeLogo = isDualTeam
    ? getGameCardLogo({ teamLogo: gameCard?.participants?.home?.logo })
    : getGameCardLogo(gameCard);
  const awayLogo = isDualTeam
    ? getGameCardLogo({ teamLogo: gameCard?.participants?.away?.logo })
    : null;

  const inner = (
    <div
      className="flex h-full flex-col items-center justify-center gap-8 p-8"
      style={{
        background: `linear-gradient(160deg, ${primary}dd 0%, #0f172a 100%)`,
      }}
    >
      <p className="text-xs font-bold uppercase tracking-[0.3em]" style={{ color: secondary }}>
        Game Recap · {formatCompactDate(gameCard?.recap?.playedAt)}
      </p>

      <div className="w-full max-w-sm space-y-6">
        {[
          {
            name: homeName,
            points: homePoints,
            logo: homeLogo,
            isWinner: homePoints > awayPoints,
          },
          {
            name: awayName,
            points: awayPoints,
            logo: awayLogo,
            isWinner: awayPoints > homePoints,
          },
        ].map((side) => (
          <div key={side.name} className="flex items-center gap-4">
            {side.logo ? (
              <CloudinaryImage
                src={side.logo}
                alt={side.name}
                width={56}
                height={56}
                className="h-14 w-14 shrink-0 rounded-full object-cover"
                srcSetWidths={[56, 112, 168]}
                sizes="56px"
              />
            ) : (
              <div
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-black text-white"
                style={{ background: primary }}
              >
                {buildInitials(side.name, 'TM')}
              </div>
            )}
            <p
              className={`min-w-0 flex-1 truncate text-xl font-black uppercase tracking-[0.06em] ${side.isWinner ? 'text-white' : 'text-slate-500'}`}
            >
              {side.name}
            </p>
            <p
              className={`tabular-nums text-5xl font-black leading-none ${side.isWinner ? 'text-white' : 'text-slate-600'}`}
            >
              {side.points}
            </p>
          </div>
        ))}
      </div>

      <p className="text-xs font-bold uppercase tracking-[0.3em]" style={{ color: secondary }}>
        {statusLabel}
      </p>
    </div>
  );

  return (
    <Link to={gameCard.gameUrl} className="block h-full w-full focus:outline-none">
      {inner}
    </Link>
  );
}
