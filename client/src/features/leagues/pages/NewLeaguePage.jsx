import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { leaguesApi } from '../api/leaguesApi';

export function NewLeaguePage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [seasonLabel, setSeasonLabel] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function onSubmit(event) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const response = await leaguesApi.create({
        name,
        seasonLabel,
        description,
      });
      navigate(`/leagues/${response.league.id}`);
    } catch (submitError) {
      setError(submitError.message || 'Failed to create league');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-8">
      <section className="rounded-3xl bg-gradient-to-r from-amber-50 via-white to-sky-50 p-8 md:p-10">
        <h1 className="text-3xl font-bold leading-tight text-slate-900 md:text-4xl">
          Create League
        </h1>
        <p className="mt-2 text-base text-slate-700">
          Start a new league with one active season and independent team branding.
        </p>
      </section>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <form
        onSubmit={onSubmit}
        className="space-y-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <label className="block">
          <span className="mb-1 block text-sm text-slate-700">League Name</span>
          <input
            type="text"
            required
            className="w-full rounded border border-slate-300 px-3 py-2"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-slate-700">Season Label</span>
          <input
            type="text"
            className="w-full rounded border border-slate-300 px-3 py-2"
            placeholder="2026 Spring"
            value={seasonLabel}
            onChange={(event) => setSeasonLabel(event.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-slate-700">Description</span>
          <textarea
            className="w-full rounded border border-slate-300 px-3 py-2"
            rows="4"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? 'Creating league...' : 'Create League'}
        </button>
      </form>
    </main>
  );
}
