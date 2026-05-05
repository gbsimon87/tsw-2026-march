import { Link } from 'react-router-dom';
import teamPlaceholder from '../../assets/placeholders/team-logo-placeholder.svg';

function formatGameDate(game) {
  const rawValue = game.completedAt || game.scheduledAt || null;
  if (!rawValue) return null;
  const parsed = new Date(rawValue);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString();
}

export function LeagueGameCard({ game }) {
  const isCompleted = game.homePoints != null && game.awayPoints != null;
  const homeWon = isCompleted && game.homePoints > game.awayPoints;
  const awayWon = isCompleted && game.awayPoints > game.homePoints;
  const dateLabel = formatGameDate(game);

  const sides = [
    {
      name: game.awayTeamName || 'Unknown Team',
      logo: game.awayTeamLogoUrl,
      points: game.awayPoints,
      won: awayWon,
    },
    {
      name: game.homeTeamName || 'Unknown Team',
      logo: game.homeTeamLogoUrl,
      points: game.homePoints,
      won: homeWon,
    },
  ];

  return (
    <Link
      to={`/games/${game.id}`}
      className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-slate-300 hover:shadow-md"
    >
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          {isCompleted ? 'Final' : 'Scheduled'}
        </span>
        {dateLabel ? <span className="text-xs text-slate-400">{dateLabel}</span> : null}
      </div>

      <div className="space-y-3 px-4 py-4">
        {sides.map((side) => (
          <div key={side.name} className="flex items-center gap-3">
            <img
              src={side.logo || teamPlaceholder}
              alt=""
              className="h-9 w-9 shrink-0 rounded-full border border-slate-200 bg-white object-cover"
            />
            <span
              className={`flex-1 truncate text-sm font-semibold ${side.won ? 'text-slate-900' : 'text-slate-500'}`}
            >
              {side.name}
            </span>
            {isCompleted ? (
              <span
                className={`tabular-nums text-xl font-bold ${side.won ? 'text-slate-900' : 'text-slate-400'}`}
              >
                {side.points}
              </span>
            ) : (
              <span className="text-sm text-slate-400">–</span>
            )}
          </div>
        ))}
      </div>
    </Link>
  );
}
