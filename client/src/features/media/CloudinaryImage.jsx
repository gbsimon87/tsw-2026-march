import { forwardRef } from 'react';

function buildCloudinarySrcSet(url, widths) {
  if (!url || typeof url !== 'string') return null;
  if (!url.includes('res.cloudinary.com')) return null;

  const parts = url.split('/upload/');
  if (parts.length !== 2) return null;

  const base = parts[0];
  const path = parts[1];

  const srcSet = widths
    .map((w) => {
      const transformed = `${base}/upload/f_auto,q_auto,w_${w},c_limit/${path}`;
      return `${transformed} ${w}w`;
    })
    .join(', ');

  return srcSet || null;
}

const CloudinaryImage = forwardRef(
  (
    {
      src,
      alt = '',
      width,
      height,
      srcSetWidths,
      sizes,
      loading = 'lazy',
      decoding = 'async',
      className,
      style,
      ...rest
    },
    ref
  ) => {
    const srcSet = srcSetWidths ? buildCloudinarySrcSet(src, srcSetWidths) : null;

    return (
      <img
        ref={ref}
        src={src}
        alt={alt}
        width={width}
        height={height}
        srcSet={srcSet}
        sizes={sizes}
        loading={loading}
        decoding={decoding}
        className={className}
        style={style}
        {...rest}
      />
    );
  }
);

CloudinaryImage.displayName = 'CloudinaryImage';

export { CloudinaryImage };
export default CloudinaryImage;
