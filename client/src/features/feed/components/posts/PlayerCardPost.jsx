import { useState } from 'react';
import { Link } from 'react-router-dom';

import {
  ShareCardClamp,
  ShareCardHeader,
  ShareCardMetaStrip,
  ShareCardShell,
  ShareCardStatPill,
  ShareCardSubtitle,
  ShareCardTitle,
} from '../cards/ShareCardPrimitives';
import { formatAverage, getFallbackPlayerImage, getPlayerFallbackState } from './cardUtils';

function PlayerCardContent({ imageSrc, playerCard, onImageError }) {
  const fallbackState = getPlayerFallbackState({
    ...playerCard,
    playerImage: imageSrc ? { url: imageSrc } : null,
  });
  const teamColors = playerCard?.teamColors || [];

  return (
    <ShareCardShell accent="crimson" teamColors={teamColors}>
      <ShareCardHeader
        kicker="Player Spotlight"
        badge={
          typeof playerCard.jerseyNumber === 'number' ? `#${playerCard.jerseyNumber}` : 'Featured'
        }
        accentColor={teamColors[1] || teamColors[0] || '#fdba74'}
      />

      <div className="mt-5 grid flex-1 grid-cols-[7.5rem_minmax(0,1fr)] gap-4">
        <div className="relative overflow-hidden rounded-[22px] border border-white/10 bg-gradient-to-br from-white/16 via-white/6 to-transparent shadow-[0_16px_32px_rgba(15,23,42,0.28)]">
          <div
            className="absolute inset-x-0 top-0 h-1.5"
            style={{
              backgroundImage: `linear-gradient(90deg, ${teamColors[0] || '#fdba74'}, ${teamColors[1] || '#ef4444'}, ${teamColors[2] || '#fbbf24'})`,
            }}
          />
          {fallbackState.src ? (
            <img
              src={fallbackState.src}
              alt={fallbackState.alt}
              className="h-full min-h-[9.5rem] w-full object-cover"
              onError={onImageError}
            />
          ) : (
            <div
              className="flex min-h-[9.5rem] h-full items-center justify-center text-4xl font-black text-slate-950"
              style={{
                backgroundImage: `linear-gradient(135deg, ${teamColors[1] || '#fb923c'}, ${teamColors[0] || '#ef4444'})`,
              }}
            >
              {fallbackState.initials}
            </div>
          )}
        </div>

        <div className="min-w-0">
          <ShareCardTitle>{playerCard.playerName}</ShareCardTitle>
          <ShareCardSubtitle className="mt-2 uppercase tracking-[0.18em] text-slate-300">
            {playerCard.teamName}
          </ShareCardSubtitle>
          {fallbackState.helper ? (
            <p
              className="mt-3 text-[11px] font-bold uppercase tracking-[0.24em]"
              style={{ color: teamColors[1] || teamColors[0] || '#fed7aa' }}
            >
              {fallbackState.helper}
            </p>
          ) : null}
          <ShareCardClamp lines={2} className="mt-4 text-sm text-slate-300">
            Live tracking spotlight built from public player averages.
          </ShareCardClamp>
        </div>
      </div>

      <ShareCardMetaStrip>
        <div className="grid grid-cols-3 gap-2">
          <ShareCardStatPill label="PPG" value={formatAverage(playerCard.summary.pointsPerGame)} />
          <ShareCardStatPill
            label="RPG"
            value={formatAverage(playerCard.summary.reboundsPerGame)}
          />
          <ShareCardStatPill label="APG" value={formatAverage(playerCard.summary.assistsPerGame)} />
        </div>
      </ShareCardMetaStrip>
    </ShareCardShell>
  );
}

export function PlayerCardPost({ playerCard, interactive = true }) {
  const [imageSrc, setImageSrc] = useState(
    () => playerCard?.playerImage?.url || playerCard?.teamLogo?.url || null
  );

  if (!interactive) {
    return (
      <article>
        <PlayerCardContent
          imageSrc={imageSrc}
          playerCard={playerCard}
          onImageError={() => setImageSrc(getFallbackPlayerImage())}
        />
      </article>
    );
  }

  return (
    <Link
      to={playerCard.playerUrl}
      className="block transition duration-200 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
    >
      <PlayerCardContent
        imageSrc={imageSrc}
        playerCard={playerCard}
        onImageError={() => setImageSrc(getFallbackPlayerImage())}
      />
    </Link>
  );
}
