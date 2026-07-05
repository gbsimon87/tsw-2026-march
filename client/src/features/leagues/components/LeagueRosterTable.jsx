import { useState } from 'react';
import { Link } from 'react-router-dom';
import playerPlaceholder from '../../../assets/placeholders/player-placeholder.svg';
import { CloudinaryImage } from '../../media/CloudinaryImage';

const POSITION_OPTIONS = ['', 'PG', 'SG', 'SF', 'PF', 'C'];

export function LeagueRosterTable({
  roster = [],
  getPlayerHref = null,
  bare = false,
  canEdit = false,
  onSavePlayer,
}) {
  const [editingPlayerId, setEditingPlayerId] = useState('');
  const [draft, setDraft] = useState({ displayName: '', jerseyNumber: '', position: '' });
  const [savingPlayerId, setSavingPlayerId] = useState('');
  const duplicateJerseys = Array.from(
    roster
      .reduce((numbers, player) => {
        if (player.jerseyNumber === null || player.jerseyNumber === undefined) {
          return numbers;
        }

        const jerseyNumber = String(player.jerseyNumber);
        numbers.set(jerseyNumber, (numbers.get(jerseyNumber) || 0) + 1);
        return numbers;
      }, new Map())
      .entries()
  )
    .filter(([, count]) => count > 1)
    .map(([jerseyNumber]) => jerseyNumber);

  function startEditing(player) {
    setEditingPlayerId(player.id);
    setDraft({
      displayName: player.displayName || '',
      jerseyNumber: player.jerseyNumber ?? '',
      position: player.position || '',
    });
  }

  function cancelEditing() {
    setEditingPlayerId('');
    setDraft({ displayName: '', jerseyNumber: '', position: '' });
  }

  async function savePlayer(player) {
    if (!onSavePlayer || savingPlayerId) return;

    const nextName = draft.displayName.trim();
    if (!nextName) return;

    const jerseyValue = String(draft.jerseyNumber).trim();
    const parsedJersey = Number(jerseyValue);
    const jerseyNumber = jerseyValue === '' || Number.isNaN(parsedJersey) ? null : parsedJersey;

    setSavingPlayerId(player.id);
    try {
      await onSavePlayer(player.id, {
        displayName: nextName,
        jerseyNumber,
        position: draft.position || null,
      });
      cancelEditing();
    } finally {
      setSavingPlayerId('');
    }
  }

  return (
    <div className={bare ? '' : 'rounded-2xl border border-slate-200 bg-white'}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 text-left">Player</th>
              <th className="px-3 py-2 text-right">#</th>
              <th className="px-3 py-2 text-right">Pos</th>
              <th className="px-3 py-2 text-right">Claim</th>
              {canEdit ? <th className="px-3 py-2 text-right">Edit</th> : null}
            </tr>
          </thead>
          <tbody>
            {roster.map((player) => {
              const isEditing = editingPlayerId === player.id;
              const isSaving = savingPlayerId === player.id;

              return (
                <tr key={player.id} className="border-t border-slate-200">
                  <td className="px-3 py-2 font-medium text-slate-900">
                    <div className="flex items-center gap-2">
                      <CloudinaryImage
                        src={playerPlaceholder}
                        alt=""
                        width={24}
                        height={24}
                        loading="lazy"
                        decoding="async"
                        className="h-6 w-6 shrink-0 rounded-full border border-slate-200 bg-white object-cover"
                      />
                      {isEditing ? (
                        <input
                          type="text"
                          required
                          maxLength={80}
                          aria-label={`Player ${player.displayName} name`}
                          className="min-w-40 rounded border border-slate-300 px-2 py-1 text-sm"
                          value={draft.displayName}
                          disabled={isSaving}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              displayName: event.target.value,
                            }))
                          }
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              savePlayer(player);
                            }
                            if (event.key === 'Escape') {
                              cancelEditing();
                            }
                          }}
                        />
                      ) : getPlayerHref ? (
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
                  <td className="px-3 py-2 text-right">
                    {isEditing ? (
                      <input
                        type="number"
                        min="0"
                        max="999"
                        aria-label={`Player ${player.displayName} jersey number`}
                        className="w-20 rounded border border-slate-300 px-2 py-1 text-right text-sm"
                        value={draft.jerseyNumber}
                        disabled={isSaving}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            jerseyNumber: event.target.value,
                          }))
                        }
                      />
                    ) : (
                      (player.jerseyNumber ?? '--')
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {isEditing ? (
                      <select
                        aria-label={`Player ${player.displayName} position`}
                        className="rounded border border-slate-300 px-2 py-1 text-sm"
                        value={draft.position}
                        disabled={isSaving}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            position: event.target.value,
                          }))
                        }
                      >
                        <option value="">No position</option>
                        {POSITION_OPTIONS.filter(Boolean).map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    ) : (
                      player.position || '--'
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {player.isClaimed ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                        Claimed profile
                      </span>
                    ) : (
                      <span className="text-slate-500">Open</span>
                    )}
                  </td>
                  {canEdit ? (
                    <td className="px-3 py-2 text-right">
                      {isEditing ? (
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            aria-label={`Save ${player.displayName}`}
                            disabled={isSaving || !draft.displayName.trim()}
                            onClick={() => savePlayer(player)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isSaving ? (
                              <svg
                                viewBox="0 0 24 24"
                                className="h-4 w-4 animate-spin"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                              </svg>
                            ) : (
                              <svg
                                viewBox="0 0 24 24"
                                className="h-4 w-4"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <path d="M5 13.5 9 17l10-10" />
                              </svg>
                            )}
                          </button>
                          <button
                            type="button"
                            aria-label={`Cancel editing ${player.displayName}`}
                            disabled={isSaving}
                            onClick={cancelEditing}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <svg
                              viewBox="0 0 24 24"
                              className="h-4 w-4"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path d="M18 6 6 18" />
                              <path d="m6 6 12 12" />
                            </svg>
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          aria-label={`Edit ${player.displayName}`}
                          onClick={() => startEditing(player)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            className="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                          </svg>
                        </button>
                      )}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {duplicateJerseys.length > 0 ? (
        <p className="border-t border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Warning: duplicate jersey number{duplicateJerseys.length === 1 ? '' : 's'}{' '}
          {duplicateJerseys.map((number) => `#${number}`).join(', ')} found on this roster.
        </p>
      ) : null}
    </div>
  );
}
