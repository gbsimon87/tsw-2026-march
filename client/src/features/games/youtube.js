function extractYouTubeVideoId(videoUrl) {
  if (!videoUrl) {
    return null;
  }

  try {
    const url = new URL(videoUrl);
    const host = url.hostname.toLowerCase();

    if (host === 'youtu.be' || host === 'www.youtu.be') {
      return url.pathname.split('/').filter(Boolean)[0] || null;
    }

    if (host === 'youtube.com' || host === 'www.youtube.com' || host === 'm.youtube.com') {
      if (url.pathname === '/watch') {
        return url.searchParams.get('v');
      }

      if (url.pathname.startsWith('/embed/') || url.pathname.startsWith('/shorts/')) {
        return url.pathname.split('/').filter(Boolean)[1] || null;
      }
    }
  } catch {
    return null;
  }

  return null;
}

function buildYouTubeEmbedUrl(videoUrl) {
  const videoId = extractYouTubeVideoId(videoUrl);
  if (!videoId) {
    return null;
  }

  return `https://www.youtube.com/embed/${videoId}`;
}

export { buildYouTubeEmbedUrl, extractYouTubeVideoId };
