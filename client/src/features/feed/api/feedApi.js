import { apiClient } from '../../../lib/apiClient';

export const feedApi = {
  listFeed({ cursor, limit } = {}) {
    const searchParams = new URLSearchParams();
    if (cursor) {
      searchParams.set('cursor', cursor);
    }
    if (limit) {
      searchParams.set('limit', String(limit));
    }

    const suffix = searchParams.toString() ? `?${searchParams.toString()}` : '';
    return apiClient.get(`/feed${suffix}`);
  },
  createImagePost(formData) {
    return apiClient.postFormData('/feed/image', formData);
  },
  createVideoPost(formData, onProgress) {
    return apiClient.postFormDataWithProgress('/feed/video', formData, onProgress);
  },
  createGameCardPost(payload) {
    return apiClient.post('/feed/game-card', payload);
  },
  createPlayerCardPost(payload) {
    return apiClient.post('/feed/player-card', payload);
  },
  createTeamCardPost(payload) {
    return apiClient.post('/feed/team-card', payload);
  },
  deletePost(postId) {
    return apiClient.delete(`/feed/${postId}`);
  },
  listShareableGames(q) {
    const suffix = q ? `?q=${encodeURIComponent(q)}` : '';
    return apiClient.get(`/feed/shareable/games${suffix}`);
  },
  listShareablePlayers(q) {
    const suffix = q ? `?q=${encodeURIComponent(q)}` : '';
    return apiClient.get(`/feed/shareable/players${suffix}`);
  },
  listShareableTeams(q) {
    const suffix = q ? `?q=${encodeURIComponent(q)}` : '';
    return apiClient.get(`/feed/shareable/teams${suffix}`);
  },
};
