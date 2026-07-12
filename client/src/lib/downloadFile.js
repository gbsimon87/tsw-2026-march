// Trigger a browser download for an in-memory Blob. Mirrors the object-URL →
// anchor → click → revoke pattern in features/feed/hooks/useShareImage.js.
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename || 'download';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
