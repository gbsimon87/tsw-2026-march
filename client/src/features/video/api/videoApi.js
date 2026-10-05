import { apiClient } from '../../../lib/apiClient';
const path = (gameId) => `/games/${encodeURIComponent(gameId)}/video`;
export const videoApi = {
  createUpload(gameId, { sizeBytes, mimeType, sameRecording = false }) {
    return apiClient.post(`${path(gameId)}/uploads`, { sizeBytes, mimeType, sameRecording });
  },
  cancelUpload(gameId, attemptId) {
    return apiClient.delete(`${path(gameId)}/uploads/${encodeURIComponent(attemptId)}`);
  },
  remove(gameId) {
    return apiClient.delete(path(gameId));
  },
  getPlayback(gameId, eventId = null) {
    return apiClient.get(
      `${path(gameId)}/playback${eventId ? `?eventId=${encodeURIComponent(eventId)}` : ''}`
    );
  },
};
