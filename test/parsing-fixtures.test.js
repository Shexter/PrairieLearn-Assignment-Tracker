const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { JSDOM } = require("jsdom");

const FIXTURE = "test/fixtures/assessments-cpsc313.html";

// The fixtures are real saved PrairieLearn markup and are gitignored, so skip
// cleanly on a machine that has not captured them yet.
const hasFixture = fs.existsSync(FIXTURE);

function loadParsing() {
  const dom = new JSDOM("<!doctype html><body>");
  const ctx = {
    DOMParser: dom.window.DOMParser,
    Date,
    JSON,
    Number,
    URL,
    console,
  };
  ctx.globalThis = ctx;
  ctx.self = ctx;
  vm.runInNewContext(fs.readFileSync("Chrome/parsing.js", "utf8"), ctx);
  return ctx.PrairieLearnTrackerParsing;
}

const CONTEXT = {
  origin: "https://us.prairielearn.com",
  assessmentsUrl: "https://us.prairielearn.com/pl/course_instance/225673/assessments",
  courseInstanceId: "225673",
};

test("parsing.js exposes its entry points under jsdom", () => {
  const parsing = loadParsing();
  assert.equal(typeof parsing.parseAssessmentsHtml, "function");
  assert.equal(typeof parsing.extractCourseInstanceIdsFromHomeHtml, "function");
});

test("every assessment group is parsed, not just the first", { skip: !hasFixture }, () => {
  const parsing = loadParsing();
  const html = fs.readFileSync(FIXTURE, "utf8");
  const parsed = parsing.parseAssessmentsHtml(html, CONTEXT);

  assert.ok(parsed, "the assessments table should parse");

  // The live page renders one <tbody> per assessment set; the fixture keeps all
  // seven groups with the first two rows of each. Parsing only the first tbody
  // yields 2 assessments and one group, which is the bug this guards.
  const groups = [...new Set(parsed.assessments.map((a) => a.group))];
  assert.deepEqual(groups, [
    "Quiz Practice",
    "Quiz Information",
    "Quizzes",
    "Labs",
    "Tutorials",
    "Preclass",
    "Inclass",
  ]);
  assert.equal(parsed.assessments.length, 14, "two rows kept per group in the fixture");
});

test("group heading rows are never mistaken for assessments", { skip: !hasFixture }, () => {
  const parsing = loadParsing();
  const parsed = parsing.parseAssessmentsHtml(fs.readFileSync(FIXTURE, "utf8"), CONTEXT);

  // Headings are <th colspan="4"> with zero <td> cells, so a cell-count check
  // alone would not exclude them.
  for (const assessment of parsed.assessments) {
    assert.ok(assessment.badge, `"${assessment.title}" should carry a set badge`);
    assert.notEqual(assessment.title, assessment.group);
  }
});

test("each row keeps its badge, title and group", { skip: !hasFixture }, () => {
  const parsing = loadParsing();
  const parsed = parsing.parseAssessmentsHtml(fs.readFileSync(FIXTURE, "utf8"), CONTEXT);

  const first = parsed.assessments[0];
  assert.equal(first.badge, "R0");
  assert.equal(first.title, "Quiz 0 Practice");
  assert.equal(first.group, "Quiz Practice");
  assert.equal(first.courseInstanceId, "225673");
});

test("popover access windows are read from data-bs-content", { skip: !hasFixture }, () => {
  const parsing = loadParsing();
  const parsed = parsing.parseAssessmentsHtml(fs.readFileSync(FIXTURE, "utf8"), CONTEXT);

  // getAttribute() returns already-decoded HTML. Decoding it a second time
  // flattened the popover table to plain text and produced zero access windows
  // for every assessment, in both browsers, silently.
  const quiz0 = parsed.assessments.find((a) => a.badge === "QI0");
  assert.equal(quiz0.accessWindows.length, 1);

  // Compared field by field: the parsed objects come from a vm realm, so
  // deepEqual would reject them on prototype identity alone.
  const [window] = quiz0.accessWindows;
  assert.equal(window.credit, "100");
  assert.equal(window.start, "2026-09-11 00:00:01 (PDT)");
  assert.equal(window.end, "2026-09-17 23:59:59 (PDT)");
  assert.equal(window.startIso, "2026-09-11T07:00:01.000Z");
  assert.equal(window.endIso, "2026-09-18T06:59:59.000Z");

  const withWindows = parsed.assessments.filter((a) => a.accessWindows?.length);
  assert.equal(withWindows.length, 3, "the fixture keeps three rows with popovers");
});

test("rows with an 'until' deadline resolve to a timestamp", { skip: !hasFixture }, () => {
  const parsing = loadParsing();
  const parsed = parsing.parseAssessmentsHtml(fs.readFileSync(FIXTURE, "utf8"), CONTEXT);

  const dated = parsed.assessments.filter((a) => a.deadlineAt);
  assert.ok(dated.length > 0, "at least one row should yield a deadline");
  for (const assessment of dated) {
    assert.equal(
      Number.isNaN(Date.parse(assessment.deadlineAt)),
      false,
      `${assessment.title} produced an unparseable deadline: ${assessment.deadlineAt}`
    );
  }
});
