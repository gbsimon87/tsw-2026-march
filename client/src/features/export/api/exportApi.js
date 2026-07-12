import { apiClient } from '../../../lib/apiClient';

// CSV export endpoints. Each returns { blob, filename } from apiClient.getBlob.
export const exportApi = {
  getMySportyCsv() {
    return apiClient.getBlob('/export/my-sporty');
  },
  getLeagueCsv(leagueId, seasonId, dataset = 'all') {
    const query = dataset ? `?dataset=${encodeURIComponent(dataset)}` : '';
    return apiClient.getBlob(`/export/leagues/${leagueId}/season/${seasonId}${query}`);
  },
  getTeamCsv(leagueId, leagueTeamId, seasonId) {
    return apiClient.getBlob(
      `/export/leagues/${leagueId}/teams/${leagueTeamId}/season/${seasonId}`
    );
  },
};
