import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../../components/PageHeader';
import placeholderLogo from '../../../assets/placeholders/team-logo-placeholder.svg';
import { teamsApi } from '../api/teamsApi';

export function TeamsPage() {
  const [teams, setTeams] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const visibleTeams = teams.slice(0, 6);
  const hiddenTeamsCount = Math.max(teams.length - visibleTeams.length, 0);

  useEffect(() => {
    teamsApi
      .list()
      .then((response) => setTeams(response.teams || []))
      .catch((loadError) => setError(loadError.message || 'Failed to load teams'))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <main className="space-y-8">
      <PageHeader
        title="Teams"
        description="Manage your rosters, jump into edits, and create new teams from one place."
      />

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <section aria-labelledby="teams-actions-heading" className="space-y-3">
        <h2 id="teams-actions-heading" className="text-xl font-semibold text-slate-900">
          Quick Actions
        </h2>
        <div className="flex flex-nowrap gap-2 overflow-x-auto pb-1">
          <Link
            to="/teams/new"
            aria-label="New Team"
            className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-slate-900 bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/12">
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="10" cy="7" r="3" />
                <path d="M19 8v6" />
                <path d="M16 11h6" />
              </svg>
            </span>
            <span>New Team</span>
          </Link>
          <Link
            to="/dashboard"
            aria-label="Dashboard"
            className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
          >
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100">
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M3 11.5 12 4l9 7.5" />
                <path d="M5 10.5V20h14v-9.5" />
                <path d="M10 20v-5h4v5" />
              </svg>
            </span>
            <span>Dashboard</span>
          </Link>
        </div>
      </section>

      <section aria-labelledby="teams-summary-heading" className="space-y-3">
        <h2 id="teams-summary-heading" className="text-xl font-semibold text-slate-900">
          Summary
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <article className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-500">Teams</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">
              {isLoading ? '...' : teams.length}
            </p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-500">Active Players</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">
              {isLoading
                ? '...'
                : teams.reduce(
                    (total, team) =>
                      total + (team.players || []).filter((player) => player.isActive).length,
                    0
                  )}
            </p>
          </article>
        </div>
      </section>

      <section
        aria-labelledby="team-snapshot-heading"
        className="rounded-2xl border border-slate-200 bg-white p-5"
      >
        <h2 id="team-snapshot-heading" className="text-xl font-semibold text-slate-900">
          Team Snapshot
        </h2>
        {isLoading ? <p className="mt-2 text-sm text-slate-600">Loading teams...</p> : null}
        {!isLoading && teams.length === 0 ? (
          <div className="mt-3 space-y-3">
            <p className="text-sm text-slate-700">
              No team yet. Create your first team to start tracking.
            </p>
            <Link
              to="/teams/new"
              className="inline-flex rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
            >
              Create Team
            </Link>
          </div>
        ) : null}
        {!isLoading && teams.length > 0 ? (
          <div className="mt-3 space-y-2">
            {visibleTeams.map((team) => (
              <article
                key={team.id || team._id || team.name}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2"
              >
                <div className="flex items-center gap-3">
                  <img
                    src={team.logo?.url || placeholderLogo}
                    alt={`${team.name || 'Team'} logo`}
                    className="h-12 w-12 rounded-full border border-slate-200 bg-white object-cover"
                  />
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {team.name || 'Unnamed Team'}
                    </p>
                    <p className="text-xs text-slate-500">
                      Active roster:{' '}
                      {(team.players || []).filter((player) => player.isActive).length}
                    </p>
                    {team.colors?.length ? (
                      <div
                        className="mt-1 flex gap-1"
                        aria-label={`${team.name || 'Team'} colours`}
                      >
                        {team.colors.map((color) => (
                          <span
                            key={color}
                            className="h-3 w-3 rounded-full border border-slate-300"
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
                {team.id ? (
                  <Link
                    to={`/teams/${team.id}/edit`}
                    aria-label={`Edit ${team.name || 'team'}`}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
                  >
                    Edit
                  </Link>
                ) : null}
              </article>
            ))}
            {hiddenTeamsCount > 0 ? (
              <p className="text-sm font-medium text-slate-500">+{hiddenTeamsCount} more</p>
            ) : null}
          </div>
        ) : null}
      </section>
    </main>
  );
}
