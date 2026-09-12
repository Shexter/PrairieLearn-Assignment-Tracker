const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { setTimeout: delay } = require("node:timers/promises");
const { JSDOM } = require("jsdom");

const source = fs.readFileSync("Chrome/assessment-content.js", "utf8");
const assessmentUrl =
  "https://us.prairielearn.com/pl/course_instance/42/assessment_instance/99";

function questionRow(id, title = `Question ${id}`) {
  return `<tr><td><a href="/pl/course_instance/42/instance_question/${id}">${title}</a></td></tr>`;
}

function groupRow(name) {
  return `<tr><th colspan="4">${name}</th></tr>`;
}

function assessmentPage(rows = "") {
  return `
    <div class="card-header bg-primary"><h1>Midterm One</h1></div>
    <table aria-label="Questions"><tbody>${rows}</tbody></table>
  `;
}

function encodedQuestion(text, answers = null) {
  const data = { variant: { params: { text, answers } } };
  const encoded = Buffer.from(encodeURIComponent(JSON.stringify(data)), "ascii").toString(
    "base64"
  );
  return `<div class="question-data">${encoded}</div>`;
}

function renderedQuestion(html) {
  return `<div class="question-body">${html}</div>`;
}

function response(html) {
  return { ok: true, status: 200, text: async () => html };
}

function createHarness({
  url = assessmentUrl,
  body = assessmentPage(),
  fetchImpl = async () => response(encodedQuestion("Question text")),
  writeText = async () => {},
} = {}) {
  const dom = new JSDOM(`<!doctype html><body>${body}</body>`, { url });
  const timers = [];
  const context = {
    document: dom.window.document,
    location: dom.window.location,
    DOMParser: dom.window.DOMParser,
    navigator: { clipboard: { writeText } },
    fetch: fetchImpl,
    atob: dom.window.atob.bind(dom.window),
    decodeURIComponent,
    setTimeout(callback) {
      timers.push(callback);
      return timers.length;
    },
    console,
  };

  function execute() {
    vm.runInNewContext(source, context);
  }

  execute();
  return {
    document: dom.window.document,
    execute,
    runTimers() {
      for (const callback of timers.splice(0)) callback();
    },
  };
}

async function waitFor(predicate, message = "condition was not reached") {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (predicate()) return;
    await delay(0);
  }
  assert.fail(message);
}

test("the export control is injected exactly once on an assessment instance", () => {
  const harness = createHarness({ body: assessmentPage(questionRow(1)) });

  harness.execute();

  const buttons = harness.document.querySelectorAll(".pl-copy-questions-btn");
  assert.equal(buttons.length, 1);
  assert.equal(buttons[0].textContent, "Copy Questions");
});

test("the export control is absent from every other PrairieLearn page type", () => {
  const otherPaths = [
    "/pl/course_instance/42",
    "/pl/course_instance/42/assessments",
    "/pl/course_instance/42/gradebook",
    "/pl/course_instance/42/instance_question/7",
  ];

  for (const path of otherPaths) {
    const harness = createHarness({
      url: `https://us.prairielearn.com${path}`,
      body: assessmentPage(questionRow(1)),
    });
    assert.equal(harness.document.querySelector(".pl-copy-questions-btn"), null, path);
  }
});

test("a missing questions table reports the condition without fetching", async () => {
  let fetchCount = 0;
  const harness = createHarness({
    body: '<div class="card-header bg-primary"><h1>Midterm One</h1></div>',
    fetchImpl: async () => {
      fetchCount++;
      return response("");
    },
  });
  const button = harness.document.querySelector(".pl-copy-questions-btn");

  button.click();
  await waitFor(() => button.textContent === "No questions found");

  assert.equal(fetchCount, 0);
  assert.equal(button.disabled, false);
  harness.runTimers();
  assert.equal(button.textContent, "Copy Questions");
});

test("the transcript preserves title, groups, numbering, answers, images, and DOM fallback", async () => {
  const rows = [
    groupRow("Warm-up"),
    questionRow(1, "Image question"),
    groupRow("Challenge"),
    questionRow(2, "Locked question"),
  ].join("");
  const pages = new Map([
    [
      "/pl/course_instance/42/instance_question/1",
      encodedQuestion("<p>Choose <img src='/plot.png'> now.</p>", [
        { key: "A", text: "First option" },
        { key: "B", text: "Second option" },
      ]),
    ],
    [
      "/pl/course_instance/42/instance_question/2",
      renderedQuestion("<p>Locked body text</p><input value='noise'><button>Submit</button>"),
    ],
  ]);
  const writes = [];
  const harness = createHarness({
    body: assessmentPage(rows),
    fetchImpl: async (url) => response(pages.get(new URL(url).pathname)),
    writeText: async (text) => writes.push(text),
  });
  const button = harness.document.querySelector(".pl-copy-questions-btn");

  button.click();
  await waitFor(() => button.textContent === "Copy to clipboard");
  assert.equal(writes.length, 0, "retrieval must not consume the clipboard gesture");

  button.click();
  await waitFor(() => writes.length === 1);

  const transcript = writes[0];
  assert.equal(
    transcript,
    [
      "=== Midterm One ===",
      "",
      "[Warm-up]",
      "",
      "Q1. Image question",
      "Choose [image] now.",
      "",
      "  A) First option",
      "  B) Second option",
      "",
      "[Challenge]",
      "",
      "Q2. Locked question",
      "Locked body text",
    ].join("\n")
  );
  assert.ok(transcript.indexOf("[Warm-up]") < transcript.indexOf("Q1. Image question"));
  assert.ok(transcript.indexOf("[Challenge]") < transcript.indexOf("Q2. Locked question"));
  assert.match(transcript, /Choose \[image\] now\./);
  assert.match(transcript, /  A\) First option\n  B\) Second option/);
  assert.match(transcript, /Q2\. Locked question\nLocked body text/);
  assert.doesNotMatch(transcript, /Submit|noise/);
});

test("retrieval is scoped, fetches once, reports progress, and never exceeds five in flight", async () => {
  const questionCount = 12;
  const rows = Array.from({ length: questionCount }, (_, index) => questionRow(index + 1)).join(
    ""
  );
  const calls = [];
  const pending = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const harness = createHarness({
    body: assessmentPage(rows),
    fetchImpl(url) {
      calls.push(url);
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      return new Promise((resolve) => {
        pending.push(() => {
          inFlight--;
          resolve(response(encodedQuestion(`Body for ${new URL(url).pathname}`)));
        });
      });
    },
  });
  const button = harness.document.querySelector(".pl-copy-questions-btn");

  button.click();
  await waitFor(() => calls.length === 5);
  assert.equal(button.disabled, true);
  button.click();
  assert.equal(calls.length, 5, "a disabled control cannot start a second export");

  pending.splice(0, 5).forEach((resolve) => resolve());
  await waitFor(() => calls.length === 10);
  assert.equal(button.textContent, "Copying... (5/12)");

  pending.splice(0, 5).forEach((resolve) => resolve());
  await waitFor(() => calls.length === 12);
  pending.splice(0).forEach((resolve) => resolve());
  await waitFor(() => button.textContent === "Copy to clipboard");

  assert.equal(maxInFlight, 5);
  assert.equal(calls.length, questionCount);
  assert.equal(new Set(calls).size, questionCount);
  for (let id = 1; id <= questionCount; id++) {
    assert.ok(
      calls.includes(`https://us.prairielearn.com/pl/course_instance/42/instance_question/${id}`)
    );
  }
});

test("one failed question is marked unavailable without dropping successful questions", async () => {
  const rows = [questionRow(1), questionRow(2), questionRow(3)].join("");
  const writes = [];
  const harness = createHarness({
    body: assessmentPage(rows),
    fetchImpl: async (url) => {
      const id = Number(new URL(url).pathname.split("/").pop());
      if (id === 2) throw new Error("network unavailable");
      return response(encodedQuestion(`<p>Readable ${id}</p>`));
    },
    writeText: async (text) => writes.push(text),
  });
  const button = harness.document.querySelector(".pl-copy-questions-btn");

  button.click();
  await waitFor(() => button.textContent === "Copy to clipboard");
  button.click();
  await waitFor(() => writes.length === 1);

  assert.match(writes[0], /Q1\. Question 1\nReadable 1/);
  assert.match(writes[0], /Q2\. Question 2\n\[question content unavailable\]/);
  assert.match(writes[0], /Q3\. Question 3\nReadable 3/);
});

test("total retrieval failure reports an error instead of offering an empty transcript", async () => {
  let writeCount = 0;
  const harness = createHarness({
    body: assessmentPage(questionRow(1) + questionRow(2)),
    fetchImpl: async () => {
      throw new Error("offline");
    },
    writeText: async () => {
      writeCount++;
    },
  });
  const button = harness.document.querySelector(".pl-copy-questions-btn");

  button.click();
  await waitFor(() => button.textContent === "Failed: no question content available");

  assert.equal(writeCount, 0);
  assert.equal(button.disabled, false);
  harness.runTimers();
  assert.equal(button.textContent, "Copy Questions");
});

test("clipboard refusal reports its reason and retries without repeating network work", async () => {
  let fetchCount = 0;
  let writeCount = 0;
  const harness = createHarness({
    body: assessmentPage(questionRow(1)),
    fetchImpl: async () => {
      fetchCount++;
      return response(encodedQuestion("Ready text"));
    },
    writeText: async () => {
      writeCount++;
      if (writeCount === 1) {
        const error = new Error("Permission denied by browser");
        error.name = "NotAllowedError";
        throw error;
      }
    },
  });
  const button = harness.document.querySelector(".pl-copy-questions-btn");

  button.click();
  await waitFor(() => button.textContent === "Copy to clipboard");
  assert.equal(fetchCount, 1);

  button.click();
  await waitFor(() => button.textContent.startsWith("Copy failed:"));
  assert.match(button.textContent, /NotAllowedError: Permission denied by browser/);
  assert.equal(button.disabled, false);
  assert.equal(fetchCount, 1);

  harness.runTimers();
  assert.equal(button.textContent, "Copy to clipboard");
  button.click();
  await waitFor(() => button.textContent === "Copied!");
  assert.equal(writeCount, 2);
  assert.equal(fetchCount, 1, "the retrieved transcript must remain in memory for retry");

  harness.runTimers();
  assert.equal(button.textContent, "Copy Questions");
});
