import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { scrimmagesApi } from '../api/scrimmagesApi';

export function ScrimmagePlayerImport({ scrimmageId, run }) {
  const [search, setSearch] = useState('');
  const [source, setSource] = useState('');
  const [visibleCount, setVisibleCount] = useState(20);
  const [importing, setImporting] = useState('');
  const [importError, setImportError] = useState('');
  const [success, setSuccess] = useState('');
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['scrimmageImportOptions', scrimmageId],
    queryFn: () => scrimmagesApi.importOptions(scrimmageId),
  });
  const players = data?.players || [];
  const sourceKey = (player) =>
    player.sourceKey ||
    `${player.leaguePlayerId ? 'league' : 'team'}:${player.sourceTeamId || player.sourceName}`;
  const sources = [
    ...new Map(
      players.map((player) => [
        sourceKey(player),
        {
          key: sourceKey(player),
          label: `${player.sourceType === 'league' || player.leaguePlayerId ? 'League' : 'Team'} · ${player.sourceName}`,
        },
      ])
    ).values(),
  ].sort((a, b) => a.label.localeCompare(b.label));
  const matches = players.filter(
    (player) =>
      (!source || sourceKey(player) === source) &&
      player.displayName.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
  );
  async function importPlayer(player) {
    if (importing || player.alreadyInPool) return;
    setImporting(player.key);
    setImportError('');
    setSuccess('');
    try {
      const ok = await run(() =>
        scrimmagesApi.addPlayer(scrimmageId, {
          displayName: player.displayName,
          ...(player.leaguePlayerId
            ? { leaguePlayerId: player.leaguePlayerId }
            : { sourceTeamId: player.sourceTeamId, sourcePlayerId: player.sourcePlayerId }),
        })
      );
      if (ok) setSuccess(`${player.displayName} added to this scrimmage.`);
      else setImportError('The player was not imported. See the error above.');
      await refetch();
    } catch (err) {
      setImportError(err.message);
    } finally {
      setImporting('');
    }
  }
  return (
    <section
      className="space-y-3 rounded-xl border border-slate-200 p-4"
      aria-label="Import existing players"
    >
      <h3 className="font-semibold">Import existing players</h3>
      <p className="text-xs text-slate-500">Find players in your managed leagues and teams.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">
          Search players
          <input
            type="search"
            className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"
            value={search}
            placeholder="Player name"
            onChange={(event) => {
              setSearch(event.target.value);
              setVisibleCount(20);
            }}
          />
        </label>
        <label className="text-sm font-medium">
          Import source
          <select
            className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"
            value={source}
            onChange={(event) => {
              setSource(event.target.value);
              setVisibleCount(20);
            }}
          >
            <option value="">All managed leagues and teams</option>
            {sources.map((entry) => (
              <option key={entry.key} value={entry.key}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {isLoading ? (
        <p className="text-sm text-slate-500">Loading players…</p>
      ) : error ? (
        <div>
          <p role="alert" className="text-sm text-red-700">
            {error.message}
          </p>
          <button type="button" className="mt-2 text-sm underline" onClick={() => refetch()}>
            Retry loading players
          </button>
        </div>
      ) : (
        <>
          <p className="text-xs text-slate-500">
            {matches.length} matching player{matches.length === 1 ? '' : 's'}
          </p>
          {!matches.length && (
            <p className="text-sm text-slate-600">
              {players.length
                ? 'No players match these filters.'
                : 'No active players available in your managed leagues or teams.'}
            </p>
          )}
          <ul className="list-none space-y-2 p-0" aria-label="Player import results">
            {matches.slice(0, visibleCount).map((player) => (
              <li
                key={player.key}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-3"
              >
                <div>
                  <p className="text-sm font-semibold">{player.displayName}</p>
                  <p className="text-xs text-slate-500">{player.sourceName}</p>
                </div>
                {player.alreadyInPool ? (
                  <div className="text-right">
                    <p className="text-xs font-semibold text-slate-500">
                      Already in this scrimmage
                    </p>
                    {player.poolPlayerId && (
                      <Link
                        className="text-xs underline"
                        to={`/admin/scrimmage/${scrimmageId}/players/${player.poolPlayerId}`}
                      >
                        View scrimmage profile
                      </Link>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    className="rounded-lg bg-[#1B4332] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    aria-label={`Import ${player.displayName} from ${player.sourceName}`}
                    disabled={Boolean(importing)}
                    onClick={() => importPlayer(player)}
                  >
                    {importing === player.key ? 'Importing…' : 'Import player'}
                  </button>
                )}
              </li>
            ))}
          </ul>
          {matches.length > visibleCount && (
            <button
              type="button"
              className="text-sm underline"
              onClick={() => setVisibleCount((count) => count + 20)}
            >
              Show more players
            </button>
          )}
        </>
      )}
      {importError && (
        <p role="alert" className="text-sm text-red-700">
          {importError}
        </p>
      )}
      {success && (
        <p role="status" className="text-sm text-green-700">
          {success}
        </p>
      )}
    </section>
  );
}
