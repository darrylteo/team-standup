import { memo, useId, type CSSProperties } from "react";
import { sceneFor, type GardenScene } from "../../shared/garden";

/*
 * The garden's backdrop: sky, the chosen scene's landmark and a small airfield, drawn in a viewBox as wide as the screen
 * (900 units tall), so nothing important is cropped on a phone. Colours are --gd-* tokens: day in light mode,
 * a starry evening in dark mode.
 */

const H = 900;
const HORIZON = 432;
const SHORE = 372; // harbour scenes: the far shore, with sea between it and the horizon

/** Small seeded random, so the flowers and stars stay put between renders. */
function seeded(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const c = (name: string) => `var(--gd-${name})`;

function Tree({ x, y, s = 1, leaf = "leaf", leaf2 = "leaf2" }: { x: number; y: number; s?: number; leaf?: string; leaf2?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x={-7} y={-40} width={14} height={42} rx={6} fill={c("trunk")} />
      <circle cx={0} cy={-62} r={34} fill={c(leaf)} />
      <circle cx={-20} cy={-50} r={22} fill={c(leaf2)} />
      <circle cx={18} cy={-76} r={20} fill={c(leaf2)} />
    </g>
  );
}

function Pine({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x={-5} y={-16} width={10} height={18} fill={c("trunk")} />
      <path d="M0 -96 L28 -46 L14 -48 L34 -14 L-34 -14 L-14 -48 L-28 -46 Z" fill={c("pine")} />
    </g>
  );
}

function Palm({ x, y, s = 1, flip = false }: { x: number; y: number; s?: number; flip?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`}>
      <path d="M0 0 C 6 -50, 22 -100, 40 -140" stroke={c("trunk")} strokeWidth={13} fill="none" strokeLinecap="round" />
      {[-40, 10, 60, 120, 170].map((r) => (
        <ellipse key={r} cx={40} cy={-140} rx={54} ry={13} fill={c("palm")} transform={`rotate(${r} 40 -140) translate(40 0)`} />
      ))}
    </g>
  );
}

function Cloud({ x, y, s = 1, delay }: { x: number; y: number; s?: number; delay: number }) {
  return (
    <g className="gd-cloud" style={{ animationDelay: `${delay}s` }}>
      <g transform={`translate(${x} ${y}) scale(${s})`} fill={c("cloud")}>
        <ellipse cx={0} cy={0} rx={60} ry={22} />
        <ellipse cx={-30} cy={-10} rx={30} ry={22} />
        <ellipse cx={22} cy={-18} rx={36} ry={28} />
      </g>
    </g>
  );
}

/** The airfield: a runway running into the distance, edge lights, a tower, a hangar and a windsock. */
function Airfield({ w }: { w: number }) {
  const far = { cx: w * 0.66, half: 20, y: HORIZON + 6 };
  const near = { cx: w * 0.9, half: Math.max(90, w * 0.15), y: H };
  const at = (t: number, side: -1 | 0 | 1) => {
    const cx = far.cx + (near.cx - far.cx) * t;
    const half = far.half + (near.half - far.half) * t;
    return { x: cx + side * half, y: far.y + (near.y - far.y) * t, half };
  };
  const dashes = [0.06, 0.16, 0.3, 0.48, 0.7].map((t) => {
    const a = at(t, 0);
    const b = at(t + 0.06 + t * 0.06, 0);
    const wa = a.half * 0.06;
    const wb = b.half * 0.06;
    return `${a.x - wa},${a.y} ${a.x + wa},${a.y} ${b.x + wb},${b.y} ${b.x - wb},${b.y}`;
  });
  const lights = [0.04, 0.12, 0.22, 0.36, 0.54, 0.78].flatMap((t) => [at(t, -1), at(t, 1)]);
  const tower = { x: w * 0.83, y: HORIZON + 2 };
  const hangar = { x: w * 0.13, y: HORIZON + 4 };
  const sock = { x: w * 0.56, y: HORIZON + 14 };
  return (
    <g>
      <polygon points={`${at(0, -1).x},${far.y} ${at(0, 1).x},${far.y} ${at(1, 1).x},${H} ${at(1, -1).x},${H}`} fill={c("runway")} />
      {dashes.map((d) => (
        <polygon key={d} points={d} fill={c("runway-mark")} />
      ))}
      <g style={{ opacity: "var(--gd-light-op)" }}>
        {lights.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={2 + (p.y - HORIZON) / 90} fill={c("light")} />
        ))}
      </g>
      <g transform={`translate(${tower.x} ${tower.y})`}>
        <rect x={-10} y={-92} width={20} height={92} fill={c("tower")} />
        <path d="M-26 -92 L26 -92 L20 -120 L-20 -120 Z" fill={c("tower-glass")} />
        <rect x={-28} y={-126} width={56} height={8} rx={3} fill={c("tower")} />
      </g>
      <g transform={`translate(${hangar.x} ${hangar.y})`}>
        <path d="M-90 0 L-90 -40 A 90 60 0 0 1 90 -40 L90 0 Z" fill={c("hangar")} />
        <rect x={-46} y={-44} width={92} height={44} fill={c("hangar-door")} />
      </g>
      <g transform={`translate(${sock.x} ${sock.y})`}>
        <rect x={-2} y={-64} width={4} height={64} fill={c("tower")} />
        <g className="gd-sock">
          <path d="M2 -64 L44 -58 L44 -50 L2 -44 Z" fill={c("sock")} />
          <path d="M16 -62 L28 -60 L28 -48 L16 -46 Z" fill={c("sock2")} />
        </g>
      </g>
    </g>
  );
}

/** A small cargo ship, bow to the right, sitting on the waterline at y = 0. */
function Ship() {
  return (
    <g>
      <rect x={-20} y={-28} width={6} height={9} fill={c("bridge")} />
      <rect x={-26} y={-20} width={20} height={11} rx={1.5} fill={c("opera")} />
      {[-23, -18, -13].map((x) => (
        <rect key={x} x={x} y={-17} width={3} height={3} fill={c("window")} />
      ))}
      <rect x={-4} y={-17} width={10} height={8} fill={c("case-a")} />
      <rect x={7} y={-17} width={10} height={8} fill={c("case-b")} />
      <rect x={1} y={-25} width={10} height={8} fill={c("case-c")} />
      <path d="M-34 -9 L36 -9 L29 2 L-31 2 Z" fill={c("red")} />
      <rect x={-34} y={-10} width={70} height={2} fill={c("opera")} />
    </g>
  );
}

function Sailboat() {
  return (
    <g>
      <line x1={0} y1={-4} x2={0} y2={-36} stroke={c("bridge")} strokeWidth={1.5} />
      <path d="M1.5 -7 L1.5 -35 L17 -8 Z" fill={c("opera")} />
      <path d="M-1.5 -9 L-1.5 -30 L-12 -9 Z" fill={c("opera-sh")} />
      <path d="M-15 -5 L16 -5 L11 2 L-11 2 Z" fill={c("bridge")} />
    </g>
  );
}

/**
 * A band of sea from `top` down to the horizon: long slow swells, little glints that come and go, and now and then a
 * ship crossing far out (each one spends most of its cycle off screen, so they pass by only occasionally).
 */
function Sea({ w, top, sail = false }: { w: number; top: number; sail?: boolean }) {
  const rnd = seeded(Math.round(w) + top);
  const depth = HORIZON + 2 - top;
  const glints = Array.from({ length: Math.round(w / 55) }, () => ({ x: rnd() * w, y: top + 8 + rnd() * (depth - 14), d: -rnd() * 6 }));
  const swell = (y: number) => `M0 ${y} ${Array.from({ length: 12 }, (_, j) => `Q ${(w * (j + 0.5)) / 12} ${y - 4}, ${(w * (j + 1)) / 12} ${y}`).join(" ")}`;
  const lane = { "--sea-w": w } as CSSProperties;
  return (
    <g>
      <rect x={0} y={top} width={w} height={depth} fill={c("sea")} />
      {[top + depth * 0.3, top + depth * 0.62, top + depth * 0.9].map((y, i) => (
        <path key={y} className="gd-wave" style={{ animationDelay: `${-i * 1.7}s` }} d={swell(y)} stroke={c("sea2")} strokeWidth={2.5} fill="none" opacity={0.75} />
      ))}
      {glints.map((g, i) => (
        <path key={i} className="gd-glint" style={{ animationDelay: `${g.d}s` }} d={`M${g.x} ${g.y} q 6 -3.5 12 0`} stroke={c("sea2")} strokeWidth={2} fill="none" strokeLinecap="round" />
      ))}
      <g className="gd-ship" style={{ ...lane, animationDelay: "-14s" }} transform={`translate(0 ${top + depth * 0.32})`}>
        <g className="gd-bobbing">
          <Ship />
        </g>
      </g>
      {sail && (
        <g className="gd-ship slow" style={{ ...lane, animationDelay: "-70s" }} transform={`translate(0 ${top + depth * 0.55})`}>
          <g className="gd-bobbing">
            <Sailboat />
          </g>
        </g>
      )}
    </g>
  );
}

/** A plain block of a skyline with a grid of windows (pale by day, lit in the evening). */
function Block({ x, w, h, tone = "city" }: { x: number; w: number; h: number; tone?: "city" | "city2" }) {
  const cols = Math.max(1, Math.floor((w - 6) / 9));
  const rows = Math.max(1, Math.floor((h - 10) / 14));
  return (
    <g>
      <rect x={x} y={SHORE - h} width={w} height={h} fill={c(tone)} />
      {Array.from({ length: cols * rows }, (_, i) => (
        <rect key={i} x={x + 5 + (i % cols) * 9} y={SHORE - h + 8 + Math.floor(i / cols) * 14} width={4} height={6} fill={c("window")} opacity={(i * 7) % 5 === 0 ? 0.25 : 0.7} />
      ))}
    </g>
  );
}

function Cypress({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x={-2.5} y={-10} width={5} height={10} fill={c("trunk")} />
      <path d="M0 -104 C 14 -80, 16 -30, 0 -8 C -16 -30, -14 -80, 0 -104 Z" fill={c("pine")} />
    </g>
  );
}

/** One landmark per travel scene, standing on the horizon between the hangar and the far end of the runway. */
function Landmark({ scene, w }: { scene: GardenScene; w: number }) {
  const k = Math.min(1.1, Math.max(0.5, w / 1440)); // smaller on a phone, so they keep clear of the hangar and runway
  // `half` keeps a landmark that wide (in its own units) clear of the hangar's right edge.
  const at = (fx: number, s = 1, y = HORIZON + 2, half = 0) => `translate(${Math.max(w * fx, w * 0.13 + 96 + half * k * s)} ${y}) scale(${k * s})`;
  switch (scene) {
    case "fuji":
      return (
        <g>
          <g transform={at(0.42, 1, HORIZON + 4)}>
            <path d="M-430 0 C-300 -60 -150 -175 -42 -250 L42 -250 C150 -175 300 -60 430 0 Z" fill={c("fuji")} />
            <path d="M-42 -250 L42 -250 C70 -230 96 -212 120 -194 L100 -182 L80 -196 L60 -174 L38 -194 L16 -170 L-6 -194 L-28 -172 L-50 -196 L-74 -178 L-96 -194 L-120 -194 C-96 -212 -70 -230 -42 -250 Z" fill={c("snow")} />
          </g>
          <g transform={at(0.24, 0.9, HORIZON + 2, 40)}>
            {[0, 1, 2, 3, 4].map((i) => {
              const wd = 74 - i * 9;
              const b = -i * 30;
              return (
                <g key={i}>
                  <rect x={-wd * 0.32} y={b - 22} width={wd * 0.64} height={22} fill={c("red")} />
                  <path d={`M${-wd / 2} ${b - 20} L${wd / 2} ${b - 20} L${wd * 0.3} ${b - 32} L${-wd * 0.3} ${b - 32} Z`} fill={c("bridge")} />
                </g>
              );
            })}
            <rect x={-2} y={-176} width={4} height={30} fill={c("bridge")} />
          </g>
          <Tree x={w * 0.31} y={HORIZON + 2} s={0.5 * k} leaf="blossom" leaf2="blossom2" />
          <Tree x={w * 0.55} y={HORIZON + 2} s={0.42 * k} leaf="blossom" leaf2="blossom2" />
        </g>
      );
    case "rome": {
      const arches = (base: number, h: number, to: number) =>
        Array.from({ length: Math.floor((to + 160) / 24) }, (_, i) => -160 + i * 24).map((x) => (
          <path key={`${base}${x}`} d={`M${x} ${base} v${-(h - 8)} a8 8 0 0 1 16 0 v${h - 8} Z`} fill={c("stone-sh")} />
        ));
      return (
        <g>
          <path d={`M0 ${HORIZON + 6} C ${w * 0.15} 360, ${w * 0.3} 370, ${w * 0.45} ${HORIZON} C ${w * 0.6} 380, ${w * 0.8} 360, ${w} 390 L ${w} ${HORIZON + 6} Z`} fill={c("hill-far")} />
          <g transform={at(0.38, 1.2, HORIZON + 2, 175)}>
            <path d="M-172 0 L-172 -116 Q-172 -132 -150 -132 L60 -132 L60 -112 L100 -112 L100 -80 L140 -80 L140 -48 L172 -48 L172 0 Z" fill={c("stone")} />
            {arches(-4, 34, 160)}
            {arches(-42, 32, 130)}
            {arches(-78, 30, 90)}
            {Array.from({ length: 9 }, (_, i) => (
              <rect key={i} x={-156 + i * 24} y={-124} width={8} height={7} fill={c("stone-sh")} />
            ))}
            <path d="M-172 -40 L172 -40 M-172 -76 L140 -76 M-172 -110 L100 -110" stroke={c("stone-sh")} strokeWidth={3} />
          </g>
          {[0.56, 0.585].map((x, i) => (
            <Cypress key={x} x={w * x} y={HORIZON + 2} s={k * (i % 2 ? 0.8 : 1)} />
          ))}
        </g>
      );
    }
    case "paris":
      return (
        <g>
          <path d={`M0 ${HORIZON + 6} C ${w * 0.2} 380, ${w * 0.5} 388, ${w} 396 L ${w} ${HORIZON + 6} Z`} fill={c("hill-far")} />
          {[0.25, 0.29, 0.52, 0.57].map((x, i) => {
            const t = -44 - (i % 2) * 8;
            return (
              <g key={x} transform={at(x, 0.9, HORIZON + 2, 30 + i * 52)}>
                <rect x={-26} y={t} width={52} height={-t} fill={c("stone")} />
                <path d={`M-28 ${t} L-18 ${t - 16} L18 ${t - 16} L28 ${t} Z`} fill={c("city2")} />
                {[-16, -2, 12].map((wx) => (
                  <rect key={wx} x={wx} y={-36} width={6} height={9} fill={c("stone-sh")} />
                ))}
              </g>
            );
          })}
          <g transform={at(0.41, 1, HORIZON + 4)}>
            <path d="M-72 0 C-50 -60 -28 -120 -15 -192 L-6 -272 L6 -272 L15 -192 C28 -120 50 -60 72 0 L48 0 Q0 -74 -48 0 Z" fill={c("iron")} />
            <path d="M-34 -100 L-20 -186 M34 -100 L20 -186 M-20 -100 L-8 -150 L8 -150 L20 -100 M-10 -186 L0 -230 L10 -186" stroke={c("sky-bottom")} strokeWidth={2} opacity={0.35} fill="none" />
            <rect x={-52} y={-104} width={104} height={9} rx={2} fill={c("iron")} />
            <rect x={-27} y={-190} width={54} height={7} rx={2} fill={c("iron")} />
            <rect x={-10} y={-268} width={20} height={9} rx={2} fill={c("iron")} />
            <rect x={-2} y={-304} width={4} height={36} fill={c("iron")} />
          </g>
          <Tree x={w * 0.33} y={HORIZON + 4} s={0.42 * k} />
          <Tree x={w * 0.48} y={HORIZON + 4} s={0.38 * k} />
        </g>
      );
    case "giza": {
      const pyramid = (fx: number, half: number, h: number) => (
        <g transform={at(fx)}>
          <path d={`M${-half} 0 L0 ${-h} L${half * 0.18} 0 Z`} fill={c("pyramid")} />
          <path d={`M0 ${-h} L${half} 0 L${half * 0.18} 0 Z`} fill={c("pyramid-sh")} />
        </g>
      );
      return (
        <g>
          {pyramid(0.5, 82, 92)}
          {pyramid(0.37, 175, 196)}
          {pyramid(0.22, 120, 136)}
          <Palm x={w * 0.615} y={HORIZON + 4} s={0.5 * k} />
          <Palm x={w * 0.64} y={HORIZON + 4} s={0.42 * k} flip />
        </g>
      );
    }
    case "singapore":
      return (
        <g>
          <Sea w={w} top={SHORE} />
          {[0.47, 0.5, 0.53].map((x, i) => (
            <Block key={x} x={w * x} w={34 * k} h={(70 + ((i * 47) % 70)) * k} tone={i % 2 ? "city2" : "city"} />
          ))}
          <g transform={at(0.37, 1.3, SHORE, 140)}>
            {[-48, -6, 36].map((x) => (
              <g key={x}>
                <path d={`M${x} 0 L${x + 2} -150 L${x + 24} -150 L${x + 26} 0 Z`} fill={c("city")} />
                {Array.from({ length: 9 }, (_, j) => (
                  <rect key={j} x={x + 6} y={-140 + j * 15} width={14} height={4} fill={c("window")} opacity={0.6} />
                ))}
              </g>
            ))}
            <path d="M-60 -150 L80 -158 Q 92 -158 96 -152 L-60 -146 Z" fill={c("city2")} />
          </g>
          {[0.23, 0.255, 0.28].map((x, i) => (
            <path key={x} transform={at(x, i % 2 ? 0.8 : 1, SHORE, 26 + i * 30)} d="M-3 0 L-3 -46 L-24 -78 Q 0 -86 24 -78 L3 -46 L3 0 Z" fill={c("supertree")} />
          ))}
          <g transform={at(0.61, 1, SHORE)}>
            <path d="M-26 0 L0 -64 L26 0" stroke={c("city2")} strokeWidth={4} fill="none" />
            <circle cx={0} cy={-64} r={52} stroke={c("city2")} strokeWidth={4} fill="none" />
            {Array.from({ length: 8 }, (_, i) => (
              <line key={i} x1={0} y1={-64} x2={52 * Math.cos((i * Math.PI) / 4)} y2={-64 + 52 * Math.sin((i * Math.PI) / 4)} stroke={c("city2")} strokeWidth={1.2} />
            ))}
          </g>
        </g>
      );
    case "sydney":
      return (
        <g>
          <Sea w={w} top={SHORE} />
          {[0.6, 0.63, 0.67, 0.71].map((x, i) => (
            <Block key={x} x={w * x} w={30 * k} h={(60 + ((i * 53) % 80)) * k} tone={i % 2 ? "city2" : "city"} />
          ))}
          <g transform={at(0.48, 1, SHORE)}>
            <path d="M-130 -26 Q 0 -150 130 -26" stroke={c("bridge")} strokeWidth={8} fill="none" />
            <path d="M-150 -26 L150 -26" stroke={c("bridge")} strokeWidth={5} />
            {[-96, -64, -32, 0, 32, 64, 96].map((x) => (
              <line key={x} x1={x} y1={-26} x2={x} y2={-26 - (1 - (x / 130) ** 2) * 62} stroke={c("bridge")} strokeWidth={1.5} />
            ))}
            {[-150, 130].map((x) => (
              <rect key={x} x={x} y={-56} width={20} height={56} fill={c("stone")} />
            ))}
          </g>
          <g transform={at(0.25, 1, SHORE)}>
            <rect x={-80} y={-12} width={170} height={12} fill={c("stone")} />
            {[
              [-70, 1],
              [-40, 1.25],
              [-8, 1.5],
              [30, 1.05],
              [56, 1.3],
            ].map(([x, s]) => (
              <g key={x} transform={`translate(${x} -12) scale(${s})`}>
                <path d="M0 0 Q 6 -38 34 -48 Q 26 -22 34 0 Z" fill={c("opera")} />
                <path d="M34 -48 Q 26 -22 34 0 L 26 0 Q 22 -24 34 -48 Z" fill={c("opera-sh")} />
              </g>
            ))}
          </g>
        </g>
      );
    case "newyork":
      return (
        <g>
          <Sea w={w} top={SHORE} />
          {[0.36, 0.39, 0.42, 0.53, 0.56, 0.59, 0.62].map((x, i) => (
            <Block key={x} x={w * x} w={30 * k} h={(70 + ((i * 61) % 110)) * k} tone={i % 2 ? "city2" : "city"} />
          ))}
          <g transform={at(0.48, 1, SHORE)}>
            <rect x={-28} y={-150} width={56} height={150} fill={c("city")} />
            <rect x={-20} y={-186} width={40} height={36} fill={c("city")} />
            <rect x={-12} y={-212} width={24} height={26} fill={c("city")} />
            <rect x={-2} y={-250} width={4} height={38} fill={c("city")} />
            {Array.from({ length: 30 }, (_, i) => (
              <rect key={i} x={-22 + (i % 5) * 10} y={-142 + Math.floor(i / 5) * 22} width={4} height={8} fill={c("window")} opacity={0.65} />
            ))}
          </g>
          <g transform={at(0.22, 1, SHORE + 8, 48)}>
            <path d="M-46 0 Q 0 -14 46 0 Z" fill={c("grass2")} />
            <path d="M-20 -6 L-16 -48 L16 -48 L20 -6 Z" fill={c("stone")} />
            <path d="M-12 -48 L-10 -96 Q 0 -104 10 -96 L12 -48 Z" fill={c("liberty")} />
            <circle cx={0} cy={-106} r={8} fill={c("liberty")} />
            <path d="M-9 -112 L-14 -122 L-5 -114 L0 -126 L5 -114 L14 -122 L9 -112 Z" fill={c("liberty")} />
            <path d="M7 -96 L16 -128 L21 -127 L13 -95 Z" fill={c("liberty")} />
            <path d="M18 -128 Q 12 -138 19 -146 Q 26 -138 20 -128 Z" fill={c("light")} />
          </g>
        </g>
      );
    default:
      return null;
  }
}

/** `crop` (an aspect ratio) frames just the skyline, for the small previews in the scene menu. */
export const Scenery = memo(function Scenery({ scene, width, crop }: { scene: GardenScene; width: number; crop?: number }) {
  const w = Math.max(420, width);
  const sky = `gd-sky${useId().replace(/:/g, "")}`; // unique, since the picker shows several scenes at once
  const rnd = seeded(scene.length * 7919 + 13);
  const stars = Array.from({ length: 40 }, () => ({ x: rnd() * w, y: rnd() * (HORIZON - 120), r: 0.8 + rnd() * 1.6 }));
  const ground = sceneFor(scene).ground;
  const dots = Array.from({ length: Math.round(w / 40) }, () => ({ x: rnd() * w, y: HORIZON + 40 + rnd() * (H - HORIZON - 50), k: Math.floor(rnd() * 3) }));
  const tufts = Array.from({ length: Math.round(w / 30) }, () => ({ x: rnd() * w, y: HORIZON + 20 + rnd() * (H - HORIZON - 30) }));
  return (
    <svg className="gd-scenery" viewBox={crop ? `${w * 0.1} ${HORIZON + 70 - (w * 0.62) / crop} ${w * 0.62} ${(w * 0.62) / crop}` : `0 0 ${w} ${H}`} preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <defs>
        <linearGradient id={sky} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={c("sky-top")} />
          <stop offset="1" stopColor={c("sky-bottom")} />
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={w} height={H} fill={`url(#${sky})`} />
      <g style={{ opacity: "var(--gd-star-op)" }}>
        {stars.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} fill={c("star")} />
        ))}
      </g>
      <circle cx={w * 0.8} cy={130} r={86} fill={c("sun")} opacity={0.18} />
      <circle cx={w * 0.8} cy={130} r={52} fill={c("sun")} />
      <Cloud x={w * 0.15} y={110} s={1.1} delay={-20} />
      <Cloud x={w * 0.5} y={70} s={0.8} delay={-70} />
      <Cloud x={w * 0.75} y={190} s={0.9} delay={-110} />

      {scene === "meadow" && (
        <g>
          <path d={`M0 ${HORIZON + 6} C ${w * 0.12} 330, ${w * 0.26} 330, ${w * 0.4} ${HORIZON} C ${w * 0.52} 360, ${w * 0.64} 350, ${w * 0.76} ${HORIZON} C ${w * 0.86} 372, ${w * 0.94} 372, ${w} 400 L ${w} ${HORIZON + 6} Z`} fill={c("hill-far")} />
          <Tree x={w * 0.3} y={HORIZON + 2} s={0.55} />
          <Tree x={w * 0.36} y={HORIZON + 4} s={0.42} />
          <Tree x={w * 0.48} y={HORIZON + 2} s={0.5} />
        </g>
      )}
      {scene === "mountains" && (
        <g>
          <path d={`M${-w * 0.05} ${HORIZON} L${w * 0.14} 250 L${w * 0.3} ${HORIZON} Z`} fill={c("mtn2")} />
          <path d={`M${w * 0.18} ${HORIZON} L${w * 0.36} 190 L${w * 0.56} ${HORIZON} Z`} fill={c("mtn")} />
          <path d={`M${w * 0.36} 190 L${w * 0.308} 260 L${w * 0.325} 252 L${w * 0.342} 266 L${w * 0.36} 254 L${w * 0.38} 268 L${w * 0.398} 252 L${w * 0.418} 260 Z`} fill={c("snow")} />
          <path d={`M${w * 0.5} ${HORIZON} L${w * 0.66} 270 L${w * 0.82} ${HORIZON} Z`} fill={c("mtn2")} />
          <path d={`M${w * 0.72} ${HORIZON} L${w * 0.9} 220 L${w * 1.08} ${HORIZON} Z`} fill={c("mtn")} />
          <path d={`M${w * 0.9} 220 L${w * 0.849} 280 L${w * 0.865} 272 L${w * 0.88} 286 L${w * 0.9} 274 L${w * 0.92} 288 L${w * 0.935} 272 L${w * 0.951} 280 Z`} fill={c("snow")} />
          {[0.04, 0.24, 0.27, 0.46].map((x) => (
            <Pine key={x} x={w * x} y={HORIZON + 4} s={0.6} />
          ))}
        </g>
      )}
      {scene === "beach" && <Sea w={w} top={360} sail />}

      <Landmark scene={scene} w={w} />

      <rect x={0} y={HORIZON} width={w} height={H - HORIZON} fill={c(ground)} />
      {tufts.map((t, i) => (
        <path key={i} d={`M${t.x - 6} ${t.y} L${t.x - 2} ${t.y - 9} L${t.x} ${t.y} L${t.x + 3} ${t.y - 10} L${t.x + 6} ${t.y}`} stroke={c(`${ground}2`)} strokeWidth={2} fill="none" strokeLinejoin="round" />
      ))}
      <Airfield w={w} />
      {dots.map((d, i) =>
        ground === "sand" ? (
          <ellipse key={i} cx={d.x} cy={d.y} rx={5} ry={3} fill={c("sand2")} />
        ) : (
          <g key={i}>
            <circle cx={d.x} cy={d.y} r={5} fill={c(["flower-a", "flower-b", "flower-c"][d.k])} />
            <circle cx={d.x} cy={d.y} r={2} fill={c("sun")} />
          </g>
        ),
      )}
      {scene === "meadow" && <Tree x={w * 0.035} y={H * 0.74} s={1.3} />}
      {scene === "mountains" && <Pine x={w * 0.035} y={H * 0.74} s={1.6} />}
      {(scene === "beach" || scene === "giza" || scene === "singapore") && <Palm x={w * 0.02} y={H * 0.78} s={1.2} />}
      {scene === "fuji" && <Tree x={w * 0.035} y={H * 0.74} s={1.3} leaf="blossom" leaf2="blossom2" />}
      {scene === "rome" && <Cypress x={w * 0.035} y={H * 0.76} s={1.7} />}
      {(scene === "paris" || scene === "sydney" || scene === "newyork") && <Tree x={w * 0.035} y={H * 0.74} s={1.3} />}
    </svg>
  );
});
