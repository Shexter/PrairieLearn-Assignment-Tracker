const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { JSDOM } = require("jsdom");

const popupHtml = fs.readFileSync(
  path.resolve(process.cwd(), "Chrome/popup/popup.html"),
  "utf8"
);
const chromeScript = fs.readFileSync(
  path.resolve(process.cwd(), "Chrome/popup/popup.js"),
  "utf8"
);

function loadPopupRuntime() {
  const dom = new JSDOM(popupHtml, {
    url: "chrome-extension://pl-test/popup/popup.html",
  });

  const ctx = vm.createContext({
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    Event: dom.window.Event,
    Blob: dom.window.Blob,
    URL: dom.window.URL,
    URLSearchParams,
    Date,
    console,
    chrome: {
      storage: {
        local: {
          get: (keys, cb) => cb({}),
          set: (items, cb) => { if (cb) cb(); },
        },
        onChanged: {
          addListener: () => {},
        },
      },
      tabs: {
        create: () => {},
      },
      runtime: {
        sendMessage: (msg, cb) => { if (cb) cb({ ok: true, data: {} }); },
      },
    },
  });

  vm.runInContext(chromeScript, ctx);
  return dom.window.__PL_POPUP_RUNTIME__;
}

test("badge colors: getBadgePrefix extracts alphabetic prefix correctly", () => {
  const runtime = loadPopupRuntime();
  assert.equal(runtime.getBadgePrefix("P1"), "P");
  assert.equal(runtime.getBadgePrefix("P2"), "P");
  assert.equal(runtime.getBadgePrefix("P4"), "P");
  assert.equal(runtime.getBadgePrefix("QI0"), "QI");
  assert.equal(runtime.getBadgePrefix("QI6"), "QI");
  assert.equal(runtime.getBadgePrefix("Q1"), "Q");
  assert.equal(runtime.getBadgePrefix("T1"), "T");
  assert.equal(runtime.getBadgePrefix("L1"), "L");
  assert.equal(runtime.getBadgePrefix("Exam"), "EXAM");
  assert.equal(runtime.getBadgePrefix("HW5"), "HW");
  assert.equal(runtime.getBadgePrefix(""), "");
});

test("badge colors: default color mappings align with requirements", () => {
  const runtime = loadPopupRuntime();

  // P(X) -> purple (color-purple3)
  const p1 = runtime.resolveBadgeColor({ badge: "P1" });
  assert.equal(p1.className, "color-purple3");

  const p4 = runtime.resolveBadgeColor({ badge: "P4" });
  assert.equal(p4.className, "color-purple3");

  // Exam / PrairieTest -> RED (color-red2)
  const exam = runtime.resolveBadgeColor({ badge: "Exam", isPrairieTest: true });
  assert.equal(exam.className, "color-red2");

  const examTag = runtime.resolveBadgeColor({ badge: "Exam" });
  assert.equal(examTag.className, "color-red2");

  // QI -> cyan (color-blue1)
  const qi = runtime.resolveBadgeColor({ badge: "QI0" });
  assert.equal(qi.className, "color-blue1");

  // T -> yellow (color-yellow3)
  const t1 = runtime.resolveBadgeColor({ badge: "T1" });
  assert.equal(t1.className, "color-yellow3");

  // L -> dark blue (color-blue3)
  const l1 = runtime.resolveBadgeColor({ badge: "L1" });
  assert.equal(l1.className, "color-blue3");

  // R -> pink (color-pink2)
  const r1 = runtime.resolveBadgeColor({ badge: "R1" });
  assert.equal(r1.className, "color-pink2");
});

test("badge colors: native PrairieLearn colorClass is preserved unless overridden", () => {
  const runtime = loadPopupRuntime();

  // If PrairieLearn gave it color-pink2 on the course page, it retains color-pink2
  const nativePink = runtime.resolveBadgeColor({
    badge: "P1",
    colorClass: "color-pink2",
  });
  assert.equal(nativePink.className, "color-pink2");

  const nativeTurquoise = runtime.resolveBadgeColor({
    badge: "Special",
    colorClass: "color-turquoise2",
  });
  assert.equal(nativeTurquoise.className, "color-turquoise2");
});

test("badge colors: user override takes top priority over native color and defaults", () => {
  const runtime = loadPopupRuntime();

  // Override P prefix with color-green2
  const overrides = { P: "color-green2" };
  const res = runtime.resolveBadgeColor({ badge: "P1", colorClass: "color-pink2" }, overrides);
  assert.equal(res.className, "color-green2");

  // Custom hex override
  const customOverrides = { EXAM: "#123456" };
  const customExam = runtime.resolveBadgeColor({ badge: "Exam", isPrairieTest: true }, customOverrides);
  assert.equal(customExam.customHex, "#123456");
  assert.equal(customExam.bg, "#123456");
});

test("badge colors: applyBadgeStyle applies classes and titles correctly", () => {
  const runtime = loadPopupRuntime();
  const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
  const badgeEl = dom.window.document.createElement("span");
  badgeEl.className = "badge";

  runtime.applyBadgeStyle(badgeEl, { badge: "P2" });
  assert.ok(badgeEl.classList.contains("color-purple3"));
  assert.equal(badgeEl.getAttribute("data-badge-prefix"), "P");
  assert.equal(badgeEl.getAttribute("data-badge-tag"), "P2");
  assert.ok(badgeEl.title.includes('change color for "P" tags'));
});
