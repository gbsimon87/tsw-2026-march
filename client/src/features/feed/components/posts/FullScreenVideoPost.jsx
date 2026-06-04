import { useRef, useState } from 'react';

export function FullScreenVideoPost({ video }) {
  const videoRef = useRef(null);
  const [muted, setMuted] = useState(true);

  function toggleMute() {
    const el = videoRef.current;
    if (!el) return;
    el.muted = !el.muted;
    setMuted(el.muted);
  }

  return (
    <div className="relative h-full w-full bg-black">
      <video
        ref={videoRef}
        src={video.url}
        poster={video.thumbnailUrl || undefined}
        className="h-full w-full object-cover"
        playsInline
        muted
        loop
        autoPlay
      />

      {/* Mute toggle */}
      <button
        type="button"
        aria-label={muted ? 'Unmute video' : 'Mute video'}
        onClick={toggleMute}
        className="absolute right-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm"
      >
        {muted ? (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
            <path d="M3.63 3.63a1 1 0 0 0 0 1.41L7.29 8.7 7 9H4a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h3l3.29 3.29c.63.63 1.71.18 1.71-.71v-4.17l4.18 4.18c-.49.37-1.02.68-1.6.91a1 1 0 1 0 .75 1.85 8.9 8.9 0 0 0 2.44-1.4l1.31 1.31a1 1 0 0 0 1.41-1.41L5.05 3.63a1 1 0 0 0-1.42 0zM19 12c0 .82-.15 1.61-.41 2.34l1.53 1.53A8.9 8.9 0 0 0 21 12c0-4.28-3-7.86-7-8.77v2.06A7.02 7.02 0 0 1 19 12zm-7-7.71v2.06c1.48.4 2.75 1.23 3.71 2.34l1.49-1.49A9 9 0 0 0 12 4.29z" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
          </svg>
        )}
      </button>
    </div>
  );
}
