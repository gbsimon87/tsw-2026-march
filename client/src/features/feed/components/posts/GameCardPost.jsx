import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { createRecapCardDataUrl } from '../../../games/recapCardImage';

export function GameCardPost({ gameCard }) {
  const previewSrc = useMemo(() => createRecapCardDataUrl(gameCard.recap), [gameCard]);

  return (
    <Link
      to={gameCard.gameUrl}
      className="block overflow-hidden rounded-2xl border border-slate-200 bg-white transition hover:border-sky-300"
    >
      <img src={previewSrc} alt={`${gameCard.teamName} game card`} className="w-full" />
    </Link>
  );
}
