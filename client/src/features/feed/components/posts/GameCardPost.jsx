import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { createRecapCardDataUrl } from '../../../games/recapCardImage';
import { getGameCardLogo } from '../../cardImage';

export function GameCardPost({ gameCard }) {
  const previewSrc = useMemo(
    () => createRecapCardDataUrl(gameCard.recap, { teamLogoUrl: getGameCardLogo(gameCard) }),
    [gameCard]
  );
  const teamLogo = getGameCardLogo(gameCard);

  return (
    <Link
      to={gameCard.gameUrl}
      className="block overflow-hidden rounded-2xl border border-slate-200 bg-white transition hover:border-sky-300"
    >
      <div className="relative">
        <img src={previewSrc} alt={`${gameCard.teamName} game card`} className="w-full" />
        {teamLogo ? (
          <div className="absolute left-4 top-4 rounded-2xl border border-white/70 bg-white/90 p-2 shadow-sm">
            <img
              src={teamLogo}
              alt={`${gameCard.teamName} logo badge`}
              className="h-14 w-14 rounded-xl object-cover"
            />
          </div>
        ) : null}
      </div>
    </Link>
  );
}
