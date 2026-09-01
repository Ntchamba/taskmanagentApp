const TOKEN_KEY = "tm_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

/**
 * Thin fetch wrapper for the JSON API.
 * Adds the bearer token, parses JSON, and throws Error(message) on failure.
 * A 401 on a non-auth route clears the token and bounces to the login page.
 */
export async function api(path, { method = "GET", body } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null;

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (res.status === 401 && !path.startsWith("/auth/")) {
      clearToken();
      window.location.href = "/index.html";
    }
    throw new Error(data.error || `Request failed (${res.status})`);
  }

  return data;
}
