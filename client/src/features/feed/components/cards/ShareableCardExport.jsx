import { forwardRef } from 'react';

import CloudinaryImage from '../../../media/CloudinaryImage';
import {
  buildGameCardDisplay,
  buildInitials,
  formatAverage,
  formatCompactDate,
  formatPercentage,
} from '../posts/cardUtils';
import {
  COLORS,
  DISPLAY_FONT,
  EXPORT_HEIGHT,
  EXPORT_WIDTH,
  HAIRLINE,
  IDENTITY_GAP,
  IDENTITY_MEASURE,
  INNER_WIDTH,
  MONO_ADVANCE,
  MONO_FONT,
  PLATE_SIZE,
  RULE,
  fitDisplaySize,
  fitLineSize,
  readableAccent,
} from './shareExportTheme';

// Off-screen, fixed-size render target captured by html2canvas. Positioned
// off-viewport (NOT display:none) because html2canvas needs a laid-out node.
//
// This is composed for 1080x1350 rather than reusing the feed cards: those are
// built for a ~380px column, so stretching one across a 1080px canvas left
// 11px kickers and a 288px-tall card stranded in half a screen of black.
//
// The layout is an honours board — a varnished panel, gilt beading, and the
// record inscribed as a ruled ledger. Every card type shares that grammar,
// because a scorer's column already is a ledger.
const EXPORT_STYLE = {
  position: 'absolute',
  left: '-99999px',
  top: 0,
  width: `${EXPORT_WIDTH}px`,
  minHeight: `${EXPORT_HEIGHT}px`,
  pointerEvents: 'none',
};

// The identity block is a fixed height so a long name can never push the
// ledger and footer off the board — the name sizes down to fit it instead.
const INLAY_BLOCK = 56; // inlay rule plus the margins around it
const SUB_BLOCK = 32;

function GiltBead() {
  return (
    <>
      <div style={{ height: '2px', backgroundColor: COLORS.goldLeaf }} />
      <div style={{ height: '4px', backgroundColor: COLORS.gold }} />
    </>
  );
}

function Plate({ src, alt, initials, accent }) {
  return (
    <div
      style={{
        position: 'relative',
        width: `${PLATE_SIZE}px`,
        height: `${PLATE_SIZE}px`,
        flex: `0 0 ${PLATE_SIZE}px`,
        borderRadius: '10px',
        overflow: 'hidden',
        backgroundColor: COLORS.field,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '6px',
          backgroundColor: COLORS.gold,
          zIndex: 2,
        }}
      />
      {src ? (
        <CloudinaryImage
          src={src}
          alt={alt}
          width={PLATE_SIZE}
          height={PLATE_SIZE}
          srcSetWidths={[256, 512]}
          sizes={`${PLATE_SIZE}px`}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: DISPLAY_FONT,
            fontSize: '92px',
            color: COLORS.board,
            backgroundColor: accent,
          }}
        >
          {initials}
        </div>
      )}
    </div>
  );
}

function Identity({ accent, imageSrc, imageAlt, initials, headline, sub }) {
  const nameBox = PLATE_SIZE - INLAY_BLOCK - (sub ? SUB_BLOCK : 0);
  const name = fitDisplaySize(headline, {
    measure: IDENTITY_MEASURE,
    maxLines: 3,
    maxHeight: nameBox,
  });
  const subSize = fitLineSize(sub, { measure: IDENTITY_MEASURE, max: 25, min: 16, tracking: 0.2 });

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: `${IDENTITY_GAP}px`,
        marginTop: '54px',
        height: `${PLATE_SIZE}px`,
        flexShrink: 0,
      }}
    >
      <Plate src={imageSrc} alt={imageAlt} initials={initials} accent={accent} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontFamily: DISPLAY_FONT,
            fontSize: `${name.fontSize}px`,
            lineHeight: 0.86,
            letterSpacing: '-0.02em',
            textTransform: 'uppercase',
            color: COLORS.paper,
            overflowWrap: 'break-word',
            display: '-webkit-box',
            WebkitLineClamp: name.lines,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {headline}
        </div>
        <div
          style={{
            width: '118px',
            height: '6px',
            margin: '28px 0 22px',
            backgroundColor: accent,
          }}
        />
        {sub ? (
          <div
            style={{
              fontFamily: MONO_FONT,
              fontWeight: 500,
              fontSize: `${subSize}px`,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: COLORS.tan,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {sub}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// A team name shares its row with the score, so it gets whatever width the
// figure leaves and sizes down to fit two lines of it.
function nameRowFit(row, rowHeight, valueSize) {
  const valueWidth = valueSize * (MONO_ADVANCE - 0.04) * String(row.value).length;
  return fitDisplaySize(row.label, {
    measure: INNER_WIDTH - 32 - valueWidth - 24,
    maxLines: 2,
    maxHeight: rowHeight - 60,
    lineHeight: 1,
    max: 52,
  });
}

// Rows are a fixed height per card type rather than flex-distributed: a
// two-row score would otherwise stretch into two enormous voids, while the
// four-row team summary sat right. Sizes are tuned so each type fills the frame.
function Ledger({ rows, rowHeight, valueSize }) {
  return (
    <div style={{ flexShrink: 0 }}>
      <GiltBead />
      {rows.map((row, index) => (
        <div
          key={row.label}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '32px',
            height: `${rowHeight}px`,
            borderBottom: index === rows.length - 1 ? 'none' : RULE,
          }}
        >
          {row.isName ? (
            <div
              style={{
                fontFamily: DISPLAY_FONT,
                fontSize: `${nameRowFit(row, rowHeight, valueSize).fontSize}px`,
                lineHeight: 1,
                letterSpacing: '-0.01em',
                textTransform: 'uppercase',
                color: row.muted ? COLORS.tan : COLORS.paper,
                overflowWrap: 'break-word',
                display: '-webkit-box',
                WebkitLineClamp: nameRowFit(row, rowHeight, valueSize).lines,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {row.label}
            </div>
          ) : (
            <div
              style={{
                fontFamily: MONO_FONT,
                fontWeight: 500,
                fontSize: '25px',
                letterSpacing: '0.24em',
                textTransform: 'uppercase',
                color: COLORS.tan,
              }}
            >
              {row.label}
            </div>
          )}
          <div
            style={{
              fontFamily: MONO_FONT,
              fontWeight: 600,
              fontSize: `${valueSize}px`,
              lineHeight: 0.8,
              letterSpacing: '-0.04em',
              fontVariantNumeric: 'tabular-nums',
              color: row.muted ? COLORS.tan : row.lead ? COLORS.gold : COLORS.paper,
            }}
          >
            {row.value}
          </div>
        </div>
      ))}
      <GiltBead />
    </div>
  );
}

function Board({ kicker, serial, children }) {
  return (
    <div
      style={{
        width: `${EXPORT_WIDTH}px`,
        height: `${EXPORT_HEIGHT}px`,
        backgroundColor: COLORS.ink,
        padding: '36px',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          borderRadius: '20px',
          overflow: 'hidden',
          backgroundColor: COLORS.board,
        }}
      >
        <div
          style={{
            position: 'relative',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            padding: '0 66px 56px',
          }}
        >
          <div style={{ margin: '0 -66px 52px' }}>
            <div style={{ height: '3px', backgroundColor: COLORS.goldLeaf }} />
            <div style={{ height: '9px', backgroundColor: COLORS.gold }} />
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              gap: '24px',
            }}
          >
            <div
              style={{
                fontFamily: MONO_FONT,
                fontWeight: 600,
                fontSize: '23px',
                letterSpacing: '0.3em',
                textTransform: 'uppercase',
                color: COLORS.gold,
              }}
            >
              {kicker}
            </div>
            {serial ? (
              <div
                style={{
                  fontFamily: MONO_FONT,
                  fontWeight: 500,
                  fontSize: '23px',
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: COLORS.tan,
                  whiteSpace: 'nowrap',
                }}
              >
                {serial}
              </div>
            ) : null}
          </div>
          <div style={{ height: '1px', marginTop: '26px', backgroundColor: HAIRLINE }} />

          {children}

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '18px',
              marginTop: '56px',
              flexShrink: 0,
            }}
          >
            <div style={{ width: '16px', height: '16px', backgroundColor: COLORS.gold }} />
            <div
              style={{
                fontFamily: DISPLAY_FONT,
                fontSize: '26px',
                letterSpacing: '0.26em',
                textTransform: 'uppercase',
                color: COLORS.paper,
              }}
            >
              The Sporty Way
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Spacer() {
  return <div style={{ flex: 1, minHeight: '36px' }} />;
}

function MetaRow({ label, value }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: '24px',
        marginTop: '30px',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          fontFamily: MONO_FONT,
          fontWeight: 500,
          fontSize: '23px',
          letterSpacing: '0.24em',
          textTransform: 'uppercase',
          color: COLORS.tan,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: MONO_FONT,
          fontWeight: 600,
          fontSize: '28px',
          letterSpacing: '0.02em',
          color: COLORS.paper,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function PlayerExport({ playerCard }) {
  const accent = readableAccent(playerCard?.teamColors);
  const imageSrc = playerCard?.playerImage?.url || playerCard?.teamLogo?.url || null;
  const jersey = playerCard?.jerseyNumber;

  return (
    <Board kicker="Season averages" serial={typeof jersey === 'number' ? `No. ${jersey}` : ''}>
      <Identity
        accent={accent}
        imageSrc={imageSrc}
        imageAlt={`${playerCard.playerName} share card portrait`}
        initials={buildInitials(playerCard.playerName, 'PL')}
        headline={playerCard.playerName}
        sub={playerCard.teamName}
      />
      <Spacer />
      <Ledger
        rowHeight={220}
        valueSize={150}
        rows={[
          {
            label: 'Points per game',
            value: formatAverage(playerCard.summary?.pointsPerGame),
            lead: true,
          },
          { label: 'Rebounds per game', value: formatAverage(playerCard.summary?.reboundsPerGame) },
          { label: 'Assists per game', value: formatAverage(playerCard.summary?.assistsPerGame) },
        ]}
      />
    </Board>
  );
}

function GameExport({ gameCard }) {
  const accent = readableAccent(gameCard?.teamColors);
  const { statusLabel, homeName, awayName, homePoints, awayPoints, homeLogo } =
    buildGameCardDisplay(gameCard);

  const margin = homePoints - awayPoints;
  const headline = margin > 0 ? `Won by ${margin}` : margin < 0 ? `Lost by ${-margin}` : 'Drew';
  const topPerformer = gameCard?.recap?.topPerformers?.[0];

  return (
    <Board
      kicker={statusLabel === 'Final' ? 'Final score' : statusLabel}
      serial={formatCompactDate(gameCard?.recap?.playedAt)}
    >
      <Identity
        accent={accent}
        imageSrc={homeLogo}
        imageAlt={`${homeName} share card logo`}
        initials={buildInitials(homeName, 'TM')}
        headline={headline}
        sub={homeName}
      />
      <Spacer />
      <Ledger
        rowHeight={292}
        valueSize={196}
        rows={[
          { label: homeName, value: homePoints, isName: true, lead: true, muted: margin < 0 },
          { label: awayName, value: awayPoints, isName: true, lead: true, muted: margin > 0 },
        ]}
      />
      {topPerformer?.displayName ? (
        <MetaRow
          label="Top scorer"
          value={`${topPerformer.displayName}, ${topPerformer.points || 0} pts`}
        />
      ) : null}
    </Board>
  );
}

function TeamExport({ teamCard }) {
  const accent = readableAccent(teamCard?.teamColors);
  const games = teamCard.summary?.gamesCount ?? 0;

  return (
    <Board kicker="Season summary" serial={`${games} ${games === 1 ? 'game' : 'games'}`}>
      <Identity
        accent={accent}
        imageSrc={teamCard?.teamLogo?.url || null}
        imageAlt={`${teamCard.teamName} share card logo`}
        initials={buildInitials(teamCard.teamName, 'TM')}
        headline={teamCard.teamName}
        sub=""
      />
      <Spacer />
      <Ledger
        rowHeight={166}
        valueSize={114}
        rows={[
          { label: 'Points', value: teamCard.summary?.points ?? 0, lead: true },
          { label: '2-point', value: formatPercentage(teamCard.summary?.fg2?.percentage) },
          { label: '3-point', value: formatPercentage(teamCard.summary?.fg3?.percentage) },
          { label: 'Free throw', value: formatPercentage(teamCard.summary?.ft?.percentage) },
        ]}
      />
    </Board>
  );
}

function renderCard({ type, gameCard, playerCard, teamCard }) {
  if (type === 'game_card' && gameCard) return <GameExport gameCard={gameCard} />;
  if (type === 'player_card' && playerCard) return <PlayerExport playerCard={playerCard} />;
  if (type === 'team_card' && teamCard) return <TeamExport teamCard={teamCard} />;
  return null;
}

export const ShareableCardExport = forwardRef(function ShareableCardExport(props, ref) {
  const card = renderCard(props);
  if (!card) return null;

  return (
    <div ref={ref} aria-hidden="true" style={EXPORT_STYLE}>
      {card}
    </div>
  );
});
