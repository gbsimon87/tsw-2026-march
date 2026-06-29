export function VideoPostCard({ video, caption }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-black">
      {caption ? <p className="px-4 pt-4 text-sm text-slate-700">{caption}</p> : null}
      <video
        src={video.url}
        poster={video.thumbnailUrl || undefined}
        controls
        playsInline
        className={`w-full max-h-[32rem] object-contain ${caption ? 'mt-4' : ''}`}
      />
    </article>
  );
}
