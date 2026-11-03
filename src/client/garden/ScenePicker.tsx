import { useEffect, useRef, useSyncExternalStore } from "react";
import { GARDEN_SCENES, sceneFor, type GardenScene } from "../../shared/garden";
import { Scenery } from "./Scenery";

// Each viewer picks their own garden scene; it is remembered in this browser only (nothing is stored on the server).
const SCENE_KEY = "standup.gardenScene";
const listeners = new Set<() => void>();

function readScene(): string | null {
  try {
    return localStorage.getItem(SCENE_KEY);
  } catch {
    return null;
  }
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

/** The scene this viewer chose (the meadow until they pick one), and a setter that updates every open view of it. */
export function useGardenScene() {
  const key = useSyncExternalStore(subscribe, readScene, () => null);
  const set = (next: GardenScene) => {
    try {
      localStorage.setItem(SCENE_KEY, next);
    } catch {
      // private mode: the choice lasts until the page closes
    }
    listeners.forEach((fn) => fn());
  };
  return [sceneFor(key), set] as const;
}

/**
 * The scene menu in the garden's top bar: a chip showing the current place, opening a list of small scene previews.
 * Arrow keys move through the list, Enter picks, Esc (handled by the garden) or a click outside closes it.
 */
export function ScenePicker({ open, setOpen }: { open: boolean; setOpen: (open: boolean) => void }) {
  const [scene, setScene] = useGardenScene();
  const wrap = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
    const away = (e: PointerEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("pointerdown", away);
    return () => window.removeEventListener("pointerdown", away);
  }, [open, setOpen]);

  const onKey = (e: React.KeyboardEvent) => {
    const items = [...(list.current?.querySelectorAll<HTMLElement>("[role=option]") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => {
      e.preventDefault();
      items[(n + items.length) % items.length]?.focus();
    };
    if (e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowUp") go(i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(items.length - 1);
    else if (e.key === "Tab") setOpen(false);
  };

  const pick = (key: GardenScene) => {
    setScene(key);
    setOpen(false);
    wrap.current?.querySelector<HTMLElement>(".gd-picker-btn")?.focus();
  };

  return (
    <div className="gd-picker" ref={wrap}>
      <button type="button" className="gd-chip gd-picker-btn" aria-label={`Garden scene: ${scene.label}, ${scene.place}. Change scene`} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="gd-thumb" aria-hidden="true">
          <Scenery scene={scene.key} width={1100} crop={56 / 34} />
        </span>
        <span className="gd-picker-text">
          <b>{scene.label}</b>
          <small>{scene.place}</small>
        </span>
        <svg className="gd-caret" viewBox="0 0 12 8" aria-hidden="true">
          <path d="M1.5 1.5 L6 6 L10.5 1.5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <ul className="gd-picker-list" role="listbox" aria-label="Garden scene" ref={list} onKeyDown={onKey}>
          {GARDEN_SCENES.map((x) => (
            <li
              key={x.key}
              role="option"
              aria-selected={x.key === scene.key}
              tabIndex={-1}
              className="gd-picker-opt"
              onClick={() => pick(x.key)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  pick(x.key);
                }
              }}
            >
              <span className="gd-thumb" aria-hidden="true">
                <Scenery scene={x.key} width={1100} crop={56 / 34} />
              </span>
              <span className="gd-picker-text">
                <b>{x.label}</b>
                <small>{x.place}</small>
              </span>
              <svg className="gd-tick" viewBox="0 0 14 12" aria-hidden="true">
                <path d="M1.5 6.5 L5.2 10 L12.5 2" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
