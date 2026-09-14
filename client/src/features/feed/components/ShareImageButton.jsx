import { useRef, useState } from 'react';

import { Modal } from '../../../components/ui/Modal';
import { ShareableCardExport, ShareableCardPreview } from './cards/ShareableCardExport';
import { SOCIAL_EXPORT_FORMATS, socialExportPreset } from './cards/socialExportPresets';
import { useShareImage } from '../hooks/useShareImage';

function defaultFileName(props) {
  const label =
    props.playerCard?.playerName || props.teamCard?.teamName || props.gameCard?.teamName || 'tsw';
  return `${String(label)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')}-tsw.png`;
}

// The chooser captures the selected format. The Instagram handoff keeps a
// separate 4:5 node because that publishing flow requires a post-sized image.
export function ShareImageButton({
  className,
  fileName,
  showShare = true,
  onPrepareInstagram,
  ...cardProps
}) {
  const exportRef = useRef(null);
  const instagramRef = useRef(null);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [format, setFormat] = useState('post');
  const { createImageFile, shareImage, status } = useShareImage();
  const resolvedFileName = fileName || defaultFileName(cardProps);
  const preset = socialExportPreset(format);

  const handleShare = () => {
    const name =
      format === 'post'
        ? resolvedFileName
        : `${resolvedFileName.replace(/\.png$/i, '')}-${preset.suffix}.png`;
    shareImage(exportRef.current, name);
  };

  const handlePrepareInstagram = async () => {
    const node = format === 'post' ? exportRef.current : instagramRef.current;
    const file = await createImageFile(node, resolvedFileName);
    if (file) onPrepareInstagram(file);
  };

  return (
    <div className={className}>
      <div className="flex items-center justify-end gap-2">
        {showShare ? (
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
      <ShareableCardExport ref={exportRef} format={format} {...cardProps} />
      {onPrepareInstagram && format !== 'post' ? (
        <ShareableCardExport ref={instagramRef} format="post" {...cardProps} />
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
            <ShareableCardPreview format={format} {...cardProps} />
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
              disabled={status === 'generating'}
              className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {status === 'generating' ? 'Creating image…' : 'Share or download PNG'}
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
