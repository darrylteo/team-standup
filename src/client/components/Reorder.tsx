import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { moveItem } from "../../shared/meeting";

/**
 * Drag-to-reorder for a vertical list: press the ☰ handle, drag, release. Works with mouse, touch and pen
 * (pointer events), and with the keyboard (arrow keys on the handle). Rows reorder live while dragging;
 * `onCommit` gets the new order once, on release.
 */
export function useDragOrder(ids: number[], onCommit: (ids: number[]) => void) {
  const [drag, setDrag] = useState<{ id: number; order: number[] } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const order = drag?.order ?? ids;
  // Latest values for the window listeners below, which are attached once per drag.
  const latest = useRef({ drag, ids, onCommit });
  latest.current = { drag, ids, onCommit };

  const targetIndex = (id: number, y: number) => {
    const rows = [...(listRef.current?.querySelectorAll<HTMLElement>("[data-order-id]") ?? [])].filter((el) => Number(el.dataset.orderId) !== id);
    return rows.filter((el) => {
      const r = el.getBoundingClientRect();
      return r.top + r.height / 2 < y;
    }).length;
  };

  // Moves and the release are followed on the window, not the handle: when a row moves down, React moves its DOM
  // node, which drops pointer capture on the handle and used to stop the drag after one row.
  const dragging = drag?.id ?? null;
  useEffect(() => {
    if (dragging === null) return;
    const move = (e: globalThis.PointerEvent) => {
      const d = latest.current.drag;
      if (!d) return;
      const others = d.order.filter((x) => x !== d.id);
      const at = targetIndex(d.id, e.clientY);
      const next = [...others.slice(0, at), d.id, ...others.slice(at)];
      if (next.join() !== d.order.join()) setDrag({ id: d.id, order: next });
    };
    const up = () => {
      const { drag: d, ids: now, onCommit: commit } = latest.current;
      if (d && d.order.join() !== now.join()) commit(d.order);
      setDrag(null);
    };
    const cancel = () => setDrag(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
    };
  }, [dragging]); // eslint-disable-line react-hooks/exhaustive-deps

  const handle = (id: number, label: string) => ({
    className: "grip",
    "aria-label": `Move ${label}: drag, or use the arrow keys`,
    title: "Drag to change the order",
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      setDrag({ id, order: ids });
    },
    onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => {
      const i = ids.indexOf(id);
      const to = e.key === "ArrowUp" ? i - 1 : e.key === "ArrowDown" ? i + 1 : null;
      if (to === null || to < 0 || to >= ids.length) return;
      e.preventDefault();
      onCommit(moveItem(ids, i, to));
      // Keep focus on the handle as the row moves, so the arrows can be pressed again.
      const btn = e.currentTarget;
      requestAnimationFrame(() => btn.focus());
    },
  });

  return { order, dragging: drag?.id ?? null, listRef, handle };
}

/** One row with its handle; `children` is the row's own content (often a button). */
export function DragRow({ id, dragging, grip, children }: { id: number; dragging: boolean; grip: ReturnType<ReturnType<typeof useDragOrder>["handle"]>; children: ReactNode }) {
  return (
    <div className={`dragwrap ${dragging ? "dragging" : ""}`} data-order-id={id}>
      <button type="button" {...grip}>
        ☰
      </button>
      {children}
    </div>
  );
}
