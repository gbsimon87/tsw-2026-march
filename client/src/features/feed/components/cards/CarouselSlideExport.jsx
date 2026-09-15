import { Board, GiltBead, Ledger, Spacer } from './boardExportParts';
import {
  COLORS,
  DISPLAY_FONT,
  INNER_WIDTH,
  MONO_FONT,
  RULE,
  fitDisplaySize,
  readableAccent,
} from './shareExportTheme';

// Social backlog rank 7 — the rendered half of the box-score carousel.
//
// Every slide is a `Board`: same panel, same gilt beading, same wordmark
// footer, same kicker/serial header as the single-card exports. Only the middle
// changes, because that is the one thing that differs between "what was the
// result" and "who carried it". A slide that invented its own frame would read
// as a different product two posts later in the same feed.

// Shared Design Requirements: the handle and one short CTA, on every slide, so
// a single slide reposted on its own still carries them.
const SLIDE_FOOTNOTE = '@TheSportyWay \u00b7 Full box score in profile';

// The result: two name/score rows, the winner's figure in gold. This is the
// same ledger shape the game card's score uses, so the carousel's first slide
// and a standalone final-score card agree down to the row height.
function ResultSlide({ slide }) {
  const homeWins = slide.home.points > slide.away.points;
  const awayWins = slide.away.points > slide.home.points;

  return (
    <Board kicker={slide.kicker} serial={slide.serial} footnote={SLIDE_FOOTNOTE}>
      <Spacer />
      <Ledger
        rowHeight={260}
        valueSize={168}
        rows={[
          {
            label: slide.home.name,
            value: slide.home.points,
            isName: true,
            lead: homeWins,
            muted: awayWins,
          },
          {
            label: slide.away.name,
            value: slide.away.points,
            isName: true,
            lead: awayWins,
            muted: homeWins,
          },
        ]}
      />
      <Spacer />
    </Board>
  );
}

function ColumnHeading({ column, accent, align }) {
  const name = fitDisplaySize(column.name, {
    measure: INNER_WIDTH / 2 - 32,
    maxLines: 2,
    maxHeight: 96,
    lineHeight: 1,
    max: 44,
  });

  return (
    <div style={{ flex: 1, minWidth: 0, textAlign: align }}>
      <div
        style={{
          fontFamily: DISPLAY_FONT,
          fontSize: `${name.fontSize}px`,
          lineHeight: 1,
          letterSpacing: '-0.01em',
          textTransform: 'uppercase',
          color: COLORS.paper,
          overflowWrap: 'break-word',
          display: '-webkit-box',
          WebkitLineClamp: name.lines,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {column.name}
      </div>
      <div
        style={{
          marginTop: '20px',
          fontFamily: MONO_FONT,
          fontWeight: 600,
          fontSize: '96px',
          lineHeight: 0.9,
          letterSpacing: '-0.04em',
          fontVariantNumeric: 'tabular-nums',
          color: accent,
        }}
      >
        {column.points}
      </div>
    </div>
  );
}

// One column or two. A one-sided game tracks a single roster by design, so the
// slide reports what exists rather than padding an opponent column with dashes.
function ComparisonSlide({ slide }) {
  const accent = readableAccent(slide.teamColors);
  const [left, right] = slide.columns;
  const labels = left.rows.map((row) => row.label);

  return (
    <Board kicker={slide.kicker} serial={slide.serial} footnote={SLIDE_FOOTNOTE}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '32px', marginTop: '54px' }}>
        <ColumnHeading column={left} accent={accent} align="left" />
        {right ? (
          <>
            <div
              style={{
                fontFamily: MONO_FONT,
                fontWeight: 500,
                fontSize: '25px',
                letterSpacing: '0.24em',
                color: COLORS.tan,
                paddingTop: '18px',
              }}
            >
              VS
            </div>
            <ColumnHeading column={right} accent={COLORS.paper} align="right" />
          </>
        ) : null}
      </div>

      <Spacer />

      <div style={{ flexShrink: 0 }}>
        <GiltBead />
        {labels.map((label, index) => (
          <div
            key={label}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '24px',
              height: '104px',
              borderBottom: index === labels.length - 1 ? 'none' : RULE,
            }}
          >
            <div
              style={{
                flex: 1,
                fontFamily: MONO_FONT,
                fontWeight: 600,
                fontSize: '46px',
                letterSpacing: '-0.02em',
                fontVariantNumeric: 'tabular-nums',
                color: COLORS.paper,
                textAlign: 'left',
              }}
            >
              {left.rows[index]?.value ?? '--'}
            </div>
            <div
              style={{
                fontFamily: MONO_FONT,
                fontWeight: 500,
                fontSize: '25px',
                letterSpacing: '0.24em',
                textTransform: 'uppercase',
                color: COLORS.tan,
                whiteSpace: 'nowrap',
              }}
            >
              {label}
            </div>
            <div
              style={{
                flex: 1,
                fontFamily: MONO_FONT,
                fontWeight: 600,
                fontSize: '46px',
                letterSpacing: '-0.02em',
                fontVariantNumeric: 'tabular-nums',
                color: COLORS.paper,
                textAlign: 'right',
              }}
            >
              {right ? (right.rows[index]?.value ?? '--') : ''}
            </div>
          </div>
        ))}
        <GiltBead />
      </div>
    </Board>
  );
}

// Up to three lines, the leader's figure in gold. Names use the ledger's
// `isName` row so a long one shrinks rather than clipping.
function PerformersSlide({ slide }) {
  return (
    <Board kicker={slide.kicker} serial={slide.serial} footnote={SLIDE_FOOTNOTE}>
      <Spacer />
      <Ledger
        rowHeight={slide.rows.length > 2 ? 186 : 250}
        valueSize={slide.rows.length > 2 ? 40 : 52}
        rows={slide.rows.map((row, index) => ({
          label: row.name,
          value: row.line,
          isName: true,
          lead: index === 0,
        }))}
      />
      <Spacer />
    </Board>
  );
}

function CtaSlide({ slide }) {
  const accent = readableAccent(slide.teamColors);
  const headline = fitDisplaySize(slide.headline, {
    measure: INNER_WIDTH,
    maxLines: 3,
    maxHeight: 320,
    lineHeight: 0.92,
    max: 100,
  });

  return (
    <Board kicker={slide.kicker} serial={slide.serial} footnote={SLIDE_FOOTNOTE}>
      <Spacer />
      <div style={{ flexShrink: 0 }}>
        <div
          style={{
            fontFamily: DISPLAY_FONT,
            fontSize: `${headline.fontSize}px`,
            lineHeight: 0.92,
            letterSpacing: '-0.02em',
            textTransform: 'uppercase',
            color: COLORS.paper,
            overflowWrap: 'break-word',
          }}
        >
          {slide.headline}
        </div>
        <div
          style={{ width: '160px', height: '8px', margin: '40px 0 36px', backgroundColor: accent }}
        />
        {slide.lines.map((line) => (
          <div
            key={line}
            style={{
              fontFamily: MONO_FONT,
              fontWeight: 500,
              fontSize: '34px',
              lineHeight: 1.45,
              letterSpacing: '0.02em',
              color: COLORS.tan,
            }}
          >
            {line}
          </div>
        ))}
        {slide.link ? (
          <div
            style={{
              marginTop: '44px',
              paddingTop: '30px',
              borderTop: RULE,
              fontFamily: MONO_FONT,
              fontWeight: 600,
              fontSize: '30px',
              letterSpacing: '0.02em',
              color: COLORS.gold,
              overflowWrap: 'break-word',
            }}
          >
            {slide.link}
          </div>
        ) : null}
      </div>
      <Spacer />
    </Board>
  );
}

const SLIDE_RENDERERS = {
  result: ResultSlide,
  comparison: ComparisonSlide,
  performers: PerformersSlide,
  cta: CtaSlide,
};

// renderCard asks BEFORE wrapping: a slide kind with no renderer would
// otherwise produce an empty 1080x1350 node, and html2canvas rasterises that
// into a blank PNG rather than failing.
export function canRenderSlide(slide) {
  return Boolean(SLIDE_RENDERERS[slide?.kind]);
}

export function CarouselSlideExport({ carouselSlide }) {
  const Slide = SLIDE_RENDERERS[carouselSlide?.kind];
  return Slide ? <Slide slide={carouselSlide} /> : null;
}
