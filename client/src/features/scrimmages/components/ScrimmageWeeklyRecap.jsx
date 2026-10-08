import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CopyButton } from '../../social/components/CopyButton';
import { trackEvent } from '../../analytics/trackEvent';
import { scrimmagesApi } from '../api/scrimmagesApi';
import { buildWeeklyRecap } from '../weeklyRecap';
import { ScrimmageStandings } from './ScrimmageStandings';

export function ScrimmageWeeklyRecap({ data, adminMode = false, onRefresh }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const recap = buildWeeklyRecap({ ...data, origin: window.location.origin });
  if (!recap) return null;
  const { scrimmage, session } = data;
  const rules = scrimmage.seasons.find((season) => season.id === session.seasonId).mvpRules;
  const shareProperties = { target_type: 'scrimmage_recap', source: 'scrimmage_session' };
  async function prepareCopy(text = false) {
    setBusy(true);
    setError('');
    try {
      const latest = await scrimmagesApi.session(scrimmage.id, session.id);
      onRefresh?.(latest);
      const fresh = buildWeeklyRecap({ ...latest, origin: window.location.origin });
      if (!fresh) throw new Error('This week’s results are no longer published.');
      if (text && !latest.scrimmage.isPublic)
        throw new Error('This scrimmage is now private. Share the protected recap link instead.');
      trackEvent('share_initiated', { ...shareProperties, method: 'clipboard' });
      return text ? fresh.caption : fresh.url;
    } catch (err) {
      setError(err.message || 'Could not prepare the recap.');
      throw err;
    } finally {
      setBusy(false);
    }
  }
  function copied() {
    trackEvent('share_completed', { ...shareProperties, method: 'clipboard', result: 'succeeded' });
  }
  async function share() {
    setBusy(true);
    setError('');
    setStatus('');
    try {
      // Re-read access, publication and results before sending any names or stats.
      const latest = await scrimmagesApi.session(scrimmage.id, session.id);
      onRefresh?.(latest);
      const fresh = buildWeeklyRecap({ ...latest, origin: window.location.origin });
      if (!fresh) throw new Error('This week’s results are no longer published.');
      const properties = {
        target_type: 'scrimmage_recap',
        source: 'scrimmage_session',
        method: 'native',
      };
      trackEvent('share_initiated', properties);
      await navigator.share({
        title: fresh.title,
        url: fresh.url,
        ...(latest.scrimmage.isPublic
          ? {
              text: fresh.caption.replace(
                `Full results and player video plays: ${fresh.url}`,
                'Full results and player video plays below.'
              ),
            }
          : {}),
      });
      trackEvent('share_completed', { ...properties, result: 'succeeded' });
      setStatus('Recap opened in your share sheet.');
    } catch (err) {
      if (err.name !== 'AbortError')
        setError(err.message || 'Could not share. Use Copy recap link instead.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-5" aria-label="Weekly recap">
      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Published weekly recap
          </p>
          <h2 className="mt-1 text-xl font-bold">{recap.title}</h2>
          <p className="mt-1 text-sm text-slate-600">
            {String(session.date).slice(0, 10)} · {recap.completedGames} completed game
            {recap.completedGames === 1 ? '' : 's'}
          </p>
        </div>
        <div className="rounded-xl bg-[#1B4332]/5 p-4">
          <h3 className="font-semibold">Weekly MVP</h3>
          {recap.winner ? (
            <p className="mt-1 text-lg font-bold">
              {recap.winner.displayName} · {recap.winner.mvpScore.toFixed(2)}
            </p>
          ) : (
            <p className="mt-1 text-sm">No player has met the weekly MVP eligibility threshold.</p>
          )}
        </div>
        <div className="flex flex-wrap gap-3">
          {typeof navigator.share === 'function' && (
            <button
              type="button"
              className="rounded-lg bg-[#1B4332] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              disabled={busy}
              onClick={share}
            >
              {busy ? 'Preparing recap…' : 'Share weekly recap'}
            </button>
          )}
          <CopyButton
            value={recap.url}
            label="recap link"
            disabled={busy}
            resolveValue={() => prepareCopy()}
            onCopied={copied}
          />
        </div>
        <label className="block text-sm font-medium">
          Recap link
          <input
            readOnly
            value={recap.url}
            className="mt-1 block w-full rounded-lg border p-2 text-sm"
            onFocus={(event) => event.target.select()}
          />
        </label>
        {!scrimmage.isPublic && (
          <p className="text-sm text-slate-600">
            This scrimmage is private. The shared link can only be opened by admins and approved
            members.
          </p>
        )}
        {scrimmage.isPublic && (
          <details>
            <summary className="cursor-pointer text-sm font-semibold">
              Recap text for sharing
            </summary>
            <textarea
              aria-label="Recap text"
              readOnly
              value={recap.caption}
              rows={8}
              className="my-3 w-full rounded-lg border p-3 text-sm"
              onFocus={(event) => event.target.select()}
            />
            <CopyButton
              value={recap.caption}
              label="recap text"
              disabled={busy}
              resolveValue={() => prepareCopy(true)}
              onCopied={copied}
            />
          </details>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        {status && (
          <p role="status" className="text-sm text-green-800">
            {status}
          </p>
        )}
      </div>
      <ScrimmageStandings
        rows={data.standings}
        rules={rules}
        scrimmageId={scrimmage.id}
        seasonId={session.seasonId}
        sessionId={session.id}
        adminMode={adminMode}
      />
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="font-semibold">Player video plays</h3>
        <p className="mt-1 text-sm text-slate-600">
          Open a player’s profile to watch this week’s makes, misses and turnovers.
          {!session.videoUrl && ' No recording is attached to this week yet.'}
        </p>
        <ul className="mt-3 grid list-none gap-2 p-0 sm:grid-cols-2">
          {recap.players.map((player) => (
            <li key={player.playerId}>
              <Link
                className="text-sm underline"
                to={`${adminMode ? '/admin' : ''}${player.playsPath}`}
              >
                Watch {player.displayName}’s plays
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
