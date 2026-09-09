const TOKEN_KEY = "medikiosk_token";

export function getApiBase() {
  const raw = import.meta.env.VITE_API_URL;
  if (typeof raw === "string" && raw.trim()) {
    return raw.replace(/\/$/, "");
  }
  return "/api";
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

let unauthorizedHandler = null;

/** Called once when the server rejects a stored token, so the app can sign out. */
export function onUnauthorized(handler) {
  unauthorizedHandler = handler;
  return () => {
    if (unauthorizedHandler === handler) unauthorizedHandler = null;
  };
}

export class ApiRequestError extends Error {
  constructor(message, { status = 0, code = "api_error" } = {}) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
  }
}

export function toUserMessage(error) {
  if (error instanceof ApiRequestError) {
    if (error.code === "network") {
      return "Unable to connect to the server.";
    }
    return error.message || "Unable to load your health information. Please try again.";
  }
  if (error?.message) return error.message;
  return "Unable to load your health information. Please try again.";
}

export async function request(path, options = {}) {
  const {
    method = "GET",
    body,
    token = getToken(),
    headers = {},
    isForm = false,
  } = options;

  const requestHeaders = { ...headers };
  if (!isForm && body !== undefined) {
    requestHeaders["Content-Type"] = "application/json";
  }
  if (token) {
    requestHeaders.Authorization = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(`${getApiBase()}${path}`, {
      method,
      headers: requestHeaders,
      body: isForm ? body : body !== undefined ? JSON.stringify(body) : undefined,
      credentials: "include",
    });
  } catch {
    throw new ApiRequestError("Unable to connect to the server.", {
      status: 0,
      code: "network",
    });
  }

  let payload = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: text };
    }
  }

  if (response.status === 401) {
    // Only an already-stored token can go stale; a failed login attempt
    // should not wipe the session of whoever is signed in.
    if (token && token === getToken()) {
      setToken(null);
      unauthorizedHandler?.();
    }
    throw new ApiRequestError(payload?.message || "Please log in again.", {
      status: 401,
      code: "unauthorized",
    });
  }

  if (!response.ok || payload?.success === false) {
    throw new ApiRequestError(
      payload?.message || "Unable to load your health information. Please try again.",
      { status: response.status },
    );
  }

  return payload;
}

export const api = {
  get: (path, options) => request(path, { ...options, method: "GET" }),
  post: (path, body, options) => request(path, { ...options, method: "POST", body }),
  put: (path, body, options) => request(path, { ...options, method: "PUT", body }),
  patch: (path, body, options) => request(path, { ...options, method: "PATCH", body }),
  delete: (path, options) => request(path, { ...options, method: "DELETE" }),
};
