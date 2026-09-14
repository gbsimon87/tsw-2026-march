import { useState } from 'react';

import CloudinaryImage from '../../../media/CloudinaryImage';
import {
  buildGameCardDisplay,
  buildInitials,
  formatAverage,
  formatCompactDate,
  formatPercentage,
} from '../posts/cardUtils';
import { pickContextStat } from './playerGameCard';
import { MILESTONE_FAMILY_KICKERS } from './ShareableCardExport';
import { COLORS, DISPLAY_FONT, MONO_FONT, readableAccent } from './shareExportTheme';
import { socialExportPreset } from './socialExportPresets';

function nameSize(name, width, lines, max, min = 24) {
  const length = Math.max(1, String(name || '').length);
  return Math.max(min, Math.min(max, Math.floor((width * lines) / (length * 0.72))));
}

function Name({ children, width, lines = 3, max = 76, min = 24, color = COLORS.paper }) {
  return (
    <div
      style={{
        minWidth: 0,
        maxWidth: `${width}px`,
        fontFamily: DISPLAY_FONT,
        fontSize: `${nameSize(children, width, lines, max, min)}px`,
        lineHeight: 1.05,
        letterSpacing: '-0.02em',
        textTransform: 'uppercase',
        overflowWrap: 'anywhere',
        color,
      }}
    >
      {children}
    </div>
  );
}

function Mark({ src, name, size, accent }) {
  const [failedSrc, setFailedSrc] = useState(null);
  const showImage = src && src !== failedSrc;

  return (
    <div
      style={{
        width: `${size}px`,
        height: `${size}px`,
        flex: `0 0 ${size}px`,
        border: `4px solid ${COLORS.gold}`,
        borderRadius: '22px',
        overflow: 'hidden',
        backgroundColor: accent,
        color: COLORS.ink,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: DISPLAY_FONT,
        fontSize: `${Math.round(size * 0.36)}px`,
      }}
    >
      {showImage ? (
        <CloudinaryImage
          src={src}
          alt={`${name} mark`}
          width={size}
          height={size}
          srcSetWidths={[size, size * 2]}
          sizes={`${size}px`}
          loading="eager"
          onError={() => setFailedSrc(src)}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        buildInitials(name, 'TS')
      )}
    </div>
  );
}

function Stat({ label, value, compact = false }) {
  return (
    <div
      style={{
        minWidth: 0,
        borderTop: `3px solid ${COLORS.gold}`,
        paddingTop: compact ? '10px' : '22px',
      }}
    >
      <div
        style={{
          color: COLORS.tan,
          font: `600 ${compact ? 20 : 27}px ${MONO_FONT}`,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div
        style={{
          color: COLORS.paper,
          font: `800 ${compact ? 52 : 88}px ${DISPLAY_FONT}`,
          lineHeight: 1.05,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function GameContent({ gameCard, compact, width }) {
  const { homeName, awayName, homePoints, awayPoints, homeLogo, awayLogo, statusLabel } =
    buildGameCardDisplay(gameCard);
  const nameWidth = compact ? width - 160 : width - 260;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? '18px' : '54px' }}>
      {[
        { name: homeName, points: homePoints, logo: homeLogo },
        { name: awayName, points: awayPoints, logo: awayLogo },
      ].map((side) => (
        <div
          key={`${side.name}-${side.points}`}
          style={{ display: 'flex', alignItems: 'center', gap: compact ? '18px' : '28px' }}
        >
          {!compact ? (
            <Mark src={side.logo} name={side.name} size={132} accent={COLORS.gold} />
          ) : null}
          <div style={{ flex: 1, minWidth: 0 }}>
            <Name width={nameWidth} lines={compact ? 2 : 3} max={compact ? 48 : 74}>
              {side.name}
            </Name>
          </div>
          <div
            style={{
              flexShrink: 0,
              fontFamily: DISPLAY_FONT,
              fontSize: compact ? '76px' : '132px',
              lineHeight: 1,
              fontVariantNumeric: 'tabular-nums',
              color: COLORS.gold,
            }}
          >
            {side.points}
          </div>
        </div>
      ))}
      <div
        style={{
          font: `600 ${compact ? 21 : 32}px ${MONO_FONT}`,
          color: COLORS.tan,
          textTransform: 'uppercase',
          letterSpacing: '0.14em',
        }}
      >
        {statusLabel}
      </div>
    </div>
  );
}

function PersonContent({ type, card, compact, width }) {
  const isPlayer = type === 'player_card';
  const name = isPlayer ? card.playerName : card.teamName;
  const sub = isPlayer ? card.teamName : 'Season summary';
  const src = isPlayer ? card.playerImage?.url || card.teamLogo?.url : card.teamLogo?.url;
  const accent = readableAccent(card.teamColors);
  const stats = isPlayer
    ? [
        ['PTS', formatAverage(card.summary?.pointsPerGame)],
        ['REB', formatAverage(card.summary?.reboundsPerGame)],
        ['AST', formatAverage(card.summary?.assistsPerGame)],
      ]
    : [
        ['PTS', card.summary?.points ?? 0],
        ['2PT', formatPercentage(card.summary?.fg2?.percentage)],
        ['3PT', formatPercentage(card.summary?.fg3?.percentage)],
      ];
  const markSize = compact ? 170 : 260;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? '24px' : '64px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: compact ? '28px' : '40px' }}>
        <Mark src={src} name={name} size={markSize} accent={accent} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <Name width={width - markSize - 40} lines={compact ? 3 : 4} max={compact ? 64 : 92}>
            {name}
          </Name>
          <div
            style={{
              marginTop: compact ? '10px' : '24px',
              font: `600 ${compact ? 22 : 32}px ${MONO_FONT}`,
              color: COLORS.tan,
              overflowWrap: 'anywhere',
              textTransform: 'uppercase',
            }}
          >
            {sub}
          </div>
        </div>
      </div>
      <div
        style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: compact ? 20 : 36 }}
      >
        {stats.map(([label, value]) => (
          <Stat key={label} label={label} value={value} compact={compact} />
        ))}
      </div>
    </div>
  );
}

// Social backlog rank 2: its own branch rather than a third fork inside
// PersonContent, because the subject is a single game — the sub-line carries the
// matchup, result and date, and the stat row is a real line, not an average.
function PlayerGameContent({ card, compact, width }) {
  const accent = readableAccent(card.teamColors);
  const context = pickContextStat(card.stats);
  const markSize = compact ? 170 : 260;
  const sub = [
    [card.teamName, card.opponentName].filter(Boolean).join(' vs '),
    card.resultLabel,
    formatCompactDate(card.playedOn),
  ]
    .filter(Boolean)
    .join(' \u00b7 ');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? '24px' : '64px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: compact ? '28px' : '40px' }}>
        <Mark
          src={card.playerImage?.url || card.teamLogo?.url}
          name={card.playerName}
          size={markSize}
          accent={accent}
        />
        <div style={{ minWidth: 0, flex: 1 }}>
          <Name width={width - markSize - 40} lines={compact ? 3 : 4} max={compact ? 64 : 92}>
            {card.playerName}
          </Name>
          <div
            style={{
              marginTop: compact ? '10px' : '24px',
              font: `600 ${compact ? 22 : 32}px ${MONO_FONT}`,
              color: COLORS.tan,
              overflowWrap: 'anywhere',
              textTransform: 'uppercase',
            }}
          >
            {sub}
          </div>
        </div>
      </div>
      <div
        style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: compact ? 16 : 28 }}
      >
        {[
          ['PTS', card.stats?.points ?? 0],
          ['REB', card.stats?.reb ?? 0],
          ['AST', card.stats?.ast ?? 0],
          [context.label, context.value],
        ].map(([label, value]) => (
          <Stat key={label} label={label} value={value} compact={compact} />
        ))}
      </div>
    </div>
  );
}

// Social backlog rank 3: the achievement is the headline here too, so it takes
// the Name slot rather than sitting under the player like a stat would.
function MilestoneContent({ card, compact, width }) {
  const accent = readableAccent(card.teamColors);
  const markSize = compact ? 170 : 260;
  const sub = [
    [card.playerName, typeof card.jerseyNumber === 'number' ? `#${card.jerseyNumber}` : null]
      .filter(Boolean)
      .join(' '),
    card.teamName,
    formatCompactDate(card.achievedAt),
  ]
    .filter(Boolean)
    .join(' \u00b7 ');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? '24px' : '48px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: compact ? '28px' : '40px' }}>
        {/* Plain strings on this snapshot, not { url } objects. */}
        <Mark
          src={card.playerAvatarUrl || card.teamLogo}
          name={card.playerName}
          size={markSize}
          accent={accent}
        />
        <div style={{ minWidth: 0, flex: 1 }}>
          <Name width={width - markSize - 40} lines={compact ? 3 : 4} max={compact ? 60 : 88}>
            {card.label}
          </Name>
          <div
            style={{
              marginTop: compact ? '10px' : '24px',
              font: `600 ${compact ? 22 : 32}px ${MONO_FONT}`,
              color: COLORS.tan,
              overflowWrap: 'anywhere',
              textTransform: 'uppercase',
            }}
          >
            {sub}
          </div>
        </div>
      </div>
      {card.gameTitle ? (
        <div
          style={{
            borderTop: `3px solid ${COLORS.gold}`,
            paddingTop: compact ? '10px' : '22px',
            font: `600 ${compact ? 20 : 27}px ${MONO_FONT}`,
            color: COLORS.tan,
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            overflowWrap: 'anywhere',
          }}
        >
          {card.gameTitle}
        </div>
      ) : null}
    </div>
  );
}

export function SocialPresetCard({
  format,
  type,
  gameCard,
  playerCard,
  playerGameCard,
  milestoneCard,
  teamCard,
}) {
  const preset = socialExportPreset(format);
  const compact = format === 'link';
  const card = type === 'player_card' ? playerCard : teamCard;
  const safe = preset.safeArea;
  const contentWidth = preset.width - safe.left - safe.right;
  const sourcePath =
    type === 'game_card'
      ? gameCard?.gameUrl
      : type === 'player_card'
        ? playerCard?.playerUrl
        : type === 'player_game_card'
          ? playerGameCard?.gameUrl
          : type === 'milestone'
            ? milestoneCard?.gameUrl
            : teamCard?.teamUrl;
  const sourceUrl = sourcePath?.startsWith('/')
    ? `thesportyway.com${sourcePath}`
    : 'thesportyway.com';

  return (
    <div
      style={{
        position: 'relative',
        width: `${preset.width}px`,
        height: `${preset.height}px`,
        overflow: 'hidden',
        backgroundColor: COLORS.ink,
        color: COLORS.paper,
      }}
    >
      <div style={{ position: 'absolute', inset: 0, backgroundColor: COLORS.board }} />
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '16px',
          backgroundColor: COLORS.gold,
        }}
      />
      <div
        data-safe-content="true"
        style={{
          position: 'absolute',
          top: `${safe.top}px`,
          right: `${safe.right}px`,
          bottom: `${safe.bottom}px`,
          left: `${safe.left}px`,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <div
          style={{
            font: `600 ${compact ? 22 : 30}px ${MONO_FONT}`,
            color: COLORS.gold,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
          }}
        >
          The Sporty Way /{' '}
          {type === 'game_card'
            ? 'Game recap'
            : type === 'player_card'
              ? 'Player'
              : type === 'player_game_card'
                ? 'Game performance'
                : type === 'milestone'
                  ? MILESTONE_FAMILY_KICKERS[milestoneCard?.family] || 'Milestone'
                  : 'Team'}
        </div>
        {type === 'game_card' ? (
          <GameContent gameCard={gameCard} compact={compact} width={contentWidth} />
        ) : type === 'player_game_card' ? (
          <PlayerGameContent card={playerGameCard} compact={compact} width={contentWidth} />
        ) : type === 'milestone' ? (
          <MilestoneContent card={milestoneCard} compact={compact} width={contentWidth} />
        ) : (
          <PersonContent type={type} card={card} compact={compact} width={contentWidth} />
        )}
        <div
          style={{
            borderTop: `2px solid ${COLORS.gold}`,
            paddingTop: compact ? '10px' : '24px',
            font: `500 ${compact ? 21 : 29}px ${MONO_FONT}`,
            color: COLORS.tan,
            letterSpacing: '0.08em',
          }}
        >
          <div style={{ color: COLORS.paper }}>@TheSportyWay · See the full stats</div>
          <div style={{ marginTop: compact ? '3px' : '8px', overflowWrap: 'anywhere' }}>
            {sourceUrl}
          </div>
        </div>
      </div>
    </div>
  );
}
