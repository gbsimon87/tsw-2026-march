export function FullScreenImagePost({ image }) {
  return (
    <img src={image.url} alt="Feed post" className="h-full w-full object-cover" loading="lazy" />
  );
}
