import { useId } from 'react';

// Schedule Builder draft rows. Nothing here is persisted — every edit calls back
// up to the page, which owns the draft until the admin commits it.
//
// Two layouts are rendered and swapped at `sm`: a table for wide viewports and
// stacked cards for phones, since league admins routinely build a schedule on a
// phone and a 40-row editable table is unusable there.

function teamName(teams, teamId) {
  return teams.find((team) => team.id === teamId)?.name ?? 'Unknown team';
}

// <input type="datetime-local"> speaks local wall-clock time with no zone, so
// format from the local getters rather than toISOString() (which would shift the
// displayed time by the UTC offset).
function toDateTimeLocalValue(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return '';
  }

  const pad = (value) => String(value).padStart(2, '0');

  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

function OverflowBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
      Moved to a later date
    </span>
  );
}

function ByeLabel({ teams, row }) {
  return (
    <span className="text-sm text-slate-500">
      <span className="font-medium text-slate-600">{teamName(teams, row.byeTeamId)}</span> — bye
    </span>
  );
}

function RowControls({ row, onSwapSides, onRemoveRow }) {
  return (
    <div className="flex items-center gap-2">
      {!row.isBye && (
        <button
          type="button"
          onClick={() => onSwapSides(row.id)}
          aria-label={`Swap home and away for game ${row.id}`}
          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
        >
          Swap
        </button>
      )}
      <button
        type="button"
        onClick={() => onRemoveRow(row.id)}
        aria-label={`Remove ${row.isBye ? 'bye' : 'game'} ${row.id}`}
        className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-red-50 hover:text-red-700"
      >
        Remove
      </button>
    </div>
  );
}

export function ScheduleDraftTable({ rows, teams, onChangeRow, onSwapSides, onRemoveRow }) {
  const fieldPrefix = useId();

  if (!rows.length) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
        No games in this draft yet. Suggest pairings or add a game to get started.
      </p>
    );
  }

  const handleDateChange = (rowId, value) => {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      onChangeRow(rowId, { scheduledAt: parsed });
    }
  };

  // Round headings orient the admin without changing row order.
  const renderRoundLabel = (row, index) =>
    index === 0 || rows[index - 1].round !== row.round ? `Round ${row.round}` : null;

  return (
    <div>
      {/* Wide viewports: table */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <th scope="col" className="py-2 pr-3 font-semibold">
                Matchup
              </th>
              <th scope="col" className="py-2 pr-3 font-semibold">
                Date and time
              </th>
              <th scope="col" className="py-2 pr-3 font-semibold">
                Venue
              </th>
              <th scope="col" className="py-2 font-semibold">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const roundLabel = renderRoundLabel(row, index);

              return (
                <tr key={row.id} className="border-b border-slate-100 align-middle">
                  <td className="py-2.5 pr-3">
                    {roundLabel && (
                      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                        {roundLabel}
                      </span>
                    )}
                    {row.isBye ? (
                      <ByeLabel teams={teams} row={row} />
                    ) : (
                      <span className="font-medium text-slate-800">
                        <span>{teamName(teams, row.awayLeagueTeamId)}</span>
                        <span className="px-1.5 text-slate-400">at</span>
                        <span>{teamName(teams, row.homeLeagueTeamId)}</span>
                      </span>
                    )}
                    {row.overflowed && (
                      <span className="mt-1 block">
                        <OverflowBadge />
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3">
                    {!row.isBye && (
                      <>
                        <label className="sr-only" htmlFor={`${fieldPrefix}-date-${row.id}`}>
                          Date and time for game {row.id}
                        </label>
                        <input
                          id={`${fieldPrefix}-date-${row.id}`}
                          type="datetime-local"
                          value={toDateTimeLocalValue(row.scheduledAt)}
                          onChange={(event) => handleDateChange(row.id, event.target.value)}
                          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
                        />
                      </>
                    )}
                  </td>
                  <td className="py-2.5 pr-3">
                    {!row.isBye && (
                      <>
                        <label className="sr-only" htmlFor={`${fieldPrefix}-venue-${row.id}`}>
                          Venue for game {row.id}
                        </label>
                        <input
                          id={`${fieldPrefix}-venue-${row.id}`}
                          type="text"
                          value={row.venue ?? ''}
                          maxLength={120}
                          placeholder="Venue"
                          onChange={(event) => onChangeRow(row.id, { venue: event.target.value })}
                          className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
                        />
                      </>
                    )}
                  </td>
                  <td className="py-2.5">
                    <RowControls row={row} onSwapSides={onSwapSides} onRemoveRow={onRemoveRow} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Phones: stacked cards */}
      <div data-testid="schedule-draft-cards" className="space-y-3 sm:hidden">
        {rows.map((row, index) => {
          const roundLabel = renderRoundLabel(row, index);

          return (
            <div key={row.id}>
              {roundLabel && (
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {roundLabel}
                </p>
              )}
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                {row.isBye ? (
                  <div className="flex items-center justify-between gap-3">
                    <ByeLabel teams={teams} row={row} />
                    <RowControls row={row} onSwapSides={onSwapSides} onRemoveRow={onRemoveRow} />
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium text-slate-800">
                        <span>{teamName(teams, row.awayLeagueTeamId)}</span>
                        <span className="px-1.5 text-slate-400">at</span>
                        <span>{teamName(teams, row.homeLeagueTeamId)}</span>
                      </p>
                      <RowControls row={row} onSwapSides={onSwapSides} onRemoveRow={onRemoveRow} />
                    </div>

                    {row.overflowed && (
                      <div className="mt-2">
                        <OverflowBadge />
                      </div>
                    )}

                    <div className="mt-3 space-y-2">
                      <div>
                        <label
                          className="mb-1 block text-xs font-medium text-slate-500"
                          htmlFor={`${fieldPrefix}-card-date-${row.id}`}
                        >
                          Date and time for game {row.id}
                        </label>
                        <input
                          id={`${fieldPrefix}-card-date-${row.id}`}
                          type="datetime-local"
                          value={toDateTimeLocalValue(row.scheduledAt)}
                          onChange={(event) => handleDateChange(row.id, event.target.value)}
                          className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
                        />
                      </div>
                      <div>
                        <label
                          className="mb-1 block text-xs font-medium text-slate-500"
                          htmlFor={`${fieldPrefix}-card-venue-${row.id}`}
                        >
                          Venue for game {row.id}
                        </label>
                        <input
                          id={`${fieldPrefix}-card-venue-${row.id}`}
                          type="text"
                          value={row.venue ?? ''}
                          maxLength={120}
                          placeholder="Venue"
                          onChange={(event) => onChangeRow(row.id, { venue: event.target.value })}
                          className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
