import CloudinaryImage from '../../../media/CloudinaryImage';

export function FullScreenImagePost({ image }) {
  return (
    <CloudinaryImage
      src={image.url}
      alt="Feed post"
      width={640}
      height={640}
      className="h-full w-full object-cover"
      loading="eager"
      srcSetWidths={[320, 640, 1080]}
      sizes="100vw"
    />
  );
}
