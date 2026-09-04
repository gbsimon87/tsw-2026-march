import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

// Chart palette.
//
// Validated with the dataviz skill's six-checks validator
// (`validate_palette.js "#C77F00,#1F6FB2" --mode light`): lightness band PASS,
// chroma floor PASS, CVD separation PASS (protan ΔE 24.2 · tritan 25.8),
// normal-vision floor PASS (29.9), contrast vs surface PASS. Slot order is
// fixed — home is always slot 1, away always slot 2 — so filtering a series
// never repaints the other one.
//
// `#38bdf8` (the previous away colour) failed contrast against the chart
// surface at 2.09:1.
const SERIES_HOME = '#C77F00';
const SERIES_AWAY = '#1F6FB2';

const POINT_VALUES = {
  FT_MADE: 1,
  FG2_MADE: 2,
  FG3_MADE: 3,
  OPP_FT_MADE: 1,
  OPP_FG2_MADE: 2,
  OPP_FG3_MADE: 3,
};

function isOpponentStat(statType) {
  return statType.startsWith('OPP_');
}

function buildSingleTeamSeries(events, teamKey, opponentKey) {
  let teamPoints = 0;
  let opponentPoints = 0;

  return events
    .filter((event) => POINT_VALUES[event?.statType] != null)
    .map((event, index) => {
      const value = POINT_VALUES[event.statType];
      if (isOpponentStat(event.statType)) {
        opponentPoints += value;
      } else {
        teamPoints += value;
      }

      return { play: index + 1, [teamKey]: teamPoints, [opponentKey]: opponentPoints };
    });
}

function buildDualTeamSeries(events, homeKey, awayKey) {
  let homePoints = 0;
  let awayPoints = 0;

  return events
    .filter((event) => POINT_VALUES[event?.statType] != null && event.teamSide)
    .map((event, index) => {
      const value = POINT_VALUES[event.statType];
      if (event.teamSide === 'home') {
        homePoints += value;
      } else if (event.teamSide === 'away') {
        awayPoints += value;
      }

      return { play: index + 1, [homeKey]: homePoints, [awayKey]: awayPoints };
    });
}

export function ScoringTimelineChart({
  events = [],
  isDualTeam = false,
  homeLabel = 'Home',
  awayLabel = 'Away',
}) {
  const safeEvents = events || [];
  const teamKey = isDualTeam ? homeLabel : 'Team';
  const opponentKey = isDualTeam ? awayLabel : 'Opponent';
  const series = isDualTeam
    ? buildDualTeamSeries(safeEvents, teamKey, opponentKey)
    : buildSingleTeamSeries(safeEvents, teamKey, opponentKey);

  if (series.length === 0) {
    return (
      <p className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-600">
        No scoring events were recorded for this game.
      </p>
    );
  }

  return (
    <div className="mt-2 h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis
            dataKey="play"
            tick={{ fontSize: 12, fill: '#64748b' }}
            label={{ value: 'Play #', position: 'insideBottom', offset: -2, fontSize: 11 }}
          />
          <YAxis tick={{ fontSize: 12, fill: '#64748b' }} allowDecimals={false} />
          <Tooltip labelFormatter={(value) => `Play ${value}`} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            type="stepAfter"
            dataKey={teamKey}
            stroke={SERIES_HOME}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="stepAfter"
            dataKey={opponentKey}
            stroke={SERIES_AWAY}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
