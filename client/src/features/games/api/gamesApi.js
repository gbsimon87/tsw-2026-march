import { apiClient } from '../../../lib/apiClient';

export const gamesApi = {
  create(payload) {
    return apiClient.post('/games', payload);
  },
  list(params = {}) {
    const query = new URLSearchParams();
    if (params.teamId) {
      query.set('teamId', params.teamId);
    }
    if (params.status) {
      query.set('status', params.status);
    }

    const suffix = query.toString() ? `?${query.toString()}` : '';
    return apiClient.get(`/games${suffix}`);
  },
  getById(gameId) {
    return apiClient.get(`/games/${gameId}`);
  },
  appendEvent(gameId, payload) {
    return apiClient.post(`/games/${gameId}/events`, payload);
  },
  setLineup(gameId, playerIds) {
    return apiClient.post(`/games/${gameId}/lineup`, { playerIds });
  },
  removeEvent(gameId, eventId) {
    return apiClient.delete(`/games/${gameId}/events/${eventId}`);
  },
  finish(gameId) {
    return apiClient.post(`/games/${gameId}/finish`);
  },
};
