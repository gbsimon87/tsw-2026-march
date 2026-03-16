import { env } from './env';

function readCookie(name) {
  const all = document.cookie.split(';').map((entry) => entry.trim());
  const target = all.find((entry) => entry.startsWith(`${name}=`));
  return target ? decodeURIComponent(target.split('=')[1]) : null;
}

async function request(path, options = {}) {
  const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(
    (options.method || 'GET').toUpperCase()
  );
  const isFormDataBody = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers = {
    ...(options.headers || {}),
  };

  if (!isFormDataBody && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  if (isMutation) {
    const csrfToken = readCookie('XSRF-TOKEN');
    if (csrfToken) {
      headers['x-csrf-token'] = csrfToken;
    }
  }

  const response = await fetch(`${env.apiBaseUrl}${path}`, {
    credentials: 'include',
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data?.error?.message || 'Request failed';
    const error = new Error(message);
    error.details = data?.error?.details || null;
    error.requestId = data?.error?.requestId || null;
    throw error;
  }

  return data;
}

export const apiClient = {
  get(path) {
    return request(path);
  },
  post(path, body) {
    return request(path, {
      method: 'POST',
      body: JSON.stringify(body || {}),
    });
  },
  postFormData(path, formData) {
    return request(path, {
      method: 'POST',
      body: formData,
    });
  },
  put(path, body) {
    return request(path, {
      method: 'PUT',
      body: JSON.stringify(body || {}),
    });
  },
  patch(path, body) {
    return request(path, {
      method: 'PATCH',
      body: JSON.stringify(body || {}),
    });
  },
  delete(path, body) {
    return request(path, {
      method: 'DELETE',
      body: JSON.stringify(body || {}),
    });
  },
};
