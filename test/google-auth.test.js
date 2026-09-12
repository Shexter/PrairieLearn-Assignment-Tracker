const test = require("node:test");
const assert = require("node:assert/strict");
const { loadBackground } = require("./helpers/load-background");

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const CALENDAR_TOKEN_KEY = "pl.google_calendar_token";
const TEST_CLIENT_ID = "test-tracker-client-id.apps.googleusercontent.com";
const BASE_NOW = new Date("2026-09-11T12:00:00Z").getTime();

// 1. Success — launchWebAuthFlow returns a redirect URL carrying a token, the matching state,
// and the calendar scope; assert the token is returned and persisted with its expiry.
test("1. success: returns access token and persists token with expiry in Chrome and Firefox", async () => {
  // Case 1A: Chrome environment (chromiumapp.org redirect)
  {
    const harness = loadBackground({
      googleClientId: TEST_CLIENT_ID,
      now: BASE_NOW,
      chrome: {
        identity: {
          getRedirectURL: () => "https://abcdefghijklmnopqrstuvwxyz123456.chromiumapp.org/",
          launchWebAuthFlow: async (details) => {
            const authUrl = new URL(details.url);
            const state = authUrl.searchParams.get("state");
            return `https://abcdefghijklmnopqrstuvwxyz123456.chromiumapp.org/#access_token=ya29.chrome_auth_success_token&expires_in=3600&token_type=Bearer&state=${encodeURIComponent(state)}&scope=${encodeURIComponent(CALENDAR_SCOPE)}`;
          },
        },
      },
    });

    const token = await harness.functions.getCalendarToken(true);
    assert.equal(token, "ya29.chrome_auth_success_token");

    const stored = await harness.chrome.storage.local.get(CALENDAR_TOKEN_KEY);
    const record = stored[CALENDAR_TOKEN_KEY];
    assert.ok(record, "Token record must be persisted in storage");
    assert.equal(record.accessToken, "ya29.chrome_auth_success_token");
    assert.equal(record.expiresAt, BASE_NOW + 3600 * 1000);
    assert.equal(harness.effects.launchWebAuthFlowCalls.length, 1);
  }

  // Case 1B: Firefox environment (extensions.allizom.org redirect)
  {
    const harness = loadBackground({
      googleClientId: TEST_CLIENT_ID,
      now: BASE_NOW,
      browser: {
        identity: {
          getRedirectURL: () => "https://5a9b7c8d-1234-5678-9abc-def012345678.extensions.allizom.org/",
          launchWebAuthFlow: async (details) => {
            const authUrl = new URL(details.url);
            const state = authUrl.searchParams.get("state");
            return `https://5a9b7c8d-1234-5678-9abc-def012345678.extensions.allizom.org/#access_token=ya29.firefox_auth_success_token&expires_in=7200&token_type=Bearer&state=${encodeURIComponent(state)}&scope=${encodeURIComponent(CALENDAR_SCOPE)}`;
          },
        },
      },
    });

    const token = await harness.functions.getCalendarToken(true);
    assert.equal(token, "ya29.firefox_auth_success_token");

    const stored = await harness.chrome.storage.local.get(CALENDAR_TOKEN_KEY);
    const record = stored[CALENDAR_TOKEN_KEY];
    assert.ok(record, "Token record must be persisted in Firefox storage");
    assert.equal(record.accessToken, "ya29.firefox_auth_success_token");
    assert.equal(record.expiresAt, BASE_NOW + 7200 * 1000);
  }
});

// 2. Cancellation — the user dismisses the flow (launchWebAuthFlow rejects or resolves with no URL);
// assert a clear cancellation diagnostic and that NO token is stored.
test("2. cancellation: dismissal produces clear diagnostic and stores no token", async () => {
  const SENSITIVE_TOKEN = "ya29.secret_token_never_to_be_stored";

  // Case 2A: launchWebAuthFlow resolves with null / undefined (window dismissed)
  {
    const harness = loadBackground({
      googleClientId: TEST_CLIENT_ID,
      now: BASE_NOW,
      chrome: {
        identity: {
          launchWebAuthFlow: async () => null,
        },
      },
    });

    await assert.rejects(
      harness.functions.getCalendarToken(true),
      (err) => {
        assert.match(err.message, /cancelled/i);
        assert.equal(err.message.includes(SENSITIVE_TOKEN), false);
        return true;
      }
    );

    const stored = await harness.chrome.storage.local.get(CALENDAR_TOKEN_KEY);
    assert.equal(stored[CALENDAR_TOKEN_KEY], undefined);
  }

  // Case 2B: launchWebAuthFlow rejects (e.g. user closed window in Chrome/Firefox)
  {
    const harness = loadBackground({
      googleClientId: TEST_CLIENT_ID,
      now: BASE_NOW,
      chrome: {
        identity: {
          launchWebAuthFlow: async () => {
            throw new Error("The user cancelled the authorization flow.");
          },
        },
      },
    });

    await assert.rejects(
      harness.functions.getCalendarToken(true),
      (err) => {
        assert.match(err.message, /cancelled/i);
        assert.equal(err.message.includes(SENSITIVE_TOKEN), false);
        return true;
      }
    );

    const stored = await harness.chrome.storage.local.get(CALENDAR_TOKEN_KEY);
    assert.equal(stored[CALENDAR_TOKEN_KEY], undefined);
  }
});

// 3. Missing configuration — PL_GOOGLE_CLIENT_ID unset; assert it fails closed with an
// actionable message and never calls launchWebAuthFlow.
test("3. missing configuration: unset or placeholder client ID fails closed without calling launchWebAuthFlow", async () => {
  // Case 3A: PL_GOOGLE_CLIENT_ID is unset
  {
    const harness = loadBackground({
      now: BASE_NOW,
    });
    delete harness.context.PL_GOOGLE_CLIENT_ID;

    assert.equal(harness.functions.getGoogleClientId(), "");
    await assert.rejects(
      harness.functions.getCalendarToken(true),
      (err) => {
        assert.match(err.message, /Google Calendar is not configured for this build/i);
        assert.match(err.message, /Download the calendar file instead/i);
        return true;
      }
    );

    assert.equal(harness.effects.launchWebAuthFlowCalls.length, 0);
    const stored = await harness.chrome.storage.local.get(CALENDAR_TOKEN_KEY);
    assert.equal(stored[CALENDAR_TOKEN_KEY], undefined);
  }

  // Case 3B: PL_GOOGLE_CLIENT_ID is the placeholder template string
  {
    const harness = loadBackground({
      now: BASE_NOW,
    });
    harness.context.PL_GOOGLE_CLIENT_ID = "YOUR_PUBLIC_GOOGLE_CLIENT_ID.apps.googleusercontent.com";

    assert.equal(harness.functions.getGoogleClientId(), "");
    await assert.rejects(
      harness.functions.getCalendarToken(true),
      (err) => {
        assert.match(err.message, /Google Calendar is not configured for this build/i);
        assert.match(err.message, /Download the calendar file instead/i);
        return true;
      }
    );

    assert.equal(harness.effects.launchWebAuthFlowCalls.length, 0);
    const stored = await harness.chrome.storage.local.get(CALENDAR_TOKEN_KEY);
    assert.equal(stored[CALENDAR_TOKEN_KEY], undefined);
  }
});

// 4. Missing identity API — the browser exposes no identity.launchWebAuthFlow /
// getRedirectURL; assert the specific "download the calendar file instead" style failure.
test("4. missing identity API: missing launchWebAuthFlow or getRedirectURL fails with calendar-file guidance", async () => {
  // Case 4A: identity namespace completely missing
  {
    const harness = loadBackground({
      googleClientId: TEST_CLIENT_ID,
      now: BASE_NOW,
      browser: false,
    });
    harness.chrome.identity = null;

    await assert.rejects(
      harness.functions.getCalendarToken(true),
      (err) => {
        assert.match(err.message, /This browser does not expose the extension identity API/i);
        assert.match(err.message, /Download the calendar file instead/i);
        return true;
      }
    );

    const stored = await harness.chrome.storage.local.get(CALENDAR_TOKEN_KEY);
    assert.equal(stored[CALENDAR_TOKEN_KEY], undefined);
  }

  // Case 4B: identity.launchWebAuthFlow is undefined
  {
    const harness = loadBackground({
      googleClientId: TEST_CLIENT_ID,
      now: BASE_NOW,
      browser: false,
    });
    delete harness.chrome.identity.launchWebAuthFlow;

    await assert.rejects(
      harness.functions.getCalendarToken(true),
      (err) => {
        assert.match(err.message, /This browser does not expose the extension identity API/i);
        assert.match(err.message, /Download the calendar file instead/i);
        return true;
      }
    );

    const stored = await harness.chrome.storage.local.get(CALENDAR_TOKEN_KEY);
    assert.equal(stored[CALENDAR_TOKEN_KEY], undefined);
  }

  // Case 4C: identity.getRedirectURL is undefined
  {
    const harness = loadBackground({
      googleClientId: TEST_CLIENT_ID,
      now: BASE_NOW,
      browser: false,
    });
    delete harness.chrome.identity.getRedirectURL;

    await assert.rejects(
      harness.functions.getCalendarToken(true),
      (err) => {
        assert.match(err.message, /This browser does not expose the extension identity API/i);
        assert.match(err.message, /Download the calendar file instead/i);
        return true;
      }
    );

    const stored = await harness.chrome.storage.local.get(CALENDAR_TOKEN_KEY);
    assert.equal(stored[CALENDAR_TOKEN_KEY], undefined);
  }
});

// 5. Redirect mismatch — getRedirectURL returns an unsupported origin; assert normalization
// rejects it and that no fabricated extension-ID fallback is used.
test("5. redirect mismatch: unsupported redirect origin is rejected without fabricated fallback", async () => {
  const RAW_TOKEN = "ya29.sensitive_token_forbidden";

  // Case 5A: normalizeIdentityRedirect rejects unsupported origins directly
  {
    const harness = loadBackground();
    assert.throws(
      () => harness.functions.normalizeIdentityRedirect("https://attacker.evil.com/callback"),
      /unsupported redirect URI/i
    );
    assert.throws(
      () => harness.functions.normalizeIdentityRedirect("http://myext.chromiumapp.org/"),
      /unsupported redirect URI/i
    );
    assert.throws(
      () => harness.functions.normalizeIdentityRedirect("https://fabricated.chromiumapp.org.evil.com/"),
      /unsupported redirect URI/i
    );
    assert.throws(
      () => harness.functions.normalizeIdentityRedirect(""),
      /redirect URI is unavailable/i
    );
    assert.throws(
      () => harness.functions.normalizeIdentityRedirect("not-a-url"),
      /invalid redirect URI/i
    );
  }

  // Case 5B: getCalendarToken fails when getRedirectURL returns unsupported origin; no flow launched
  {
    const harness = loadBackground({
      googleClientId: TEST_CLIENT_ID,
      now: BASE_NOW,
      chrome: {
        identity: {
          getRedirectURL: () => "https://attacker.evil.com/callback",
          launchWebAuthFlow: async () => `https://attacker.evil.com/callback#access_token=${RAW_TOKEN}`,
        },
      },
    });

    await assert.rejects(
      harness.functions.getCalendarToken(true),
      (err) => {
        assert.match(err.message, /unsupported redirect URI/i);
        assert.equal(err.message.includes(RAW_TOKEN), false);
        return true;
      }
    );

    assert.equal(harness.effects.launchWebAuthFlowCalls.length, 0);
    const stored = await harness.chrome.storage.local.get(CALENDAR_TOKEN_KEY);
    assert.equal(stored[CALENDAR_TOKEN_KEY], undefined);
  }

  // Case 5C: responseUrl origin diverges from browser redirectUri origin
  {
    const harness = loadBackground({
      googleClientId: TEST_CLIENT_ID,
      now: BASE_NOW,
      chrome: {
        identity: {
          getRedirectURL: () => "https://test-extension.chromiumapp.org/",
          launchWebAuthFlow: async (details) => {
            const authUrl = new URL(details.url);
            const state = authUrl.searchParams.get("state");
            return `https://phishing.site.com/#access_token=${RAW_TOKEN}&state=${state}&scope=${encodeURIComponent(CALENDAR_SCOPE)}&expires_in=3600`;
          },
        },
      },
    });

    await assert.rejects(
      harness.functions.getCalendarToken(true),
      (err) => {
        assert.match(err.message, /unexpected redirect/i);
        assert.equal(err.message.includes(RAW_TOKEN), false);
        return true;
      }
    );

    const stored = await harness.chrome.storage.local.get(CALENDAR_TOKEN_KEY);
    assert.equal(stored[CALENDAR_TOKEN_KEY], undefined);
  }
});

// 6. State mismatch — the returned state does not equal the generated state; assert the token
// is rejected and not stored (this is the CSRF guard; it must fail hard).
test("6. state mismatch: CSRF validation failure rejects token and stores nothing", async () => {
  const CSRF_TOKEN = "ya29.csrf_injected_attacker_token";

  // Case 6A: Tampered state value
  {
    const harness = loadBackground({
      googleClientId: TEST_CLIENT_ID,
      now: BASE_NOW,
      chrome: {
        identity: {
          getRedirectURL: () => "https://test-extension.chromiumapp.org/",
          launchWebAuthFlow: async () => {
            return `https://test-extension.chromiumapp.org/#access_token=${CSRF_TOKEN}&expires_in=3600&token_type=Bearer&state=forged_state_value_67890&scope=${encodeURIComponent(CALENDAR_SCOPE)}`;
          },
        },
      },
    });

    await assert.rejects(
      harness.functions.getCalendarToken(true),
      (err) => {
        assert.match(err.message, /state validation failed/i);
        assert.equal(err.message.includes(CSRF_TOKEN), false, "Raw token must not appear in error message");
        return true;
      }
    );

    const stored = await harness.chrome.storage.local.get(CALENDAR_TOKEN_KEY);
    assert.equal(stored[CALENDAR_TOKEN_KEY], undefined, "Token must not be stored on state mismatch");
  }

  // Case 6B: Missing state parameter in redirect fragment
  {
    const harness = loadBackground({
      googleClientId: TEST_CLIENT_ID,
      now: BASE_NOW,
      chrome: {
        identity: {
          getRedirectURL: () => "https://test-extension.chromiumapp.org/",
          launchWebAuthFlow: async () => {
            return `https://test-extension.chromiumapp.org/#access_token=${CSRF_TOKEN}&expires_in=3600&token_type=Bearer&scope=${encodeURIComponent(CALENDAR_SCOPE)}`;
          },
        },
      },
    });

    await assert.rejects(
      harness.functions.getCalendarToken(true),
      (err) => {
        assert.match(err.message, /state validation failed/i);
        assert.equal(err.message.includes(CSRF_TOKEN), false);
        return true;
      }
    );

    const stored = await harness.chrome.storage.local.get(CALENDAR_TOKEN_KEY);
    assert.equal(stored[CALENDAR_TOKEN_KEY], undefined);
  }
});

// 7. Missing scope — the granted scope omits the calendar scope; assert rejection with a
// scope-specific message and no stored token.
test("7. missing scope: omitting calendar events scope rejects authorization and stores nothing", async () => {
  const UNPRIVILEGED_TOKEN = "ya29.scope_limited_token_xyz";

  // Case 7A: Non-calendar scopes returned (e.g. openid, profile, email)
  {
    const harness = loadBackground({
      googleClientId: TEST_CLIENT_ID,
      now: BASE_NOW,
      chrome: {
        identity: {
          getRedirectURL: () => "https://test-extension.chromiumapp.org/",
          launchWebAuthFlow: async (details) => {
            const authUrl = new URL(details.url);
            const state = authUrl.searchParams.get("state");
            return `https://test-extension.chromiumapp.org/#access_token=${UNPRIVILEGED_TOKEN}&expires_in=3600&token_type=Bearer&state=${encodeURIComponent(state)}&scope=${encodeURIComponent("openid profile email")}`;
          },
        },
      },
    });

    await assert.rejects(
      harness.functions.getCalendarToken(true),
      (err) => {
        assert.match(err.message, /did not grant calendar event access/i);
        assert.equal(err.message.includes(UNPRIVILEGED_TOKEN), false, "Raw token must not appear in error message");
        return true;
      }
    );

    const stored = await harness.chrome.storage.local.get(CALENDAR_TOKEN_KEY);
    assert.equal(stored[CALENDAR_TOKEN_KEY], undefined, "Token must not be stored on missing scope");
  }

  // Case 7B: Empty scope parameter in response
  {
    const harness = loadBackground({
      googleClientId: TEST_CLIENT_ID,
      now: BASE_NOW,
      chrome: {
        identity: {
          getRedirectURL: () => "https://test-extension.chromiumapp.org/",
          launchWebAuthFlow: async (details) => {
            const authUrl = new URL(details.url);
            const state = authUrl.searchParams.get("state");
            return `https://test-extension.chromiumapp.org/#access_token=${UNPRIVILEGED_TOKEN}&expires_in=3600&token_type=Bearer&state=${encodeURIComponent(state)}&scope=`;
          },
        },
      },
    });

    await assert.rejects(
      harness.functions.getCalendarToken(true),
      (err) => {
        assert.match(err.message, /did not grant calendar event access/i);
        assert.equal(err.message.includes(UNPRIVILEGED_TOKEN), false);
        return true;
      }
    );

    const stored = await harness.chrome.storage.local.get(CALENDAR_TOKEN_KEY);
    assert.equal(stored[CALENDAR_TOKEN_KEY], undefined);
  }
});

// 8. Expiry — a stored token whose expiry has passed; assert it is removed and reported, and
// that interactive authorization is NOT reopened automatically (task 5.4's rule).
// Drive the clock through the harness so expiry is deterministic; never sleep.
// Assert that no test's failure message or stored record contains a raw access token.
test("8. expiry: expired or rejected token is removed, reported, and never re-prompts interactively", async () => {
  const EXPIRED_TOKEN = "ya29.raw_expired_secret_token_12345";
  const INITIAL_NOW = BASE_NOW;

  // Case 8A: Deterministic clock advance past expiry ensures non-interactive call returns null
  // and never calls launchWebAuthFlow.
  {
    const harness = loadBackground({
      googleClientId: TEST_CLIENT_ID,
      now: INITIAL_NOW,
      storage: {
        [CALENDAR_TOKEN_KEY]: {
          accessToken: EXPIRED_TOKEN,
          expiresAt: INITIAL_NOW + 120 * 1000, // Expires in 2 minutes
        },
      },
      chrome: {
        identity: {
          getRedirectURL: () => "https://test-extension.chromiumapp.org/",
          launchWebAuthFlow: async () => {
            throw new Error("Interactive authorization must not be called automatically!");
          },
        },
      },
    });

    // While valid (more than 60s remaining buffer): returns stored token without interactive prompt
    const initialToken = await harness.functions.getCalendarToken(false);
    assert.equal(initialToken, EXPIRED_TOKEN);
    assert.equal(harness.effects.launchWebAuthFlowCalls.length, 0);

    // Advance the mock clock past expiry without sleeping
    harness.clock.now = INITIAL_NOW + 300 * 1000; // 5 minutes later

    // Non-interactive call after expiry returns null and does NOT launchWebAuthFlow
    const expiredToken = await harness.functions.getCalendarToken(false);
    assert.equal(expiredToken, null);
    assert.equal(harness.effects.launchWebAuthFlowCalls.length, 0, "Non-interactive call must not reopen auth");
  }

  // Case 8B: When Google Calendar API rejects an expired/invalid token (401 / 403),
  // syncGoogleCalendar removes the token from storage, reports the failure, and does NOT
  // launch interactive auth automatically.
  {
    const harness = loadBackground({
      googleClientId: TEST_CLIENT_ID,
      now: INITIAL_NOW,
      storage: {
        [CALENDAR_TOKEN_KEY]: {
          accessToken: EXPIRED_TOKEN,
          expiresAt: INITIAL_NOW + 3600 * 1000,
        },
      },
      fetchResponses: [
        {
          status: 401,
          json: {
            error: {
              code: 401,
              message: "Request had invalid authentication credentials. Expected OAuth 2 access token.",
              status: "UNAUTHENTICATED",
            },
          },
        },
      ],
      chrome: {
        identity: {
          getRedirectURL: () => "https://test-extension.chromiumapp.org/",
          launchWebAuthFlow: async () => {
            throw new Error("Interactive prompt must NOT be reopened automatically on 401 token expiry!");
          },
        },
      },
    });

    const dashboard = {
      calendarItems: [
        {
          courseInstanceId: "101",
          courseLabel: "CS 101",
          title: "Assessment 1",
          deadlineAt: new Date(INITIAL_NOW + 86400000).toISOString(),
          deadlineSource: "visible_until",
          href: "https://us.prairielearn.com/pl/course_instance/101/assessment/1/",
          status: "open",
        },
      ],
    };

    const result = await harness.functions.syncGoogleCalendar(dashboard, { origin: "https://us.prairielearn.com" });

    // Assert reported failure
    assert.equal(result.failed, 1);
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0], /invalid authentication credentials/i);

    // Assert raw token is NOT in the error diagnostic
    assert.equal(result.errors[0].includes(EXPIRED_TOKEN), false, "Error report must not contain raw access token");

    // Assert token is removed from storage
    const stored = await harness.chrome.storage.local.get(CALENDAR_TOKEN_KEY);
    assert.equal(stored[CALENDAR_TOKEN_KEY], undefined, "Expired/invalid token must be removed from storage");
    assert.ok(
      harness.effects.storageRemovals.some((r) => r.keys === CALENDAR_TOKEN_KEY || (Array.isArray(r.keys) && r.keys.includes(CALENDAR_TOKEN_KEY))),
      "Storage removal effect must be recorded"
    );

    // Assert interactive authorization is NOT reopened automatically (Task 5.4's rule)
    assert.equal(harness.effects.launchWebAuthFlowCalls.length, 0, "Interactive auth must not be reopened automatically on expiry");
  }
});
