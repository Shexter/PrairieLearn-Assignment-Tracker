const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

// 1. Load shared core
const coreSource = fs.readFileSync("shared/tracker-core.js", "utf8");
const coreCtx = {
  TextEncoder,
  crypto: require("node:crypto").webcrypto,
  URL,
  Date,
  URLSearchParams,
};
coreCtx.globalThis = coreCtx;
vm.runInNewContext(coreSource, coreCtx);
const core = coreCtx.PrairieLearnTrackerCore;

// Helper to load home-content.js in isolated sandbox
function loadHomeRuntime(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  const ctx = {
    window: {
      location: { pathname: "/pl/course_instance/101/assessments", origin: "https://us.prairielearn.com", hostname: "us.prairielearn.com" },
      addEventListener: () => {},
      removeEventListener: () => {},
      open: () => {},
      setTimeout,
      clearTimeout,
    },
    document: {
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => ({ setAttribute: () => {}, appendChild: () => {}, addEventListener: () => {} }),
      addEventListener: () => {},
      getElementById: () => null,
    },
    chrome: {
      runtime: { onMessage: { addListener: () => {} }, sendMessage: () => {} },
      storage: { local: { get: () => {}, set: () => {} } },
    },
    MutationObserver: class { observe() {} disconnect() {} },
    setTimeout,
    clearTimeout,
    console,
    URL,
    URLSearchParams,
    Date,
    TextEncoder,
    Uint8Array,
    crypto: require("node:crypto").webcrypto,
  };
  ctx.window.window = ctx.window;
  ctx.window.document = ctx.document;
  ctx.window.chrome = ctx.chrome;
  ctx.globalThis = ctx;
  vm.runInNewContext(source, ctx);
  return ctx.window.__PL_PRODUCTION_RUNTIME__;
}

// Helper to load background.js in isolated sandbox
function loadBackgroundRuntime(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  const ctx = {
    chrome: {
      runtime: {
        onInstalled: { addListener: () => {} },
        onMessage: { addListener: () => {} },
      },
      storage: {
        local: {
          get: () => Promise.resolve({}),
          set: () => Promise.resolve(),
          remove: () => Promise.resolve(),
        },
      },
    },
    setTimeout,
    clearTimeout,
    console,
    URL,
    URLSearchParams,
    Date,
    TextEncoder,
    Uint8Array,
    crypto: require("node:crypto").webcrypto,
  };
  ctx.globalThis = ctx;
  vm.runInNewContext(source, ctx);
  return ctx.__PL_BACKGROUND_RUNTIME__;
}

// Helper to load popup.js in isolated sandbox
function loadPopupRuntime(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  const ctx = {
    window: {
      addEventListener: () => {},
      open: () => {},
    },
    document: {
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => ({ setAttribute: () => {}, appendChild: () => {}, addEventListener: () => {}, classList: { add: () => {}, remove: () => {} } }),
      addEventListener: () => {},
      getElementById: () => ({ addEventListener: () => {}, setAttribute: () => {}, appendChild: () => {}, classList: { add: () => {}, remove: () => {} } }),
    },
    chrome: {
      runtime: { sendMessage: () => {} },
      storage: { local: { get: () => {}, set: () => {} } },
      tabs: { query: () => {} },
    },
    setTimeout,
    clearTimeout,
    console,
    URL,
    URLSearchParams,
    Date,
    TextEncoder,
    Uint8Array,
  };
  ctx.window.window = ctx.window;
  ctx.window.document = ctx.document;
  ctx.window.chrome = ctx.chrome;
  ctx.globalThis = ctx;
  vm.runInNewContext(source, ctx);
  return ctx.window.__PL_POPUP_RUNTIME__;
}

const chromeHome = loadHomeRuntime("Chrome/home-content.js");
const firefoxHome = loadHomeRuntime("Firefox/home-content.js");
const chromeBg = loadBackgroundRuntime("Chrome/background.js");
const firefoxBg = loadBackgroundRuntime("Firefox/background.js");
const chromePopup = loadPopupRuntime("Chrome/popup/popup.js");
const firefoxPopup = loadPopupRuntime("Firefox/popup/popup.js");

const allRuntimes = [
  { name: "shared-core", rt: core },
  { name: "chrome-home", rt: chromeHome },
  { name: "firefox-home", rt: firefoxHome },
  { name: "chrome-bg", rt: chromeBg },
  { name: "firefox-bg", rt: firefoxBg },
  { name: "chrome-popup", rt: chromePopup },
  { name: "firefox-popup", rt: firefoxPopup },
];

test("resolvePrairieLearnAssessmentUrl matches across shared core and all shipped production runtimes", () => {
  const testCases = [
    // Valid relative path
    { url: "/pl/course_instance/101/assessment/5/", origin: "https://us.prairielearn.com", expected: "https://us.prairielearn.com/pl/course_instance/101/assessment/5/" },
    // Valid absolute same-origin
    { url: "https://us.prairielearn.com/pl/course_instance/101/assessment/5/", origin: "https://us.prairielearn.com", expected: "https://us.prairielearn.com/pl/course_instance/101/assessment/5/" },
    // Valid with query & hash
    { url: "/pl/course_instance/101/assessment/5/?mode=exam#q1", origin: "https://us.prairielearn.com", expected: "https://us.prairielearn.com/pl/course_instance/101/assessment/5/?mode=exam#q1" },
    // Hostile javascript:
    { url: "javascript:alert(document.cookie)", origin: "https://us.prairielearn.com", expected: null },
    // Hostile data:
    { url: "data:text/html,<script>alert(1)</script>", origin: "https://us.prairielearn.com", expected: null },
    // Hostile vbscript:
    { url: "vbscript:msgbox(1)", origin: "https://us.prairielearn.com", expected: null },
    // Hostile file:
    { url: "file:///etc/passwd", origin: "https://us.prairielearn.com", expected: null },
    // Hostile protocol-relative cross-origin
    { url: "//evil.com/fake", origin: "https://us.prairielearn.com", expected: null },
    // Hostile cross-origin
    { url: "https://evil.com/phish", origin: "https://us.prairielearn.com", expected: null },
    // Hostile suffix attack
    { url: "https://us.prairielearn.com.attacker.com/steal", origin: "https://us.prairielearn.com", expected: null },
    // Hostile different PL subdomain when origin is us
    { url: "https://ca.prairielearn.com/pl/101", origin: "https://us.prairielearn.com", expected: null },
    // Empty, null, undefined, whitespace
    { url: "", origin: "https://us.prairielearn.com", expected: null },
    { url: "   ", origin: "https://us.prairielearn.com", expected: null },
    { url: null, origin: "https://us.prairielearn.com", expected: null },
    { url: undefined, origin: "https://us.prairielearn.com", expected: null },
    // Malformed URL that cannot be parsed
    { url: "https://us.prairielearn.com:999999/bad", origin: "https://us.prairielearn.com", expected: null },
  ];

  for (const { name, rt } of allRuntimes) {
    assert.ok(typeof rt.resolvePrairieLearnAssessmentUrl === "function", `${name} missing resolvePrairieLearnAssessmentUrl`);
    for (const tc of testCases) {
      const result = rt.resolvePrairieLearnAssessmentUrl(tc.url, tc.origin);
      assert.equal(result, tc.expected, `${name} failed on ${tc.url} with origin ${tc.origin}`);
    }
  }
});

test("isEligibleForCalendarAction matches across shared core and all shipped production runtimes", () => {
  const fixedNow = new Date("2026-09-10T12:00:00Z").getTime();
  const origin = "https://us.prairielearn.com";

  const validItem = {
    courseInstanceId: "101",
    courseLabel: "CS 225",
    title: "Trees",
    deadlineAt: "2026-09-15T18:00:00Z",
    deadlineSource: "visible_until",
    href: "/pl/course_instance/101/assessment/5/",
    status: "open",
  };

  const testItems = [
    { item: validItem, expected: true, desc: "valid open future assessment" },
    { item: { ...validItem, deadlineAt: "2026-09-09T18:00:00Z" }, expected: false, desc: "past deadline" },
    { item: { ...validItem, status: "closed" }, expected: false, desc: "closed status" },
    { item: { ...validItem, availabilityText: "Assessment closed" }, expected: false, desc: "closed text in availability" },
    { item: { ...validItem, scoreText: "Assessment closed" }, expected: false, desc: "closed text in score" },
    { item: { ...validItem, href: "javascript:alert(1)" }, expected: false, desc: "javascript: url" },
    { item: { ...validItem, href: "data:text/html,abc" }, expected: false, desc: "data: url" },
    { item: { ...validItem, href: "https://evil.com/fake" }, expected: false, desc: "cross-origin url" },
    { item: { ...validItem, href: null, absoluteUrl: null }, expected: false, desc: "missing url" },
    { item: { ...validItem, deadlineAt: null, dueAt: null }, expected: false, desc: "missing deadline" },
    { item: null, expected: false, desc: "null item" },
    { item: "not an object", expected: false, desc: "string item" },
  ];

  for (const { name, rt } of allRuntimes) {
    assert.ok(typeof rt.isEligibleForCalendarAction === "function", `${name} missing isEligibleForCalendarAction`);
    for (const tc of testItems) {
      const result = rt.isEligibleForCalendarAction(tc.item, origin, fixedNow);
      assert.equal(result, tc.expected, `${name} failed on ${tc.desc}`);
    }
  }
});

test("compose URL builders in home and popup match shared core behavior", () => {
  const fixedNow = new Date("2026-09-10T12:00:00Z").getTime();
  const origin = "https://us.prairielearn.com";

  const validItem = {
    courseInstanceId: "101",
    courseLabel: "CS 225",
    badge: "HW 3",
    title: "Binary Trees",
    deadlineAt: "2026-09-15T18:00:00Z",
    deadlineSource: "visible_until",
    href: "/pl/course_instance/101/assessment/5/",
    status: "open",
  };

  const hostileItem = {
    ...validItem,
    href: "javascript:alert(1)",
  };

  const composeRuntimes = [
    { name: "shared-core", rt: core },
    { name: "chrome-home", rt: chromeHome },
    { name: "firefox-home", rt: firefoxHome },
    { name: "chrome-popup", rt: chromePopup },
    { name: "firefox-popup", rt: firefoxPopup },
  ];

  const expectedGcal = core.buildGoogleCalendarComposeUrl(validItem, origin, fixedNow);
  const expectedOutlook = core.buildOutlookWebComposeUrl(validItem, origin, fixedNow);

  assert.ok(expectedGcal);
  assert.ok(expectedOutlook);

  for (const { name, rt } of composeRuntimes) {
    // Valid item
    const gcal = rt.buildGoogleCalendarComposeUrl(validItem, origin, fixedNow);
    const outlook = rt.buildOutlookWebComposeUrl(validItem, origin, fixedNow);
    assert.equal(gcal, expectedGcal, `${name} gcal mismatch`);
    assert.equal(outlook, expectedOutlook, `${name} outlook mismatch`);

    // Hostile item must be rejected (null)
    assert.equal(rt.buildGoogleCalendarComposeUrl(hostileItem, origin, fixedNow), null, `${name} allowed hostile gcal`);
    assert.equal(rt.buildOutlookWebComposeUrl(hostileItem, origin, fixedNow), null, `${name} allowed hostile outlook`);
  }
});

test("filtering helpers in home runtime match shared core predicates", () => {
  const testItems = [
    { score: "100%", expectedCompleted: true },
    { score: "105%", expectedCompleted: true },
    { score: "99.9%", expectedCompleted: false },
    { score: null, expectedCompleted: false },
  ];

  for (const tc of testItems) {
    const sharedCompleted = core.isAssessment100PercentCompleted(tc.score);
    assert.equal(sharedCompleted, tc.expectedCompleted);
    assert.equal(chromeHome.isAssessment100PercentCompleted(tc.score), tc.expectedCompleted);
    assert.equal(firefoxHome.isAssessment100PercentCompleted(tc.score), tc.expectedCompleted);
  }

  const sampleAssessment = {
    title: "Midterm Exam 1",
    badge: "EXAM 1",
    group: "Exams",
    searchableText: "Midterm Exam 1 50/100",
  };

  assert.equal(core.matchesAssessmentSearch(sampleAssessment, "midterm"), true);
  assert.equal(chromeHome.matchesAssessmentSearch(sampleAssessment, "midterm"), true);
  assert.equal(firefoxHome.matchesAssessmentSearch(sampleAssessment, "midterm"), true);

  assert.equal(core.matchesAssessmentSearch(sampleAssessment, "homework"), false);
  assert.equal(chromeHome.matchesAssessmentSearch(sampleAssessment, "homework"), false);
  assert.equal(firefoxHome.matchesAssessmentSearch(sampleAssessment, "homework"), false);
});
