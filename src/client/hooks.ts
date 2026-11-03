import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useBlocker, useLocation } from "react-router-dom";
import { useAsk } from "./ask";

/** Ask before leaving a page with unsaved changes: in-app navigation and closing/reloading the tab. */
export function useUnsavedGuard(dirty: boolean, flush?: () => Promise<boolean>) {
  const ask = useAsk();
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);
  const asking = useRef(false);
  useEffect(() => {
    if (blocker.state !== "blocked" || asking.current) return;
    asking.current = true;
    void (async () => {
      // Autosaving pages finish saving and go; only a failed save (or a page without autosave) asks.
      if (flush && (await flush())) {
        asking.current = false;
        return blocker.proceed?.();
      }
      const ok = await ask({ title: "Leave without saving?", body: "Your changes on this page haven't been saved yet.", confirm: "Leave without saving", cancel: "Stay on this page", danger: true });
      asking.current = false;
      if (ok !== null) blocker.proceed?.();
      else blocker.reset?.();
    })();
  }, [blocker, ask, flush]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
}

/**
 * `?focus=<key>` (set by notification links): once the element with data-focus="<key>" appears,
 * scroll it into view and flash it for 2 s so the next step is obvious.
 */
export function useFocusFlash() {
  const { search, key } = useLocation();
  const done = useRef<string | null>(null);
  useEffect(() => {
    const focus = new URLSearchParams(search).get("focus");
    if (!focus || done.current === key) return;
    // "a|b": flash a; if a never appears (e.g. the request was already answered), fall back to b after a moment.
    const targets = focus.split("|");
    let tries = 0;
    const t = setInterval(() => {
      const find = (k: string) => document.querySelector<HTMLElement>(`[data-focus="${CSS.escape(k)}"]`);
      const el = find(targets[0]) ?? (tries >= 15 ? targets.slice(1).map(find).find(Boolean) : null);
      if (el) {
        clearInterval(t);
        done.current = key;
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        el.classList.add("flash");
        setTimeout(() => el.classList.remove("flash"), 2000);
      } else if (++tries > 50) clearInterval(t);
    }, 100);
    return () => clearInterval(t);
  }, [search, key]);
}

export type SaveState = "saved" | "pending" | "saving" | "error";

/**
 * Save `value` a moment after it stops changing, so forms need no Save button. `reset` marks a value as already
 * saved (e.g. fresh from the server); `flush` saves right away and resolves true once everything is saved.
 */
export function useAutosave<T>(value: T, save: (v: T) => Promise<void>, { delay = 1200, enabled = true } = {}) {
  const [state, setState] = useState<SaveState>("saved");
  const savedKey = useRef<string>(JSON.stringify(value));
  const latest = useRef(value);
  latest.current = value;
  const saveRef = useRef(save);
  saveRef.current = save;
  const timer = useRef<number | undefined>(undefined);
  const running = useRef<Promise<boolean> | null>(null);

  const flush = useCallback(async (): Promise<boolean> => {
    window.clearTimeout(timer.current);
    if (running.current) await running.current;
    const v = latest.current;
    const key = JSON.stringify(v);
    if (key === savedKey.current) {
      setState("saved");
      return true;
    }
    setState("saving");
    const job = saveRef
      .current(v)
      .then(() => {
        savedKey.current = key;
        return true;
      })
      .catch(() => false);
    running.current = job;
    const ok = await job;
    running.current = null;
    if (!ok) {
      setState("error");
      return false;
    }
    // More typing arrived while saving: save that too.
    if (JSON.stringify(latest.current) !== key) return flush();
    setState("saved");
    return true;
  }, []);

  const key = JSON.stringify(value);
  useEffect(() => {
    if (!enabled || key === savedKey.current) return;
    setState("pending");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), delay);
    return () => window.clearTimeout(timer.current);
  }, [key, enabled, delay, flush]);

  const reset = useCallback((v: T) => {
    savedKey.current = JSON.stringify(v);
    setState("saved");
  }, []);

  return { state, flush, reset, dirty: state !== "saved" };
}

/** "Saving…", "✓ Saved" or a nudge to retry, next to an autosaving form. */
export const saveLabel = (s: SaveState) => (s === "error" ? "Not saved, check your connection" : s === "saved" ? "✓ Saved" : "Saving…");

/**
 * Keep an open pop-up (date picker, time list, menu) on screen: it opens right-and-down from its field, and flips
 * to open leftwards or upwards when that side would run off the screen, so nobody has to scroll sideways to reach it.
 * The pop-up is positioned against its nearest positioned parent; offsets are measured without its open animation.
 */
export function useOnScreen(ref: React.RefObject<HTMLElement | null>, open: boolean) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!open || !el) return;
    const fit = () => {
      el.classList.remove("fit-left", "fit-up");
      const box = (el.offsetParent ?? document.body).getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      const vh = window.innerHeight;
      const right = box.left + el.offsetLeft + el.offsetWidth;
      const bottom = box.top + el.offsetTop + el.offsetHeight;
      if (right > vw - 8 && box.right - el.offsetWidth >= 8) el.classList.add("fit-left");
      if (bottom > vh - 8 && box.top - el.offsetHeight - 6 >= 8) el.classList.add("fit-up");
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [ref, open]);
}
