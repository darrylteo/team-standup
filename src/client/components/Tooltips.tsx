import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Themed tooltips for every element with a title. The browser's own tooltip is a plain white box that ignores
 * the theme, so on hover or keyboard focus the title moves to data-tip (which stops the native one) and is shown
 * here instead, in the project's colours. Mounted once at the top of the app.
 */
export function Tooltips() {
  const [tip, setTip] = useState<{ text: string; x: number; y: number; above: boolean } | null>(null);
  useEffect(() => {
    let current: HTMLElement | null = null;
    let timer: number | undefined;
    const hide = () => {
      window.clearTimeout(timer);
      current = null;
      setTip(null);
    };
    const show = (e: Event) => {
      const el = (e.target as HTMLElement | null)?.closest?.<HTMLElement>("[title], [data-tip]");
      if (!el || el === current) return;
      if (el.title) {
        el.dataset.tip = el.title;
        el.removeAttribute("title");
      }
      const text = el.dataset.tip;
      if (!text) return;
      current = el;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (current !== el) return;
        const r = el.getBoundingClientRect();
        const above = r.bottom + 44 > window.innerHeight;
        setTip({ text, x: Math.min(window.innerWidth - 12, Math.max(12, r.left + r.width / 2)), y: above ? r.top - 8 : r.bottom + 8, above });
      }, 350);
    };
    const leave = (e: Event) => {
      const to = (e as MouseEvent).relatedTarget as Node | null;
      if (current && to && current.contains(to)) return;
      hide();
    };
    document.addEventListener("mouseover", show);
    document.addEventListener("focusin", show);
    document.addEventListener("mouseout", leave);
    document.addEventListener("focusout", hide);
    window.addEventListener("scroll", hide, true);
    return () => {
      document.removeEventListener("mouseover", show);
      document.removeEventListener("focusin", show);
      document.removeEventListener("mouseout", leave);
      document.removeEventListener("focusout", hide);
      window.removeEventListener("scroll", hide, true);
      window.clearTimeout(timer);
    };
  }, []);
  // Centred on the element, but slid sideways so a long tip near the edge stays fully on screen.
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || !tip) return;
    const half = el.offsetWidth / 2;
    el.style.left = `${Math.min(document.documentElement.clientWidth - 8 - half, Math.max(8 + half, tip.x))}px`;
  }, [tip]);
  if (!tip) return null;
  return (
    <div className={`tooltip ${tip.above ? "above" : ""}`} role="tooltip" style={{ left: tip.x, top: tip.y }} ref={box}>
      {tip.text}
    </div>
  );
}
