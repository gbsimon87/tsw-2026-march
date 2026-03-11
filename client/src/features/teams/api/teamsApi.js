import { apiClient } from '../../../lib/apiClient';

export const teamsApi = {
  list() {
    return apiClient.get('/teams');
  },
  getById(teamId) {
    return apiClient.get(`/teams/${teamId}`);
  },
  create(payload) {
    return apiClient.post('/teams', payload);
  },
  addPlayer(teamId, payload) {
    return apiClient.post(`/teams/${teamId}/players`, payload);
  },
  updatePlayer(teamId, playerId, payload) {
    return apiClient.patch(`/teams/${teamId}/players/${playerId}`, payload);
  },
  removePlayer(teamId, playerId) {
    return apiClient.delete(`/teams/${teamId}/players/${playerId}`);
  },
};
