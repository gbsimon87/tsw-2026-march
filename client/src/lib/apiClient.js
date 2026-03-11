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
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

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
    throw new Error(message);
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
