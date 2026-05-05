import { Link } from 'react-router-dom';
import teamPlaceholder from '../../../assets/placeholders/team-logo-placeholder.svg';

export function LeagueStandingsTable({
  standings = [],
  getTeamHref = null,
  getTeamLogo = null,
  className = '',
}) {
  return (
    <div className={`overflow-x-auto rounded-2xl border border-slate-200 bg-white ${className}`}>
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="py-2 pl-3 pr-2 text-center">Team</th>
            <th className="px-1 py-2 text-center text-xs">W-L</th>
            <th className="px-1 py-2 text-center text-xs">PF</th>
            <th className="px-1 py-2 text-center text-xs">PA</th>
            <th className="py-2 pl-2 pr-3 text-center text-xs">+/-</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((row) => {
            const teamHref = getTeamHref ? getTeamHref(row) : null;

            return (
              <tr key={row.teamId} className="border-t border-slate-200">
                <td className="py-2 pl-3 pr-2 font-medium text-slate-900">
                  <div className="flex items-center gap-2">
                    <img
                      src={getTeamLogo ? (getTeamLogo(row) ?? teamPlaceholder) : teamPlaceholder}
                      alt=""
                      className="h-6 w-6 shrink-0 rounded-full border border-slate-200 bg-white object-cover"
                    />
                    {teamHref ? (
                      <Link
                        to={teamHref}
                        className="font-semibold text-sky-700 underline decoration-sky-300 underline-offset-2 transition hover:text-sky-900 hover:decoration-sky-700"
                      >
                        {row.teamName}
                      </Link>
                    ) : (
                      row.teamName
                    )}
                  </div>
                </td>
                <td className="px-1 py-2 text-center tabular-nums">
                  {row.record || `${row.wins}-${row.losses}`}
                </td>
                <td className="px-1 py-2 text-center tabular-nums">{row.pointsFor}</td>
                <td className="px-1 py-2 text-center tabular-nums">{row.pointsAgainst}</td>
                <td className="py-2 pl-2 pr-3 text-center tabular-nums">{row.pointDiff}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
