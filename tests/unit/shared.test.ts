/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bump, compareVersions, parseChangelog, unreleased } from "../../src/shared/changelog";
import { bottlenecks } from "../../src/shared/bottlenecks";
import { addDays, daysBetween, expandRule, isValidDate, MAX_SERIES_DATES, upcomingMeeting, weekStart } from "../../src/shared/dates";
import { applyMeeting, initialMeeting, inOrder, isAwayOn, meetingOver, mergeOrder, moveItem, timerStage } from "../../src/shared/meeting";
import { cleanFlairs, cleanUpdateBody, LIMITS } from "../../src/shared/validate";
import type { WaitingItem } from "../../src/shared/types";
import { AVATAR, BADGES, cleanCustomBadge } from "../../src/shared/catalog";
import { avatarSVG } from "../../src/client/avatar/render.js";
import { sniffImage } from "../../src/worker/photo";
import { AREA, depthScale, GARDEN_ACTIONS, GARDEN_SCENES, sceneFor, pickAction, startSpots, stepToward, wanderTarget } from "../../src/shared/garden";

describe("dates (SGT)", () => {
  it("picks today when it is meeting day in Singapore, even if UTC is still the day before", () => {
    // 2026-10-29 01:00 SGT is 2026-10-28 17:00 UTC; Thursday = 4
    expect(upcomingMeeting(4, new Date("2026-10-28T17:00:00Z"))).toBe("2026-10-29");
  });
  it("rolls forward to next week's meeting", () => {
    expect(upcomingMeeting(4, new Date("2026-10-30T02:00:00Z"))).toBe("2026-11-05");
  });
  it("validates real calendar dates only", () => {
    expect(isValidDate("2026-02-30")).toBe(false);
    expect(isValidDate("2026-10-29")).toBe(true);
    expect(isValidDate("29/10/2026")).toBe(false);
  });
  it("adds days across month ends", () => {
    expect(addDays("2026-10-29", 7)).toBe("2026-11-05");
    expect(daysBetween("2026-10-25", "2026-12-18")).toBe(54);
  });
});

describe("meeting reducer", () => {
  it("opening a card moves lobby → round and starts the timer", () => {
    const s = applyMeeting(initialMeeting(), { type: "open", member_id: 3 }, 1000);
    expect(s).toMatchObject({ phase: "round", current: 3, started_at: 1000 });
  });
  it("closing removes the presenter from the stage once", () => {
    let s = applyMeeting(initialMeeting(), { type: "open", member_id: 3 }, 0);
    s = applyMeeting(s, { type: "close", member_id: 3 }, 0);
    s = applyMeeting(s, { type: "close", member_id: 3 }, 0);
    expect(s.closed).toEqual([3]);
    expect(s.current).toBeNull();
  });
  it("closing during deep dives marks the deep dive done, not the round", () => {
    let s = applyMeeting(initialMeeting(), { type: "phase", phase: "deep_dives" }, 0);
    s = applyMeeting(s, { type: "close", member_id: 2 }, 0);
    expect(s.deep_done).toEqual([2]);
    expect(s.closed).toEqual([]);
  });
  it("keeps the round slot timer within 1–30 minutes (the menu offers 3–10)", () => {
    const s = applyMeeting(initialMeeting(), { type: "settings", present_min: 99, qna_min: 0 }, 0);
    expect([s.present_min, s.qna_min]).toEqual([30, 1]);
  });
  it("times a deep dive by its own length, up to 45 minutes, not the round slot", () => {
    const s = { ...initialMeeting(), started_at: 0 }; // round slot is 5 + 5 min
    const deep = { present: 45, qna: 0 };
    expect(timerStage(s, 40 * 60_000, deep).stage).toBe("present");
    expect(timerStage(s, 46 * 60_000, deep).stage).toBe("over");
  });
  it("away stretches include both ends", () => {
    const trip = [{ from_date: "2026-11-02", to_date: "2026-11-06" }];
    expect(["2026-11-01", "2026-11-02", "2026-11-06", "2026-11-07"].map((d) => isAwayOn(trip, d))).toEqual([false, true, true, false]);
  });
  it("a meeting's notes are filed once it wraps or its day has passed", () => {
    expect(meetingOver("2026-10-29", "2026-10-29", "round")).toBe(false);
    expect(meetingOver("2026-10-29", "2026-10-29", "wrap")).toBe(true);
    expect(meetingOver("2026-10-22", "2026-10-29", undefined)).toBe(true);
    expect(meetingOver("2026-11-05", "2026-10-29", undefined)).toBe(false);
  });
  it("timer goes present → qna → over", () => {
    const s = { ...initialMeeting(), started_at: 0 };
    expect(timerStage(s, 4 * 60_000).stage).toBe("present");
    expect(timerStage(s, 6 * 60_000).stage).toBe("qna");
    expect(timerStage(s, 11 * 60_000).stage).toBe("over");
  });
});

const w = (member_id: number | null, text: string, extra: Partial<WaitingItem> = {}): WaitingItem => ({
  id: text.replace(/\W/g, "") || "x",
  member_id,
  who: member_id === null ? "Partner" : "",
  text,
  private: false,
  state: "open",
  ...extra,
});

describe("bottlenecks", () => {
  it("groups by the person being waited on and ignores self, outsiders and resolved items", () => {
    const b = bottlenecks([
      { id: 10, member_id: 1, waiting: [w(2, "a"), w(null, "b")] },
      { id: 11, member_id: 3, waiting: [w(2, "c"), w(3, "self"), w(1, "done", { state: "resolved" })] },
      { id: 12, member_id: 4, waiting: [w(1, "d")] },
    ]);
    expect(b.map((x) => [x.member_id, x.waiting.length])).toEqual([[2, 2], [1, 1]]);
    expect(b[0].waiting[0]).toMatchObject({ from_id: 1, update_id: 10, item_id: "a" });
  });
});

describe("update validation", () => {
  const ids = new Set([1, 2, 3]);
  it("drops unknown teammates, blank items and caps list length", () => {
    const u = cleanUpdateBody(
      {
        done: [...Array(30)].map((_, i) => `item ${i}`).concat([""]),
        waiting: [{ member_id: 99, text: "x" }, { id: "keepme", member_id: 2, text: "real", private: true }, { member_id: null, who: "Partner", text: "data" }],
        deep_dive: { topic: "Results", minutes: 20, with: [2, 2, 42] },
        weather: "tornado",
        fuel: 9,
      },
      ids,
    );
    expect(u.done).toHaveLength(LIMITS.items);
    expect(u.waiting.map(({ member_id, who, text, private: p, state }) => ({ member_id, who, text, p, state }))).toEqual([
      { member_id: 2, who: "", text: "real", p: true, state: "open" },
      { member_id: null, who: "Partner", text: "data", p: false, state: "open" },
    ]);
    expect(u.waiting[0].id).toBe("keepme");
    expect(u.deep_dive).toEqual({ topic: "Results", minutes: 20, with: [2] });
    expect(u.weather).toBe("");
    expect(u).not.toHaveProperty("fuel"); // fuel was dropped; old values are ignored
  });
  it("treats a deep dive without a topic as no deep dive", () => {
    expect(cleanUpdateBody({ deep_dive: { topic: " ", with: [1] } }, ids).deep_dive).toBeNull();
  });
  it("keeps at most 3 flairs with known colours", () => {
    expect(cleanFlairs([{ text: "a", color: "sky" }, { text: "b", color: "#f00" }, { text: "" }, { text: "c" }, { text: "d" }])).toEqual([
      { text: "a", color: "sky" },
      { text: "b", color: "slate" },
      { text: "c", color: "slate" },
    ]);
  });
});

describe("schedule rules", () => {
  it("expands 'every Tue and Thu' inclusively", () => {
    expect(expandRule({ from: "2026-10-01", to: "2026-10-15", weekdays: [2, 4], every: 1 })).toEqual([
      "2026-10-01", "2026-10-06", "2026-10-08", "2026-10-13", "2026-10-15",
    ]);
  });
  it("supports every other week and rejects backwards ranges", () => {
    expect(expandRule({ from: "2026-10-01", to: "2026-10-31", weekdays: [4], every: 2 })).toEqual(["2026-10-01", "2026-10-15", "2026-10-29"]);
    expect(expandRule({ from: "2026-10-31", to: "2026-10-01", weekdays: [4], every: 1 })).toEqual([]);
  });
  it("caps a runaway rule", () => {
    expect(expandRule({ from: "2026-01-01", to: "2036-01-01", weekdays: [0, 1, 2, 3, 4, 5, 6], every: 1 })).toHaveLength(MAX_SERIES_DATES);
  });
  it("weeks start on Monday for the commend limit", () => {
    expect([weekStart("2026-12-01"), weekStart("2026-12-03"), weekStart("2026-12-06"), weekStart("2026-12-07")]).toEqual([
      "2026-11-30", "2026-11-30", "2026-11-30", "2026-12-07",
    ]);
  });
});

describe("badge catalog (rule F1)", () => {
  it("has no ranking-style badges", () => {
    const banned = /employee|best|top|winner|of the (month|week)|mvp|#1/i;
    for (const b of BADGES) expect(b.label).not.toMatch(banned);
  });
});

describe("photo sniffing", () => {
  const b = (...xs: number[]) => new Uint8Array(xs);
  it("recognises the four allowed formats by magic bytes", () => {
    expect(sniffImage(b(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(sniffImage(b(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffImage(new TextEncoder().encode("GIF89a"))).toBe("image/gif");
    expect(sniffImage(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
  });
  it("rejects everything else, whatever the file is called", () => {
    expect(sniffImage(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
    expect(sniffImage(new TextEncoder().encode("%PDF-1.7"))).toBeNull();
  });
});

describe("patch notes", () => {
  const md = readFileSync("CHANGELOG.md", "utf8");
  it("reads releases newest first and skips Unreleased", () => {
    const sample = "## Unreleased\n- soon\n\n## 1.1.0 · 2026-11-02 · Polish\n- a\n- b\n\n## 1.0.0 · 2026-10-26\n- first\n";
    expect(parseChangelog(sample)).toEqual([
      { version: "1.1.0", date: "2026-11-02", title: "Polish", notes: ["a", "b"] },
      { version: "1.0.0", date: "2026-10-26", title: "", notes: ["first"] },
    ]);
    expect(unreleased(sample)).toEqual(["soon"]);
  });
  it("M1: package.json carries the latest released version, and every release has notes", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    const releases = parseChangelog(md);
    expect(releases[0].version).toBe(pkg.version);
    for (const r of releases) expect(r.notes.length, `release ${r.version} has no notes`).toBeGreaterThan(0);
    expect(releases.map((r) => r.version)).toEqual([...releases.map((r) => r.version)].sort((a, b) => compareVersions(b, a)));
  });
  it("bumps versions", () => {
    expect([bump("1.2.3", "patch"), bump("1.2.3", "minor"), bump("1.2.3", "major")]).toEqual(["1.2.4", "1.3.0", "2.0.0"]);
  });
});

describe("presenting order", () => {
  const people = [1, 2, 3, 4, 5].map((id) => ({ id }));
  it("puts dragged people first and keeps everyone else in their usual order", () => {
    expect(inOrder(people, [4, 2]).map((p) => p.id)).toEqual([4, 2, 1, 3, 5]);
    expect(inOrder(people, []).map((p) => p.id)).toEqual([1, 2, 3, 4, 5]);
  });
  it("re-orders one group without moving the other", () => {
    // crew 1,2,3 and pilots 4,5: dragging the crew leaves the pilots where they were
    expect(mergeOrder([1, 2, 3, 4, 5], [3, 1, 2])).toEqual([3, 1, 2, 4, 5]);
    expect(mergeOrder([4, 1, 5, 2, 3], [2, 3, 1])).toEqual([4, 2, 5, 3, 1]);
  });
  it("moves one item like a drag or an arrow key", () => {
    expect(moveItem([1, 2, 3], 0, 2)).toEqual([2, 3, 1]);
    expect(moveItem([1, 2, 3], 2, 0)).toEqual([3, 1, 2]);
    expect(moveItem([1, 2, 3], 5, 0)).toEqual([1, 2, 3]);
  });
  it("the order survives a reset and ignores junk", () => {
    const s = applyMeeting(initialMeeting(), { type: "order", order: [3, 1, 3, 1.5 as number, NaN] }, 0);
    expect(s.order).toEqual([3, 1]);
    expect(applyMeeting(s, { type: "reset" }, 0).order).toEqual([3, 1]);
  });
});

describe("custom badges (F1)", () => {
  it("keep a short name, an emoji, and never a ranking", () => {
    expect(cleanCustomBadge("Plot Artist", "🎨")).toEqual({ label: "Plot Artist", icon: "🎨" });
    expect(cleanCustomBadge("Plot Artist", "abc")).toEqual({ label: "Plot Artist", icon: "🏅" });
    for (const bad of ["Best presenter", "Top 3", "#1 coder", "Employee of the month", "MVP", "Ranked first"]) expect(typeof cleanCustomBadge(bad, "")).toBe("string");
    expect(typeof cleanCustomBadge("a", "")).toBe("string");
  });
});

describe("garden", () => {
  it("offers up to ten distinct scenes and falls back to the first for an unknown one", () => {
    expect(GARDEN_SCENES.length).toBeGreaterThanOrEqual(3);
    expect(GARDEN_SCENES.length).toBeLessThanOrEqual(10);
    expect(new Set(GARDEN_SCENES.map((x) => x.key)).size).toBe(GARDEN_SCENES.length);
    expect(sceneFor("fuji").label).toBe("Mount Fuji");
    for (const bad of [null, undefined, "", "atlantis"]) expect(sceneFor(bad).key).toBe("meadow");
  });
  it("has exactly five click actions, each reachable", () => {
    expect(GARDEN_ACTIONS).toHaveLength(5);
    const seen = new Set([0, 0.2, 0.4, 0.6, 0.8, 0.99].map((r) => pickAction(() => r).key));
    expect(seen.size).toBe(5);
  });
  it("keeps everyone on the grass and walks without overshooting", () => {
    for (let i = 0; i < 200; i++) {
      const p = wanderTarget({ x: Math.random(), y: Math.random() });
      expect(p.x).toBeGreaterThanOrEqual(AREA.x0);
      expect(p.x).toBeLessThanOrEqual(AREA.x1);
      expect(p.y).toBeGreaterThanOrEqual(AREA.y0);
      expect(p.y).toBeLessThanOrEqual(AREA.y1);
    }
    expect(startSpots(15).every((p) => p.x >= AREA.x0 && p.y <= AREA.y1)).toBe(true);
    const step = stepToward({ x: 0.5, y: 0.7 }, { x: 0.51, y: 0.7 }, 50, 1000, 800);
    expect(step).toEqual({ p: { x: 0.51, y: 0.7 }, arrived: true });
    expect(stepToward({ x: 0.1, y: 0.7 }, { x: 0.9, y: 0.7 }, 10, 1000, 800).p.x).toBeCloseTo(0.11);
  });
  it("draws people further back smaller", () => {
    expect(depthScale(AREA.y0)).toBeLessThan(depthScale(AREA.y1));
  });
});

describe("drawn avatars", () => {
  const ids = (svg: string) => svg.replace(/av\d+g/g, "g"); // gradient ids differ per drawing
  it("draws male and female faces differently, not just the hair", () => {
    const male = avatarSVG({ body: "male", hair: "short" });
    const female = avatarSVG({ body: "female", hair: "short" });
    expect(female).toContain("var(--av-lip)"); // coloured lips
    expect(male).not.toContain("var(--av-lip)");
    expect((female.match(/stroke="var\(--av-ink\)"/g) ?? []).length).toBeGreaterThan((male.match(/stroke="var\(--av-ink\)"/g) ?? []).length); // lashes
  });
  it("retires the head covering: old avatars get their body's default hair", () => {
    expect(AVATAR.hair.map(([k]) => k)).not.toContain("covering");
    expect(ids(avatarSVG({ body: "female", hair: "covering" }))).toBe(ids(avatarSVG({ body: "female" })));
  });
  it("draws just the head for the garden's chibi figures", () => {
    const spec = { outfit: "cabin_crew", outfitColor: "o3" };
    expect(avatarSVG(spec)).toContain("var(--av-scarf)");
    expect(avatarSVG(spec, { headOnly: true })).not.toContain("var(--av-scarf)");
  });
  it("draws the back of the head, with no face, for someone walking away", () => {
    const front = avatarSVG({ body: "female", hair: "long" }, { headOnly: true });
    const back = avatarSVG({ body: "female", hair: "long" }, { headOnly: true, back: true });
    expect(front).toContain("var(--av-lip)");
    expect(back).not.toContain("var(--av-lip)");
    expect(back).not.toContain("var(--av-blush)");
    expect(avatarSVG({ kind: "rabbit" }, { headOnly: true, back: true })).not.toContain("var(--av-blush)");
  });
});

describe("trial switcher (S7)", () => {
  it("is only on while wrangler.jsonc points at a trial database", () => {
    const cfg = readFileSync("wrangler.jsonc", "utf8");
    const db = cfg.match(/"database_name":\s*"([^"]+)"/)?.[1] ?? "";
    const on = /"TRIAL_SWITCHER":\s*"on"/.test(cfg);
    expect(on && !db.endsWith("-trial"), `S7: TRIAL_SWITCHER is "on" but database_name is "${db}". Set it to "" before moving to a real database.`).toBe(false);
  });
});
