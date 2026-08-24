import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
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
// The single-series case keeps the app's ink, which needs no categorical
// discrimination; `#38bdf8` (the previous away colour) failed contrast against
// the chart surface at 2.09:1.
const SERIES_INK = '#0f172a';
const SERIES_HOME = '#C77F00';
const SERIES_AWAY = '#1F6FB2';

const STAT_ROWS = [
  { label: 'PTS', key: 'points' },
  { label: 'REB', key: 'reb' },
  { label: 'AST', key: 'ast' },
  { label: 'STL', key: 'stl' },
  { label: 'BLK', key: 'blk' },
  { label: 'TOV', key: 'tov' },
];

const SHOOTING_ROWS = [
  { label: 'FG2%', key: 'fg2' },
  { label: 'FG3%', key: 'fg3' },
  { label: 'FT%', key: 'ft' },
];

// statSummary.js already returns `percentage` on a 0–100 scale
// (`(made / attempts) * 100`). Multiplying by 100 here scaled it again, so a
// 1-for-1 three-point night plotted as 10000% and dragged the y-axis domain to
// [0, 10000] — which is what made the axis labels look truncated.
function toPercentage(value) {
  return Number.isFinite(value) ? Math.round(value) : 0;
}

export function GameStatsCharts({
  isDualTeam,
  homeStats,
  awayStats,
  teamStats,
  homeLabel = 'Home',
  awayLabel = 'Away',
}) {
  const statsData = isDualTeam
    ? STAT_ROWS.map(({ label, key }) => ({
        stat: label,
        [homeLabel]: homeStats?.[key] ?? 0,
        [awayLabel]: awayStats?.[key] ?? 0,
      }))
    : STAT_ROWS.map(({ label, key }) => ({
        stat: label,
        Team: teamStats?.[key] ?? 0,
      }));

  const shootingData = isDualTeam
    ? SHOOTING_ROWS.map(({ label, key }) => ({
        stat: label,
        [homeLabel]: toPercentage(homeStats?.[key]?.percentage),
        [awayLabel]: toPercentage(awayStats?.[key]?.percentage),
      }))
    : SHOOTING_ROWS.map(({ label, key }) => ({
        stat: label,
        Team: toPercentage(teamStats?.[key]?.percentage),
      }));

  return (
    <div className="mt-5 grid gap-5 sm:grid-cols-2">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Stat Comparison
        </p>
        <div className="mt-2 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={statsData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="stat" tick={{ fontSize: 12, fill: '#64748b' }} />
              <YAxis width={32} tick={{ fontSize: 12, fill: '#64748b' }} allowDecimals={false} />
              <Tooltip cursor={{ fill: '#f1f5f9' }} />
              {isDualTeam ? <Legend wrapperStyle={{ fontSize: 12 }} /> : null}
              {isDualTeam ? (
                <>
                  <Bar dataKey={homeLabel} fill={SERIES_HOME} radius={[4, 4, 0, 0]} />
                  <Bar dataKey={awayLabel} fill={SERIES_AWAY} radius={[4, 4, 0, 0]} />
                </>
              ) : (
                <Bar dataKey="Team" fill={SERIES_INK} radius={[4, 4, 0, 0]} />
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Shooting Splits
        </p>
        <div className="mt-2 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={shootingData}
              margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
              barGap={2}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="stat" tick={{ fontSize: 12, fill: '#64748b' }} />
              <YAxis
                width={44}
                tick={{ fontSize: 12, fill: '#64748b' }}
                unit="%"
                domain={[0, 100]}
                allowDecimals={false}
              />
              <Tooltip cursor={{ fill: '#f1f5f9' }} formatter={(value) => `${value}%`} />
              {isDualTeam ? <Legend wrapperStyle={{ fontSize: 12 }} /> : null}
              {isDualTeam ? (
                <>
                  <Bar dataKey={homeLabel} fill={SERIES_HOME} radius={[4, 4, 0, 0]} />
                  <Bar dataKey={awayLabel} fill={SERIES_AWAY} radius={[4, 4, 0, 0]} />
                </>
              ) : (
                <Bar dataKey="Team" fill={SERIES_INK} radius={[4, 4, 0, 0]} />
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
