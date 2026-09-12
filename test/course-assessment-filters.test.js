const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("shared/tracker-core.js", "utf8");
const context = { TextEncoder, crypto: require("node:crypto").webcrypto, URL, Date, URLSearchParams };
vm.runInNewContext(source, context);
const core = context.PrairieLearnTrackerCore;

const now = new Date("2026-09-10T12:00:00Z").getTime();

test("isAssessment100PercentCompleted detects complete scores and bonus credit", () => {
  assert.equal(core.isAssessment100PercentCompleted("100%"), true);
  assert.equal(core.isAssessment100PercentCompleted("100.0%"), true);
  assert.equal(core.isAssessment100PercentCompleted("105%"), true); // bonus credit
  assert.equal(core.isAssessment100PercentCompleted("99.9%"), false);
  assert.equal(core.isAssessment100PercentCompleted("0%"), false);
  assert.equal(core.isAssessment100PercentCompleted("Not started"), false);
  assert.equal(core.isAssessment100PercentCompleted(null), false);
  assert.equal(core.isAssessment100PercentCompleted(undefined), false);
});

test("matchesAssessmentSearch performs case-insensitive text matching across titles, badges, and groups", () => {
  const item = {
    title: "Graph Traversal BFS & DFS",
    badge: "HW 4",
    group: "Homework Assignments",
    searchableText: "HW 4 Graph Traversal BFS & DFS 100% until Sep 15",
  };

  assert.equal(core.matchesAssessmentSearch(item, ""), true);
  assert.equal(core.matchesAssessmentSearch(item, "   "), true);
  assert.equal(core.matchesAssessmentSearch(item, "graph"), true);
  assert.equal(core.matchesAssessmentSearch(item, "HW 4"), true);
  assert.equal(core.matchesAssessmentSearch(item, "hw 4"), true);
  assert.equal(core.matchesAssessmentSearch(item, "assignments"), true);
  assert.equal(core.matchesAssessmentSearch(item, "binary tree"), false);
});

test("isAssessmentActiveOrDueSoon accurately classifies active and upcoming assessments", () => {
  // 1. Open with verified deadline within 7 days -> active/due soon
  const dueIn3Days = {
    deadlineAt: "2026-09-13T12:00:00Z",
    deadlineSource: "visible_until",
    status: "open",
  };
  assert.equal(core.isAssessmentActiveOrDueSoon(dueIn3Days, now), true);

  // 2. Open with verified deadline beyond 7 days (e.g. 15 days) -> not due soon
  const dueIn15Days = {
    deadlineAt: "2026-09-25T12:00:00Z",
    deadlineSource: "visible_until",
    status: "open",
  };
  assert.equal(core.isAssessmentActiveOrDueSoon(dueIn15Days, now), false);

  // 3. Past deadline -> not active/due soon
  const pastDue = {
    deadlineAt: "2026-09-08T12:00:00Z",
    deadlineSource: "visible_until",
    status: "open",
  };
  assert.equal(core.isAssessmentActiveOrDueSoon(pastDue, now), false);

  // 4. Closed assessment -> not active
  const closed = {
    deadlineAt: "2026-09-13T12:00:00Z",
    deadlineSource: "visible_until",
    status: "closed",
  };
  assert.equal(core.isAssessmentActiveOrDueSoon(closed, now), false);

  // 5. Unpublished / Available in future only -> not active
  const futureAvailable = {
    availabilityText: "Available 08:00, Thu, Sep 17",
    status: "open",
  };
  assert.equal(core.isAssessmentActiveOrDueSoon(futureAvailable, now), false);

  // 6. Unknown / indeterminate row -> fails open (returns true)
  assert.equal(core.isAssessmentActiveOrDueSoon({}, now), true);
  assert.equal(core.isAssessmentActiveOrDueSoon(null, now), true);
});

test("filterAssessmentItem composes search, completion, and due soon predicates", () => {
  const items = [
    {
      id: "1",
      badge: "HW 1",
      title: "C Pointers",
      score: "100%",
      deadlineAt: "2026-09-12T12:00:00Z",
      deadlineSource: "visible_until",
      status: "open",
    },
    {
      id: "2",
      badge: "HW 2",
      title: "Assembly Basics",
      score: "45%",
      deadlineAt: "2026-09-14T12:00:00Z",
      deadlineSource: "visible_until",
      status: "open",
    },
    {
      id: "3",
      badge: "HW 3",
      title: "Virtual Memory",
      score: "0%",
      deadlineAt: "2026-09-28T12:00:00Z", // beyond 7 days
      deadlineSource: "visible_until",
      status: "open",
    },
    {
      id: "4",
      badge: "Lab 1",
      title: "GDB Debugging",
      score: "100%",
      deadlineAt: "2026-09-11T12:00:00Z",
      deadlineSource: "visible_until",
      status: "open",
    },
  ];

  // No filters -> all 4 visible
  assert.equal(items.filter((it) => core.filterAssessmentItem(it, {}, { now })).length, 4);

  // Hide 100% completed -> HW 2, HW 3 (2 visible)
  const incomplete = items.filter((it) => core.filterAssessmentItem(it, { hideCompleted: true }, { now }));
  assert.deepEqual(incomplete.map((it) => it.badge), ["HW 2", "HW 3"]);

  // Only active / due soon -> HW 1, HW 2, Lab 1 (3 visible)
  const dueSoon = items.filter((it) => core.filterAssessmentItem(it, { onlyActiveDueSoon: true }, { now }));
  assert.deepEqual(dueSoon.map((it) => it.badge), ["HW 1", "HW 2", "Lab 1"]);

  // Composed: Hide 100% completed AND Only active / due soon -> HW 2 (1 visible)
  const composedBoth = items.filter((it) =>
    core.filterAssessmentItem(it, { hideCompleted: true, onlyActiveDueSoon: true }, { now })
  );
  assert.deepEqual(composedBoth.map((it) => it.badge), ["HW 2"]);

  // Composed: Search "HW" AND Hide 100% completed -> HW 2, HW 3
  const searchAndIncomplete = items.filter((it) =>
    core.filterAssessmentItem(it, { query: "HW", hideCompleted: true }, { now })
  );
  assert.deepEqual(searchAndIncomplete.map((it) => it.badge), ["HW 2", "HW 3"]);

  // Composed: Search "Lab" AND Hide 100% completed -> 0 visible (Lab 1 is 100%)
  const searchLabIncomplete = items.filter((it) =>
    core.filterAssessmentItem(it, { query: "Lab", hideCompleted: true }, { now })
  );
  assert.equal(searchLabIncomplete.length, 0);

  // Unknown row fails open
  const unknownRow = { isUnknown: true, searchableText: "Custom announcement row" };
  assert.equal(
    core.filterAssessmentItem(unknownRow, { query: "Custom", hideCompleted: true, onlyActiveDueSoon: true }, { now }),
    true
  );
});

test("computeFilteredAssessmentGroups handles group visibility and result counts", () => {
  const groups = [
    {
      heading: "Homeworks",
      items: [
        { data: { badge: "HW 1", title: "Intro", score: "100%", deadlineAt: "2026-09-12T12:00:00Z", deadlineSource: "visible_until" } },
        { data: { badge: "HW 2", title: "Pointers", score: "50%", deadlineAt: "2026-09-14T12:00:00Z", deadlineSource: "visible_until" } },
      ],
    },
    {
      heading: "Labs",
      items: [
        { data: { badge: "Lab 1", title: "Terminal", score: "100%", deadlineAt: "2026-09-11T12:00:00Z", deadlineSource: "visible_until" } },
      ],
    },
  ];

  // When Hide 100% Completed is enabled:
  // Homeworks has 1 matching item (HW 2) -> Homeworks group is visible
  // Labs has 0 matching items -> Labs group is hidden!
  const result = core.computeFilteredAssessmentGroups(groups, { hideCompleted: true }, { now });
  assert.equal(result.totalItemCount, 3);
  assert.equal(result.visibleItemCount, 1);
  assert.equal(result.groups[0].isVisible, true);
  assert.equal(result.groups[0].items[0].isVisible, false);
  assert.equal(result.groups[0].items[1].isVisible, true);
  assert.equal(result.groups[1].isVisible, false);
  assert.equal(result.groups[1].items[0].isVisible, false);

  // When filters reset:
  const resetResult = core.computeFilteredAssessmentGroups(groups, {}, { now });
  assert.equal(resetResult.totalItemCount, 3);
  assert.equal(resetResult.visibleItemCount, 3);
  assert.equal(resetResult.groups[0].isVisible, true);
  assert.equal(resetResult.groups[1].isVisible, true);
});
