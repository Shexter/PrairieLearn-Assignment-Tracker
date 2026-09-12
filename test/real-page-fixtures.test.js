const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { JSDOM } = require("jsdom");

// Real saved PrairieLearn markup, captured by the repository owner from two live
// courses. Gitignored, so every test here skips cleanly on a machine that has not
// captured them. These complement the synthetic-layout tests: synthetic markup
// proves the parser is general, these prove it matches what PrairieLearn really
// emits today.
const F = (name) => `test/fixtures/${name}`;
const has = (name) => fs.existsSync(F(name));
const read = (name) => fs.readFileSync(F(name), "utf8");

function loadParsing() {
  const dom = new JSDOM("<!doctype html><body>");
  const ctx = { DOMParser: dom.window.DOMParser, Date, JSON, Number, URL, console };
  ctx.globalThis = ctx;
  ctx.self = ctx;
  vm.runInNewContext(fs.readFileSync("Chrome/parsing.js", "utf8"), ctx);
  return ctx.PrairieLearnTrackerParsing;
}

const ORIGIN = "https://us.prairielearn.com";
// parseAssessmentsHtml returns a snapshot object, not a bare array.
const parseCourse = (parsing, file, id) => parsing.parseAssessmentsHtml(read(file), ctxFor(id)).assessments;

const ctxFor = (id) => ({
  origin: ORIGIN,
  assessmentsUrl: `${ORIGIN}/pl/course_instance/${id}/assessments`,
  courseInstanceId: String(id),
});

test("real course page: every assessment group is scanned, not just the first", { skip: !has("course-313.html") }, () => {
  const items = parseCourse(loadParsing(), "course-313.html", 225673);
  assert.ok(Array.isArray(items));
  // This is the bug that started all of this: a single-tbody selector saw only
  // the first group. This real page carries 7 groups and 107 rows.
  assert.ok(items.length > 50, `expected the whole table, got ${items.length}`);
  const groups = new Set(items.map((i) => i.group).filter(Boolean));
  assert.ok(groups.size >= 5, `expected several groups, got ${[...groups].join(", ")}`);
});

test("real course page: a second, differently-shaped course parses too", { skip: !has("course-317.html") }, () => {
  const items = parseCourse(loadParsing(), "course-317.html", 225674);
  assert.ok(Array.isArray(items));
  assert.ok(items.length > 0, "expected at least one assessment from CPSC 317");
});

test("real course page: 'until' rows carry a deadline and 'Available' rows do not", { skip: !has("course-313.html") }, () => {
  const items = parseCourse(loadParsing(), "course-313.html", 225673);
  assert.ok(items.some((i) => i.deadlineAt), "expected at least one real deadline");
  // Unpublished 'Available ...' rows must never be treated as due dates.
  for (const item of items) {
    if (/^\s*available/i.test(item.availabilityText || "")) {
      assert.ok(!item.deadlineAt, `'Available' row gained a deadline: ${item.title}`);
    }
  }
});

test("real course page: every parsed assessment has a usable absolute link", { skip: !has("course-313.html") }, () => {
  const items = parseCourse(loadParsing(), "course-313.html", 225673);
  let checked = 0;
  for (const item of items) {
    if (!item.absoluteUrl) continue;
    assert.match(item.absoluteUrl, /^https:\/\/us\.prairielearn\.com\/pl\//, `bad link: ${item.absoluteUrl}`);
    checked += 1;
  }
  assert.ok(checked > 0, "expected at least one absolute assessment link");
});

test("real home page: both enrolled course instances are discovered", { skip: !has("home-courses.html") }, () => {
  const ids = loadParsing().extractCourseInstanceIdsFromHomeHtml(read("home-courses.html"), ORIGIN);
  const list = Array.from(ids || []);
  assert.ok(list.length >= 2, `expected both courses, got ${list.length}`);
  for (const id of list) assert.match(String(id), /^\d+$/);
});

test("real assessment-instance page: its questions table is readable", { skip: !has("assessment-instance.html") }, () => {
  const dom = new JSDOM(read("assessment-instance.html"));
  const links = dom.window.document.querySelectorAll('a[href*="instance_question/"]');
  assert.ok(links.length > 0, "expected question links in the questions table");
  for (const link of links) {
    assert.match(link.getAttribute("href"), /instance_question\/\d+/);
  }
});

test("real question page: a capture target panel exists", { skip: !has("question-mathjax.html") }, () => {
  const dom = new JSDOM(read("question-mathjax.html"));
  const panel = dom.window.document.querySelector(".card, .question-block, [id^=question-]");
  assert.ok(panel, "screenshot needs a question panel to capture");
});

test("real question page: the rendered save carries MathJax's runtime", { skip: !has("question-mathjax.html") }, () => {
  const html = read("question-mathjax.html");
  // Neither captured course currently sets a question containing typeset maths,
  // so this asserts what the fixture really proves: the rendered save carries
  // MathJax's injected stylesheet, which the fast save does not. See
  // openspec/changes/restore-question-copy-and-screenshot/fidelity-results.md.
  assert.ok(/mjx-container/.test(html), "rendered save should carry MathJax's injected CSS");
});

test("the fast save of the same question loses what rendering added", { skip: !has("question-mathjax-unrendered.html") }, () => {
  const rendered = read("question-mathjax.html");
  const fast = read("question-mathjax-unrendered.html");
  // Why method B exists: the fast save is a strictly smaller document because
  // everything JavaScript injected is absent from it.
  assert.ok(fast.length < rendered.length, "fast save should be smaller than the rendered save");
  assert.ok(!/mjx-container/.test(fast), "fast save should not carry MathJax's injected CSS");
});
