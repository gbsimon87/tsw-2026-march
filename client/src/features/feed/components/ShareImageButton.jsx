import { useRef } from 'react';

import { ShareableCardExport } from './cards/ShareableCardExport';
import { useShareImage } from '../hooks/useShareImage';

function defaultFileName(props) {
  const label =
    props.playerCard?.playerName || props.teamCard?.teamName || props.gameCard?.teamName || 'tsw';
  return `${String(label)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')}-tsw.png`;
}

// Owns the single off-screen export node, so both actions rasterise the exact
// same card. `onPrepareInstagram` receives that File instead of downloading it,
// which is what removes the save-then-re-upload step from the operator's job.
export function ShareImageButton({
  className,
  fileName,
  showShare = true,
  onPrepareInstagram,
  ...cardProps
}) {
  const exportRef = useRef(null);
  const { createImageFile, shareImage, status } = useShareImage();
  const resolvedFileName = fileName || defaultFileName(cardProps);

  const handleClick = () => {
    shareImage(exportRef.current, resolvedFileName);
  };

  const handlePrepareInstagram = async () => {
    const file = await createImageFile(exportRef.current, resolvedFileName);
    if (file) onPrepareInstagram(file);
  };

  return (
    <div className={className}>
      <div className="flex items-center justify-end gap-2">
        {showShare ? (
          <button
            type="button"
            onClick={handleClick}
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
            disabled={status === 'generating'}
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
      <ShareableCardExport ref={exportRef} {...cardProps} />
    </div>
  );
}
