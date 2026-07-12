import { forwardRef } from 'react';

import { GameCardPost } from '../posts/GameCardPost';
import { PlayerCardPost } from '../posts/PlayerCardPost';
import { TeamCardPost } from '../posts/TeamCardPost';

// Off-screen, fixed-size render target captured by html2canvas. Positioned
// off-viewport (NOT display:none) because html2canvas needs a laid-out node.
// Reuses the exact feed cards with interactive={false} so no <a> tags are
// captured, plus a TSW watermark so every share markets the product.
const EXPORT_STYLE = {
  position: 'absolute',
  left: '-99999px',
  top: 0,
  width: '1080px',
  minHeight: '1350px',
  pointerEvents: 'none',
};

function renderCard({ type, gameCard, playerCard, teamCard }) {
  if (type === 'game_card' && gameCard) {
    return <GameCardPost gameCard={gameCard} interactive={false} />;
  }
  if (type === 'player_card' && playerCard) {
    return <PlayerCardPost playerCard={playerCard} interactive={false} />;
  }
  if (type === 'team_card' && teamCard) {
    return <TeamCardPost teamCard={teamCard} interactive={false} />;
  }
  return null;
}

export const ShareableCardExport = forwardRef(function ShareableCardExport(props, ref) {
  const card = renderCard(props);
  if (!card) return null;

  return (
    <div ref={ref} aria-hidden="true" style={EXPORT_STYLE}>
      <div className="flex min-h-[1350px] flex-col justify-between gap-8 bg-slate-950 p-16">
        <div className="flex flex-1 items-center">{card}</div>
        <p className="text-center text-2xl font-bold uppercase tracking-[0.3em] text-slate-400">
          The Sporty Way
        </p>
      </div>
    </div>
  );
});
