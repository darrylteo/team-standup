import { useCallback, useEffect, useRef, useState } from "react";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// Local dev lets you act as any teammate, and so does the trial site while the Worker's TRIAL_SWITCHER is on. The
// Worker ignores this header everywhere else.
export const DEV_USER_KEY = "standup.devUser";
const SWITCHER_KEY = "standup.switcher";
export function devUser(): string | null {
  try {
    if (!import.meta.env.DEV && !import.meta.env.VITE_DEMO && localStorage.getItem(SWITCHER_KEY) !== "on") return null;
    return localStorage.getItem(DEV_USER_KEY);
  } catch {
    return null;
  }
}
/** Remember whether the Worker offers the switcher, so the header goes out from the first request after a reload. */
export function rememberSwitcher(on: boolean) {
  try {
    if (on) localStorage.setItem(SWITCHER_KEY, "on");
    else if (localStorage.getItem(SWITCHER_KEY)) {
      localStorage.removeItem(SWITCHER_KEY);
      if (!import.meta.env.DEV) localStorage.removeItem(DEV_USER_KEY);
    }
  } catch {
    /* private mode: the switcher just won't be remembered */
  }
}

// Account-level routes are global; everything else belongs to the project picked in the switcher.
const GLOBAL = /^\/(session|projects|account|avatars|health|export)(\/|\?|$)/;
let currentProject: number | null = null;
export const setProject = (id: number | null) => {
  currentProject = id;
};
/** "/updates" → "/api/p/3/updates"; "/session" stays "/api/session". */
function apiUrl(path: string): string {
  if (GLOBAL.test(path) || currentProject === null) return `/api${path}`;
  return `/api/p/${currentProject}${path}`;
}

function headersFor(extra: Record<string, string> = {}): Record<string, string> {
  const dev = devUser();
  return dev ? { ...extra, "x-dev-user": dev } : extra;
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers = headersFor({ "content-type": "application/json" });
  const res = await fetch(apiUrl(path), {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

// Polls pause after 10 minutes with no mouse, touch or key input, so a Board left open on a spare screen doesn't use
// up the free plan's 100k daily requests (an always-polling Board makes about 40k a day). The first input refreshes.
const IDLE_MS = 10 * 60_000;
let lastInput = Date.now();
const wakers = new Set<() => void>();
const noteInput = () => {
  const wasIdle = Date.now() - lastInput > IDLE_MS;
  lastInput = Date.now();
  if (wasIdle) wakers.forEach((wake) => wake());
};
for (const ev of ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"]) window.addEventListener(ev, noteInput, { passive: true });
document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && noteInput());

/**
 * Fetch on mount and whenever `path` changes; optionally re-poll. Keeps the last good data while refreshing.
 * `idleMs` keeps polling while the person is idle, at most that often (pass `pollMs` itself during a live meeting).
 */
export function useApi<T>(path: string | null, pollMs?: number, { idleMs }: { idleMs?: number } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const live = useRef(path);
  live.current = path;

  const reload = useCallback(async () => {
    if (!path) return;
    try {
      const d = await api<T>(path);
      if (live.current === path) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      if (live.current === path) setError((e as Error).message);
    }
  }, [path]);

  useEffect(() => {
    setData(null);
    void reload();
  }, [reload]);

  // A separate effect, so changing the poll rate (e.g. when a meeting goes live) keeps the data on screen.
  useEffect(() => {
    if (!pollMs) return;
    let last = Date.now();
    const poll = () => {
      last = Date.now();
      void reload();
    };
    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const idle = Date.now() - lastInput > IDLE_MS;
      if (!idle || (idleMs && Date.now() - last >= idleMs - 100)) poll();
    }, pollMs);
    wakers.add(poll);
    return () => {
      clearInterval(t);
      wakers.delete(poll);
    };
  }, [reload, pollMs, idleMs]);

  return { data, error, reload, setData };
}

/** PUT raw bytes (used for avatar photos). */
export async function apiUpload<T>(path: string, body: Blob): Promise<T> {
  const res = await fetch(apiUrl(path), { method: "PUT", headers: headersFor({ "content-type": body.type || "application/octet-stream" }), body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? `Upload failed (${res.status})`);
  return data as T;
}

/** Download a JSON export as a file (fetch first so the dev identity header goes along). */
export async function download(path: string, fallbackName: string) {
  const res = await fetch(apiUrl(path), { headers: headersFor() });
  if (!res.ok) throw new ApiError(res.status, "Export failed");
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = res.headers.get("content-disposition")?.match(/filename="(.+)"/)?.[1] ?? fallbackName;
  a.click();
  URL.revokeObjectURL(url);
}
