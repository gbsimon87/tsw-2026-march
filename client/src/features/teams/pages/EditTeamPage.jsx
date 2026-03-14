import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { teamsApi } from '../api/teamsApi';

function formatUpdatedAt(value) {
  if (!value) {
    return 'Unavailable';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Unavailable';
  }

  return parsed.toLocaleDateString();
}

function normalizeJerseyNumber(value) {
  if (value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export function EditTeamPage() {
  const navigate = useNavigate();
  const { teamId } = useParams();
  const [team, setTeam] = useState(null);
  const [teamName, setTeamName] = useState('');
  const [players, setPlayers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activePlayerId, setActivePlayerId] = useState('');
  const [isRosterExpanded, setIsRosterExpanded] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let isActive = true;

    async function loadTeam() {
      setIsLoading(true);
      setError('');

      try {
        const response = await teamsApi.getById(teamId);
        if (!isActive) {
          return;
        }

        setTeam(response.team);
        setTeamName(response.team?.name || '');
        setPlayers(
          (response.team?.players || [])
            .filter((player) => player.isActive)
            .map((player) => ({
              ...player,
              jerseyNumber: player.jerseyNumber ?? '',
            }))
        );
      } catch (loadError) {
        if (!isActive) {
          return;
        }

        setError(loadError.message || 'Failed to load team');
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    loadTeam();

    return () => {
      isActive = false;
    };
  }, [teamId]);

  async function onSubmit(event) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      await teamsApi.update(teamId, { name: teamName });
      navigate('/dashboard');
    } catch (submitError) {
      setError(submitError.message || 'Failed to update team');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function onSavePlayer(playerId) {
    const player = players.find((candidate) => candidate.id === playerId);
    if (!player) {
      return;
    }

    setError('');
    setActivePlayerId(`save-${playerId}`);

    try {
      const response = await teamsApi.updatePlayer(teamId, playerId, {
        displayName: player.displayName,
        jerseyNumber: normalizeJerseyNumber(player.jerseyNumber),
      });

      setTeam(response.team);
      setPlayers(
        (response.team?.players || [])
          .filter((candidate) => candidate.isActive)
          .map((candidate) => ({
            ...candidate,
            jerseyNumber: candidate.jerseyNumber ?? '',
          }))
      );
    } catch (submitError) {
      setError(submitError.message || 'Failed to update player');
    } finally {
      setActivePlayerId('');
    }
  }

  async function onRemovePlayer(playerId) {
    setError('');
    setActivePlayerId(`remove-${playerId}`);

    try {
      const response = await teamsApi.removePlayer(teamId, playerId);
      setTeam(response.team);
      setPlayers(
        (response.team?.players || [])
          .filter((player) => player.isActive)
          .map((player) => ({
            ...player,
            jerseyNumber: player.jerseyNumber ?? '',
          }))
      );
    } catch (submitError) {
      setError(submitError.message || 'Failed to remove player');
    } finally {
      setActivePlayerId('');
    }
  }

  function updatePlayerValue(playerId, field, value) {
    setPlayers((current) =>
      current.map((player) => (player.id === playerId ? { ...player, [field]: value } : player))
    );
  }

  const totalPlayers = players.length;
  const activePlayers = players.length;

  return (
    <main className="mx-auto max-w-3xl space-y-8">
      <section className="rounded-2xl bg-gradient-to-r from-amber-50 via-white to-sky-50 p-5 md:p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          Team Management
        </p>
        <div className="mt-2 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold leading-tight text-slate-900 md:text-3xl">
              Edit Team
            </h1>
            <p className="mt-1 text-base font-medium text-slate-700">
              {isLoading ? 'Loading team...' : team?.name || 'Unnamed Team'}
            </p>
          </div>
          <Link
            to="/dashboard"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
          >
            Back
          </Link>
        </div>
      </section>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <section className="grid grid-cols-3 gap-3">
        <article className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500 md:text-sm">Active</p>
          <p className="mt-1 text-xl font-semibold text-slate-900 md:text-2xl">
            {isLoading ? '...' : activePlayers}
          </p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500 md:text-sm">Roster</p>
          <p className="mt-1 text-xl font-semibold text-slate-900 md:text-2xl">
            {isLoading ? '...' : totalPlayers}
          </p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500 md:text-sm">Updated</p>
          <p className="mt-1 text-sm font-semibold text-slate-900 md:text-lg">
            {isLoading ? 'Loading...' : formatUpdatedAt(team?.updatedAt)}
          </p>
        </article>
      </section>

      <form
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        onSubmit={onSubmit}
      >
        <section aria-labelledby="team-metadata-heading" className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 id="team-metadata-heading" className="text-xl font-semibold text-slate-900">
                Team Metadata
              </h2>
            </div>
          </div>

          <label className="block">
            <span className="mb-1 block text-sm text-slate-700">Team Name</span>
            <input
              type="text"
              required
              disabled={isLoading || !team}
              className="w-full rounded border border-slate-300 px-3 py-2 disabled:cursor-not-allowed disabled:bg-slate-50"
              value={teamName}
              onChange={(event) => setTeamName(event.target.value)}
            />
          </label>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={isLoading || !team || isSubmitting}
              className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60"
            >
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </section>
      </form>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 id="roster-heading" className="text-xl font-semibold text-slate-900">
              Edit Team Players
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {players.length} active {players.length === 1 ? 'player' : 'players'}
            </p>
          </div>
          <button
            type="button"
            aria-expanded={isRosterExpanded}
            aria-controls="team-players-panel"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
            onClick={() => setIsRosterExpanded((current) => !current)}
          >
            {isRosterExpanded ? 'Hide' : 'Show'}
            <svg
              viewBox="0 0 20 20"
              className={`h-4 w-4 transition ${isRosterExpanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path d="m5 7.5 5 5 5-5" />
            </svg>
          </button>
        </div>

        {isRosterExpanded ? (
          <div id="team-players-panel" className="mt-4 space-y-3">
            {isLoading ? <p className="text-sm text-slate-600">Loading players...</p> : null}
            {!isLoading && players.length === 0 ? (
              <p className="rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm text-slate-600">
                No active players on this team yet.
              </p>
            ) : null}

            {players.map((player, index) => {
              const isSavingPlayer = activePlayerId === `save-${player.id}`;
              const isRemovingPlayer = activePlayerId === `remove-${player.id}`;

              return (
                <div
                  key={player.id}
                  className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3 md:grid-cols-[1.4fr,0.8fr,auto]"
                >
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:col-span-2">
                    <label className="block">
                      <span className="mb-1 block text-sm text-slate-700">
                        Player {index + 1} Name
                      </span>
                      <input
                        type="text"
                        className="w-full rounded border border-slate-300 px-3 py-2"
                        value={player.displayName}
                        disabled={Boolean(activePlayerId)}
                        onChange={(event) =>
                          updatePlayerValue(player.id, 'displayName', event.target.value)
                        }
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-sm text-slate-700">Jersey Number</span>
                      <input
                        type="number"
                        className="w-full rounded border border-slate-300 px-3 py-2"
                        value={player.jerseyNumber}
                        disabled={Boolean(activePlayerId)}
                        onChange={(event) =>
                          updatePlayerValue(player.id, 'jerseyNumber', event.target.value)
                        }
                      />
                    </label>
                  </div>
                  <div className="flex items-end gap-2 md:justify-end">
                    <button
                      type="button"
                      disabled={Boolean(activePlayerId)}
                      aria-label={`Save player ${player.displayName || index + 1}`}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-white transition hover:bg-slate-700 disabled:opacity-60"
                      onClick={() => onSavePlayer(player.id)}
                    >
                      {isSavingPlayer ? (
                        <span className="text-xs font-semibold">...</span>
                      ) : (
                        <svg
                          viewBox="0 0 20 20"
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                        >
                          <path d="M4.5 10.5 8 14l7.5-8" />
                        </svg>
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(activePlayerId)}
                      aria-label={`Remove player ${player.displayName || index + 1}`}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-800 transition hover:border-slate-400 hover:bg-slate-50 disabled:opacity-60"
                      onClick={() => onRemovePlayer(player.id)}
                    >
                      {isRemovingPlayer ? (
                        <span className="text-xs font-semibold">...</span>
                      ) : (
                        <svg
                          viewBox="0 0 20 20"
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                        >
                          <path d="M5.5 5.5h9" />
                          <path d="M7 5.5V4.8c0-.7.6-1.3 1.3-1.3h3.4c.7 0 1.3.6 1.3 1.3v.7" />
                          <path d="m7 8 .4 7.2c0 .7.6 1.3 1.3 1.3h2.6c.7 0 1.3-.6 1.3-1.3L13 8" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </section>
    </main>
  );
}
