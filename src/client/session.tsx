import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Account, ProjectSummary } from "../shared/types";
import { rememberSwitcher, setProject, useApi } from "./api";

interface SessionResponse {
  account: Account;
  projects: ProjectSummary[];
  today: string;
  /** The trial site lets people act as any teammate; signed_in_as is their own email while they do. */
  switcher?: boolean;
  signed_in_as?: string | null;
}

interface Session extends SessionResponse {
  current: ProjectSummary | null;
  /** Show another project; every page reloads its data for it. */
  switchTo: (id: number) => void;
  reload: () => Promise<void>;
  /** A short message at the bottom of the screen; it outlives switching projects. */
  toast: (msg: string) => void;
}

const SessionContext = createContext<Session | null>(null);
const PROJECT_KEY = "standup.project";
const THEME_KEY = "standup.theme";

/**
 * Light or dark is saved on the person's account, so it follows them to every device (null follows the device).
 * This browser keeps a copy so the first paint already matches, before the account loads.
 */
export function applyMode(theme: "light" | "dark" | null) {
  if (theme) document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
  try {
    if (theme) localStorage.setItem(THEME_KEY, theme);
    else localStorage.removeItem(THEME_KEY);
  } catch {
    /* private mode: the account still has it */
  }
}
try {
  const cached = localStorage.getItem(THEME_KEY);
  if (cached === "light" || cached === "dark") document.documentElement.dataset.theme = cached;
} catch {
  /* private mode */
}

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error("useSession outside SessionProvider");
  return s;
}

function remembered(): number | null {
  try {
    return Number(localStorage.getItem(PROJECT_KEY)) || null;
  } catch {
    return null;
  }
}

/** Each project has its own palette; the light/dark choice stays the viewer's own. */
export function applyTheme(theme: string | null) {
  if (theme && theme !== "terminal") document.documentElement.dataset.palette = theme;
  else delete document.documentElement.dataset.palette;
}

export function SessionProvider({ children, fallback }: { children: ReactNode; fallback: (error: string | null) => ReactNode }) {
  const session = useApi<SessionResponse>("/session", 60_000);
  const [picked, setPicked] = useState<number | null>(remembered);

  const projects = session.data?.projects;
  const current = projects?.find((p) => p.id === picked) ?? projects?.[0] ?? null;
  // Set synchronously so the first requests of the project's pages already go to the right project.
  setProject(current?.id ?? null);

  useEffect(() => applyTheme(current?.theme ?? null), [current?.theme]);
  const mode = session.data?.account.profile.theme;
  useEffect(() => {
    if (mode !== undefined) applyMode(mode);
  }, [mode]);
  const switcher = session.data?.switcher;
  useEffect(() => {
    if (switcher !== undefined) rememberSwitcher(switcher);
  }, [switcher]);
  useEffect(() => {
    document.title = current ? [current.subtitle, current.title].filter(Boolean).join(" · ") : "Standup";
  }, [current?.title, current?.subtitle]);

  const switchTo = useCallback((id: number) => {
    try {
      localStorage.setItem(PROJECT_KEY, String(id));
    } catch {
      /* private mode: the choice just won't be remembered */
    }
    setPicked(id);
  }, []);

  // A toast shows for 3.2 s, then fades out over 0.4 s instead of vanishing.
  const [toastMsg, setToastMsg] = useState<{ msg: string; id: number; out: boolean } | null>(null);
  const toastId = useRef(0);
  const toast = useCallback((msg: string) => {
    const id = ++toastId.current;
    setToastMsg({ msg, id, out: false });
    window.setTimeout(() => setToastMsg((t) => (t?.id === id ? { ...t, out: true } : t)), 3200);
    window.setTimeout(() => setToastMsg((t) => (t?.id === id ? null : t)), 3600);
  }, []);

  // Safety net: any action that fails without its own error handling still tells the person, never silently.
  useEffect(() => {
    const onFail = (e: PromiseRejectionEvent) => {
      if (e.reason instanceof Error) toast(e.reason.message || "Something didn't go through. Try again.");
    };
    window.addEventListener("unhandledrejection", onFail);
    return () => window.removeEventListener("unhandledrejection", onFail);
  }, [toast]);

  const value = useMemo<Session | null>(
    () => (session.data ? { ...session.data, current, switchTo, reload: session.reload, toast } : null),
    [session.data, current, switchTo, session.reload, toast],
  );
  if (!value) return <>{fallback(session.error)}</>;
  return (
    <SessionContext.Provider value={value}>
      {children}
      {toastMsg && (
        <div key={toastMsg.id} className={`toast ${toastMsg.out ? "out" : ""}`} role="status">
          {toastMsg.msg}
        </div>
      )}
    </SessionContext.Provider>
  );
}
