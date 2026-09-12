// Offscreen document: gives the Chrome MV3 service worker a DOM to parse
// PrairieLearn HTML with. The worker fetches (it holds the cookies and host
// permissions) and sends the raw HTML here; we parse and send back plain JSON.

const OFFSCREEN_TARGET = "pl-tracker-offscreen";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // Only handle messages addressed to us; everything else belongs to the
  // service worker. Returning undefined leaves those channels alone.
  if (!message || typeof message !== "object" || message.target !== OFFSCREEN_TARGET) {
    return;
  }

  try {
    const parsing = globalThis.PrairieLearnTrackerParsing;
    if (!parsing) {
      throw new Error("Parsing helpers failed to load in the offscreen document.");
    }

    if (message.op === "PARSE_ASSESSMENTS") {
      const data = parsing.parseAssessmentsHtml(message.html, message.context);
      sendResponse({ ok: true, data });
      return;
    }

    if (message.op === "EXTRACT_COURSE_INSTANCE_IDS") {
      const data = parsing.extractCourseInstanceIdsFromHomeHtml(message.html);
      sendResponse({ ok: true, data });
      return;
    }

    sendResponse({ ok: false, error: `Unsupported offscreen op: ${message.op}` });
  } catch (error) {
    sendResponse({ ok: false, error: error?.message || String(error) });
  }
});
