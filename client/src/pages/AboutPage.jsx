import { useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { contactApi } from '../features/contact/contactApi';

const ROLES = [
  { value: 'coach', label: 'Coach' },
  { value: 'manager', label: 'Team Manager' },
  { value: 'stat-keeper', label: 'Stat-keeper' },
  { value: 'club-director', label: 'Club Director' },
  { value: 'other', label: 'Other' },
];

const INTERESTS = [
  { value: 'league-setup', label: 'Setting up a league' },
  { value: 'team-tracking', label: 'Team stat tracking' },
  { value: 'general', label: 'General question' },
  { value: 'other', label: 'Other' },
];

const EMPTY_FORM = { name: '', email: '', role: '', clubName: '', interest: '', message: '' };

function ContactForm() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [touched, setTouched] = useState({});
  const [status, setStatus] = useState('idle');
  const [serverError, setServerError] = useState('');

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function touch(field) {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }

  const errors = {
    name: !form.name.trim() ? 'Required' : null,
    email: !form.email.trim()
      ? 'Required'
      : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)
        ? 'Enter a valid email'
        : null,
    role: !form.role ? 'Required' : null,
    clubName: !form.clubName.trim() ? 'Required' : null,
    interest: !form.interest ? 'Required' : null,
  };

  const hasErrors = Object.values(errors).some(Boolean);

  async function handleSubmit(e) {
    e.preventDefault();
    setTouched({ name: true, email: true, role: true, clubName: true, interest: true });
    if (hasErrors) return;

    setStatus('loading');
    setServerError('');

    try {
      await contactApi.submit({
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role,
        clubName: form.clubName.trim(),
        interest: form.interest,
        message: form.message.trim() || undefined,
      });
      setStatus('success');
    } catch (err) {
      setServerError(err.message || 'Something went wrong. Please try again.');
      setStatus('idle');
    }
  }

  if (status === 'success') {
    return (
      <div className="rounded-xl border border-sky-200 bg-sky-50 p-6 text-center">
        <p className="font-semibold text-slate-900">Message sent.</p>
        <p className="mt-1 text-sm text-slate-600">We&apos;ll be in touch at {form.email}.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Your name" error={touched.name ? errors.name : null}>
          <input
            type="text"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            onBlur={() => touch('name')}
            placeholder="Jane Smith"
            className={inputClass(touched.name && errors.name)}
          />
        </Field>

        <Field label="Email address" error={touched.email ? errors.email : null}>
          <input
            type="email"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            onBlur={() => touch('email')}
            placeholder="jane@club.com"
            className={inputClass(touched.email && errors.email)}
          />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Your role" error={touched.role ? errors.role : null}>
          <select
            value={form.role}
            onChange={(e) => set('role', e.target.value)}
            onBlur={() => touch('role')}
            className={inputClass(touched.role && errors.role)}
          >
            <option value="">Select a role</option>
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Club or team name" error={touched.clubName ? errors.clubName : null}>
          <input
            type="text"
            value={form.clubName}
            onChange={(e) => set('clubName', e.target.value)}
            onBlur={() => touch('clubName')}
            placeholder="Eastside Hoops"
            className={inputClass(touched.clubName && errors.clubName)}
          />
        </Field>
      </div>

      <Field label="What are you looking to do?" error={touched.interest ? errors.interest : null}>
        <select
          value={form.interest}
          onChange={(e) => set('interest', e.target.value)}
          onBlur={() => touch('interest')}
          className={inputClass(touched.interest && errors.interest)}
        >
          <option value="">Select an option</option>
          {INTERESTS.map((i) => (
            <option key={i.value} value={i.value}>
              {i.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Anything else you'd like us to know" hint="Optional">
        <textarea
          value={form.message}
          onChange={(e) => set('message', e.target.value)}
          rows={4}
          placeholder="Games per week, age group, current workflow, specific questions..."
          className={inputClass(false) + ' resize-none'}
        />
      </Field>

      {serverError && <p className="text-sm text-red-600">{serverError}</p>}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={status === 'loading'}
          className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50"
        >
          {status === 'loading' ? 'Sending…' : 'Send message'}
        </button>
      </div>
    </form>
  );
}

function Field({ label, hint, error, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label className="text-sm font-medium text-slate-700">{label}</label>
        {hint && <span className="text-xs text-slate-400">{hint}</span>}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
      {children}
    </div>
  );
}

function inputClass(hasError) {
  return `w-full rounded-xl border px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 ${
    hasError ? 'border-red-300 focus:ring-red-200' : 'border-slate-200 focus:ring-sky-200'
  }`;
}

export function AboutPage() {
  const appName = import.meta.env.VITE_APP_NAME;

  return (
    <main className="space-y-8">
      <PageHeader
        eyebrow="About"
        title={appName}
        description="Basketball stat tracking built for the people running actual games."
      />

      <section className="rounded-2xl border border-slate-200 bg-white p-5 md:p-8">
        <h2 className="text-xl font-semibold text-slate-900">For the people running the game</h2>
        <div className="mt-4 space-y-4 text-slate-700 md:text-base">
          <p>
            Most amateur basketball stats live in a notebook someone left at home, a spreadsheet
            updated at midnight, or a player&apos;s memory. Getting a usable box score after a game
            usually means hours of cleanup, if it happens at all.
          </p>
          <p>
            {appName} is built for coaches and team managers who want to capture what&apos;s
            happening during a real game and have something credible to show for it the moment the
            final buzzer sounds. No spreadsheets. No manual entry after the fact.
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 md:p-8">
        <h2 className="text-xl font-semibold text-slate-900">What you walk away with</h2>
        <div className="mt-4 space-y-4 text-slate-700 md:text-base">
          <p>
            The work happens during the game. You record events as they happen on a full-court
            interface, and the outputs are ready the moment you finish. A complete box score. A game
            recap. A record of every shot, assist, and turnover that actually happened.
          </p>
          <p>
            Player and team pages are public-facing by design. Players can see their own stats.
            Families can follow along. Clubs can point to something real instead of sending a text
            with a final score.
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 md:p-8">
        <h2 className="text-xl font-semibold text-slate-900">Who it&apos;s for</h2>
        <p className="mt-2 text-slate-600">
          Amateur and youth basketball programs — the teams that play real games but don&apos;t have
          a dedicated stats crew. Everyone connected to the team gets something out of it.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
            <p className="font-semibold text-slate-900">Players</p>
            <p className="mt-2 text-sm text-slate-600">
              Track your performance across games, spot strengths and weaknesses faster, and build
              confidence with clear evidence of your development over time.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
            <p className="font-semibold text-slate-900">Managers and Coaches</p>
            <p className="mt-2 text-sm text-slate-600">
              Understand team and player performance at a glance, review meaningful insights without
              extra noise, and make better game-time and training decisions with clearer data.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
            <p className="font-semibold text-slate-900">Friends and Family</p>
            <p className="mt-2 text-sm text-slate-600">
              Follow games, keep up with player progress, and celebrate key achievements as the team
              grows together throughout the season.
            </p>
          </div>
        </div>
      </section>

      <section id="contact" className="rounded-2xl border border-slate-200 bg-white p-5 md:p-8">
        <h2 className="text-xl font-semibold text-slate-900">Get in touch</h2>
        <p className="mt-2 text-sm text-slate-600">
          We&apos;re a company based in the United Kingdom. If you&apos;re interested in using{' '}
          {appName} for your league or team, fill out the form below and we&apos;ll follow up
          directly.
        </p>
        <div className="mt-6">
          <ContactForm />
        </div>
      </section>
    </main>
  );
}
