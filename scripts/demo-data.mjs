// Fictional sample data for the public repo and demo; scripts/export-public.mjs copies this over scripts/demo-data.mjs.
// Every date is placed around `today`, so the demo always has a last meeting, a next one and upcoming deadlines.
// The quoting helper from scripts/sql.mjs, inlined so this file runs from scripts/public/ and from scripts/ alike.
const sql = (v) =>
  v === null || v === undefined ? "NULL" : typeof v === "number" ? String(v) : `'${String(typeof v === "object" ? JSON.stringify(v) : v).replaceAll("'", "''")}'`;

const DAY = 86_400_000;
const iso = (d) => d.toISOString().slice(0, 10);
const id = (name) => `(SELECT id FROM members WHERE name = ${sql(name)})`;

const update = (name, date, body, submitted = true, project = 1) =>
  `INSERT INTO updates (project_id, member_id, meeting_date, body, submitted_at) VALUES (${project}, ${id(name)}, ${sql(date)}, ${sql(
    JSON.stringify({ weather: "", done: [], issues: [], waiting: [], next: [], fun: "", files: "", figure_caption: "", deep_dive: null, ...body }),
  )}, ${submitted ? "strftime('%Y-%m-%dT%H:%M:%fZ','now')" : "NULL"}) ON CONFLICT DO NOTHING;`;

// A waiting item that points at a teammate needs their id, which only exists after seeding members.
let wid = 0;
const waitingOn = (name, text, priv = false) =>
  `{"id":"demo${++wid}","member_id":__${name}__,"who":"","text":${JSON.stringify(text)},"private":${priv},"state":"open"}`;

export function demoStatements({ today, single = false } = {}) {
  // A fixed week (next meeting Thu 29 Oct 2026) unless `today` is given. Local dev and the browser tests get a whole
  // term of meetings; `single` (the hosted demo) keeps only the 29 Oct meeting and its check-ins.
  const ref = today ?? new Date(2026, 9, 26);
  const t = new Date(Date.UTC(ref.getFullYear(), ref.getMonth(), ref.getDate()));
  const nextD = new Date(t.getTime() + ((4 - t.getUTCDay() + 7) % 7) * DAY); // the coming Thursday (today if Thursday)
  const after = (days) => iso(new Date(nextD.getTime() + days * DAY));
  const last = after(-7);
  const next = after(0);

  const lastWeek = [
    update("Priya", last, { done: ["Rewrote the berth allocation model with time windows", "Cut solve time from 40 to 12 minutes"], next: ["Test on the two-week instance"] }),
    update("Casey", last, { done: ["Cleaned three months of truck GPS traces", "First map of yard congestion by hour"], next: ["Match traces to gate transactions"] }),
    update("Ravi", last, { done: ["Built a discrete-event model of the warehouse pick line"], next: ["Validate throughput against last month's logs"] }),
    update("Mei", last, { done: ["Survey of demand forecasting baselines", "Prophet vs gradient boosting on store data"], next: ["Pick a baseline for the paper", "Switch visualisation off R Shiny"] }),
    update("Omar", last, { done: ["Prototype LLM agent that drafts crane work orders", "Wrote 40 test cases for it"], next: ["Add a reviewer step that checks constraints"] }),
  ];
  const s = [
    ...(single ? [] : lastWeek),
    update("Priya", next, { weather: "light_cloud", done: ["Two-week instance solves in 25 minutes", "Added a rolling-horizon wrapper"], issues: ["Rolling horizon drops some late vessels"], next: ["Fix the hand-over between windows"], fun: "Finally tried the laksa place downstairs, 9/10", deep_dive: { topic: "Rolling-horizon hand-over", minutes: 15, with: [] } }),
    update("Casey", next, { weather: "clear", done: ["Matched 92% of GPS traces to gate transactions", "Heatmap of dwell time per yard block"], next: ["Write up the data pipeline section"] }),
    update("Ravi", next, { weather: "turbulence", done: ["Simulation runs but throughput is 15% too high"], issues: ["Missing break schedules for pickers"], next: ["Get shift rosters from the partner"] }),
    update("Mei", next, { weather: "crosswind", done: ["Gradient boosting beats Prophet on 8 of 10 stores"], issues: ["Unsure whether to report MAPE or MASE"], next: ["Run the holiday weeks separately"] }),
    update("Omar", next, { weather: "fog", done: ["Reviewer step catches 31 of 40 constraint violations"], issues: ["Agent still misses overlapping crane moves"], next: ["Add a deterministic overlap check as a tool"], fun: "Gave a lightning talk on LLM agents at the reading group" }),
    update("Alex", next, { weather: "clear", done: ["Set up this standup app for the lab"], next: ["Collect feedback after two meetings"] }, false),

    `INSERT INTO milestones (project_id, title, due_date, owners, status, notes, created_by)
      SELECT * FROM (VALUES
        (1, 'Conference talk', '${after(10)}', '[]', 'in_progress', 'Slides and one rehearsal', ${id("Priya")}),
        (1, 'Interim report to partner', '${after(24)}', '[]', 'planned', 'Sections 1 to 5', ${id("Alex")}),
        (1, 'Journal submission', '${after(52)}', '[]', 'planned', 'Berth allocation paper', ${id("Alex")}))
      WHERE NOT EXISTS (SELECT 1 FROM milestones);`,
  ];
  // Fill in waiting-on links and owners now that member ids are known.
  s.push(
    `UPDATE updates SET body = json_set(body, '$.waiting', json('[${waitingOn("Casey", "Gate transaction export for the last quarter")}]'))
       WHERE member_id = ${id("Ravi")} AND meeting_date = '${next}';`,
    `UPDATE updates SET body = json_set(body, '$.waiting', json('[${waitingOn("Priya", "Vessel schedule format")}, ${waitingOn("Elena", "Which error metric to report", true)}]'))
       WHERE member_id = ${id("Mei")} AND meeting_date = '${next}';`,
    `UPDATE updates SET body = json_set(body, '$.deep_dive.with', json('[__Ravi__, __Elena__, __Hugo__]'))
       WHERE member_id = ${id("Priya")} AND meeting_date = '${next}';`,
    `UPDATE milestones SET owners = json('[__Priya__]') WHERE title = 'Conference talk';`,
    `UPDATE milestones SET owners = json('[__Alex__, __Casey__, __Ravi__]') WHERE title <> 'Conference talk';`,
  );
  // Weekly meetings on Thursdays at 2pm, from ten weeks back to twelve weeks ahead (or only the next one).
  const [weeksBack, weeks] = single ? [0, 1] : [10, 23];
  s.push(
    `INSERT INTO schedule_series (id, project_id, rule, created_by) VALUES (1, 1, '{"from":"${after(-7 * weeksBack)}","to":"${after(7 * (weeks - weeksBack - 1))}","weekdays":[4],"every":1,"time":"14:00"}', ${id("Alex")}) ON CONFLICT DO NOTHING;`,
    ...Array.from({ length: weeks }, (_, i) => {
      const d = after(-7 * weeksBack + 7 * i);
      return `INSERT OR IGNORE INTO meeting_dates (project_id, date, time, series_id, created_by, cancelled, note) VALUES (1, '${d}', '14:00', 1, ${id("Alex")}, 0, '');`;
    }),
  );
  // Away dates (Ravi misses the next meeting) and last meeting's whiteboard, filed as a flight log.
  const note = (name, text, color, x, y) =>
    `INSERT INTO meeting_notes (project_id, meeting_date, author_id, text, color, x, y, updated_by) VALUES (1, '${last}', ${id(name)}, ${sql(text)}, '${color}', ${x}, ${y}, ${id(name)});`;
  s.push(
    `INSERT INTO away (member_id, from_date, to_date, note) SELECT ${id("Ravi")}, '${after(-2)}', '${after(1)}', 'Site visit at the warehouse' WHERE NOT EXISTS (SELECT 1 FROM away);`,
    `INSERT INTO away (member_id, from_date, to_date, note) SELECT ${id("Priya")}, '${after(9)}', '${after(12)}', 'Conference' WHERE (SELECT COUNT(*) FROM away) = 1;`,
  );
  if (!single)
    s.push(
      `DELETE FROM meeting_notes WHERE project_id = 1 AND meeting_date = '${last}';`,
      note("Alex", "Decision: weekly slides stop; everyone checks in here before the meeting.", "amber", 0, 14),
      note("Elena", "Mei: compare error metrics on the holiday weeks before choosing one.", "sky", 0.34, 14),
      note("Ravi", "Follow-up: ask the partner for picker shift rosters (Ravi, by Friday).", "mint", 0.68, 14),
    );
  // A second, smaller project so the project switcher and the Sky Lounge theme have something to show.
  s.push(
    `INSERT INTO projects (id, title, subtitle, palette, invite_code, created_by) VALUES (2, 'OR Reading Group', 'Fortnightly papers', 'lounge', 'READ2026', ${id("Alex")}) ON CONFLICT (id) DO NOTHING;`,
    ...[["Alex", "researcher", 1], ["Mei", "researcher", 0], ["Omar", "researcher", 0], ["Hugo", "prof", 0]].map(
      ([name, role, admin], i) => `INSERT OR IGNORE INTO memberships (project_id, member_id, role, is_admin, sort) VALUES (2, ${id(name)}, '${role}', ${admin}, ${i});`,
    ),
    update("Mei", next, { done: ["Read: column generation for vehicle routing (survey)"], next: ["Present the forecasting survey"] }, true, 2),
  );
  return s.map((stmt) => stmt.replace(/__(\w+)__/g, (_, name) => `' || ${id(name)} || '`));
}
