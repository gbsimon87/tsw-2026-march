import { useState } from 'react';
import { Link } from 'react-router-dom';

import {
  ShareCardHeader,
  ShareCardMetaStrip,
  ShareCardShell,
  ShareCardStatPill,
  ShareCardSubtitle,
  ShareCardTitle,
} from '../cards/ShareCardPrimitives';
import { pickContextStat } from '../cards/playerGameCard';
import { formatCompactDate, getFallbackPlayerImage, getPlayerFallbackState } from './cardUtils';
import CloudinaryImage from '../../../media/CloudinaryImage';

// Social backlog rank 2. The sibling of PlayerCardPost, but about ONE game:
// the kicker says so, the meta line carries matchup/result/date, and the pills
// are a real stat line rather than season averages.
function PlayerGameCardContent({ imageSrc, playerGameCard, onImageError }) {
  const fallbackState = getPlayerFallbackState({
    ...playerGameCard,
    playerImage: imageSrc ? { url: imageSrc } : null,
  });
  const teamColors = playerGameCard?.teamColors || [];
  const context = pickContextStat(playerGameCard.stats);
  const matchup = [playerGameCard.teamName, playerGameCard.opponentName]
    .filter(Boolean)
    .join(' vs ');
  const helper =
    playerGameCard.imageFallback === 'team_logo'
      ? 'Team mark'
      : playerGameCard.imageFallback === 'placeholder'
        ? 'No photo on file'
        : null;

  return (
    <ShareCardShell accent="amber" teamColors={teamColors}>
      <ShareCardHeader
        kicker="Game Performance"
        badge={
          typeof playerGameCard.jerseyNumber === 'number'
            ? `#${playerGameCard.jerseyNumber}`
            : 'Final'
        }
        accentColor={teamColors[1] || teamColors[0] || '#fcd34d'}
      />

      <div className="mt-5 grid flex-1 grid-cols-[7.5rem_minmax(0,1fr)] gap-4">
        <div className="relative overflow-hidden rounded-[22px] border border-white/10 bg-gradient-to-br from-white/16 via-white/6 to-transparent shadow-[0_16px_32px_rgba(15,23,42,0.28)]">
          <div
            className="absolute inset-x-0 top-0 h-1.5"
            style={{
              backgroundImage: `linear-gradient(90deg, ${teamColors[0] || '#f59e0b'}, ${teamColors[1] || '#f97316'}, ${teamColors[2] || '#fbbf24'})`,
            }}
          />
          {fallbackState.src ? (
            <CloudinaryImage
              src={fallbackState.src}
              alt={fallbackState.alt}
              width={120}
              height={152}
              className="h-full min-h-[9.5rem] w-full object-cover"
              onError={onImageError}
              srcSetWidths={[120, 240, 360]}
              sizes="120px"
            />
          ) : (
            <div
              className="flex h-full min-h-[9.5rem] items-center justify-center text-4xl font-black text-slate-950"
              style={{
                backgroundImage: `linear-gradient(135deg, ${teamColors[1] || '#fbbf24'}, ${teamColors[0] || '#f59e0b'})`,
              }}
            >
              {fallbackState.initials}
            </div>
          )}
        </div>

        <div className="min-w-0">
          <ShareCardTitle>{playerGameCard.playerName}</ShareCardTitle>
          <ShareCardSubtitle className="mt-2 uppercase tracking-[0.18em] text-slate-300">
            {matchup}
          </ShareCardSubtitle>
          <p className="mt-2 flex flex-wrap items-baseline gap-x-2 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
            {playerGameCard.resultLabel ? (
              <span className="text-sm text-white">{playerGameCard.resultLabel}</span>
            ) : null}
            <span>{formatCompactDate(playerGameCard.playedOn)}</span>
          </p>
          {/* Shared Design Requirements: never let a crest silently stand in for
              a face. getPlayerFallbackState cannot tell the two apart here —
              imageSrc is already resolved to whichever it found — so the
              disclosure reads the snapshot's own imageFallback instead. */}
          {helper ? (
            <p
              className="mt-3 text-[11px] font-bold uppercase tracking-[0.24em]"
              style={{ color: teamColors[1] || teamColors[0] || '#fde68a' }}
            >
              {helper}
            </p>
          ) : null}
        </div>
      </div>

      <ShareCardMetaStrip>
        <div className="grid grid-cols-4 gap-2">
          <ShareCardStatPill label="PTS" value={playerGameCard.stats?.points ?? 0} />
          <ShareCardStatPill label="REB" value={playerGameCard.stats?.reb ?? 0} />
          <ShareCardStatPill label="AST" value={playerGameCard.stats?.ast ?? 0} />
          <ShareCardStatPill label={context.label} value={context.value} />
        </div>
      </ShareCardMetaStrip>
    </ShareCardShell>
  );
}

export function PlayerGameCardPost({ playerGameCard, interactive = true }) {
  const [imageSrc, setImageSrc] = useState(
    () => playerGameCard?.playerImage?.url || playerGameCard?.teamLogo?.url || null
  );

  if (!playerGameCard) {
    return null;
  }

  const content = (
    <PlayerGameCardContent
      imageSrc={imageSrc}
      playerGameCard={playerGameCard}
      onImageError={() => setImageSrc(getFallbackPlayerImage())}
    />
  );

  // The game is the provenance link for every stat on this card, so it is where
  // the card points — not the player's season page.
  if (!interactive || !playerGameCard.gameUrl) {
    return <article>{content}</article>;
  }

  return (
    <Link
      to={playerGameCard.gameUrl}
      className="block transition duration-200 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
    >
      {content}
    </Link>
  );
}
