"use client";

import type { WorkerProfile } from "@/lib/api";

const TOKEN_KEY = "mj_worker_token";
const PROFILE_KEY = "mj_worker_profile";

export function getWorkerToken(): string | null {
  if (typeof window === "undefined") return null;
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1])) as { exp?: number };
    if (payload.exp && payload.exp * 1000 <= Date.now()) {
      clearWorkerSession();
      return null;
    }
  } catch {
    clearWorkerSession();
    return null;
  }
  return token;
}

export function getWorkerProfile(): WorkerProfile | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(PROFILE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as WorkerProfile;
  } catch {
    return null;
  }
}

export function setWorkerSession(token: string, profile: WorkerProfile) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function clearWorkerSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(PROFILE_KEY);
}

/** A random id that stays on this phone. It lets the office spot one phone being used for several people. */
export function getDeviceId(): string {
  try {
    let id = localStorage.getItem("mj_device_id");
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()).replace(/[^A-Za-z0-9_-]/g, "");
      localStorage.setItem("mj_device_id", id);
    }
    return id;
  } catch {
    return "";
  }
}
