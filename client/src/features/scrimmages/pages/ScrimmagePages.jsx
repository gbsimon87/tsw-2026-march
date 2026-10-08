import { ScrimmageWeeklyRecap } from '../components/ScrimmageWeeklyRecap';
import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../app/store/AuthContext';
import { SportsLoader } from '../../../components/SportsLoader';
import { scrimmagesApi } from '../api/scrimmagesApi';
import { ScrimmageResultsReview } from '../components/ScrimmageResultsReview';
import { ScrimmageStandings } from '../components/ScrimmageStandings';
import { NewScrimmageGameDialog } from '../components/NewScrimmageGameDialog';
import { formatVideoTime, gameVideoLink } from '../videoTime';
import { ScrimmagePlayerImport } from '../components/ScrimmagePlayerImport';
import { MergeScrimmagePlayers } from '../components/MergeScrimmagePlayers';
import { PageHeader } from '../../../components/PageHeader';
import { Breadcrumbs } from '../../../components/Breadcrumbs';
import { Tabs } from '../../../components/Tabs';
import { Modal } from '../../../components/ui/Modal';

const button =
  'rounded-lg bg-[#1B4332] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50';
const panel = 'space-y-4 rounded-xl border border-slate-200 bg-white p-5';
const input = 'mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm';
const defaults = {
  missPenalty: 1,
  turnoverPenalty: 2,
  winBonus: 2,
  lossPenalty: 1,
  weeklyMinGames: 3,
  seasonMinGames: 6,
  seasonMinWeeks: 2,
};
const ruleLabels = {
  missPenalty: 'Penalty per missed shot',
  turnoverPenalty: 'Penalty per turnover',
  winBonus: 'Bonus per win',
  lossPenalty: 'Penalty per loss',
  weeklyMinGames: 'Weekly minimum games',
  seasonMinGames: 'Season minimum games',
  seasonMinWeeks: 'Season minimum weeks',
};
function Field({ label, children }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      {children}
    </label>
  );
}
function RulesFields({ rules, setRules }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {Object.entries(ruleLabels).map(([key, label]) => (
        <Field key={key} label={label}>
          <input
            className={input}
            type="number"
            required
            min={key.includes('Min') ? 1 : 0}
            max={key.includes('Min') ? 1000 : 10}
            step={key.includes('Min') ? 1 : 0.1}
            value={rules[key]}
            onChange={(e) => setRules({ ...rules, [key]: Number(e.target.value) })}
          />
        </Field>
      ))}
    </div>
  );
}
function TermsForm({ terms, displayName, onSubmit, children }) {
  const [signedName, setSignedName] = useState(displayName || '');
  const [accepted, setAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => setAccepted(false), [terms.version]);
  async function submit(e) {
    e.preventDefault();
    if (!accepted || !signedName.trim()) {
      setError('Enter your full name and explicitly accept the terms.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSubmit({ signedName, termsVersion: terms.version, accepted: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <form onSubmit={submit} className={panel}>
      <h3 className="font-semibold">Terms & Conditions</h3>
      <div className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-sm">
        {terms.text}
      </div>
      {children}
      <Field label="Full name / signature">
        <input
          className={input}
          required
          maxLength="120"
          value={signedName}
          onChange={(e) => setSignedName(e.target.value)}
        />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
        I have read and accept these Terms & Conditions.
      </label>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      <button className={button} disabled={!accepted || saving}>
        {saving ? 'Submitting…' : 'Sign & submit'}
      </button>
    </form>
  );
}

export function ScrimmageAdminListPage() {
  const [search] = useSearchParams();
  const [showCreate, setShowCreate] = useState(search.get('create') === '1');
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [rules, setRules] = useState(defaults);
  const {
    data,
    isLoading,
    error: loadError,
  } = useQuery({ queryKey: ['managedScrimmages'], queryFn: scrimmagesApi.managed });
  async function create(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setSaving(true);
    setError('');
    try {
      const result = await scrimmagesApi.create({
        name: form.get('name'),
        seasonLabel: form.get('seasonLabel'),
        termsText: form.get('termsText'),
        termsScope: form.get('termsScope'),
        isPublic: form.get('isPublic') === 'on',
        mvpRules: rules,
      });
      navigate(`/admin/scrimmage/${result.scrimmage.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <main className="space-y-6">
      <Link to="/admin" className="text-sm underline">
        ← Admin
      </Link>
      <PageHeader
        title="Scrimmages"
        description="Organize weekly sessions, reusable player pools and season standings."
      />
      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-900">Quick Actions</h2>
        <button className={button} onClick={() => setShowCreate((shown) => !shown)}>
          {showCreate ? 'Cancel creation' : 'Create Scrimmage'}
        </button>
      </section>
      {isLoading ? (
        <SportsLoader label="Loading scrimmages" />
      ) : loadError ? (
        <p role="alert">{loadError.message}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {(data?.scrimmages || []).map((s) => (
            <Link key={s.id} className={panel} to={`/admin/scrimmage/${s.id}`}>
              <h2 className="font-semibold">{s.name}</h2>
              <p className="text-sm text-slate-500">Manage pool, weekly sessions & standings →</p>
            </Link>
          ))}
        </div>
      )}
      {showCreate && (
        <form onSubmit={create} className={panel}>
          <h2 className="text-xl font-bold">Create a recurring scrimmage</h2>
          <Field label="Name">
            <input
              name="name"
              className={input}
              required
              maxLength="120"
              placeholder="We-ball Wednesdays"
            />
          </Field>
          <Field label="First season">
            <input
              name="seasonLabel"
              className={input}
              required
              defaultValue="Season 1"
              maxLength="120"
            />
          </Field>
          <Field label="Terms & Conditions">
            <textarea
              name="termsText"
              className={input}
              required
              maxLength="20000"
              rows="5"
              placeholder="Enter the terms players must sign when claiming a profile."
            />
          </Field>
          <Field label="Terms acceptance">
            <select name="termsScope" className={input}>
              <option value="series">When claiming the recurring scrimmage profile</option>
              <option value="weekly">When claiming, and again for each weekly session</option>
            </select>
          </Field>
          <label className="flex gap-2 text-sm">
            <input type="checkbox" name="isPublic" defaultChecked />
            List publicly in Discover
          </label>
          <RulesFields rules={rules} setRules={setRules} />
          {error && (
            <p role="alert" className="text-red-700">
              {error}
            </p>
          )}
          <button className={button} disabled={saving}>
            {saving ? 'Creating…' : 'Create scrimmage'}
          </button>
        </form>
      )}
    </main>
  );
}

function PoolAdmin({ id, pool, run }) {
  async function add(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const values = new FormData(form);
    const success = await run(() =>
      scrimmagesApi.addPlayer(id, { displayName: values.get('displayName') })
    );
    if (success) form.reset();
  }
  return (
    <section className={panel}>
      <h2 className="text-xl font-bold">Reusable player pool</h2>
      <form className="flex flex-wrap items-end gap-2" onSubmit={add}>
        <Field label="New player">
          <input name="displayName" className={input} required maxLength="120" />
        </Field>
        <button className={button}>Add player</button>
      </form>
      <ScrimmagePlayerImport scrimmageId={id} run={run} />
      <ul className="list-none space-y-2 p-0">
        {pool.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-3">
            <Link className="text-sm underline" to={`/admin/scrimmage/${id}/players/${p.id}`}>
              View profile
            </Link>
            <form
              className="flex flex-1 gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                run(() =>
                  scrimmagesApi.updatePlayer(id, p.id, {
                    displayName: new FormData(e.currentTarget).get('name'),
                  })
                );
              }}
            >
              <input
                aria-label={`Name for ${p.displayName}`}
                name="name"
                defaultValue={p.displayName}
                required
                maxLength="120"
                className="min-w-0 flex-1 rounded border p-2 text-sm"
              />
              <button className="text-sm underline">Save name</button>
            </form>
            <button
              className="text-sm underline"
              onClick={() =>
                run(() => scrimmagesApi.updatePlayer(id, p.id, { isActive: !p.isActive }))
              }
            >
              {p.isActive ? 'Deactivate' : 'Reactivate'}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
function WeeklyForm({ id, pool, run, previous, template }) {
  const navigate = useNavigate();
  const [assignments, setAssignments] = useState(() =>
    template
      ? Object.fromEntries(
          template.assignments
            .filter((player) =>
              pool.some((entry) => entry.id === player.playerId && entry.isActive)
            )
            .map((player) => [player.playerId, player.color])
        )
      : {}
  );
  async function create(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await run(async () => {
      const result = await scrimmagesApi.createSession(id, {
        label: form.get('label'),
        date: form.get('date'),
        ...(form.get('videoUrl') ? { videoUrl: form.get('videoUrl') } : {}),
        assignments: Object.entries(assignments)
          .filter(([, color]) => color.trim())
          .map(([playerId, color]) => ({ playerId, color })),
        scoringRules: {
          insideArc: Number(form.get('insideArc')),
          outsideArc: Number(form.get('outsideArc')),
        },
        regulationSeconds: Math.round(Number(form.get('regulationMinutes')) * 60),
        overtimeSeconds: Math.round(Number(form.get('overtimeMinutes')) * 60),
        ...(form.get('termsText') ? { termsText: form.get('termsText') } : {}),
      });
      navigate(`/admin/scrimmage/${id}/sessions/${result.session.id}`);
    });
  }
  return (
    <form onSubmit={create} className={panel}>
      <h2 className="text-xl font-bold">Create this week’s session</h2>
      {template && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-slate-700">
          Attendance, colors and rules copied from <strong>{template.label}</strong>. Review the
          players and settings, then choose this week’s label, date and recording.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Session label">
          <input name="label" className={input} required placeholder="Week 1" maxLength="120" />
        </Field>
        <Field label="Session date">
          <input type="date" name="date" className={input} required />
        </Field>
      </div>
      <Field label="Full weekly YouTube video">
        <input
          name="videoUrl"
          type="url"
          className={input}
          placeholder="https://www.youtube.com/watch?v=…"
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          ['insideArc', 'Points inside arc', template?.scoringRules?.insideArc ?? 1, 3],
          ['outsideArc', 'Points outside arc', template?.scoringRules?.outsideArc ?? 2, 4],
          [
            'regulationMinutes',
            'Regulation minutes',
            template?.regulationSeconds ? template.regulationSeconds / 60 : 4,
            60,
          ],
          [
            'overtimeMinutes',
            'Overtime minutes',
            template?.overtimeSeconds ? template.overtimeSeconds / 60 : 4,
            60,
          ],
        ].map(([key, label, value, max]) => (
          <Field key={key} label={label}>
            <input
              name={key}
              className={input}
              type="number"
              step={key.endsWith('Minutes') ? 'any' : '1'}
              min="1"
              max={max}
              defaultValue={value}
              required
            />
          </Field>
        ))}
      </div>
      <p className="text-sm text-slate-600">
        Assign each attending player one color for the entire night. Leave absent players blank.
        Select up to five players per side. Games are finished manually.
      </p>
      {previous && (
        <button
          type="button"
          className="text-sm underline"
          onClick={() =>
            setAssignments(
              Object.fromEntries(
                previous.assignments
                  .filter((p) => pool.some((entry) => entry.id === p.playerId && entry.isActive))
                  .map((p) => [p.playerId, p.color])
              )
            )
          }
        >
          Reuse the previous week’s attendance & colors
        </button>
      )}
      <datalist id="scrimmage-colors">
        {['red', 'white', 'blue', 'black', 'green', 'yellow', 'orange'].map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <div className="grid gap-2 sm:grid-cols-2">
        {pool
          .filter((p) => p.isActive)
          .map((p) => (
            <Field key={p.id} label={p.displayName}>
              <input
                list="scrimmage-colors"
                className={input}
                maxLength="40"
                placeholder="Color, or blank if absent"
                value={assignments[p.id] || ''}
                onChange={(e) => setAssignments({ ...assignments, [p.id]: e.target.value })}
              />
            </Field>
          ))}
      </div>
      <Field label="Optional terms for this particular week">
        <textarea
          name="termsText"
          className={input}
          maxLength="20000"
          rows="3"
          placeholder="Leave blank to use the recurring scrimmage terms."
        />
      </Field>
      <button className={button}>Create weekly session</button>
    </form>
  );
}

function SeriesSettings({ series, run }) {
  const [rules, setRules] = useState(
    series.seasons.find((s) => s.id === series.activeSeasonId)?.mvpRules || defaults
  );
  async function update(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await run(() =>
      scrimmagesApi.update(series.id, {
        name: form.get('name'),
        termsText: form.get('termsText'),
        termsScope: form.get('termsScope'),
        isPublic: form.get('isPublic') === 'on',
        managerEmails: form
          .get('managerEmails')
          .split(/[\s,]+/)
          .filter(Boolean),
      })
    );
  }
  return (
    <>
      <form className={panel} onSubmit={update}>
        <h2 className="text-xl font-bold">Scrimmage settings</h2>
        <Field label="Name">
          <input
            className={input}
            name="name"
            defaultValue={series.name}
            required
            maxLength="120"
          />
        </Field>
        <details className="rounded-xl border border-slate-200 p-4">
          <summary className="cursor-pointer text-sm font-semibold">
            Edit participation terms
          </summary>
          <div className="mt-3">
            <Field label="Terms & Conditions">
              <textarea
                className={input}
                name="termsText"
                defaultValue={series.terms.text}
                required
                maxLength="20000"
                rows="5"
              />
            </Field>
          </div>
        </details>
        <Field label="Terms acceptance">
          <select name="termsScope" className={input} defaultValue={series.termsScope}>
            <option value="series">When claiming the profile</option>
            <option value="weekly">When claiming and each week</option>
          </select>
        </Field>
        <Field label="Additional admin emails (comma separated)">
          <input
            className={input}
            name="managerEmails"
            defaultValue={(series.managerEmails || []).join(', ')}
          />
        </Field>
        <label className="flex gap-2 text-sm">
          <input name="isPublic" type="checkbox" defaultChecked={series.isPublic} />
          List publicly
        </label>
        <button className={button}>Save settings</button>
      </form>
      <form
        className={panel}
        onSubmit={(e) => {
          e.preventDefault();
          const label = new FormData(e.currentTarget).get('label');
          run(() => scrimmagesApi.resetSeason(series.id, { label, mvpRules: rules }));
        }}
      >
        <h2 className="text-xl font-bold">Start a new season</h2>
        <p className="text-sm text-slate-600">
          Finish open weekly sessions first. Previous seasons remain available; the reusable pool is
          retained. These MVP settings apply to the new season.
        </p>
        <Field label="New season label">
          <input name="label" className={input} required maxLength="120" />
        </Field>
        <RulesFields rules={rules} setRules={setRules} />
        <button className={button}>Start new season</button>
      </form>
    </>
  );
}

export function ScrimmagePage({ adminMode = false }) {
  const { scrimmageId } = useParams();
  const { user } = useAuth();
  const [search, setSearch] = useSearchParams();
  const seasonId = search.get('seasonId');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [claimPlayerId, setClaimPlayerId] = useState('');
  const [showClaim, setShowClaim] = useState(false);
  const [showWeekForm, setShowWeekForm] = useState(false);
  const [repeatWeek, setRepeatWeek] = useState(false);
  const client = useQueryClient();
  const {
    data,
    isLoading,
    error: loadError,
  } = useQuery({
    queryKey: ['scrimmage', scrimmageId, seasonId, user?.id],
    queryFn: () => scrimmagesApi.detail(scrimmageId, seasonId),
  });
  const { data: requests } = useQuery({
    queryKey: ['scrimmageRequests', scrimmageId],
    queryFn: () => scrimmagesApi.requests(scrimmageId),
    enabled: Boolean(adminMode && data?.scrimmage.canManage),
  });
  async function run(action) {
    if (busy) return false;
    setBusy(true);
    setError('');
    try {
      await action();
      await Promise.all([
        client.invalidateQueries({ queryKey: ['scrimmage', scrimmageId] }),
        client.invalidateQueries({ queryKey: ['scrimmageRequests', scrimmageId] }),
        client.invalidateQueries({ queryKey: ['scrimmageImportOptions', scrimmageId] }),
        client.invalidateQueries({ queryKey: ['myProfiles'] }),
        client.invalidateQueries({ queryKey: ['scrimmagePlayer', scrimmageId] }),
        client.invalidateQueries({ queryKey: ['scrimmageSession', scrimmageId] }),
      ]);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  if (isLoading) return <SportsLoader label="Loading scrimmage" fullPage />;
  if (loadError) return <p role="alert">{loadError.message}</p>;
  const { scrimmage: series, pool, sessions, standings, membership, joinStatus } = data;
  const selectedSeason = series.seasons.find((s) => s.id === (seasonId || series.activeSeasonId));
  const basePath = `${adminMode ? '/admin' : ''}/scrimmage/${scrimmageId}`;
  if (series.canManage && !adminMode)
    return <Navigate to={`/admin/scrimmage/${scrimmageId}?${search}`} replace />;
  if (adminMode && !series.canManage)
    return <Navigate to={`/scrimmage/${scrimmageId}?${search}`} replace />;
  const currentWeek =
    sessions.find((week) => week.activeGameId) ||
    sessions.find((week) => week.status === 'open') ||
    sessions[0];
  const earlierWeeks = sessions.filter((week) => week.id !== currentWeek?.id);
  const tabs = [
    {
      value: 'sessions',
      label: 'Sessions',
      content: (
        <div className="space-y-5">
          <section className={panel}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">Weekly sessions</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Choose a week to view games, colors and results.
                </p>
              </div>
              {adminMode && selectedSeason.id === series.activeSeasonId && (
                <div className="flex flex-wrap gap-2">
                  <button
                    className={button}
                    onClick={() => {
                      setRepeatWeek(false);
                      setShowWeekForm((shown) => !shown);
                    }}
                  >
                    {showWeekForm ? 'Cancel' : 'New weekly session'}
                  </button>
                  {sessions.length > 0 && (
                    <button
                      className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
                      onClick={() => {
                        setRepeatWeek(true);
                        setShowWeekForm(true);
                      }}
                    >
                      Repeat last week
                    </button>
                  )}
                </div>
              )}
            </div>
            {!sessions.length && (
              <p className="text-sm text-slate-600">No sessions in this season yet.</p>
            )}
            {currentWeek && (
              <article className="rounded-xl border border-[#1B4332]/20 bg-[#1B4332]/5 p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#1B4332]">
                  {currentWeek.status === 'open'
                    ? 'Current session'
                    : currentWeek.publishedAt
                      ? 'Latest results'
                      : 'Latest session'}
                </p>
                <h3 className="mt-2 text-xl font-bold">{currentWeek.label}</h3>
                <p className="mt-1 text-sm text-slate-600">
                  {currentWeek.date} · {currentWeek.gameCount ?? 0} games ·{' '}
                  {currentWeek.status === 'open'
                    ? 'Open'
                    : currentWeek.publishedAt
                      ? 'Published'
                      : 'Awaiting publication'}
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link
                    className={button}
                    to={
                      adminMode && currentWeek.activeGameId
                        ? `/games/${currentWeek.activeGameId}/track`
                        : `${basePath}/sessions/${currentWeek.id}${currentWeek.status === 'completed' ? '?tab=results' : ''}`
                    }
                  >
                    {adminMode && currentWeek.activeGameId
                      ? 'Resume tracking'
                      : currentWeek.status === 'open'
                        ? 'Open current session'
                        : currentWeek.publishedAt
                          ? 'View latest results'
                          : adminMode
                            ? 'Review results'
                            : 'View session'}
                  </Link>
                  {adminMode && currentWeek.activeGameId && (
                    <Link
                      className="self-center text-sm underline"
                      to={`${basePath}/sessions/${currentWeek.id}`}
                    >
                      Session overview
                    </Link>
                  )}
                </div>
              </article>
            )}
            {earlierWeeks.length > 0 && (
              <h3 className="text-sm font-semibold text-slate-600">
                Earlier weeks · {selectedSeason.label}
              </h3>
            )}
            <ul className="list-none space-y-2 p-0">
              {earlierWeeks.map((week) => (
                <li key={week.id}>
                  <Link
                    className="flex flex-wrap justify-between gap-2 rounded-lg bg-slate-50 p-3"
                    to={`${basePath}/sessions/${week.id}`}
                  >
                    <span className="font-semibold">
                      {week.label} · {week.date}
                    </span>
                    <span className="text-sm text-slate-500">
                      {week.status === 'completed' ? 'Completed' : 'Open'} →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          {adminMode && showWeekForm && selectedSeason.id === series.activeSeasonId && (
            <fieldset disabled={busy}>
              <WeeklyForm
                key={`${repeatWeek ? 'repeat' : 'new'}-${sessions[0]?.id || ''}`}
                template={repeatWeek ? sessions[0] : undefined}
                id={scrimmageId}
                pool={pool}
                previous={sessions[0]}
                run={async (action) => {
                  const ok = await run(action);
                  if (ok) setShowWeekForm(false);
                  return ok;
                }}
              />
            </fieldset>
          )}
        </div>
      ),
    },
    {
      value: 'players',
      label: 'Players',
      content: adminMode ? (
        <fieldset disabled={busy}>
          <div className="space-y-5">
            <PoolAdmin id={scrimmageId} pool={pool} run={run} />
            <MergeScrimmagePlayers scrimmageId={scrimmageId} pool={pool} run={run} />
          </div>
        </fieldset>
      ) : (
        <>
          <section className={panel}>
            <h2 className="text-xl font-bold">Players</h2>
            <p className="text-sm text-slate-500">
              Open a player’s scrimmage profile to see stats and video plays.
            </p>
            {!pool.length && <p className="text-sm text-slate-600">No players in this pool yet.</p>}
            <ul className="grid list-none gap-2 p-0 sm:grid-cols-2">
              {pool.map((p) => (
                <li key={p.id}>
                  <Link
                    className="block rounded-lg bg-slate-50 p-3 font-semibold underline"
                    to={`${basePath}/players/${p.id}?seasonId=${selectedSeason.id}`}
                  >
                    {p.displayName}
                    {!p.isActive ? ' (inactive)' : ''}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </>
      ),
    },
    {
      value: 'mvp',
      label: 'MVP',
      content: (
        <>
          <ScrimmageStandings
            adminMode={adminMode}
            rows={standings}
            scrimmageId={scrimmageId}
            seasonId={selectedSeason.id}
            rules={selectedSeason.mvpRules}
            scope="season"
            playerId={search.get('playerId') || membership?.id}
          />
        </>
      ),
    },
    ...(adminMode
      ? [
          {
            value: 'claims',
            label: 'Claims',
            content: (
              <fieldset disabled={busy}>
                <section className={panel}>
                  <h2 className="text-xl font-bold">Profile claims</h2>
                  {!requests?.requests?.length && (
                    <p className="text-sm text-slate-600">No pending claims.</p>
                  )}
                  {requests?.requests?.map((r) => (
                    <div className="flex items-center gap-3" key={r.id}>
                      <div className="flex-1 space-y-1">
                        <p className="font-semibold">{r.displayName}</p>
                        <p className="text-sm text-slate-600">
                          Requested by {r.requesterName}
                          {r.requesterEmail ? ` · ${r.requesterEmail}` : ''}
                        </p>
                        {r.signature && (
                          <details className="text-xs text-slate-500">
                            <summary>Signed by {r.signature.signedName}</summary>
                            <p className="mt-2 whitespace-pre-wrap">{r.signature.termsText}</p>
                            <p>Accepted: {new Date(r.signature.acceptedAt).toISOString()}</p>
                          </details>
                        )}
                      </div>
                      <button
                        className={button}
                        onClick={() =>
                          run(() => scrimmagesApi.review(scrimmageId, r.id, 'approved'))
                        }
                      >
                        Approve
                      </button>
                      <button
                        className="text-sm underline"
                        onClick={() =>
                          run(() => scrimmagesApi.review(scrimmageId, r.id, 'rejected'))
                        }
                      >
                        Reject
                      </button>
                    </div>
                  ))}
                </section>
              </fieldset>
            ),
          },
        ]
      : []),
    ...(adminMode && series.isOwner
      ? [
          {
            value: 'settings',
            label: 'Settings',
            content: (
              <fieldset disabled={busy} className="space-y-5">
                <SeriesSettings key={series.activeSeasonId} series={series} run={run} />
              </fieldset>
            ),
          },
        ]
      : []),
  ];
  const activeTab = tabs.some((t) => t.value === search.get('tab'))
    ? search.get('tab')
    : 'sessions';
  return (
    <main className="space-y-6">
      <Breadcrumbs
        crumbs={
          adminMode
            ? [
                { label: 'Admin', href: '/admin' },
                { label: 'Scrimmages', href: '/admin?tab=scrimmages' },
                { label: series.name },
              ]
            : [{ label: 'Scrimmages', href: '/home?tab=scrimmages' }, { label: series.name }]
        }
      />
      <PageHeader
        eyebrow={adminMode ? 'Scrimmage administration' : 'Weekly basketball'}
        title={series.name}
        description={
          adminMode
            ? 'Manage weekly sessions, your player pool and season results.'
            : 'Explore weekly sessions, player profiles and MVP standings.'
        }
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="w-full sm:w-64">
            <Field label="Season">
              <select
                className={input}
                value={selectedSeason.id}
                onChange={(e) => {
                  const next = new URLSearchParams(search);
                  next.set('seasonId', e.target.value);
                  setShowWeekForm(false);
                  setSearch(next);
                }}
              >
                {series.seasons.map((season) => (
                  <option key={season.id} value={season.id}>
                    {season.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {!adminMode &&
            (membership ? (
              <Link className={button} to={`${basePath}/players/${membership.id}`}>
                My player profile
              </Link>
            ) : !user ? (
              <Link className={button} to={`/login?redirectTo=${encodeURIComponent(basePath)}`}>
                Sign in to claim your profile
              </Link>
            ) : (
              <div className="space-y-1">
                <button className={button} onClick={() => setShowClaim(true)}>
                  {joinStatus === 'pending' ? 'Update profile claim' : 'Claim my profile'}
                </button>
                {joinStatus === 'pending' && (
                  <p className="text-xs text-slate-500">Awaiting admin approval</p>
                )}
              </div>
            ))}
        </div>
      </PageHeader>
      <div className={`grid gap-3 ${adminMode ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {[
          ['Players', pool.filter((p) => p.isActive).length],
          ['Weekly sessions', sessions.length],
          ...(adminMode ? [['Pending claims', requests?.requests?.length ?? 0]] : []),
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-1 text-xl font-bold text-[#1B4332]">{value}</p>
          </div>
        ))}
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      <Tabs
        key={activeTab}
        defaultValue={activeTab}
        ariaLabel={adminMode ? 'Scrimmage management' : 'Scrimmage sections'}
        onChange={(tab) => {
          const next = new URLSearchParams(search);
          next.set('tab', tab);
          setSearch(next, { replace: true });
        }}
        items={tabs}
      />
      {!adminMode && showClaim && (
        <Modal
          open
          title="Claim your scrimmage profile"
          onClose={() => setShowClaim(false)}
          panelClassName="max-w-2xl"
        >
          <TermsForm
            key={series.terms.version}
            terms={series.terms}
            displayName={user.name}
            onSubmit={async (signature) => {
              if (!claimPlayerId) throw new Error('Choose your player profile');
              const success = await run(() =>
                scrimmagesApi.join(scrimmageId, {
                  ...signature,
                  playerId: claimPlayerId,
                  displayName: pool.find((p) => p.id === claimPlayerId).displayName,
                })
              );
              if (success) setShowClaim(false);
              if (!success) throw new Error('Could not submit claim. See the error above.');
            }}
          >
            <p className="text-sm text-slate-600">
              {joinStatus === 'pending'
                ? 'Your claim is awaiting admin approval.'
                : 'Claim your scrimmage profile. An admin will approve the link to your account.'}
            </p>
            <Field label="Your player profile">
              <select
                className={input}
                required
                value={claimPlayerId}
                onChange={(e) => setClaimPlayerId(e.target.value)}
              >
                <option value="">Choose your profile</option>
                {pool
                  .filter((p) => p.isActive)
                  .map((p) => (
                    <option value={p.id} key={p.id}>
                      {p.displayName}
                    </option>
                  ))}
              </select>
            </Field>
          </TermsForm>
        </Modal>
      )}
    </main>
  );
}

function WeeklyAssignmentsEditor({ scrimmageId, session }) {
  const client = useQueryClient();
  const [draft, setDraft] = useState(
    Object.fromEntries(session.assignments.map((p) => [p.playerId, p.color]))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { data, error: loadError } = useQuery({
    queryKey: ['scrimmagePool', scrimmageId],
    queryFn: () => scrimmagesApi.detail(scrimmageId),
  });
  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await scrimmagesApi.assignments(
        scrimmageId,
        session.id,
        Object.entries(draft)
          .filter(([, color]) => color.trim())
          .map(([playerId, color]) => ({ playerId, color }))
      );
      await client.invalidateQueries({ queryKey: ['scrimmageSession', scrimmageId, session.id] });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <form onSubmit={save} className={panel}>
      <h3 className="font-semibold">Edit attendance & colors</h3>
      <p className="text-sm text-slate-600">
        You can edit these assignments until the first game is created. Leave absent players blank.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {(data?.pool || [])
          .filter((p) => p.isActive)
          .map((p) => (
            <Field key={p.id} label={p.displayName}>
              <input
                className={input}
                maxLength="40"
                value={draft[p.id] || ''}
                onChange={(e) => setDraft({ ...draft, [p.id]: e.target.value })}
                placeholder="Color, or blank if absent"
              />
            </Field>
          ))}
      </div>
      {(error || loadError) && (
        <p role="alert" className="text-red-700">
          {error || loadError.message}
        </p>
      )}
      <button disabled={saving || !data} className={button}>
        Save weekly assignments
      </button>
    </form>
  );
}

export function ScrimmageSessionPage({ adminMode = false }) {
  const { scrimmageId, sessionId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [search, setSearch] = useSearchParams();
  const [showAttendance, setShowAttendance] = useState(false);
  const [newGame, setNewGame] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const {
    data,
    isLoading,
    error: loadError,
  } = useQuery({
    queryKey: ['scrimmageSession', scrimmageId, sessionId, user?.id],
    queryFn: () => scrimmagesApi.session(scrimmageId, sessionId),
  });
  if (isLoading) return <SportsLoader label="Loading weekly session" fullPage />;
  if (loadError) return <p role="alert">{loadError.message}</p>;
  const { scrimmage: series, session, games, standings, hasAcceptedTerms } = data;
  const basePath = `${adminMode ? '/admin' : ''}/scrimmage/${scrimmageId}`;
  if (series.canManage && !adminMode)
    return (
      <Navigate to={`/admin/scrimmage/${scrimmageId}/sessions/${sessionId}?${search}`} replace />
    );
  if (adminMode && !series.canManage)
    return <Navigate to={`/scrimmage/${scrimmageId}/sessions/${sessionId}?${search}`} replace />;
  const rules = series.seasons.find((s) => s.id === session.seasonId).mvpRules;
  const unfinished = games.find((g) => g.status !== 'completed');
  async function finish(publish = false) {
    setBusy(true);
    setError('');
    try {
      await (publish
        ? scrimmagesApi.publishSession(scrimmageId, sessionId)
        : scrimmagesApi.finishSession(scrimmageId, sessionId));
      await client.invalidateQueries({ queryKey: ['scrimmage', scrimmageId] });
      await client.invalidateQueries({ queryKey: ['scrimmagePlayer', scrimmageId] });
      await client.invalidateQueries({ queryKey: ['myProfiles'] });
      const next = new URLSearchParams(search);
      next.set('tab', 'results');
      setSearch(next, { replace: true });
      await client.invalidateQueries({ queryKey: ['scrimmageSession', scrimmageId, sessionId] });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="space-y-6">
      <Link to={`${basePath}?seasonId=${session.seasonId}`} className="text-sm underline">
        ← {series.name}
      </Link>
      <h1 className="text-3xl font-bold">{session.label}</h1>
      <p className="text-slate-600">
        {session.date} ·{' '}
        {session.status === 'completed'
          ? session.publishedAt
            ? 'Published'
            : 'Awaiting publication'
          : 'Open'}{' '}
        · {session.scoringRules.insideArc}/{session.scoringRules.outsideArc} scoring ·{' '}
        {session.regulationSeconds / 60} min regulation + {session.overtimeSeconds / 60} min
        overtime
      </p>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {series.canManage && session.status === 'open' && (
        <div className="flex flex-wrap gap-3">
          {unfinished ? (
            <Link className={button} to={`/games/${unfinished.id}/track`}>
              Resume game
            </Link>
          ) : (
            <button className={button} onClick={() => setNewGame(true)}>
              New Game
            </button>
          )}
          <button
            disabled={Boolean(unfinished) || busy}
            className={button}
            onClick={() => finish()}
          >
            Finish & review session
          </button>
        </div>
      )}
      <Tabs
        key={search.get('tab') || 'games'}
        defaultValue={search.get('tab') || 'games'}
        ariaLabel="Weekly session sections"
        onChange={(tab) => {
          const next = new URLSearchParams(search);
          next.set('tab', tab);
          setSearch(next, { replace: true });
        }}
        items={[
          {
            value: 'games',
            label: 'Games',
            content: (
              <>
                <section className={panel}>
                  <h2 className="text-xl font-bold">Games</h2>
                  {!games.length && <p>No games yet.</p>}
                  <ul className="list-none space-y-2 p-0">
                    {games.map((g) => (
                      <li key={g.id}>
                        <Link
                          className="flex justify-between gap-2 rounded-lg bg-slate-50 p-3 underline"
                          to={
                            series.canManage && g.status !== 'completed'
                              ? `/games/${g.id}/track`
                              : `/games/${g.id}`
                          }
                        >
                          <span>{g.title}</span>
                          <span>
                            {g.finalScore.home}–{g.finalScore.away} · {g.status}
                          </span>
                        </Link>
                        {gameVideoLink(session.videoUrl, g.videoStartTimestamp) && (
                          <a
                            className="mr-4 text-xs underline"
                            href={gameVideoLink(session.videoUrl, g.videoStartTimestamp)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Watch from {formatVideoTime(g.videoStartTimestamp || 0)}
                          </a>
                        )}
                        {series.canManage && g.status === 'completed' && (
                          <Link className="text-xs underline" to={`/games/${g.id}/track`}>
                            Correct tracking events
                          </Link>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              </>
            ),
          },
          {
            value: 'players',
            label: 'Players',
            content: (
              <>
                <section className={panel}>
                  <h2 className="text-xl font-bold">This week’s colors</h2>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[...new Set(session.assignments.map((p) => p.color))].map((color) => (
                      <div key={color} className="rounded-lg bg-slate-50 p-3">
                        <h3 className="font-semibold capitalize">Team {color}</h3>
                        <ul className="mt-2 list-none space-y-1 p-0 text-sm">
                          {session.assignments
                            .filter((p) => p.color === color)
                            .map((p) => (
                              <li key={p.playerId}>
                                <Link
                                  className="underline"
                                  to={`${basePath}/players/${p.playerId}?seasonId=${session.seasonId}&sessionId=${session.id}`}
                                >
                                  {p.displayName}
                                </Link>
                              </li>
                            ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </section>
                {series.canManage && session.status === 'open' && games.length === 0 && (
                  <button className={button} onClick={() => setShowAttendance((shown) => !shown)}>
                    {showAttendance ? 'Cancel attendance changes' : 'Edit attendance & colors'}
                  </button>
                )}
                {series.canManage &&
                  session.status === 'open' &&
                  games.length === 0 &&
                  showAttendance && (
                    <WeeklyAssignmentsEditor scrimmageId={scrimmageId} session={session} />
                  )}
              </>
            ),
          },
          {
            value: 'results',
            label: 'Results',
            content: (
              <>
                {adminMode && (
                  <ScrimmageResultsReview
                    session={session}
                    games={games}
                    busy={busy}
                    onPublish={() => finish(true)}
                  />
                )}
                {session.publishedAt && (
                  <button
                    type="button"
                    className={button}
                    onClick={() => {
                      const next = new URLSearchParams(search);
                      next.set('tab', 'recap');
                      setSearch(next, { replace: true });
                    }}
                  >
                    View & share weekly recap
                  </button>
                )}
                {!adminMode && !session.publishedAt ? (
                  <section className={panel}>
                    <h2 className="text-xl font-bold">Results awaiting publication</h2>
                    <p className="text-sm text-slate-600">
                      The admin is reviewing this week’s results. Standings and player plays will
                      appear when published.
                    </p>
                  </section>
                ) : (
                  <ScrimmageStandings
                    rows={standings}
                    rules={rules}
                    scrimmageId={scrimmageId}
                    seasonId={session.seasonId}
                    sessionId={session.id}
                    adminMode={adminMode}
                  />
                )}
              </>
            ),
          },
          ...(session.publishedAt
            ? [
                {
                  value: 'recap',
                  label: 'Recap',
                  content: (
                    <ScrimmageWeeklyRecap
                      data={data}
                      adminMode={adminMode}
                      onRefresh={(latest) =>
                        client.setQueryData(
                          ['scrimmageSession', scrimmageId, sessionId, user?.id],
                          latest
                        )
                      }
                    />
                  ),
                },
              ]
            : []),
        ]}
      />
      {session.termsScope === 'weekly' && user && !series.canManage && !hasAcceptedTerms && (
        <TermsForm
          key={session.terms.version}
          terms={session.terms}
          displayName={user.name}
          onSubmit={async (signature) => {
            await scrimmagesApi.acceptTerms(scrimmageId, sessionId, signature);
            await client.invalidateQueries({
              queryKey: ['scrimmageSession', scrimmageId, sessionId],
            });
          }}
        />
      )}
      {newGame && (
        <NewScrimmageGameDialog
          scrimmageId={scrimmageId}
          sessionId={sessionId}
          onClose={() => setNewGame(false)}
          onCreated={(gameId) => navigate(`/games/${gameId}/track`)}
        />
      )}
    </main>
  );
}
