import { Link } from 'react-router-dom';
import playerPlaceholder from '../../../assets/placeholders/player-placeholder.svg';

export function LeagueRosterTable({ roster = [], getPlayerHref = null, bare = false }) {
  return (
    <div
      className={
        bare ? 'overflow-x-auto' : 'overflow-x-auto rounded-2xl border border-slate-200 bg-white'
      }
    >
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="px-3 py-2 text-left">Player</th>
            <th className="px-3 py-2 text-right">#</th>
            <th className="px-3 py-2 text-right">Pos</th>
            <th className="px-3 py-2 text-right">Claim</th>
          </tr>
        </thead>
        <tbody>
          {roster.map((player) => (
            <tr key={player.id} className="border-t border-slate-200">
              <td className="px-3 py-2 font-medium text-slate-900">
                <div className="flex items-center gap-2">
                  <img
                    src={playerPlaceholder}
                    alt=""
                    className="h-6 w-6 shrink-0 rounded-full border border-slate-200 bg-white object-cover"
                  />
                  {getPlayerHref ? (
                    <Link
                      to={getPlayerHref(player)}
                      className="underline decoration-slate-300 underline-offset-4 transition hover:text-sky-700 hover:decoration-sky-500"
                    >
                      {player.displayName}
                    </Link>
                  ) : (
                    player.displayName
                  )}
                </div>
              </td>
              <td className="px-3 py-2 text-right">{player.jerseyNumber ?? '--'}</td>
              <td className="px-3 py-2 text-right">{player.position || '--'}</td>
              <td className="px-3 py-2 text-right">
                {player.isClaimed ? (
                  <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                    Claimed profile
                  </span>
                ) : (
                  <span className="text-slate-500">Open</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
