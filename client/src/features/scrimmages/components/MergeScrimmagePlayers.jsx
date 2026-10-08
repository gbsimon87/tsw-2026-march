import { useState } from 'react';
import { scrimmagesApi } from '../api/scrimmagesApi';

export function MergeScrimmagePlayers({ scrimmageId, pool, run }) {
  const [source, setSource] = useState('');
  const [target, setTarget] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const sourcePlayer = pool.find((player) => player.id === source);
  const targetPlayer = pool.find((player) => player.id === target);
  async function merge(event) {
    event.preventDefault();
    if (!sourcePlayer || !targetPlayer || source === target || !confirmed || saving) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const ok = await run(() =>
        scrimmagesApi.mergePlayers(scrimmageId, source, { toPlayerId: target, confirmed: true })
      );
      if (ok) {
        setSuccess(`Combined profiles under ${targetPlayer.displayName}.`);
        setSource('');
        setTarget('');
        setConfirmed(false);
      } else setError('The profiles were not merged. See the error above.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <details className="rounded-xl border border-slate-200 bg-white p-5">
      <summary className="cursor-pointer font-semibold">Resolve duplicate profiles</summary>
      <form className="mt-4 space-y-4" onSubmit={merge}>
        <p className="text-sm text-slate-600">
          Combine two records for the same person. Keep the profile name you want players to see.
          Original records, video timestamps, source references and approved account links are
          retained.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            ['Duplicate profile', source, setSource],
            ['Profile to keep', target, setTarget],
          ].map(([label, value, setter]) => (
            <label key={label} className="text-sm font-medium">
              {label}
              <select
                className="mt-1 w-full rounded-lg border p-2"
                required
                value={value}
                onChange={(event) => {
                  setter(event.target.value);
                  setConfirmed(false);
                  setSuccess('');
                }}
              >
                <option value="">Choose a profile</option>
                {pool.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.displayName}
                    {player.isActive ? '' : ' (inactive)'} · {player.id.slice(-6)}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        {sourcePlayer && targetPlayer && source !== target && (
          <div className="rounded-lg bg-slate-50 p-3 text-sm">
            <p>
              <strong>{sourcePlayer.displayName}</strong> will join{' '}
              <strong>{targetPlayer.displayName}</strong>. All seasons will use the retained profile
              in stats and player pages. Old links will still work.
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Finish weeks containing these profiles first. Conflicting accounts or profiles
              appearing together in a game cannot be combined.
            </p>
            <label className="mt-3 flex items-start gap-2">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              These profiles represent the same person; keep {targetPlayer.displayName}.
            </label>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        {success && (
          <p role="status" className="text-sm text-green-700">
            {success}
          </p>
        )}
        <button
          className="rounded-lg bg-[#1B4332] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          disabled={saving || !confirmed || !sourcePlayer || !targetPlayer || source === target}
        >
          {saving ? 'Combining…' : 'Combine profiles'}
        </button>
      </form>
    </details>
  );
}
