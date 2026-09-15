import { Board, GiltBead } from './boardExportParts';
import {
  COLORS,
  DISPLAY_FONT,
  INNER_WIDTH,
  MONO_FONT,
  RULE,
  fitDisplaySize,
} from './shareExportTheme';
import { socialExportPreset } from './socialExportPresets';

// Social backlog rank 8 — the rendered half of the league leaders and table
// cards.
//
// Same `Board` as every other 4:5 export, so a leaderboard post sits beside a
// game card in a feed without looking like a different product. The 9:16
// variant is the SAME composition on a taller board: the rows get more air, not
// a second design to keep in step.

const FOOTNOTE = '@TheSportyWay · Full table in profile';

const FORM_COLORS = {
  W: COLORS.gold,
  L: 'rgba(199, 162, 118, 0.45)',
  D: COLORS.tan,
};

function FormPips({ form }) {
  if (!form?.length) return null;

  return (
    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
      {form.map((letter, index) => (
        <div
          key={`${letter}-${index}`}
          style={{
            width: '30px',
            height: '30px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '6px',
            backgroundColor: FORM_COLORS[letter] || COLORS.tan,
            fontFamily: MONO_FONT,
            fontWeight: 700,
            fontSize: '19px',
            color: COLORS.board,
          }}
        >
          {letter}
        </div>
      ))}
    </div>
  );
}

function Rank({ value, lead }) {
  return (
    <div
      style={{
        width: '64px',
        flexShrink: 0,
        fontFamily: MONO_FONT,
        fontWeight: 600,
        fontSize: '40px',
        letterSpacing: '-0.02em',
        fontVariantNumeric: 'tabular-nums',
        color: lead ? COLORS.gold : COLORS.tan,
      }}
    >
      {value}
    </div>
  );
}

// The name column is what varies most between leagues, so it sizes to fit
// rather than clipping — the same rule the honours board's ledger uses.
function RowName({ children, measure, sub }) {
  const fit = fitDisplaySize(children, {
    measure,
    maxLines: sub ? 1 : 2,
    maxHeight: sub ? 48 : 86,
    lineHeight: 1,
    max: 44,
  });

  return (
    <div style={{ minWidth: 0, flex: 1 }}>
      <div
        style={{
          fontFamily: DISPLAY_FONT,
          fontSize: `${fit.fontSize}px`,
          lineHeight: 1,
          letterSpacing: '-0.01em',
          textTransform: 'uppercase',
          color: COLORS.paper,
          overflowWrap: 'break-word',
          display: '-webkit-box',
          WebkitLineClamp: fit.lines,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {children}
      </div>
      {sub ? (
        <div
          style={{
            marginTop: '10px',
            fontFamily: MONO_FONT,
            fontWeight: 500,
            fontSize: '21px',
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
  );
}

function LeaderRows({ rows, rowHeight }) {
  return (
    <div style={{ flexShrink: 0 }}>
      <GiltBead />
      {rows.map((row, index) => (
        <div
          key={`${row.rank}-${row.name}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '20px',
            height: `${rowHeight}px`,
            borderBottom: index === rows.length - 1 ? 'none' : RULE,
          }}
        >
          <Rank value={row.rank} lead={index === 0} />
          <RowName
            measure={INNER_WIDTH - 64 - 20 - 200}
            sub={
              row.teamName
                ? // The sample behind the average, so a 30.0 from one game
                  // cannot read as a season.
                  `${row.teamName}${row.gamesCount ? ` · ${row.gamesCount} GP` : ''}`
                : row.record || null
            }
          >
            {row.name}
          </RowName>
          {row.form ? (
            <FormPips form={row.form} />
          ) : (
            <div
              style={{
                fontFamily: MONO_FONT,
                fontWeight: 600,
                fontSize: '58px',
                lineHeight: 0.9,
                letterSpacing: '-0.04em',
                fontVariantNumeric: 'tabular-nums',
                color: index === 0 ? COLORS.gold : COLORS.paper,
                flexShrink: 0,
              }}
            >
              {row.value}
            </div>
          )}
        </div>
      ))}
      <GiltBead />
    </div>
  );
}

export function LeaderboardCardExport({ leaderboardCard, format = 'post' }) {
  if (!leaderboardCard?.rows?.length) return null;

  const preset = socialExportPreset(format === 'story' ? 'story' : 'post');
  const isStory = format === 'story';
  // The board fills the frame either way; a taller frame simply gives each row
  // more height rather than introducing a second layout to maintain.
  const rowHeight = Math.floor(
    ((isStory ? 1210 : 760) - 24) / Math.max(1, leaderboardCard.rows.length)
  );

  return (
    <Board
      kicker={leaderboardCard.kicker}
      serial={leaderboardCard.serial}
      footnote={FOOTNOTE}
      height={preset.height}
    >
      <div
        style={{
          marginTop: isStory ? '72px' : '48px',
          flexShrink: 0,
          fontFamily: DISPLAY_FONT,
          fontSize: '54px',
          lineHeight: 1,
          letterSpacing: '-0.02em',
          textTransform: 'uppercase',
          color: COLORS.paper,
          overflowWrap: 'break-word',
        }}
      >
        {leaderboardCard.leagueName}
      </div>
      <div
        style={{
          marginTop: '18px',
          marginBottom: isStory ? '64px' : '40px',
          flexShrink: 0,
          fontFamily: MONO_FONT,
          fontWeight: 500,
          fontSize: '26px',
          letterSpacing: '0.24em',
          textTransform: 'uppercase',
          color: COLORS.tan,
        }}
      >
        {leaderboardCard.label}
      </div>

      <LeaderRows rows={leaderboardCard.rows} rowHeight={rowHeight} />
    </Board>
  );
}
