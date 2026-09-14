export const SOCIAL_EXPORT_PRESETS = {
  post: { label: '4:5 post', suffix: 'post', width: 1080, height: 1350 },
  story: {
    label: '9:16 Story / Reel / TikTok',
    suffix: 'story',
    width: 1080,
    height: 1920,
    // Conservative guide for text and logos. Platform UI varies by placement.
    safeArea: { top: 260, right: 160, bottom: 360, left: 100 },
  },
  link: {
    label: 'Link preview image',
    suffix: 'link',
    width: 1200,
    height: 630,
    safeArea: { top: 60, right: 80, bottom: 60, left: 80 },
  },
};

export const SOCIAL_EXPORT_FORMATS = ['post', 'story', 'link'];

export function socialExportPreset(format) {
  return SOCIAL_EXPORT_PRESETS[format] || SOCIAL_EXPORT_PRESETS.post;
}
