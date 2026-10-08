import { apiClient } from '../../../lib/apiClient';
const path = (id) => `/scrimmages/${id}`;
const week = (id, sessionId) => `${path(id)}/sessions/${sessionId}`;
export const scrimmagesApi = {
  list: () => apiClient.get('/scrimmages'),
  managed: () => apiClient.get('/scrimmages/managed'),
  profiles: () => apiClient.get('/scrimmages/my-profiles'),
  create: (payload) => apiClient.post('/scrimmages', payload),
  detail: (id, seasonId) => apiClient.get(`${path(id)}${seasonId ? `?seasonId=${seasonId}` : ''}`),
  player: (id, playerId, filters = {}) => {
    const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
    return apiClient.get(`${path(id)}/players/${playerId}${query.size ? `?${query}` : ''}`);
  },
  update: (id, payload) => apiClient.patch(path(id), payload),
  addPlayer: (id, payload) => apiClient.post(`${path(id)}/players`, payload),
  updatePlayer: (id, playerId, payload) =>
    apiClient.patch(`${path(id)}/players/${playerId}`, payload),
  mergePlayers: (id, playerId, payload) =>
    apiClient.post(`${path(id)}/players/${playerId}/merge`, payload),
  importOptions: (id) => apiClient.get(`${path(id)}/import-options`),
  createSession: (id, payload) => apiClient.post(`${path(id)}/sessions`, payload),
  session: (id, sessionId) => apiClient.get(week(id, sessionId)),
  assignments: (id, sessionId, assignments) =>
    apiClient.patch(`${week(id, sessionId)}/assignments`, { assignments }),
  finishSession: (id, sessionId) => apiClient.post(`${week(id, sessionId)}/finish`, {}),
  publishSession: (id, sessionId) => apiClient.post(`${week(id, sessionId)}/publish`, {}),
  resetSeason: (id, payload) => apiClient.post(`${path(id)}/seasons`, payload),
  join: (id, payload) => apiClient.post(`${path(id)}/join`, payload),
  acceptTerms: (id, sessionId, payload) => apiClient.post(`${week(id, sessionId)}/terms`, payload),
  requests: (id) => apiClient.get(`${path(id)}/join-requests`),
  review: (id, requestId, status) =>
    apiClient.patch(`${path(id)}/join-requests/${requestId}`, { status }),
  newGame: (id, sessionId, payload) => apiClient.post(`${week(id, sessionId)}/games`, payload),
};
