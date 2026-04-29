import { buildYouTubeEmbedUrl } from '../youtube';

export function GameVideoEmbed({ videoUrl, title }) {
  const embedUrl = buildYouTubeEmbedUrl(videoUrl);

  if (!embedUrl) {
    return null;
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Game Video</h2>
      </div>
      <div className="aspect-video w-full bg-slate-950">
        <iframe
          className="h-full w-full"
          src={embedUrl}
          title={title || 'Game video'}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    </section>
  );
}
