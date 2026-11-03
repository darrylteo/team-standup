/**
 * Crew avatars: a bust portrait drawn as an SVG string on a 100×100 grid. Our own drawing in the spirit of modern
 * sports-game avatars, with pastel two-tone cel shading and a faint same-hue edge. Every colour is a CSS custom
 * property (var(--av-*)) defined in src/client/styles/tokens.css.
 *
 * avatarSVG(spec, opts) → string
 *
 * spec = {
 *   kind:        "human" | "dog_shiba" | "dog_beagle" | "cat_tabby" | "cat_tuxedo" | "cow" | "rabbit"   (default "human")
 *   // human only
 *   body:        "male" | "female"                                   (default "male")
 *   skin:        "s1" … "s7"  light → deep                           (default "s3")
 *   hair:        "bald" | "short" | "side" | "spiky" | "curly" | "long" | "bun" | "ponytail"
 *                                                                    (default "short" male, "long" female)
 *   hairColor:   "h1" black · "h2" dark brown · "h3" brown · "h4" auburn · "h5" blonde · "h6" grey · "h7" navy · "h8" rose
 *   eyes:        "round" | "almond" | "dot"                          (default "round")
 *   brows:       "soft" | "bold" | "arched"                          (default "soft")
 *   facialHair:  "none" | "stubble" | "beard" | "moustache"          (male only; ignored for female)
 *   // all kinds
 *   outfit:      "captain" (pilot cap + 4 stripes) | "first_officer" (3 stripes) | "cabin_crew" (scarf + pillbox cap)
 *                | "ground_crew" (hi-vis vest + ear defenders) | "engineer" (coveralls + headset)
 *                | "aviator" (leather bomber + goggles) | "casual" (hoodie) | "lab" (lab coat)   (default "casual")
 *   outfitColor: "o1" navy · "o2" sky · "o3" red · "o4" green · "o5" plum · "o6" charcoal          (default "o2")
 *   accessory:   "none" | "glasses" | "sunglasses" | "headset"        (default "none")
 * }
 * opts = { sleep?: boolean (closed happy eyes), title?: string, headOnly?: boolean (just the head, hair and headwear,
 *          for the garden's chibi figures), back?: boolean (seen from behind) }
 */

const V = (k) => `var(--av-${k})`;
let UID = 0;

// Scene-graph helpers. Each element: geometry + fill/shade tokens + flags (sil = part of silhouette, out = outline-able).
const P = (d, fill, o = {}) => ({ t: "path", a: { d }, fill, ...o });
const E = (cx, cy, rx, ry, fill, o = {}) => ({ t: "ellipse", a: { cx, cy, rx, ry }, fill, ...o });
const C = (cx, cy, r, fill, o = {}) => ({ t: "circle", a: { cx, cy, r }, fill, ...o });
const R = (x, y, width, height, rx, fill, o = {}) => ({ t: "rect", a: { x, y, width, height, rx }, fill, ...o });
const S = (d, stroke, sw, o = {}) => ({ t: "path", a: { d }, fill: null, stroke, sw, ...o });

const withTr = (els, tr) => (tr ? els.map((e) => ({ ...e, tr: e.tr ? `${tr} ${e.tr}` : tr })) : els);

// ---------- outfits ----------
function epaulette(cx, cy, rot, oc, n) {
  const tr = `rotate(${rot} ${cx} ${cy})`;
  const els = [R(cx - 8, cy - 3, 16, 6, 1.6, `${oc}-sh`, { tr, out: true })];
  const start = rot < 0 ? cx - 6.6 : cx + 6.6 - 1.7 - (n - 1) * 3.2;
  for (let i = 0; i < n; i++) els.push(R(start + i * 3.2, cy - 2.2, 1.7, 4.4, 0.4, "gold", { tr }));
  return els;
}

function outfit(kind, B, oc) {
  const n = 50 - B.nw / 2, m = 50 + B.nw / 2, t = B.top, ocs = `${oc}-sh`;
  const garment = (fill, shade) => [P(B.path, fill, { shade, sil: true })];
  switch (kind) {
    case "captain":
    case "first_officer":
      return [
        ...garment("white", "white-sh"),
        P(`M${n - 0.5} ${t - 1.5} L50 ${t + 8} L${n - 6.5} ${t + 5.5} Z`, "white", { shade: "white-sh", out: true }),
        P(`M${m + 0.5} ${t - 1.5} L50 ${t + 8} L${m + 6.5} ${t + 5.5} Z`, "white", { shade: "white-sh", out: true }),
        P(`M48 ${t + 2.5} L52 ${t + 2.5} L53.6 ${t + 20} L50 ${t + 25} L46.4 ${t + 20} Z`, oc, { shade: ocs, out: true }),
        // Epaulettes sit just outside the collar so they stay inside a circular crop.
        ...epaulette(50 - B.nw / 2 - 12.5, t + 4.5, -15, oc, kind === "captain" ? 4 : 3),
        ...epaulette(50 + B.nw / 2 + 12.5, t + 4.5, 15, oc, kind === "captain" ? 4 : 3),
      ];
    case "cabin_crew":
      return [
        ...garment(oc, ocs),
        P(`M${n - 1} ${t - 1} L50 ${t + 17} L${m + 1} ${t - 1} Z`, "white", { out: true }),
        P(`M${n - 1} ${t - 1} L50 ${t + 17} L${n - 5} ${t + 14} L${n - 8.5} ${t + 3} Z`, ocs, { out: true }),
        P(`M${m + 1} ${t - 1} L50 ${t + 17} L${m + 5} ${t + 14} L${m + 8.5} ${t + 3} Z`, ocs, { out: true }),
        C(50, t + 21, 1.2, "gold"),
        C(50, t + 26, 1.2, "gold"),
        S(`M${n} ${t - 1.5} Q50 ${t + 3.5} ${m} ${t - 1.5}`, "scarf", 3),
        P(`M50 ${t + 3} L55.5 ${t + 12} L58.8 ${t + 9.2} Z`, "scarf", { shade: "scarf-sh", out: true }),
        P(`M50 ${t + 3} L51.6 ${t + 13.8} L55 ${t + 13.2} Z`, "scarf", { shade: "scarf-sh", out: true }),
        C(50, t + 2.6, 2.6, "scarf", { out: true }),
      ];
    case "ground_crew":
      return [
        ...garment(oc, ocs),
        S(`M${n - 1} ${t} Q50 ${t + 6} ${m + 1} ${t}`, ocs, 1.6),
        P(`M${B.x0 + 3} 106 C${B.x0 + 3} ${t + 10} ${B.x0 + 11} ${t + 3} ${n - 1.5} ${t} L47 ${t + 22} L47 106 Z`, "hivis", { shade: "hivis-sh", out: true }),
        P(`M${B.x1 - 3} 106 C${B.x1 - 3} ${t + 10} ${B.x1 - 11} ${t + 3} ${m + 1.5} ${t} L53 ${t + 22} L53 106 Z`, "hivis", { shade: "hivis-sh", out: true }),
        R(B.x0 + 6, t + 14, 47 - (B.x0 + 6), 2.8, 0, "reflect"),
        R(53, t + 14, B.x1 - 6 - 53, 2.8, 0, "reflect"),
        R(B.x0 + 4.5, t + 20.5, 47 - (B.x0 + 4.5), 2.8, 0, "reflect"),
        R(53, t + 20.5, B.x1 - 4.5 - 53, 2.8, 0, "reflect"),
      ];
    case "engineer":
      return [
        ...garment(oc, ocs),
        P(`M${n - 1} ${t - 1.5} L50 ${t + 7} L${n - 9} ${t + 5.5} Z`, ocs, { out: true }),
        P(`M${m + 1} ${t - 1.5} L50 ${t + 7} L${m + 9} ${t + 5.5} Z`, ocs, { out: true }),
        S(`M50 ${t + 7} L50 106`, "reflect", 1.4),
        R(33, t + 11, 10, 7, 1.4, ocs),
        R(57, t + 11, 10, 5.5, 1.2, "white", { out: true }),
        S(`M58.6 ${t + 13.7} L65.4 ${t + 13.7}`, oc, 1.2),
      ];
    case "aviator":
      return [
        ...garment("leather", "leather-sh"),
        S(`M50 ${t + 8} L50 106`, "leather-sh", 1.3),
        P(`M50 ${t + 4} L55.5 ${t + 4} L60 ${t + 19} L54.5 ${t + 20} Z`, oc, { shade: ocs, out: true }),
        P(`M${n - 10} ${t + 1.5} C${n - 8} ${t - 5.5} ${m + 8} ${t - 5.5} ${m + 10} ${t + 1.5} C${m + 4} ${t + 9} ${n - 4} ${t + 9} ${n - 10} ${t + 1.5} Z`, "shearling", { shade: "shearling-sh", out: true }),
      ];
    case "lab":
      return [
        ...garment(oc, ocs),
        P(`M${B.x0} 106 C${B.x0} ${t + 8} ${B.x0 + 10} ${t + 0.5} ${n - 1.5} ${t - 1} L46 ${t + 12} L48.5 106 Z`, "white", { shade: "white-sh", out: true }),
        P(`M${B.x1} 106 C${B.x1} ${t + 8} ${B.x1 - 10} ${t + 0.5} ${m + 1.5} ${t - 1} L54 ${t + 12} L51.5 106 Z`, "white", { shade: "white-sh", out: true }),
        S(`M${n - 1.5} ${t - 1} L${n - 5} ${t + 6} L46 ${t + 12}`, "white-sh", 1.2),
        S(`M${m + 1.5} ${t - 1} L${m + 5} ${t + 6} L54 ${t + 12}`, "white-sh", 1.2),
        R(61, t + 11, 1.8, 7, 0.9, "pen"),
        S(`M58 ${t + 14} L67 ${t + 14}`, "white-sh", 1.2),
      ];
    case "casual":
    default:
      return [
        ...garment(oc, ocs),
        P(`M${n - 8.5} ${t + 2.5} C${n - 9} ${t - 6} ${m + 9} ${t - 6} ${m + 8.5} ${t + 2.5} C${m + 3} ${t + 5.5} ${n - 3} ${t + 5.5} ${n - 8.5} ${t + 2.5} Z`, ocs, { out: true }),
        S(`M47 ${t + 4} L46.3 ${t + 15}`, "white", 1.2),
        S(`M53 ${t + 4} L53.7 ${t + 15}`, "white", 1.2),
        C(46.3, t + 15.6, 1, "white"),
        C(53.7, t + 15.6, 1, "white"),
        S(`M37 106 L39.5 ${t + 20} L60.5 ${t + 20} L63 106`, ocs, 1.4),
      ];
  }
}

// ---------- headwear + accessories ----------
const HEADSET = [
  S("M25.5 45 C22.5 17.5 77.5 17.5 74.5 45", "gear", 2.6),
  R(21, 40, 7.5, 12, 3.4, "gear", { out: true }),
  R(71.5, 40, 7.5, 12, 3.4, "gear", { out: true }),
  S("M25 50 C26 59 33 62.5 41.5 61.5", "gear", 1.7),
  C(42.5, 61.3, 2, "gear"),
];

/**
 * Flight-attendant pillbox hat: a small solid drum in the outfit colour with a lighter top,
 * a thin gold band and a tiny wing badge, worn tilted. (cx, cy) is the centre of the drum.
 */
function pillbox(cx, cy, rot, oc, scale = 1) {
  const tr = `translate(${cx} ${cy}) rotate(${rot}) scale(${scale})`;
  return [
    P("M-9 -2.6 L-8.3 3.8 Q0 6.6 8.3 3.8 L9 -2.6 Z", oc, { shade: `${oc}-sh`, sil: true, tr }),
    E(0, -2.6, 9, 2.7, oc, { sil: true, tr }),
    E(0, -2.6, 9, 2.7, "hi", { op: 0.16, tr }),
    S("M-8.5 2 Q0 4.9 8.5 2", "gold", 1.1, { tr }),
    P("M-3.2 -0.1 Q-1.6 -1.3 0 -0.5 Q1.6 -1.3 3.2 -0.1 Q1.6 0.6 0 0.2 Q-1.6 0.6 -3.2 -0.1 Z", "gold", { tr }),
    C(0, -0.4, 0.75, "gold", { tr }),
  ];
}

/** The pilot cap's band, peak and badge: drawn again over ears that poke through the crown, so they come out of its middle. */
function capFront() {
  return [
    P("M26 27.5 C40 30 60 30 74 27.5 L74 33.5 C60 36 40 36 26 33.5 Z", "band", { out: true }),
    S("M27 30.4 C40 32.8 60 32.8 73 30.4", "gold", 1.1),
    P("M26 33 C34 41.5 66 41.5 74 33 C64 36.8 36 36.8 26 33 Z", "peak", { out: true }),
    P("M42.5 24.3 C45 22 48 22.5 50 24 C52 22.5 55 22 57.5 24.3 C55 25.5 52.5 25.8 50 25.4 C47.5 25.8 45 25.5 42.5 24.3 Z", "gold"),
    C(50, 23.6, 1.9, "gold"),
  ];
}

/** The lower half of the tall pilot crown (below the badge) plus its front, for drawing over animal ears. */
function capLower(oc) {
  return [P("M20 29.5 C19.7 27.4 20.3 25.3 21.4 23.5 L78.6 23.5 C79.7 25.3 80.3 27.4 80 29.5 Z", oc, { shade: `${oc}-sh` }), ...capFront()];
}

function headwear(kind, oc) {
  switch (kind) {
    case "captain":
      return [
        P("M20 29.5 C18 8.5 82 8.5 80 29.5 C66 33 34 33 20 29.5 Z", oc, { shade: `${oc}-sh`, sil: true }),
        ...capFront(),
      ];
    case "cabin_crew":
      return pillbox(60, 16.5, -12, oc, 1.1);
    case "ground_crew":
      return [
        S("M24.8 47 C21.5 16.5 78.5 16.5 75.2 47", "gear", 3.4),
        R(19.5, 39.5, 9, 15, 4.2, "hivis-cup", { out: true }),
        R(71.5, 39.5, 9, 15, 4.2, "hivis-cup", { out: true }),
      ];
    case "engineer":
      return HEADSET;
    case "aviator":
      return [
        S("M24.5 33.5 C34 29.5 66 29.5 75.5 33.5", "leather-sh", 3.2),
        C(42, 30.5, 5.6, "lens", { stroke: "brass", sw: 1.8 }),
        C(58, 30.5, 5.6, "lens", { stroke: "brass", sw: 1.8 }),
        S("M47.4 30.2 Q50 28.6 52.6 30.2", "brass", 1.6),
        S("M39.2 28.6 Q40.5 27 42.6 26.8", "hi", 1.1, { op: 0.8 }),
        S("M55.2 28.6 Q56.5 27 58.6 26.8", "hi", 1.1, { op: 0.8 }),
      ];
    default:
      return [];
  }
}

function accessory(kind, outfitKind) {
  switch (kind) {
    case "glasses":
      return [
        C(41, 47, 5.4, null, { stroke: "ink", sw: 1.5 }),
        C(59, 47, 5.4, null, { stroke: "ink", sw: 1.5 }),
        S("M46.4 46.5 Q50 45 53.6 46.5", "ink", 1.4),
      ];
    case "sunglasses":
      return [
        P("M34.5 44.3 Q41 42.8 47 44.3 Q47 51.2 41 51.6 Q35 51.2 34.5 44.3 Z", "shade-lens", { out: true }),
        P("M53 44.3 Q59 42.8 65.5 44.3 Q65 51.2 59 51.6 Q53 51.2 53 44.3 Z", "shade-lens", { out: true }),
        S("M47 45 Q50 43.8 53 45", "ink", 1.4),
        S("M36.8 46.2 L40.2 45.4", "hi", 0.9, { op: 0.8 }),
        S("M55.3 46.2 L58.7 45.4", "hi", 0.9, { op: 0.8 }),
      ];
    case "headset":
      return outfitKind === "engineer" ? [] : HEADSET;
    default:
      return [];
  }
}

// ---------- faces ----------
function animalEyes(style, sleep, opts = {}) {
  const { y = 47, iris = null } = opts;
  const ink = "ink";
  const out = [];
  for (const x of [41, 59]) {
    if (sleep) {
      out.push(S(`M${x - 2.9} ${y + 1.2} Q${x} ${y - 2.4} ${x + 2.9} ${y + 1.2}`, iris ? "white" : ink, 1.8));
      continue;
    }
    if (iris) {
      out.push(E(x, y - 0.5, 3, 3.4, iris), E(x, y - 0.5, 1.1, 2.9, "ink"), C(x + 1, y - 1.7, 0.8, "hi"));
    } else if (style === "almond") {
      out.push(E(x, y + 0.3, 3.1, 2.3, ink), C(x + 1, y - 0.5, 0.8, "hi"));
    } else if (style === "dot") {
      out.push(C(x, y + 0.2, 2.1, ink), C(x + 0.7, y - 0.6, 0.65, "hi"));
    } else {
      out.push(E(x, y, 2.5, 3.4, ink), C(x + 0.9, y - 1.3, 0.95, "hi"));
    }
  }
  return out;
}

const CHEEKS = (y = 55, dx = 13.7) => [E(50 - dx, y, 3.7, 2.3, "blush", { op: 0.45 }), E(50 + dx, y, 3.7, 2.3, "blush", { op: 0.45 })];
const W_MOUTH = (y = 57.2) => S(`M46.5 ${y} Q48.3 ${y + 1.8} 50 ${y} Q51.7 ${y + 1.8} 53.5 ${y}`, "ink", 1.3);
const WHISKERS = (c) => [
  S("M38.5 55 L27.5 53", c, 0.8), S("M38.5 57 L27.5 57.5", c, 0.8), S("M39 59 L29 62", c, 0.8),
  S("M61.5 55 L72.5 53", c, 0.8), S("M61.5 57 L72.5 57.5", c, 0.8), S("M61 59 L71 62", c, 0.8),
];

function animal(kind, sleep) {
  // ears: drawn behind the head, or in front of a hat so they poke through it
  const pointy = (fill, sh, inner) => [
    P("M27.5 37 L29.5 15 L44.5 27 Z", fill, { shade: sh, sil: true }),
    P("M31 32.5 L32.4 20.6 L40 27.4 Z", inner),
    P("M72.5 37 L70.5 15 L55.5 27 Z", fill, { shade: sh, sil: true }),
    P("M69 32.5 L67.6 20.6 L60 27.4 Z", inner),
  ];
  const head = (fill, sh) => [E(50, 47, 23.5, 22.5, fill, { shade: sh, sil: true })];
  switch (kind) {
    case "dog_shiba":
      return {
        ears: pointy("shiba", "shiba-sh", "cream"),
        head: [
          ...head("shiba", "shiba-sh"),
          P("M27.5 50 C29.5 62.5 39.5 69.5 50 69.5 C60.5 69.5 70.5 62.5 72.5 50 C66 54 60 52 56 48.5 L50 52 L44 48.5 C40 52 34 54 27.5 50 Z", "cream", { shade: "cream-sh" }),
          E(41, 40.3, 2.5, 1.6, "cream"),
          E(59, 40.3, 2.5, 1.6, "cream"),
        ],
        face: [...CHEEKS(55.5, 15), ...animalEyes("round", sleep), E(50, 53.3, 3.2, 2.3, "ink"), W_MOUTH(57.4)],
      };
    case "dog_beagle":
      return {
        ears: [],
        head: [
          ...head("beagle", "beagle-sh"),
          P("M46.5 24 C48.5 22.5 51.5 22.5 53.5 24 L55.5 48 C61.5 51.5 64 59.5 59 66 C55 70.5 45 70.5 41 66 C36 59.5 38.5 51.5 44.5 48 Z", "white", { shade: "white-sh" }),
          P("M29.5 31 C19 32 15.5 51 20 63 C23 70 31 68 32 59 L32.5 38 C32.5 34 31.5 31.5 29.5 31 Z", "beagle-ear", { shade: "beagle-ear-sh", sil: true }),
          P("M70.5 31 C81 32 84.5 51 80 63 C77 70 69 68 68 59 L67.5 38 C67.5 34 68.5 31.5 70.5 31 Z", "beagle-ear", { shade: "beagle-ear-sh", sil: true }),
        ],
        face: [...CHEEKS(56, 15.5), ...animalEyes("round", sleep), E(50, 54.6, 3.6, 2.6, "ink"), W_MOUTH(58.8)],
      };
    case "cat_tabby":
      return {
        ears: pointy("tabby", "tabby-sh", "ear-pink"),
        head: [
          ...head("tabby", "tabby-sh"),
          S("M50 26 L50 32.5", "tabby-stripe", 2),
          S("M44.5 27.8 L45.6 32.2", "tabby-stripe", 1.7),
          S("M55.5 27.8 L54.4 32.2", "tabby-stripe", 1.7),
          S("M27.2 47.5 L33 48.6", "tabby-stripe", 1.5),
          S("M27.8 52 L33 52.3", "tabby-stripe", 1.5),
          S("M72.8 47.5 L67 48.6", "tabby-stripe", 1.5),
          S("M72.2 52 L67 52.3", "tabby-stripe", 1.5),
        ],
        face: [...CHEEKS(55.5, 14.5), ...animalEyes("round", sleep), P("M48 52.6 L52 52.6 L50 54.8 Z", "nose-pink"), W_MOUTH(56.6), ...WHISKERS("tabby-stripe")],
      };
    case "cat_tuxedo":
      return {
        ears: pointy("tux", "tux-sh", "ear-pink"),
        head: [
          ...head("tux", "tux-sh"),
          P("M35.5 55 C35.5 48.5 43.5 48 50 52 C56.5 48 64.5 48.5 64.5 55 C64.5 64.5 57.5 69.5 50 69.5 C42.5 69.5 35.5 64.5 35.5 55 Z", "white", { shade: "white-sh" }),
        ],
        face: [...CHEEKS(55.5, 15.5), ...animalEyes("round", sleep, { iris: "eye-cat" }), P("M48 53 L52 53 L50 55.2 Z", "nose-pink"), W_MOUTH(57.2), ...WHISKERS("white-sh")],
      };
    case "cow":
      return {
        ears: [
          P("M33.5 28 C28.5 23 29 16.5 32.5 15.5 C33 20 36.5 23.5 39 25.5 Z", "horn", { sil: true }),
          P("M66.5 28 C71.5 23 71 16.5 67.5 15.5 C67 20 63.5 23.5 61 25.5 Z", "horn", { sil: true }),
          E(23.5, 41, 7.2, 3.6, "cow", { shade: "cow-sh", sil: true, tr: "rotate(-22 23.5 41)" }),
          E(23.5, 41, 4.6, 2, "ear-pink", { tr: "rotate(-22 23.5 41)" }),
          E(76.5, 41, 7.2, 3.6, "cow", { shade: "cow-sh", sil: true, tr: "rotate(22 76.5 41)" }),
          E(76.5, 41, 4.6, 2, "ear-pink", { tr: "rotate(22 76.5 41)" }),
        ],
        earsBehindHat: true,
        head: [
          ...head("cow", "cow-sh"),
          P("M55 25.5 C64.5 24.5 72.5 32 70.5 42.5 C66.5 46.5 58 44.5 56 38.5 C54.2 34 52 29.5 55 25.5 Z", "cow-patch"),
        ],
        face: [
          ...CHEEKS(52.5, 18),
          ...animalEyes("round", sleep, { y: 45.5 }),
          E(50, 60.5, 13.5, 8.2, "muzzle", { shade: "muzzle-sh", out: true }),
          E(45.5, 59.5, 1.6, 2.2, "nose-pink"),
          E(54.5, 59.5, 1.6, 2.2, "nose-pink"),
          S("M46 64.8 Q50 66.8 54 64.8", "mouth", 1.3),
        ],
      };
    case "rabbit":
    default:
      return {
        ears: [
          P("M38.5 30 C33.5 17 33 4.5 38.5 3 C44 1.8 45.5 16 44.5 29 Z", "rabbit", { shade: "rabbit-sh", sil: true }),
          P("M39.5 27 C37 17 37 8 39.5 7 C42 6.5 42.5 16 42 27 Z", "ear-pink"),
          P("M55.5 29 C55 18 58 9 63 6.5 C67.5 4.5 69 9 66.5 13 C63.5 18 61.5 24 61.5 30 Z", "rabbit", { shade: "rabbit-sh", sil: true }),
          P("M57.5 27 C57.5 19 60 12 63.5 9.5 C65.5 8.5 66 11 64.5 13 C61.5 17.5 60 22.5 60 27 Z", "ear-pink"),
        ],
        head: head("rabbit", "rabbit-sh"),
        face: [
          ...CHEEKS(55, 14),
          ...animalEyes("round", sleep),
          P("M48.3 53 L51.7 53 L50 54.8 Z", "nose-pink"),
          S("M47 56.8 Q48.5 58.4 50 56.8 Q51.5 58.4 53 56.8", "ink", 1.2),
          R(48.3, 57.4, 3.4, 3.6, 0.8, "white", { out: true }),
          S("M50 57.5 L50 60.8", "white-sh", 0.6),
        ],
      };
  }
}

// ---------- assembly ----------
const DEFAULTS = { kind: "human", body: "male", skin: "s3", hairColor: "h2", eyes: "round", brows: "soft", facialHair: "none", outfit: "casual", outfitColor: "o2", accessory: "none" };
const HATS = new Set(["captain", "cabin_crew"]);

// An oval head with a defined chin, visible neck, slim natural shoulders, big expressive eyes with catch-lights,
// and sculpted multi-clump hair over a darker inner layer.

// Male: broad, squared shoulders and a wider neck. Female: narrower, sloping shoulders and a slender neck.
const BODY = {
  male: { path: "M11 106 C11 90 19 84.5 32 81.6 C37 80.6 41.5 80.2 43.5 80 L56.5 80 C58.5 80.2 63 80.6 68 81.6 C81 84.5 89 90 89 106 Z", x0: 11, x1: 89, top: 80, nw: 13.5 },
  female: { path: "M22 106 C22 95 27.5 88 36 85 C40.5 83.4 43.8 82.4 46 81.9 L54 81.9 C56.2 82.4 59.5 83.4 64 85 C72.5 88 78 95 78 106 Z", x0: 22, x1: 78, top: 81.9, nw: 8.2 },
  animal: { path: "M15 106 C15 92 24 84.5 36 82 C40 81.3 42.5 81 43.5 81 L56.5 81 C57.5 81 60 81.3 64 82 C76 84.5 85 92 85 106 Z", x0: 15, x1: 85, top: 81, nw: 13 },
};
const HEAD = {
  // male: broader, with squared jaw corners and a flat chin
  male: "M29.5 42 C29.5 26.6 38.8 19.2 50 19.2 C61.2 19.2 70.5 26.6 70.5 42 C70.5 51 69.4 57.6 66.4 62.2 C63 67.4 57.4 70.6 50 70.6 C42.6 70.6 37 67.4 33.6 62.2 C30.6 57.6 29.5 51 29.5 42 Z",
  // female: narrower, rounder cheeks tapering to a small soft chin
  female: "M32 42.5 C32 27.6 40.2 21 50 21 C59.8 21 68 27.6 68 42.5 C68 51.6 66 58.4 61.6 63.6 C58.2 67.6 54.2 69.6 50 69.6 C45.8 69.6 41.8 67.6 38.4 63.6 C34 58.4 32 51.6 32 42.5 Z",
};
// Headwear and accessories were first drawn for a rounder head; these scale them to the current face.
const HW = "translate(50 44) scale(0.86 0.9) translate(-50 -44)";
const ACC = "translate(50 45.6) scale(0.855 0.9) translate(-50 -47)";
const NARROW = "translate(50 44) scale(0.95 1) translate(-50 -44)";
const ANIMAL = "translate(50 47) scale(0.9 0.97) translate(-50 -47)";

function hair(style, h, female) {
  const sh = `${h}-sh`;
  const F = (d, o = {}) => P(d, h, { shade: sh, sil: true, ...o });
  const strand = (d, w = 0.9) => S(d, sh, w, { op: 0.9 });
  const BACK = P("M29 46 C27.5 29 36 16 50 16 C64 16 72.5 29 71 46 C69.5 40 68 35 65 32 L35 32 C32 35 30.5 40 29 46 Z", sh, { sil: true });
  // Sideburns rise from the cheek into the temples and are drawn under the hair, so they grow out of it.
  const BURNS = [
    P("M28.8 36 C28.9 42 29.5 47 31 51 L32.4 50.5 C32 46 32.2 41 33.4 36 C34 33.4 34.8 31.2 36 29.4 C32 30 29.6 32 28.8 36 Z", h, { shade: sh }),
    P("M71.2 36 C71.1 42 70.5 47 69 51 L67.6 50.5 C68 46 67.8 41 66.6 36 C66 33.4 65.2 31.2 64 29.4 C68 30 70.4 32 71.2 36 Z", h, { shade: sh }),
  ];
  const LONG_BACK = P("M27 44 C25.5 24 36 13.5 50 13.5 C64 13.5 74.5 24 73 44 L75.5 76 C70 80 63.6 79 61.6 74.6 L62 57 L38 57 L38.4 74.6 C36.4 79 30 80 24.5 76 Z", sh, { sil: true });
  const SLEEK = "M30.2 41 C29.6 26.6 38.4 16.6 50 16.6 C61.6 16.6 70.4 26.6 69.8 41 C67 33 60.4 28.6 50 28.6 C39.6 28.6 33 33 30.2 41 Z";
  switch (style) {
    case "bald":
      return { back: [], front: [P("M30.4 40 C30 27 38.6 19.6 50 19.6 C61.4 19.6 70 27 69.6 40 C67 33.4 60 29.6 50 29.6 C40 29.6 33 33.4 30.4 40 Z", h, { op: 0.28 })] };
    case "side":
      if (female)
        return {
          back: [LONG_BACK],
          front: [
            F("M40.5 15.2 C33 17 29 24 28.6 34 C28.2 44 29 56 27.6 68 C27.2 71.5 30.6 72.4 31.6 69.6 C33 60 32.8 48 33.4 40 C34.4 34.6 36.6 31.6 39 31 Z"),
            F("M40.5 15.2 C54 13.6 68 18 71.5 31 C74 41 72.5 56 74.4 70 C75 75 70.4 77 68.6 73 C66.6 63 67.4 50 65.6 41 C63.6 34 57 29.6 49 29.4 C45 29.4 41.6 31 39 33 C40 27 40.4 21 40.5 15.2 Z"),
            strand("M44 17 Q60 19 66 33"),
            strand("M50 21 Q63 26 68 45"),
            strand("M68.5 50 Q69.5 60 71.5 70"),
          ],
        };
      return {
        back: [BACK],
        front: [
          ...BURNS,
          F("M29.4 42.5 C27.6 27 34.5 15.6 47.4 13.4 C55.6 12 63.6 13.6 68.4 18.4 C72.4 22.6 73 30.4 71.4 39.6 C69.8 34.6 67.6 31.4 64.4 30 C58 31.4 50 31.2 43.2 28.8 C39 31.6 34.4 35.6 31.8 41 C31 41.6 30.2 42.2 29.4 42.5 Z"),
          strand("M38 19 Q50 17 60 27"),
          strand("M46 14.4 Q59 15.6 66 24"),
          strand("M33 30 Q37 25 44 24"),
        ],
      };
    case "spiky":
      if (female)
        return {
          back: [BACK],
          front: [
            F("M29 46 C27 30 34.6 16.6 49.6 15.4 C57 14.8 63 16.4 66.8 19.6 C64.8 19.6 63 20.4 61.8 21.6 C66.6 23 70.6 27 71.6 33.6 C72.6 40.4 71.6 46 70.4 50 C69.4 44 67.6 38.6 64.4 35 C61 37.6 56.6 38.6 51.6 38.4 C53.4 36.2 54.2 33.6 53.8 31 C48.6 35.4 41 37.8 33.4 37.8 C32 40.6 31.6 43.6 31.8 47 C30.8 47.4 29.8 47 29 46 Z"),
            strand("M38 19.5 Q44 24 46 33"),
            strand("M52 17 Q58 22 60 30"),
            strand("M64 25 Q68 31 69 42"),
          ],
        };
      return {
        back: [BACK],
        front: [
          ...BURNS,
          F("M29.6 42 C28.8 33.4 30.4 27.4 33 23.6 C31.6 20.2 32 16.8 34 14.6 C35.6 17 37.2 18.2 38.8 18.6 C38.6 14.4 40.4 11.2 43.4 9.8 C44 13 45.6 15.4 47.6 16.6 C48.4 12.6 50.8 9.8 54.2 9 C54 12.6 54.8 15.4 56.6 17.4 C58.4 14.4 61.6 12.8 65 13 C63.6 15.6 63.4 18.6 64.6 21.4 C68.8 24.6 71.4 31.2 70.6 42 C69 36.6 66.6 33.2 62.8 31.2 C55.4 33.6 44.4 33.6 37.6 31.2 C33.6 33.2 31.2 37 29.6 42 Z"),
          strand("M39 19 Q42 24 41 30"),
          strand("M48 17 Q50 23 49 31"),
          strand("M57 18.5 Q58 24 57 30.5"),
        ],
      };
    case "curly": {
      const top = [[31, 40, 5], [32, 31, 6.2], [38, 23, 6.8], [45.5, 18, 7], [54, 17.4, 7], [61.8, 21, 6.8], [67.5, 28.5, 6.2], [69.5, 37.5, 5.2], [42, 27.6, 5.2], [57, 27, 5.2], [49.5, 24, 5]];
      const low = female ? [[28, 50, 5.2], [29, 59.5, 5.2], [30.5, 68.5, 5], [33, 76, 4.6], [72, 50, 5.2], [71, 59.5, 5.2], [69.5, 68.5, 5], [67, 76, 4.6]] : [];
      return {
        back: [
          P("M26.5 48 C24 30 33 13 50 13 C67 13 76 30 73.5 48 C71 42 68 37 63 34 L37 34 C32 37 29 42 26.5 48 Z", sh, { sil: true }),
          ...low.map(([x, y, r]) => C(x, y, r, h, { shade: sh, sil: true })),
        ],
        front: top.map(([x, y, r]) => C(x, y, r, h, { shade: sh, sil: true })),
      };
    }
    case "long": {
      const els = {
        back: [LONG_BACK],
        front: [
          F("M50 15.6 C40 15.2 31.6 21 29.8 32.6 C28.2 44 28.8 58 27.2 70.4 C26.6 74.6 30.8 75.6 32 72.4 C33.4 62 33 50.4 34 40.8 C35.4 34 41 28.6 49.4 27.6 Z"),
          F("M50 15.6 C60 15.2 68.4 21 70.2 32.6 C71.8 44 71.2 58 72.8 70.4 C73.4 74.6 69.2 75.6 68 72.4 C66.6 62 67 50.4 66 40.8 C64.6 34 59 28.6 50.6 27.6 Z"),
          F("M30.4 33 C31.4 21.6 39.4 14 50 14 C60.6 14 68.6 21.6 69.6 33 C66 28.6 59 26 50 26 C41 26 34 28.6 30.4 33 Z"),
          strand("M50 15 L50 25.5", 1),
          strand("M43 17 Q35 25 32.5 40"),
          strand("M57 17 Q65 25 67.5 40"),
          strand("M30.5 50 Q30 60 29 70"),
          strand("M69.5 50 Q70 60 71 70"),
        ],
      };
      // Male "long" is shoulder length.
      const SHORTER = "translate(50 16) scale(1 0.8) translate(-50 -16)";
      return female ? els : { back: withTr(els.back, SHORTER), front: withTr(els.front, SHORTER) };
    }
    case "bun":
      if (!female)
        // A small top knot with short, tidy sides.
        return {
          back: [BACK, C(50, 14.4, 5, h, { shade: sh, sil: true })],
          front: [...BURNS, F(SLEEK), strand("M47 13.6 Q50 10.8 53 13.6"), strand("M40 19.5 Q46 24 50 28.4"), strand("M60 19.5 Q55 24 50.5 28.4")],
        };
      return {
        back: [P("M29.5 44 C28 28 37 16 50 16 C63 16 72 28 70.5 44 Z", sh, { sil: true }), C(50, 13.2, 6.8, h, { shade: sh, sil: true })],
        front: [
          F(SLEEK),
          strand("M46 12.8 Q50 8.9 54 12.8 Q50 16.4 47.4 13.7"),
          strand("M40 19.5 Q46 24 50 28.4"),
          strand("M60 19.5 Q55 24 50.5 28.4"),
          S("M31.4 40 Q29.6 47 31.8 53", h, 1.1),
          S("M68.6 40 Q70.4 47 68.2 53", h, 1.1),
        ],
      };
    case "ponytail":
      return {
        back: [
          P("M29.5 44 C28 28 37 16 50 16 C63 16 72 28 70.5 44 Z", sh, { sil: true }),
          F("M61 19 C73.6 15.6 82.6 25 81 41 C80 52 75.4 61.6 70.2 64.4 C72 55 72.4 44 67.6 31.6 Z"),
          strand("M70 23 Q77.5 33 75.5 50"),
        ],
        front: [
          F("M30.2 41 C29.6 26.6 38.4 16.6 50 16.6 C61.6 16.6 70.4 26.6 69.8 41 C68 35 64 31 58.6 29.6 C52 32.6 42.6 33.8 34.6 33 C32.6 35.4 31.2 38 30.2 41 Z"),
          C(63.5, 21.5, 2.6, "o3"),
          strand("M40 19.5 Q47 24 50 31"),
          strand("M56 18 Q61 22 62.5 28.5"),
        ],
      };
    case "short":
    default:
      if (female)
        return {
          back: [P("M27.5 44 C26 26 36 14.5 50 14.5 C64 14.5 74 26 72.5 44 C73.6 52 73.2 59 71 63.6 C68.6 65.6 66 65.2 65 62.4 L35 62.4 C34 65.2 31.4 65.6 29 63.6 C26.8 59 26.4 52 27.5 44 Z", sh, { sil: true })],
          front: [
            F("M28.6 52 C26.4 33 34.6 15.6 51 15.4 C65.4 15.2 74 27 72 47 C72 53.6 71.2 58.6 69.4 62 C67.8 57.6 67 50.6 66.4 44 C64.6 36.4 60.8 31.4 55.4 29.2 C49.6 33.8 41.4 35.8 33.8 36.2 C32.4 41.2 32 47 32.4 53 C31.2 54.2 29.8 53.6 28.6 52 Z"),
            strand("M36 20 Q44 24 47 31"),
            strand("M58 18.5 Q65 25 67 40"),
            strand("M31.5 30 Q30.5 40 31 50"),
          ],
        };
      return {
        back: [BACK],
        front: [
          ...BURNS,
          F("M29.4 42 C27.6 25 37 13.6 51 14 C64 14.4 72.6 23 71.6 39 C70 34.4 67.4 30.6 63 29 C61.3 31.8 57.6 33.6 52.6 34.2 C54.4 32.2 55.3 30 55.2 27.8 C50 31.8 42 34.4 35 34 C32.6 36.2 30.8 38.8 29.4 42 Z"),
          strand("M39 17.5 Q45 21.5 46.5 30.5"),
          strand("M55.5 16 Q60 20 61.5 27.5"),
          strand("M47 14.6 Q51 18 53.4 25"),
        ],
      };
  }
}

function eyes(style, sleep, female) {
  const y = 45.6;
  const out = [];
  for (const [x, side] of [[42.3, -1], [57.7, 1]]) {
    if (sleep) {
      out.push(S(`M${x - 3.4} ${y + 0.4} Q${x} ${y - 2.8} ${x + 3.4} ${y + 0.4}`, "ink", 1.5), S(`M${x + side * 3.4} ${y + 0.4} L${x + side * 4.7} ${y - 0.7}`, "ink", 1.1));
      continue;
    }
    if (style === "dot") {
      out.push(E(x, y, 2.3, 2.6, "iris"), C(x, y + 0.2, 1.2, "ink"), C(x + 0.8, y - 0.9, 0.8, "hi"));
      out.push(S(`M${x - 2.9} ${y - 1.6} Q${x} ${y - 3.8} ${x + 2.9} ${y - 1.6}`, "ink", 1.2));
      continue;
    }
    const almond = style === "almond";
    const k = female ? 1.12 : 0.92; // female eyes are bigger, male a touch smaller
    const w = (almond ? 3.9 : 3.5) * k;
    const top = (almond ? 3.6 : 4.8) * k;
    const bot = (almond ? 3 : 3.8) * k;
    const r = (almond ? 2.1 : 2.45) * k;
    out.push(
      P(`M${x - w} ${y} Q${x} ${y - top} ${x + w} ${y} Q${x} ${y + bot} ${x - w} ${y} Z`, "white"),
      E(x, y + 0.25, r, r + 0.15, "iris"),
      C(x, y + 0.35, r * 0.5, "ink"),
      C(x + 0.85, y - 0.75, 0.85, "hi"),
      C(x - 0.75, y + 1.05, 0.38, "hi"),
      // upper lash line, a touch heavier towards the outer corner
      S(`M${x - w - 0.2} ${y + 0.3} Q${x} ${y - top - 0.3} ${x + w + 0.2} ${y + 0.3}`, "ink", female ? 1.6 : 1.15),
    );
    // Lashes: two small outward flicks at the outer corner for female eyes; male eyes have none.
    if (female)
      out.push(
        S(`M${x + side * (w - 0.2)} ${y - 0.9} Q${x + side * (w + 1.1)} ${y - 1.5} ${x + side * (w + 1.9)} ${y - 0.7}`, "ink", 0.95),
        S(`M${x + side * (w - 1.3)} ${y - top * 0.68} Q${x + side * (w + 0.2)} ${y - top * 0.82} ${x + side * (w + 0.8)} ${y - top * 0.62}`, "ink", 0.8),
      );
  }
  return out;
}

// Male brows: thick, low and nearly straight. Female brows: thin, higher and arched.
function brows(style, h, female) {
  const w = (style === "bold" ? 1.6 : 1) * (female ? 0.95 : 1.9);
  const lift = (style === "arched" ? 1.4 : 1) * (female ? 3.4 : 1.3);
  const y = female ? 38.2 : 39.6;
  return [[42.3, -1], [57.7, 1]].map(([x, side]) => S(`M${x + side * 4.2} ${y + 0.6} Q${x + side * 0.6} ${y + 0.4 - lift} ${x - side * 3.6} ${y}`, h, w));
}

const BEARD = "M30.6 46 C31 58 36 66.5 41 69 C44 70.6 47 71.4 50 71.4 C53 71.4 56 70.6 59 69 C64 66.5 69 58 69.4 46 C67.6 53 64.6 57.4 61 58.6 C57.6 55.8 42.4 55.8 39 58.6 C35.4 57.4 32.4 53 30.6 46 Z";

// Where the cabin-crew pillbox sits for each hair style: on the crown, just right of centre, clear of buns and ponytail ties.
// Kept inside the circular crop: the drum's top-right corner must stay within ~40 units of the frame centre.
const PILLBOX = {
  short: [56, 15.2], side: [56, 14.4], spiky: [56, 15.2], curly: [56, 13.4], long: [56, 15.4], bun: [59.5, 17.4],
  ponytail: [55.5, 17], bald: [55.5, 18.6], animal: [56, 20],
};
const PILLBOX_FEMALE = { short: [56, 16], side: [56, 15.4], spiky: [55.5, 16] };

function crewPillbox(s) {
  const key = s.kind !== "human" ? "animal" : s.hair || (s.body === "female" ? "long" : "short");
  const [cx, cy] = (s.body === "female" && s.kind === "human" && PILLBOX_FEMALE[key]) || PILLBOX[key] || PILLBOX.short;
  return pillbox(cx, cy + 0.6, -12, s.outfitColor, 1.15);
}

// Animals have no neck: the uniform moves up and the head moves down so the chin tucks into the collar.
const ANIMAL_BODY = "translate(0 -9)";
const ANIMAL_HEAD = "translate(0 4)";

function build(spec, sleep, headOnly = false, back = false) {
  const s = { ...DEFAULTS, ...spec };
  if (!s.hair) s.hair = s.body === "female" ? "long" : "short";
  const oc = s.outfitColor;
  const els = [];
  const hw = s.outfit === "cabin_crew" ? crewPillbox(s) : withTr(headwear(s.outfit, oc), HW);
  const acc = withTr(accessory(s.accessory, s.outfit), s.accessory === "headset" ? HW : ACC);

  if (s.kind !== "human") {
    // No neck: the head sits down into the collar, chibi-style, so it never looks like it is floating.
    // The body rises and the head (with its ears, hat and glasses) drops until they overlap.
    const a = animal(s.kind, sleep);
    const hatted = HATS.has(s.outfit) && !a.earsBehindHat;
    const head = (els_) => withTr(els_, ANIMAL_HEAD);
    const ears = head(withTr(a.ears, ANIMAL));
    if (!hatted) els.push(...ears);
    if (!headOnly) els.push(...withTr(outfit(s.outfit, BODY.animal, oc), ANIMAL_BODY));
    const [skull, ...rest] = a.head;
    const g = skull.a;
    els.push(
      ...head(
        withTr(
          [
            skull,
            { t: "ellipse", a: { ...g }, fill: null, stroke: "line", sw: 1, op: 0.22 },
            { t: "ellipse", a: { cx: g.cx, cy: g.cy, rx: g.rx - 0.8, ry: g.ry - 0.8 }, fill: null, stroke: "hi", sw: 0.9, op: 0.24 },
            ...(back ? [] : [...rest, ...a.face]), // from behind: just the round head and ears
          ],
          ANIMAL,
        ),
      ),
      ...head(hw),
    );
    if (hatted) els.push(...ears);
    if (hatted && s.outfit === "captain") els.push(...head(withTr(capLower(oc), HW)));
    if (!back || s.accessory === "headset") els.push(...head(acc));
    return els;
  }

  const female = s.body === "female";
  const B = BODY[female ? "female" : "male"];
  const sk = s.skin;
  const h = s.hairColor;
  // Under a pilot cap, short and tall male styles become neat sides-only hair so nothing pokes through the crown.
  const capped = s.outfit === "captain" && ["short", "side", "spiky", "curly"].includes(s.hair) && !female;
  const narrow = female && !["short", "side", "spiky"].includes(s.hair) ? NARROW : null;
  const hairStyle = s.outfit === "cabin_crew" && s.hair === "spiky" ? "short" : s.hair;
  const hr = capped
      ? { back: [], front: [P("M30 44 C29.5 37 31 33 33 31 L67 31 C69 33 70.5 37 70 44 C68.5 40 67 37 65 36 L35 36 C33 37 31.5 40 30 44 Z", h, { shade: `${h}-sh`, sil: true })] }
      : hair(hairStyle, h, female);

  els.push(...withTr(hr.back, narrow));
  if (!headOnly) {
    els.push(R(50 - B.nw / 2, 58, B.nw, 26, 4, sk, { shade: `${sk}-sh`, sil: true }));
    els.push(P(`M${50 - B.nw / 2 + 0.5} 63 Q50 72 ${50 + B.nw / 2 - 0.5} 63 L${50 + B.nw / 2 - 0.5} 70 Q50 76 ${50 - B.nw / 2 + 0.5} 70 Z`, `${sk}-sh`));
    if (!female) els.push(S("M49.4 73.6 Q50.4 74.6 49.8 75.8", `${sk}-sh`, 1)); // Adam's apple
    els.push(...outfit(s.outfit, B, oc));
  }
  const ex = female ? 32.1 : 29.7;
  els.push(E(ex, 46.5, 3, 4.2, sk, { shade: `${sk}-sh`, sil: true }), E(100 - ex, 46.5, 3, 4.2, sk, { shade: `${sk}-sh`, sil: true }));
  els.push(P(HEAD[female ? "female" : "male"], sk, { shade: `${sk}-sh`, sil: true }));
  if (back) {
    // Seen from behind (walking away in the garden): the hair covers the back of the head, and there is no face.
    els.push(...withTr(hr.back, narrow));
    if (s.hair !== "bald")
      els.push(
        P(
          capped
            ? "M29.6 50 C29 38 31 33 33 31 L67 31 C69 33 71 38 70.4 50 C64 55 36 55 29.6 50 Z"
            : female
              ? "M31 53 C29 30 37.5 19.6 50 19.6 C62.5 19.6 71 30 69 53 C63 59 37 59 31 53 Z"
              : "M29.4 50 C28.4 29 37.6 18.6 50 18.6 C62.4 18.6 71.6 29 70.6 50 C64 55.5 36 55.5 29.4 50 Z",
          h,
          { shade: `${h}-sh`, sil: true },
        ),
      );
    els.push(...withTr(hr.front, narrow), ...hw);
    if (s.accessory === "headset") els.push(...acc);
    return els;
  }
  const bx = female ? 11.5 : 12.6;
  const bop = female ? 0.62 : 0.22;
  els.push(E(50 - bx, 53.2, 2.9, 1.6, "blush", { op: bop }), E(50 + bx, 53.2, 2.9, 1.6, "blush", { op: bop }));
  els.push(...eyes(s.eyes, sleep, female), ...brows(s.brows, h, female));
  // Nose: a small hook for female faces, a longer bridge for male ones.
  els.push(female ? S("M49.5 51.4 Q50.5 52.6 49.7 53.3", `${sk}-sh`, 1.05) : S("M49.6 48.6 L49.2 52.4 Q50.4 53.8 51.6 53", `${sk}-sh`, 1.2));
  if (!female && s.facialHair === "stubble") els.push(P(BEARD, h, { op: 0.2 }));
  if (!female && s.facialHair === "beard") els.push(P(BEARD, h, { shade: `${h}-sh`, sil: true }));
  // Mouth: fuller, coloured lips for female faces; a plain, slightly wider mouth for male ones.
  if (female)
    els.push(
      P("M46.2 56.9 Q48.2 55.6 50 56.5 Q51.8 55.6 53.8 56.9 Q50 57.7 46.2 56.9 Z", "lip"),
      P("M46.2 56.9 Q50 61.4 53.8 56.9 Q50 58.2 46.2 56.9 Z", "lip"),
      E(51.2, 58.6, 1.1, 0.45, "hi", { op: 0.5 }),
    );
  else els.push(S("M46 57.4 Q50 59.6 54 57.4", "mouth", 1.5));
  if (!female && (s.facialHair === "moustache" || s.facialHair === "beard"))
    els.push(P("M45 55.2 C47.4 53.6 49.2 54 50 54.8 C50.8 54 52.6 53.6 55 55.2 C53 56.4 51.2 56.3 50 55.7 C48.8 56.3 47 56.4 45 55.2 Z", h));
  els.push(...withTr(hr.front, narrow));
  els.push(...hw, ...acc);
  return els;
}

const fmt = (n) => (typeof n === "number" ? +n.toFixed(2) : n);

export function avatarSVG(spec = {}, opts = {}) {
  // The head covering was retired; saved avatars that used it get their body's default hair.
  if (spec.hair === "covering") spec = { ...spec, hair: undefined };
  const els = build(spec, !!opts.sleep, !!opts.headOnly, !!opts.back);
  const id = `av${++UID}`;
  let defs = "", body = "";
  els.forEach((e, i) => {
    const geo = Object.entries(e.a).map(([k, v]) => `${k}="${fmt(v)}"`).join(" ");
    const tr = e.tr ? ` transform="${e.tr}"` : "";
    let paint;
    if (e.fill === null) {
      paint = `fill="none" stroke="${V(e.stroke)}" stroke-width="${e.sw}" stroke-linecap="round" stroke-linejoin="round"`;
    } else {
      let fill = V(e.fill);
      if (e.shade) {
        const gid = `${id}g${i}`;
        defs += `<radialGradient id="${gid}" cx="0.38" cy="0.3" r="0.82"><stop offset="0.74" stop-color="${V(e.fill)}"/><stop offset="0.86" stop-color="${V(e.shade)}"/></radialGradient>`;
        fill = `url(#${gid})`;
      }
      paint = `fill="${fill}"`;
      if (e.stroke) paint += ` stroke="${V(e.stroke)}" stroke-width="${e.sw}"`;
      else if (e.sil && e.shade) paint += ` stroke="${V(e.shade)}" stroke-width="0.5" stroke-linejoin="round"`;
      if (e.rule) paint += ` fill-rule="${e.rule}"`;
    }
    const op = e.op !== undefined ? ` opacity="${e.op}"` : "";
    body += `<${e.t} ${geo} ${paint}${op}${tr}/>`;
  });
  const title = opts.title ? `<title>${opts.title.replace(/[<&]/g, "")}</title>` : "";
  // Head-only (garden) frames the head with room for hats and long hair; the chin sits 83% of the way down.
  const vb = opts.headOnly ? "10 4 80 80" : "8.5 6.5 83 83";
  return `<svg viewBox="${vb}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" ${opts.title ? 'role="img"' : 'aria-hidden="true"'}>${title}<defs>${defs}</defs>${body}</svg>`;
}
