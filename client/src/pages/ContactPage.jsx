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

export function ContactPage() {
  const appName = import.meta.env.VITE_APP_NAME;

  return (
    <main className="space-y-8">
      <PageHeader
        eyebrow="Contact"
        title="Get in touch"
        description={`Interested in using ${appName} for your league or team? Send us a message and we'll follow up directly.`}
      />

      <section className="rounded-2xl border border-slate-200 bg-white p-5 md:p-8">
        <ContactForm />
      </section>
    </main>
  );
}

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
        <Field
          id="contact-name"
          label="Your name"
          required
          error={touched.name ? errors.name : null}
        >
          <input
            id="contact-name"
            type="text"
            autoComplete="name"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            onBlur={() => touch('name')}
            placeholder="Jane Smith"
            className={inputClass(touched.name && errors.name)}
          />
        </Field>

        <Field
          id="contact-email"
          label="Email address"
          required
          error={touched.email ? errors.email : null}
        >
          <input
            id="contact-email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            onBlur={() => touch('email')}
            placeholder="jane@club.com"
            className={inputClass(touched.email && errors.email)}
          />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          id="contact-role"
          label="Your role"
          required
          error={touched.role ? errors.role : null}
        >
          <select
            id="contact-role"
            aria-label="Your role"
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

        <Field
          id="contact-club-name"
          label="Club or team name"
          required
          error={touched.clubName ? errors.clubName : null}
        >
          <input
            id="contact-club-name"
            type="text"
            autoComplete="organization"
            value={form.clubName}
            onChange={(e) => set('clubName', e.target.value)}
            onBlur={() => touch('clubName')}
            placeholder="Eastside Hoops"
            className={inputClass(touched.clubName && errors.clubName)}
          />
        </Field>
      </div>

      <Field
        id="contact-interest"
        label="What are you looking to do?"
        required
        error={touched.interest ? errors.interest : null}
      >
        <select
          id="contact-interest"
          aria-label="What are you looking to do?"
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

      <Field id="contact-message" label="Anything else you'd like us to know" hint="Optional">
        <textarea
          id="contact-message"
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
          aria-label={status === 'loading' ? 'Sending...' : 'Send message'}
          className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50"
        >
          {status === 'loading' ? 'Sending...' : 'Send message'}
        </button>
      </div>
    </form>
  );
}

function Field({ id, label, hint, required, error, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-slate-700">
          {label}
          {required && <span className="text-red-600"> *</span>}
        </label>
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
