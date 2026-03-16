export function ImagePostCard({ image, caption }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {caption ? <p className="px-4 pt-4 text-sm text-slate-700">{caption}</p> : null}
      <img
        src={image.url}
        alt="Feed post"
        className={`w-full object-cover ${caption ? 'mt-4 max-h-[32rem]' : 'max-h-[32rem]'}`}
      />
    </article>
  );
}
