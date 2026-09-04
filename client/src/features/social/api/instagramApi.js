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
  refreshToken() {
    return apiClient.post('/social/instagram/token/refresh');
  },
  disconnect() {
    return apiClient.delete('/social/instagram/connection');
  },
  listPosts() {
    return apiClient.get('/social/instagram/posts');
  },
  createPost(formData) {
    return apiClient.postFormData('/social/instagram/posts', formData);
  },
  markPostReady(postId) {
    return apiClient.post(`/social/instagram/posts/${postId}/ready`);
  },
  approvePost(postId) {
    return apiClient.post(`/social/instagram/posts/${postId}/approve`);
  },
  queuePost(postId) {
    return apiClient.post(`/social/instagram/posts/${postId}/queue`);
  },
  cancelPost(postId) {
    return apiClient.post(`/social/instagram/posts/${postId}/cancel`);
  },
};
