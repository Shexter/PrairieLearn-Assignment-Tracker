const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { JSDOM } = require("jsdom");

// These tables are synthetic on purpose: the parser has to follow the markup it
// is given, not the column layout of any one course.
function loadParsing() {
  const dom = new JSDOM("<!doctype html><body>");
  const ctx = { DOMParser: dom.window.DOMParser, Date, JSON, Number, URL, console };
  ctx.globalThis = ctx;
  ctx.self = ctx;
  vm.runInNewContext(fs.readFileSync("Chrome/parsing.js", "utf8"), ctx);
  return ctx.PrairieLearnTrackerParsing;
}

const CONTEXT = { origin: "https://us.prairielearn.com", assessmentsUrl: "u", courseInstanceId: "1" };

function table({ headers, rows }) {
  const head = headers
    ? `<thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>`
    : "";
  return `<table aria-label="Assessments">${head}${rows}</table>`;
}

function group(heading, rowsHtml) {
  const span = 9;
  return `<tbody><tr><th colspan="${span}" data-testid="assessment-group-heading">${heading}</th></tr>${rowsHtml}</tbody>`;
}

const BADGE = '<td><span class="badge" data-testid="assessment-set-badge">X1</span></td>';

test("the standard four-column layout parses", () => {
  const html = table({
    headers: ["Label", "Title", "Available credit", "Score"],
    rows: group("Homework", `<tr>${BADGE}<td><a href="/a">Essay</a></td><td>100% until 23:59, Thu, Sep 17</td><td>Not started</td></tr>`),
  });
  const [a] = loadParsing().parseAssessmentsHtml(html, CONTEXT).assessments;
  assert.equal(a.title, "Essay");
  assert.equal(a.group, "Homework");
  assert.match(a.availabilityText, /until 23:59/);
  assert.equal(a.scoreText, "Not started");
});

test("an extra leading column does not shift every field", () => {
  // A layout that inserts a column before Title. Counting cells would read the
  // title out of the wrong cell and mistake the score column for availability.
  const html = table({
    headers: ["Label", "Flag", "Title", "Available credit", "Score"],
    rows: group("Labs", `<tr>${BADGE}<td>!</td><td><a href="/b">Lab 1</a></td><td>100% until 11:00, Mon, Sep 14</td><td>Not started</td></tr>`),
  });
  const [a] = loadParsing().parseAssessmentsHtml(html, CONTEXT).assessments;
  assert.equal(a.title, "Lab 1");
  assert.match(a.availabilityText, /until 11:00/);
  assert.equal(a.scoreText, "Not started");
});

test("a course with no Available credit column still parses", () => {
  const html = table({
    headers: ["Label", "Title", "Score"],
    rows: group("Exams", `<tr>${BADGE}<td><a href="/c">Final</a></td><td>Not started</td></tr>`),
  });
  const [a] = loadParsing().parseAssessmentsHtml(html, CONTEXT).assessments;
  assert.equal(a.title, "Final");
  assert.equal(a.scoreText, "Not started");
  assert.equal(a.availabilityText, null, "a missing column reads as absent, not as another column");
  assert.equal(a.deadlineAt, null);
});

test("reordered columns follow the header, not the position", () => {
  const html = table({
    headers: ["Label", "Score", "Title", "Available credit"],
    rows: group("Quizzes", `<tr>${BADGE}<td>Not started</td><td><a href="/d">Quiz 9</a></td><td>100% until 09:00, Fri, Oct 2</td></tr>`),
  });
  const [a] = loadParsing().parseAssessmentsHtml(html, CONTEXT).assessments;
  assert.equal(a.title, "Quiz 9");
  assert.equal(a.scoreText, "Not started");
  assert.match(a.availabilityText, /until 09:00/);
});

test("a table with no header row falls back to the common layout", () => {
  const html = table({
    headers: null,
    rows: group("Tutorials", `<tr>${BADGE}<td><a href="/e">Tutorial 1</a></td><td>100% until 23:59, Thu, Sep 17</td><td>Not started</td></tr>`),
  });
  const [a] = loadParsing().parseAssessmentsHtml(html, CONTEXT).assessments;
  assert.equal(a.title, "Tutorial 1");
  assert.equal(a.scoreText, "Not started");
});

test("every group is parsed regardless of how many there are", () => {
  const headings = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];
  const rows = headings
    .map((h) => group(h, `<tr>${BADGE}<td>Item ${h}</td><td></td><td>Not started</td></tr>`))
    .join("");
  const parsed = loadParsing().parseAssessmentsHtml(
    table({ headers: ["Label", "Title", "Available credit", "Score"], rows }),
    CONTEXT
  );
  // Array.from: the parsed array comes from a vm realm, so deepEqual would
  // otherwise reject it on prototype identity.
  assert.deepEqual(Array.from(parsed.assessments, (a) => a.group), headings);
});

test("rows without a badge and heading rows are never treated as assessments", () => {
  const html = table({
    headers: ["Label", "Title", "Available credit", "Score"],
    rows: group(
      "Mixed",
      `<tr><td colspan="4">A spacer row with no badge</td></tr>` +
        `<tr>${BADGE}<td>Real</td><td></td><td>Not started</td></tr>`
    ),
  });
  const parsed = loadParsing().parseAssessmentsHtml(html, CONTEXT);
  assert.equal(parsed.assessments.length, 1);
  assert.equal(parsed.assessments[0].title, "Real");
});

test("a malformed href does not abort the parse", () => {
  const html = table({
    headers: ["Label", "Title", "Available credit", "Score"],
    rows: group("Odd", `<tr>${BADGE}<td><a href="http://[bad">Broken link</a></td><td></td><td>Not started</td></tr>`),
  });
  const [a] = loadParsing().parseAssessmentsHtml(html, CONTEXT).assessments;
  assert.equal(a.title, "Broken link");
  assert.equal(a.absoluteUrl, null);
});

test("a table that is not the assessments table is ignored", () => {
  const parsing = loadParsing();
  assert.equal(parsing.parseAssessmentsHtml("<table><tr><td>x</td></tr></table>", CONTEXT), null);
});
