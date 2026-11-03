// The garden: a calm screen where the team's avatars wander an airfield. Each screen runs its own random garden;
// nothing here is stored or synced. Positions are fractions of the screen (0–1) so a resize keeps everyone in place.

/** Where the airfield is. Each viewer picks one in the garden; the first is the default. */
export const GARDEN_SCENES = [
  { key: "meadow", label: "Meadow airstrip", place: "Countryside", ground: "grass" },
  { key: "mountains", label: "Alpine airfield", place: "Switzerland", ground: "grass" },
  { key: "beach", label: "Beach runway", place: "Tropical island", ground: "sand" },
  { key: "fuji", label: "Mount Fuji", place: "Japan", ground: "grass" },
  { key: "rome", label: "The Colosseum", place: "Rome, Italy", ground: "grass" },
  { key: "paris", label: "Eiffel Tower", place: "Paris, France", ground: "grass" },
  { key: "giza", label: "The Pyramids", place: "Giza, Egypt", ground: "sand" },
  { key: "singapore", label: "Marina Bay", place: "Singapore", ground: "grass" },
  { key: "sydney", label: "Sydney Harbour", place: "Sydney, Australia", ground: "grass" },
  { key: "newyork", label: "Statue of Liberty", place: "New York, USA", ground: "grass" },
] as const;
export type GardenScene = (typeof GARDEN_SCENES)[number]["key"];

/** The scene for a saved key; anything unknown (an old or edited value) falls back to the default. */
export function sceneFor(key: string | null | undefined): (typeof GARDEN_SCENES)[number] {
  return GARDEN_SCENES.find((x) => x.key === key) ?? GARDEN_SCENES[0];
}

/** What a single click does to someone: one of five, picked at random. */
export const GARDEN_ACTIONS = [
  { key: "snack", label: "Feed a snack", picks: ["🍩", "🥕", "🍎", "🍪", "🍙"] },
  { key: "toy", label: "Throw a toy", picks: ["🎾", "⚽", "🧸", "🪀"] },
  { key: "bonk", label: "Gentle bonk", picks: ["🔨"] },
  { key: "react", label: "Say hi", picks: ["❤️", "🎵", "💨", "😆"] }, // 💨 = scurry off
  { key: "plane", label: "Paper plane", picks: ["🛩️"] },
] as const;
export type GardenAction = (typeof GARDEN_ACTIONS)[number]["key"];

export function pickAction(rand: () => number = Math.random): { key: GardenAction; pick: string } {
  const a = GARDEN_ACTIONS[Math.floor(rand() * GARDEN_ACTIONS.length) % GARDEN_ACTIONS.length];
  return { key: a.key, pick: a.picks[Math.floor(rand() * a.picks.length) % a.picks.length] };
}

/** Where people may stand: the grass in front of the horizon, clear of the screen edges. */
export const AREA = { x0: 0.07, x1: 0.93, y0: 0.6, y1: 0.92 } as const;
export type Pt = { x: number; y: number };

export const clampToArea = (p: Pt): Pt => ({
  x: Math.min(AREA.x1, Math.max(AREA.x0, p.x)),
  y: Math.min(AREA.y1, Math.max(AREA.y0, p.y)),
});

/** Nearer the viewer (lower on screen) is bigger: 0.7 at the back of the grass, 1.2 at the front. */
export const depthScale = (y: number) => 0.7 + (0.5 * (Math.min(AREA.y1, Math.max(AREA.y0, y)) - AREA.y0)) / (AREA.y1 - AREA.y0);

/** A stroll: somewhere nearby, never off the grass. */
export function wanderTarget(from: Pt, rand: () => number = Math.random): Pt {
  return clampToArea({ x: from.x + (rand() - 0.5) * 0.5, y: from.y + (rand() - 0.5) * 0.22 });
}

/** A starting spot for each of `n` people, spread across the grass with a little jitter. */
export function startSpots(n: number, rand: () => number = Math.random): Pt[] {
  const cols = Math.max(1, Math.ceil(Math.sqrt(n * 2)));
  return Array.from({ length: n }, (_, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const rows = Math.ceil(n / cols);
    return clampToArea({
      x: AREA.x0 + ((c + 0.5 + (rand() - 0.5) * 0.6) / cols) * (AREA.x1 - AREA.x0),
      y: AREA.y0 + ((r + 0.5 + (rand() - 0.5) * 0.6) / rows) * (AREA.y1 - AREA.y0),
    });
  });
}

/**
 * Move `p` toward `to` by at most `px` pixels on a `w`×`h` screen. Returns the new point and whether it arrived;
 * it never overshoots, so nobody jitters around their target.
 */
export function stepToward(p: Pt, to: Pt, px: number, w: number, h: number): { p: Pt; arrived: boolean } {
  const dx = (to.x - p.x) * w;
  const dy = (to.y - p.y) * h;
  const d = Math.hypot(dx, dy);
  if (d <= px || d === 0) return { p: { ...to }, arrived: true };
  return { p: { x: p.x + (dx / d) * (px / w), y: p.y + (dy / d) * (px / h) }, arrived: false };
}
