import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// Persona walkthroughs against the local dev server + demo data. Tests are written to be re-runnable.
const as = async (page: Page, email: string) => {
  await page.addInitScript((e) => localStorage.setItem("standup.devUser", e), email);
};
const NEXT = "2026-10-29"; // first demo meeting after "today" in the demo calendar
const hdr = (email: string) => ({ headers: { "x-dev-user": email } });
const memberId = async (request: APIRequestContext, name: string) =>
  ((await (await request.get("/api/p/1/members", hdr("alex.tan@example.edu"))).json()) as { id: number; name: string }[]).find((m) => m.name === name)!.id;

/** Answer the app's own confirm dialog (rule U2: no native confirm/prompt). */
const answer = async (page: Page, button: string | RegExp, fill?: string) => {
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  if (fill !== undefined) await dialog.getByRole("textbox").fill(fill);
  await dialog.getByRole("button", { name: button }).click();
  await expect(dialog).toHaveCount(0);
};

const errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
});
test.afterEach(async ({ page }, info) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "page must not scroll sideways").toBeLessThanOrEqual(0);
  expect(errors, "console errors").toEqual([]);
  await page.screenshot({ path: `test-results/shots/${info.project.name}-${info.title.replace(/\W+/g, "-")}.png`, fullPage: true });
});

test("researcher checks in late at night", async ({ page, request }) => {
  // Start from a blank card so toggles behave the same on every run and project.
  await request.put(`/api/p/1/updates/${NEXT}`, { data: { submit: false }, ...hdr("ravi.kumar@example.edu") });
  await as(page, "ravi.kumar@example.edu");
  await page.goto("/checkin");
  await page.getByRole("group", { name: "Flight conditions" }).getByRole("button", { name: /Turbulence/ }).click();
  await page.getByRole("textbox", { name: "Done this week item 1", exact: true }).fill("Wrote the crew-break constraint");
  await page.getByRole("textbox", { name: "Done this week item 1", exact: true }).press("Enter");
  await page.getByRole("textbox", { name: "Done this week item 2", exact: true }).fill("Validated against December roster");
  const add = page.getByRole("button", { name: "+ I need input from someone" });
  if (await page.getByLabel("Who you need input from, item 1").count() === 0) await add.click();
  await page.getByLabel("Who you need input from, item 1").selectOption({ label: "@leo" });
  await page.getByLabel("What you need, item 1").fill("Partner shift patterns");
  const preview = page.getByRole("article", { name: "Preview" });
  await expect(preview.getByText("🌧️ Turbulence")).toBeVisible();
  await expect(preview.getByText("Validated against December roster").first()).toBeVisible();
  // First time: submit. After that the card is already in and edits save themselves.
  const submit = page.getByRole("button", { name: "✈ Submit check-in" });
  if (await submit.count()) {
    await submit.click();
    await expect(page.getByRole("status")).toContainText(/Checked in/);
  }
  await expect(page.getByText("Checked in · changes save automatically")).toBeVisible();
  await expect(page.getByText("✓ Saved")).toBeVisible();
  await page.getByRole("link", { name: "Boarding", exact: true }).click();
  await page.getByRole("button", { name: /^Ravi/ }).first().click();
  await expect(page.getByRole("article").getByText("@leo").first()).toBeVisible();
});

test("last check-in's plan is offered as suggestions", async ({ page }) => {
  await as(page, "mei.wong@example.edu");
  await page.goto("/checkin");
  await expect(page.getByText("From your check-in for")).toBeVisible();
  await page.getByRole("button", { name: "✓ Switch visualisation off R Shiny" }).click();
  await expect(page.getByRole("textbox", { name: /^Done this week item/ }).last()).toHaveValue("Switch visualisation off R Shiny");
});

test("starting the meeting switches every screen to live", async ({ page, browser, request }) => {
  await request.post(`/api/p/1/meetings/${NEXT}/actions`, { data: { type: "reset" }, ...hdr("alex.tan@example.edu") });
  await as(page, "alex.tan@example.edu");
  await page.goto("/");
  await page.getByRole("button", { name: "▶ Start meeting" }).click();
  await expect(page.getByText("● Live meeting")).toBeVisible();

  const other = await browser.newPage();
  await as(other, "priya.nair@example.edu");
  await other.goto("/");
  await expect(other.getByText("● Live meeting")).toBeVisible();

  await page.getByRole("region", { name: "Stage" }).getByRole("button", { name: /Priya/ }).click();
  await expect(page.getByRole("article", { name: "Current presenter" }).getByText("Now presenting")).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Timer" }).getByText(/left of 5:00/)).toBeVisible();
  // The countdown ticks every second on the screen's own clock, not only when the next poll arrives (5 s apart).
  const big = other.getByRole("complementary", { name: "Timer" }).locator(".big");
  await expect(big).toBeVisible({ timeout: 8000 });
  const seen = new Set<string>();
  for (let i = 0; i < 4; i++) {
    seen.add(await big.innerText());
    await other.waitForTimeout(1000);
  }
  expect(seen.size, `timer showed ${[...seen].join(", ")}`).toBeGreaterThanOrEqual(3);
  await expect(other.getByRole("article", { name: "Current presenter" })).toContainText("PRIYA");

  await page.getByRole("button", { name: "✓ Close card" }).click();
  await expect(page.getByRole("region", { name: "Stage" }).getByRole("button", { name: /Priya/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Priya.*Boarded/ })).toBeVisible();
  await page.getByRole("button", { name: "End meeting" }).click();
  await expect(page.getByText("Meeting wrapped")).toBeVisible();
  await other.close();
});

test("pilots award a light-hearted badge from the card", async ({ page }) => {
  await as(page, "elena.rossi@example.edu");
  await page.goto("/");
  await page.getByRole("button", { name: /^Priya/ }).first().click();
  await page.getByLabel("Badge for Priya").selectOption("team_player");
  await page.getByRole("button", { name: "Award" }).click();
  await expect(page.getByRole("status")).toContainText("Badge sent to Priya");
});

test("crew cannot award badges", async ({ page }) => {
  await as(page, "leo.martin@example.edu");
  await page.goto("/");
  await page.getByRole("button", { name: /^Priya/ }).first().click();
  await expect(page.getByRole("button", { name: /Commend(ed)? Priya/ })).toBeVisible();
  await expect(page.getByLabel(/Badge for/)).toHaveCount(0);
});

test("anyone edits a milestone and it is logged", async ({ page }) => {
  await as(page, "casey.lim@example.edu");
  await page.goto("/timeline");
  const title = `E2E milestone ${Date.now() % 100000}`;
  await page.getByRole("button", { name: "+ Add milestone" }).click();
  await page.getByRole("textbox", { name: "Milestone", exact: true }).fill(title);
  await page.getByLabel("Due", { exact: true }).fill("2026-12-01");
  await page.getByRole("button", { name: "Add to the board" }).click();
  await expect(page.getByRole("region", { name: "Milestones" }).getByText(title, { exact: true })).toBeVisible();
  await page.getByRole("row", { name: new RegExp(title) }).getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Due", { exact: true }).fill("2026-12-08");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByText("Change history").click();
  await expect(page.getByRole("region", { name: "Change log" }).getByText(new RegExp(`moved the date Tue,? 1 Dec → Tue,? 8 Dec on “${title}”`))).toBeVisible();
  await page.getByRole("button", { name: `Remove ${title}` }).click();
  await answer(page, "Remove");
  await expect(page.getByRole("region", { name: "Milestones" }).getByText(title, { exact: true })).toHaveCount(0);
});

test("commend a teammate once this week", async ({ page, request }) => {
  const priya = await memberId(request, "Priya");
  await request.delete(`/api/p/1/commends/${NEXT}/${priya}`, hdr("leo.martin@example.edu"));
  await as(page, "leo.martin@example.edu");
  await page.goto("/");
  await page.getByRole("button", { name: /^Priya/ }).first().click();
  await page.getByRole("button", { name: "👏 Commend Priya" }).click();
  await expect(page.getByRole("button", { name: "✓ Commended Priya" })).toBeVisible();
  await expect(page.getByText(/^👏 \d+ commends?$/).first()).toBeVisible(); // a count only: commends are anonymous
});

test("the person asked marks it cleared; the person waiting confirms", async ({ page, browser, request }) => {
  const [priya, elena] = [await memberId(request, "Priya"), await memberId(request, "Elena")];
  const text = `E2E feed ${Date.now() % 100000}`;
  await request.put("/api/p/1/updates/2026-11-05", {
    data: { waiting: [{ member_id: priya, text }, { member_id: elena, text: "secret metric question", private: true }] },
    ...hdr("leo.martin@example.edu"),
  });
  // Private items never reach other people's screens.
  const priyaView = (await (await request.get("/api/p/1/updates?date=2026-11-05", hdr("priya.nair@example.edu"))).json()) as { updates: { waiting: { text: string }[] }[] };
  expect(priyaView.updates.flatMap((u) => u.waiting.map((w) => w.text))).not.toContain("secret metric question");

  await as(page, "priya.nair@example.edu");
  await page.goto("/profile");
  const mine = page.getByRole("region", { name: "Waiting on you" });
  await mine.locator(".hrow", { hasText: text }).getByRole("button", { name: "✓ Mark cleared" }).click();
  await expect(page.getByRole("status")).toContainText("Told Leo it's cleared");
  await expect(page.getByRole("status")).toHaveClass(/(^|\s)out(\s|$)/,{ timeout: 5000 }); // fades out rather than vanishing
  await expect(page.getByRole("status")).toHaveCount(0);

  const leo = await browser.newPage();
  await as(leo, "leo.martin@example.edu");
  await leo.goto("/?date=2026-11-05");
  const row = leo.getByRole("region", { name: "Holding pattern" }).locator(".hrow", { hasText: text });
  await expect(row.getByText("Priya says cleared")).toBeVisible();
  await row.getByRole("button", { name: "✓ Confirm cleared" }).click();
  await expect(leo.getByRole("region", { name: "Holding pattern" }).locator(".hrow", { hasText: text })).toHaveCount(0);
  await expect(leo.getByRole("region", { name: "Holding pattern" }).getByText("secret metric question")).toBeVisible(); // Leo can see his own private item
  await leo.close();
});

test("upload a photo avatar, then go back to the drawn one", async ({ page }) => {
  await as(page, "omar.haddad@example.edu");
  await page.goto("/profile");
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  await page.getByLabel("Upload a photo").setInputFiles({ name: "me.png", mimeType: "image/png", buffer: png });
  await expect(page.getByRole("status")).toContainText("Photo updated");
  const photos = page.locator('.photo:not(.pic-thumb) img[src^="/api/avatars/"]');
  await expect(photos.first()).toBeVisible();
  await page.getByRole("button", { name: /Drawn avatar/ }).click();
  await expect(page.getByRole("status")).toContainText("drawn avatar");
  await expect(photos).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Last used photo/ })).toBeVisible(); // kept so you can switch back
});

test("profile flairs show on the card", async ({ page }) => {
  await as(page, "casey.lim@example.edu");
  await page.goto("/profile");
  const flair = page.getByLabel("Flair 1 text");
  if ((await flair.count()) === 0) await page.getByRole("button", { name: "+ add a flair" }).click();
  await page.getByLabel("Flair 1 text").fill("INFORMS-bound");
  await expect(page.getByText("Changes save automatically · ✓ Saved")).toBeVisible();
  await page.goto("/");
  await page.getByRole("button", { name: /^Casey/ }).first().click();
  await expect(page.getByRole("article").getByText("INFORMS-bound")).toBeVisible();
});

test("admin adds a person and a repeating schedule", async ({ page }) => {
  await as(page, "alex.tan@example.edu");
  await page.goto("/admin");
  const email = `e2e_${Date.now() % 100000}@example.edu`;
  await page.getByLabel("New member email").fill(email);
  await page.getByLabel("New member name").fill("E2E Person");
  await page.getByRole("button", { name: "+ Add" }).click();
  await expect(page.getByRole("status")).toContainText("Added E2E Person");
  await page.getByRole("row", { name: new RegExp(email) }).getByRole("button", { name: "Remove" }).click();
  await answer(page, "Remove");
  const removed = page.getByRole("row", { name: new RegExp(email) });
  await expect(removed.getByRole("button", { name: "Restore" })).toBeVisible();
  // Removed people sink below everyone active, and can be deleted for good.
  await expect(page.locator(".fids tbody tr").last()).toContainText(email);
  await removed.getByRole("button", { name: "Delete" }).click();
  await answer(page, "Delete for good");
  await expect(page.getByRole("row", { name: new RegExp(email) })).toHaveCount(0);
  // Admins can't take away their own admin rights.
  await expect(page.getByRole("checkbox", { name: "Alex is admin" })).toBeDisabled();

  const sched = page.getByRole("region", { name: "Meeting schedule" });
  await sched.getByRole("button", { name: "Tue", exact: true }).click();
  await sched.getByLabel("Starts").fill("2031-01-01");
  await sched.getByLabel("Ends by").fill("2031-01-31");
  await sched.getByRole("button", { name: "Create series" }).click();
  await expect(page.getByRole("status")).toContainText(/Added \d+ meetings/);
});

test("non-admins don't see the admin console", async ({ page }) => {
  await as(page, "leo.martin@example.edu");
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);
});

test("a newcomer joins a project with its invite code", async ({ page }) => {
  await as(page, `e2e_new_${Date.now() % 100000}@example.edu`);
  await page.goto("/");
  await expect(page.getByText("not in any project yet")).toBeVisible();
  await page.getByLabel("Invite code").fill("read-2026");
  await page.getByRole("button", { name: "Join project" }).click();
  await expect(page.getByRole("button", { name: /OR Reading Group: switch project/ })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-palette", "lounge");
  await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);
});

test("anyone starts a project, picks a theme, sees its invite code, and can leave", async ({ page }) => {
  await as(page, "leo.martin@example.edu");
  await page.goto("/");
  const title = `E2E project ${Date.now() % 100000}`;
  await page.getByRole("button", { name: /switch project/ }).click();
  await page.getByRole("menuitem", { name: "＋ New project" }).click();
  await page.getByLabel("Project title").fill(title);
  await page.getByLabel("Subtitle (optional)").fill("Side quest");
  await page.getByRole("radio", { name: /Lab Notebook/ }).click();
  await page.getByRole("button", { name: "✈ Create project" }).click();
  await expect(page.getByRole("button", { name: new RegExp(`${title}: switch project`) })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-palette", "notebook");
  await page.getByRole("link", { name: "Admin" }).click();
  await expect(page.getByLabel("Invite code")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-palette", "notebook"); // opening Admin keeps the theme
  await expect(page.getByLabel("Invite code")).toHaveText(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  await page.getByRole("button", { name: /switch project/ }).click();
  await page.getByRole("menuitem", { name: `Leave ${title}` }).click();
  // Leo is the only person in it, so leaving closes it for good: he's warned and must type its name.
  await expect(page.getByRole("alertdialog")).toContainText("You're the last person");
  await expect(page.getByRole("alertdialog").getByRole("button", { name: "⬇ Export the project's data" })).toBeVisible();
  await answer(page, "Leave and close the project", "wrong name");
  await expect(page.getByRole("status")).toContainText("still open");
  await page.getByRole("button", { name: /switch project/ }).click();
  await page.getByRole("menuitem", { name: `Leave ${title}` }).click();
  await answer(page, "Leave and close the project", title);
  await expect(page.getByRole("status")).toContainText(`${title} is closed`);
  await expect(page.getByRole("button", { name: /Harbour Lab Weekly: switch project/ })).toBeVisible();
});

test("the presenting order moves with the ☰ handle and is shared", async ({ page, request }) => {
  await request.post(`/api/p/1/meetings/${NEXT}/actions`, { data: { type: "order", order: [] }, ...hdr("alex.tan@example.edu") });
  await as(page, "alex.tan@example.edu");
  await page.goto("/");
  const handle = page.getByRole("button", { name: /^Move Alex/ });
  await handle.focus();
  await handle.press("ArrowDown");
  await handle.press("ArrowDown");
  const names = page.getByRole("region", { name: "Departures" }).locator("[data-order-id] .flap");
  await expect(names.nth(2)).toHaveAttribute("aria-label", "Alex");
  await expect(async () => {
    const s = (await (await request.get(`/api/p/1/meetings/${NEXT}/state`, hdr("priya.nair@example.edu"))).json()) as { state: { order: number[] } };
    expect(s.state.order[2]).toBe(await memberId(request, "Alex"));
  }).toPass();
  await expect(page.getByRole("region", { name: "Departures" }).getByRole("button", { name: "reset" })).toHaveCount(0); // removed: the "usual" order was just join order
});

test("My check-in saves itself, even when you switch tabs straight away", async ({ page }) => {
  await as(page, "omar.haddad@example.edu");
  await page.goto("/checkin");
  const status = `autosaved ${Date.now()}`;
  await page.getByRole("textbox", { name: "Next week item 1", exact: true }).fill(status);
  await page.getByRole("link", { name: "Timeline" }).click();
  await expect(page).toHaveURL(/\/timeline/);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await page.getByRole("link", { name: "My check-in" }).click();
  await expect(page.getByRole("textbox", { name: "Next week item 1", exact: true })).toHaveValue(status);
});

test("pages with a Save button ask before you leave unsaved changes", async ({ page }) => {
  await as(page, "alex.tan@example.edu");
  await page.goto("/admin");
  await page.getByLabel("Subtitle").fill("Unsaved subtitle");
  await page.getByRole("link", { name: "Timeline" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Leave without saving?");
  await answer(page, "Stay on this page");
  await expect(page).toHaveURL(/\/admin/);
  await page.getByRole("link", { name: "Timeline" }).click();
  await answer(page, "Leave without saving");
  await expect(page).toHaveURL(/\/timeline/);
});

test("admins schedule a meeting with no set time", async ({ page }) => {
  await as(page, "alex.tan@example.edu");
  await page.goto("/admin");
  const sched = page.getByRole("region", { name: "Meeting schedule" });
  await sched.getByLabel("Meeting date").fill("2031-06-05");
  await expect(sched.getByLabel("One-off time")).toHaveCount(0);
  await sched.getByRole("button", { name: "Add meeting" }).click();
  await expect(page.getByRole("status")).toContainText("Meeting added");
  const row = sched.locator(".sched-item", { hasText: "5 Jun 2031" });
  await expect(row).toContainText("no set time");
  // Cancelling asks for an optional reason in the app's own dialog.
  await row.getByRole("button", { name: "Cancel" }).click();
  await answer(page, "Cancel meeting", "Public holiday");
  await expect(row).toContainText("cancelled: Public holiday");
  await row.getByRole("button", { name: "Restore" }).click();
  await expect(row).not.toContainText("cancelled");
});

test("what's new lists the patch notes", async ({ page }) => {
  await as(page, "priya.nair@example.edu");
  await page.goto("/");
  await page.getByRole("button", { name: /What's new/ }).click();
  await expect(page.getByRole("dialog", { name: "What's new" })).toContainText("First boarding");
});

test("marking yourself away shows on the calendar and the board", async ({ page }) => {
  await as(page, "hugo.berg@example.edu");
  await page.goto("/calendar");
  const panel = page.getByRole("region", { name: "I'm away" });
  await panel.getByLabel("First day").fill(NEXT);
  await panel.getByLabel("Where or why (optional)").fill("Examining a thesis");
  await panel.getByRole("button", { name: "🧳 Add away dates" }).click();
  await expect(page.getByRole("status")).toContainText("Away dates saved");
  await expect(page.getByRole("gridcell", { name: /29 Oct 2026.*away/ })).toBeVisible();
  await page.getByRole("link", { name: "Boarding", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Hugo/ })).toContainText("Away · Examining a thesis");
  // Clean up so the test can run again.
  await page.getByRole("link", { name: "Calendar" }).click();
  await panel.getByRole("button", { name: `Remove away dates from ${NEXT}` }).click();
  await expect(panel.getByText("Examining a thesis")).toHaveCount(0);
});

test("a date picker near the right edge opens leftwards, so it stays on screen", async ({ page }) => {
  await as(page, "hugo.berg@example.edu");
  await page.goto("/calendar");
  await page.getByRole("region", { name: "I'm away" }).getByLabel("Last day").click();
  const pop = await page.getByRole("dialog", { name: "Choose a date" }).boundingBox();
  const width = page.viewportSize()!.width;
  expect(pop!.x).toBeGreaterThanOrEqual(0);
  expect(pop!.x + pop!.width).toBeLessThanOrEqual(width);
});

test("the whiteboard is shared live and filed as a flight log after the meeting", async ({ page, browser, request }) => {
  const D = "2026-11-05";
  const alex = hdr("alex.tan@example.edu");
  for (const n of (await (await request.get(`/api/p/1/notes/${D}`, alex)).json()) as { id: number }[]) await request.delete(`/api/p/1/notes/${D}/${n.id}`, alex);
  await request.post(`/api/p/1/meetings/${D}/actions`, { data: { type: "reset" }, ...alex });

  await as(page, "alex.tan@example.edu");
  await page.goto(`/?date=${D}`);
  const priya = await browser.newPage();
  await as(priya, "priya.nair@example.edu");
  await priya.goto(`/?date=${D}`);

  const board = page.getByRole("region", { name: "Whiteboard" });
  await board.getByRole("button", { name: "＋ Add a note" }).click();
  await expect(board.getByRole("textbox", { name: "Note by Alex" })).toBeFocused();
  await page.keyboard.type("Decision: Priya presents the 15-day results first");
  // Priya sees the words arrive and that Alex is still typing, so she can't type over him.
  const theirs = priya.getByRole("region", { name: "Whiteboard" });
  await expect(theirs.getByRole("textbox", { name: "Note by Alex" })).toHaveValue(/15-day results first/, { timeout: 15_000 });
  await expect(theirs.getByText("Alex is typing…")).toBeVisible();
  await expect(theirs.getByRole("textbox", { name: "Note by Alex" })).not.toBeEditable();
  // Once he clicks away, she can add to it.
  await board.getByText("Everyone sees changes", { exact: false }).click();
  await expect(theirs.getByText("Alex is typing…")).toHaveCount(0, { timeout: 15_000 });
  await expect(theirs.getByRole("textbox", { name: "Note by Alex" })).toBeEditable();
  await priya.close();

  // After the meeting, the notes become that day's flight log on the calendar.
  await request.post(`/api/p/1/meetings/${D}/actions`, { data: { type: "phase", phase: "wrap" }, ...alex });
  await page.getByRole("link", { name: "Calendar" }).click();
  await page.getByRole("button", { name: "Next month" }).click();
  await page.getByRole("gridcell", { name: /5 Nov 2026.*flight log with 1 note/ }).click();
  await expect(page.getByRole("region", { name: "Selected day" })).toContainText("Decision: Priya presents the 15-day results first");
  await request.post(`/api/p/1/meetings/${D}/actions`, { data: { type: "reset" }, ...alex });
});

for (const path of ["/", "/checkin", "/timeline", "/calendar", "/profile", "/admin"]) {
  test(`layout ${path}`, async ({ page }) => {
    await as(page, "alex.tan@example.edu");
    await page.goto(path);
    await expect(page.getByRole("navigation", { name: "Sections" })).toBeVisible();
    await page.waitForTimeout(900); // let split-flap letters settle before the screenshot
    // Nothing runs off the side of the screen (rule U1), e.g. long emails in the Admin team list on a phone.
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  });
}

test("pilots can award a custom badge, but not a ranking", async ({ page }) => {
  await as(page, "hugo.berg@example.edu");
  await page.goto("/");
  await page.getByRole("button", { name: /^Leo/ }).first().click();
  await page.getByLabel("Badge for Leo").selectOption("custom");
  await page.getByLabel("Badge name").fill("Best of the team");
  await page.getByRole("button", { name: "Award" }).click();
  await expect(page.getByRole("status")).toContainText("not rankings");
  await page.getByLabel("Badge name").fill("Roster Tamer");
  await page.getByLabel("Badge emoji (optional)").fill("🦁");
  await page.getByRole("button", { name: "Award" }).click();
  await expect(page.getByRole("status")).toContainText("Badge sent to Leo");
  await expect(page.getByRole("article").getByText("Roster Tamer").first()).toBeVisible();
});

test("the card you opened on Boarding is still open when you come back", async ({ page }) => {
  await as(page, "priya.nair@example.edu");
  await page.goto("/");
  await page.getByRole("button", { name: /^Omar/ }).first().click();
  await expect(page.getByRole("article", { name: "Omar's check-in" })).toBeVisible();
  await page.getByRole("link", { name: "Timeline" }).click();
  await page.getByRole("link", { name: "Boarding", exact: true }).click();
  await expect(page.getByRole("article", { name: "Omar's check-in" })).toBeVisible();
});

test("links jump to the exact place and highlight it", async ({ page }) => {
  await as(page, "alex.tan@example.edu");
  await page.goto("/calendar");
  await page.getByRole("gridcell", { name: /22 Oct 2026.*flight log/ }).click();
  await page.getByRole("link", { name: "Open the whiteboard" }).click();
  await expect(page).toHaveURL(/date=2026-10-22.*focus=whiteboard/);
  const board = page.getByRole("region", { name: "Whiteboard" });
  await expect(board).toHaveClass(/flash/);
  await expect(board).toBeInViewport();
  // The header milestone chips go straight to their row on the Timeline.
  await page.getByRole("navigation", { name: "Upcoming milestones" }).getByRole("link").first().click();
  await expect(page.locator("tr.flash")).toBeInViewport();
});

test("dragging a presenter down moves them several rows in one go", async ({ page, request }) => {
  await request.post(`/api/p/1/meetings/${NEXT}/actions`, { data: { type: "order", order: [] }, ...hdr("alex.tan@example.edu") });
  await as(page, "alex.tan@example.edu");
  await page.goto("/");
  const names = page.getByRole("region", { name: "Departures" }).locator("[data-order-id] .flap");
  await expect(names.first()).toHaveAttribute("aria-label", "Alex");
  await page.getByRole("button", { name: /^Move Alex/ }).scrollIntoViewIfNeeded();
  const grip = await page.getByRole("button", { name: /^Move Alex/ }).boundingBox();
  const target = await page.getByRole("button", { name: /^Move Ravi/ }).boundingBox();
  await page.mouse.move(grip!.x + grip!.width / 2, grip!.y + grip!.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip!.x + grip!.width / 2, target!.y + target!.height, { steps: 25 });
  await page.mouse.up();
  await expect(names.nth(3)).toHaveAttribute("aria-label", "Alex"); // three rows down in one drag
  await request.post(`/api/p/1/meetings/${NEXT}/actions`, { data: { type: "order", order: [] }, ...hdr("alex.tan@example.edu") });
});

test("notification links land on the request and the badge", async ({ page, request }) => {
  const elena = await memberId(request, "Elena");
  const text = `link check ${Date.now() % 100000}`;
  // A card dated after all of Casey's others, so it is his latest (Waiting on you reads latest cards).
  await request.put("/api/p/1/updates/2032-02-05", { data: { waiting: [{ member_id: elena, text }], submit: true }, ...hdr("casey.lim@example.edu") });
  await request.post("/api/p/1/badges", { data: { member_id: elena, badge_key: "custom", label: "Link Tester", icon: "🔗" }, ...hdr("hugo.berg@example.edu") });
  await as(page, "elena.rossi@example.edu");
  await page.goto("/");
  await page.getByRole("button", { name: /^Notifications/ }).click();
  await page.locator(".notif", { hasText: text }).click();
  await expect(page).toHaveURL(/\/profile/);
  await expect(page.locator(".hrow.flash")).toContainText(text);
  await page.getByRole("button", { name: /^Notifications/ }).click();
  await page.locator(".notif", { hasText: "Link Tester" }).first().click();
  await expect(page.locator(".badge-chip.flash")).toContainText("Link Tester");
});

test("the garden: a click surprises someone, a double-click shows their boarding pass", async ({ page }) => {
  await as(page, "alex.tan@example.edu");
  await page.goto("/profile");
  await page.getByRole("button", { name: /Visit the garden/ }).click();
  const garden = page.getByRole("dialog", { name: "Garden" });
  await expect(garden).toBeVisible();
  const people = garden.locator(".gd-figure");
  await expect(people.first()).toBeAttached();
  await expect(garden.getByText(`👥 ${await people.count()} in the garden`)).toBeVisible();
  // People keep walking, so clicks are sent straight to them rather than aimed at a spot on screen.
  const priya = garden.getByRole("button", { name: /^Priya:/ });
  await priya.dispatchEvent("click");
  await expect(garden.locator(".gd-layer")).toHaveAttribute("data-last-action", /^(snack|toy|bonk|react|plane)$/);
  await priya.dispatchEvent("click");
  await priya.dispatchEvent("click");
  const pass = garden.getByRole("dialog", { name: "Priya's boarding pass" });
  await expect(pass).toBeVisible();
  await expect(pass).toContainText("Flight");
  await page.keyboard.press("Escape"); // closes the pass first
  await expect(pass).toHaveCount(0);
  await expect(garden).toBeVisible();
  // Pick a scene from the menu; Esc closes the menu before the garden, and the profile button remembers the choice.
  await garden.getByRole("button", { name: /Garden scene: Meadow airstrip/ }).click();
  await garden.getByRole("option", { name: /Mount Fuji/ }).click();
  await expect(garden.getByRole("button", { name: /Garden scene: Mount Fuji/ })).toBeVisible();
  await garden.getByRole("button", { name: /Garden scene/ }).click();
  await expect(garden.getByRole("listbox", { name: "Garden scene" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(garden.getByRole("listbox")).toHaveCount(0);
  await expect(garden).toBeVisible();
  await garden.getByRole("button", { name: /go back/ }).click(); // "Press esc to go back", or "Tap here" on a phone
  await expect(garden).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Visit the garden/ })).toBeFocused();
  await expect(page.getByRole("button", { name: /Visit the garden/ })).toContainText("Mount Fuji");
});

test("an untouched Board stops polling after 10 minutes but still checks for the meeting", async ({ page }) => {
  await page.clock.install();
  await as(page, "priya.nair@example.edu");
  await page.goto("/?date=2026-12-03"); // a date no other test starts a meeting on
  await expect(page.getByRole("button", { name: /^Omar/ }).first()).toBeVisible();
  const calls: string[] = [];
  page.on("request", (r) => r.url().includes("/api/") && calls.push(new URL(r.url()).pathname));
  await page.clock.runFor(60_000);
  expect(calls.length, "an active Board polls several routes").toBeGreaterThan(15);
  await page.clock.runFor(10 * 60_000);
  calls.length = 0;
  await page.clock.runFor(5 * 60_000);
  expect(calls.every((p) => p.endsWith("/state")), `only the meeting check runs while idle: ${calls.join(", ")}`).toBe(true);
  expect(calls.length).toBeGreaterThanOrEqual(4);
  expect(calls.length).toBeLessThanOrEqual(6);
  // Any input brings everything back at once.
  const idle = calls.length;
  await page.mouse.move(20, 20);
  await expect.poll(() => calls.length).toBeGreaterThan(idle + 5);
});
