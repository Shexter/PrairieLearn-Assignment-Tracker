const test = require("node:test");
const assert = require("node:assert/strict");
const { loadBackground } = require("./helpers/load-background");

test("background harness loads the production script and captures listeners", () => {
  const harness = loadBackground({ now: "2026-09-11T12:00:00Z" });

  assert.equal(typeof harness.functions.getCalendarToken, "function");
  assert.equal(typeof harness.functions.syncGoogleCalendar, "function");
  assert.equal(typeof harness.context.PrairieLearnTrackerParsing, "object");
  assert.equal(harness.effects.messageListeners.length, 1);
  assert.equal(typeof harness.effects.messageListeners[0], "function");
});

test("background harness records scripted fetches", async () => {
  const harness = loadBackground({
    fetchResponses: [{ status: 200, json: { id: "event-1" } }],
  });

  const result = await harness.functions.calendarApiRequest(
    "/calendars/primary/events/event-1",
    { method: "PUT", headers: { "X-Harness": "yes" }, body: "{\"summary\":\"Test\"}" },
    "test-token"
  );

  assert.equal(result.id, "event-1");
  assert.equal(harness.effects.fetchCalls.length, 1);
  const [call] = harness.effects.fetchCalls;
  assert.equal(call.url, "https://www.googleapis.com/calendar/v3/calendars/primary/events/event-1");
  assert.equal(call.method, "PUT");
  assert.equal(call.headers.Authorization, "Bearer test-token");
  assert.equal(call.headers["X-Harness"], "yes");
  assert.equal(call.body, "{\"summary\":\"Test\"}");
});

test("background harness storage mock round-trips and records reads and writes", async () => {
  const harness = loadBackground();
  const value = { accessToken: "stored-token", expiresAt: 12345 };

  await harness.chrome.storage.local.set({ "pl.google_calendar_token": value });
  const result = await harness.chrome.storage.local.get("pl.google_calendar_token");

  assert.equal(result["pl.google_calendar_token"].accessToken, "stored-token");
  assert.equal(result["pl.google_calendar_token"].expiresAt, 12345);
  assert.equal(harness.effects.storageWrites.length, 1);
  assert.equal(harness.effects.storageReads.length, 1);
  assert.equal(harness.effects.storageReads[0].keys, "pl.google_calendar_token");
});

