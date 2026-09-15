import CloudinaryImage from '../../../media/CloudinaryImage';
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
} from './shareExportTheme';

// The honours-board furniture every 4:5 export is built from: the varnished
// panel, the gilt beading, the plate, the identity block and the ruled ledger.
//
// Extracted from ShareableCardExport when the box-score carousel (social
// backlog rank 7) needed the SAME template. "Slides share a template" is only
// true if it is literally one implementation — two copies of a gilt bead drift
// within a release, and a carousel whose slides do not match is worse than no
// carousel.

const INLAY_BLOCK = 56; // inlay rule plus the margins around it
const SUB_BLOCK = 32;

export function GiltBead() {
  return (
    <>
      <div style={{ height: '2px', backgroundColor: COLORS.goldLeaf }} />
      <div style={{ height: '4px', backgroundColor: COLORS.gold }} />
    </>
  );
}

export function Plate({ src, alt, initials, accent }) {
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

export function Identity({ accent, imageSrc, imageAlt, initials, headline, sub }) {
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
export function Ledger({ rows, rowHeight, valueSize }) {
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

// `height` is optional so the 9:16 leaderboard card (social backlog rank 8) is
// the SAME board on a taller frame, rather than a second composition to keep in
// step with this one. Everything else lays out from flex, so nothing else moves.
export function Board({ kicker, serial, footnote = null, height = EXPORT_HEIGHT, children }) {
  return (
    <div
      style={{
        width: `${EXPORT_WIDTH}px`,
        height: `${height}px`,
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
          {/* Optional so the game, player and team exports already in the wild
              keep the footer they were signed off with. */}
          {footnote ? (
            <div
              style={{
                marginTop: '16px',
                fontFamily: MONO_FONT,
                fontWeight: 500,
                fontSize: '22px',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: COLORS.tan,
                flexShrink: 0,
              }}
            >
              {footnote}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function Spacer() {
  return <div style={{ flex: 1, minHeight: '36px' }} />;
}
