import { Link } from 'react-router-dom';
import CloudinaryImage from '../../../features/media/CloudinaryImage';
import teamPlaceholder from '../../../assets/placeholders/team-logo-placeholder.svg';
import { LeagueFormBadges } from './LeagueFormBadges';

export function LeagueStandingsTable({
  standings = [],
  getTeamHref = null,
  getTeamLogo = null,
  getTeamForm = null,
  className = '',
}) {
  const showForm = typeof getTeamForm === 'function';

  return (
    <div className={`overflow-x-auto rounded-2xl border border-slate-200 bg-white ${className}`}>
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="py-2 pl-3 pr-2 text-center">Team</th>
            <th className="whitespace-nowrap px-1 py-2 text-center text-xs">W-L</th>
            {showForm ? <th className="px-1 py-2 text-center text-xs">Form</th> : null}
            <th className="px-1 py-2 text-center text-xs">PF</th>
            <th className="px-1 py-2 text-center text-xs">PA</th>
            <th className="py-2 pl-2 pr-3 text-center text-xs">+/-</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((row) => {
            const teamHref = getTeamHref ? getTeamHref(row) : null;
            const teamForm = getTeamForm ? getTeamForm(row) || [] : [];

            return (
              <tr key={row.teamId} className="border-t border-slate-200">
                <td className="max-w-[10rem] py-2 pl-3 pr-2 font-medium text-slate-900 sm:max-w-none">
                  <div className="flex min-w-0 items-center gap-2">
                    <CloudinaryImage
                      src={getTeamLogo ? (getTeamLogo(row) ?? teamPlaceholder) : teamPlaceholder}
                      alt=""
                      width={24}
                      height={24}
                      className="h-6 w-6 shrink-0 rounded-full border border-slate-200 bg-white object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                    {teamHref ? (
                      <Link
                        to={teamHref}
                        className="min-w-0 break-words font-semibold leading-tight text-[#1B4332] underline decoration-[#F4A300]/60 underline-offset-2 transition hover:text-[#123328] hover:decoration-[#F4A300]"
                      >
                        {row.teamName}
                      </Link>
                    ) : (
                      <span className="min-w-0 break-words leading-tight">{row.teamName}</span>
                    )}
                  </div>
                </td>
                <td className="whitespace-nowrap px-1 py-2 text-center tabular-nums">
                  {row.record || `${row.wins}-${row.losses}`}
                </td>
                {showForm ? (
                  <td className="px-1 py-2">
                    <LeagueFormBadges form={teamForm} className="min-w-[8.5rem] justify-center" />
                  </td>
                ) : null}
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
