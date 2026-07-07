/**
 * Cloudinary delivery-URL transformer (OPT-002).
 *
 * Assets are uploaded and stored raw; this rewrites delivery URLs at
 * serialization time to add format/quality auto-optimisation (and optional
 * width-limiting) so every client receives WebP/AVIF at tuned quality with no
 * client change. Typical savings: 40–80% bytes per image.
 *
 * SAFETY: only Cloudinary `/…/upload/` delivery URLs are rewritten. Any other
 * URL (non-Cloudinary host, already-transformed URL, data URI, null) is
 * returned unchanged, so this is safe to apply blindly in sanitizers.
 */

// Matches the delivery segment of a Cloudinary URL:
//   https://res.cloudinary.com/<cloud>/<image|video>/upload/<...rest>
// Group 1 = everything up to and including `/upload/`.
const CLOUDINARY_UPLOAD_RE = /^(https?:\/\/res\.cloudinary\.com\/[^/]+\/[^/]+\/upload\/)(.*)$/i;

// A transformation segment is the path component immediately after `/upload/`
// that contains transformation params (comma-separated `k_v` tokens, e.g.
// `f_auto,q_auto,w_480`). Version (`v123…`) and the public id are not that.
function looksLikeTransformation(segment) {
  if (!segment) return false;
  // A version segment is `v` followed by digits only.
  if (/^v\d+$/.test(segment)) return false;
  // Transformation tokens look like `xx_yy` (or chained with `.`), separated by
  // commas. Require at least one `_` to avoid treating a bare public id folder
  // as a transformation.
  return segment.split(',').every((token) => /^[a-z]+_[^,]+$/i.test(token));
}

/**
 * Rewrite a Cloudinary delivery URL to include `f_auto,q_auto` (+ optional
 * width limit). Non-Cloudinary or already-transformed URLs pass through.
 *
 * @param {string|null|undefined} url
 * @param {{ w?: number }} [opts]  optional max width (adds `w_<w>,c_limit`)
 * @returns {string|null} transformed URL, or the original value if not eligible
 */
function transformCloudinaryUrl(url, opts = {}) {
  if (typeof url !== 'string' || !url) {
    return null;
  }

  const match = url.match(CLOUDINARY_UPLOAD_RE);
  if (!match) {
    return url; // not a Cloudinary upload URL — leave untouched
  }

  const [, prefix, rest] = match;
  const firstSegment = rest.split('/')[0];

  // Already transformed (first segment after /upload/ is a transformation) —
  // don't double-apply.
  if (looksLikeTransformation(firstSegment)) {
    return url;
  }

  const params = ['f_auto', 'q_auto'];
  if (Number.isInteger(opts.w) && opts.w > 0) {
    params.push(`w_${opts.w}`, 'c_limit');
  }

  return `${prefix}${params.join(',')}/${rest}`;
}

/**
 * Build a responsive `srcset` string from a Cloudinary URL and a list of
 * width buckets, e.g.
 *   buildCloudinarySrcSet(url, [480, 800, 1200])
 *   → "<url w_480> 480w, <url w_800> 800w, <url w_1200> 1200w"
 * Returns null when the URL is not an eligible Cloudinary upload URL.
 *
 * @param {string|null|undefined} url
 * @param {number[]} widths
 * @returns {string|null}
 */
function buildCloudinarySrcSet(url, widths) {
  if (typeof url !== 'string' || !url.match(CLOUDINARY_UPLOAD_RE) || !Array.isArray(widths)) {
    return null;
  }

  const entries = widths
    .filter((w) => Number.isInteger(w) && w > 0)
    .map((w) => `${transformCloudinaryUrl(url, { w })} ${w}w`);

  return entries.length ? entries.join(', ') : null;
}

module.exports = {
  transformCloudinaryUrl,
  buildCloudinarySrcSet,
};
