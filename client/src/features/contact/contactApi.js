import { apiClient } from '../../lib/apiClient';

export const contactApi = {
  submit(payload) {
    return apiClient.post('/contact', payload);
  },
};
