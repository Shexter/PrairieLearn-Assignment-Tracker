const STORAGE_META_KEY = "pl.meta";
const STORAGE_COURSE_PREFIX = "pl.course.";
const STORAGE_PINNED_KEY = "pl.pinned_assessments";
const STORAGE_PRAIRIETEST_RESERVATIONS_KEY = "pl.prairietest.reservations";
const STORAGE_PRAIRIETEST_UNRESERVED_KEY = "pl.prairietest.unreserved";
const STORAGE_PRAIRIETEST_META_KEY = "pl.prairietest.meta";
const REFRESH_CONCURRENCY = 3;
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";
const CALENDAR_TOKEN_KEY = "pl.google_calendar_token";
const CALENDAR_MAX_EVENTS = 100;
const ext = globalThis.browser ?? globalThis.chrome;
if (typeof importScripts === "function") {
  // Chrome MV3 service worker. On Firefox the background page loads these via the manifest.
  importScripts("parsing.js");
  try { importScripts("config.js"); } catch { /* Optional maintainer-local configuration. */ }
}

chrome.runtime.onInstalled.addListener(() => {
  ensureMetaInitialized().catch((error) => {
    console.error("Failed to initialize storage metadata:", error);
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  void (async () => {
    try {
      if (!message || typeof message !== "object" || typeof message.type !== "string") {
        sendResponse({ ok: false, error: "Invalid message payload." });
        return;
      }

      if (message.type === "PL_HOME_COURSES_DISCOVERED") {
        const refreshSummary = await handleHomeCoursesDiscovered(message.payload, sender);
        const dashboard = await buildDashboardData();
        sendResponse({ ok: true, refreshSummary, data: dashboard });
        return;
      }

      if (message.type === "PL_REFRESH_REQUEST") {
        const refreshSummary = await handleRefreshRequest(message.payload, sender);
        const dashboard = await buildDashboardData();
        sendResponse({ ok: true, refreshSummary, data: dashboard });
        return;
      }

      if (message.type === "PL_GET_DASHBOARD") {
        const dashboard = await buildDashboardData();
        sendResponse({ ok: true, data: dashboard });
        return;
      }

      if (message.type === "PL_GET_ASSESSMENT_PINS") {
        const data = await getAssessmentPinStates(message.payload);
        sendResponse({ ok: true, data });
        return;
      }

      if (message.type === "PL_TOGGLE_ASSESSMENT_PIN") {
        const result = await toggleAssessmentPin(message.payload);
        sendResponse({ ok: true, ...result });
        return;
      }

      if (message.type === "PT_DATA_DISCOVERED") {
        const payload = message.payload || {};
        const result = await handlePrairieTestDataDiscovered(payload, sender);
        sendResponse({ ok: true, ...result });
        return;
      }

      if (message.type === "PT_GET_DATA") {
        const data = await getPrairieTestData();
        sendResponse({ ok: true, data });
        return;
      }

      if (message.type === "PL_SYNC_GOOGLE_CALENDAR") {
        const dashboard = await buildDashboardData();
        const result = await syncGoogleCalendar(dashboard, sender);
        sendResponse({ ok: true, result });
        return;
      }

      if (message.type === "PL_EXPORT_CALENDAR_ICS") {
        const payload = message.payload || {};
        const dashboard = await buildDashboardData();
        const origin = getCalendarOrigin(dashboard, sender);
        let items = [];
        let filename = `prairielearn-deadlines-${new Date().toISOString().slice(0, 10)}.ics`;
        if (payload.scope === "prairietest") {
          const ptItems = (dashboard.prairietestReservations || []).map((r) => ({ ...r, isPrairieTest: true }));
          items = ptItems.filter((r) => Date.parse(r.startDate) > Date.now());
          filename = `prairietest-reservations-${new Date().toISOString().slice(0, 10)}.ics`;
        } else if (payload.singleAssessment) {
          if (payload.singleAssessment.isPrairieTest) {
            items = [payload.singleAssessment];
            filename = `prairietest-${String(payload.singleAssessment.id || "exam")}.ics`;
          } else if (isEligibleForCalendarAction(payload.singleAssessment, origin)) {
            items = [payload.singleAssessment];
            const slug = String(payload.singleAssessment.badge || payload.singleAssessment.title || "deadline")
              .toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
            filename = `prairielearn-${slug || "assessment"}.ics`;
          }
        } else {
          const allItems = getCalendarItems(dashboard, origin);
          const scope = payload.scope || "all";
          items = filterCalendarItemsByScope(allItems, scope, payload);
          if (scope === "course" && payload.courseInstanceId) {
            filename = `prairielearn-course-${payload.courseInstanceId}-deadlines.ics`;
          } else if (scope === "week" || scope === "7days") {
            filename = `prairielearn-next-7-days-deadlines.ics`;
          }
        }
        if (!items.length) {
          sendResponse({ ok: false, error: "No upcoming deadlines found for the selected scope." });
          return;
        }
        const ics = await buildTrackerIcs(items, origin);
        sendResponse({ ok: true, ics, count: items.length, filename });
        return;
      }

      sendResponse({ ok: false, error: `Unsupported message type: ${message.type}` });
    } catch (error) {
      sendResponse({ ok: false, error: toErrorMessage(error) });
    }
  })();

  return true;
});

async function ensureMetaInitialized() {
  const currentMeta = await getMeta();
  if (currentMeta) {
    return;
  }

  await chrome.storage.local.set({
    [STORAGE_META_KEY]: {
      createdAt: new Date().toISOString(),
      origin: null,
      courseInstanceIds: [],
      lastDiscoveryAt: null,
      lastRefreshAt: null,
      lastError: null,
      lastRefreshSummary: null,
    },
  });
}

async function handleHomeCoursesDiscovered(payload, sender) {
  const senderOrigin = getSenderOrigin(sender);
  const origin = normalizePrairieLearnOrigin(payload?.origin) || senderOrigin;
  if (!origin) {
    throw new Error("Could not determine PrairieLearn origin from home page.");
  }

  const courseInstanceIds = sanitizeCourseInstanceIds(payload?.courseInstanceIds);
  if (!courseInstanceIds.length) {
    throw new Error("No PrairieLearn course IDs found on the home page.");
  }

  await updateMeta({
    origin,
    courseInstanceIds,
    lastDiscoveryAt: new Date().toISOString(),
    lastError: null,
  });

  return refreshCourses(origin, courseInstanceIds);
}

async function handlePrairieTestDataDiscovered(payload, sender) {
  const origin = payload?.origin || getSenderOrigin(sender) || "https://us.prairietest.com";
  const reservations = Array.isArray(payload?.reservations) ? payload.reservations : [];
  const unreservedExams = Array.isArray(payload?.unreservedExams) ? payload.unreservedExams : [];
  const capturedAt = payload?.capturedAt || new Date().toISOString();

  if (payload?.isSingleReservation && reservations.length === 1) {
    const current = await getPrairieTestData();
    const existing = current.reservations || [];
    const newRes = reservations[0];
    const index = existing.findIndex(
      (r) => (newRes.id && r.id === newRes.id) || (newRes.absoluteUrl && r.absoluteUrl === newRes.absoluteUrl)
    );
    let updated;
    if (index >= 0) {
      updated = [...existing];
      updated[index] = { ...existing[index], ...newRes };
    } else {
      updated = [newRes, ...existing];
    }
    await ext.storage.local.set({
      [STORAGE_PRAIRIETEST_RESERVATIONS_KEY]: updated,
      [STORAGE_PRAIRIETEST_META_KEY]: {
        ...(current.meta || {}),
        origin,
        lastCapturedAt: capturedAt,
        reservationCount: updated.length,
      },
    });
    return { reservationCount: updated.length, unreservedCount: current.unreservedExams.length };
  }

  await ext.storage.local.set({
    [STORAGE_PRAIRIETEST_RESERVATIONS_KEY]: reservations,
    [STORAGE_PRAIRIETEST_UNRESERVED_KEY]: unreservedExams,
    [STORAGE_PRAIRIETEST_META_KEY]: {
      origin,
      lastCapturedAt: capturedAt,
      reservationCount: reservations.length,
      unreservedCount: unreservedExams.length,
    },
  });

  await updateExtensionBadge(unreservedExams.length, reservations.length);
  return { reservationCount: reservations.length, unreservedCount: unreservedExams.length };
}

async function getPrairieTestData() {
  const all = await ext.storage.local.get([
    STORAGE_PRAIRIETEST_RESERVATIONS_KEY,
    STORAGE_PRAIRIETEST_UNRESERVED_KEY,
    STORAGE_PRAIRIETEST_META_KEY,
  ]);
  return {
    reservations: Array.isArray(all[STORAGE_PRAIRIETEST_RESERVATIONS_KEY]) ? all[STORAGE_PRAIRIETEST_RESERVATIONS_KEY] : [],
    unreservedExams: Array.isArray(all[STORAGE_PRAIRIETEST_UNRESERVED_KEY]) ? all[STORAGE_PRAIRIETEST_UNRESERVED_KEY] : [],
    meta: all[STORAGE_PRAIRIETEST_META_KEY] || null,
  };
}

async function updateExtensionBadge(unreservedCount, reservationCount) {
  if (!ext?.action?.setBadgeText) return;
  if (unreservedCount > 0) {
    await ext.action.setBadgeText({ text: "!" });
    if (ext.action.setBadgeBackgroundColor) {
      await ext.action.setBadgeBackgroundColor({ color: "#dc3545" });
    }
    if (ext.action.setTitle) {
      await ext.action.setTitle({ title: `PrairieLearn Tracker: ${unreservedCount} unreserved PrairieTest exam${unreservedCount > 1 ? "s" : ""}!` });
    }
  } else {
    await ext.action.setBadgeText({ text: "" });
    if (ext.action.setTitle) {
      await ext.action.setTitle({ title: "PrairieLearn Tracker" });
    }
  }
}

async function handleRefreshRequest(payload, sender) {
  const meta = await getMeta();
  const senderOrigin = getSenderOrigin(sender);

  const DEFAULT_ORIGIN = "https://us.prairielearn.com";
  const explicitOrigin = normalizePrairieLearnOrigin(payload?.origin);
  const storedOrigin = normalizePrairieLearnOrigin(meta?.origin);
  const origin = explicitOrigin || storedOrigin || senderOrigin || DEFAULT_ORIGIN;

  let courseInstanceIds = sanitizeCourseInstanceIds(payload?.courseInstanceIds);
  if (!courseInstanceIds.length) {
    courseInstanceIds = sanitizeCourseInstanceIds(meta?.courseInstanceIds);
  }
  if (!courseInstanceIds.length) {
    try {
      courseInstanceIds = await fetchCourseInstanceIdsFromHome(origin);
    } catch (error) {
      console.warn("[PL Tracker] Course discovery from the home page failed:", error);
      courseInstanceIds = [];
    }
  }
  if (!courseInstanceIds.length) {
    const pageAttempt = await runPageContextRefreshAttempt(origin, []);
    const discoveredIds = sanitizeCourseInstanceIds(
      (Array.isArray(pageAttempt.snapshots) ? pageAttempt.snapshots : []).map(
        (snapshot) => snapshot?.courseInstanceId
      )
    );
    return persistRefreshAttempt(origin, discoveredIds, pageAttempt);
  }

  await updateMeta({
    origin,
    courseInstanceIds,
    lastDiscoveryAt: new Date().toISOString(),
    lastError: null,
  });

  return refreshCourses(origin, courseInstanceIds);
}

async function refreshCourses(origin, courseInstanceIds) {
  const ids = sanitizeCourseInstanceIds(courseInstanceIds);
  if (!ids.length) {
    throw new Error("Cannot refresh courses without course IDs.");
  }

  let attempt = await runBackgroundRefreshAttempt(origin, ids);

  if (attempt.succeeded === 0 && attempt.failed === ids.length) {
    const bgErrors = attempt.errors.map((e) => `${e.courseInstanceId}: ${e.error}`).join("; ");
    console.warn(
      `[PL Tracker] All ${ids.length} background fetches failed. Errors: ${bgErrors}. Trying page-context fallback...`
    );
    try {
      const pageAttempt = await runPageContextRefreshAttempt(origin, ids);
      if (pageAttempt.succeeded > 0 || pageAttempt.failed < attempt.failed) {
        attempt = pageAttempt;
      } else {
        attempt.errors.push({
          courseInstanceId: "*",
          error: `Page-context refresh also failed. Background errors: ${bgErrors}`,
        });
      }
    } catch (error) {
      attempt.errors.push({
        courseInstanceId: "*",
        error: `Page-context fallback failed: ${toErrorMessage(error)}. Background errors: ${bgErrors}`,
      });
    }
  }

  return persistRefreshAttempt(origin, ids, attempt);
}

async function runBackgroundRefreshAttempt(origin, courseInstanceIds) {
  const startedAt = new Date().toISOString();
  const results = await mapWithConcurrency(courseInstanceIds, REFRESH_CONCURRENCY, async (courseInstanceId) => {
    try {
      const snapshot = await fetchAndParseAssessments(origin, courseInstanceId);
      return { ok: true, courseInstanceId, snapshot };
    } catch (error) {
      return { ok: false, courseInstanceId, error: toErrorMessage(error) };
    }
  });

  const snapshots = [];
  const errors = [];
  for (const result of results) {
    if (result.ok) {
      snapshots.push(result.snapshot);
    } else {
      errors.push({ courseInstanceId: result.courseInstanceId, error: result.error });
    }
  }

  return {
    mode: "background",
    origin,
    requestedCourseCount: courseInstanceIds.length,
    succeeded: snapshots.length,
    failed: errors.length,
    snapshots,
    errors,
    startedAt,
    finishedAt: new Date().toISOString(),
  };
}

async function runPageContextRefreshAttempt(origin, courseInstanceIds) {
  const tabSession = await ensurePrairieLearnTab(origin);
  try {
    const message = {
      type: "PL_PAGE_REFRESH_REQUEST",
      payload: {
        origin,
        courseInstanceIds,
      },
    };

    let response;
    let lastError;
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 1500;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        response = await sendMessageToTab(tabSession.tabId, message);
        lastError = null;
        break;
      } catch (tabError) {
        lastError = tabError;
        const isConnectionError = /does not exist|could not establish/i.test(
          toErrorMessage(tabError)
        );
        if (!isConnectionError || attempt === MAX_RETRIES - 1) {
          break;
        }

        // Content script not ready yet — try injecting it manually, then wait and retry.
        if (attempt === 0) {
          try {
            const scriptingApi =
              typeof browser !== "undefined" && browser?.scripting
                ? browser.scripting
                : chrome.scripting;
            await scriptingApi.executeScript({
              target: { tabId: tabSession.tabId },
              files: ["home-content.js"],
            });
          } catch {
            // Injection may fail if already loaded or permissions issue — ignore and retry anyway.
          }
        }

        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }

    if (lastError) {
      throw new Error(
        `Could not reach the PrairieLearn content script after ${MAX_RETRIES} attempts. ` +
        `Try reloading the PrairieLearn page. (${toErrorMessage(lastError)})`
      );
    }

    if (!response?.ok) {
      throw new Error(
        response?.error ||
        "Page-context refresh returned a failure. You may be logged out of PrairieLearn."
      );
    }

    const snapshots = Array.isArray(response.snapshots) ? response.snapshots : [];
    const errors = Array.isArray(response.errors) ? response.errors : [];
    return {
      mode: response.mode || "page_context",
      origin: normalizePrairieLearnOrigin(response.origin) || origin,
      requestedCourseCount: Number.isFinite(response.requestedCourseCount)
        ? response.requestedCourseCount
        : courseInstanceIds.length,
      succeeded: Number.isFinite(response.succeeded) ? response.succeeded : snapshots.length,
      failed: Number.isFinite(response.failed) ? response.failed : errors.length,
      snapshots,
      errors,
      startedAt: response.startedAt || new Date().toISOString(),
      finishedAt: response.finishedAt || new Date().toISOString(),
    };
  } finally {
    if (tabSession.created) {
      try {
        await chrome.tabs.remove(tabSession.tabId);
      } catch {
        // Ignore tab cleanup errors.
      }
    }
  }
}

async function persistRefreshAttempt(origin, courseInstanceIds, attempt) {
  const updates = {};
  const snapshots = Array.isArray(attempt.snapshots) ? attempt.snapshots : [];
  for (const snapshot of snapshots) {
    const courseInstanceId = String(snapshot?.courseInstanceId || "").trim();
    if (!/^\d+$/.test(courseInstanceId)) {
      continue;
    }
    updates[getCourseStorageKey(courseInstanceId)] = snapshot;
  }

  const errors = Array.isArray(attempt.errors) ? attempt.errors : [];
  const requestedCourseCount = Number.isFinite(attempt.requestedCourseCount)
    ? attempt.requestedCourseCount
    : courseInstanceIds.length;
  const summary = {
    origin,
    mode: attempt.mode || "background",
    requestedCourseCount,
    succeeded: snapshots.length,
    failed: errors.length,
    errors,
    startedAt: attempt.startedAt || new Date().toISOString(),
    finishedAt: attempt.finishedAt || new Date().toISOString(),
  };

  const meta = await updateMeta({
    origin,
    courseInstanceIds,
    lastRefreshAt: summary.finishedAt,
    lastRefreshSummary: summary,
    lastError: errors.length ? summarizeRefreshErrors(errors) : null,
  });

  updates[STORAGE_META_KEY] = meta;
  await chrome.storage.local.set(updates);
  return summary;
}

async function fetchCourseInstanceIdsFromHome(origin) {
  const candidates = ["/", "/pl/"];
  for (const candidate of candidates) {
    const homeUrl = new URL(candidate, origin).toString();
    const response = await fetchWithTimeout(homeUrl, { credentials: "include" });
    if (!response.ok) {
      continue;
    }

    const html = await response.text();
    const courseInstanceIds = await parseHtml("EXTRACT_COURSE_INSTANCE_IDS", html);
    if (courseInstanceIds.length) {
      return courseInstanceIds;
    }
  }

  throw new Error(
    "Could not parse enrolled courses from PrairieLearn home page. The page format may have changed."
  );
}

async function fetchAndParseAssessments(origin, courseInstanceId) {
  const assessmentsUrl = new URL(
    `/pl/course_instance/${encodeURIComponent(courseInstanceId)}/assessments`,
    origin
  ).toString();

  const response = await fetchWithTimeout(assessmentsUrl, { credentials: "include" });
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}.`);
  }

  const html = await response.text();
  const parsed = await parseHtml("PARSE_ASSESSMENTS", html, {
    origin,
    assessmentsUrl,
    courseInstanceId,
  });

  if (!parsed) {
    throw new Error("Assessments table was not found. You may be logged out or the page changed.");
  }

  return parsed;
}

// --- HTML parsing bridge -----------------------------------------------------
//
// Parsing PrairieLearn pages needs DOMParser. A Chrome MV3 service worker has
// no DOM, so on Chrome we hand the HTML to an offscreen document and get plain
// JSON back. Firefox's background page has a DOM and parses in-process.

const OFFSCREEN_TARGET = "pl-tracker-offscreen";
const OFFSCREEN_DOCUMENT_PATH = "offscreen.html";
const OFFSCREEN_REQUEST_TIMEOUT_MS = 15000;
const FETCH_TIMEOUT_MS = 20000;

let offscreenDocumentPromise = null;

function getParsing() {
  const parsing = globalThis.PrairieLearnTrackerParsing;
  if (!parsing) {
    throw new Error("parsing.js was not loaded. Check the manifest and reload the extension.");
  }
  return parsing;
}

function canParseInPlace() {
  return typeof DOMParser !== "undefined" && Boolean(globalThis.PrairieLearnTrackerParsing);
}

async function parseHtml(op, html, context) {
  if (canParseInPlace()) {
    const parsing = getParsing();
    return op === "PARSE_ASSESSMENTS"
      ? parsing.parseAssessmentsHtml(html, context)
      : parsing.extractCourseInstanceIdsFromHomeHtml(html);
  }

  await ensureOffscreenDocument();
  const response = await sendOffscreenRequest({ target: OFFSCREEN_TARGET, op, html, context });
  if (!response?.ok) {
    throw new Error(response?.error || "Offscreen parsing failed.");
  }
  return response.data;
}

async function ensureOffscreenDocument() {
  if (!chrome.offscreen) {
    throw new Error(
      "This browser has no DOMParser in the background and no offscreen document API, " +
      "so PrairieLearn pages cannot be parsed in the background."
    );
  }

  // Chrome may close an idle offscreen document, so re-check every time rather
  // than remembering that we once created one.
  if (await chrome.offscreen.hasDocument()) {
    return;
  }

  // Only one offscreen document may exist, and a refresh fans out several
  // parses at once, so concurrent callers share a single creation promise.
  if (!offscreenDocumentPromise) {
    offscreenDocumentPromise = chrome.offscreen
      .createDocument({
        url: OFFSCREEN_DOCUMENT_PATH,
        reasons: ["DOM_PARSER"],
        justification: "Parse fetched PrairieLearn HTML pages, which the service worker cannot do.",
      })
      .catch((error) => {
        // Lost a race with another creation: the document we need now exists.
        if (!/single offscreen document/i.test(toErrorMessage(error))) {
          throw error;
        }
      })
      .finally(() => {
        offscreenDocumentPromise = null;
      });
  }

  return offscreenDocumentPromise;
}

async function sendOffscreenRequest(message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Timed out waiting for the offscreen parser to respond."));
    }, OFFSCREEN_REQUEST_TIMEOUT_MS);

    chrome.runtime.sendMessage(message, (response) => {
      clearTimeout(timer);
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        reject(new Error(runtimeError.message));
        return;
      }
      resolve(response);
    });
  });
}

async function fetchWithTimeout(url, options, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Request to ${url} timed out after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function getAssessmentPinStates(payload) {
  const assessments = Array.isArray(payload?.assessments) ? payload.assessments : [];
  let pinnedById = await getPinnedAssessmentStore();
  let changed = false;
  const nowMs = Date.now();

  for (const [pinId, pin] of Object.entries(pinnedById)) {
    if (isDueDateInPast(pin?.dueAt, nowMs)) {
      delete pinnedById[pinId];
      changed = true;
    }
  }

  const items = assessments.map((assessment) => {
    const identity = buildAssessmentIdentity(
      assessment,
      payload?.courseInstanceId || assessment?.courseInstanceId,
      payload?.origin || null
    );
    if (!identity) {
      return { pinId: null, pinned: false };
    }

    const existing = pinnedById[identity.pinId];
    if (!existing) {
      return { pinId: identity.pinId, pinned: false };
    }

    const latestDueAt = normalizeIsoTimestamp(assessment?.dueAt) || existing.dueAt || null;
    if (isDueDateInPast(latestDueAt, nowMs)) {
      delete pinnedById[identity.pinId];
      changed = true;
      return { pinId: identity.pinId, pinned: false };
    }

    const merged = mergePinEntryWithAssessment(existing, assessment, identity);
    if (merged.changed) {
      pinnedById[identity.pinId] = merged.entry;
      changed = true;
    }

    return { pinId: identity.pinId, pinned: true };
  });

  if (changed) {
    await chrome.storage.local.set({ [STORAGE_PINNED_KEY]: pinnedById });
  }

  return { items };
}

async function toggleAssessmentPin(payload) {
  const assessment = payload?.assessment;
  const identity = buildAssessmentIdentity(
    assessment,
    assessment?.courseInstanceId,
    payload?.origin || null
  );
  if (!identity) {
    throw new Error("Invalid assessment payload for pinning.");
  }

  let pinnedById = await getPinnedAssessmentStore();
  let changed = false;
  const nowMs = Date.now();

  for (const [pinId, pin] of Object.entries(pinnedById)) {
    if (isDueDateInPast(pin?.dueAt, nowMs)) {
      delete pinnedById[pinId];
      changed = true;
    }
  }

  const existing = pinnedById[identity.pinId];
  if (existing) {
    delete pinnedById[identity.pinId];
    changed = true;
    await chrome.storage.local.set({ [STORAGE_PINNED_KEY]: pinnedById });
    return { pinId: identity.pinId, pinned: false };
  }

  const dueAt = normalizeIsoTimestamp(assessment?.dueAt);
  if (isDueDateInPast(dueAt, nowMs)) {
    if (changed) {
      await chrome.storage.local.set({ [STORAGE_PINNED_KEY]: pinnedById });
    }
    return { pinId: identity.pinId, pinned: false };
  }

  pinnedById[identity.pinId] = createPinEntryFromAssessment(assessment, identity);
  await chrome.storage.local.set({ [STORAGE_PINNED_KEY]: pinnedById });
  return { pinId: identity.pinId, pinned: true };
}

async function getPinnedAssessmentStore() {
  const result = await chrome.storage.local.get(STORAGE_PINNED_KEY);
  return sanitizePinnedAssessmentStore(result[STORAGE_PINNED_KEY]);
}

function sanitizePinnedAssessmentStore(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      continue;
    }

    const pinId = typeof key === "string" && key.trim() ? key.trim() : null;
    const courseInstanceId = String(value.courseInstanceId || "").trim();
    if (!pinId || !/^\d+$/.test(courseInstanceId)) {
      continue;
    }

    const normalizedDueAt = normalizeIsoTimestamp(value.dueAt);
    sanitized[pinId] = {
      pinId,
      courseInstanceId,
      title: normalizeWhitespace(String(value.title || "Untitled")) || "Untitled",
      badge: normalizeWhitespace(String(value.badge || "")) || null,
      group: normalizeWhitespace(String(value.group || "")) || null,
      href: typeof value.href === "string" && value.href.trim() ? value.href : null,
      absoluteUrl: typeof value.absoluteUrl === "string" && value.absoluteUrl.trim()
        ? value.absoluteUrl
        : null,
      dueAt: normalizedDueAt,
      deadlineAt: normalizeIsoTimestamp(value.deadlineAt) || normalizedDueAt,
      deadlineSource: typeof value.deadlineSource === "string" ? value.deadlineSource : null,
      pinnedAt: normalizeIsoTimestamp(value.pinnedAt) || new Date().toISOString(),
      updatedAt: normalizeIsoTimestamp(value.updatedAt) || new Date().toISOString(),
    };
  }

  return sanitized;
}

function createPinEntryFromAssessment(assessment, identity) {
  return {
    pinId: identity.pinId,
    courseInstanceId: identity.courseInstanceId,
    title: normalizeWhitespace(assessment?.title || "") || "Untitled",
    badge: normalizeWhitespace(assessment?.badge || "") || null,
    group: normalizeWhitespace(assessment?.group || "") || null,
    href: identity.href || (typeof assessment?.href === "string" ? assessment.href : null),
    absoluteUrl:
      identity.absoluteUrl || (typeof assessment?.absoluteUrl === "string" ? assessment.absoluteUrl : null),
    dueAt: normalizeIsoTimestamp(assessment?.dueAt),
    deadlineAt: normalizeIsoTimestamp(assessment?.deadlineAt) || normalizeIsoTimestamp(assessment?.dueAt),
    deadlineSource: typeof assessment?.deadlineSource === "string" ? assessment.deadlineSource : null,
    pinnedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function mergePinEntryWithAssessment(existing, assessment, identity) {
  const merged = {
    ...existing,
    courseInstanceId: identity.courseInstanceId,
    title: normalizeWhitespace(assessment?.title || "") || existing.title || "Untitled",
    badge: normalizeWhitespace(assessment?.badge || "") || existing.badge || null,
    group: normalizeWhitespace(assessment?.group || "") || existing.group || null,
    href: identity.href || existing.href || null,
    absoluteUrl: identity.absoluteUrl || existing.absoluteUrl || null,
    dueAt: normalizeIsoTimestamp(assessment?.dueAt) || existing.dueAt || null,
    deadlineAt: normalizeIsoTimestamp(assessment?.deadlineAt) || existing.deadlineAt || existing.dueAt || null,
    deadlineSource: typeof assessment?.deadlineSource === "string" ? assessment.deadlineSource : existing.deadlineSource || null,
    updatedAt: new Date().toISOString(),
  };

  const changed =
    merged.courseInstanceId !== existing.courseInstanceId ||
    merged.title !== existing.title ||
    merged.badge !== existing.badge ||
    merged.group !== existing.group ||
    merged.href !== existing.href ||
    merged.absoluteUrl !== existing.absoluteUrl ||
    merged.dueAt !== existing.dueAt ||
    merged.deadlineAt !== existing.deadlineAt ||
    merged.deadlineSource !== existing.deadlineSource;

  return {
    changed,
    entry: changed ? merged : existing,
  };
}

function buildAssessmentIdentity(assessment, fallbackCourseInstanceId, origin) {
  if (!assessment || typeof assessment !== "object") {
    return null;
  }

  const courseInstanceId = String(
    assessment.courseInstanceId || fallbackCourseInstanceId || ""
  ).trim();
  if (!/^\d+$/.test(courseInstanceId)) {
    return null;
  }

  const absoluteUrlCandidate =
    typeof assessment.absoluteUrl === "string" && assessment.absoluteUrl.trim()
      ? assessment.absoluteUrl
      : null;
  const hrefCandidate =
    typeof assessment.href === "string" && assessment.href.trim() ? assessment.href : null;

  const normalizedHref = normalizeAssessmentHref(
    absoluteUrlCandidate || hrefCandidate,
    origin || null
  );
  const titleKey = normalizeWhitespace(assessment.title || "").toLowerCase();
  const badgeKey = normalizeWhitespace(assessment.badge || "").toLowerCase();
  const groupKey = normalizeWhitespace(assessment.group || "").toLowerCase();
  const fallbackKey = `title:${titleKey}|badge:${badgeKey}|group:${groupKey}`;
  const keyPart = normalizedHref || fallbackKey;

  if (!keyPart || keyPart === "title:|badge:|group:") {
    return null;
  }

  return {
    pinId: `${courseInstanceId}|${keyPart}`,
    courseInstanceId,
    href: hrefCandidate,
    absoluteUrl: absoluteUrlCandidate,
  };
}

function normalizeAssessmentHref(href, origin) {
  if (typeof href !== "string" || !href.trim()) {
    return null;
  }

  const normalizedOrigin = normalizePrairieLearnOrigin(origin) || "https://us.prairielearn.com";

  try {
    const url = new URL(href, normalizedOrigin);
    return `${url.pathname}${url.search}`.toLowerCase();
  } catch {
    return normalizeWhitespace(href).toLowerCase();
  }
}

function isDueDateInPast(dueAtIso, nowMs = Date.now()) {
  const normalized = normalizeIsoTimestamp(dueAtIso);
  if (!normalized) {
    return false;
  }

  const dueMs = Date.parse(normalized);
  if (Number.isNaN(dueMs)) {
    return false;
  }

  return dueMs <= nowMs;
}

function normalizeIsoTimestamp(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const time = Date.parse(value);
  if (Number.isNaN(time)) {
    return null;
  }

  return new Date(time).toISOString();
}

async function buildDashboardData() {
  const all = await chrome.storage.local.get(null);
  const meta = all[STORAGE_META_KEY] || null;
  let pinnedById = sanitizePinnedAssessmentStore(all[STORAGE_PINNED_KEY]);
  let pinnedStoreChanged = false;
  const nowMs = Date.now();

  const snapshots = Object.entries(all)
    .filter(([key]) => key.startsWith(STORAGE_COURSE_PREFIX))
    .map(([key, value]) => {
      if (value && typeof value === "object") {
        Object.defineProperty(value, "__storageKey", { value: key, enumerable: false, configurable: true });
      }
      return value;
    })
    .filter((value) => value && Array.isArray(value.assessments));

  const upcoming = [];
  let assessmentCount = 0;
  let pinnedCount = 0;

  for (const [pinId, pin] of Object.entries(pinnedById)) {
    if (isDueDateInPast(pin?.dueAt, nowMs)) {
      delete pinnedById[pinId];
      pinnedStoreChanged = true;
    }
  }

  for (const snapshot of snapshots) {
    let snapshotChanged = false;
    for (const assessment of snapshot.assessments) {
      assessmentCount += 1;
      if (!assessment || typeof assessment !== "object") {
        continue;
      }

      if (assessment.deadlineSource === "legacy" || (!assessment.deadlineSource && assessment.dueAt)) {
        const migrated = getParsing().getDeadlineInfo(
          assessment.availabilityText,
          assessment.accessWindows
        );
        assessment.deadlineAt = migrated.deadlineAt;
        assessment.deadlineSource = migrated.deadlineSource;
        assessment.dueAt = migrated.deadlineAt;
        snapshotChanged = true;
      }

      const isClosed =
        assessment.status === "closed" ||
        /assessment closed/i.test(assessment.availabilityText || "") ||
        /assessment closed/i.test(assessment.scoreText || "");

      if (isClosed) {
        continue;
      }

      const identity = buildAssessmentIdentity(
        assessment,
        snapshot.courseInstanceId,
        snapshot.origin
      );

      const pinId = identity?.pinId || null;
      const existingPin = pinId ? pinnedById[pinId] : null;
      let isPinned = Boolean(existingPin);

      if (isPinned) {
        const latestDueAt = normalizeIsoTimestamp(assessment.dueAt) || existingPin.dueAt || null;
        if (isDueDateInPast(latestDueAt, nowMs)) {
          delete pinnedById[pinId];
          pinnedStoreChanged = true;
          isPinned = false;
        } else {
          const merged = mergePinEntryWithAssessment(existingPin, assessment, identity);
          if (merged.changed) {
            pinnedById[pinId] = merged.entry;
            pinnedStoreChanged = true;
          }
          pinnedCount += 1;
        }
      }

      upcoming.push({
        courseInstanceId: snapshot.courseInstanceId,
        courseLabel: assessment.courseLabel || snapshot.courseLabel || snapshot.courseInstanceId || "Course",
        group: assessment.group || null,
        badge: assessment.badge || null,
        colorClass: assessment.colorClass || null,
        title: assessment.title || "Untitled",
        href: assessment.absoluteUrl || toAbsoluteAssessmentUrl(snapshot.origin, assessment.href),
        dueAt: assessment.dueAt || null,
        deadlineAt: assessment.deadlineAt || assessment.dueAt || null,
        deadlineSource: assessment.deadlineSource || (assessment.dueAt ? "legacy" : null),
        availabilityText: assessment.availabilityText || null,
        score: assessment.score || null,
        status: assessment.status || "unknown",
        pinId,
        isPinned,
        capturedAt: assessment.capturedAt || snapshot.updatedAt || null,
      });
    }
    if (snapshotChanged && snapshot.__storageKey) {
      await chrome.storage.local.set({ [snapshot.__storageKey]: snapshot });
    }
  }

  const ptReservations = Array.isArray(all[STORAGE_PRAIRIETEST_RESERVATIONS_KEY])
    ? all[STORAGE_PRAIRIETEST_RESERVATIONS_KEY]
    : [];
  const ptUnreserved = Array.isArray(all[STORAGE_PRAIRIETEST_UNRESERVED_KEY])
    ? all[STORAGE_PRAIRIETEST_UNRESERVED_KEY]
    : [];
  const ptMeta = all[STORAGE_PRAIRIETEST_META_KEY] || null;

  for (const res of ptReservations) {
    const startTime = Date.parse(res.startDate);
    if (Number.isNaN(startTime) || startTime <= nowMs) {
      continue;
    }
    upcoming.push({
      courseInstanceId: res.courseInstanceId || "prairietest",
      courseLabel: res.courseLabel || "PrairieTest",
      group: "PrairieTest Exam Reservations",
      badge: "Exam",
      colorClass: "color-red2",
      title: res.examTitle || res.title || "Exam Reservation",
      fullTitle: res.title,
      href: res.absoluteUrl || res.href,
      dueAt: res.startDate,
      deadlineAt: res.startDate,
      startDate: res.startDate,
      endDate: res.endDate,
      durationMinutes: res.durationMinutes || 60,
      location: res.location || "",
      sessionDetails: res.sessionDetails || "",
      deadlineSource: "prairietest",
      status: "reserved",
      score: `${res.durationMinutes || 60}m In-person`,
      isPrairieTest: true,
      id: res.id,
      capturedAt: res.capturedAt || ptMeta?.lastCapturedAt || null,
    });
  }

  if (pinnedStoreChanged) {
    await chrome.storage.local.set({ [STORAGE_PINNED_KEY]: pinnedById });
  }

  upcoming.sort(compareUpcomingAssessments);

  return {
    meta,
    stats: {
      courseSnapshots: snapshots.length,
      assessments: assessmentCount,
      upcoming: upcoming.length,
      pinned: pinnedCount,
      prairietestReservations: ptReservations.length,
      prairietestUnreserved: ptUnreserved.length,
    },
    upcoming,
    prairietestReservations: ptReservations,
    prairietestUnreserved: ptUnreserved,
    prairietestMeta: ptMeta,
    calendarItems: [
      ...upcoming.filter((item) => !item.isPrairieTest && item.deadlineAt && item.deadlineSource && item.deadlineSource !== "legacy" && item.href),
      ...ptReservations.filter((res) => {
        const start = Date.parse(res.startDate);
        return !Number.isNaN(start) && start > nowMs;
      }).map((res) => ({
        ...res,
        isPrairieTest: true,
        deadlineAt: res.startDate,
        deadlineSource: "prairietest",
        href: res.absoluteUrl || res.href,
      })),
    ],
  };
}

function compareUpcomingAssessments(a, b) {
  const aTime = a.dueAt ? Date.parse(a.dueAt) : Number.NaN;
  const bTime = b.dueAt ? Date.parse(b.dueAt) : Number.NaN;

  const aHasDate = !Number.isNaN(aTime);
  const bHasDate = !Number.isNaN(bTime);

  if (aHasDate && bHasDate && aTime !== bTime) {
    return aTime - bTime;
  }
  if (aHasDate && !bHasDate) {
    return -1;
  }
  if (!aHasDate && bHasDate) {
    return 1;
  }

  const byCourse = a.courseLabel.localeCompare(b.courseLabel);
  if (byCourse !== 0) {
    return byCourse;
  }

  const byBadge = (a.badge || "").localeCompare(b.badge || "");
  if (byBadge !== 0) {
    return byBadge;
  }

  return a.title.localeCompare(b.title);
}

function toAbsoluteAssessmentUrl(origin, href) {
  if (typeof href !== "string" || !href) {
    return null;
  }

  const normalizedOrigin = normalizePrairieLearnOrigin(origin);
  if (!normalizedOrigin) {
    return href;
  }

  try {
    return new URL(href, normalizedOrigin).toString();
  } catch {
    return href;
  }
}

async function getMeta() {
  const result = await chrome.storage.local.get(STORAGE_META_KEY);
  return result[STORAGE_META_KEY] || null;
}

async function updateMeta(patch) {
  const existing = (await getMeta()) || {};
  const next = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await chrome.storage.local.set({ [STORAGE_META_KEY]: next });
  return next;
}

function getCourseStorageKey(courseInstanceId) {
  return `${STORAGE_COURSE_PREFIX}${courseInstanceId}`;
}

function sanitizeCourseInstanceIds(rawIds) {
  if (!Array.isArray(rawIds)) {
    return [];
  }

  const unique = new Set();
  for (const id of rawIds) {
    const normalized = String(id ?? "").trim();
    if (/^\d+$/.test(normalized)) {
      unique.add(normalized);
    }
  }

  return Array.from(unique);
}

function normalizePrairieLearnOrigin(raw) {
  if (typeof raw !== "string" || !raw.trim()) {
    return null;
  }

  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:") {
      return null;
    }
    if (host === "prairielearn.com" || host.endsWith(".prairielearn.com")) {
      return url.origin;
    }
  } catch {
    return null;
  }

  return null;
}

function getSenderOrigin(sender) {
  if (!sender?.url) {
    return null;
  }

  try {
    const url = new URL(sender.url);
    return normalizePrairieLearnOrigin(url.origin);
  } catch {
    return null;
  }
}

async function ensurePrairieLearnTab(origin) {
  const domainTabs = await chrome.tabs.query({ url: ["https://*.prairielearn.com/*"] });
  let chosenTab = null;

  for (const tab of domainTabs) {
    if (!tab?.id || typeof tab.url !== "string") {
      continue;
    }
    try {
      if (new URL(tab.url).origin === origin) {
        chosenTab = tab;
        break;
      }
    } catch {
      // Ignore malformed tab URLs.
    }
  }

  if (chosenTab?.id) {
    await waitForTabComplete(chosenTab.id, 10000);
    return { tabId: chosenTab.id, created: false };
  }

  const created = await chrome.tabs.create({ url: `${origin}/`, active: false });
  if (!created?.id) {
    throw new Error("Failed to create PrairieLearn tab for refresh.");
  }

  await waitForTabComplete(created.id, 20000);
  return { tabId: created.id, created: true };
}

async function sendMessageToTab(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        reject(new Error(runtimeError.message));
        return;
      }
      resolve(response);
    });
  });
}

async function waitForTabComplete(tabId, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for PrairieLearn tab to load."));
    }, timeoutMs);

    const onUpdated = (updatedTabId, info) => {
      if (updatedTabId !== tabId) {
        return;
      }
      if (info.status === "complete") {
        settled = true;
        cleanup();
        resolve();
      }
    };

    const cleanup = () => {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };

    chrome.tabs.onUpdated.addListener(onUpdated);

    chrome.tabs
      .get(tabId)
      .then((tab) => {
        if (settled) {
          return;
        }
        if (tab?.status === "complete") {
          cleanup();
          resolve();
        }
      })
      .catch(() => {
        cleanup();
        reject(new Error("PrairieLearn tab closed before refresh could start."));
      });
  });
}

function summarizeRefreshErrors(errors) {
  if (!Array.isArray(errors) || !errors.length) {
    return null;
  }

  const preview = errors
    .slice(0, 2)
    .map((entry) => {
      const courseInstanceId = entry?.courseInstanceId || "?";
      const message = entry?.error || "Unknown failure";
      return `${courseInstanceId}: ${message}`;
    })
    .join(" | ");

  if (errors.length > 2) {
    return `${preview} (+${errors.length - 2} more)`;
  }
  return preview;
}

function normalizeWhitespace(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.replace(/\s+/g, " ").trim();
}

function toErrorMessage(error) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === "string" && error) {
    return error;
  }
  return "Unknown error";
}

async function mapWithConcurrency(items, concurrency, worker) {
  const normalizedConcurrency = Math.max(1, Math.min(concurrency, items.length));
  const results = new Array(items.length);
  let currentIndex = 0;

  const runners = Array.from({ length: normalizedConcurrency }, async () => {
    while (true) {
      const itemIndex = currentIndex;
      currentIndex += 1;

      if (itemIndex >= items.length) {
        return;
      }

      results[itemIndex] = await worker(items[itemIndex], itemIndex);
    }
  });

  await Promise.all(runners);
  return results;
}

function getCalendarOrigin(dashboard, sender) {
  return normalizePrairieLearnOrigin(dashboard?.meta?.origin) || getSenderOrigin(sender) || "https://us.prairielearn.com";
}

function getCalendarItems(dashboard, origin = "https://us.prairielearn.com") {
  const now = Date.now();
  return (Array.isArray(dashboard?.calendarItems) ? dashboard.calendarItems : [])
    .filter((item) => {
      if (item?.isPrairieTest) {
        const start = Date.parse(item.startDate || item.deadlineAt);
        return !Number.isNaN(start) && start > now;
      }
      return item?.deadlineSource !== "legacy" && isEligibleForCalendarAction(item, origin, now);
    });
}

function getGoogleClientId() {
  const configured = typeof globalThis.PL_GOOGLE_CLIENT_ID === "string" ? globalThis.PL_GOOGLE_CLIENT_ID.trim() :
    (typeof globalThis.GOOGLE_CLIENT_ID === "string" ? globalThis.GOOGLE_CLIENT_ID.trim() : "");
  return configured && !configured.startsWith("YOUR_PUBLIC_") ? configured : "";
}

function normalizeIdentityRedirect(uri) {
  if (typeof uri !== "string" || !uri.trim()) throw new Error("Google OAuth redirect URI is unavailable.");
  let parsed;
  try { parsed = new URL(uri); } catch { throw new Error("Google OAuth returned an invalid redirect URI."); }
  if (parsed.protocol !== "https:" || !/\.(?:chromiumapp|extensions\.allizom)\.org$/i.test(parsed.hostname)) {
    throw new Error("Google OAuth returned an unsupported redirect URI.");
  }
  return `${parsed.origin}/`;
}

function createOauthState() {
  const bytes = new Uint8Array(24);
  if (!globalThis.crypto?.getRandomValues) throw new Error("Secure random values are unavailable for Google authorization.");
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function getCalendarToken(interactive) {
  const stored = await ext.storage.local.get(CALENDAR_TOKEN_KEY);
  const token = stored[CALENDAR_TOKEN_KEY];
  if (token?.accessToken && Number(token.expiresAt) > Date.now() + 60_000) return token.accessToken;
  if (!interactive) return null;
  const clientId = getGoogleClientId();
  if (!clientId) throw new Error("Google Calendar is not configured for this build. Download the calendar file instead.");
  if (!ext?.identity?.getRedirectURL || !ext?.identity?.launchWebAuthFlow) throw new Error("This browser does not expose the extension identity API. Download the calendar file instead.");
  const redirectUri = normalizeIdentityRedirect(ext.identity.getRedirectURL());
  const state = createOauthState();
  const params = new URLSearchParams({ client_id: clientId, response_type: "token", redirect_uri: redirectUri, scope: CALENDAR_SCOPE, state, include_granted_scopes: "true" });
  const responseUrl = await ext.identity.launchWebAuthFlow({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}`, interactive: true });
  if (!responseUrl) throw new Error("Google authorization was cancelled.");
  const response = new URL(responseUrl);
  if (response.origin !== new URL(redirectUri).origin) throw new Error("Google authorization returned an unexpected redirect.");
  const fragment = new URLSearchParams(response.hash.slice(1));
  if (fragment.get("state") !== state) throw new Error("Google authorization state validation failed.");
  if (fragment.get("error")) throw new Error(fragment.get("error_description") || "Google authorization was not granted.");
  const accessToken = fragment.get("access_token");
  const expiresIn = Number(fragment.get("expires_in"));
  const grantedScopes = (fragment.get("scope") || "").split(/\s+/).filter(Boolean);
  if (!accessToken || !Number.isFinite(expiresIn) || !grantedScopes.includes(CALENDAR_SCOPE)) throw new Error("Google authorization did not grant calendar event access.");
  await ext.storage.local.set({ [CALENDAR_TOKEN_KEY]: { accessToken, expiresAt: Date.now() + expiresIn * 1000 } });
  return accessToken;
}

async function calendarApiRequest(path, options, token) {
  const response = await fetch(`${CALENDAR_API_BASE}${path}`, { ...options, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(options?.headers || {}) } });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    const error = new Error(detail?.error?.message || `Google Calendar request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return response.status === 204 ? null : response.json();
}

async function syncGoogleCalendar(dashboard, sender) {
  const origin = getCalendarOrigin(dashboard, sender);
  const items = getCalendarItems(dashboard, origin);
  if (items.length > CALENDAR_MAX_EVENTS) throw new Error(`Calendar sync stopped: ${items.length} future published deadlines exceed the ${CALENDAR_MAX_EVENTS}-event safety limit.`);
  const token = await getCalendarToken(true);
  const result = { created: 0, updated: 0, unchanged: 0, skipped: 0, failed: 0, errors: [] };
  for (const item of items) {
    try {
      const event = await buildGoogleCalendarEvent(item, origin);
      if (!event) { result.skipped += 1; continue; }
      let existing = null;
      try { existing = await calendarApiRequest(`/calendars/primary/events/${encodeURIComponent(event.id)}`, { method: "GET" }, token); } catch (error) { if (error.status !== 404) throw error; }
      if (existing && existing.extendedProperties?.private?.prairieLearnTracker !== "v1") throw new Error("A non-tracker event already owns this deterministic ID.");
      if (existing && calendarEventMatches(existing, event)) result.unchanged += 1;
      else if (existing) { await calendarApiRequest(`/calendars/primary/events/${encodeURIComponent(event.id)}`, { method: "PUT", body: JSON.stringify(event) }, token); result.updated += 1; }
      else {
        try { await calendarApiRequest(`/calendars/primary/events?sendUpdates=none`, { method: "POST", body: JSON.stringify(event) }, token); result.created += 1; }
        catch (error) { if (error.status !== 409) throw error; await calendarApiRequest(`/calendars/primary/events/${encodeURIComponent(event.id)}`, { method: "PUT", body: JSON.stringify(event) }, token); result.updated += 1; }
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    } catch (error) {
      if (error.status === 401 || error.status === 403) await ext.storage.local.remove(CALENDAR_TOKEN_KEY);
      result.failed += 1;
      result.errors.push(`${item.title || "Assessment"}: ${error.message}`);
      if (error.status === 401 || error.status === 403) break;
    }
  }
  return result;
}

function calendarEventMatches(existing, expected) {
  return (
    existing.summary === expected.summary &&
    existing.description === expected.description &&
    (existing.location || "") === (expected.location || "") &&
    existing.start?.dateTime === expected.start.dateTime &&
    existing.end?.dateTime === expected.end.dateTime &&
    existing.source?.url === expected.source.url
  );
}

function resolvePrairieLearnAssessmentUrl(rawUrl, origin = "https://us.prairielearn.com") {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) return null;
  const trimmed = rawUrl.trim();
  if (/^(?:javascript|data|vbscript|file):/i.test(trimmed)) {
    return null;
  }
  let base = typeof origin === "string" && origin.trim() ? origin.trim() : "https://us.prairielearn.com";
  if (!/^https?:\/\//i.test(base)) {
    base = `https://${base}`;
  }
  let baseUrl;
  try {
    baseUrl = new URL(base);
  } catch {
    return null;
  }
  const baseHost = baseUrl.hostname.toLowerCase();
  if (baseHost !== "prairielearn.com" && !baseHost.endsWith(".prairielearn.com")) {
    return null;
  }

  try {
    const resolved = new URL(trimmed, baseUrl);
    if (resolved.protocol !== "https:" && resolved.protocol !== "http:") {
      return null;
    }
    const resolvedHost = resolved.hostname.toLowerCase();
    if (resolvedHost !== "prairielearn.com" && !resolvedHost.endsWith(".prairielearn.com")) {
      return null;
    }
    if (resolved.origin.toLowerCase() !== baseUrl.origin.toLowerCase()) {
      return null;
    }
    return resolved.toString();
  } catch {
    return null;
  }
}

function isEligibleForCalendarAction(item, origin = "https://us.prairielearn.com", now = Date.now()) {
  let targetOrigin = origin;
  let targetNow = now;
  if (typeof origin === "number") {
    targetNow = origin;
    targetOrigin = typeof now === "string" ? now : "https://us.prairielearn.com";
  }
  if (!item || typeof item !== "object") return false;
  const deadline = item.deadlineAt || (item.deadlineSource ? item.dueAt : null);
  if (!deadline) return false;
  const isClosed =
    item.status === "closed" ||
    /assessment closed/i.test(item.availabilityText || "") ||
    /assessment closed/i.test(item.scoreText || "");
  if (isClosed) return false;
  const href = item.href || item.absoluteUrl;
  const resolvedUrl = resolvePrairieLearnAssessmentUrl(href, targetOrigin);
  if (!resolvedUrl) return false;
  const due = Date.parse(deadline);
  return !Number.isNaN(due) && due > targetNow;
}

async function buildGoogleCalendarEvent(item, origin = "https://us.prairielearn.com") {
  if (item?.isPrairieTest) {
    const digest = await digestHex(`prairietest|${item.id || item.href || item.title}`);
    const summary = `Exam: ${item.title || "PrairieTest Exam"}`;
    const resolvedUrl = item.absoluteUrl || item.href || "https://us.prairietest.com/pt";
    const details = [
      "PrairieTest Exam Reservation",
      item.location ? `Location: ${item.location}` : null,
      item.sessionDetails ? `Details: ${item.sessionDetails}` : null,
      `Reservation: ${resolvedUrl}`,
    ].filter(Boolean).join("\n");
    const start = new Date(item.startDate || item.deadlineAt);
    const end = new Date(item.endDate || (start.getTime() + (item.durationMinutes || 60) * 60 * 1000));
    return {
      id: `ptv1${digest}`,
      summary,
      description: details,
      location: item.location || "",
      source: { title: "PrairieTest reservation", url: resolvedUrl },
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
      transparency: "opaque",
      extendedProperties: {
        private: {
          prairieLearnTracker: "v1",
          prairieTestReservation: "true",
          reservationId: String(item.id || ""),
        },
      },
    };
  }

  if (!isEligibleForCalendarAction(item, origin)) return null;
  const identity = buildAssessmentIdentity(item, item.courseInstanceId, origin);
  if (!identity || !item.deadlineAt) return null;
  const resolvedUrl = resolvePrairieLearnAssessmentUrl(item.href || item.absoluteUrl, origin);
  if (!resolvedUrl) return null;
  const digest = await digestHex(`${origin}|${identity.pinId}`);
  const end = new Date(item.deadlineAt);
  const start = new Date(end.getTime() - 15 * 60 * 1000);
  const badge = item.badge ? ` · ${item.badge}` : "";
  const summary = `Due: ${item.courseLabel || "PrairieLearn"}${badge} · ${item.title || "Assessment"}`;
  return {
    id: `plv1${digest}`,
    summary,
    description: `PrairieLearn assessment deadline.\n${resolvedUrl}`,
    source: { title: "PrairieLearn assessment", url: resolvedUrl },
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
    transparency: "transparent",
    extendedProperties: { private: { prairieLearnTracker: "v1", assessmentIdentity: identity.pinId } }
  };
}

async function digestHex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function filterCalendarItemsByScope(items, scope = "all", options = {}, now = Date.now()) {
  const list = Array.isArray(items) ? items : [];
  const normalizedScope = String(scope || "all").toLowerCase();
  if (normalizedScope === "course") {
    const targetId = String(options.courseInstanceId || "").trim();
    if (!targetId) return [];
    return list.filter((item) => String(item.courseInstanceId || "").trim() === targetId);
  }
  if (normalizedScope === "week" || normalizedScope === "7days") {
    const horizon = now + 7 * 24 * 60 * 60 * 1000;
    return list.filter((item) => {
      const due = Date.parse(item.deadlineAt || item.dueAt || "");
      return !Number.isNaN(due) && due <= horizon;
    });
  }
  return list;
}

function buildValarmBlocks(deadlineIso, now = Date.now()) {
  const deadline = Date.parse(deadlineIso);
  if (Number.isNaN(deadline)) return [];
  const msUntil = deadline - now;
  const blocks = [];
  if (msUntil > 24 * 60 * 60 * 1000) {
    blocks.push([
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "DESCRIPTION:Reminder",
      "TRIGGER:-PT24H",
      "END:VALARM",
    ].join("\r\n"));
  }
  if (msUntil > 2 * 60 * 60 * 1000) {
    blocks.push([
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "DESCRIPTION:Reminder",
      "TRIGGER:-PT2H",
      "END:VALARM",
    ].join("\r\n"));
  }
  return blocks;
}

async function buildTrackerIcs(items, origin, now = Date.now()) {
  const events = [];
  for (const item of items.slice(0, CALENDAR_MAX_EVENTS)) {
    const event = await buildGoogleCalendarEvent(item, origin);
    if (!event) continue;
    const esc = (value) => String(value || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
    const utc = (iso) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    const valarms = buildValarmBlocks(event.end.dateTime, now);
    const lines = [
      "BEGIN:VEVENT",
      `UID:${event.id}@prairielearn-tracker`,
      `DTSTAMP:${utc(new Date(now).toISOString())}`,
      `DTSTART:${utc(event.start.dateTime)}`,
      `DTEND:${utc(event.end.dateTime)}`,
      `SUMMARY:${esc(event.summary)}`,
      `DESCRIPTION:${esc(event.description)}`,
      event.location ? `LOCATION:${esc(event.location)}` : null,
      `URL:${event.source.url}`,
    ].filter(Boolean);
    if (valarms.length > 0) {
      lines.push(...valarms);
    }
    lines.push("END:VEVENT");
    events.push(lines.join("\r\n"));
  }
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//PrairieLearn Tracker//EN", "CALSCALE:GREGORIAN", ...events, "END:VCALENDAR", ""].join("\r\n");
}

if (typeof globalThis !== "undefined") {
  globalThis.__PL_BACKGROUND_RUNTIME__ = {
    resolvePrairieLearnAssessmentUrl,
    isEligibleForCalendarAction,
    buildGoogleCalendarEvent,
    getCalendarItems,
    filterCalendarItemsByScope,
    buildValarmBlocks,
    buildTrackerIcs,
  };
}
