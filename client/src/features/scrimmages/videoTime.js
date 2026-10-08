import { extractYouTubeVideoId } from '../games/youtube';

export function parseVideoTime(value) {
  const text = String(value).trim();
  if (!/^\d+(?::\d{1,2}){0,2}(?:\.\d+)?$/.test(text)) return null;
  const parts = text.split(':').map(Number);
  if (parts.length > 1 && parts.slice(1).some((part) => part >= 60)) return null;
  const seconds = parts.reduce((total, part) => total * 60 + part, 0);
  return seconds <= 86400 ? seconds : null;
}

export function formatVideoTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  const remainder = Number((seconds % 60).toFixed(3));
  const tail = String(remainder).padStart(remainder < 10 ? String(remainder).length + 1 : 2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${tail}` : `${minutes}:${tail}`;
}

export function gameVideoLink(videoUrl, seconds) {
  const id = extractYouTubeVideoId(videoUrl);
  return id ? `https://www.youtube.com/watch?v=${id}&t=${Math.floor(seconds || 0)}s` : null;
}
