import { useMemo, useRef, useState } from 'react';

import { Modal } from '../../../components/ui/Modal';
import { trackEvent } from '../../analytics/trackEvent';
import { SHAREABLE_SOURCES } from '../../analytics/attribution';
import {
  ShareableCardExport,
  ShareableCardPreview,
} from '../../feed/components/cards/ShareableCardExport';
import { SLIDE_KINDS } from '../../feed/components/cards/carouselSlides';
import { useShareImage } from '../../feed/hooks/useShareImage';
import { zipStore } from '../../../lib/zip';
import { guardGamePayload, marketingFingerprint } from '../exportGuard';
import { buildGameSocialKit, buildKitReadme } from '../gameSocialKit';
import { CaptionAssistant } from './CaptionAssistant';
import { ExportGuardNotice } from './ExportGuardNotice';
import { CopyButton } from './CopyButton';

const DESTINATION_LABELS = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  whatsapp: 'WhatsApp',
};

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/**
 * Social backlog rank 6 — the completed-game social kit.
 *
 * Every asset mounts its own off-screen export node while the modal is open, so
 * html2canvas has something laid out to rasterise. That is why the modal only
 * renders its contents when open: a game page would otherwise carry four
 * 1080x1350 nodes it never uses.
 */
export function GameSocialKitModal({ open, onClose, data, origin, marketing, refreshMarketing }) {
  const [destination, setDestination] = useState('instagram');
  const [excluded, setExcluded] = useState(() => new Set());
  // Social backlog rank 7: the carousel's order and membership. The kit builder
  // takes this list straight, so removing or moving a slide needs no per-slide
  // code — which is what "without design work" has to mean to be true.
  const [slideKinds, setSlideKinds] = useState(SLIDE_KINDS);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const nodeRefs = useRef(new Map());
  const { createImageFile } = useShareImage();

  const resolvedOrigin = origin ?? (typeof window === 'undefined' ? '' : window.location.origin);

  // Social backlog rank 9: guard the PAYLOAD, once, before anything is built
  // from it. The final-score card, the carousel's performers slide and the
  // player cards all read recap.topPerformers, so masking it here keeps a
  // player the league's permission does not cover out of every asset in the
  // kit without each builder knowing the rule.
  const { data: guardedData, guard } = useMemo(
    () => guardGamePayload(data, marketing),
    [data, marketing]
  );

  const kit = useMemo(
    () => buildGameSocialKit(guardedData, { origin: resolvedOrigin, destination, slideKinds }),
    [guardedData, resolvedOrigin, destination, slideKinds]
  );

  if (!kit) return null;

  const blocked = !guard.canExport;

  const included = kit.assets.filter((asset) => !excluded.has(asset.id));

  const toggle = (assetId) =>
    setExcluded((current) => {
      const next = new Set(current);
      if (next.has(assetId)) next.delete(assetId);
      else next.add(assetId);
      return next;
    });

  // Moving a slide renumbers every file after it, which is the point: the
  // numbers ARE the carousel order an operator uploads in.
  const moveSlide = (kind, offset) =>
    setSlideKinds((current) => {
      const from = current.indexOf(kind);
      const to = from + offset;
      if (from < 0 || to < 0 || to >= current.length) return current;
      const next = [...current];
      next.splice(to, 0, next.splice(from, 1)[0]);
      return next;
    });

  const removeSlide = (kind) => setSlideKinds((current) => current.filter((k) => k !== kind));
  const restoreSlides = () => setSlideKinds(SLIDE_KINDS);

  const report = (event, asset) =>
    trackEvent(event, {
      target_type: asset ? asset.type : 'game_kit',
      method: 'download',
      source: 'game_detail',
      ...(asset?.format ? { format: asset.format } : null),
      ...(event === 'share_completed' ? { result: 'succeeded' } : null),
    });

  async function permissionStillCurrent() {
    if (!refreshMarketing) return true;
    const latest = await refreshMarketing().catch(() => null);
    if (marketingFingerprint(latest) === marketingFingerprint(marketing)) return true;
    setError('Permission changed or could not be confirmed. Review the updated kit and try again.');
    return false;
  }

  async function downloadOne(asset) {
    if (blocked) return;
    setError('');
    setStatus('checking');
    if (!(await permissionStillCurrent())) {
      setStatus('idle');
      return;
    }
    setStatus(`asset:${asset.id}`);
    report('share_initiated', asset);

    const file = await createImageFile(nodeRefs.current.get(asset.id), asset.fileName);
    if (!file) {
      setError(`Could not render ${asset.label}. Try again.`);
      setStatus('idle');
      return;
    }

    downloadBlob(file, asset.fileName);
    report('share_completed', asset);
    setStatus('idle');
  }

  async function downloadZip() {
    if (blocked) return;
    setError('');
    setStatus('checking');
    if (!(await permissionStillCurrent())) {
      setStatus('idle');
      return;
    }
    setStatus('zip');
    report('share_initiated', null);

    try {
      const entries = [];
      // Sequential on purpose: html2canvas walks the DOM and rasterises on the
      // main thread, so four concurrent captures compete for it and finish no
      // sooner, while making a partial failure harder to attribute.
      for (const asset of included) {
        const file = await createImageFile(nodeRefs.current.get(asset.id), asset.fileName);
        if (!file) throw new Error(asset.label);
        entries.push({ name: asset.fileName, data: new Uint8Array(await file.arrayBuffer()) });
      }

      entries.push({
        name: 'caption-and-alt-text.txt',
        data: new TextEncoder().encode(
          buildKitReadme({
            ...kit,
            assets: included,
            carousel: included.filter((asset) => asset.position != null),
          })
        ),
      });

      downloadBlob(
        new Blob([zipStore(entries)], { type: 'application/zip' }),
        `${kit.stem}-social-kit.zip`
      );
      report('share_completed', null);
    } catch (zipError) {
      setError(
        `Could not build the kit${zipError?.message ? ` (${zipError.message})` : ''}. Try again.`
      );
    } finally {
      setStatus('idle');
    }
  }

  const busy = status !== 'idle';

  return (
    <Modal open={open} onClose={onClose} title="Social kit">
      <div className="space-y-5">
        <p className="text-sm text-slate-600">
          Everything this finished game is worth posting, built from its frozen box score. Preview
          each asset, download one, or take the whole kit as a ZIP with the caption and alt text
          inside.
        </p>

        <ExportGuardNotice guard={guard} />

        <label className="block text-sm font-medium text-slate-800">
          Posting to
          <select
            aria-label="Posting destination"
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
            className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
          >
            {SHAREABLE_SOURCES.map((value) => (
              <option key={value} value={value}>
                {DESTINATION_LABELS[value] || value}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-slate-500">
            Tags the link in the caption so this platform&apos;s visits can be told apart.
          </span>
        </label>

        {error ? (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            {error}
          </p>
        ) : null}

        <ul className="space-y-3">
          {kit.assets.map((asset) => (
            <li
              key={asset.id}
              className="flex flex-wrap items-start gap-4 rounded-xl border border-slate-200 p-3"
            >
              <div className="shrink-0 overflow-hidden rounded-lg">
                <ShareableCardPreview format={asset.format} {...asset.source} />
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {asset.position ? `${asset.position}. ` : ''}
                    {asset.label}
                  </p>
                  <p className="text-xs text-slate-500">{asset.fileName}</p>
                </div>
                <p className="text-xs text-slate-600">{asset.altText}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => downloadOne(asset)}
                    disabled={busy || blocked}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 transition hover:bg-slate-50 disabled:opacity-40"
                  >
                    {status === `asset:${asset.id}` ? 'Rendering…' : 'Download PNG'}
                  </button>
                  <CopyButton value={asset.altText} label={`alt text for ${asset.label}`} />
                  {asset.position ? (
                    <>
                      <button
                        type="button"
                        onClick={() => moveSlide(asset.card.kind, -1)}
                        disabled={busy || asset.position === 1}
                        aria-label={`Move ${asset.label} earlier`}
                        className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-30"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => moveSlide(asset.card.kind, 1)}
                        disabled={busy || asset.position === kit.carousel.length}
                        aria-label={`Move ${asset.label} later`}
                        className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-30"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => removeSlide(asset.card.kind)}
                        disabled={busy}
                        aria-label={`Remove ${asset.label}`}
                        className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-red-50 hover:text-red-700 disabled:opacity-30"
                      >
                        Remove
                      </button>
                    </>
                  ) : null}
                  <label className="flex items-center gap-1.5 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={!excluded.has(asset.id)}
                      onChange={() => toggle(asset.id)}
                      aria-label={`Include ${asset.label} in the ZIP`}
                    />
                    In ZIP
                  </label>
                </div>
              </div>
            </li>
          ))}
        </ul>

        {slideKinds.length < SLIDE_KINDS.length ? (
          <button
            type="button"
            onClick={restoreSlides}
            className="text-xs font-semibold text-slate-600 underline"
          >
            Restore every slide
          </button>
        ) : null}

        <button
          type="button"
          onClick={downloadZip}
          disabled={busy || blocked || included.length === 0}
          className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {blocked
            ? 'Export held'
            : status === 'zip'
              ? 'Building kit…'
              : `Download kit as ZIP (${included.length} ${included.length === 1 ? 'image' : 'images'} + caption)`}
        </button>

        {/* The same rank 4 assistant the share modal uses, seeded from the game
            card — so the kit's caption and the one an operator would get from
            sharing that card alone are the same text, not two versions of it. */}
        {blocked ? null : (
          <CaptionAssistant
            source={{ type: 'game_card', gameCard: kit.gameCard }}
            origin={resolvedOrigin}
            destination={destination}
            showDestinationPicker={false}
            marketing={marketing}
            defaultOpen
          />
        )}

        {/* Off-screen render targets. One per asset, mounted only while the
            modal is open. */}
        {kit.assets.map((asset) => (
          <ShareableCardExport
            key={asset.id}
            ref={(node) => {
              if (node) nodeRefs.current.set(asset.id, node);
              else nodeRefs.current.delete(asset.id);
            }}
            format={asset.format}
            {...asset.source}
          />
        ))}
      </div>
    </Modal>
  );
}
