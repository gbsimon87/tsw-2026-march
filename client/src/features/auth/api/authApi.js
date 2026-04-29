import { apiClient } from '../../../lib/apiClient';

export const authApi = {
  register(payload) {
    return apiClient.post('/auth/register', payload);
  },
  login(payload) {
    return apiClient.post('/auth/login', payload);
  },
  logout() {
    return apiClient.post('/auth/logout');
  },
  refresh() {
    return apiClient.post('/auth/refresh');
  },
  me() {
    return apiClient.get('/auth/me');
  },
  requestVerification(payload) {
    return apiClient.post('/auth/request-verification', payload);
  },
  verifyEmail(payload) {
    return apiClient.post('/auth/verify-email', payload);
  },
  forgotPassword(payload) {
    return apiClient.post('/auth/forgot-password', payload);
  },
  resetPassword(payload) {
    return apiClient.post('/auth/reset-password', payload);
  },
  googleExchange(token) {
    return apiClient.post('/auth/google/exchange', { token });
  },
};
