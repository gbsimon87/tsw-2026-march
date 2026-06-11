const YOUTUBE_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

function extractYouTubeVideoId(videoUrl) {
  if (!videoUrl) {
    return null;
  }

  try {
    const url = new URL(videoUrl);
    const host = url.hostname.toLowerCase();
    let id = null;

    if (host === 'youtu.be' || host === 'www.youtu.be') {
      id = url.pathname.split('/').filter(Boolean)[0] || null;
    } else if (host === 'youtube.com' || host === 'www.youtube.com' || host === 'm.youtube.com') {
      if (url.pathname === '/watch') {
        id = url.searchParams.get('v');
      } else if (url.pathname.startsWith('/embed/') || url.pathname.startsWith('/shorts/')) {
        id = url.pathname.split('/').filter(Boolean)[1] || null;
      }
    }

    return id && YOUTUBE_ID_RE.test(id) ? id : null;
  } catch {
    return null;
  }
}

function buildYouTubeEmbedUrl(videoUrl) {
  const videoId = extractYouTubeVideoId(videoUrl);
  if (!videoId) {
    return null;
  }

  return `https://www.youtube.com/embed/${videoId}`;
}

export { buildYouTubeEmbedUrl, extractYouTubeVideoId };
