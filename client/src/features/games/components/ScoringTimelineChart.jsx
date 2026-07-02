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
        <LineChart data={series} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
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
            stroke="#0f172a"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="stepAfter"
            dataKey={opponentKey}
            stroke="#38bdf8"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
