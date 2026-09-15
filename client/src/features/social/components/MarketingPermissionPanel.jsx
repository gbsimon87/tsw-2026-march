import { useEffect, useState } from 'react';

// Social backlog rank 9 — where a league owner or team owner records the two
// things every export is gated on: the handles a post may tag, and whether this
// organisation has permission to be in TSW marketing at all.
//
// The permission control is an ATTESTATION, not a preference. TSW cannot know
// what a league agreed with its players; it can only record that somebody with
// the authority to say so said it, and when, and who they were. That is what
// the confirmation sentence is doing, and why it names guardians explicitly —
// docs/ideas.md > Constraints requires parent or guardian consent before a
// minor is featured, and an owner who ticks this without reading it is exactly
// the failure the wording exists to prevent.

const STATUS_COPY = {
  granted: {
    label: 'Recorded',
    tone: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  },
  declined: {
    label: 'Declined',
    tone: 'border-red-200 bg-red-50 text-red-900',
  },
  unrecorded: {
    label: 'Not recorded',
    tone: 'border-amber-200 bg-amber-50 text-amber-900',
  },
};

const CONFIRMATION =
  'I confirm this organisation has permission from its players — and from a parent or guardian for anyone under 18 — for their name, photo and statistics to appear in The Sporty Way’s marketing.';

function formatDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toLocaleDateString();
}

export function MarketingPermissionPanel({
  social,
  scopeLabel = 'league',
  canRecordPermission = true,
  handlesOnly = false,
  saving = false,
  error = '',
  onSave,
}) {
  const marketing = social?.marketing || {};
  const status = marketing.status || 'unrecorded';
  const [instagram, setInstagram] = useState(social?.instagramHandle ?? '');
  const [tiktok, setTiktok] = useState(social?.tiktokHandle ?? '');
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    setInstagram(social?.instagramHandle ?? '');
    setTiktok(social?.tiktokHandle ?? '');
    setConfirmed(false);
  }, [social?.instagramHandle, social?.tiktokHandle, marketing.status]);

  const copy = STATUS_COPY[status] || STATUS_COPY.unrecorded;
  const recordedOn = formatDate(marketing.recordedAt);

  return (
    <div className="space-y-5">
      <div>
        <h3
          className="text-lg text-slate-900"
          style={{ fontFamily: "'Archivo Black', sans-serif" }}
        >
          {handlesOnly ? 'Social identity' : 'Social identity and marketing permission'}
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          {handlesOnly
            ? `Add handles for captions. The league owner records marketing permission for league content.`
            : `Handles are tagged in generated captions. Without recorded permission, every social export for this ${scopeLabel} is held — use the demo ${scopeLabel} for marketing until it is.`}
        </p>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {error}
        </p>
      ) : null}

      {!handlesOnly ? (
        <div className={`rounded-xl border px-4 py-3 text-sm ${copy.tone}`}>
          <p className="font-semibold">Marketing permission: {copy.label}</p>
          {status === 'granted' && recordedOn ? (
            <p className="mt-1 text-xs">Recorded on {recordedOn}.</p>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-800">
          Instagram handle
          <input
            type="text"
            value={instagram}
            aria-label="Instagram handle"
            placeholder="@yourleague"
            onChange={(event) => setInstagram(event.target.value)}
            className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
          />
        </label>
        <label className="block text-sm font-medium text-slate-800">
          TikTok handle
          <input
            type="text"
            value={tiktok}
            aria-label="TikTok handle"
            placeholder="@yourleague"
            onChange={(event) => setTiktok(event.target.value)}
            className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
          />
        </label>
      </div>

      <button
        type="button"
        disabled={saving}
        onClick={() => onSave({ instagramHandle: instagram, tiktokHandle: tiktok })}
        className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save handles'}
      </button>

      {handlesOnly ? null : canRecordPermission ? (
        <div className="border-t border-slate-200 pt-5">
          {status === 'granted' ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-700">
                Exports are cleared. Withdraw this if the {scopeLabel} changes its mind — anything
                already downloaded stays downloaded, so withdraw it before the next post, not after.
              </p>
              <button
                type="button"
                disabled={saving}
                onClick={() => onSave({ marketingStatus: 'unrecorded' })}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 disabled:opacity-50"
              >
                Withdraw permission
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => onSave({ marketingStatus: 'declined' })}
                className="ml-2 rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-800 disabled:opacity-50"
              >
                Record decline
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={confirmed}
                  aria-label="Confirm marketing permission"
                  onChange={(event) => setConfirmed(event.target.checked)}
                  className="mt-1"
                />
                <span>{CONFIRMATION}</span>
              </label>
              <button
                type="button"
                disabled={!confirmed || saving}
                onClick={() => onSave({ marketingStatus: 'granted' })}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Record permission'}
              </button>
              {status !== 'declined' ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => onSave({ marketingStatus: 'declined' })}
                  className="ml-2 rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-800 disabled:opacity-50"
                >
                  Record decline
                </button>
              ) : (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => onSave({ marketingStatus: 'unrecorded' })}
                  className="ml-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 disabled:opacity-50"
                >
                  Clear record
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <p className="border-t border-slate-200 pt-5 text-sm text-slate-600">
          Only the {scopeLabel} owner can record marketing permission.
        </p>
      )}
    </div>
  );
}
