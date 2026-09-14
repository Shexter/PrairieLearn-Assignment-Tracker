const assert = require("node:assert/strict");
const fs = require("node:fs");
for (const file of [
  "background.js",
  "parsing.js",
  "home-content.js",
  "assessment-content.js",
  "question-content.js",
  "libs/html2canvas.min.js",
  "progress-summary.js",
  "popup/popup.js",
  "popup/popup.css",
  "popup/popup.html",
  "prairietest-content.js",
]) {
  assert.equal(fs.readFileSync(`Chrome/${file}`, "utf8"), fs.readFileSync(`Firefox/${file}`, "utf8"), `${file} drifted between browsers`);
}
for (const manifest of ["Chrome/manifest.json", "Firefox/manifest.json"]) {
  const parsed = JSON.parse(fs.readFileSync(manifest, "utf8"));
  assert.ok(parsed.permissions.includes("storage"));
  assert.ok(parsed.content_scripts[0].js.includes("progress-summary.js"));
  assert.ok(parsed.content_scripts[0].js.includes("home-content.js"));
  assert.ok(parsed.permissions.includes("identity"));
}
console.log("Chrome/Firefox parity checks passed.");
