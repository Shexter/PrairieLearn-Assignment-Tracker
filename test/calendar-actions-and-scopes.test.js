const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("shared/tracker-core.js", "utf8");
const context = { TextEncoder, crypto: require("node:crypto").webcrypto, URL, Date, URLSearchParams };
vm.runInNewContext(source, context);
const core = context.PrairieLearnTrackerCore;

const now = new Date("2026-09-10T12:00:00Z").getTime();

test("isEligibleForCalendarAction enforces future verified deadline and usable URL", () => {
  const eligibleItem = {
    courseInstanceId: "101",
    courseLabel: "CS 225",
    title: "Binary Trees",
    deadlineAt: "2026-09-15T18:00:00Z",
    deadlineSource: "visible_until",
    href: "https://us.prairielearn.com/pl/course_instance/101/assessment/5/",
    status: "open",
  };
  assert.equal(core.isEligibleForCalendarAction(eligibleItem, now), true);

  // Ineligible: past deadline
  assert.equal(core.isEligibleForCalendarAction({ ...eligibleItem, deadlineAt: "2026-09-09T18:00:00Z" }, now), false);

  // Ineligible: closed assessment
  assert.equal(core.isEligibleForCalendarAction({ ...eligibleItem, status: "closed" }, now), false);
  assert.equal(core.isEligibleForCalendarAction({ ...eligibleItem, availabilityText: "Assessment closed" }, now), false);

  // Ineligible: missing URL
  assert.equal(core.isEligibleForCalendarAction({ ...eligibleItem, href: null, absoluteUrl: null }, now), false);

  // Ineligible: javascript: URL
  assert.equal(core.isEligibleForCalendarAction({ ...eligibleItem, href: "javascript:alert(1)" }, now), false);

  // Ineligible: data: URL
  assert.equal(core.isEligibleForCalendarAction({ ...eligibleItem, href: "data:text/html,<script>alert(1)</script>" }, now), false);

  // Ineligible: vbscript: URL
  assert.equal(core.isEligibleForCalendarAction({ ...eligibleItem, href: "vbscript:msgbox(1)" }, now), false);

  // Ineligible: file: URL
  assert.equal(core.isEligibleForCalendarAction({ ...eligibleItem, href: "file:///etc/passwd" }, now), false);

  // Ineligible: cross-origin URL
  assert.equal(core.isEligibleForCalendarAction({ ...eligibleItem, href: "https://evil.com/phish" }, now), false);

  // Ineligible: malformed URL
  assert.equal(core.isEligibleForCalendarAction({ ...eligibleItem, href: "https://us.prairielearn.com:999999/bad" }, now), false);

  // Ineligible: missing deadline
  assert.equal(core.isEligibleForCalendarAction({ ...eligibleItem, deadlineAt: null }, now), false);
});

test("buildGoogleCalendarComposeUrl constructs permission-free URL with exact encoding", () => {
  const item = {
    courseInstanceId: "101",
    courseLabel: "CS 225",
    badge: "HW 3",
    title: "Trees & BSTs",
    deadlineAt: "2026-09-15T18:00:00Z",
    deadlineSource: "visible_until",
    href: "https://us.prairielearn.com/pl/course_instance/101/assessment/5/",
  };
  const urlString = core.buildGoogleCalendarComposeUrl(item, "https://us.prairielearn.com", now);
  assert.ok(urlString);

  const url = new URL(urlString);
  assert.equal(url.origin, "https://calendar.google.com");
  assert.equal(url.pathname, "/calendar/render");
  assert.equal(url.searchParams.get("action"), "TEMPLATE");
  assert.equal(url.searchParams.get("text"), "Due: CS 225 · HW 3 · Trees & BSTs");
  assert.equal(url.searchParams.get("dates"), "20260915T174500Z/20260915T180000Z");
  assert.ok(url.searchParams.get("details").includes("https://us.prairielearn.com/pl/course_instance/101/assessment/5/"));

  // Ineligible item returns null
  assert.equal(core.buildGoogleCalendarComposeUrl({ ...item, status: "closed" }, "https://us.prairielearn.com", now), null);
});

test("buildOutlookWebComposeUrl constructs permission-free URL with exact encoding", () => {
  const item = {
    courseInstanceId: "101",
    courseLabel: "CS 225",
    badge: "HW 3",
    title: "Trees & BSTs",
    deadlineAt: "2026-09-15T18:00:00Z",
    deadlineSource: "visible_until",
    href: "https://us.prairielearn.com/pl/course_instance/101/assessment/5/",
  };
  const urlString = core.buildOutlookWebComposeUrl(item, "https://us.prairielearn.com", now);
  assert.ok(urlString);

  const url = new URL(urlString);
  assert.equal(url.origin, "https://outlook.live.com");
  assert.equal(url.searchParams.get("rru"), "addevent");
  assert.equal(url.searchParams.get("subject"), "Due: CS 225 · HW 3 · Trees & BSTs");
  assert.equal(url.searchParams.get("startdt"), "2026-09-15T17:45:00.000Z");
  assert.equal(url.searchParams.get("enddt"), "2026-09-15T18:00:00.000Z");
  assert.ok(url.searchParams.get("body").includes("https://us.prairielearn.com/pl/course_instance/101/assessment/5/"));

  // Ineligible item returns null
  assert.equal(core.buildOutlookWebComposeUrl({ ...item, deadlineAt: "2026-09-01T00:00:00Z" }, "https://us.prairielearn.com", now), null);
});

test("filterCalendarItemsByScope filters by all, current course, and next seven days", () => {
  const items = [
    // In next 7 days, Course 1
    { courseInstanceId: "1", courseLabel: "CS 225", title: "HW 1", deadlineAt: "2026-09-12T18:00:00Z", deadlineSource: "visible_until", href: "/pl/1/1" },
    // Later than 7 days, Course 1
    { courseInstanceId: "1", courseLabel: "CS 225", title: "HW 4", deadlineAt: "2026-09-25T18:00:00Z", deadlineSource: "visible_until", href: "/pl/1/4" },
    // In next 7 days, Course 2
    { courseInstanceId: "2", courseLabel: "MATH 241", title: "Quiz 1", deadlineAt: "2026-09-13T18:00:00Z", deadlineSource: "visible_until", href: "/pl/2/1" },
  ];

  // Scope: all
  const all = core.filterCalendarItemsByScope(items, "all", {}, now);
  assert.equal(all.length, 3);

  // Scope: course (Course 1)
  const course1 = core.filterCalendarItemsByScope(items, "course", { courseInstanceId: "1" }, now);
  assert.deepEqual(course1.map((i) => i.title), ["HW 1", "HW 4"]);

  // Scope: course (Course 2)
  const course2 = core.filterCalendarItemsByScope(items, "course", { courseInstanceId: "2" }, now);
  assert.deepEqual(course2.map((i) => i.title), ["Quiz 1"]);

  // Scope: course with non-matching ID
  const courseUnknown = core.filterCalendarItemsByScope(items, "course", { courseInstanceId: "999" }, now);
  assert.equal(courseUnknown.length, 0);

  // Scope: week (next 7 days)
  const week = core.filterCalendarItemsByScope(items, "week", {}, now);
  assert.deepEqual(week.map((i) => i.title), ["HW 1", "Quiz 1"]);
});

test("RFC 5545 VALARM display alarms are generated with correct offsets and boundaries", async () => {
  // 1. > 24 hours away: receives both 24h and 2h display alarms
  const futureItem = {
    courseInstanceId: "1",
    courseLabel: "CS 225",
    title: "Far Away",
    deadlineAt: "2026-09-15T12:00:00Z", // 5 days away from 2026-09-10T12:00:00Z
    deadlineSource: "visible_until",
    href: "https://us.prairielearn.com/pl/1/1",
  };
  const icsFuture = await core.buildIcs([futureItem], "https://us.prairielearn.com", now);
  assert.match(icsFuture, /BEGIN:VALARM[\s\S]*?TRIGGER:-PT24H[\s\S]*?END:VALARM/);
  assert.match(icsFuture, /BEGIN:VALARM[\s\S]*?TRIGGER:-PT2H[\s\S]*?END:VALARM/);
  assert.equal((icsFuture.match(/BEGIN:VALARM/g) || []).length, 2);

  // 2. Between 2h and 24h away: 24h has passed, so only 2h alarm remains
  const mediumItem = {
    courseInstanceId: "1",
    courseLabel: "CS 225",
    title: "Due Tonight",
    deadlineAt: "2026-09-10T20:00:00Z", // 8 hours away
    deadlineSource: "visible_until",
    href: "https://us.prairielearn.com/pl/1/2",
  };
  const icsMedium = await core.buildIcs([mediumItem], "https://us.prairielearn.com", now);
  assert.ok(!icsMedium.includes("TRIGGER:-PT24H"));
  assert.match(icsMedium, /TRIGGER:-PT2H/);
  assert.equal((icsMedium.match(/BEGIN:VALARM/g) || []).length, 1);

  // 3. Less than 2h away: both alarms have passed, so omit all VALARMs
  const soonItem = {
    courseInstanceId: "1",
    courseLabel: "CS 225",
    title: "Due Soon",
    deadlineAt: "2026-09-10T13:00:00Z", // 1 hour away
    deadlineSource: "visible_until",
    href: "https://us.prairielearn.com/pl/1/3",
  };
  const icsSoon = await core.buildIcs([soonItem], "https://us.prairielearn.com", now);
  assert.equal((icsSoon.match(/BEGIN:VALARM/g) || []).length, 0);
  assert.match(icsSoon, /BEGIN:VEVENT/);
});

test("buildIcs supports scoped exports and empty scope handling", async () => {
  const items = [
    { courseInstanceId: "1", courseLabel: "CS 225", title: "HW 1", deadlineAt: "2026-09-12T18:00:00Z", deadlineSource: "visible_until", href: "https://us.prairielearn.com/pl/1/1" },
    { courseInstanceId: "2", courseLabel: "MATH 241", title: "Quiz 1", deadlineAt: "2026-09-13T18:00:00Z", deadlineSource: "visible_until", href: "https://us.prairielearn.com/pl/2/1" },
  ];

  const course1Ics = await core.buildIcs(items, "https://us.prairielearn.com", now, { scope: "course", courseInstanceId: "1" });
  assert.match(course1Ics, /SUMMARY:Due: CS 225 · HW 1/);
  assert.ok(!course1Ics.includes("MATH 241"));

  const emptyIcs = await core.buildIcs(items, "https://us.prairielearn.com", now, { scope: "course", courseInstanceId: "999", requireNonEmpty: true });
  assert.equal(emptyIcs, null);
});
