import { useEffect, useRef, useState } from 'react';

import { Modal } from '../../../components/ui/Modal';
import { trackEvent } from '../../analytics/trackEvent';
import { CaptionAssistant } from '../../social/components/CaptionAssistant';
import { ExportGuardNotice } from '../../social/components/ExportGuardNotice';
import { guardCard, marketingFingerprint } from '../../social/exportGuard';
import { usePostMarketing } from '../../social/hooks/usePostMarketing';
import { ShareableCardExport, ShareableCardPreview } from './cards/ShareableCardExport';
import { SOCIAL_EXPORT_FORMATS, socialExportPreset } from './cards/socialExportPresets';
import { useShareImage } from '../hooks/useShareImage';

// Which prop holds the card for each type — the guard rewrites exactly one.
const CARD_PROP_BY_TYPE = {
  game_card: 'gameCard',
  player_card: 'playerCard',
  player_game_card: 'playerGameCard',
  team_card: 'teamCard',
  milestone: 'milestoneCard',
  leaderboard_card: 'leaderboardCard',
  carousel_slide: 'carouselSlide',
};

function defaultFileName(props) {
  const label =
    props.playerCard?.playerName ||
    props.playerGameCard?.playerName ||
    props.teamCard?.teamName ||
    props.gameCard?.teamName ||
    'tsw';
  return `${String(label)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')}-tsw.png`;
}

// The chooser captures the selected format. The Instagram handoff keeps a
// separate 4:5 node because that publishing flow requires a post-sized image.
//
// Pass `open`/`onOpenChange` to drive the chooser from outside and suppress the
// built-in trigger. The box score uses that to run ONE instance off the selected
// row: a button per row would mount a 1080x1350 off-screen export node per
// player, which is what html2canvas has to walk.
export function ShareImageButton({
  className,
  fileName,
  showShare = true,
  onPrepareInstagram,
  open,
  onOpenChange,
  // Social backlog rank 4: the operator's own caption, when the post carries
  // one. Destructured out of cardProps so it reaches the caption assistant and
  // not the renderer.
  captionLead = '',
  // Social backlog rank 5: which surface the share came from, so one dashboard
  // can compare them (docs/posthog.md §11.7). The Pulse is the default because
  // it is where most cards are shared from.
  shareSource = 'pulse',
  // Social backlog rank 9 — the export guard. A page that already loaded a
  // public payload passes its `marketing` block straight through; a feed post
  // has none, so it passes `marketingPostId` and the block is fetched when this
  // surface is actually used. Supplying neither means blocked, which is the
  // only direction a consent guard may fail in.
  marketing,
  marketingPostId = null,
  refreshMarketing,
  ...cardProps
}) {
  const isControlled = typeof onOpenChange === 'function';
  const exportRef = useRef(null);
  const instagramRef = useRef(null);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const chooserOpen = isControlled ? Boolean(open) : uncontrolledOpen;
  const setChooserOpen = isControlled ? onOpenChange : setUncontrolledOpen;
  const [format, setFormat] = useState('post');
  const [instagramPending, setInstagramPending] = useState(false);
  const [actionError, setActionError] = useState('');
  const { createImageFile, shareImage, status } = useShareImage();
  const preset = socialExportPreset(format);

  // The page-supplied block wins; otherwise ask for this post's, but only once
  // a surface that can publish is open or a publish has been requested.
  const fetched = usePostMarketing(marketingPostId, chooserOpen || instagramPending);
  const resolvedMarketing = marketing !== undefined ? marketing : fetched.marketing;
  // True while this post's permission is expected but not yet known. It is NOT
  // the same as blocked: the answer has not come back, so neither the share
  // button nor the notice may speak yet.
  const awaitingLookup =
    marketing === undefined &&
    Boolean(marketingPostId) &&
    fetched.status !== 'ready' &&
    fetched.status !== 'failed';

  const { card: guardedCard, guard } = guardCard(
    cardProps.type,
    cardProps[CARD_PROP_BY_TYPE[cardProps.type]],
    resolvedMarketing
  );
  const guardedProps = CARD_PROP_BY_TYPE[cardProps.type]
    ? { ...cardProps, [CARD_PROP_BY_TYPE[cardProps.type]]: guardedCard }
    : cardProps;
  const resolvedFileName = fileName || defaultFileName(guardedProps);
  const blocked = !guard.canExport;

  const handleShare = async () => {
    if (blocked || awaitingLookup) return;
    setActionError('');
    if (marketingPostId || refreshMarketing) {
      const latest = marketingPostId
        ? await fetched.refresh()
        : await refreshMarketing().catch(() => null);
      if (marketingFingerprint(latest) !== marketingFingerprint(resolvedMarketing)) {
        setActionError('Permission changed. Review the updated card and try again.');
        return;
      }
      if (!latest?.canFeature) return;
    }
    const name =
      format === 'post'
        ? resolvedFileName
        : `${resolvedFileName.replace(/\.png$/i, '')}-${preset.suffix}.png`;
    shareImage(exportRef.current, name, (event, properties) =>
      trackEvent(event, {
        ...properties,
        target_type: cardProps.type,
        source: shareSource,
        format,
        ...(event === 'share_completed' ? { result: 'succeeded' } : null),
      })
    );
  };

  const handlePrepareInstagram = async () => {
    // Nothing is known about this post's permission yet: arm the lookup and let
    // the effect below finish the job rather than preparing an image first and
    // checking afterwards.
    if (marketing === undefined && marketingPostId && fetched.status !== 'ready') {
      setInstagramPending(true);
      return;
    }
    if (blocked) return;
    setActionError('');
    if (marketingPostId || refreshMarketing) {
      const latest = marketingPostId
        ? await fetched.refresh()
        : await refreshMarketing().catch(() => null);
      if (marketingFingerprint(latest) !== marketingFingerprint(resolvedMarketing)) {
        setActionError('Permission changed. Review the updated card and try again.');
        return;
      }
      if (!latest?.canFeature) return;
    }
    const node = format === 'post' ? exportRef.current : instagramRef.current;
    const file = await createImageFile(node, resolvedFileName);
    if (file) onPrepareInstagram(file, resolvedMarketing);
  };

  useEffect(() => {
    if (!instagramPending || fetched.status === 'loading' || fetched.status === 'idle') return;
    setInstagramPending(false);
    if (!guard.canExport) return;

    const node = format === 'post' ? exportRef.current : instagramRef.current;
    createImageFile(node, resolvedFileName).then((file) => {
      if (file) onPrepareInstagram(file, fetched.marketing);
    });
    // The effect runs off the resolved lookup; re-running it on every render of
    // the same pending request would prepare the image twice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instagramPending, fetched.status]);

  return (
    <div className={className}>
      <div className="flex items-center justify-end gap-2">
        {showShare && !isControlled ? (
          <button
            type="button"
            onClick={() => setChooserOpen(true)}
            disabled={status === 'generating'}
            aria-label="Share as image"
            title="Share as image"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-800 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 disabled:opacity-50"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
              <path d="M12 3v13M8 7l4-4 4 4" />
            </svg>
          </button>
        ) : null}
        {onPrepareInstagram ? (
          <button
            type="button"
            onClick={handlePrepareInstagram}
            disabled={status === 'generating' || (!awaitingLookup && blocked)}
            aria-label="Prepare for Instagram"
            title="Prepare for Instagram"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#F4A300] bg-white text-[#9A6500] shadow-sm transition hover:bg-amber-50 disabled:opacity-50"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <rect x="3" y="3" width="18" height="18" rx="5" />
              <circle cx="12" cy="12" r="4" />
              <circle cx="17.5" cy="6.5" r="0.8" fill="currentColor" stroke="none" />
            </svg>
          </button>
        ) : null}
      </div>
      {status === 'error' ? (
        <p className="mt-1 text-right text-xs font-medium text-red-600">
          Couldn&apos;t create image. Try again.
        </p>
      ) : null}
      {actionError ? (
        <p role="alert" className="mt-1 text-right text-xs font-medium text-red-600">
          {actionError}
        </p>
      ) : null}
      <ShareableCardExport ref={exportRef} format={format} {...guardedProps} />
      {onPrepareInstagram && format !== 'post' ? (
        <ShareableCardExport ref={instagramRef} format="post" {...guardedProps} />
      ) : null}
      {showShare ? (
        <Modal open={chooserOpen} onClose={() => setChooserOpen(false)} title="Share an image">
          <div className="flex flex-col items-center gap-4">
            <label className="w-full text-sm font-medium text-slate-700">
              Format
              <select
                aria-label="Image format"
                value={format}
                onChange={(event) => setFormat(event.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
              >
                {SOCIAL_EXPORT_FORMATS.map((value) => {
                  const option = socialExportPreset(value);
                  return (
                    <option key={value} value={value}>
                      {option.label}
                      {value === 'post' ? '' : ` (${option.width}×${option.height})`}
                    </option>
                  );
                })}
              </select>
            </label>
            <ShareableCardPreview format={format} {...guardedProps} />
            <ExportGuardNotice guard={guard} loading={awaitingLookup} />
            {preset.safeArea ? (
              <p className="text-center text-xs text-slate-600">
                Dashed box shows the text-safe area. It will not appear in the PNG. Check the final
                placement in each app before posting.
              </p>
            ) : null}
            {format === 'link' ? (
              <p className="text-center text-xs text-slate-600">
                This exports an image; shared URLs still need crawler-visible metadata for automatic
                link previews.
              </p>
            ) : null}
            <button
              type="button"
              onClick={handleShare}
              disabled={status === 'generating' || blocked || awaitingLookup}
              className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {awaitingLookup
                ? 'Checking permission…'
                : blocked
                  ? 'Export held'
                  : status === 'generating'
                    ? 'Creating image…'
                    : 'Share or download PNG'}
            </button>
            {blocked ? null : (
              <CaptionAssistant
                source={guardedProps}
                lead={captionLead}
                marketing={resolvedMarketing}
                defaultOpen
              />
            )}
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
