import CloudinaryImage from '../../../media/CloudinaryImage';

export function ImagePostCard({ image, caption }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {caption ? <p className="px-4 pt-4 text-sm text-slate-700">{caption}</p> : null}
      <CloudinaryImage
        src={image.url}
        alt="Feed post"
        width={640}
        height={512}
        srcSetWidths={[320, 640, 1024]}
        sizes="(max-width: 640px) 100vw, 90vw"
        className={`w-full object-cover ${caption ? 'mt-4 max-h-[32rem]' : 'max-h-[32rem]'}`}
        loading="lazy"
        decoding="async"
      />
    </article>
  );
}
