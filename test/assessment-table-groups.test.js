const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

// PrairieLearn renders one <tbody> per assessment group (Quiz Practice, Quiz
// Information, Preclass, Inclass, ...). Anchoring a row scan to a single tbody
// silently limits every feature to the first group: filters counted "6 of 6"
// and pin buttons only ever reached rows in that first group.
const ROW_SCAN_FILES = ["Chrome/home-content.js", "Chrome/parsing.js"];

for (const file of ROW_SCAN_FILES) {
  const source = fs.readFileSync(file, "utf8");

  test(`${file} scans every assessment group tbody`, () => {
    assert.match(
      source,
      /":scope > tbody > tr"/,
      "row collection must walk all tbody elements of the assessments table"
    );
  });

  test(`${file} never collects rows from a single tbody`, () => {
    assert.equal(
      /tbody\.querySelectorAll\(":scope > tr"\)/.test(source),
      false,
      "scoping rows to one tbody drops every group after the first"
    );
  });
}

test("home-content.js appends the empty-state row after the last group", () => {
  const source = fs.readFileSync("Chrome/home-content.js", "utf8");
  assert.match(source, /getLastAssessmentTableBody\(tbody\)[\s\S]{0,20}appendChild\(zeroRow\)/);
});

test("the filter observer watches the whole table", () => {
  const source = fs.readFileSync("Chrome/home-content.js", "utf8");
  assert.match(source, /observer\.observe\(\s*getAssessmentsTableFrom\(tbody\)/);
});
