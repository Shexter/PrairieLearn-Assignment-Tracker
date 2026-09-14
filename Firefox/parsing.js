// Shared PrairieLearn HTML parsing helpers.
//
// These functions need DOM APIs (DOMParser, querySelector). A Chrome MV3
// service worker has none, so on Chrome this file is loaded by the offscreen
// document (offscreen.html) and the service worker talks to it over messages.
// On Firefox the background page has a DOM, so background.js loads it directly
// via the manifest and calls these functions in-process.
(function initPrairieLearnTrackerParsing(global) {

  function normalizeWhitespace(value) {
    if (typeof value !== "string") {
      return "";
    }
    return value.replace(/\s+/g, " ").trim();
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

  function cellAt(cells, index) {
    return typeof index === "number" && index >= 0 && index < cells.length ? cells[index] : null;
  }

  function toAbsoluteUrl(href, origin) {
    if (!href) {
      return null;
    }
    try {
      return new URL(href, origin).toString();
    } catch {
      return null;
    }
  }

  // Column positions are not fixed: a course instance may render an extra
  // column or omit "Available credit" entirely. Resolve them from the header
  // row so the parser follows the table instead of counting cells, and fall
  // back to the common layout only when there is no header to read.
  const POSITIONAL_COLUMNS = { title: 1, availability: 2, score: 3 };

  function resolveAssessmentColumns(table) {
    const headerRow = table?.querySelector(":scope > thead > tr");
    const headers = headerRow
      ? Array.from(headerRow.children).map((cell) => normalizeWhitespace(cell.textContent))
      : [];

    if (!headers.length) {
      return { ...POSITIONAL_COLUMNS };
    }

    const indexOf = (pattern) => {
      const found = headers.findIndex((text) => pattern.test(text));
      return found === -1 ? null : found;
    };

    return {
      // A missing column stays null so its value reads as absent, rather than
      // silently picking up whatever sits at the old index.
      title: indexOf(/^title$/i),
      availability: indexOf(/available\s*credit/i),
      score: indexOf(/^score$/i),
    };
  }

  function parseAssessmentsDocument(doc, context) {
    // PrairieLearn renders one <tbody> per assessment group; scan them all.
    const table = doc.querySelector('table[aria-label="Assessments"]');
    if (!table) {
      return null;
    }

    const capturedAt = new Date().toISOString();
    const courseLabel =
      normalizeWhitespace(doc.querySelector("#main-nav .navbar-text")?.textContent) || null;

    const assessments = [];
    const columns = resolveAssessmentColumns(table);
    let currentGroup = null;

    const rows = Array.from(table.querySelectorAll(":scope > tbody > tr"));
    for (const row of rows) {
      const groupHeading = row.querySelector('[data-testid="assessment-group-heading"]');
      if (groupHeading) {
        currentGroup = normalizeWhitespace(groupHeading.textContent);
        continue;
      }

      const badgeElement = row.querySelector('[data-testid="assessment-set-badge"]');
      const cells = row.querySelectorAll("td");
      // A heading row carries zero <td> cells; a real row needs at least a
      // badge and a title. Anything stricter drops rows in narrower layouts.
      if (!badgeElement || !cells.length) {
        continue;
      }

      const badge = normalizeWhitespace(badgeElement.textContent);
      const colorClass = Array.from(badgeElement.classList || []).find((c) => c.startsWith("color-")) || null;

      const titleCell = cellAt(cells, columns.title);
      const linkElement = titleCell?.querySelector("a") || null;
      const title =
        normalizeWhitespace(linkElement?.textContent || titleCell?.textContent) || "Untitled";
      const href = linkElement?.getAttribute("href") || null;
      const absoluteUrl = toAbsoluteUrl(href, context.origin);

      const availabilityCell = cellAt(cells, columns.availability);
      const availabilityText = normalizeWhitespace(availabilityCell?.textContent) || null;
      const popoverButton =
        availabilityCell?.querySelector('button[data-bs-toggle="popover"]') || null;
      const accessWindows = parsePopoverAccessDetails(popoverButton);

      const scoreCell = cellAt(cells, columns.score);
      const score = scoreCell ? extractScorePercentFromCell(scoreCell) : null;
      const scoreText = normalizeWhitespace(scoreCell?.textContent);

      let status = "unknown";
      if (score) {
        status = "scored";
      } else if (/assessment closed/i.test(availabilityText || "") || /assessment closed/i.test(scoreText)) {
        status = "closed";
      } else if (/not started/i.test(scoreText)) {
        status = "not_started";
      } else if (scoreCell?.querySelector("a.btn, button.btn")) {
        status = "action_available";
      } else if (scoreText) {
        status = "text_status";
      }

      const deadline = getDeadlineInfo(availabilityText, accessWindows);

      assessments.push({
        courseInstanceId: context.courseInstanceId,
        courseLabel,
        group: currentGroup,
        badge,
        colorClass,
        title,
        href,
        absoluteUrl,
        availabilityText,
        accessWindows,
        dueAt: deadline.deadlineAt,
        deadlineAt: deadline.deadlineAt,
        deadlineSource: deadline.deadlineSource,
        score: score || null,
        scoreText: scoreText || null,
        status,
        capturedAt,
      });
    }

    return {
      courseInstanceId: context.courseInstanceId,
      courseLabel,
      origin: context.origin,
      sourceUrl: context.assessmentsUrl,
      assessments,
      updatedAt: capturedAt,
    };
  }

  function parsePopoverAccessDetails(buttonElement) {
    if (!buttonElement) {
      return [];
    }

    const raw = buttonElement.getAttribute("data-bs-content");
    if (!raw) {
      return [];
    }

    // getAttribute() already returns the decoded attribute value, so `raw` is
    // real HTML. Running it through decodeHtmlEntities() flattened it to plain
    // text and left zero <tr> elements to read. Parse it directly, and only fall
    // back to decoding for a doubly-escaped payload.
    let popoverDoc = new DOMParser().parseFromString(raw, "text/html");
    if (!popoverDoc.querySelector("tr")) {
      const decodedHtml = decodeHtmlEntities(raw);
      if (!decodedHtml) {
        return [];
      }
      popoverDoc = new DOMParser().parseFromString(decodedHtml, "text/html");
    }

    const rows = Array.from(popoverDoc.querySelectorAll("tr")).slice(1);
    if (!rows.length) {
      return [];
    }

    return rows.map((row) => {
      const values = Array.from(row.querySelectorAll("td")).map((cell) =>
        normalizeWhitespace(cell.textContent)
      );

      const credit = values[0] || null;
      const start = values[1] || null;
      const end = values[2] || null;

      return {
        credit,
        start,
        end,
        startIso: parsePrairieLearnTimestamp(start),
        endIso: parsePrairieLearnTimestamp(end),
      };
    });
  }

  function extractScorePercentFromCell(scoreCell) {
    if (!scoreCell) {
      return null;
    }

    const directPercent = findPercentString(scoreCell.querySelector(".progress-bar")?.textContent);
    if (directPercent) {
      return directPercent;
    }

    const ariaCandidates = [
      scoreCell.querySelector(".progress-bar")?.getAttribute("aria-valuenow"),
      scoreCell.querySelector(".progress")?.getAttribute("aria-valuenow"),
    ];
    for (const ariaValue of ariaCandidates) {
      const normalized = normalizeNumericPercentString(ariaValue);
      if (normalized) {
        return normalized;
      }
    }

    const styleCandidates = [
      scoreCell.querySelector(".progress-bar")?.getAttribute("style"),
      scoreCell.querySelector(".progress")?.getAttribute("style"),
    ];
    for (const styleValue of styleCandidates) {
      const widthPercent = findPercentFromStyle(styleValue);
      if (widthPercent) {
        return widthPercent;
      }
    }

    return findPercentString(scoreCell.textContent);
  }

  function findPercentFromStyle(styleText) {
    if (typeof styleText !== "string" || !styleText.trim()) {
      return null;
    }

    const match = styleText.match(/width\s*:\s*([+-]?\d+(?:\.\d+)?)\s*%/i);
    if (!match) {
      return null;
    }

    return normalizeNumericPercentString(match[1]);
  }

  function findPercentString(text) {
    if (typeof text !== "string" || !text.trim()) {
      return null;
    }

    const match = text.match(/([+-]?\d+(?:\.\d+)?)\s*%/);
    if (!match) {
      return null;
    }

    return normalizeNumericPercentString(match[1]);
  }

  function normalizeNumericPercentString(raw) {
    if (typeof raw !== "string" || !raw.trim()) {
      return null;
    }

    const value = Number.parseFloat(raw.trim());
    if (!Number.isFinite(value)) {
      return null;
    }

    const clamped = Math.min(Math.max(value, 0), 100);
    const rounded = Math.round(clamped * 10) / 10;
    const formatted = Number.isInteger(rounded) ? String(rounded) : String(rounded);
    return `${formatted}%`;
  }

  function getEffectiveDueTimestamp(accessWindows, availabilityText) {
    const visibleDeadline = parseVisibleUntil(availabilityText);
    if (visibleDeadline) return visibleDeadline;
    const windows = Array.isArray(accessWindows) ? accessWindows : [];
    const validEnds = windows
      .map((window) => window?.endIso)
      .filter((iso) => typeof iso === "string");

    if (validEnds.length) {
      validEnds.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
      return validEnds[validEnds.length - 1];
    }

    return parseAvailabilityFallback(availabilityText);
  }

  function getDeadlineInfo(availabilityText, accessWindows) {
    const visibleDeadline = parseVisibleUntil(availabilityText);
    if (visibleDeadline) return { deadlineAt: visibleDeadline, deadlineSource: "visible_until" };
    const windows = Array.isArray(accessWindows) ? accessWindows : [];
    const ends = windows.map((entry) => entry?.endIso).filter((iso) => iso && !Number.isNaN(Date.parse(iso)));
    if (ends.length) {
      ends.sort((a, b) => Date.parse(a) - Date.parse(b));
      return { deadlineAt: new Date(Date.parse(ends[ends.length - 1])).toISOString(), deadlineSource: "access_window_end" };
    }
    return { deadlineAt: null, deadlineSource: null };
  }

  function parseVisibleUntil(text) {
    if (typeof text !== "string") return null;
    const match = text.match(/\buntil\s+(\d{1,2}):(\d{2}),\s*\w{3},\s*([A-Za-z]{3})\s+(\d{1,2})(?:,\s*(\d{4}))?/i);
    if (!match) return null;
    const months = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    const month = months[match[3].toLowerCase()];
    const day = Number(match[4]);
    if (month === undefined || hour > 23 || minute > 59 || day < 1 || day > 31) return null;
    const now = new Date();
    const year = match[5] ? Number(match[5]) : now.getFullYear();
    let candidate = new Date(year, month, day, hour, minute, 0);
    if (!match[5] && candidate.getTime() < now.getTime() - 120 * 24 * 60 * 60 * 1000) candidate = new Date(year + 1, month, day, hour, minute, 0);
    return Number.isNaN(candidate.getTime()) ? null : candidate.toISOString();
  }

  function parsePrairieLearnTimestamp(raw) {
    if (typeof raw !== "string" || !raw.trim()) {
      return null;
    }

    const withoutTzLabel = raw.replace(/\s*\([^)]+\)\s*$/, "").trim();
    if (!withoutTzLabel) {
      return null;
    }

    let normalized = withoutTzLabel.replace(/\s+/, "T");
    normalized = normalized.replace(/([+-]\d{2})$/, "$1:00");

    const time = Date.parse(normalized);
    if (!Number.isNaN(time)) {
      return new Date(time).toISOString();
    }

    return null;
  }

  function parseAvailabilityFallback(text) {
    if (typeof text !== "string") {
      return null;
    }

    const match = text.match(/until\s+(\d{1,2}):(\d{2}),\s*\w{3},\s*([A-Za-z]{3})\s+(\d{1,2})/i);
    if (!match) {
      return null;
    }

    const hour = Number.parseInt(match[1], 10);
    const minute = Number.parseInt(match[2], 10);
    const monthToken = match[3].toLowerCase();
    const day = Number.parseInt(match[4], 10);

    if (
      Number.isNaN(hour) ||
      Number.isNaN(minute) ||
      Number.isNaN(day) ||
      hour < 0 ||
      hour > 23 ||
      minute < 0 ||
      minute > 59 ||
      day < 1 ||
      day > 31
    ) {
      return null;
    }

    const monthLookup = {
      jan: 0,
      feb: 1,
      mar: 2,
      apr: 3,
      may: 4,
      jun: 5,
      jul: 6,
      aug: 7,
      sep: 8,
      oct: 9,
      nov: 10,
      dec: 11,
    };
    const month = monthLookup[monthToken];
    if (month === undefined) {
      return null;
    }

    const now = new Date();
    let candidate = new Date(now.getFullYear(), month, day, hour, minute, 0);

    if (candidate.getTime() < now.getTime() - 1000 * 60 * 60 * 24 * 120) {
      candidate = new Date(now.getFullYear() + 1, month, day, hour, minute, 0);
    }

    return candidate.toISOString();
  }

  function decodeHtmlEntities(value) {
    if (typeof value !== "string" || !value) {
      return "";
    }

    const doc = new DOMParser().parseFromString(`<!doctype html><body>${value}`, "text/html");
    return doc.body?.textContent || "";
  }

  function extractCourseInstanceIdsFromHomeDocument(doc) {
    const script = doc.querySelector(
      'script[type="application/json"][data-component="HomeCards"][data-component-props="true"]'
    );
    if (!script?.textContent) {
      return [];
    }

    let parsed;
    try {
      parsed = JSON.parse(script.textContent);
    } catch {
      return [];
    }

    const courses = Array.isArray(parsed?.json?.studentCourses) ? parsed.json.studentCourses : [];
    return sanitizeCourseInstanceIds(courses.map((course) => course?.course_instance?.id));
  }

  function parseAssessmentsHtml(html, context) {
    const doc = new DOMParser().parseFromString(String(html ?? ""), "text/html");
    return parseAssessmentsDocument(doc, context || {});
  }

  function extractCourseInstanceIdsFromHomeHtml(html) {
    const doc = new DOMParser().parseFromString(String(html ?? ""), "text/html");
    return extractCourseInstanceIdsFromHomeDocument(doc);
  }

  global.PrairieLearnTrackerParsing = {
    parseAssessmentsHtml,
    extractCourseInstanceIdsFromHomeHtml,
    parseAssessmentsDocument,
    extractCourseInstanceIdsFromHomeDocument,
    getDeadlineInfo,
    getEffectiveDueTimestamp,
    parsePrairieLearnTimestamp,
    parseVisibleUntil,
  };
})(typeof globalThis !== "undefined" ? globalThis : self);
