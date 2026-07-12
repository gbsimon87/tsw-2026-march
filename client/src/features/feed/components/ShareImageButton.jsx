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

export function ShareImageButton({ className, fileName, ...cardProps }) {
  const exportRef = useRef(null);
  const { shareImage, status } = useShareImage();

  const handleClick = () => {
    shareImage(exportRef.current, fileName || defaultFileName(cardProps));
  };

  return (
    <div className={className}>
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
      {status === 'error' ? (
        <p className="mt-1 text-xs font-medium text-red-600">
          Couldn&apos;t create image. Try again.
        </p>
      ) : null}
      <ShareableCardExport ref={exportRef} {...cardProps} />
    </div>
  );
}
