import { extractYouTubeVideoId } from '../games/youtube';
export function getHostedVideoStatus(game) {
  return game?.video?.provider === 'mux' ? game.video.status : null;
}
export function hasPlayableVideo(game) {
  return getHostedVideoStatus(game) === 'ready' || Boolean(extractYouTubeVideoId(game?.videoUrl));
}
export function isMuxHighlight(highlight) {
  return highlight?.videoProvider === 'mux';
}
export function highlightSourceKey(highlight) {
  return isMuxHighlight(highlight)
    ? `mux:${highlight.gameId}:${highlight.videoVersion ?? ''}`
    : highlight?.videoUrl;
}
export function gameVideoSourceKey(game) {
  return getHostedVideoStatus(game) === 'ready'
    ? `mux:${game.id}:${game.video.version}`
    : (game?.videoUrl ?? 'none');
}
