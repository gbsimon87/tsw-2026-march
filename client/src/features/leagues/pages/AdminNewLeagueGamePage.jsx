import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { gamesApi } from '../../games/api/gamesApi';
import { TEAM_SIDES } from '../../games/constants';
import { leaguesApi } from '../api/leaguesApi';
import { Breadcrumbs } from '../../../components/Breadcrumbs';
import { PageHeader } from '../../../components/PageHeader';
import { SportsLoader } from '../../../components/SportsLoader';
import { Modal } from '../../../components/ui/Modal';

// ── Shared primitives ────────────────────────────────────────────────

function TeamAvatar({ team, size = 'md' }) {
  const sizeClass = size === 'sm' ? 'h-7 w-7 text-xs' : 'h-10 w-10 text-sm';
  if (team?.logo?.url) {
    return (
      <img
        src={team.logo.url}
        alt={team.name}
        className={`${sizeClass} shrink-0 rounded-full object-cover`}
      />
    );
  }
  return (
    <span
      className={`${sizeClass} flex shrink-0 items-center justify-center rounded-full bg-slate-200 font-bold text-slate-600`}
    >
      {team?.name?.charAt(0).toUpperCase() ?? '?'}
    </span>
  );
}

function SideToggle({ value, onChange, homeLabel = 'Home', awayLabel = 'Away' }) {
  return (
    <div className="flex rounded-xl border border-slate-200 bg-slate-100 p-1">
      <button
        type="button"
        onClick={() => onChange('home')}
        className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition-all ${
          value === 'home'
            ? 'bg-white text-slate-900 shadow-sm'
            : 'text-slate-500 hover:text-slate-700'
        }`}
      >
        {homeLabel}
      </button>
      <button
        type="button"
        onClick={() => onChange('away')}
        className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition-all ${
          value === 'away'
            ? 'bg-white text-slate-900 shadow-sm'
            : 'text-slate-500 hover:text-slate-700'
        }`}
      >
        {awayLabel}
      </button>
    </div>
  );
}

// ── Team picker ──────────────────────────────────────────────────────

function TeamPickerModal({ open, onClose, teams, selectedId, disabledId, onSelect, title }) {
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const filtered = query.trim()
    ? teams.filter((t) => t.name.toLowerCase().includes(query.toLowerCase()))
    : teams;

  function handleSelect(id) {
    onSelect(id);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={title} panelClassName="!max-w-md">
      <div className="sticky -top-5 -mx-5 -mt-5 bg-white px-5 pb-3 pt-5 sm:-top-6 sm:-mx-6 sm:-mt-6 sm:px-6 sm:pt-6">
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search teams…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-4 text-sm focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
        </div>
      </div>

      <div className="mt-2 space-y-1">
        {filtered.length === 0 && (
          <p className="py-6 text-center text-sm text-slate-400">
            No teams match &quot;{query}&quot;
          </p>
        )}
        {filtered.map((team) => {
          const isSelected = team.id === selectedId;
          const isDisabled = team.id === disabledId;
          return (
            <button
              key={team.id}
              type="button"
              disabled={isDisabled}
              onClick={() => handleSelect(team.id)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                isSelected
                  ? 'bg-indigo-50 text-indigo-900'
                  : isDisabled
                    ? 'cursor-not-allowed opacity-35'
                    : 'hover:bg-slate-50 active:bg-slate-100'
              }`}
            >
              <TeamAvatar team={team} size="sm" />
              <span className="flex-1 truncate text-sm font-medium">{team.name}</span>
              {typeof team.activeRosterCount === 'number' && team.activeRosterCount < 5 && (
                <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                  {team.activeRosterCount}/5
                </span>
              )}
              {isSelected && (
                <svg
                  className="h-4 w-4 shrink-0 text-indigo-500"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

function TeamPickerButton({ label, team, onClick, hasRosterWarning }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <button
        type="button"
        onClick={onClick}
        className={`flex w-full items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left transition-all ${
          team
            ? 'border-indigo-200 bg-indigo-50 hover:border-indigo-300'
            : 'border-dashed border-slate-300 bg-white hover:border-slate-400 hover:bg-slate-50'
        }`}
      >
        {team ? (
          <>
            <TeamAvatar team={team} />
            <span className="flex-1 truncate font-semibold text-slate-900">{team.name}</span>
            {hasRosterWarning && (
              <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                {team.activeRosterCount}/5
              </span>
            )}
            <svg
              className="h-4 w-4 shrink-0 text-slate-400"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </>
        ) : (
          <>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-slate-300">
              <svg
                className="h-4 w-4 text-slate-400"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
            </span>
            <span className="flex-1 text-sm text-slate-400">Choose team…</span>
          </>
        )}
      </button>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────

export function AdminNewLeagueGamePage() {
  const { leagueId } = useParams();
  const navigate = useNavigate();
  const [league, setLeague] = useState(null);
  const [teams, setTeams] = useState([]);

  // Owner / league-manager flow
  const [homeLeagueTeamId, setHomeLeagueTeamId] = useState('');
  const [awayLeagueTeamId, setAwayLeagueTeamId] = useState('');
  const [initialActiveSide, setInitialActiveSide] = useState(TEAM_SIDES.HOME);

  // Team-manager flow
  const [selectedManagedTeamId, setSelectedManagedTeamId] = useState('');
  const [teamSide, setTeamSide] = useState('home');
  const [opponentTeamId, setOpponentTeamId] = useState('');

  const [title, setTitle] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Picker modal state
  const [pickerOpen, setPickerOpen] = useState(null); // 'home' | 'away' | 'managed' | 'opponent'

  const isTeamManagerRole = league?.viewerContext?.viewerRole === 'team_manager';
  const managedTeamIds = league?.viewerContext?.managedTeamIds || [];

  useEffect(() => {
    Promise.all([leaguesApi.getById(leagueId), leaguesApi.listTeams(leagueId)])
      .then(([leagueResponse, teamsResponse]) => {
        const nextLeague = leagueResponse.league;
        setLeague(nextLeague);
        const nextTeams = teamsResponse.teams || [];
        setTeams(nextTeams);

        const nextManagedIds = nextLeague?.viewerContext?.managedTeamIds || [];
        const isManager = nextLeague?.viewerContext?.viewerRole === 'team_manager';

        if (isManager && nextManagedIds.length > 0) {
          setSelectedManagedTeamId(nextManagedIds[0]);
          const firstOpponent = nextTeams.find((t) => !nextManagedIds.includes(t.id));
          if (firstOpponent) setOpponentTeamId(firstOpponent.id);
        } else if (nextTeams.length > 1) {
          setHomeLeagueTeamId(nextTeams[0].id);
          setAwayLeagueTeamId(nextTeams[1].id);
        }
      })
      .catch((loadError) => setError(loadError.message || 'Failed to load league setup'))
      .finally(() => setIsLoading(false));
  }, [leagueId]);

  const effectiveHomeId = isTeamManagerRole
    ? teamSide === 'home'
      ? selectedManagedTeamId
      : opponentTeamId
    : homeLeagueTeamId;
  const effectiveAwayId = isTeamManagerRole
    ? teamSide === 'home'
      ? opponentTeamId
      : selectedManagedTeamId
    : awayLeagueTeamId;
  const effectiveSide = isTeamManagerRole
    ? teamSide === 'home'
      ? TEAM_SIDES.HOME
      : TEAM_SIDES.AWAY
    : initialActiveSide;

  async function onSubmit(event) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      const response = await gamesApi.create({
        gameContext: 'league',
        trackingMode: 'dual_team',
        leagueId,
        homeLeagueTeamId: effectiveHomeId,
        awayLeagueTeamId: effectiveAwayId,
        initialActiveSide: effectiveSide,
        ...(title.trim() ? { title: title.trim() } : {}),
        ...(scheduledAt ? { scheduledAt: new Date(scheduledAt).toISOString() } : {}),
        ...(videoUrl.trim() ? { videoUrl: videoUrl.trim() } : {}),
      });
      navigate(`/games/${response.game.id}/track`);
    } catch (submitError) {
      setError(submitError.message || 'Failed to create league game');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return <SportsLoader label="Loading league teams" fullPage />;
  }

  const hasValidMatchup = isTeamManagerRole
    ? Boolean(selectedManagedTeamId && opponentTeamId && selectedManagedTeamId !== opponentTeamId)
    : Boolean(homeLeagueTeamId && awayLeagueTeamId && homeLeagueTeamId !== awayLeagueTeamId);

  const homeTeam = teams.find((t) => t.id === effectiveHomeId) ?? null;
  const awayTeam = teams.find((t) => t.id === effectiveAwayId) ?? null;

  const managedTeams = teams.filter((t) => managedTeamIds.includes(t.id));
  const opponentTeams = teams.filter((t) => t.id !== selectedManagedTeamId);

  function rosterWarning(team) {
    return typeof team?.activeRosterCount === 'number' && team.activeRosterCount < 5;
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 pb-10">
      <Breadcrumbs
        crumbs={[
          { label: 'Admin', href: '/admin' },
          { label: league?.name || 'League', href: `/admin/leagues/${leagueId}` },
          { label: 'Schedule Game' },
        ]}
      />

      <PageHeader
        title="Schedule Game"
        description="Set up the matchup and jump straight into tracking."
      />

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <form onSubmit={onSubmit} className="space-y-4">
        {/* ── Matchup card ── */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {isTeamManagerRole ? (
            <div className="space-y-4">
              {/* Your team */}
              {managedTeams.length > 1 ? (
                <>
                  <TeamPickerButton
                    label="Your Team"
                    team={teams.find((t) => t.id === selectedManagedTeamId) ?? null}
                    onClick={() => setPickerOpen('managed')}
                    hasRosterWarning={rosterWarning(
                      teams.find((t) => t.id === selectedManagedTeamId)
                    )}
                  />
                  <TeamPickerModal
                    open={pickerOpen === 'managed'}
                    onClose={() => setPickerOpen(null)}
                    title="Your Team"
                    teams={managedTeams}
                    selectedId={selectedManagedTeamId}
                    onSelect={(id) => {
                      setSelectedManagedTeamId(id);
                      if (opponentTeamId === id) setOpponentTeamId('');
                    }}
                  />
                </>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Your Team
                  </p>
                  <div className="flex items-center gap-3 rounded-2xl border-2 border-indigo-200 bg-indigo-50 px-4 py-3">
                    <TeamAvatar team={managedTeams[0]} />
                    <span className="font-semibold text-indigo-900">
                      {managedTeams[0]?.name || '—'}
                    </span>
                  </div>
                </div>
              )}

              {/* Home / Away toggle */}
              <div className="flex flex-col gap-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Are you Home or Away?
                </p>
                <SideToggle value={teamSide} onChange={setTeamSide} />
              </div>

              {/* Opponent */}
              <TeamPickerButton
                label="Opponent"
                team={teams.find((t) => t.id === opponentTeamId) ?? null}
                onClick={() => setPickerOpen('opponent')}
                hasRosterWarning={rosterWarning(teams.find((t) => t.id === opponentTeamId))}
              />
              <TeamPickerModal
                open={pickerOpen === 'opponent'}
                onClose={() => setPickerOpen(null)}
                title="Choose Opponent"
                teams={opponentTeams}
                selectedId={opponentTeamId}
                disabledId={selectedManagedTeamId}
                onSelect={setOpponentTeamId}
              />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Home + Away pickers — stacked on mobile, side-by-side on md+ */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr,auto,1fr] md:items-end">
                <TeamPickerButton
                  label="Home Team"
                  team={homeTeam}
                  onClick={() => setPickerOpen('home')}
                  hasRosterWarning={rosterWarning(homeTeam)}
                />

                {/* VS divider — hidden on mobile, shown between cols on md */}
                <div className="hidden md:flex md:items-center md:justify-center md:pb-1">
                  <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-400">
                    VS
                  </span>
                </div>

                <TeamPickerButton
                  label="Away Team"
                  team={awayTeam}
                  onClick={() => setPickerOpen('away')}
                  hasRosterWarning={rosterWarning(awayTeam)}
                />
              </div>

              {/* Modals */}
              <TeamPickerModal
                open={pickerOpen === 'home'}
                onClose={() => setPickerOpen(null)}
                title="Choose Home Team"
                teams={teams}
                selectedId={homeLeagueTeamId}
                disabledId={awayLeagueTeamId}
                onSelect={setHomeLeagueTeamId}
              />
              <TeamPickerModal
                open={pickerOpen === 'away'}
                onClose={() => setPickerOpen(null)}
                title="Choose Away Team"
                teams={teams}
                selectedId={awayLeagueTeamId}
                disabledId={homeLeagueTeamId}
                onSelect={setAwayLeagueTeamId}
              />

              {/* Start tracking on */}
              {hasValidMatchup && (
                <div className="flex flex-col gap-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Start Tracking On
                  </p>
                  <SideToggle
                    value={initialActiveSide}
                    onChange={setInitialActiveSide}
                    homeLabel={homeTeam?.name || 'Home'}
                    awayLabel={awayTeam?.name || 'Away'}
                  />
                </div>
              )}
            </div>
          )}

          {/* Matchup summary / warning */}
          {!hasValidMatchup ? (
            <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
              Select two different teams to continue.
            </p>
          ) : (
            <div className="mt-4 flex items-center justify-center gap-3 rounded-xl bg-slate-50 px-4 py-3">
              <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
                <span className="truncate text-sm font-semibold text-slate-700">
                  {awayTeam?.name}
                </span>
                <TeamAvatar team={awayTeam} size="sm" />
              </div>
              <span className="shrink-0 text-xs font-bold text-slate-400">@</span>
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <TeamAvatar team={homeTeam} size="sm" />
                <span className="truncate text-sm font-semibold text-slate-700">
                  {homeTeam?.name}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* ── Game details card ── */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Game Details
          </p>
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Title</span>
              <input
                type="text"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                placeholder={
                  hasValidMatchup ? `${awayTeam?.name} at ${homeTeam?.name}` : 'e.g. Away at Home'
                }
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label className="block min-w-0">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Scheduled At</span>
              <input
                type="datetime-local"
                className="w-full max-w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
            </label>
            <label className="block min-w-0">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">YouTube URL</span>
              <input
                type="url"
                className="w-full max-w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                placeholder="https://www.youtube.com/watch?v=..."
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
              />
            </label>
          </div>
        </div>

        <button
          type="submit"
          disabled={isSubmitting || !hasValidMatchup}
          className="w-full rounded-2xl bg-slate-900 py-4 text-sm font-semibold text-white transition-opacity disabled:opacity-40 active:opacity-80"
        >
          {isSubmitting ? 'Creating game…' : 'Create and Start Tracking'}
        </button>
      </form>
    </main>
  );
}
