import type { LoginResponse, UserInfo } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

const TOKEN_KEY = "mj_pos_token";
const USER_KEY = "mj_pos_user";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  // Fix #5: use localStorage so the token survives tab close / browser
  // restart. The JWT itself is short-lived (480 min) so this is safe.
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): UserInfo | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  return raw ? (JSON.parse(raw) as UserInfo) : null;
}

export function storeSession(data: LoginResponse) {
  localStorage.setItem(TOKEN_KEY, data.access_token);
  localStorage.setItem(USER_KEY, JSON.stringify(data.user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; params?: Record<string, string | number | boolean | undefined> } = {},
): Promise<T> {
  const url = new URL(`${API_BASE}${path}`);
  if (options.params) {
    for (const [k, v] of Object.entries(options.params)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }
  }
  const token = getToken();
  try {
    var res = await fetch(url.toString(), {
      method: options.method ?? "GET",
      headers: {
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Network error - cannot reach server");
  }
  if (res.status === 401 && typeof window !== "undefined" && !path.includes("/auth/login")) {
    clearSession();
    window.location.href = "/login";
    throw new ApiError(401, "Session expired");
  }
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (typeof data.detail === "string") detail = data.detail;
    } catch {
      /* keep default */
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function login(username: string, password: string): Promise<LoginResponse> {
  const form = new URLSearchParams({ username, password });
  const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  if (!res.ok) {
    let detail = "Login failed";
    try {
      const data = await res.json();
      if (typeof data.detail === "string") detail = data.detail;
    } catch {
      /* keep default */
    }
    throw new ApiError(res.status, detail);
  }
  const data = (await res.json()) as LoginResponse;
  storeSession(data);
  return data;
}

/** Upload a file (FormData) using the same auth and base URL as api(). */
export async function apiFormData<T>(
  path: string,
  file: File,
): Promise<T> {
  const fd = new FormData();
  fd.append("file", file);
  const token = getToken();
  try {
    var res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: fd,
    });
  } catch {
    throw new ApiError(0, "Network error - cannot reach server");
  }
  if (res.status === 401 && typeof window !== "undefined") {
    clearSession();
    window.location.href = "/login";
    throw new ApiError(401, "Session expired");
  }
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (typeof data.detail === "string") detail = data.detail;
    } catch {
      /* keep default */
    }
    throw new ApiError(res.status, detail);
  }
  return (await res.json()) as T;
}

/** Download a file (e.g. Excel export) using the same auth and base URL as api(). */
export async function apiDownload(path: string, params?: Record<string, string | number | undefined>): Promise<Blob> {
  const url = new URL(`${API_BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }
  }
  const token = getToken();
  try {
    var res = await fetch(url.toString(), {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
  } catch {
    throw new ApiError(0, "Network error - cannot reach server");
  }
  if (!res.ok) {
    throw new ApiError(res.status, "Download failed");
  }
  return res.blob();
}
