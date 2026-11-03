// Fixed catalogs. Badges must stay light-hearted (rule F1): skills and quirks, never rankings.

export const BADGES = [
  { key: "mathematician", label: "Mathematician", icon: "😎" },
  { key: "problem_solver", label: "Problem Solver", icon: "🧩" },
  { key: "presentation_wizard", label: "Presentation Wizard", icon: "🪄" },
  { key: "data_whisperer", label: "Data Whisperer", icon: "📊" },
  { key: "bug_squasher", label: "Bug Squasher", icon: "🐛" },
  { key: "heuristic_hero", label: "Heuristic Hero", icon: "🦸" },
  { key: "plot_artist", label: "Plot Artist", icon: "🎨" },
  { key: "team_player", label: "Team Player", icon: "🤝" },
  { key: "deadline_ninja", label: "Deadline Ninja", icon: "🥷" },
  { key: "coffee_alchemist", label: "Coffee Alchemist", icon: "☕" },
  { key: "literature_hunter", label: "Literature Hunter", icon: "📚" },
  { key: "runway_ready", label: "Runway Ready", icon: "🛫" },
] as const;

export type BadgeKey = (typeof BADGES)[number]["key"];

/** The five badges pilots pick from; the rest of BADGES stay only so badges awarded earlier still show. */
export const BADGE_CHOICES: BadgeKey[] = ["problem_solver", "presentation_wizard", "data_whisperer", "team_player", "runway_ready"];

/** How an awarded badge looks: a catalog badge, or a pilot's own label and emoji (badge_key "custom"). */
export function badgeLook(a: { badge_key: string; label?: string; icon?: string }): { key: string; label: string; icon: string } {
  if (a.badge_key === "custom") return { key: `custom:${a.label}`, label: a.label || "Badge", icon: a.icon || "🏅" };
  const b = BADGES.find((x) => x.key === a.badge_key);
  return { key: a.badge_key, label: b?.label ?? a.badge_key, icon: b?.icon ?? "🏅" };
}

// Custom badges stay light-hearted skills (rule F1): anything that reads as a ranking is refused.
const RANKING = /\b(best|top|worst|first|winner|loser|champion|mvp|rank\w*|no\.?\s*1|number\s*one|employee of the)\b|#\s*\d/i;

/** Clean a custom badge, or say what's wrong with it. */
export function cleanCustomBadge(label: unknown, icon: unknown): { label: string; icon: string } | string {
  const l = typeof label === "string" ? label.trim().replace(/\s+/g, " ").slice(0, 24) : "";
  if (l.length < 2) return "Give the badge a name (2–24 characters)";
  if (RANKING.test(l)) return "Badges celebrate skills and quirks, not rankings. Try something like “Plot Artist”.";
  const i = typeof icon === "string" ? icon.trim() : "";
  const emoji = /^\p{Extended_Pictographic}(️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*$/u;
  return { label: l, icon: i && emoji.test(i) ? i : "🏅" };
}

// Avatar parts for the drawn avatar (renderer: src/client/avatar/render.js). Colour keys map to --av-* tokens.
export const AVATAR = {
  kind: [
    ["human", "Person"],
    ["dog_shiba", "Shiba"],
    ["dog_beagle", "Beagle"],
    ["cat_tabby", "Tabby cat"],
    ["cat_tuxedo", "Tuxedo cat"],
    ["cow", "Cow"],
    ["rabbit", "Rabbit"],
  ],
  body: [
    ["male", "Male"],
    ["female", "Female"],
  ],
  hair: [
    ["short", "Short"],
    ["side", "Side part"],
    ["spiky", "Spiky"],
    ["curly", "Curly"],
    ["long", "Long"],
    ["bun", "Bun"],
    ["ponytail", "Ponytail"],
    ["bald", "Bald"],
  ],
  eyes: [
    ["round", "Round"],
    ["almond", "Almond"],
    ["dot", "Dot"],
  ],
  outfit: [
    ["captain", "Captain"],
    ["first_officer", "First officer"],
    ["cabin_crew", "Cabin crew"],
    ["ground_crew", "Ground crew"],
    ["engineer", "Engineer"],
    ["aviator", "Aviator"],
    ["casual", "Hoodie"],
    ["lab", "Lab coat"],
  ],
  accessory: [
    ["none", "None"],
    ["glasses", "Glasses"],
    ["sunglasses", "Sunglasses"],
    ["headset", "Headset"],
  ],
  skin: ["s1", "s2", "s3", "s4", "s5", "s6", "s7"],
  hairColor: ["h1", "h2", "h3", "h4", "h5", "h6", "h7", "h8"],
  outfitColor: ["o1", "o2", "o3", "o4", "o5", "o6"],
} as const;

// "Flight conditions": how the week's work is going.
export const WEATHER = [
  { key: "clear", icon: "☀️", label: "Clear skies" },
  { key: "light_cloud", icon: "🌤️", label: "Light cloud" },
  { key: "crosswind", icon: "🌬️", label: "Crosswind" },
  { key: "turbulence", icon: "🌧️", label: "Turbulence" },
  { key: "storm", icon: "⛈️", label: "Storm" },
  { key: "fog", icon: "🌫️", label: "Fog" },
] as const;

// Custom flair colours. Keys map to --flair-* tokens.
export const FLAIR_COLORS = ["amber", "sky", "mint", "coral", "lilac", "rose", "slate", "lime"] as const;
// Whiteboard note colours reuse the flair tints, so they read in every theme, light and dark.
export const NOTE_COLORS = ["amber", "sky", "mint", "coral", "lilac", "lime"] as const;
export const NOTE_LIMITS = { chars: 1000, perMeeting: 60, lockSeconds: 20 } as const;
// Colour behind a drawn avatar. Keys map to --avbg-* tokens.
export const AVATAR_BACKGROUNDS = ["navy", "sky", "mint", "sand", "peach", "rose", "lilac", "slate"] as const;
// Project colour themes: the three palettes from design round 2, plus Lab Notebook and Cozy Studio from round 1. Keys map to [data-palette] blocks in tokens.css.
export const THEMES = [
  { key: "terminal", label: "Night Terminal", blurb: "Navy and amber, like a departures board" },
  { key: "lounge", label: "Sky Lounge", blurb: "Bright sky blues with rounded type" },
  { key: "runway", label: "Runway", blurb: "Calm and almost colourless, with runway orange" },
  { key: "notebook", label: "Lab Notebook", blurb: "Graph paper and ink blue, with typewriter labels" },
  { key: "studio", label: "Cozy Studio", blurb: "Warm paper and terracotta, soft and rounded" },
] as const;
export const isThemeKey = (k: unknown): k is (typeof THEMES)[number]["key"] => THEMES.some((t) => t.key === k);

export const DEEP_DIVE_MINUTES = [5, 10, 15, 20, 30, 45] as const;
