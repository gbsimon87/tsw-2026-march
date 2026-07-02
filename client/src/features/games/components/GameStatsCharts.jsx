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

function toPercentage(value) {
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
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
            <BarChart data={statsData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="stat" tick={{ fontSize: 12, fill: '#64748b' }} />
              <YAxis tick={{ fontSize: 12, fill: '#64748b' }} allowDecimals={false} />
              <Tooltip cursor={{ fill: '#f1f5f9' }} />
              {isDualTeam ? <Legend wrapperStyle={{ fontSize: 12 }} /> : null}
              {isDualTeam ? (
                <>
                  <Bar dataKey={homeLabel} fill="#0f172a" radius={[4, 4, 0, 0]} />
                  <Bar dataKey={awayLabel} fill="#38bdf8" radius={[4, 4, 0, 0]} />
                </>
              ) : (
                <Bar dataKey="Team" fill="#0f172a" radius={[4, 4, 0, 0]} />
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
            <BarChart data={shootingData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="stat" tick={{ fontSize: 12, fill: '#64748b' }} />
              <YAxis
                tick={{ fontSize: 12, fill: '#64748b' }}
                unit="%"
                domain={[0, 100]}
                allowDecimals={false}
              />
              <Tooltip cursor={{ fill: '#f1f5f9' }} formatter={(value) => `${value}%`} />
              {isDualTeam ? <Legend wrapperStyle={{ fontSize: 12 }} /> : null}
              {isDualTeam ? (
                <>
                  <Bar dataKey={homeLabel} fill="#0f172a" radius={[4, 4, 0, 0]} />
                  <Bar dataKey={awayLabel} fill="#38bdf8" radius={[4, 4, 0, 0]} />
                </>
              ) : (
                <Bar dataKey="Team" fill="#0f172a" radius={[4, 4, 0, 0]} />
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
