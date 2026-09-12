const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("shared/course-identity.js", "utf8");
const context = { URL, Date, Intl, Number, String, Array, Object, RegExp, parseInt, Math };
vm.runInNewContext(source, context);
const ci = context.PrairieLearnCourseIdentity;

// Injected reference date for testing: 2026-09-11 12:00:00 UTC
const REF_DATE = new Date("2026-09-11T12:00:00.000Z");

test("Task 1.2: extractCourseInstanceId extracts numeric course IDs from paths, URLs, and numbers", () => {
  assert.equal(ci.extractCourseInstanceId("/pl/course_instance/12345"), "12345");
  assert.equal(ci.extractCourseInstanceId("/pl/course_instance/12345/"), "12345");
  assert.equal(ci.extractCourseInstanceId("/pl/course_instance/12345/assessments"), "12345");
  assert.equal(ci.extractCourseInstanceId("https://us.prairielearn.com/pl/course_instance/98765/assessments/"), "98765");
  assert.equal(ci.extractCourseInstanceId("https://ca.prairielearn.com/pl/course_instance/42"), "42");
  assert.equal(ci.extractCourseInstanceId("12345"), "12345");
  assert.equal(ci.extractCourseInstanceId(54321), "54321");
  assert.equal(ci.extractCourseInstanceId("invalid"), null);
  assert.equal(ci.extractCourseInstanceId("/pl/other/123"), null);
  assert.equal(ci.extractCourseInstanceId(""), null);
  assert.equal(ci.extractCourseInstanceId(null), null);
});

test("Task 1.2: normalizeOrigin extracts canonical origin with protocol, lowercased, and without trailing slash", () => {
  assert.equal(ci.normalizeOrigin("https://us.prairielearn.com"), "https://us.prairielearn.com");
  assert.equal(ci.normalizeOrigin("https://us.prairielearn.com/"), "https://us.prairielearn.com");
  assert.equal(ci.normalizeOrigin("HTTPS://US.PRAIRIELEARN.COM/pl/course_instance/101"), "https://us.prairielearn.com");
  assert.equal(ci.normalizeOrigin("https://ca.prairielearn.com"), "https://ca.prairielearn.com");
  assert.equal(ci.normalizeOrigin("http://localhost:3000/pl/home"), "http://localhost:3000");
  assert.equal(ci.normalizeOrigin("us.prairielearn.com"), "https://us.prairielearn.com");
  assert.equal(ci.normalizeOrigin(""), null);
  assert.equal(ci.normalizeOrigin("javascript:alert(1)"), null);
  assert.equal(ci.normalizeOrigin(null), null);
});

test("Task 1.2: deriveCourseIdentity produces stable origin, ID, and key without display name", () => {
  const url = "https://us.prairielearn.com/pl/course_instance/101/assessments";
  const identity = ci.deriveCourseIdentity(url);
  assert.equal(identity.origin, "https://us.prairielearn.com");
  assert.equal(identity.courseInstanceId, "101");
  assert.equal(identity.key, "https://us.prairielearn.com|101");

  // Relative path with fallback origin
  const relIdentity = ci.deriveCourseIdentity("/pl/course_instance/202", "https://ca.prairielearn.com");
  assert.equal(relIdentity.origin, "https://ca.prairielearn.com");
  assert.equal(relIdentity.courseInstanceId, "202");
  assert.equal(relIdentity.key, "https://ca.prairielearn.com|202");

  // Object structure with PrairieLearn course_instance format
  const objIdentity = ci.deriveCourseIdentity({
    origin: "https://us.prairielearn.com",
    course_instance: { id: 303 },
    name: "CS 225: Data Structures",
  });
  assert.equal(objIdentity.origin, "https://us.prairielearn.com");
  assert.equal(objIdentity.courseInstanceId, "303");
  assert.equal(objIdentity.key, "https://us.prairielearn.com|303");
});

test("Task 1.2 ISOLATION: courses with the SAME display name stay strictly isolated", () => {
  // Two distinct course instances that share the exact same course name / display name
  const courseA = {
    origin: "https://us.prairielearn.com",
    courseInstanceId: "1001",
    displayName: "CPSC 313: Computer Systems",
    term: "Fall 2026",
  };
  const courseB = {
    origin: "https://us.prairielearn.com",
    courseInstanceId: "1002",
    displayName: "CPSC 313: Computer Systems",
    term: "Fall 2025",
  };

  const idA = ci.deriveCourseIdentity(courseA);
  const idB = ci.deriveCourseIdentity(courseB);

  // Identity keys must be distinct
  assert.notEqual(idA.key, idB.key);
  assert.equal(idA.key, "https://us.prairielearn.com|1001");
  assert.equal(idB.key, "https://us.prairielearn.com|1002");
  assert.equal(ci.areCourseIdentitiesEqual(courseA, courseB), false);

  // Simulate local visibility preferences map keyed by course identity
  const visibilityPreferences = new Map();
  visibilityPreferences.set(idA.key, { hidden: true });

  // Course A is hidden, but Course B with the exact same display name remains visible
  assert.equal(visibilityPreferences.get(idA.key)?.hidden, true);
  assert.equal(visibilityPreferences.get(idB.key)?.hidden, undefined);
});

test("Task 1.2 ISOLATION: the same courseInstanceId on DIFFERENT PrairieLearn origins stays strictly isolated", () => {
  const courseUS = {
    origin: "https://us.prairielearn.com",
    courseInstanceId: "5555",
    displayName: "MATH 100",
  };
  const courseCA = {
    origin: "https://ca.prairielearn.com",
    courseInstanceId: "5555",
    displayName: "MATH 100",
  };

  const idUS = ci.deriveCourseIdentity(courseUS);
  const idCA = ci.deriveCourseIdentity(courseCA);

  // Identity keys must be distinct across origins
  assert.notEqual(idUS.key, idCA.key);
  assert.equal(idUS.key, "https://us.prairielearn.com|5555");
  assert.equal(idCA.key, "https://ca.prairielearn.com|5555");
  assert.equal(ci.areCourseIdentitiesEqual(courseUS, courseCA), false);

  // Preferences for US instance must never bleed into CA instance
  const visibilityPreferences = new Map();
  visibilityPreferences.set(idUS.key, { hidden: true });

  assert.equal(visibilityPreferences.get(idUS.key)?.hidden, true);
  assert.equal(visibilityPreferences.get(idCA.key)?.hidden, undefined);
});

test("Task 1.3: strict term parser parses standard season and year labels into explicit boundaries", () => {
  const fall = ci.parseTerm("Fall 2026", { referenceDate: REF_DATE });
  assert.equal(fall.isConfident, true);
  assert.equal(fall.type, "term");
  assert.equal(fall.season, "Fall");
  assert.equal(fall.year, 2026);
  assert.equal(fall.termNumber, null);
  assert.equal(fall.startDate.toISOString(), "2026-08-01T00:00:00.000Z");
  assert.equal(fall.endDate.toISOString(), "2026-12-31T23:59:59.999Z");
  assert.equal(fall.classification, "Active");

  const spring = ci.parseTerm("Spring 2026", { referenceDate: REF_DATE });
  assert.equal(spring.isConfident, true);
  assert.equal(spring.season, "Spring");
  assert.equal(spring.year, 2026);
  assert.equal(spring.startDate.toISOString(), "2026-01-01T00:00:00.000Z");
  assert.equal(spring.endDate.toISOString(), "2026-05-31T23:59:59.999Z");
  assert.equal(spring.classification, "Past");

  const summer = ci.parseTerm("Summer 2026", { referenceDate: REF_DATE });
  assert.equal(summer.isConfident, true);
  assert.equal(summer.season, "Summer");
  assert.equal(summer.year, 2026);
  assert.equal(summer.startDate.toISOString(), "2026-05-01T00:00:00.000Z");
  assert.equal(summer.endDate.toISOString(), "2026-08-31T23:59:59.999Z");
  assert.equal(summer.classification, "Past");
});

test("Task 1.3: strict term parser parses session codes like 2026W1, 2026W2, and 2026S1", () => {
  // UBC Winter Term 1: Sept 1 to Dec 31
  const w1 = ci.parseTerm("2026W1", { referenceDate: REF_DATE });
  assert.equal(w1.isConfident, true);
  assert.equal(w1.season, "Winter");
  assert.equal(w1.termNumber, 1);
  assert.equal(w1.year, 2026);
  assert.equal(w1.startDate.toISOString(), "2026-09-01T00:00:00.000Z");
  assert.equal(w1.endDate.toISOString(), "2026-12-31T23:59:59.999Z");
  assert.equal(w1.classification, "Active");

  // UBC Winter Term 2: Jan 1 to Apr 30
  const w2 = ci.parseTerm("2026W2", { referenceDate: REF_DATE });
  assert.equal(w2.isConfident, true);
  assert.equal(w2.season, "Winter");
  assert.equal(w2.termNumber, 2);
  assert.equal(w2.year, 2026);
  assert.equal(w2.startDate.toISOString(), "2026-01-01T00:00:00.000Z");
  assert.equal(w2.endDate.toISOString(), "2026-04-30T23:59:59.999Z");
  assert.equal(w2.classification, "Past");

  // Summer Term 1: May 1 to June 30
  const s1 = ci.parseTerm("2026S1", { referenceDate: REF_DATE });
  assert.equal(s1.isConfident, true);
  assert.equal(s1.season, "Summer");
  assert.equal(s1.termNumber, 1);
  assert.equal(s1.year, 2026);
  assert.equal(s1.startDate.toISOString(), "2026-05-01T00:00:00.000Z");
  assert.equal(s1.endDate.toISOString(), "2026-06-30T23:59:59.999Z");
  assert.equal(s1.classification, "Past");
});

test("Task 1.3: strict term parser parses Winter Term 2 with explicit year, multi-year, or injected date", () => {
  // Explicit year in string
  const termWithYear = ci.parseTerm("Winter Term 2 2026", { referenceDate: REF_DATE });
  assert.equal(termWithYear.isConfident, true);
  assert.equal(termWithYear.season, "Winter");
  assert.equal(termWithYear.termNumber, 2);
  assert.equal(termWithYear.year, 2026);
  assert.equal(termWithYear.startDate.toISOString(), "2026-01-01T00:00:00.000Z");
  assert.equal(termWithYear.endDate.toISOString(), "2026-04-30T23:59:59.999Z");
  assert.equal(termWithYear.classification, "Past");

  // Multi-year span e.g. 2025/2026 Winter Term 2 (Term 2 is in 2026)
  const multiYear = ci.parseTerm("2025/2026 Winter Term 2", { referenceDate: REF_DATE });
  assert.equal(multiYear.isConfident, true);
  assert.equal(multiYear.year, 2026);
  assert.equal(multiYear.termNumber, 2);
  assert.equal(multiYear.classification, "Past");

  // Winter Term 2 with injected referenceDate deriving year 2026
  const termWithInjected = ci.parseTerm("Winter Term 2", { referenceDate: REF_DATE });
  assert.equal(termWithInjected.isConfident, true);
  assert.equal(termWithInjected.season, "Winter");
  assert.equal(termWithInjected.termNumber, 2);
  assert.equal(termWithInjected.year, 2026);
  assert.equal(termWithInjected.classification, "Past");

  // When active in February:
  const febDate = new Date("2026-02-15T12:00:00.000Z");
  const activeTerm = ci.parseTerm("Winter Term 2", { referenceDate: febDate });
  assert.equal(activeTerm.classification, "Active");
});

test("Task 1.3: strict term parser parses explicit ISO and human-readable date ranges", () => {
  // ISO range
  const isoRange = ci.parseTerm("2026-09-01 to 2026-12-31", { referenceDate: REF_DATE });
  assert.equal(isoRange.isConfident, true);
  assert.equal(isoRange.type, "date_range");
  assert.equal(isoRange.startDate.toISOString(), "2026-09-01T00:00:00.000Z");
  assert.equal(isoRange.endDate.toISOString(), "2026-12-31T23:59:59.999Z");
  assert.equal(isoRange.classification, "Active");

  // Past ISO range
  const pastRange = ci.parseTerm("2026-01-10 - 2026-04-28", { referenceDate: REF_DATE });
  assert.equal(pastRange.isConfident, true);
  assert.equal(pastRange.classification, "Past");

  // Human-readable date range
  const humanRange = ci.parseTerm("Sep 1, 2026 - Dec 15, 2026", { referenceDate: REF_DATE });
  assert.equal(humanRange.isConfident, true);
  assert.equal(humanRange.startDate.toISOString(), "2026-09-01T00:00:00.000Z");
  assert.equal(humanRange.endDate.toISOString(), "2026-12-15T23:59:59.999Z");
  assert.equal(humanRange.classification, "Active");

  // Slashed date range
  const slashRange = ci.parseTerm("2026-01-05 / 2026-04-30", { referenceDate: REF_DATE });
  assert.equal(slashRange.isConfident, true);
  assert.equal(slashRange.classification, "Past");
});

test("Task 1.3 UNKNOWN FALLBACK: unparseable or ambiguous labels return visible Unknown without guessing", () => {
  const unparseableLabels = [
    "Independent Study",
    "Continuous Enrollment",
    "Math 101 Sandbox",
    "Ongoing",
    "",
    "   ",
    null,
    undefined,
  ];

  for (const label of unparseableLabels) {
    const result = ci.parseTerm(label, { referenceDate: REF_DATE });
    assert.equal(result.isConfident, false);
    assert.equal(result.classification, "Unknown");
    assert.equal(result.status, "Unknown");
    assert.equal(result.season, null);
    assert.equal(result.startDate, null);
    assert.equal(result.endDate, null);

    assert.equal(ci.classifyCourseTerm(label, { referenceDate: REF_DATE }), "Unknown");
  }

  // Label without year and without referenceDate cannot guess year -> returns Unknown
  const noYearResult = ci.parseTerm("Winter Term 2", {});
  assert.equal(noYearResult.isConfident, false);
  assert.equal(noYearResult.classification, "Unknown");
});

test("Task 1.3 TIME ZONE INJECTION: injected timeZone shifts boundaries and classification at edge dates", () => {
  // On 2026-05-01 at 02:00:00 UTC:
  // In America/Chicago (CDT is UTC-5), the time is 2026-04-30 21:00:00 (still April 30!)
  // Winter Term 2 ends on April 30 23:59:59.999 local.
  const edgeDate = new Date("2026-05-01T02:00:00.000Z");

  // Under America/Chicago timezone, April 30 has not finished yet, so it is ACTIVE
  const chicago = ci.parseTerm("Winter Term 2 2026", {
    referenceDate: edgeDate,
    timeZone: "America/Chicago",
  });
  assert.equal(chicago.classification, "Active");
  assert.equal(chicago.endDate.toISOString(), "2026-05-01T04:59:59.999Z");

  // Under UTC, April 30 ended at 23:59:59.999Z, so edgeDate is PAST
  const utc = ci.parseTerm("Winter Term 2 2026", {
    referenceDate: edgeDate,
    timeZone: "UTC",
  });
  assert.equal(utc.classification, "Past");
  assert.equal(utc.endDate.toISOString(), "2026-04-30T23:59:59.999Z");
});

test("Task 1.3 NO SYSTEM CLOCK: module does not call Date.now() or read system time zone", () => {
  // Verify Date.now is never called: override Date.now to throw
  const savedDateNow = context.Date.now;
  context.Date.now = () => {
    throw new Error("Violation: Date.now() was called!");
  };

  try {
    const res1 = ci.parseTerm("Fall 2026", { referenceDate: REF_DATE });
    assert.equal(res1.classification, "Active");

    const res2 = ci.deriveCourseIdentity("https://us.prairielearn.com/pl/course_instance/101");
    assert.equal(res2.key, "https://us.prairielearn.com|101");

    // Missing referenceDate returns Unknown rather than consulting the system clock
    const res3 = ci.parseTerm("Fall 2026", {});
    assert.equal(res3.classification, "Unknown");

    const res4 = ci.classifyCourseTerm("Fall 2026");
    assert.equal(res4, "Unknown");
  } finally {
    context.Date.now = savedDateNow;
  }
});
