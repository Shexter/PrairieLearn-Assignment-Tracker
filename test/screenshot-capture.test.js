const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { JSDOM } = require("jsdom");

const SOURCE = fs.readFileSync("Chrome/question-content.js", "utf8");

const QUESTION_URL = "https://us.prairielearn.com/pl/course_instance/225673/instance_question/998877/";
const ASSESSMENT_URL = "https://us.prairielearn.com/pl/course_instance/225673/assessment_instance/443322/";
const HOME_URL = "https://us.prairielearn.com/pl/course_instance/225673/assessments";

const QUESTION_PAGE = `<!doctype html><body>
  <div class="card question-block">
    <div class="card-header"><span class="qtitle">Question 3</span></div>
    <div class="card-body question-body">What is the value of x?</div>
  </div>
</body>`;

/** A canvas whose pixels differ, i.e. a capture that looks like real content. */
function goodCanvas(blob = { type: "image/png" }) {
  return {
    width: 800,
    height: 1200,
    getContext: () => ({
      getImageData: () => ({ data: new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]) }),
    }),
    toBlob: (resolve) => resolve(blob),
  };
}

/** A canvas of one flat colour: html2canvas produced nothing faithful. */
function blankCanvas() {
  return {
    width: 800,
    height: 1200,
    getContext: () => ({
      getImageData: () => ({ data: new Uint8ClampedArray(16) }),
    }),
    toBlob: (resolve) => resolve({ type: "image/png" }),
  };
}

/**
 * Load the content script the way parsing-fixtures.test.js loads parsing.js: a fresh
 * jsdom document, a hand-built vm context supplying exactly the globals a content
 * script sees, and no extension APIs beyond those.
 */
function load({
  url = QUESTION_URL,
  html = QUESTION_PAGE,
  html2canvas = async () => goodCanvas(),
  clipboardWrite = async () => {},
  clipboardItem = true,
  clipboardItemSupports,
} = {}) {
  const dom = new JSDOM(html, { url });
  const writes = [];
  const timers = [];

  const ctx = {
    console,
    Promise,
    Uint8ClampedArray,
    Error,
    TypeError,
    location: dom.window.location,
    document: dom.window.document,
    window: dom.window,
    html2canvas,
    navigator: {
      clipboard: {
        write: async (items) => {
          writes.push(items);
          return clipboardWrite(items);
        },
      },
    },
    setTimeout: (fn) => {
      timers.push(fn);
      return timers.length;
    },
  };
  if (clipboardItem) {
    ctx.ClipboardItem = class ClipboardItem {
      constructor(data) {
        this.data = data;
        this.types = Object.keys(data);
      }
    };
    if (clipboardItemSupports) ctx.ClipboardItem.supports = clipboardItemSupports;
  }
  ctx.globalThis = ctx;
  ctx.self = ctx;

  vm.runInNewContext(SOURCE, ctx);

  const run = () => vm.runInNewContext(SOURCE, ctx);
  const button = () => dom.window.document.querySelector(".pl-screenshot-btn");
  return {
    dom,
    doc: dom.window.document,
    writes,
    timers,
    run,
    button,
    buttons: () => Array.from(dom.window.document.querySelectorAll(".pl-screenshot-btn")),
    async click() {
      const btn = button();
      btn.click();
      return btn.plCapturePromise;
    },
    flushTimers() {
      const pending = timers.splice(0, timers.length);
      for (const fn of pending) fn();
    },
  };
}

// --- Requirement: Capture control placement -------------------------------------

test("the control is injected on an instance_question page, exactly once", () => {
  const page = load();
  assert.equal(page.buttons().length, 1);
  assert.equal(page.button().textContent, "Screenshot");
  assert.equal(page.button().dataset.plState, "resting");
});

test("the control is not injected on other PrairieLearn pages", () => {
  for (const url of [ASSESSMENT_URL, HOME_URL]) {
    const page = load({ url });
    assert.equal(page.buttons().length, 0, `no control expected on ${url}`);
  }
});

test("re-running the script does not inject a second control", () => {
  const page = load();
  page.run();
  page.run();
  assert.equal(page.buttons().length, 1);
});

test("the control coexists with a header another part of the extension already modified", () => {
  // Simulate home-content.js having injected its own control into the same header.
  const html = `<!doctype html><body>
    <div class="card question-block">
      <div class="card-header">
        <span class="qtitle">Question 3</span>
        <button class="btn pl-tracker-btn">Tracker</button>
      </div>
      <div class="card-body question-body">What is the value of x?</div>
    </div>
  </body>`;
  const page = load({ html });
  page.run();

  assert.equal(page.buttons().length, 1, "exactly one capture control exists");
  const sibling = page.doc.querySelector(".pl-tracker-btn");
  assert.ok(sibling, "the pre-existing control is left in place");
  assert.equal(sibling.textContent, "Tracker");
  assert.equal(page.doc.querySelectorAll(".card-header button").length, 2);
});

test("no question panel means no control and an otherwise unmodified page", () => {
  const html = `<!doctype html><body><main id="content"><p>Nothing recognisable here.</p></main></body>`;
  const before = new JSDOM(html, { url: QUESTION_URL }).window.document.body.innerHTML;
  const page = load({ html });

  assert.equal(page.buttons().length, 0);
  assert.equal(page.doc.body.innerHTML, before, "the DOM is left untouched");
});

// --- Requirement: Clipboard delivery and feedback --------------------------------

test("state sequence: disabled and capturing, then success, then back to resting", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const page = load({ html2canvas: async () => { await gate; return goodCanvas(); } });

  const btn = page.button();
  const pending = page.click();

  assert.equal(btn.disabled, true, "disabled while capture is under way");
  assert.equal(btn.textContent, "Capturing...");
  assert.equal(btn.dataset.plState, "capturing");

  release();
  assert.equal(await pending, "success");

  assert.equal(btn.textContent, "Copied!");
  assert.equal(btn.dataset.plState, "success");
  assert.equal(btn.disabled, false);
  assert.equal(page.writes.length, 1, "the PNG reached the clipboard");
  assert.deepEqual(Array.from(page.writes[0][0].types), ["image/png"]);

  page.flushTimers();
  assert.equal(btn.textContent, "Screenshot", "returns to its resting label");
  assert.equal(btn.dataset.plState, "resting");
});

test("a browser without ClipboardItem reports the unsupported case specifically", async () => {
  const page = load({ clipboardItem: false });
  assert.equal(await page.click(), "unsupported");

  const btn = page.button();
  assert.equal(btn.textContent, "No image clipboard");
  assert.match(btn.title, /cannot put images on the clipboard/);
  assert.equal(page.writes.length, 0);
});

test("a browser that rejects image/png reports the unsupported case specifically", async () => {
  const page = load({ clipboardItemSupports: (type) => type !== "image/png" });
  assert.equal(await page.click(), "unsupported");
  assert.equal(page.button().textContent, "No image clipboard");
  assert.equal(page.writes.length, 0);
});

test("a refused clipboard write is reported as a refusal, not as unsupported", async () => {
  const page = load({
    clipboardWrite: async () => {
      const error = new Error("Write permission denied.");
      error.name = "NotAllowedError";
      throw error;
    },
  });
  assert.equal(await page.click(), "refused");

  const btn = page.button();
  assert.equal(btn.textContent, "Clipboard refused");
  assert.match(btn.title, /refused/);
  assert.equal(btn.disabled, false);
});

test("a capture that throws is reported as a capture failure", async () => {
  const page = load({ html2canvas: async () => { throw new Error("rendering blew up"); } });
  assert.equal(await page.click(), "capture-failed");
  assert.equal(page.button().textContent, "Capture failed");
  assert.equal(page.writes.length, 0);
});

// --- Requirement: Captured image content -----------------------------------------

test("a blank capture reports an unfaithful capture and is never written to the clipboard", async () => {
  const page = load({ html2canvas: async () => blankCanvas() });
  assert.equal(await page.click(), "unfaithful");

  const btn = page.button();
  assert.equal(btn.textContent, "Capture unfaithful");
  assert.match(btn.title, /blank or malformed/);
  assert.equal(page.writes.length, 0, "nothing reaches the clipboard");

  page.flushTimers();
  assert.equal(btn.textContent, "Screenshot");
});

test("a zero-size canvas reports an unfaithful capture and is never written to the clipboard", async () => {
  const page = load({
    html2canvas: async () => ({ width: 0, height: 0, toBlob: (resolve) => resolve({}) }),
  });
  assert.equal(await page.click(), "unfaithful");
  assert.equal(page.writes.length, 0);
});

test("the panel, not the viewport, is captured and the scroll offset is compensated", async () => {
  let options;
  const page = load({
    html2canvas: async (element, opts) => { options = { element, ...opts }; return goodCanvas(); },
  });
  page.dom.window.scrollY = 640;
  assert.equal(await page.click(), "success");

  assert.equal(options.element.className, "card question-block", "the question panel is the capture target");
  assert.equal(options.scrollX, 0);
  assert.equal(options.scrollY, -640, "capture is aligned to the panel, not the scroll position");
  assert.equal(options.windowHeight, page.doc.documentElement.scrollHeight);
});

// --- Requirement: Browser support -------------------------------------------------

test("the Chrome and Firefox builds ship the same capture script", () => {
  assert.equal(
    fs.readFileSync("Chrome/question-content.js", "utf8"),
    fs.readFileSync("Firefox/question-content.js", "utf8"),
  );
});
