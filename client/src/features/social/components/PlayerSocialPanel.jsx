import { useEffect, useState } from 'react';

const EMPTY_SOCIAL = Object.freeze({});

function dateLabel(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString();
}

export function PlayerSocialPanel({ player, onSave, disabled = false }) {
  const social = player.social || EMPTY_SOCIAL;
  const [instagramHandle, setInstagramHandle] = useState(social.instagramHandle || '');
  const [tiktokHandle, setTiktokHandle] = useState(social.tiktokHandle || '');
  const [marketingStatus, setMarketingStatus] = useState(social.marketing?.status || 'unrecorded');
  const [ageCategory, setAgeCategory] = useState(social.ageCategory || 'unspecified');
  const [guardianConsent, setGuardianConsent] = useState(Boolean(social.guardianConsentAt));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setInstagramHandle(social.instagramHandle || '');
    setTiktokHandle(social.tiktokHandle || '');
    setMarketingStatus(social.marketing?.status || 'unrecorded');
    setAgeCategory(social.ageCategory || 'unspecified');
    setGuardianConsent(Boolean(social.guardianConsentAt));
  }, [social]);

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSave(player.id, {
        social: {
          instagramHandle,
          tiktokHandle,
          marketingStatus,
          ageCategory,
          guardianConsent: ageCategory === 'minor' && guardianConsent,
        },
      });
    } catch (saveError) {
      setError(saveError.message || 'Failed to save social identity');
    } finally {
      setSaving(false);
    }
  }

  return (
    <details className="rounded-xl border border-slate-200 bg-white p-3">
      <summary className="cursor-pointer text-sm font-semibold text-slate-800">
        {player.displayName} — social identity
        {social.restriction ? <span className="ml-2 text-amber-700">(restricted)</span> : null}
      </summary>
      <form onSubmit={save} className="mt-4 space-y-4">
        <p className="text-xs text-slate-600">
          A player can decline to appear even when the organisation has permission. A minor also
          needs a recorded guardian consent before being featured.
        </p>
        {error ? (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-slate-700">
            Instagram handle
            <input
              aria-label={`${player.displayName} Instagram handle`}
              value={instagramHandle}
              onChange={(event) => setInstagramHandle(event.target.value)}
              className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm text-slate-700">
            TikTok handle
            <input
              aria-label={`${player.displayName} TikTok handle`}
              value={tiktokHandle}
              onChange={(event) => setTiktokHandle(event.target.value)}
              className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm text-slate-700">
            Player marketing choice
            <select
              aria-label={`${player.displayName} marketing choice`}
              value={marketingStatus}
              onChange={(event) => setMarketingStatus(event.target.value)}
              className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
            >
              <option value="unrecorded">No individual objection recorded</option>
              <option value="granted">
                Recorded as granted (organisation permission still required)
              </option>
              <option value="declined">Declined — exclude from exports</option>
            </select>
          </label>
          <label className="text-sm text-slate-700">
            Age category
            <select
              aria-label={`${player.displayName} age category`}
              value={ageCategory}
              onChange={(event) => setAgeCategory(event.target.value)}
              className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
            >
              <option value="unspecified">Unspecified</option>
              <option value="adult">Adult</option>
              <option value="minor">Under 18</option>
            </select>
          </label>
        </div>
        {ageCategory === 'minor' ? (
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={guardianConsent}
              onChange={(event) => setGuardianConsent(event.target.checked)}
              className="mt-1"
            />
            <span>
              I confirm a parent or guardian has consented to this player appearing in TSW
              marketing.
            </span>
          </label>
        ) : null}
        {dateLabel(social.marketing?.recordedAt) ? (
          <p className="text-xs text-slate-500">
            Choice recorded {dateLabel(social.marketing.recordedAt)}
          </p>
        ) : null}
        {dateLabel(social.guardianConsentAt) ? (
          <p className="text-xs text-slate-500">
            Guardian consent recorded {dateLabel(social.guardianConsentAt)}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={disabled || saving}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save social identity'}
        </button>
      </form>
    </details>
  );
}
