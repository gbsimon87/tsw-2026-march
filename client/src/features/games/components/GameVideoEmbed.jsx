import { forwardRef, useCallback } from 'react';
import { buildYouTubeEmbedUrl } from '../youtube';

export const GameVideoEmbed = forwardRef(function GameVideoEmbed({ videoUrl, title }, ref) {
  const embedUrl = buildYouTubeEmbedUrl(videoUrl);

  const onLoad = useCallback((event) => {
    const win = event.target.contentWindow;
    if (!win) return;
    // Start receiving postMessage events from the iframe
    win.postMessage('{"event":"listening","id":1}', '*');
    // Subscribe to video info updates (fires currentTime etc. while playing)
    win.postMessage('{"event":"command","func":"addEventListener","args":["onStateChange"]}', '*');
  }, []);

  if (!embedUrl) {
    return null;
  }

  const src = `${embedUrl}?enablejsapi=1&controls=1&rel=0&modestbranding=1&playsinline=1`;

  return (
    <div className="aspect-video w-full overflow-hidden rounded-xl bg-slate-950">
      <iframe
        ref={ref}
        className="h-full w-full"
        src={src}
        title={title || 'Game video'}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        onLoad={onLoad}
      />
    </div>
  );
});
