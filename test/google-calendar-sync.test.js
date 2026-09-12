const test = require("node:test");
const assert = require("node:assert/strict");
const { loadBackground } = require("./helpers/load-background");

const CALENDAR_TOKEN_KEY = "pl.google_calendar_token";
const CALENDAR_MAX_EVENTS = 100;
const BASE_NOW = new Date("2026-09-11T12:00:00Z").getTime();
const TEST_ACCESS_TOKEN = "ya29.secret_test_access_token_do_not_leak";

function makeItem(id, overrides = {}) {
  return {
    courseInstanceId: "101",
    courseLabel: "CS 225",
    title: `Assessment ${id}`,
    badge: `HW ${id}`,
    deadlineAt: "2026-09-15T18:00:00.000Z",
    deadlineSource: "visible_until",
    href: `https://us.prairielearn.com/pl/course_instance/101/assessment/${id}/`,
    status: "open",
    ...overrides,
  };
}

function makeDashboard(items) {
  return {
    meta: { origin: "https://us.prairielearn.com" },
    calendarItems: items,
  };
}

function assertNoDeleteCalls(fetchCalls) {
  const deleteCalls = fetchCalls.filter((call) => call.method === "DELETE");
  assert.equal(deleteCalls.length, 0, "No DELETE requests should ever be issued");
}

function assertNoTokenLeak(result, token = TEST_ACCESS_TOKEN) {
  const serialized = JSON.stringify(result);
  assert.equal(
    serialized.includes(token),
    false,
    `Result payload must not contain raw access token: ${token}`
  );
  if (Array.isArray(result.errors)) {
    for (const errorMsg of result.errors) {
      assert.equal(
        errorMsg.includes(token),
        false,
        `Error message must not contain raw access token: ${errorMsg}`
      );
    }
  }
}

// 1. First create — GET 404 then POST; assert created=1 and no PUT.
test("1. first create: GET 404 then POST; assert created=1 and no PUT", async () => {
  const item = makeItem("1");
  const dashboard = makeDashboard([item]);

  let expectedEventId = null;

  const harness = loadBackground({
    now: BASE_NOW,
    storage: {
      [CALENDAR_TOKEN_KEY]: {
        accessToken: TEST_ACCESS_TOKEN,
        expiresAt: BASE_NOW + 3600 * 1000,
      },
    },
    fetch: async (url, init) => {
      if (init.method === "GET") {
        return { status: 404, json: { error: { message: "Not Found", code: 404 } } };
      }
      if (init.method === "POST") {
        const parsedBody = JSON.parse(init.body);
        expectedEventId = parsedBody.id;
        return { status: 200, json: { ...parsedBody } };
      }
      throw new Error(`Unexpected HTTP method: ${init.method}`);
    },
  });

  const result = await harness.functions.syncGoogleCalendar(dashboard);

  // Assert counts
  assert.equal(result.created, 1);
  assert.equal(result.updated, 0);
  assert.equal(result.unchanged, 0);
  assert.equal(result.skipped, 0);
  assert.equal(result.failed, 0);
  assert.equal(result.errors.length, 0);

  // Assert HTTP call sequence
  const calls = harness.effects.fetchCalls;
  assert.equal(calls.length, 2);

  // Call 1: GET deterministic event ID -> 404
  assert.equal(calls[0].method, "GET");
  assert.ok(calls[0].url.includes("/calendars/primary/events/plv1"));
  assert.equal(calls[0].headers.Authorization, `Bearer ${TEST_ACCESS_TOKEN}`);

  // Call 2: POST to create event
  assert.equal(calls[1].method, "POST");
  assert.equal(
    calls[1].url,
    "https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=none"
  );
  assert.equal(calls[1].headers.Authorization, `Bearer ${TEST_ACCESS_TOKEN}`);

  // Assert no PUT was issued
  const putCalls = calls.filter((c) => c.method === "PUT");
  assert.equal(putCalls.length, 0, "First create must not issue a PUT request");

  assertNoDeleteCalls(calls);
  assertNoTokenLeak(result);
});

// 2. Repeat unchanged — GET 200 returning an event that already matches; assert unchanged=1
//    and that NO write request is issued at all.
test("2. repeat unchanged: GET 200 returning matching event; assert unchanged=1 and NO write request", async () => {
  const item = makeItem("2");
  const dashboard = makeDashboard([item]);

  const harness = loadBackground({
    now: BASE_NOW,
    storage: {
      [CALENDAR_TOKEN_KEY]: {
        accessToken: TEST_ACCESS_TOKEN,
        expiresAt: BASE_NOW + 3600 * 1000,
      },
    },
  });

  const expectedEvent = await harness.functions.buildGoogleCalendarEvent(
    item,
    "https://us.prairielearn.com"
  );
  assert.ok(expectedEvent);

  // Re-load background with scripted fetch returning the matching event on GET
  const syncHarness = loadBackground({
    now: BASE_NOW,
    storage: {
      [CALENDAR_TOKEN_KEY]: {
        accessToken: TEST_ACCESS_TOKEN,
        expiresAt: BASE_NOW + 3600 * 1000,
      },
    },
    fetchResponses: [
      {
        status: 200,
        json: {
          ...expectedEvent,
        },
      },
    ],
  });

  const result = await syncHarness.functions.syncGoogleCalendar(dashboard);

  // Assert counts
  assert.equal(result.unchanged, 1);
  assert.equal(result.created, 0);
  assert.equal(result.updated, 0);
  assert.equal(result.skipped, 0);
  assert.equal(result.failed, 0);
  assert.equal(result.errors.length, 0);

  // Assert exactly one GET was made and NO write request was issued
  const calls = syncHarness.effects.fetchCalls;
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "GET");
  assert.ok(calls[0].url.includes(encodeURIComponent(expectedEvent.id)));

  const writeCalls = calls.filter((c) => ["POST", "PUT", "PATCH", "DELETE"].includes(c.method));
  assert.equal(writeCalls.length, 0, "No write request may be issued when event matches");

  assertNoDeleteCalls(calls);
  assertNoTokenLeak(result);
});

// 3. Source update — GET 200 returning a tracker-owned event whose deadline/summary differs;
//    assert PUT and updated=1.
test("3. source update: GET 200 returning differing tracker event; assert PUT and updated=1", async () => {
  const item = makeItem("3", { title: "Updated Trees" });
  const dashboard = makeDashboard([item]);

  let putRequestBody = null;

  const harness = loadBackground({
    now: BASE_NOW,
    storage: {
      [CALENDAR_TOKEN_KEY]: {
        accessToken: TEST_ACCESS_TOKEN,
        expiresAt: BASE_NOW + 3600 * 1000,
      },
    },
    fetch: async (url, init) => {
      if (init.method === "GET") {
        // Return existing tracker-owned event with outdated summary and start/end
        return {
          status: 200,
          json: {
            summary: "Due: CS 225 · HW 3 · Old Assessment Title",
            description: "PrairieLearn assessment deadline.\nhttps://us.prairielearn.com/pl/course_instance/101/assessment/3/",
            source: {
              title: "PrairieLearn assessment",
              url: "https://us.prairielearn.com/pl/course_instance/101/assessment/3/",
            },
            start: { dateTime: "2026-09-14T17:45:00.000Z" },
            end: { dateTime: "2026-09-14T18:00:00.000Z" },
            extendedProperties: {
              private: {
                prairieLearnTracker: "v1",
                assessmentIdentity: "assessment-3-identity",
              },
            },
          },
        };
      }
      if (init.method === "PUT") {
        putRequestBody = JSON.parse(init.body);
        return { status: 200, json: { ...putRequestBody } };
      }
      throw new Error(`Unexpected HTTP method: ${init.method}`);
    },
  });

  const result = await harness.functions.syncGoogleCalendar(dashboard);

  // Assert counts
  assert.equal(result.updated, 1);
  assert.equal(result.created, 0);
  assert.equal(result.unchanged, 0);
  assert.equal(result.skipped, 0);
  assert.equal(result.failed, 0);
  assert.equal(result.errors.length, 0);

  // Assert HTTP call sequence: GET then PUT
  const calls = harness.effects.fetchCalls;
  assert.equal(calls.length, 2);
  assert.equal(calls[0].method, "GET");
  assert.equal(calls[1].method, "PUT");
  assert.ok(calls[1].url.includes("/calendars/primary/events/plv1"));
  assert.equal(calls[1].headers.Authorization, `Bearer ${TEST_ACCESS_TOKEN}`);

  // Assert updated content was sent in PUT
  assert.ok(putRequestBody);
  assert.equal(putRequestBody.summary, "Due: CS 225 · HW 3 · Updated Trees");

  assertNoDeleteCalls(calls);
  assertNoTokenLeak(result);
});

// 4. Insert race — GET 404, POST returns 409; assert the PUT fallback runs and the run is
//    counted as updated, not failed.
test("4. insert race: GET 404, POST 409 falls back to PUT; assert updated=1, not failed", async () => {
  const item = makeItem("4");
  const dashboard = makeDashboard([item]);

  let putCalled = false;

  const harness = loadBackground({
    now: BASE_NOW,
    storage: {
      [CALENDAR_TOKEN_KEY]: {
        accessToken: TEST_ACCESS_TOKEN,
        expiresAt: BASE_NOW + 3600 * 1000,
      },
    },
    fetch: async (url, init) => {
      if (init.method === "GET") {
        return { status: 404, json: { error: { message: "Not Found", code: 404 } } };
      }
      if (init.method === "POST") {
        return {
          status: 409,
          json: { error: { message: "The requested identifier already exists", code: 409 } },
        };
      }
      if (init.method === "PUT") {
        putCalled = true;
        return { status: 200, json: JSON.parse(init.body) };
      }
      throw new Error(`Unexpected HTTP method: ${init.method}`);
    },
  });

  const result = await harness.functions.syncGoogleCalendar(dashboard);

  // Assert counts: counted as updated, not failed
  assert.equal(result.updated, 1);
  assert.equal(result.failed, 0);
  assert.equal(result.created, 0);
  assert.equal(result.unchanged, 0);
  assert.equal(result.skipped, 0);
  assert.equal(result.errors.length, 0);
  assert.equal(putCalled, true);

  // Assert sequence: GET 404 -> POST 409 -> PUT 200
  const calls = harness.effects.fetchCalls;
  assert.equal(calls.length, 3);
  assert.equal(calls[0].method, "GET");
  assert.equal(calls[1].method, "POST");
  assert.equal(calls[2].method, "PUT");

  assertNoDeleteCalls(calls);
  assertNoTokenLeak(result);
});

// 5. Independent partial failure — one event fails while others succeed; assert the failure is
//    isolated, the remaining events still sync, and failed counts exactly the failing one.
test("5. independent partial failure: failure is isolated, remaining events sync, failed counts exactly 1", async () => {
  const itemA = makeItem("5A", { title: "Assessment 5A" });
  const itemB = makeItem("5B", { title: "Failing Assessment 5B" });
  const itemC = makeItem("5C", { title: "Assessment 5C" });
  const dashboard = makeDashboard([itemA, itemB, itemC]);

  const harness = loadBackground({
    now: BASE_NOW,
    storage: {
      [CALENDAR_TOKEN_KEY]: {
        accessToken: TEST_ACCESS_TOKEN,
        expiresAt: BASE_NOW + 3600 * 1000,
      },
    },
    fetch: async (url, init) => {
      // 5B fails on POST with a 500 server error
      if (url.includes("sendUpdates=none") && init.body && init.body.includes("Failing Assessment 5B")) {
        return {
          status: 500,
          json: { error: { message: "Internal server error on item 5B", code: 500 } },
        };
      }
      if (init.method === "GET") {
        return { status: 404, json: { error: { message: "Not Found", code: 404 } } };
      }
      if (init.method === "POST") {
        return { status: 200, json: JSON.parse(init.body) };
      }
      throw new Error(`Unexpected HTTP method: ${init.method}`);
    },
  });

  const result = await harness.functions.syncGoogleCalendar(dashboard);

  // Assert counts: 2 created, exactly 1 failed
  assert.equal(result.created, 2);
  assert.equal(result.failed, 1);
  assert.equal(result.updated, 0);
  assert.equal(result.unchanged, 0);
  assert.equal(result.skipped, 0);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /Failing Assessment 5B.*Internal server error on item 5B/i);

  // Assert that itemC was still processed after itemB failed
  const calls = harness.effects.fetchCalls;
  // itemA: GET + POST (2)
  // itemB: GET + POST (2)
  // itemC: GET + POST (2)
  assert.equal(calls.length, 6);

  assertNoDeleteCalls(calls);
  assertNoTokenLeak(result);
});

// 6. 401/403 token invalidation — the API rejects with 401 (and separately 403); assert the
//    stored token is invalidated, the message asks for reauthorization, and that interactive
//    authorization is not silently reopened.
test("6A. 401 token invalidation: stored token invalidated, error reports failure, no silent re-auth prompt", async () => {
  const item = makeItem("6A");
  const dashboard = makeDashboard([item]);

  const harness = loadBackground({
    now: BASE_NOW,
    storage: {
      [CALENDAR_TOKEN_KEY]: {
        accessToken: TEST_ACCESS_TOKEN,
        expiresAt: BASE_NOW + 3600 * 1000,
      },
    },
    fetchResponses: [
      {
        status: 401,
        json: { error: { message: "Invalid Credentials", code: 401 } },
      },
    ],
  });

  const result = await harness.functions.syncGoogleCalendar(dashboard);

  // Assert outcome
  assert.equal(result.failed, 1);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /Invalid Credentials/i);

  // Assert stored token is invalidated (removed from storage)
  const stored = await harness.chrome.storage.local.get(CALENDAR_TOKEN_KEY);
  assert.equal(stored[CALENDAR_TOKEN_KEY], undefined, "Token must be removed on 401");
  assert.ok(
    harness.effects.storageRemovals.some((r) =>
      r.keys === CALENDAR_TOKEN_KEY || (Array.isArray(r.keys) && r.keys.includes(CALENDAR_TOKEN_KEY))
    ),
    "Storage removal effect must be recorded"
  );

  // Assert non-interactive check returns null (user must explicitly reauthorize)
  const tokenAfter = await harness.functions.getCalendarToken(false);
  assert.equal(tokenAfter, null, "Stored token must not be available after 401 invalidation");

  // Assert interactive authorization is NOT silently reopened during sync
  assert.equal(
    harness.effects.launchWebAuthFlowCalls.length,
    0,
    "Interactive authorization must not be automatically launched"
  );

  assertNoDeleteCalls(harness.effects.fetchCalls);
  assertNoTokenLeak(result);
});

test("6B. 403 token invalidation: stored token invalidated, error reports failure, no silent re-auth prompt", async () => {
  const item = makeItem("6B");
  const dashboard = makeDashboard([item]);

  const harness = loadBackground({
    now: BASE_NOW,
    storage: {
      [CALENDAR_TOKEN_KEY]: {
        accessToken: TEST_ACCESS_TOKEN,
        expiresAt: BASE_NOW + 3600 * 1000,
      },
    },
    fetchResponses: [
      {
        status: 403,
        json: {
          error: {
            message: "The user has not granted event write access",
            code: 403,
          },
        },
      },
    ],
  });

  const result = await harness.functions.syncGoogleCalendar(dashboard);

  // Assert outcome
  assert.equal(result.failed, 1);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /not granted event write access/i);

  // Assert stored token is invalidated (removed from storage)
  const stored = await harness.chrome.storage.local.get(CALENDAR_TOKEN_KEY);
  assert.equal(stored[CALENDAR_TOKEN_KEY], undefined, "Token must be removed on 403");

  // Assert non-interactive check returns null
  const tokenAfter = await harness.functions.getCalendarToken(false);
  assert.equal(tokenAfter, null, "Stored token must not be available after 403 invalidation");

  // Assert interactive authorization is NOT silently reopened
  assert.equal(
    harness.effects.launchWebAuthFlowCalls.length,
    0,
    "Interactive authorization must not be automatically launched on 403"
  );

  assertNoDeleteCalls(harness.effects.fetchCalls);
  assertNoTokenLeak(result);
});

// 7. Non-tracker collision — an existing event at the same id that is NOT tracker-owned;
//    assert it is skipped and never overwritten, and that skipped reflects it. There is no
//    delete path — assert no DELETE request is ever issued in any test.
test("7. non-tracker collision: existing event not tracker-owned is never overwritten, and skipped reflects unbuildable items", async () => {
  // itemCollision: has an existing event in Google Calendar with a different/missing tracker flag
  const itemCollision = makeItem("7_collision", { title: "Collision Event" });
  // itemIneligible: has non-numeric courseInstanceId so buildGoogleCalendarEvent returns null -> skipped += 1
  const itemIneligible = makeItem("7_ineligible", {
    title: "Ineligible Event",
    courseInstanceId: "non_numeric_id",
  });
  const dashboard = makeDashboard([itemCollision, itemIneligible]);

  const harness = loadBackground({
    now: BASE_NOW,
    storage: {
      [CALENDAR_TOKEN_KEY]: {
        accessToken: TEST_ACCESS_TOKEN,
        expiresAt: BASE_NOW + 3600 * 1000,
      },
    },
    fetchResponses: [
      {
        status: 200,
        json: {
          id: "plv1-existing-foreign-id",
          summary: "User's Personal Birthday Party",
          description: "Not created by PrairieLearn Tracker",
          extendedProperties: {
            private: {
              prairieLearnTracker: "not-the-tracker",
            },
          },
        },
      },
    ],
  });

  const result = await harness.functions.syncGoogleCalendar(dashboard);

  // Assert existing non-tracker event is NEVER overwritten
  assert.equal(result.updated, 0, "Non-tracker collision must not update event");
  assert.equal(result.created, 0, "Non-tracker collision must not create new event");

  // In background.js, collision throws "A non-tracker event already owns this deterministic ID."
  // which records failure and error diagnostic, preventing any overwrite
  assert.equal(result.failed, 1);
  assert.match(result.errors[0], /non-tracker event already owns this deterministic ID/i);

  // itemIneligible buildGoogleCalendarEvent returned null, which increments skipped
  assert.equal(result.skipped, 1);

  // Assert NO write requests were issued (no PUT, POST, PATCH, or DELETE)
  const calls = harness.effects.fetchCalls;
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "GET");

  const writeCalls = calls.filter((c) => ["POST", "PUT", "PATCH", "DELETE"].includes(c.method));
  assert.equal(writeCalls.length, 0, "Never overwrite or delete non-tracker collisions");

  assertNoDeleteCalls(calls);
  assertNoTokenLeak(result);
});

// 8. Over-limit preflight — more eligible deadlines than CALENDAR_MAX_EVENTS; assert the
//    preflight reports the over-limit condition rather than partially writing.
test("8. over-limit preflight: exceeding CALENDAR_MAX_EVENTS stops preflight without partial writes", async () => {
  const overLimitCount = CALENDAR_MAX_EVENTS + 1; // 101 items
  const items = Array.from({ length: overLimitCount }, (_, i) => makeItem(`over_${i}`));
  const dashboard = makeDashboard(items);

  const harness = loadBackground({
    now: BASE_NOW,
    storage: {
      [CALENDAR_TOKEN_KEY]: {
        accessToken: TEST_ACCESS_TOKEN,
        expiresAt: BASE_NOW + 3600 * 1000,
      },
    },
    fetch: async () => {
      throw new Error("Fetch should NOT be called during over-limit preflight!");
    },
  });

  await assert.rejects(
    harness.functions.syncGoogleCalendar(dashboard),
    (err) => {
      assert.match(
        err.message,
        new RegExp(`Calendar sync stopped: ${overLimitCount} future published deadlines exceed the ${CALENDAR_MAX_EVENTS}-event safety limit\\.`, "i")
      );
      assertNoTokenLeak({ errors: [err.message] });
      return true;
    }
  );

  // Assert NO network calls were made at all (no partial writes)
  assert.equal(
    harness.effects.fetchCalls.length,
    0,
    "Over-limit condition must reject before making any HTTP requests"
  );
  assertNoDeleteCalls(harness.effects.fetchCalls);
});
