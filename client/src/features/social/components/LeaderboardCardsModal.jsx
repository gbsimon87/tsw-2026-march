import { useMemo, useRef, useState } from 'react';

import { Modal } from '../../../components/ui/Modal';
import { SHAREABLE_SOURCES } from '../../analytics/attribution';
import { trackEvent } from '../../analytics/trackEvent';
import {
  ShareableCardExport,
  ShareableCardPreview,
} from '../../feed/components/cards/ShareableCardExport';
import { buildLeaderboardCards } from '../../feed/components/cards/leaderboardCards';
import { useShareImage } from '../../feed/hooks/useShareImage';
import { guardCard, marketingFingerprint, resolveExportGuard } from '../exportGuard';
import { CaptionAssistant } from './CaptionAssistant';
import { CopyButton } from './CopyButton';
import { ExportGuardNotice } from './ExportGuardNotice';

const DESTINATION_LABELS = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  whatsapp: 'WhatsApp',
};

const FORMATS = [
  { value: 'post', label: '4:5 post' },
  { value: 'story', label: '9:16 Story / Reel / TikTok' },
];

function slugify(value) {
  return String(value || 'league')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Social backlog rank 8 — the league leaders and table cards.
 *
 * A category the server suppressed (fewer than three qualified players) never
 * reaches this list, so the modal shows what a league can actually publish
 * today rather than four slots with three of them empty.
 */
export function LeaderboardCardsModal({
  open,
  onClose,
  league,
  categoryLeaders = [],
  standings = [],
  formByTeam = null,
  seasonLabel = '',
  origin,
  marketing,
  refreshMarketing,
}) {
  const [format, setFormat] = useState('post');
  const [destination, setDestination] = useState('instagram');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const nodeRefs = useRef(new Map());
  const { createImageFile } = useShareImage();

  const resolvedOrigin = origin ?? (typeof window === 'undefined' ? '' : window.location.origin);
  const guarded = useMemo(
    () =>
      buildLeaderboardCards({
        league,
        categoryLeaders,
        standings,
        formByTeam,
        seasonLabel,
      }).map((card) => {
        const result = guardCard('leaderboard_card', card, marketing);
        return {
          ...result,
          card: result.card && {
            ...result.card,
            // The league page is the provenance for every one of these claims,
            // and the caption assistant reads it off the card.
            leagueUrl: league?.slug ? `/league/${league.slug}` : null,
          },
        };
      }),
    [league, categoryLeaders, standings, formByTeam, seasonLabel, marketing]
  );
  const cards = guarded.map((result) => result.card).filter(Boolean);

  const guard = resolveExportGuard(marketing, {
    restrictedCount: guarded.reduce((total, result) => total + result.restrictedCount, 0),
  });

  const noClearedCards = guarded.length > 0 && cards.length === 0;

  if (!guarded.length) return null;

  const blocked = !guard.canExport;

  const stem = slugify(league?.name);
  const busy = status !== 'idle';

  async function download(card) {
    if (blocked) return;
    setError('');
    setStatus('checking');
    if (refreshMarketing) {
      const latest = await refreshMarketing().catch(() => null);
      if (marketingFingerprint(latest) !== marketingFingerprint(marketing)) {
        setError(
          'Permission changed or could not be confirmed. Review the updated card and try again.'
        );
        setStatus('idle');
        return;
      }
    }
    setStatus(card.kind);

    const fileName = `${stem}-${card.kind}${format === 'story' ? '-story' : ''}.png`;
    trackEvent('share_initiated', {
      target_type: 'leaderboard_card',
      method: 'download',
      source: 'league_page',
      format,
    });

    const file = await createImageFile(nodeRefs.current.get(card.kind), fileName);
    if (!file) {
      setError(`Could not render the ${card.label} card. Try again.`);
      setStatus('idle');
      return;
    }

    const url = URL.createObjectURL(file);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);

    trackEvent('share_completed', {
      target_type: 'leaderboard_card',
      method: 'download',
      source: 'league_page',
      format,
      result: 'succeeded',
    });
    setStatus('idle');
  }

  return (
    <Modal open={open} onClose={onClose} title="Leaderboard cards">
      <div className="space-y-5">
        <p className="text-sm text-slate-600">
          Season-to-date leaders and the league table, ranked from every qualified player. A
          category with fewer than three qualified players is left out rather than shown short.
        </p>

        <ExportGuardNotice guard={guard} />
        {noClearedCards ? (
          <p role="status" className="text-sm text-amber-800">
            No ranking has three cleared players available for export.
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-slate-800">
            Format
            <select
              aria-label="Image format"
              value={format}
              onChange={(event) => setFormat(event.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
            >
              {FORMATS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

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
          </label>
        </div>

        {format === 'story' ? (
          <p className="text-xs text-slate-600">
            Dashed box in the preview shows the text-safe area. It will not appear in the PNG.
          </p>
        ) : null}

        {error ? (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            {error}
          </p>
        ) : null}

        <ul className="space-y-3">
          {cards.map((card) => (
            <li
              key={card.kind}
              className="flex flex-wrap items-start gap-4 rounded-xl border border-slate-200 p-3"
            >
              <div className="shrink-0 overflow-hidden rounded-lg">
                <ShareableCardPreview
                  type="leaderboard_card"
                  leaderboardCard={card}
                  format={format}
                />
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-sm font-semibold text-slate-900">{card.label}</p>
                <p className="text-xs text-slate-600">{card.altText}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => download(card)}
                    disabled={busy || blocked}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 transition hover:bg-slate-50 disabled:opacity-40"
                  >
                    {blocked ? 'Held' : status === card.kind ? 'Rendering…' : 'Download PNG'}
                  </button>
                  <CopyButton value={card.altText} label={`alt text for ${card.label}`} />
                </div>
              </div>
            </li>
          ))}
        </ul>

        {/* Seeded from the first card, which is the one an operator posts; the
            others are variations on the same league and season. */}
        {blocked ? null : (
          <CaptionAssistant
            source={{ type: 'leaderboard_card', leaderboardCard: cards[0] }}
            origin={resolvedOrigin}
            destination={destination}
            showDestinationPicker={false}
            marketing={marketing}
            defaultOpen
          />
        )}

        {/* Off-screen render targets, mounted only while the modal is open. */}
        {cards.map((card) => (
          <ShareableCardExport
            key={card.kind}
            ref={(node) => {
              if (node) nodeRefs.current.set(card.kind, node);
              else nodeRefs.current.delete(card.kind);
            }}
            type="leaderboard_card"
            leaderboardCard={card}
            format={format}
          />
        ))}
      </div>
    </Modal>
  );
}
