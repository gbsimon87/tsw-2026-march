import { Link } from 'react-router-dom';

export function eligibilityMessage(row, rules, scope) {
  if (row.eligible) return 'Eligible for MVP';
  const games = Math.max(
    0,
    (scope === 'weekly' ? rules.weeklyMinGames : rules.seasonMinGames) - row.gamesPlayed
  );
  const weeks = scope === 'season' ? Math.max(0, rules.seasonMinWeeks - (row.weeksPlayed || 0)) : 0;
  return [
    games && `${games} more game${games === 1 ? '' : 's'} needed`,
    weeks && `Play in ${weeks === 1 ? 'another week' : `${weeks} more weeks`}`,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function ScrimmageStandings({
  rows,
  rules,
  scope = 'weekly',
  playerId,
  scrimmageId,
  seasonId,
  sessionId,
  adminMode = false,
}) {
  if (!rules) return null;
  return (
    <section className="space-y-3" aria-label={`${scope} MVP standings`}>
      <h2 className="text-xl font-bold">
        {scope === 'weekly' ? 'Weekly stats & MVP' : 'Season stats & MVP'}
      </h2>
      <div className="space-y-3 sm:hidden" aria-label="Player MVP cards">
        {rows.map((row, index) => (
          <article
            key={row.playerId}
            className={`rounded-xl border p-4 ${playerId === row.playerId ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                {scrimmageId ? (
                  <Link
                    className="font-semibold underline"
                    to={`${adminMode ? '/admin' : ''}/scrimmage/${scrimmageId}/players/${row.playerId}${seasonId ? `?seasonId=${seasonId}${sessionId ? `&sessionId=${sessionId}` : ''}` : ''}`}
                  >
                    {row.displayName}
                  </Link>
                ) : (
                  <p className="font-semibold">{row.displayName}</p>
                )}
                <p className="mt-1 text-xs text-slate-500">
                  {row.eligible ? `Rank ${index + 1}` : eligibilityMessage(row, rules, scope)}
                </p>
              </div>
              <p className="text-right text-lg font-bold">
                {row.mvpScore.toFixed(2)}
                <span className="block text-xs font-normal text-slate-500">
                  MVP{row.eligible ? '' : ' · Provisional'}
                </span>
              </p>
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
              {[
                ['Points', row.points],
                ['FG%', row.fgPercentage == null ? '—' : `${row.fgPercentage.toFixed(1)}%`],
                ['Turnovers', row.turnovers],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-slate-500">{label}</dt>
                  <dd className="mt-1 font-bold">{value}</dd>
                </div>
              ))}
            </dl>
            <details className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-600">
              <summary className="cursor-pointer font-semibold">Supporting stats</summary>
              <p className="mt-2">
                {row.gamesPlayed} games · {row.weeksPlayed || 0} weeks · {row.makes}/{row.attempts}{' '}
                field goals · {row.misses} misses · {row.wins}–{row.losses} W–L
                {row.draws ? ` · ${row.draws} draws` : ''}
              </p>
            </details>
          </article>
        ))}
        {!rows.length && (
          <p className="rounded-xl border bg-white p-4 text-sm text-slate-600">
            Stats appear as games are finished.
          </p>
        )}
      </div>
      <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white sm:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-100">
            <tr>
              {[
                'Rank',
                'Player',
                'GP',
                'Points',
                'FG%',
                'Made / Attempts',
                'Misses',
                'Turnovers',
                'W–L',
                'MVP',
              ].map((label) => (
                <th key={label} className="whitespace-nowrap p-3">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={row.playerId}
                className={`border-t border-slate-100 ${playerId === row.playerId ? 'bg-amber-50' : ''}`}
              >
                <td className="p-3">{row.eligible ? index + 1 : '—'}</td>
                <td className="whitespace-nowrap p-3 font-semibold">
                  {scrimmageId ? (
                    <Link
                      className="underline"
                      to={`${adminMode ? '/admin' : ''}/scrimmage/${scrimmageId}/players/${row.playerId}${seasonId ? `?seasonId=${seasonId}${sessionId ? `&sessionId=${sessionId}` : ''}` : ''}`}
                    >
                      {row.displayName}
                    </Link>
                  ) : (
                    row.displayName
                  )}
                </td>
                <td className="p-3">{row.gamesPlayed}</td>
                <td className="p-3">{row.points}</td>
                <td className="p-3">
                  {row.fgPercentage == null ? '—' : `${row.fgPercentage.toFixed(1)}%`}
                </td>
                <td className="p-3">
                  {row.makes} / {row.attempts}
                </td>
                <td className="p-3">{row.misses}</td>
                <td className="p-3">{row.turnovers}</td>
                <td className="whitespace-nowrap p-3">
                  {row.wins}–{row.losses}
                  {row.draws ? ` (${row.draws} draws)` : ''}
                </td>
                <td className="whitespace-nowrap p-3 font-bold">
                  {row.mvpScore.toFixed(2)}
                  {!row.eligible && (
                    <span className="mt-1 block text-xs font-normal text-slate-500">
                      Provisional · {eligibilityMessage(row, rules, scope)}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <p className="p-4 text-sm text-slate-600">Stats appear as games are finished.</p>
        )}
      </div>
      <p className="text-sm text-slate-600">
        MVP = (Points − {rules.missPenalty} × missed field goals − {rules.turnoverPenalty} ×
        turnovers + {rules.winBonus} × wins − {rules.lossPenalty} × losses) ÷ games played.
      </p>
      <p className="text-xs text-slate-500">
        {scope === 'weekly'
          ? `Eligibility: at least ${rules.weeklyMinGames} games this week.`
          : `Eligibility: at least ${rules.seasonMinGames} games across ${rules.seasonMinWeeks} weekly sessions. Season MVP uses season totals divided by total games.`}{' '}
        FG% uses total makes ÷ total attempts. Only completed games count; players who take the
        court receive their game’s result.{' '}
        {adminMode
          ? 'Admins preview draft weeks before publication.'
          : 'Public standings include published weeks only.'}
      </p>
    </section>
  );
}
