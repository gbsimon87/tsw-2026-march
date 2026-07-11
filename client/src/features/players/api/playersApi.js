import { apiClient } from '../../../lib/apiClient';

export const playersApi = {
  getPublicUserProfiles(userId) {
    return apiClient.get(`/public/players/${userId}`);
  },
};
