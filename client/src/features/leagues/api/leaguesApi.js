import { apiClient } from '../../../lib/apiClient';

export const leaguesApi = {
  list() {
    return apiClient.get('/leagues');
  },
  listPublic() {
    return apiClient.get('/public/leagues');
  },
  create(payload) {
    return apiClient.post('/leagues', payload);
  },
  getById(leagueId) {
    return apiClient.get(`/leagues/${leagueId}`);
  },
  update(leagueId, payload) {
    return apiClient.patch(`/leagues/${leagueId}`, payload);
  },
  archive(leagueId) {
    return apiClient.post(`/leagues/${leagueId}/archive`);
  },
  listTeams(leagueId) {
    return apiClient.get(`/leagues/${leagueId}/teams`);
  },
  createTeam(leagueId, payload) {
    return apiClient.post(`/leagues/${leagueId}/teams`, payload);
  },
  getTeam(leagueId, leagueTeamId) {
    return apiClient.get(`/leagues/${leagueId}/teams/${leagueTeamId}`);
  },
  updateTeam(leagueId, leagueTeamId, payload) {
    return apiClient.patch(`/leagues/${leagueId}/teams/${leagueTeamId}`, payload);
  },
  uploadLogo(leagueId, formData) {
    return apiClient.postFormData(`/leagues/${leagueId}/logo`, formData);
  },
  removeLogo(leagueId) {
    return apiClient.delete(`/leagues/${leagueId}/logo`);
  },
  uploadTeamLogo(leagueId, leagueTeamId, formData) {
    return apiClient.postFormData(`/leagues/${leagueId}/teams/${leagueTeamId}/logo`, formData);
  },
  removeTeamLogo(leagueId, leagueTeamId) {
    return apiClient.delete(`/leagues/${leagueId}/teams/${leagueTeamId}/logo`);
  },
  addPlayer(leagueId, leagueTeamId, payload) {
    return apiClient.post(`/leagues/${leagueId}/teams/${leagueTeamId}/players`, payload);
  },
  updatePlayer(leagueId, leagueTeamId, leaguePlayerId, payload) {
    return apiClient.patch(
      `/leagues/${leagueId}/teams/${leagueTeamId}/players/${leaguePlayerId}`,
      payload
    );
  },
  removePlayer(leagueId, leagueTeamId, leaguePlayerId) {
    return apiClient.delete(`/leagues/${leagueId}/teams/${leagueTeamId}/players/${leaguePlayerId}`);
  },
  unclaimPlayer(leagueId, leagueTeamId, leaguePlayerId) {
    return apiClient.post(
      `/leagues/${leagueId}/teams/${leagueTeamId}/players/${leaguePlayerId}/unclaim`
    );
  },
  listMembers(leagueId, leagueTeamId) {
    return apiClient.get(`/leagues/${leagueId}/teams/${leagueTeamId}/members`);
  },
  addManager(leagueId, leagueTeamId, email) {
    return apiClient.post(`/leagues/${leagueId}/teams/${leagueTeamId}/managers`, { email });
  },
  removeMember(leagueId, leagueTeamId, memberId) {
    return apiClient.delete(`/leagues/${leagueId}/teams/${leagueTeamId}/members/${memberId}`);
  },
  listJoinRequests(leagueId, leagueTeamId) {
    return apiClient.get(`/leagues/${leagueId}/teams/${leagueTeamId}/join-requests`);
  },
  createJoinRequest(leagueId, leagueTeamId, payload) {
    return apiClient.post(`/leagues/${leagueId}/teams/${leagueTeamId}/join-requests`, payload);
  },
  approveJoinRequest(leagueId, leagueTeamId, requestId) {
    return apiClient.post(
      `/leagues/${leagueId}/teams/${leagueTeamId}/join-requests/${requestId}/approve`
    );
  },
  rejectJoinRequest(leagueId, leagueTeamId, requestId) {
    return apiClient.post(
      `/leagues/${leagueId}/teams/${leagueTeamId}/join-requests/${requestId}/reject`
    );
  },
  cancelJoinRequest(leagueId, leagueTeamId, requestId) {
    return apiClient.post(
      `/leagues/${leagueId}/teams/${leagueTeamId}/join-requests/${requestId}/cancel`
    );
  },
  getStandings(leagueId) {
    return apiClient.get(`/leagues/${leagueId}/standings`);
  },
  getGames(leagueId) {
    return apiClient.get(`/leagues/${leagueId}/games`);
  },
  getPublicBySlug(leagueSlug) {
    return apiClient.get(`/public/leagues/${leagueSlug}`);
  },
  getPublicStandings(leagueSlug) {
    return apiClient.get(`/public/leagues/${leagueSlug}/standings`);
  },
  getPublicGames(leagueSlug) {
    return apiClient.get(`/public/leagues/${leagueSlug}/games`);
  },
  getPublicTeam(leagueSlug, teamSlug) {
    return apiClient.get(`/public/leagues/${leagueSlug}/teams/${teamSlug}`);
  },
  getPublicPlayer(leagueSlug, teamSlug, leaguePlayerId) {
    return apiClient.get(
      `/public/leagues/${leagueSlug}/teams/${teamSlug}/players/${leaguePlayerId}`
    );
  },
};
