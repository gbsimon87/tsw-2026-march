import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { leaguesApi } from '../api/leaguesApi';
import { Breadcrumbs } from '../../../components/Breadcrumbs';
import { PageHeader } from '../../../components/PageHeader';

export function AdminNewLeaguePage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [seasonLabel, setSeasonLabel] = useState('');
  const [description, setDescription] = useState('');
  const [logoFile, setLogoFile] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function onSubmit(event) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const response = await leaguesApi.create({ name, seasonLabel, description });
      if (logoFile && response.league?.id) {
        try {
          const formData = new FormData();
          formData.append('logo', logoFile);
          await leaguesApi.uploadLogo(response.league.id, formData);
        } catch {
          // Logo upload failure is non-fatal — league was created
        }
      }
      navigate(`/admin/leagues/${response.league.id}`);
    } catch (submitError) {
      if (submitError.status === 402) {
        navigate('/pricing');
        return;
      }
      setError(submitError.message || 'Failed to create league');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-8">
      <Breadcrumbs crumbs={[{ label: 'Admin', href: '/admin' }, { label: 'New League' }]} />

      <PageHeader
        title="Create League"
        description="Start a new league with one active season and independent team branding."
      />

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <form
        onSubmit={onSubmit}
        className="space-y-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <label className="block" htmlFor="league-name">
          <span className="mb-1 block text-sm text-slate-700">League Name</span>
          <input
            id="league-name"
            type="text"
            required
            autoComplete="off"
            className="w-full rounded border border-slate-300 px-3 py-2"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="block" htmlFor="league-season-label">
          <span className="mb-1 block text-sm text-slate-700">Season Label</span>
          <input
            id="league-season-label"
            type="text"
            autoComplete="off"
            className="w-full rounded border border-slate-300 px-3 py-2"
            placeholder="2026 Spring"
            value={seasonLabel}
            onChange={(event) => setSeasonLabel(event.target.value)}
          />
        </label>
        <label className="block" htmlFor="league-description">
          <span className="mb-1 block text-sm text-slate-700">Description</span>
          <textarea
            id="league-description"
            className="w-full rounded border border-slate-300 px-3 py-2"
            rows="4"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        <div>
          <span className="mb-1 block text-sm text-slate-700">Logo (optional)</span>
          <div className="flex flex-wrap items-center gap-3">
            {logoFile ? (
              <img
                src={URL.createObjectURL(logoFile)}
                alt="Logo preview"
                className="h-14 w-14 rounded-full border border-slate-200 bg-white object-cover"
              />
            ) : null}
            <input
              type="file"
              aria-label="Logo (optional)"
              accept="image/png,image/jpeg,image/webp"
              className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
              onChange={(event) => setLogoFile(event.target.files?.[0] || null)}
            />
            {logoFile ? (
              <button
                type="button"
                onClick={() => setLogoFile(null)}
                className="text-sm text-slate-500 hover:text-slate-700"
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>
        <button
          type="submit"
          disabled={isSubmitting}
          aria-label={isSubmitting ? 'Creating league...' : 'Create League'}
          className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? 'Creating league...' : 'Create League'}
        </button>
      </form>
    </main>
  );
}
