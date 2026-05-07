import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { leaguesApi } from '../api/leaguesApi';
import { Breadcrumbs } from '../../../components/Breadcrumbs';
import { PageHeader } from '../../../components/PageHeader';
import { SportsLoader } from '../../../components/SportsLoader';
import teamPlaceholder from '../../../assets/placeholders/team-logo-placeholder.svg';

export function AdminNewLeagueTeamPage() {
  const { leagueId } = useParams();
  const navigate = useNavigate();
  const [league, setLeague] = useState(null);
  const [name, setName] = useState('');
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const logoInputRef = useRef(null);

  useEffect(() => {
    leaguesApi
      .getById(leagueId)
      .then((response) => setLeague(response.league))
      .catch((loadError) => setError(loadError.message || 'Failed to load league'))
      .finally(() => setIsLoading(false));
  }, [leagueId]);

  function onLogoChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
    event.target.value = '';
  }

  async function onSubmit(event) {
    event.preventDefault();
    if (!name.trim()) return;
    setError('');
    setIsSubmitting(true);
    try {
      const response = await leaguesApi.createTeam(leagueId, { name: name.trim() });
      const teamId = response.team.id;
      if (logoFile) {
        const formData = new FormData();
        formData.append('logo', logoFile);
        await leaguesApi.uploadTeamLogo(leagueId, teamId, formData);
      }
      navigate(`/admin/leagues/${leagueId}/teams/${teamId}`);
    } catch (submitError) {
      setError(submitError.message || 'Failed to create team');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return <SportsLoader label="Loading league" fullPage />;
  }

  return (
    <main className="mx-auto max-w-3xl space-y-8">
      <Breadcrumbs
        crumbs={[
          { label: 'Admin', href: '/admin' },
          { label: league?.name || 'League', href: `/admin/leagues/${leagueId}` },
          { label: 'Add Team' },
        ]}
      />

      <PageHeader title="Add League Team" description="Create a new team for this league." />

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <form
        onSubmit={onSubmit}
        className="space-y-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <div>
          <span className="mb-3 block text-sm text-slate-700">Team Logo</span>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => logoInputRef.current?.click()}
              className="group relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-slate-300 bg-slate-50 transition hover:border-slate-400"
            >
              {logoPreview ? (
                <img src={logoPreview} alt="Logo preview" className="h-full w-full object-cover" />
              ) : (
                <img src={teamPlaceholder} alt="" className="h-10 w-10 opacity-40" />
              )}
            </button>
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => logoInputRef.current?.click()}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                {logoPreview ? 'Change logo' : 'Upload logo'}
              </button>
              {logoPreview ? (
                <button
                  type="button"
                  onClick={() => {
                    setLogoFile(null);
                    setLogoPreview(null);
                  }}
                  className="block text-sm text-slate-500 transition hover:text-rose-600"
                >
                  Remove
                </button>
              ) : (
                <p className="text-xs text-slate-400">PNG, JPG or WebP</p>
              )}
            </div>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={onLogoChange}
            />
          </div>
        </div>

        <label className="block">
          <span className="mb-1 block text-sm text-slate-700">
            Team Name <span className="text-red-500">*</span>
          </span>
          <input
            autoComplete="off"
            type="text"
            required
            maxLength={120}
            className="w-full rounded border border-slate-300 px-3 py-2"
            placeholder="e.g. Toronto Raptors"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>

        <button
          type="submit"
          disabled={isSubmitting || !name.trim()}
          className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? 'Creating team...' : 'Create Team'}
        </button>
      </form>
    </main>
  );
}
