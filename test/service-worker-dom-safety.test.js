const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const background = fs.readFileSync("Chrome/background.js", "utf8");

test("background.js never constructs a DOMParser", () => {
  // A Chrome MV3 service worker has no DOM. Any `new DOMParser()` here throws a
  // ReferenceError at runtime, which previously made every background fetch
  // fail and forced the slow page-context fallback.
  assert.equal(
    /new\s+DOMParser\s*\(/.test(background),
    false,
    "background.js must delegate HTML parsing to parsing.js / the offscreen document"
  );
});

test("background.js reaches DOM parsing through the offscreen bridge", () => {
  assert.match(background, /chrome\.offscreen[\s\S]{0,20}createDocument/);
  assert.match(background, /reasons:\s*\["DOM_PARSER"\]/);
  assert.match(background, /hasDocument\(\)/, "must re-check for a closed offscreen document");
});

test("Chrome ships the offscreen document and declares the permission", () => {
  const manifest = JSON.parse(fs.readFileSync("Chrome/manifest.json", "utf8"));
  assert.ok(manifest.permissions.includes("offscreen"));

  const html = fs.readFileSync("Chrome/offscreen.html", "utf8");
  assert.match(html, /src="parsing\.js"/);
  assert.match(html, /src="offscreen\.js"/);
});

test("the offscreen listener answers synchronously", () => {
  // Returning true and responding later is what closes the message channel when
  // the worker is torn down; this listener must never do that.
  const offscreen = fs.readFileSync("Chrome/offscreen.js", "utf8");
  assert.equal(/return\s+true\s*;/.test(offscreen), false);
  assert.match(offscreen, /sendResponse\(/);
});

test("Firefox loads parsing.js into its background page", () => {
  const manifest = JSON.parse(fs.readFileSync("Firefox/manifest.json", "utf8"));
  const scripts = manifest.background.scripts;
  assert.deepEqual(scripts, ["parsing.js", "background.js"]);
});

test("parsing.js exposes the helpers both runtimes call", () => {
  const parsing = fs.readFileSync("Chrome/parsing.js", "utf8");
  for (const name of [
    "parseAssessmentsHtml",
    "extractCourseInstanceIdsFromHomeHtml",
    "getDeadlineInfo",
  ]) {
    assert.match(parsing, new RegExp(`\\b${name}\\b`), `parsing.js must export ${name}`);
  }
});
