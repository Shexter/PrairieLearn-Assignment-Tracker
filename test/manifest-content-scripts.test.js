const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const assessmentMatch =
  "https://*.prairielearn.com/pl/course_instance/*/assessment_instance/*";
const questionMatch =
  "https://*.prairielearn.com/pl/course_instance/*/instance_question/*";
const expectedHostPermissions = [
  "https://*.prairielearn.com/*",
  "https://accounts.google.com/*",
  "https://www.googleapis.com/*",
];

function readManifest(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function assertContentScript(manifest, matches, js) {
  const entry = manifest.content_scripts.find((script) =>
    script.matches.includes(matches)
  );

  assert.ok(entry, `missing content script for ${matches}`);
  assert.deepEqual(entry.matches, [matches]);
  assert.deepEqual(entry.js, js);
  assert.equal(entry.run_at, "document_idle");
}

for (const [browser, expectedPermissions] of [
  ["Chrome", ["storage", "tabs", "scripting", "identity", "offscreen"]],
  ["Firefox", ["storage", "tabs", "scripting", "identity"]],
]) {
  test(`${browser} registers the assessment and question content scripts`, () => {
    const manifest = readManifest(`${browser}/manifest.json`);

    assertContentScript(manifest, assessmentMatch, ["assessment-content.js"]);
    assertContentScript(manifest, questionMatch, [
      "libs/html2canvas.min.js",
      "question-content.js",
    ]);
  });

  test(`${browser} preserves its existing permissions`, () => {
    const manifest = readManifest(`${browser}/manifest.json`);

    assert.deepEqual(manifest.permissions, expectedPermissions);
    assert.deepEqual(manifest.host_permissions, expectedHostPermissions);
  });
}
