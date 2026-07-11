import { apiClient } from '../../../lib/apiClient';

export const followsApi = {
  follow(userId) {
    return apiClient.post(`/follows/users/${userId}`);
  },
  unfollow(userId) {
    return apiClient.delete(`/follows/users/${userId}`);
  },
  listFollowing() {
    return apiClient.get('/follows/following');
  },
  getStatuses(userIds) {
    const ids = (userIds || []).filter(Boolean).join(',');
    return apiClient.get(`/follows/status?userIds=${encodeURIComponent(ids)}`);
  },
};
