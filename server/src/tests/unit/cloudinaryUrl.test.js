const {
  transformCloudinaryUrl,
  buildCloudinarySrcSet,
} = require('../../modules/shared/cloudinaryUrl');

const BASE = 'https://res.cloudinary.com/demo/image/upload/v1699999999/tsw/feed/logo.png';

describe('transformCloudinaryUrl', () => {
  it('injects f_auto,q_auto into a raw Cloudinary upload URL', () => {
    expect(transformCloudinaryUrl(BASE)).toBe(
      'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto/v1699999999/tsw/feed/logo.png'
    );
  });

  it('adds a width limit when w is provided', () => {
    expect(transformCloudinaryUrl(BASE, { w: 160 })).toBe(
      'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_160,c_limit/v1699999999/tsw/feed/logo.png'
    );
  });

  it('handles video delivery URLs', () => {
    const video = 'https://res.cloudinary.com/demo/video/upload/v1/tsw/feed/clip.mp4';
    expect(transformCloudinaryUrl(video)).toBe(
      'https://res.cloudinary.com/demo/video/upload/f_auto,q_auto/v1/tsw/feed/clip.mp4'
    );
  });

  it('does not double-apply to an already-transformed URL', () => {
    const already =
      'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto/v1/tsw/feed/logo.png';
    expect(transformCloudinaryUrl(already)).toBe(already);
  });

  it('leaves non-Cloudinary URLs untouched', () => {
    const other = 'https://example.com/image.png';
    expect(transformCloudinaryUrl(other)).toBe(other);
  });

  it('returns null for nullish input', () => {
    expect(transformCloudinaryUrl(null)).toBeNull();
    expect(transformCloudinaryUrl(undefined)).toBeNull();
    expect(transformCloudinaryUrl('')).toBeNull();
  });

  it('ignores non-integer / non-positive widths', () => {
    expect(transformCloudinaryUrl(BASE, { w: 0 })).toBe(
      'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto/v1699999999/tsw/feed/logo.png'
    );
    expect(transformCloudinaryUrl(BASE, { w: 1.5 })).toBe(
      'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto/v1699999999/tsw/feed/logo.png'
    );
  });
});

describe('buildCloudinarySrcSet', () => {
  it('builds a srcset across width buckets', () => {
    expect(buildCloudinarySrcSet(BASE, [80, 160])).toBe(
      'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_80,c_limit/v1699999999/tsw/feed/logo.png 80w, ' +
        'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_160,c_limit/v1699999999/tsw/feed/logo.png 160w'
    );
  });

  it('returns null for non-Cloudinary URLs', () => {
    expect(buildCloudinarySrcSet('https://example.com/x.png', [80])).toBeNull();
  });
});
