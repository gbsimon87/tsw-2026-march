import { apiClient } from '../../../lib/apiClient';

export const instagramApi = {
  getStatus() {
    return apiClient.get('/social/instagram/status');
  },
  startOAuth() {
    return apiClient.post('/social/instagram/oauth/start');
  },
  verify() {
    return apiClient.post('/social/instagram/verify');
  },
  disconnect() {
    return apiClient.delete('/social/instagram/connection');
  },
};
