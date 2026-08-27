import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../../app/store/AuthContext';

const ROLE_OPTIONS = [
  {
    id: 'league_manager',
    marker: 'LM',
    title: 'League manager',
    description: 'I run a league and organise its teams, schedule, and standings.',
    actionTitle: 'Create or manage your league',
    actionDescription: 'Start a league, then add its teams and invite the people who help run it.',
    actionLabel: 'Open league admin',
    actionHref: '/admin',
  },
  {
    id: 'league_team_manager',
    marker: 'TM',
    title: 'League team manager',
    description: 'I manage a team that plays within an existing league.',
    actionTitle: 'Connect to your league team',
    actionDescription:
      'Find the team in Discover, open its Join tab, and request the team-manager role.',
    actionLabel: 'Find my league team',
    actionHref: '/home?tab=teams',
  },
  {
    id: 'team_manager',
    marker: 'OT',
    title: 'One-off team manager',
    description: 'I run an independent team outside a league.',
    actionTitle: 'Create your one-off team',
    actionDescription: 'Add the team, its colours, venue, and roster in one guided form.',
    actionLabel: 'Create a team',
    actionHref: '/teams/new?redirectTo=%2Fonboarding%3Fstep%3Dprofiles',
  },
  {
    id: 'player',
    marker: 'P',
    title: 'Player',
    description: 'I play for a league team, a one-off team, or both.',
    actionTitle: 'Find and connect your player profiles',
    actionDescription:
      'Search all players, open each matching profile, and request to link it to your account.',
    actionLabel: 'Find my profiles',
    actionHref: '/home?tab=players',
  },
  {
    id: 'fan',
    marker: 'F',
    title: 'Fan or spectator',
    description: 'I am just here to browse and follow leagues, teams, and players.',
    actionTitle: 'Follow what you care about',
    actionDescription:
      'Browse leagues, teams, and players in Discover and follow any of them to build your Pulse.',
    actionLabel: 'Start browsing',
    actionHref: '/home?tab=leagues',
  },
];

// Only these roles imply something to administer; a player lands on My Sporty
// and a browse-only fan on the Pulse.
const MANAGER_ROLES = ['league_manager', 'league_team_manager', 'team_manager'];

export function getOnboardingHandoff(roles = []) {
  if (roles.some((role) => MANAGER_ROLES.includes(role))) return '/admin';
  if (roles.includes('player')) return '/my-sporty';
  return '/pulse';
}

function roleById(roleId) {
  return ROLE_OPTIONS.find((role) => role.id === roleId);
}

export function OnboardingPage() {
  const { user, updateOnboarding } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const savedRoles = user?.onboarding?.roles || [];
  const resumedAtProfiles = user?.onboarding?.completedSteps?.includes('roles');
  const requestedStep = searchParams.get('step');
  const [selectedRoles, setSelectedRoles] = useState(savedRoles);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const step =
    requestedStep === 'roles'
      ? 1
      : requestedStep === 'profiles' || (!requestedStep && resumedAtProfiles)
        ? 2
        : 1;
  const selectedRoleOptions = useMemo(
    () => selectedRoles.map(roleById).filter(Boolean),
    [selectedRoles]
  );

  function toggleRole(roleId) {
    setError('');
    setSelectedRoles((current) =>
      current.includes(roleId) ? current.filter((id) => id !== roleId) : [...current, roleId]
    );
  }

  async function continueToProfiles() {
    if (selectedRoles.length === 0) {
      setError('Choose at least one role so we can tailor your setup.');
      return;
    }

    setIsSaving(true);
    setError('');
    try {
      await updateOnboarding({
        status: 'in_progress',
        roles: selectedRoles,
        completedSteps: ['roles'],
      });
      setSearchParams({ step: 'profiles' }, { replace: true });
    } catch (saveError) {
      setError(saveError.message || 'We could not save your setup progress.');
    } finally {
      setIsSaving(false);
    }
  }

  async function finishSetup() {
    setIsSaving(true);
    setError('');
    try {
      await updateOnboarding({
        status: 'completed',
        roles: selectedRoles,
        completedSteps: ['roles', 'profiles'],
      });
      navigate(getOnboardingHandoff(selectedRoles), { replace: true });
    } catch (saveError) {
      setError(saveError.message || 'We could not finish your setup.');
    } finally {
      setIsSaving(false);
    }
  }

  async function skipForNow() {
    setIsSaving(true);
    setError('');
    try {
      await updateOnboarding({
        status: 'skipped',
        roles: selectedRoles,
        completedSteps: step === 2 ? ['roles'] : [],
      });
      navigate('/pulse', { replace: true });
    } catch (saveError) {
      setError(saveError.message || 'We could not save your choice.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-4xl py-4 md:py-8">
      <header className="mb-7">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#B87500]">
          Setup · Step {step} of 2
        </p>
        <h1
          className="mt-2 text-3xl text-slate-900 md:text-4xl"
          style={{ fontFamily: "'Archivo Black', sans-serif" }}
        >
          {step === 1 ? 'What brings you to The Sporty Way?' : 'Connect your sporty world.'}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 md:text-base">
          {step === 1
            ? 'Choose everything that applies. Your selections shape the setup actions we show next.'
            : 'Work through the actions that apply to you. Your progress is saved, so it is safe to leave this page and come back.'}
        </p>
      </header>

      <ol aria-label="Onboarding progress" className="mb-7 grid list-none grid-cols-2 gap-2 p-0">
        {['Choose roles', 'Create or connect'].map((label, index) => {
          const itemStep = index + 1;
          return (
            <li
              key={label}
              className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                itemStep === step
                  ? 'border-[#F4A300] bg-[#FFF7E6] text-slate-900'
                  : itemStep < step
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-slate-200 bg-white text-slate-500'
              }`}
            >
              {itemStep}. {label}
            </li>
          );
        })}
      </ol>

      {error ? (
        <p
          role="alert"
          className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </p>
      ) : null}

      {step === 1 ? (
        <section aria-labelledby="role-heading">
          <h2 id="role-heading" className="sr-only">
            Choose your roles
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {ROLE_OPTIONS.map((role) => {
              const selected = selectedRoles.includes(role.id);
              return (
                <label
                  key={role.id}
                  className={`flex cursor-pointer gap-4 rounded-2xl border bg-white p-5 transition ${
                    selected
                      ? 'border-[#F4A300] ring-2 ring-[#F4A300]/20'
                      : 'border-slate-200 hover:border-slate-400'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={selected}
                    onChange={() => toggleRole(role.id)}
                  />
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#141414] text-xs font-bold text-[#F4A300]">
                    {role.marker}
                  </span>
                  <span>
                    <span className="block font-semibold text-slate-900">{role.title}</span>
                    <span className="mt-1 block text-sm leading-5 text-slate-600">
                      {role.description}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>

          <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={skipForNow}
              disabled={isSaving}
              className="px-3 py-2 text-sm font-semibold text-slate-500 hover:text-slate-900 disabled:opacity-50"
            >
              Do this later
            </button>
            <button
              type="button"
              onClick={continueToProfiles}
              disabled={isSaving}
              className="rounded-lg bg-[#141414] px-5 py-3 text-sm font-semibold text-white hover:bg-[#1B4332] disabled:opacity-50"
            >
              {isSaving ? 'Saving…' : 'Continue'}
            </button>
          </div>
        </section>
      ) : (
        <section aria-labelledby="profiles-heading">
          <h2 id="profiles-heading" className="sr-only">
            Create or connect profiles
          </h2>
          <div className="space-y-3">
            {selectedRoleOptions.map((role) => {
              return (
                <article key={role.id} className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex gap-4">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#141414] text-xs font-bold text-[#F4A300]">
                        {role.marker}
                      </span>
                      <div>
                        <h3 className="font-semibold text-slate-900">{role.actionTitle}</h3>
                        <p className="mt-1 max-w-xl text-sm leading-5 text-slate-600">
                          {role.actionDescription}
                        </p>
                      </div>
                    </div>
                    <Link
                      to={role.actionHref}
                      className="inline-flex shrink-0 items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:border-[#F4A300] hover:bg-[#FFF7E6]"
                    >
                      {role.actionLabel}
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => setSearchParams({ step: 'roles' }, { replace: true })}
              disabled={isSaving}
              className="px-3 py-2 text-sm font-semibold text-slate-500 hover:text-slate-900 disabled:opacity-50"
            >
              Back to roles
            </button>
            <div className="flex flex-col-reverse gap-3 sm:flex-row">
              <button
                type="button"
                onClick={skipForNow}
                disabled={isSaving}
                className="px-3 py-2 text-sm font-semibold text-slate-500 hover:text-slate-900 disabled:opacity-50"
              >
                Finish later
              </button>
              <button
                type="button"
                onClick={finishSetup}
                disabled={isSaving}
                className="rounded-lg bg-[#1B4332] px-5 py-3 text-sm font-semibold text-white hover:bg-[#123328] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSaving ? 'Saving…' : 'Finish setup'}
              </button>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
