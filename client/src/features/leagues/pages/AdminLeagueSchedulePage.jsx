import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Breadcrumbs } from '../../../components/Breadcrumbs';
import { PageHeader } from '../../../components/PageHeader';
import { SportsLoader } from '../../../components/SportsLoader';
import { Modal } from '../../../components/ui/Modal';
import { leaguesApi } from '../api/leaguesApi';
import { ScheduleDraftTable } from '../components/ScheduleDraftTable';
import { assignDates, buildRoundRobin } from '../scheduleBuilder';

const WEEKDAYS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
];

const DEFAULT_SLOTS = '10:00, 11:30, 13:00';

function todayAsDateInputValue() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// "10:00, 11:30" -> ['10:00', '11:30']; tolerates stray whitespace and bad entries.
function parseSlots(raw) {
  return raw
    .split(',')
    .map((slot) => slot.trim())
    .filter((slot) => /^\d{1,2}:\d{2}$/.test(slot));
}

function formatDay(date) {
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export function AdminLeagueSchedulePage() {
  const { leagueId } = useParams();
  const navigate = useNavigate();

  // Imperative fetch rather than useQuery: the admin surface has no
  // QueryClientProvider in several of its test trees, and this is a one-shot
  // read feeding local draft state (same reasoning as `useExportCsv` —
  // PROJECT-KNOWLEDGE §11).
  const [league, setLeague] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    if (!leagueId) return undefined;

    let cancelled = false;
    setIsLoading(true);

    leaguesApi
      .getById(leagueId)
      .then((response) => {
        if (!cancelled) {
          setLeague(response.league);
          setLoadError(null);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(error);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [leagueId]);

  const teams = useMemo(() => league?.teams ?? [], [league]);
  const hasActiveSeason = Boolean(league?.currentSeason);

  const [selectedTeamIds, setSelectedTeamIds] = useState(null);
  const [startDate, setStartDate] = useState(todayAsDateInputValue);
  const [weekdays, setWeekdays] = useState([6]);
  const [slotsText, setSlotsText] = useState(DEFAULT_SLOTS);
  const [defaultVenue, setDefaultVenue] = useState('');

  const [rows, setRows] = useState([]);
  const [hasDraft, setHasDraft] = useState(false);
  const [overflowCount, setOverflowCount] = useState(0);
  const [overflowAcknowledged, setOverflowAcknowledged] = useState(false);
  const [replaceExisting, setReplaceExisting] = useState(false);

  const [nextManualId, setNextManualId] = useState(1);
  const [formError, setFormError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmReplaceOpen, setConfirmReplaceOpen] = useState(false);

  // Default to every team once the league loads; `null` distinguishes
  // "not initialised yet" from "the admin deselected everything".
  useEffect(() => {
    if (selectedTeamIds === null && teams.length) {
      setSelectedTeamIds(teams.map((team) => team.id));
    }
  }, [teams, selectedTeamIds]);

  const gameRows = useMemo(() => rows.filter((row) => !row.isBye), [rows]);

  // The draft only lives in memory (D1), so warn before it is thrown away.
  useEffect(() => {
    if (!gameRows.length) return undefined;

    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [gameRows.length]);

  const activeSelection = selectedTeamIds ?? [];

  const toggleTeam = (teamId) => {
    setSelectedTeamIds((current) => {
      const list = current ?? teams.map((team) => team.id);
      return list.includes(teamId) ? list.filter((id) => id !== teamId) : [...list, teamId];
    });
  };

  const toggleWeekday = (value) => {
    setWeekdays((current) =>
      current.includes(value) ? current.filter((day) => day !== value) : [...current, value]
    );
  };

  const handleSuggestPairings = () => {
    setFormError('');
    setSubmitError('');

    if (activeSelection.length < 2) {
      setFormError('Select at least two teams to generate a schedule.');
      return;
    }

    const slots = parseSlots(slotsText);
    if (!slots.length) {
      setFormError('Add at least one time slot, for example 10:00.');
      return;
    }

    if (!weekdays.length) {
      setFormError('Pick at least one day of the week.');
      return;
    }

    const rounds = buildRoundRobin(activeSelection);
    const { rows: generated, overflowCount: generatedOverflow } = assignDates(rounds, {
      startDate,
      weekdays: [...weekdays].sort((a, b) => a - b),
      slots,
      venue: defaultVenue.trim(),
    });

    setRows(generated);
    setOverflowCount(generatedOverflow);
    setOverflowAcknowledged(false);
    setHasDraft(true);
  };

  const handleStartEmpty = () => {
    setFormError('');
    setSubmitError('');
    setRows([]);
    setOverflowCount(0);
    setOverflowAcknowledged(false);
    setHasDraft(true);
  };

  const handleAddGame = () => {
    const slots = parseSlots(slotsText);
    const [hours, minutes] = (slots[0] ?? '10:00').split(':').map(Number);
    const scheduledAt = new Date(`${startDate}T00:00:00`);
    scheduledAt.setHours(hours, minutes, 0, 0);

    setRows((current) => [
      ...current,
      {
        // Manual rows need ids that can't collide with generated `row-N` ones.
        id: `manual-${nextManualId}`,
        round: 1,
        isBye: false,
        homeLeagueTeamId: activeSelection[0] ?? teams[0]?.id,
        awayLeagueTeamId: activeSelection[1] ?? teams[1]?.id,
        scheduledAt,
        venue: defaultVenue.trim(),
        overflowed: false,
      },
    ]);
    setNextManualId((current) => current + 1);
  };

  const handleChangeRow = useCallback((rowId, patch) => {
    setRows((current) => current.map((row) => (row.id === rowId ? { ...row, ...patch } : row)));
  }, []);

  const handleSwapSides = useCallback((rowId) => {
    setRows((current) =>
      current.map((row) =>
        row.id === rowId
          ? {
              ...row,
              homeLeagueTeamId: row.awayLeagueTeamId,
              awayLeagueTeamId: row.homeLeagueTeamId,
            }
          : row
      )
    );
  }, []);

  const handleRemoveRow = useCallback((rowId) => {
    setRows((current) => current.filter((row) => row.id !== rowId));
  }, []);

  const unacknowledgedOverflow = overflowCount > 0 && !overflowAcknowledged;
  const canSubmit = gameRows.length > 0 && !unacknowledgedOverflow && !isSubmitting;

  const submitDraft = async () => {
    setSubmitError('');
    setIsSubmitting(true);

    try {
      await leaguesApi.bulkCreateGames(leagueId, {
        replaceExisting,
        games: gameRows.map((row) => {
          const game = {
            homeLeagueTeamId: row.homeLeagueTeamId,
            awayLeagueTeamId: row.awayLeagueTeamId,
            scheduledAt: row.scheduledAt.toISOString(),
          };

          const venue = (row.venue ?? '').trim();
          if (venue) {
            game.venue = venue;
          }

          return game;
        }),
      });

      navigate(`/admin/leagues/${leagueId}`);
    } catch (error) {
      // Surface the server's real message — a generic string here makes these
      // failures very hard to diagnose (see PROJECT-KNOWLEDGE §11).
      setSubmitError(error?.message || 'Could not create the schedule.');
    } finally {
      setIsSubmitting(false);
      setConfirmReplaceOpen(false);
    }
  };

  const handleCommit = () => {
    if (replaceExisting) {
      setConfirmReplaceOpen(true);
      return;
    }
    submitDraft();
  };

  const overflowDates = useMemo(() => {
    const moved = gameRows.filter((row) => row.overflowed);
    if (!moved.length) return '';
    return formatDay(moved[0].scheduledAt);
  }, [gameRows]);

  if (isLoading) {
    return <SportsLoader />;
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {loadError.message || 'Could not load this league.'}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
      <Breadcrumbs
        crumbs={[
          { label: 'Admin', href: '/admin' },
          { label: league?.name ?? 'League', href: `/admin/leagues/${leagueId}` },
          { label: 'Build schedule' },
        ]}
      />

      <div className="mt-4">
        <PageHeader
          eyebrow={league?.name}
          title="Build schedule"
          description="Create a full slate of league games in one go. Nothing is saved until you create the games."
        />
      </div>

      {!hasActiveSeason ? (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
          <p>This league has no active season. Start a season before scheduling games.</p>
          <Link
            to={`/admin/leagues/${leagueId}?tab=settings#season`}
            className="mt-3 inline-flex rounded-lg bg-amber-900 px-4 py-2 font-semibold text-white transition hover:bg-amber-800"
          >
            Go to season settings
          </Link>
        </div>
      ) : (
        <>
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
            <h2 className="text-lg font-semibold text-slate-900">1. Teams</h2>
            <p className="mt-1 text-sm text-slate-500">
              Every selected team will play each other team once.
            </p>

            {teams.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">
                This league has no teams yet. Add teams before building a schedule.
              </p>
            ) : (
              <div className="mt-4 flex flex-wrap gap-2">
                {teams.map((team) => {
                  const checked = activeSelection.includes(team.id);
                  return (
                    <label
                      key={team.id}
                      className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                        checked
                          ? 'border-sky-500 bg-sky-50 text-sky-900'
                          : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleTeam(team.id)}
                        aria-label={team.name}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                      <span className="font-medium">{team.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </section>

          <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
            <h2 className="text-lg font-semibold text-slate-900">2. Days and times</h2>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="schedule-start-date"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  First game day
                </label>
                <input
                  id="schedule-start-date"
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
                />
              </div>

              <div>
                <label
                  htmlFor="schedule-slots"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Time slots per game day
                </label>
                <input
                  id="schedule-slots"
                  type="text"
                  value={slotsText}
                  onChange={(event) => setSlotsText(event.target.value)}
                  placeholder="10:00, 11:30, 13:00"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
                />
                <p className="mt-1 text-xs text-slate-400">
                  Comma separated, 24-hour clock. Games fill these in order.
                </p>
              </div>

              <div className="sm:col-span-2">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Days of the week
                </span>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAYS.map((day) => {
                    const checked = weekdays.includes(day.value);
                    return (
                      <label
                        key={day.value}
                        className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                          checked
                            ? 'border-sky-500 bg-sky-50 text-sky-900'
                            : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleWeekday(day.value)}
                          aria-label={day.label}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                        <span className="font-medium">{day.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="sm:col-span-2">
                <label
                  htmlFor="schedule-venue"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Default venue (optional)
                </label>
                <input
                  id="schedule-venue"
                  type="text"
                  value={defaultVenue}
                  maxLength={120}
                  onChange={(event) => setDefaultVenue(event.target.value)}
                  placeholder="Main Court"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
                />
              </div>
            </div>

            {formError && (
              <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {formError}
              </p>
            )}

            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={handleSuggestPairings}
                className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
              >
                Suggest pairings
              </button>
              <button
                type="button"
                onClick={handleStartEmpty}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Start empty
              </button>
            </div>
          </section>

          {hasDraft && (
            <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-slate-900">3. Review the draft</h2>
                <button
                  type="button"
                  onClick={handleAddGame}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Add game
                </button>
              </div>

              {overflowCount > 0 && (
                <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
                  <p className="text-sm font-semibold text-amber-900">
                    {overflowCount} game{overflowCount === 1 ? '' : 's'} couldn&apos;t fit your time
                    slots{overflowDates ? ` and moved to ${overflowDates} or later` : ''}.
                  </p>
                  <p className="mt-1 text-sm text-amber-800">
                    Add more time slots or days and generate again, or confirm the new dates below.
                    Players will see whatever you create here.
                  </p>
                  <label className="mt-3 flex items-center gap-2 text-sm font-medium text-amber-900">
                    <input
                      type="checkbox"
                      checked={overflowAcknowledged}
                      onChange={(event) => setOverflowAcknowledged(event.target.checked)}
                      aria-label="I understand the moved dates"
                      className="h-4 w-4 rounded border-amber-400"
                    />
                    I understand these games moved to a later date
                  </label>
                </div>
              )}

              <div className="mt-4">
                <ScheduleDraftTable
                  rows={rows}
                  teams={teams}
                  onChangeRow={handleChangeRow}
                  onSwapSides={handleSwapSides}
                  onRemoveRow={handleRemoveRow}
                />
              </div>

              <label className="mt-5 flex items-start gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={replaceExisting}
                  onChange={(event) => setReplaceExisting(event.target.checked)}
                  aria-label="Replace existing scheduled games"
                  className="mt-0.5 h-4 w-4 rounded border-slate-300"
                />
                <span>
                  Replace existing scheduled games in this season.
                  <span className="block text-xs text-slate-500">
                    Only games that haven&apos;t started are removed. Completed and in-progress
                    games are never touched.
                  </span>
                </span>
              </label>

              {submitError && (
                <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {submitError}
                </p>
              )}

              <div className="mt-5">
                <button
                  type="button"
                  onClick={handleCommit}
                  disabled={!canSubmit}
                  className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
                >
                  {isSubmitting
                    ? 'Creating…'
                    : `Create ${gameRows.length} game${gameRows.length === 1 ? '' : 's'}`}
                </button>
              </div>
            </section>
          )}
        </>
      )}

      <Modal
        open={confirmReplaceOpen}
        onClose={() => setConfirmReplaceOpen(false)}
        title="Replace existing games?"
        panelClassName="max-w-sm"
      >
        <p className="text-sm text-slate-500">
          Every game in this season that hasn&apos;t started yet will be deleted and replaced with
          the {gameRows.length} game{gameRows.length === 1 ? '' : 's'} in this draft. Completed and
          in-progress games are kept. This cannot be undone.
        </p>
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={() => setConfirmReplaceOpen(false)}
            className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submitDraft}
            disabled={isSubmitting}
            className="flex-1 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-40"
          >
            Replace and create
          </button>
        </div>
      </Modal>
    </div>
  );
}
