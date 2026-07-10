export function VideoPostCard({ video, caption }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-black">
      {caption ? <p className="px-4 pt-4 text-sm text-slate-700">{caption}</p> : null}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption -- user-uploaded
          videos have no caption track data; nothing to point a <track> at. */}
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
