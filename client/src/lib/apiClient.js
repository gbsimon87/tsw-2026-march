import { env } from './env';

let csrfToken =
  document.cookie
    .split('; ')
    .find((row) => row.startsWith('XSRF-TOKEN='))
    ?.split('=')[1] ?? null;
let refreshPromise = null;

// Bare fetch() never times out on its own — a stalled network/backend leaves any
// caller gating UI on the promise's settlement (e.g. GameTrackPage's isSaving)
// permanently disabled with no error. Every request gets an AbortController-based
// ceiling so it always eventually rejects.
const REQUEST_TIMEOUT_MS = 15000;

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Request timed out. Please check your connection and try again.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = fetchWithTimeout(`${env.apiBaseUrl}/auth/refresh`, {
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

  const response = await fetchWithTimeout(`${env.apiBaseUrl}${path}`, {
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
    error.status = response.status;
    error.details = data?.error?.details || null;
    error.requestId = data?.error?.requestId || null;
    throw error;
  }

  return data;
}

// Parse the download filename out of a Content-Disposition header, if present.
function parseContentDispositionFilename(header) {
  if (!header) {
    return null;
  }
  const utf8Match = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(header);
  if (utf8Match) {
    try {
      return decodeURIComponent(utf8Match[1].replace(/^"|"$/g, ''));
    } catch {
      // fall through to the plain filename form
    }
  }
  const match = /filename="?([^";]+)"?/i.exec(header);
  return match ? match[1] : null;
}

async function requestBlob(path, retryState = {}) {
  const response = await fetchWithTimeout(`${env.apiBaseUrl}${path}`, {
    credentials: 'include',
  });

  const nextCsrfToken = response.headers.get('x-csrf-token');
  if (nextCsrfToken) {
    csrfToken = nextCsrfToken;
  }

  if (response.status === 401 && !retryState.didRefresh) {
    try {
      await refreshSession();
      return requestBlob(path, { didRefresh: true });
    } catch {
      // Fall through to the error handling below.
    }
  }

  if (!response.ok) {
    let message = 'Request failed';
    try {
      const data = await response.json();
      message = data?.error?.message || message;
    } catch {
      // non-JSON error body — keep the generic message
    }
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  const blob = await response.blob();
  const filename = parseContentDispositionFilename(response.headers.get('Content-Disposition'));
  return { blob, filename };
}

export const apiClient = {
  get(path) {
    return request(path);
  },
  // Fetch a binary/file response (e.g. a CSV export) as a Blob, reusing the same
  // cookie-auth + 401→refresh→retry-once behaviour as request(). GET only, so no
  // CSRF token is required.
  getBlob(path) {
    return requestBlob(path);
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
