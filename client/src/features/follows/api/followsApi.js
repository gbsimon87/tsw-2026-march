import { apiClient } from '../../../lib/apiClient';

export const followsApi = {
  follow(targetType, targetId) {
    return apiClient.post(`/follows/${targetType}/${targetId}`);
  },
  unfollow(targetType, targetId) {
    return apiClient.delete(`/follows/${targetType}/${targetId}`);
  },
  listFollowing(targetType) {
    const query = targetType ? `?targetType=${encodeURIComponent(targetType)}` : '';
    return apiClient.get(`/follows/following${query}`);
  },
  getStatuses(targetType, targetIds) {
    const ids = (targetIds || []).filter(Boolean).join(',');
    return apiClient.get(
      `/follows/status?targetType=${encodeURIComponent(targetType)}&targetIds=${encodeURIComponent(ids)}`
    );
  },
};
