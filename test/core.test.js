const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("shared/tracker-core.js", "utf8");
const context = { TextEncoder, crypto: require("node:crypto").webcrypto, URL, Date, URLSearchParams };
vm.runInNewContext(source, context);
const core = context.PrairieLearnTrackerCore;

const now = new Date("2026-09-10T12:00:00Z").getTime();

test("visible until is the deadline and Available is not", () => {
  const until = core.getDeadlineInfo("100% until 11:00, Fri, Sep 11", [] , new Date(now));
  assert.equal(until.deadlineSource, "visible_until");
  assert.equal(until.deadlineAt, new Date(2026, 8, 11, 11, 0, 0).toISOString());
  const available = core.getDeadlineInfo("Available 08:00, Thu, Sep 17", [], new Date(now));
  assert.equal(available.deadlineAt, null);
  assert.equal(available.deadlineSource, null);
});

test("finite access window is a fallback", () => {
  const result = core.getDeadlineInfo("", [{ endIso: "2026-09-20T11:00:00.000Z" }], new Date(now));
  assert.equal(result.deadlineSource, "access_window_end");
  assert.equal(result.deadlineAt, "2026-09-20T11:00:00.000Z");
});

test("upcoming uses seven days and keeps valid pins", () => {
  const items = [
    { courseInstanceId: "1", courseLabel: "CPSC 313", title: "P2", deadlineAt: "2026-09-14T11:00:00Z", deadlineSource: "visible_until", status: "not_started", score: "Not started", href: "/pl/a/2" },
    { courseInstanceId: "1", courseLabel: "CPSC 313", title: "P8", deadlineAt: "2026-10-01T11:00:00Z", deadlineSource: "visible_until", status: "not_started", score: "Not started", href: "/pl/a/8", isPinned: true },
    { courseInstanceId: "1", courseLabel: "CPSC 313", title: "Available", availabilityText: "Available 08:00, Thu, Sep 17", status: "not_started", href: "/pl/a/9" },
    { courseInstanceId: "1", courseLabel: "CPSC 313", title: "Done", deadlineAt: "2026-09-12T11:00:00Z", deadlineSource: "visible_until", status: "scored", score: "100%", href: "/pl/a/10" },
  ];
  assert.deepEqual(core.selectUpcoming(items, now).map((item) => item.title), ["P2", "P8"]);
  assert.equal(core.selectCalendarItems(items, now).length, 3);
});

test("calendar event and ICS preserve the direct link", async () => {
  const item = { courseInstanceId: "1", courseLabel: "CPSC 313", badge: "P2", title: "ALU & Control", deadlineAt: "2026-09-14T11:00:00Z", deadlineSource: "visible_until", href: "https://us.prairielearn.com/pl/course_instance/1/assessment/2/", status: "not_started" };
  const event = await core.buildCalendarEvent(item, "https://us.prairielearn.com");
  assert.match(event.id, /^plv1[0-9a-f]{64}$/);
  assert.equal(event.source.url, item.href);
  assert.match(event.description, /assessment\/2/);
  const ics = await core.buildIcs([item], "https://us.prairielearn.com", now);
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /URL:https:\/\/us\.prairielearn\.com\/pl\/course_instance\/1\/assessment\/2\//);
});

test("calendar identity and ICS escaping are stable", async () => {
  const item = { courseInstanceId: "1", courseLabel: "CPSC 313", badge: "P2", title: "Comma, semicolon; and newline\nwork", deadlineAt: "2026-09-14T11:00:00Z", deadlineSource: "visible_until", href: "https://us.prairielearn.com/pl/course_instance/1/assessment/2/" };
  const first = await core.stableEventId(item, "https://us.prairielearn.com");
  const second = await core.stableEventId({ ...item, title: "Renamed" }, "https://us.prairielearn.com");
  assert.equal(first, second);
  const ics = await core.buildIcs([item], "https://us.prairielearn.com", now);
  assert.match(ics, /SUMMARY:Due: CPSC 313 · P2 · Comma\\, semicolon\\; and newline\\nwork/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 1);
  assert.match(await core.buildIcs([], "https://us.prairielearn.com", now), /END:VCALENDAR/);
});
