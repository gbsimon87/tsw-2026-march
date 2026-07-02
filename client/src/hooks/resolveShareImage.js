const DEFAULT_SHARE_IMAGE = '/web-app-manifest-512x512.png';

export function resolveShareImage(url) {
  if (!url) {
    return `${window.location.origin}${DEFAULT_SHARE_IMAGE}`;
  }

  if (/^https?:\/\//.test(url)) {
    return url;
  }

  return `${window.location.origin}${url}`;
}
