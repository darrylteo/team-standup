import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { WEATHER } from "../../shared/catalog";
import { AREA, clampToArea, depthScale, pickAction, startSpots, stepToward, wanderTarget, type Pt } from "../../shared/garden";
import { isAwayOn } from "../../shared/meeting";
import type { CalendarResponse, Member, Update } from "../../shared/types";
import { useApi } from "../api";
import { fmtDate } from "../format";
import { useTeam } from "../state";
import { Chibi } from "./Chibi";
import { ScenePicker, useGardenScene } from "./ScenePicker";
import { Scenery } from "./Scenery";
import "./garden.css";

/*
 * The garden: a calm screen (like a screensaver) where everyone in the project wanders an airfield as a chibi figure.
 * Click someone for a random surprise; double-click for their boarding pass for the next meeting. People away for
 * the next meeting queue with their luggage by the control tower. Each screen runs its own random garden; nothing
 * is stored or shared. Positions live in refs and are written straight to the DOM each frame, so React only
 * re-renders when an effect starts or ends. Everything moves gently: ease in, ease out, nothing snappy.
 */

type Mode = "idle" | "walk" | "run" | "hold" | "queue";
type Idle = "" | "look" | "stretch" | "sit";
/** Toward the viewer, turned left or right (with `face`), or walking away. */
type Heading = "front" | "side" | "back";
interface Sim extends Pt {
  id: number;
  to: Pt;
  mode: Mode;
  until: number;
  face: 1 | -1;
  heading: Heading;
  speed: number; // cruising px per second
  v: number; // current px per second, eased towards the cruising speed
  idle: Idle;
  away: boolean;
  arrive?: () => void;
}
interface Fx {
  emote?: string;
  anim?: string;
  prop?: string;
  life: number; // ms the effect stays, so CSS can fade it out at the end
  n: number; // restarts CSS animations when the same effect plays twice
}
interface Flyer {
  id: number;
  kind: "emoji" | "paper" | "jet";
  emoji?: string;
  frames: Keyframe[];
  ms: number;
  easing?: string;
  stay?: boolean; // a thrown toy waits on the grass until it's fetched
}

const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const DOUBLE_MS = 300;
const SOCIAL = ["👋", "💬", "😊", "🤝", "✈️"];
const IDLES: Idle[] = ["", "", "", "look", "look", "stretch", "sit"];
const QUEUE = { x: 0.8, y: 0.505, scale: 0.52, gap: 30 }; // by the control tower, on the strip before the horizon
// Where the runway runs on screen (matches Scenery's Airfield): far end, then the near end at the bottom.
const runwayAt = (t: number): Pt => ({ x: 0.66 + 0.24 * t, y: 0.4867 + 0.5133 * t });
let flyerIds = 0;

export default function Garden({ onClose }: { onClose: () => void }) {
  const { members, upcoming, meeting, project } = useTeam();
  const navigate = useNavigate();
  const updates = useApi<{ updates: Update[] }>(`/updates?date=${upcoming}`);
  const cal = useApi<CalendarResponse>(`/calendar?from=${upcoming}&to=${upcoming}`);
  const [scene] = useGardenScene();
  const [picking, setPicking] = useState(false);
  const pickingRef = useRef(picking);
  pickingRef.current = picking;
  const awayIds = useMemo(() => new Set((cal.data?.away ?? []).filter((a) => isAwayOn([a], upcoming)).map((a) => a.member_id)), [cal.data, upcoming]);

  const layer = useRef<HTMLDivElement>(null);
  const els = useRef(new Map<number, HTMLElement>());
  const sims = useRef(new Map<number, Sim>());
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [fx, setFx] = useState<Record<number, Fx>>({});
  const [flyers, setFlyers] = useState<Flyer[]>([]);
  const [pass, setPass] = useState<number | null>(null);
  const passRef = useRef(pass);
  passRef.current = pass;
  const [leaving, setLeaving] = useState(false);
  const timers = useRef<number[]>([]);
  const runwayBusy = useRef(0); // until when people keep off the runway for a departing plane
  const later = useCallback((ms: number, f: () => void) => void timers.current.push(window.setTimeout(f, ms)), []);

  // Everyone starts somewhere on the grass.
  useEffect(() => {
    const spots = startSpots(members.length);
    const order = [...members].sort(() => Math.random() - 0.5);
    const now = performance.now();
    order.forEach((m, i) => {
      if (sims.current.has(m.id)) return;
      const p = spots[i];
      sims.current.set(m.id, { id: m.id, ...p, to: p, mode: "idle", until: now + 600 + Math.random() * 4000, face: Math.random() < 0.5 ? 1 : -1, heading: "front", speed: 30 + Math.random() * 16, v: 0, idle: "", away: false });
    });
  }, [members]);
  // People away for the next meeting go and queue with their luggage by the tower, clear of everyone else.
  useEffect(() => {
    for (const s of sims.current.values()) {
      const was = s.away;
      s.away = awayIds.has(s.id);
      if (s.away && !was) {
        s.mode = "queue";
        s.face = 1;
        s.heading = "side";
        s.idle = "";
      } else if (!s.away && was) {
        s.mode = "idle";
        s.heading = "front";
        Object.assign(s, startSpots(1)[0]);
      }
    }
  }, [awayIds]);

  const show = useCallback(
    (id: number, f: Omit<Fx, "n" | "life">, ms: number) => {
      setFx((all) => ({ ...all, [id]: { ...f, life: ms, n: (all[id]?.n ?? 0) + 1 } }));
      const started = Date.now();
      later(ms, () => setFx((all) => (all[id] && Date.now() - started >= ms - 20 && all[id].life === ms ? { ...all, [id]: { n: all[id].n, life: 0 } } : all)));
    },
    [later],
  );
  // Stop for something: turn to face the viewer (a chat turns them toward each other afterwards).
  const hold = (s: Sim, ms: number) => {
    if (s.mode !== "queue") {
      s.mode = "hold";
      s.heading = "front";
    }
    s.idle = "";
    s.until = performance.now() + ms;
  };

  // The frame loop: stroll with eased starts and stops, pause, idle about, now and then greet a neighbour.
  useEffect(() => {
    const still = reduced();
    let raf = 0;
    let last = performance.now();
    let nextSocial = last + 12_000;
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const { clientWidth: W, clientHeight: H } = layer.current ?? { clientWidth: 1, clientHeight: 1 };
      // Before a plane departs, people step off the runway: anyone within half its wingspan of the centre line,
      // on the part of the grass it rolls over, moves to whichever side has room.
      const busy = now < runwayBusy.current;
      const clear = Math.min(88, Math.max(58, W * 0.062)) * 2.3 + 24;
      const lane = (y: number) => runwayAt((y - runwayAt(0).y) / (runwayAt(1).y - runwayAt(0).y)).x * W;
      const onRunway = (q: Pt) => q.y < 0.72 && Math.abs(q.x * W - lane(q.y)) < clear;
      const offRunway = (q: Pt): Pt => {
        const rx = lane(q.y);
        const right = q.x * W >= rx && rx + clear + 16 < AREA.x1 * W;
        return clampToArea({ x: (rx + (right ? 1 : -1) * (clear + 16)) / W, y: q.y });
      };
      const queued = [...sims.current.values()].filter((s) => s.away).sort((a, b) => a.id - b.id);
      for (const s of sims.current.values()) {
        let scale = depthScale(s.y);
        if (s.away) {
          // The queue: a line leading to the tower, everyone facing it.
          const i = queued.indexOf(s);
          if (s.mode === "queue" || (s.mode === "hold" && now > s.until)) {
            s.mode = "queue";
            s.x = (QUEUE.x * W - 40 - i * QUEUE.gap) / W;
            s.y = QUEUE.y;
            s.face = 1;
            s.heading = "side";
            if (!still && now > s.until) {
              s.idle = Math.random() < 0.5 ? "" : "look";
              s.until = now + 4000 + Math.random() * 6000;
            }
          }
          scale = QUEUE.scale;
        } else if (!still) {
          if (busy && !s.arrive && onRunway(s) && s.mode !== "run") {
            s.to = offRunway(s);
            s.mode = "run";
            s.v = s.speed * 1.8; // no easing in: they hurry
            s.idle = "";
          } else if (busy && s.mode === "walk" && onRunway(s.to)) {
            s.to = offRunway(s.to);
          }
          if (s.mode === "idle" && now > s.until) {
            s.to = wanderTarget(s);
            if (busy && onRunway(s.to)) s.to = offRunway(s.to);
            s.mode = "walk";
            s.idle = "";
          } else if (s.mode === "hold" && now > s.until) {
            s.mode = "idle";
            s.heading = "front";
            s.until = now + 1500 + Math.random() * 4000;
          } else if (s.mode === "walk" || s.mode === "run") {
            const dx = (s.to.x - s.x) * W;
            const dist = Math.hypot(dx, (s.to.y - s.y) * H);
            const dy = (s.to.y - s.y) * H;
            if (Math.abs(dx) > 3) s.face = dx > 0 ? 1 : -1;
            // Face the way they walk: their back when heading up the screen (away), a three-quarter turn when
            // crossing it, the front when coming toward you. Between zones they keep their heading, so it never flickers.
            if (dist > 6) {
              const ax = Math.abs(dx);
              if (dy < -ax * 0.8) s.heading = "back";
              else if (dy > ax * 1.3) s.heading = "front";
              else if (ax > Math.abs(dy) * 1.2) s.heading = "side";
            }
            // Ease in from standing, ease out over the last few steps.
            const cruise = s.speed * (s.mode === "run" ? 1.8 : 1) * Math.min(1, 0.25 + dist / 60);
            s.v += (cruise - s.v) * Math.min(1, dt * 2.5);
            const r = stepToward(s, s.to, Math.max(4 * dt, s.v * dt), W, H);
            s.x = r.p.x;
            s.y = r.p.y;
            if (r.arrived) {
              s.v = 0;
              s.mode = "idle";
              s.heading = "front";
              s.idle = IDLES[Math.floor(Math.random() * IDLES.length)];
              s.until = now + (s.idle === "sit" ? 7000 : 2500) + Math.random() * 5000;
              const done = s.arrive;
              s.arrive = undefined;
              done?.();
            }
          }
        }
        const el = els.current.get(s.id);
        if (el) {
          el.style.transform = `translate3d(${s.x * W}px, ${s.y * H}px, 0) scale(${scale})`;
          el.style.zIndex = String(Math.round(s.y * 1000));
          el.dataset.mode = s.mode === "queue" ? "idle" : s.mode;
          el.dataset.idle = s.idle;
          el.dataset.heading = s.heading;
          el.style.setProperty("--face", String(s.face));
        }
      }
      // Two people idling near each other occasionally stop for a chat (rarely: about every 10–20 s at most).
      if (!still && now > nextSocial) {
        nextSocial = now + 10_500 + Math.random() * 12_000;
        const idle = [...sims.current.values()].filter((s) => s.mode === "idle" && !s.away);
        for (const a of idle) {
          const b = idle.find((o) => o !== a && Math.hypot((o.x - a.x) * W, (o.y - a.y) * H) < 150);
          if (b && Math.random() < 0.6) {
            a.face = b.x > a.x ? 1 : -1;
            b.face = a.x > b.x ? 1 : -1;
            hold(a, 3600);
            hold(b, 3600);
            a.heading = b.heading = "side";
            show(a.id, { emote: SOCIAL[Math.floor(Math.random() * SOCIAL.length)] }, 2800);
            later(900, () => show(b.id, { emote: SOCIAL[Math.floor(Math.random() * SOCIAL.length)] }, 2400));
            break;
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [show, later]);

  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    const all = timers.current;
    return () => {
      window.removeEventListener("resize", onResize);
      all.forEach(clearTimeout);
    };
  }, []);

  const fly = useCallback(
    (f: Omit<Flyer, "id">) => {
      const flyer: Flyer = { ...f, id: ++flyerIds };
      setFlyers((xs) => [...xs, flyer]);
      if (!f.stay) later(f.ms + 80, () => setFlyers((xs) => xs.filter((x) => x !== flyer)));
      return flyer;
    },
    [later],
  );

  // Now and then a plane rolls down the runway and climbs away, like the trains passing by in cosy games.
  useEffect(() => {
    if (reduced()) return;
    let t = 0;
    const depart = () => {
      const el = layer.current;
      if (el) {
        const W = el.clientWidth;
        const H = el.clientHeight;
        const at = (k: number, lift = 0, s = 1) => {
          const p = runwayAt(k);
          // Stacked by depth like the people, so anyone standing further back is hidden behind it.
          return { transform: `translate(${p.x * W}px, ${p.y * H - lift * H}px) scale(${s})`, zIndex: String(Math.round(p.y * 1000)) };
        };
        // Clear the runway first, then roll; people keep off it until the plane is past the grass.
        runwayBusy.current = performance.now() + 4000 + 6000;
        later(4000, () =>
          fly({
            kind: "jet",
            ms: 11_000,
            easing: "linear",
            frames: [
              { ...at(0.34, 0, 0.9), opacity: 0 },
              { ...at(0.3, 0, 0.85), opacity: 1, offset: 0.06 },
              { ...at(0.12, 0, 0.6), offset: 0.5, easing: "ease-in" },
              { ...at(0.0, 0.08, 0.45), offset: 0.7 },
              { ...at(-0.25, 0.32, 0.25), offset: 0.94, opacity: 1 },
              { ...at(-0.3, 0.36, 0.22), opacity: 0 },
            ],
          }),
        );
      }
      t = window.setTimeout(depart, 50_000 + Math.random() * 40_000);
    };
    t = window.setTimeout(depart, 9000 + Math.random() * 6000);
    return () => clearTimeout(t);
  }, [fly, later]);

  const leave = useCallback(() => {
    setLeaving(true);
    window.setTimeout(onClose, reduced() ? 0 : 420);
  }, [onClose]);

  // Esc closes the scene menu or the boarding pass first, then the garden. The page behind doesn't scroll while the garden is open.
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      if (pickingRef.current) {
        setPicking(false);
        root.current?.querySelector<HTMLElement>(".gd-picker-btn")?.focus();
      } else if (passRef.current === null) leave();
      else setPass(null);
    };
    window.addEventListener("keydown", onKey, true);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    root.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = overflow;
    };
  }, [leave]);
  // Release whoever was holding still for their boarding pass.
  useEffect(() => {
    for (const s of sims.current.values()) if (s.mode === "hold" && s.until === Infinity && s.id !== pass) s.until = 0;
  }, [pass]);

  /** One click: a random one of the five actions, played gently. */
  const act = (id: number) => {
    const s = sims.current.get(id);
    const el = layer.current;
    if (!s || !el) return;
    const W = el.clientWidth;
    const H = el.clientHeight;
    let { key, pick } = pickAction();
    // People queueing stay in the queue: no fetching toys or scurrying off.
    if (s.away && (key === "toy" || pick === "💨")) ({ key, pick } = { key: "snack", pick: "🍩" });
    el.dataset.lastAction = key; // for tests and curious inspectors
    if (reduced()) return show(id, { emote: key === "bonk" ? "💫" : key === "plane" ? "✈️" : pick }, 2000);
    const fig = els.current.get(id)?.querySelector(".gd-head")?.getBoundingClientRect();
    const headAt = fig ? { x: fig.left + fig.width / 2, y: fig.top + fig.height * 0.45 } : { x: s.x * W, y: s.y * H - 80 };
    switch (key) {
      case "snack":
        hold(s, 4600);
        show(id, { anim: "munch", prop: pick }, 2900);
        later(2900, () => show(id, { emote: "❤️", anim: "hop" }, 1800));
        break;
      case "toy": {
        const dir = s.x < 0.5 ? 1 : -1;
        const land = clampToArea({ x: s.x + dir * (0.14 + Math.random() * 0.12), y: s.y + (Math.random() - 0.5) * 0.12 });
        const a = { x: W / 2, y: H + 30 };
        const b = { x: land.x * W, y: land.y * H - 12 };
        const ball = fly({
          kind: "emoji",
          emoji: pick,
          ms: 1500,
          easing: "cubic-bezier(0.33, 0, 0.4, 1)",
          stay: true,
          frames: [
            { transform: `translate(${a.x}px, ${a.y}px) rotate(0deg)` },
            { transform: `translate(${(a.x + b.x) / 2}px, ${Math.min(a.y, b.y) - H * 0.22}px) rotate(200deg)`, offset: 0.5 },
            { transform: `translate(${b.x}px, ${b.y}px) rotate(400deg)` },
          ],
        });
        hold(s, 1300);
        show(id, { emote: "❗" }, 1300);
        later(1200, () => {
          s.to = land;
          s.mode = "run";
          s.arrive = () => {
            setFlyers((xs) => xs.filter((x) => x !== ball));
            show(id, { emote: "✨", anim: "hop", prop: pick }, 2200);
            hold(s, 2400);
          };
        });
        later(12_000, () => setFlyers((xs) => xs.filter((x) => x !== ball)));
        break;
      }
      case "bonk":
        hold(s, 5000);
        show(id, { anim: "bonk", prop: "🔨" }, 1300);
        later(1250, () => show(id, { anim: "dizzy" }, 3400)); // stars circle their head while they wobble
        break;
      case "react":
        if (pick === "💨") {
          hold(s, 900);
          show(id, { emote: "💨" }, 1600);
          later(800, () => {
            s.to = clampToArea({ x: s.x + (s.x < 0.5 ? 0.35 : -0.35), y: s.y + (Math.random() - 0.5) * 0.2 });
            s.mode = "run";
          });
        } else {
          hold(s, 2600);
          show(id, { emote: pick, anim: pick === "🎵" ? "dance" : "hop" }, 2400);
        }
        break;
      case "plane": {
        // A folded paper plane glides in, circles their head twice, then spirals down to the grass and fades.
        hold(s, 9200);
        const r = 64;
        const ground = { x: headAt.x + (s.x < 0.5 ? 46 : -46), y: s.y * H - 4 };
        const from = { x: s.x < 0.5 ? -60 : W + 60, y: headAt.y - 140 };
        const path: { x: number; y: number; o: number }[] = [{ ...from, o: 0 }];
        const loopStart = Math.atan2(from.y - headAt.y, from.x - headAt.x);
        const steps = 32;
        for (let i = 0; i <= steps; i++) {
          const t = loopStart + (i / steps) * Math.PI * 4; // two loops
          path.push({ x: headAt.x + Math.cos(t) * r, y: headAt.y + Math.sin(t) * r * 0.38, o: 0.16 + (i / steps) * 0.54 });
        }
        path.push({ x: (headAt.x + ground.x) / 2 + 20, y: (headAt.y + ground.y) / 2, o: 0.78 }, { x: ground.x, y: ground.y, o: 0.86 }, { x: ground.x, y: ground.y, o: 0.94 });
        const frames: Keyframe[] = path.map((p, i) => {
          const q = path[Math.min(path.length - 1, i + 1)];
          const prev = path[Math.max(0, i - 1)];
          const heading = i >= path.length - 2 ? 0 : (Math.atan2(q.y - prev.y, q.x - prev.x) * 180) / Math.PI;
          return { transform: `translate(${p.x}px, ${p.y}px) rotate(${heading}deg)`, offset: p.o, opacity: 1 };
        });
        frames.push({ transform: `translate(${ground.x}px, ${ground.y}px) rotate(0deg)`, offset: 1, opacity: 0 });
        fly({ kind: "paper", ms: 9000, easing: "linear", frames });
        show(id, { anim: "watch" }, 7200);
        later(7400, () => show(id, { emote: "😊", anim: "hop" }, 1800));
        break;
      }
    }
  };

  /** Click vs double-click, by hand: the browser's dblclick also fires two clicks, which would start actions. */
  const clicks = useRef<{ id: number; timer: number } | null>(null);
  const actRef = useRef(act);
  actRef.current = act;
  const tap = (id: number) => {
    const prev = clicks.current;
    clicks.current = null;
    if (prev) window.clearTimeout(prev.timer);
    if (prev?.id === id) {
      const s = sims.current.get(id);
      if (s) {
        if (s.mode !== "queue") s.mode = "hold";
        s.until = Infinity; // stands still while the pass is open
      }
      setPass(id);
      return;
    }
    if (prev) actRef.current(prev.id); // a quick click on someone else: the first person still gets theirs
    const timer = window.setTimeout(() => {
      clicks.current = null;
      actRef.current(id);
    }, DOUBLE_MS);
    clicks.current = { id, timer };
  };

  const byMember = new Map((updates.data?.updates ?? []).map((u) => [u.member_id, u]));
  const crew = members.filter((m) => m.role === "researcher").length;
  const pilots = members.length - crew;
  const queueing = members.filter((m) => awayIds.has(m.id)).length;
  const sceneWidth = (900 * size.w) / Math.max(1, size.h);

  return (
    <div ref={root} className={`garden ${leaving ? "out" : ""}`} role="dialog" aria-modal="true" aria-label="Garden" tabIndex={-1}>
      <div className="gd-veil" />
      <div className="gd-world">
        <Scenery key={scene.key} scene={scene.key} width={sceneWidth} />
        <Ambient />
        <div className="gd-layer" ref={layer} onClick={(e) => e.target === e.currentTarget && setPass(null)}>
          {members.map((m) => {
            const f = fx[m.id];
            const away = awayIds.has(m.id);
            const on = !!f?.life;
            const life = on ? ({ "--life": `${f.life}ms` } as CSSProperties) : undefined;
            return (
              <div key={m.id} className="gd-char" ref={(el) => void (el ? els.current.set(m.id, el) : els.current.delete(m.id))} data-member={m.id} data-away={away || undefined}>
                <button type="button" className="gd-figure" data-anim={on ? f.anim : undefined} style={life} aria-label={`${m.name}${away ? " (away, queueing)" : ""}: click for a surprise, double-click for their boarding pass`} onClick={() => tap(m.id)}>
                  <span className="gd-shadow" />
                  <span className="gd-dust" />
                  {away && <Suitcase id={m.id} />}
                  <span className="gd-bob" key={`a${on && f.anim ? f.n : 0}`}>
                    <Chibi avatar={m.avatar} role={m.role} photo={m.photo} />
                  </span>
                  {on && f.anim === "dizzy" && (
                    <span className="gd-stars" aria-hidden="true">
                      <i>⭐</i>
                      <i>✨</i>
                      <i>⭐</i>
                    </span>
                  )}
                  {on && f.prop && (
                    <span key={`p${f.n}`} className="gd-prop">
                      {f.prop}
                    </span>
                  )}
                  {on && f.emote && (
                    <span key={`e${f.n}`} className="gd-emote">
                      {f.emote}
                    </span>
                  )}
                  <span className="gd-name">{m.name}</span>
                </button>
              </div>
            );
          })}
          {flyers.map((f) => (
            <span
              key={f.id}
              className={`gd-flyer ${f.kind}`}
              ref={(el) => {
                if (el && !el.dataset.flying) {
                  el.dataset.flying = "1";
                  el.animate(f.frames, { duration: f.ms, easing: f.easing ?? "ease-in-out", fill: "forwards" });
                }
              }}
            >
              {f.kind === "paper" ? <PaperPlane /> : f.kind === "jet" ? <Jet /> : f.emoji}
            </span>
          ))}
          {pass !== null && (
            <BoardingPass
              member={members.find((m) => m.id === pass)}
              anchor={els.current.get(pass)?.querySelector(".gd-head")?.getBoundingClientRect()}
              size={size}
              u={byMember.get(pass)}
              away={awayIds.has(pass)}
              title={project.title}
              date={upcoming}
              time={meeting.time}
              onClose={() => setPass(null)}
              onOpen={(id) => {
                onClose();
                navigate(`/?select=${id}`);
              }}
            />
          )}
        </div>
      </div>

      <div className="gd-top">
        <button type="button" className="gd-chip gd-back" onClick={leave}>
          <span className="gd-fine">
            Press <kbd>esc</kbd> to go back
          </span>
          <span className="gd-coarse">← Tap here to go back</span>
        </button>
        <div className="gd-side">
          <ScenePicker open={picking} setOpen={setPicking} />
          <div className="gd-chip gd-count" aria-live="polite">
            <b>👥 {members.length} in the garden</b>
            <span>
              {crew} crew · {pilots} {pilots === 1 ? "pilot" : "pilots"}
              {queueing > 0 && ` · 🧳 ${queueing} away, queueing by the tower`}
            </span>
          </div>
        </div>
      </div>
      <div className="gd-chip gd-hint">
        <span className="gd-fine">Click someone for a surprise · double-click for their boarding pass</span>
        <span className="gd-coarse">Tap someone for a surprise · double-tap for their pass</span>
      </div>
    </div>
  );
}

/** Butterflies by day, fireflies in the evening (dark mode): drifting slowly, never clickable. */
function Ambient() {
  return (
    <div className="gd-ambient" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={`b${i}`} className={`gd-butterfly b${i}`}>
          <svg viewBox="-10 -8 20 16">
            <ellipse className="w l" cx={-4.5} cy={-2} rx={5} ry={4.2} />
            <ellipse className="w r" cx={4.5} cy={-2} rx={5} ry={4.2} />
            <ellipse className="w l lo" cx={-3.4} cy={3.2} rx={3.4} ry={2.8} />
            <ellipse className="w r lo" cx={3.4} cy={3.2} rx={3.4} ry={2.8} />
            <rect x={-0.8} y={-5} width={1.6} height={10} rx={0.8} className="bd" />
          </svg>
        </span>
      ))}
      {Array.from({ length: 12 }, (_, i) => (
        <span key={`f${i}`} className={`gd-firefly f${i % 6}`} style={{ left: `${8 + ((i * 37) % 84)}%`, top: `${54 + ((i * 23) % 38)}%`, animationDelay: `${-i * 1.7}s` }} />
      ))}
    </div>
  );
}

function Suitcase({ id }: { id: number }) {
  const tone = ["a", "b", "c"][id % 3];
  return (
    <svg className="gd-case" viewBox="0 0 24 34" aria-hidden="true">
      <rect x={9} y={1} width={2} height={10} rx={1} fill="var(--gd-case-handle)" />
      <rect x={13} y={1} width={2} height={10} rx={1} fill="var(--gd-case-handle)" />
      <rect x={8} y={0} width={8} height={2.4} rx={1.2} fill="var(--gd-case-handle)" />
      <rect x={3} y={10} width={18} height={20} rx={3.5} fill={`var(--gd-case-${tone})`} />
      <line x1={8} y1={12} x2={8} y2={28} stroke="var(--gd-case-handle)" strokeWidth={1} opacity={0.4} />
      <line x1={16} y1={12} x2={16} y2={28} stroke="var(--gd-case-handle)" strokeWidth={1} opacity={0.4} />
      <circle cx={7} cy={31.5} r={2} fill="var(--gd-shoe)" />
      <circle cx={17} cy={31.5} r={2} fill="var(--gd-shoe)" />
    </svg>
  );
}

/** A folded paper plane, nose to the right. */
function PaperPlane() {
  return (
    <svg viewBox="-20 -12 40 24" width="40" height="24" aria-hidden="true">
      <path d="M18 0 L-16 -9 L-6 0 Z" fill="var(--gd-paper)" />
      <path d="M18 0 L-6 0 L-12 8 Z" fill="var(--gd-paper-fold)" />
      <path d="M18 0 L-16 -9 L-6 0 L-12 8 Z" fill="none" stroke="var(--gd-paper-line)" strokeWidth={0.8} strokeLinejoin="round" />
    </svg>
  );
}

/** A small airliner seen from behind, as it rolls away from you up the runway: wings, engines, tailplane and fin. */
function Jet() {
  const line = { stroke: "var(--gd-paper-line)", strokeWidth: 1, strokeLinejoin: "round" } as const;
  return (
    <svg viewBox="-60 -34 120 56" width="420" height="196" aria-hidden="true">
      <g className="gd-jet-gear">
        <path d="M-12 8 L-12 17 M12 8 L12 17 M0 9 L0 15" stroke="var(--gd-shoe)" strokeWidth={2} />
        <rect x={-15} y={15} width={6} height={5} rx={2} fill="var(--gd-shoe)" />
        <rect x={9} y={15} width={6} height={5} rx={2} fill="var(--gd-shoe)" />
      </g>
      <path d="M-7 2 L-57 -3 Q-59 -1 -57 1 L-7 8 Z" fill="var(--gd-plane)" {...line} />
      <path d="M7 2 L57 -3 Q59 -1 57 1 L7 8 Z" fill="var(--gd-plane)" {...line} />
      <path d="M-56 -3 L-58 -9 L-55 -9 L-53 -3 Z M56 -3 L58 -9 L55 -9 L53 -3 Z" fill="var(--gd-plane-accent)" />
      {[-24, 24].map((x) => (
        <g key={x}>
          <ellipse cx={x} cy={9} rx={6.5} ry={6} fill="var(--gd-plane)" {...line} />
          <ellipse cx={x} cy={9.4} rx={3.8} ry={3.4} fill="var(--gd-shoe)" />
        </g>
      ))}
      <path d="M-4 -7 L-22 -10 L-22 -7 L-4 -3 Z M4 -7 L22 -10 L22 -7 L4 -3 Z" fill="var(--gd-plane)" {...line} />
      <path d="M-2.6 -6 L-1.6 -30 L1.6 -30 L2.6 -6 Z" fill="var(--gd-plane-accent)" {...line} />
      <circle cx={0} cy={0} r={9} fill="var(--gd-plane)" {...line} />
      <circle cx={0} cy={0.5} r={4} fill="var(--gd-paper-fold)" />
      <circle className="gd-beacon" cx={0} cy={-31} r={1.8} fill="var(--gd-light)" />
    </svg>
  );
}

function BoardingPass({
  member,
  anchor,
  size,
  u,
  away,
  title,
  date,
  time,
  onClose,
  onOpen,
}: {
  member?: Member;
  anchor?: DOMRect;
  size: { w: number; h: number };
  u?: Update;
  away: boolean;
  title: string;
  date: string;
  time: string;
  onClose: () => void;
  onOpen: (id: number) => void;
}) {
  if (!member || !anchor) return null;
  const x = anchor.left + anchor.width / 2;
  const above = anchor.top + anchor.height * 0.1 - 12; // just above their head
  const flip = above < 270; // someone far back (the queue) on a short screen: open below them instead
  const half = Math.min(150, size.w / 2 - 12);
  const left = Math.min(size.w - half - 12, Math.max(half + 12, x));
  const status = !u ? (away ? "Away" : "Not checked in") : u.submitted_at ? "Checked in" : "Draft";
  const weather = WEATHER.find((w) => w.key === u?.weather);
  return (
    <div className={`gd-pass ${flip ? "below" : ""}`} role="dialog" aria-label={`${member.name}'s boarding pass`} style={{ left, top: flip ? anchor.bottom + 14 : above, "--tail": `${x - left}px` } as CSSProperties}>
      <div className="gd-pass-head">
        <span>Boarding pass · {title}</span>
        <button type="button" className="x" aria-label="Close the boarding pass" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="gd-pass-name">{member.name}</div>
      <div className="gd-pass-sub">
        {member.handle ? `@${member.handle} · ` : ""}
        {member.role === "prof" ? "✈ Pilot" : "🧳 Crew"}
      </div>
      <dl className="gd-pass-grid">
        <div>
          <dt>Flight</dt>
          <dd>
            {fmtDate(date)}
            {time && ` · ${time}`}
          </dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{status}</dd>
        </div>
        <div>
          <dt>Conditions</dt>
          <dd>{weather ? `${weather.icon} ${weather.label}` : "—"}</dd>
        </div>
        <div>
          <dt>This week</dt>
          <dd>{u ? `${u.done.length} done · ${u.issues.length} to raise` : "—"}</dd>
        </div>
        {u?.deep_dive && (
          <div className="wide">
            <dt>Deep dive</dt>
            <dd>
              ⏱ {u.deep_dive.topic} · {u.deep_dive.minutes} min
            </dd>
          </div>
        )}
      </dl>
      <button type="button" className="btn ghost gd-pass-open" onClick={() => onOpen(member.id)}>
        Open their card ✈
      </button>
    </div>
  );
}
