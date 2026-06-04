import { env } from './env';

let csrfToken = null;
let refreshPromise = null;

async function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = fetch(`${env.apiBaseUrl}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: csrfToken ? { 'x-csrf-token': csrfToken } : {},
    })
      .then(async (response) => {
        const nextCsrfToken = response.headers.get('x-csrf-token');
        if (nextCsrfToken) {
          csrfToken = nextCsrfToken;
        }

        if (!response.ok) {
          throw new Error('Session refresh failed');
        }
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

async function request(path, options = {}, retryState = {}) {
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

  if (isMutation && csrfToken) {
    headers['x-csrf-token'] = csrfToken;
  }

  const response = await fetch(`${env.apiBaseUrl}${path}`, {
    credentials: 'include',
    ...options,
    headers,
  });

  const nextCsrfToken = response.headers.get('x-csrf-token');
  if (nextCsrfToken) {
    csrfToken = nextCsrfToken;
  }

  const data = await response.json().catch(() => ({}));

  if (
    response.status === 401 &&
    !retryState.didRefresh &&
    !path.startsWith('/auth/login') &&
    !path.startsWith('/auth/register') &&
    !path.startsWith('/auth/refresh') &&
    !path.startsWith('/auth/logout')
  ) {
    try {
      await refreshSession();
      return request(path, options, { didRefresh: true });
    } catch {
      // Fall through to the original unauthorized error handling.
    }
  }

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
  postFormDataWithProgress(path, formData, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.withCredentials = true;
      xhr.open('POST', `${env.apiBaseUrl}${path}`);

      if (csrfToken) {
        xhr.setRequestHeader('x-csrf-token', csrfToken);
      }

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      };

      xhr.onload = () => {
        const nextCsrfToken = xhr.getResponseHeader('x-csrf-token');
        if (nextCsrfToken) {
          csrfToken = nextCsrfToken;
        }
        let data = {};
        try {
          data = JSON.parse(xhr.responseText);
        } catch {
          // non-JSON response body, keep empty data object
        }

        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(data);
        } else {
          let message = data?.error?.message || 'Upload failed';
          if (xhr.status === 401) {
            message = 'Your session expired. Please refresh the page and try again.';
          }
          const error = new Error(message);
          error.details = data?.error?.details || null;
          reject(error);
        }
      };

      xhr.onerror = () => reject(new Error('Upload failed'));
      xhr.onabort = () => reject(new Error('Upload cancelled'));

      xhr.send(formData);
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
