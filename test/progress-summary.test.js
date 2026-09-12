const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { JSDOM } = require("jsdom");

function loadProgressSummary() {
  const source = fs.readFileSync("shared/progress-summary.js", "utf8");
  const ctx = { Date, Number, Math, Array, Object, String, RegExp, console };
  ctx.globalThis = ctx;
  ctx.self = ctx;
  vm.runInNewContext(source, ctx);
  return ctx.PrairieLearnProgressSummary;
}

function loadParsing() {
  const dom = new JSDOM("<!doctype html><body>");
  const ctx = { DOMParser: dom.window.DOMParser, Date, JSON, Number, URL, console };
  ctx.globalThis = ctx;
  ctx.self = ctx;
  vm.runInNewContext(fs.readFileSync("Chrome/parsing.js", "utf8"), ctx);
  return ctx.PrairieLearnTrackerParsing;
}

const summary = loadProgressSummary();
const now = new Date("2026-09-10T12:00:00Z").getTime();

const F = (name) => `test/fixtures/${name}`;
const has = (name) => fs.existsSync(F(name));
const read = (name) => fs.readFileSync(F(name), "utf8");
const ORIGIN = "https://us.prairielearn.com";
const ctxFor = (id) => ({
  origin: ORIGIN,
  assessmentsUrl: `${ORIGIN}/pl/course_instance/${id}/assessments`,
  courseInstanceId: String(id),
});
const parseCourse = (parsing, file, id) => parsing.parseAssessmentsHtml(read(file), ctxFor(id)).assessments;

test("progress summary exports expected interface, enums, and helpers", () => {
  assert.equal(typeof summary.parsePoints, "function");
  assert.equal(typeof summary.isClosedRow, "function");
  assert.equal(typeof summary.isUnavailableRow, "function");
  assert.equal(typeof summary.classifyRow, "function");
  assert.equal(typeof summary.aggregateProgress, "function");

  assert.equal(summary.PROVENANCE.PARSED_POINTS, "parsed_points");
  assert.equal(summary.PROVENANCE.PERCENTAGE_ONLY, "percentage_only");
  assert.equal(summary.PROVENANCE.UNAVAILABLE, "unavailable");
  assert.equal(summary.PROVENANCE.CLOSED, "closed");

  assert.equal(summary.EXCLUSION_REASONS.CLOSED, "CLOSED");
  assert.equal(summary.EXCLUSION_REASONS.UNAVAILABLE, "UNAVAILABLE");
  assert.equal(summary.EXCLUSION_REASONS.PERCENTAGE_ONLY, "PERCENTAGE_ONLY");
  assert.equal(summary.EXCLUSION_REASONS.NOT_STARTED_NO_POINTS, "NOT_STARTED_NO_POINTS");
});

// 4.1 Parser tests
test("4.1 parsePoints parses point-bearing strings across standard formats", () => {
  const cases = [
    { input: "7/10", earned: 7, possible: 10, bonus: 0, pct: 70 },
    { input: "7 / 10", earned: 7, possible: 10, bonus: 0, pct: 70 },
    { input: "12 / 15", earned: 12, possible: 15, bonus: 0, pct: 80 },
    { input: "12.5 / 15", earned: 12.5, possible: 15, bonus: 0, pct: 83.33 },
    { input: "7 out of 10", earned: 7, possible: 10, bonus: 0, pct: 70 },
    { input: "7 of 10 points", earned: 7, possible: 10, bonus: 0, pct: 70 },
    { input: "7 / 10 pts", earned: 7, possible: 10, bonus: 0, pct: 70 },
    { input: "Score: 8.5 / 10", earned: 8.5, possible: 10, bonus: 0, pct: 85 },
    { input: "7/10 (70%)", earned: 7, possible: 10, bonus: 0, pct: 70 },
    { input: "70% (7/10)", earned: 7, possible: 10, bonus: 0, pct: 70 },
  ];

  for (const c of cases) {
    const res = summary.parsePoints(c.input);
    assert.equal(res.isParsed, true, `failed to parse ${c.input}`);
    assert.equal(res.pointsEarned, c.earned, `earned mismatch for ${c.input}`);
    assert.equal(res.pointsPossible, c.possible, `possible mismatch for ${c.input}`);
    assert.equal(res.bonusPoints, c.bonus, `bonus mismatch for ${c.input}`);
    assert.equal(res.scorePercent, c.pct, `percent mismatch for ${c.input}`);
    assert.equal(res.isPercentageOnly, false);
  }
});

test("4.1 parsePoints extracts points from structured item objects", () => {
  const item1 = { pointsEarned: 14, pointsPossible: 20 };
  const res1 = summary.parsePoints(item1);
  assert.equal(res1.isParsed, true);
  assert.equal(res1.pointsEarned, 14);
  assert.equal(res1.pointsPossible, 20);
  assert.equal(res1.scorePercent, 70);

  const item2 = { earnedPoints: "9.5", possiblePoints: "10" };
  const res2 = summary.parsePoints(item2);
  assert.equal(res2.isParsed, true);
  assert.equal(res2.pointsEarned, 9.5);
  assert.equal(res2.pointsPossible, 10);
  assert.equal(res2.scorePercent, 95);

  const item3 = { scoreText: "18 / 20" };
  const res3 = summary.parsePoints(item3);
  assert.equal(res3.isParsed, true);
  assert.equal(res3.pointsEarned, 18);
  assert.equal(res3.pointsPossible, 20);
});

test("4.1 parsePoints identifies percentages that cannot be converted to points", () => {
  const percentCases = ["100%", "45%", "0%", "100.0%", "99.9%", " 85% "];

  for (const input of percentCases) {
    const res = summary.parsePoints(input);
    assert.equal(res.isParsed, false, `percentage should not be parsed as point pair: ${input}`);
    assert.equal(res.isPercentageOnly, true, `should be marked percentage only: ${input}`);
    assert.equal(res.pointsEarned, null);
    assert.equal(res.pointsPossible, null);
    assert.ok(typeof res.scorePercent === "number");
  }

  // Not started has no points and no percentage
  const notStarted = summary.parsePoints("Not started");
  assert.equal(notStarted.isParsed, false);
  assert.equal(notStarted.isPercentageOnly, false);
  assert.equal(notStarted.isNotStarted, true);
  assert.equal(notStarted.pointsEarned, null);
  assert.equal(notStarted.pointsPossible, null);
});

test("4.1 bonus values above ordinary maximum are preserved and never clamped", () => {
  const bonusCases = [
    { input: "11 / 10", earned: 11, possible: 10, bonus: 1, pct: 110 },
    { input: "12 / 10", earned: 12, possible: 10, bonus: 2, pct: 120 },
    { input: "12.5 / 10", earned: 12.5, possible: 10, bonus: 2.5, pct: 125 },
    { input: "15 / 10", earned: 15, possible: 10, bonus: 5, pct: 150 },
    { input: { pointsEarned: 22, pointsPossible: 20 }, earned: 22, possible: 20, bonus: 2, pct: 110 },
  ];

  for (const c of bonusCases) {
    const res = summary.parsePoints(c.input);
    assert.equal(res.isParsed, true);
    assert.equal(res.pointsEarned, c.earned);
    assert.equal(res.pointsPossible, c.possible);
    assert.equal(res.bonusPoints, c.bonus);
    assert.equal(res.scorePercent, c.pct);
    assert.ok(res.pointsEarned > res.pointsPossible);
  }
});

test("4.1 isClosedRow accurately identifies closed assessments", () => {
  assert.equal(summary.isClosedRow({ status: "closed" }), true);
  assert.equal(summary.isClosedRow({ availabilityText: "Assessment closed" }), true);
  assert.equal(summary.isClosedRow({ scoreText: "Assessment closed" }), true);
  assert.equal(summary.isClosedRow({ isClosed: true }), true);

  // When now is injected and deadline is in the past
  const pastItem = { deadlineAt: "2026-09-08T12:00:00Z", deadlineSource: "visible_until" };
  assert.equal(summary.isClosedRow(pastItem, now), true);

  // Future deadline is not closed
  const futureItem = { deadlineAt: "2026-09-14T12:00:00Z", deadlineSource: "visible_until" };
  assert.equal(summary.isClosedRow(futureItem, now), false);

  // No deadline and open status is not closed
  assert.equal(summary.isClosedRow({ status: "scored" }, now), false);
});

test("4.1 isUnavailableRow accurately identifies unavailable assessments", () => {
  assert.equal(summary.isUnavailableRow({ status: "unavailable" }), true);
  assert.equal(summary.isUnavailableRow({ availabilityText: "Not yet available" }), true);
  assert.equal(summary.isUnavailableRow({ availabilityText: "Available 08:00, Thu, Sep 17" }), true);
  assert.equal(summary.isUnavailableRow({ isUnavailable: true }), true);

  // Future access window
  const futureWindow = {
    accessWindows: [{ startIso: "2026-09-20T12:00:00Z" }],
  };
  assert.equal(summary.isUnavailableRow(futureWindow, now), true);

  // Normal open item is not unavailable
  assert.equal(summary.isUnavailableRow({ availabilityText: "100% until 23:59, Fri, Sep 11" }), false);
});

test("4.1 classifyRow assigns machine-readable exclusion reasons per excluded row", () => {
  // 1. Closed row
  const closedRow = summary.classifyRow({ title: "HW 1", status: "closed", scoreText: "10/10" });
  assert.equal(closedRow.lifecycle, "closed");
  assert.equal(closedRow.provenance, "closed");
  assert.equal(closedRow.isIncluded, false);
  assert.equal(closedRow.exclusionReason, "CLOSED");

  // 2. Unavailable row
  const unavailRow = summary.classifyRow({ title: "HW 2", availabilityText: "Available 08:00, Thu, Sep 17" });
  assert.equal(unavailRow.lifecycle, "unavailable");
  assert.equal(unavailRow.provenance, "unavailable");
  assert.equal(unavailRow.isIncluded, false);
  assert.equal(unavailRow.exclusionReason, "UNAVAILABLE");

  // 3. Active row with percentage only (cannot be converted)
  const pctRow = summary.classifyRow({ title: "HW 3", scoreText: "100%" });
  assert.equal(pctRow.lifecycle, "active");
  assert.equal(pctRow.provenance, "percentage_only");
  assert.equal(pctRow.isIncluded, false);
  assert.equal(pctRow.exclusionReason, "PERCENTAGE_ONLY");

  // 4. Active row with Not started (no points exposed)
  const notStartedRow = summary.classifyRow({ title: "HW 4", scoreText: "Not started" });
  assert.equal(notStartedRow.lifecycle, "active");
  assert.equal(notStartedRow.isIncluded, false);
  assert.equal(notStartedRow.exclusionReason, "NOT_STARTED_NO_POINTS");

  // 5. Active row with parseable points is included without exclusion reason
  const activeParsedRow = summary.classifyRow({ title: "HW 5", scoreText: "7 / 10" });
  assert.equal(activeParsedRow.lifecycle, "active");
  assert.equal(activeParsedRow.provenance, "parsed_points");
  assert.equal(activeParsedRow.isIncluded, true);
  assert.equal(activeParsedRow.exclusionReason, null);
  assert.equal(activeParsedRow.pointsEarned, 7);
  assert.equal(activeParsedRow.pointsPossible, 10);
});

// 4.2 Aggregation tests
test("4.2 aggregation shows exact secured total, available total, and percentage when all visible active rows have points", () => {
  const items = [
    { id: "a1", title: "HW 1", scoreText: "7 / 10" },
    { id: "a2", title: "HW 2", scoreText: "12 / 15" },
    { id: "a3", title: "HW 3", scoreText: "8 / 10" },
  ];

  const res = summary.aggregateProgress(items);
  assert.equal(res.securedPoints, 27); // 7 + 12 + 8
  assert.equal(res.availablePoints, 35); // 10 + 15 + 10
  assert.equal(res.percentage, 77.14); // 27 / 35 * 100
  assert.equal(res.bonusPoints, 0);
  assert.equal(res.hasPoints, true);
  assert.equal(res.isComplete, true);
  assert.equal(res.isIncomplete, false);
  assert.equal(res.counts.total, 3);
  assert.equal(res.counts.included, 3);
  assert.equal(res.counts.excluded, 0);
  assert.equal(res.counts.byProvenance.parsed_points, 3);
  assert.equal(res.provenance.securedPoints.source, "parsed_points");
  assert.equal(res.provenance.availablePoints.source, "parsed_points");
});

test("4.2 aggregation preserves bonus above 100% and explains bonus contribution", () => {
  const items = [
    { id: "b1", title: "HW 1 with Bonus", scoreText: "12 / 10" }, // 2 bonus points
    { id: "b2", title: "HW 2 Regular", scoreText: "10 / 10" },
  ];

  const res = summary.aggregateProgress(items);
  assert.equal(res.securedPoints, 22); // 12 + 10 (never clamped to 20!)
  assert.equal(res.availablePoints, 20); // 10 + 10
  assert.equal(res.percentage, 110); // 22 / 20 * 100
  assert.equal(res.bonusPoints, 2);
  assert.ok(res.bonusExplanation && res.bonusExplanation.includes("2 bonus points"));
  assert.equal(res.isComplete, true);
});

test("4.2 aggregation excludes closed and unavailable rows from active available points with provenance", () => {
  const items = [
    { id: "1", title: "Active with Points", scoreText: "7 / 10", status: "open" },
    { id: "2", title: "Active Bonus", scoreText: "11 / 10", status: "open" },
    { id: "3", title: "Active Percentage Only", scoreText: "100%", status: "open" },
    { id: "4", title: "Active Not Started", scoreText: "Not started", status: "open" },
    { id: "5", title: "Unavailable HW", availabilityText: "Available 08:00, Thu, Sep 17" },
    { id: "6", title: "Closed HW", status: "closed", scoreText: "10 / 10" },
  ];

  const res = summary.aggregateProgress(items);

  // Active available points sums ONLY included active rows: 10 + 10 = 20
  assert.equal(res.availablePoints, 20);
  // Active secured points sums ONLY included active rows: 7 + 11 = 18
  assert.equal(res.securedPoints, 18);
  assert.equal(res.percentage, 90);
  assert.equal(res.bonusPoints, 1);

  // Closed row has parseable points recorded in closedSecuredPoints
  assert.equal(res.closedSecuredPoints, 10);
  assert.equal(res.totalSecuredPoints, 28); // 18 active + 10 closed

  // Incomplete metadata
  assert.equal(res.isIncomplete, true);
  assert.equal(res.isComplete, false);
  assert.equal(res.counts.total, 6);
  assert.equal(res.counts.included, 2);
  assert.equal(res.counts.excluded, 4);

  // Provenance breakdown
  assert.equal(res.counts.byProvenance.parsed_points, 2);
  assert.equal(res.counts.byProvenance.percentage_only, 1);
  assert.equal(res.counts.byProvenance.not_started, 1);
  assert.equal(res.counts.byProvenance.unavailable, 1);
  assert.equal(res.counts.byProvenance.closed, 1);

  // Exclusion reasons breakdown
  assert.equal(res.counts.byExclusionReason.PERCENTAGE_ONLY, 1);
  assert.equal(res.counts.byExclusionReason.NOT_STARTED_NO_POINTS, 1);
  assert.equal(res.counts.byExclusionReason.UNAVAILABLE, 1);
  assert.equal(res.counts.byExclusionReason.CLOSED, 1);
});

test("4.2 aggregation handles empty items list cleanly", () => {
  const res = summary.aggregateProgress([]);
  assert.equal(res.securedPoints, 0);
  assert.equal(res.availablePoints, 0);
  assert.equal(res.percentage, null);
  assert.equal(res.bonusPoints, 0);
  assert.equal(res.hasPoints, false);
  assert.equal(res.counts.total, 0);
  assert.equal(res.counts.included, 0);
  assert.equal(res.counts.excluded, 0);
});

// REAL FIXTURES TESTS
test("real course-313.html fixture: aggregation handles 'no row yields points' as a first-class outcome", { skip: !has("course-313.html") }, () => {
  const parsing = loadParsing();
  const items = parseCourse(parsing, "course-313.html", 225673);
  assert.equal(items.length, 100);

  const res = summary.aggregateProgress(items, now);

  // Critical ground truth: No row yields points on this real page!
  // It must be reported as a first-class outcome: NOT an error, NOT an invented denominator.
  assert.equal(res.hasPoints, false);
  assert.equal(res.hasParseablePoints, false);
  assert.equal(res.securedPoints, 0);
  assert.equal(res.availablePoints, 0);
  assert.equal(res.percentage, null);
  assert.equal(res.bonusPoints, 0);
  assert.equal(res.isIncomplete, true);
  assert.equal(res.isComplete, false);

  assert.equal(res.counts.total, 100);
  assert.equal(res.counts.included, 0);
  assert.equal(res.counts.excluded, 100);

  // Machine-readable reasons accounted for all 100 rows
  const reasons = res.counts.byExclusionReason;
  const reasonSum = (reasons.UNAVAILABLE || 0) + (reasons.PERCENTAGE_ONLY || 0) + (reasons.NOT_STARTED_NO_POINTS || 0) + (reasons.CLOSED || 0);
  assert.equal(reasonSum, 100, `all 100 rows must have machine-readable exclusion reasons, got ${reasonSum}`);

  assert.ok((reasons.UNAVAILABLE || 0) > 80, "most rows are future/unpublished available");
  assert.ok((reasons.PERCENTAGE_ONLY || 0) > 0, "active rows with percentages (0%, 45%, 100%)");
  assert.ok((reasons.NOT_STARTED_NO_POINTS || 0) > 0, "active rows with Not started");
});

test("real course-317.html fixture: aggregation reports no points and full incomplete metadata", { skip: !has("course-317.html") }, () => {
  const parsing = loadParsing();
  const items = parseCourse(parsing, "course-317.html", 225674);
  assert.equal(items.length, 58);

  const res = summary.aggregateProgress(items, now);

  assert.equal(res.hasPoints, false);
  assert.equal(res.securedPoints, 0);
  assert.equal(res.availablePoints, 0);
  assert.equal(res.percentage, null);
  assert.equal(res.isIncomplete, true);
  assert.equal(res.counts.total, 58);
  assert.equal(res.counts.included, 0);
  assert.equal(res.counts.excluded, 58);

  const reasons = res.counts.byExclusionReason;
  const reasonSum = (reasons.UNAVAILABLE || 0) + (reasons.PERCENTAGE_ONLY || 0) + (reasons.NOT_STARTED_NO_POINTS || 0) + (reasons.CLOSED || 0);
  assert.equal(reasonSum, 58);
});

// TASK 4.3: Mean percentage aggregation and card rendering
function loadHomeContentRuntime() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  const ctx = {
    window: dom.window,
    document: dom.window.document,
    chrome: {
      runtime: { onMessage: { addListener: () => {} }, sendMessage: () => {} },
      storage: { local: { get: () => {}, set: () => {} } },
    },
    PrairieLearnProgressSummary: summary,
    console,
    Date,
    Number,
    Math,
    Array,
    Object,
    String,
    RegExp,
    URL,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    MutationObserver: dom.window.MutationObserver,
  };
  ctx.globalThis = ctx;
  dom.window.globalThis = ctx;
  dom.window.PrairieLearnProgressSummary = summary;
  dom.window.chrome = ctx.chrome;
  vm.runInNewContext(fs.readFileSync("Chrome/home-content.js", "utf8"), ctx);
  return {
    dom,
    runtime: ctx.window.__PL_PRODUCTION_RUNTIME__,
  };
}

test("4.3 mean-percentage aggregation: computes unweighted mean of active visible percentages when no rows yield points", () => {
  const items = [
    { id: "1", scoreText: "100%", status: "open" },
    { id: "2", scoreText: "50%", status: "open" },
    { id: "3", scoreText: "0%", status: "open" },
  ];

  const res = summary.aggregateProgress(items);
  assert.equal(res.hasPoints, false);
  assert.equal(res.hasMeanPercentage, true);
  assert.equal(res.meanPercentage, 50); // (100 + 50 + 0) / 3 = 50
  assert.equal(res.headlineKind, "mean_percentage");
  assert.equal(res.headline, "50%");
  assert.equal(res.counts.meanIncludedRows, 3);
  assert.equal(res.counts.meanExcludedRows, 0);
  assert.equal(res.counts.unattemptedRows, 0);
  assert.equal(res.provenance.meanPercentage.value, 50);
  assert.equal(res.provenance.meanPercentage.source, "unweighted_mean_of_percentages");
  assert.equal(res.provenance.meanPercentage.includedRowCount, 3);
});

test("4.3 mean-percentage aggregation: untouched 'Not started' rows are excluded from the mean and counted separately", () => {
  const items = [
    { id: "1", scoreText: "100%", status: "open" },
    { id: "2", scoreText: "Not started", status: "open" },
    { id: "3", scoreText: "80%", status: "open" },
  ];

  const res = summary.aggregateProgress(items);
  assert.equal(res.hasPoints, false);
  // (100 + 80) / 2 = 90. Untouched row must NOT drag mean down!
  assert.equal(res.meanPercentage, 90);
  assert.equal(res.counts.meanIncludedRows, 2);
  assert.equal(res.counts.unattemptedRows, 1);
  assert.equal(res.counts.meanExcludedRows, 1);
});

test("4.3 mean-percentage aggregation: closed and unavailable rows stay excluded", () => {
  const items = [
    { id: "1", scoreText: "100%", status: "open" },
    { id: "2", scoreText: "40%", status: "closed" },
    { id: "3", scoreText: "50%", availabilityText: "Available 08:00, Thu, Sep 17" },
  ];

  const res = summary.aggregateProgress(items, now);
  assert.equal(res.hasPoints, false);
  assert.equal(res.meanPercentage, 100);
  assert.equal(res.counts.meanIncludedRows, 1);
  assert.equal(res.counts.meanExcludedRows, 2);
});

test("4.3 points precedence: convertible points remain headline when available and mean is secondary", () => {
  const items = [
    { id: "1", scoreText: "7 / 10", status: "open" },
    { id: "2", scoreText: "80%", status: "open" },
  ];

  const res = summary.aggregateProgress(items);
  assert.equal(res.hasPoints, true);
  assert.equal(res.securedPoints, 7);
  assert.equal(res.availablePoints, 10);
  assert.equal(res.percentage, 70);
  assert.equal(res.headlineKind, "points");
  assert.equal(res.headline, "7 / 10 pts (70%)");
  // Mean is secondary: (70 + 80) / 2 = 75
  assert.equal(res.meanPercentage, 75);
  assert.equal(res.provenance.securedPoints.source, "parsed_points");
  assert.equal(res.provenance.meanPercentage.source, "unweighted_mean_of_percentages");
});

test("4.3 unmeasurable progress: explicit reporting when no row yields points or percentages, never showing 0", () => {
  const items = [
    { id: "1", scoreText: "Not started", status: "open" },
    { id: "2", availabilityText: "Not yet available" },
    { id: "3", status: "unavailable" },
  ];

  const res = summary.aggregateProgress(items, now);
  assert.equal(res.hasPoints, false);
  assert.equal(res.percentage, null);
  assert.equal(res.meanPercentage, null); // NEVER 0 when nothing is measurable!
  assert.equal(res.hasMeanPercentage, false);
  assert.equal(res.headlineKind, "none");
  assert.equal(res.headline, "No progress figure can be derived");
  assert.equal(res.provenance.meanPercentage.value, null);
  assert.equal(res.provenance.meanPercentage.source, "none");
  assert.equal(res.provenance.meanPercentage.includedRowCount, 0);
  assert.equal(res.counts.meanIncludedRows, 0);
  assert.equal(res.counts.meanExcludedRows, 3);
});

test("real course-313.html fixture: aggregation derives 24.17% unweighted mean of visible percentages", { skip: !has("course-313.html") }, () => {
  const parsing = loadParsing();
  const items = parseCourse(parsing, "course-313.html", 225673);
  const fixtureNow = new Date("2026-09-12T00:00:00Z").getTime();
  const res = summary.aggregateProgress(items, fixtureNow);

  assert.equal(res.hasPoints, false);
  assert.equal(res.hasMeanPercentage, true);
  // 6 visible rows: 0%, 0%, 0%, 100%, 0%, 45% -> sum=145 / 6 = 24.17
  assert.equal(res.meanPercentage, 24.17);
  assert.equal(res.headlineKind, "mean_percentage");
  assert.equal(res.headline, "24.17%");
  assert.equal(res.counts.meanIncludedRows, 6);
  assert.equal(res.counts.unattemptedRows, 3);
  assert.equal(res.counts.meanExcludedRows, 94);
  assert.equal(res.provenance.meanPercentage.source, "unweighted_mean_of_percentages");
  assert.equal(res.provenance.meanPercentage.value, 24.17);
  assert.equal(res.provenance.meanPercentage.includedRowCount, 6);
});

test("4.3 summary card rendering: renders points headline, counts, bonus, freshness, and disclaimer", () => {
  const { dom, runtime } = loadHomeContentRuntime();
  const card = dom.window.document.createElement("div");

  const summaryData = {
    hasPoints: true,
    securedPoints: 27,
    availablePoints: 35,
    percentage: 77.14,
    bonusPoints: 2,
    bonusExplanation: "Includes 2 bonus points above maximum.",
    meanPercentage: 76.67,
    counts: { includedRows: 3, excludedRows: 2, totalRows: 5 },
  };

  runtime.renderCourseProgressSummaryCard(summaryData, card, { freshnessLabel: "Computed just now" });

  const headline = card.querySelector("#pl-progress-headline");
  assert.ok(headline, "headline element exists");
  assert.ok(headline.textContent.includes("27 / 35 pts"));

  const counts = card.querySelector("#pl-progress-counts");
  assert.ok(counts, "counts element exists");
  assert.ok(counts.textContent.includes("3 assessments included"));
  assert.ok(counts.textContent.includes("2 excluded"));

  const bonus = card.querySelector("#pl-progress-bonus");
  assert.ok(bonus, "bonus element exists");
  assert.ok(bonus.textContent.includes("Includes 2 bonus points above maximum"));

  const freshness = card.querySelector("#pl-progress-freshness");
  assert.ok(freshness, "freshness element exists");
  assert.equal(freshness.textContent, "Computed just now");

  const disclaimer = card.querySelector("#pl-progress-disclaimer");
  assert.ok(disclaimer, "disclaimer exists");
  assert.ok(disclaimer.textContent.includes("Not an official course grade"));
});

test("4.3 summary card rendering: renders unweighted mean headline, counts with unattempted, and mean disclaimer for course-313", { skip: !has("course-313.html") }, () => {
  const parsing = loadParsing();
  const items = parseCourse(parsing, "course-313.html", 225673);
  const fixtureNow = new Date("2026-09-12T00:00:00Z").getTime();

  const { dom, runtime } = loadHomeContentRuntime();
  const card = dom.window.document.createElement("div");

  runtime.renderCourseProgressSummaryCard(items, card, { now: fixtureNow, freshnessLabel: "Computed just now" });

  const headline = card.querySelector("#pl-progress-headline");
  assert.ok(headline);
  assert.equal(headline.textContent.trim(), "24.17%");

  const badge = card.querySelector("#pl-progress-mean-badge");
  assert.ok(badge);
  assert.equal(badge.textContent.trim(), "Unweighted mean");

  const counts = card.querySelector("#pl-progress-counts");
  assert.ok(counts);
  assert.ok(counts.textContent.includes("Averaged 6 visible assessments"));
  assert.ok(counts.textContent.includes("94 excluded"));
  assert.ok(counts.textContent.includes("3 unattempted"));

  const disclaimer = card.querySelector("#pl-progress-disclaimer");
  assert.ok(disclaimer);
  assert.ok(disclaimer.textContent.includes("Not an official course grade"));
  assert.ok(disclaimer.textContent.includes("unweighted mean of visible percentages"));

  const bonus = card.querySelector("#pl-progress-bonus");
  assert.equal(bonus, null, "no bonus for course-313");
});

test("4.3 summary card rendering: renders unmeasurable progress state when nothing is measurable", () => {
  const { dom, runtime } = loadHomeContentRuntime();
  const card = dom.window.document.createElement("div");

  const summaryData = {
    hasPoints: false,
    securedPoints: 0,
    availablePoints: 0,
    percentage: null,
    bonusPoints: 0,
    meanPercentage: null,
    counts: { totalRows: 5, excludedRows: 5, meanIncludedRows: 0, meanExcludedRows: 5 },
  };

  runtime.renderCourseProgressSummaryCard(summaryData, card, { freshnessLabel: "Computed just now" });

  const headline = card.querySelector("#pl-progress-headline");
  assert.ok(headline);
  assert.equal(headline.textContent.trim(), "No progress figure can be derived");

  const counts = card.querySelector("#pl-progress-counts");
  assert.ok(counts);
  assert.ok(counts.textContent.includes("All 5 assessments excluded"));

  const disclaimer = card.querySelector("#pl-progress-disclaimer");
  assert.ok(disclaimer);
  assert.ok(disclaimer.textContent.includes("Not an official course grade"));
});

