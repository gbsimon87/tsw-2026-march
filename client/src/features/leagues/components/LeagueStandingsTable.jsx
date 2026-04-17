export function LeagueStandingsTable({ standings = [] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="px-3 py-2 text-left">Team</th>
            <th className="px-3 py-2 text-right">Record</th>
            <th className="px-3 py-2 text-right">PF</th>
            <th className="px-3 py-2 text-right">PA</th>
            <th className="px-3 py-2 text-right">Diff</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((row) => (
            <tr key={row.teamId} className="border-t border-slate-200">
              <td className="px-3 py-2 font-medium text-slate-900">{row.teamName}</td>
              <td className="px-3 py-2 text-right">{row.record || `${row.wins}-${row.losses}`}</td>
              <td className="px-3 py-2 text-right">{row.pointsFor}</td>
              <td className="px-3 py-2 text-right">{row.pointsAgainst}</td>
              <td className="px-3 py-2 text-right">{row.pointDiff}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
