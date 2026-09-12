(function initPrairieLearnTrackerCore(global) {
  const MONTHS = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };

  function normalizeWhitespace(value) {
    return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  }

  function parsePrairieTimestamp(raw) {
    if (typeof raw !== "string" || !raw.trim()) return null;
    const withoutTz = raw.replace(/\s*\([^)]+\)\s*$/, "").trim();
    const normalized = withoutTz.replace(/\s+/, "T").replace(/([+-]\d{2})$/, "$1:00");
    const time = Date.parse(normalized);
    return Number.isNaN(time) ? null : new Date(time).toISOString();
  }

  function parseVisibleUntil(text, now = new Date()) {
    const value = normalizeWhitespace(text);
    const match = value.match(/\buntil\s+(\d{1,2}):(\d{2}),\s*\w{3},\s*([A-Za-z]{3})\s+(\d{1,2})(?:,\s*(\d{4}))?/i);
    if (!match) return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    const month = MONTHS[match[3].toLowerCase()];
    const day = Number(match[4]);
    if (!Number.isInteger(month) || hour < 0 || hour > 23 || minute < 0 || minute > 59 || day < 1 || day > 31) {
      return null;
    }
    const year = match[5] ? Number(match[5]) : now.getFullYear();
    let candidate = new Date(year, month, day, hour, minute, 0, 0);
    if (!match[5] && candidate.getTime() < now.getTime() - 120 * 24 * 60 * 60 * 1000) {
      candidate = new Date(year + 1, month, day, hour, minute, 0, 0);
    }
    return Number.isNaN(candidate.getTime()) ? null : candidate.toISOString();
  }

  function getDeadlineInfo(availabilityText, accessWindows, now = new Date()) {
    const visible = parseVisibleUntil(availabilityText, now);
    if (visible) return { deadlineAt: visible, deadlineSource: "visible_until" };
    const ends = (Array.isArray(accessWindows) ? accessWindows : [])
      .map((window) => window?.endIso)
      .filter((iso) => typeof iso === "string" && !Number.isNaN(Date.parse(iso)))
      .sort((a, b) => Date.parse(a) - Date.parse(b));
    if (ends.length) return { deadlineAt: new Date(Date.parse(ends[ends.length - 1])).toISOString(), deadlineSource: "access_window_end" };
    return { deadlineAt: null, deadlineSource: null };
  }

  function parseScorePercent(score) {
    if (typeof score !== "string") return null;
    const match = score.match(/(\d+(?:\.\d+)?)\s*%/);
    if (!match) return null;
    const value = Number(match[1]);
    return Number.isFinite(value) ? Math.round(value * 10) / 10 : null;
  }

  function hasUsableDeadline(item) {
    return Boolean(item && (item.deadlineAt || item.dueAt) && (item.deadlineSource || item.deadlineAt));
  }

  function getDeadlineAt(item) {
    return item?.deadlineAt || (item?.deadlineSource ? item?.dueAt : null) || null;
  }

  function isOpen(item) {
    return item?.status !== "closed" && !/assessment closed/i.test(item?.availabilityText || "") && !/assessment closed/i.test(item?.scoreText || "");
  }

  function selectUpcoming(items, now = Date.now(), horizonDays = 7) {
    const end = now + horizonDays * 24 * 60 * 60 * 1000;
    return (Array.isArray(items) ? items : [])
      .filter((item) => {
        if (!hasUsableDeadline(item) || !isOpen(item)) return false;
        const due = Date.parse(getDeadlineAt(item));
        if (Number.isNaN(due) || due <= now) return false;
        const pinned = Boolean(item.isPinned);
        if (pinned) return true;
        const percent = parseScorePercent(item.score);
        return (percent === null || percent < 100) && due <= end;
      })
      .sort(compareByDeadline);
  }

  function selectCalendarItems(items, now = Date.now()) {
    return (Array.isArray(items) ? items : [])
      .filter((item) => {
        if (!hasUsableDeadline(item) || !isOpen(item) || !item.href) return false;
        const due = Date.parse(getDeadlineAt(item));
        return !Number.isNaN(due) && due > now;
      })
      .sort(compareByDeadline);
  }

  function compareByDeadline(a, b) {
    const aTime = Date.parse(getDeadlineAt(a) || "");
    const bTime = Date.parse(getDeadlineAt(b) || "");
    if (aTime !== bTime) return (Number.isNaN(aTime) ? Infinity : aTime) - (Number.isNaN(bTime) ? Infinity : bTime);
    return `${a?.courseLabel || ""} ${a?.title || ""}`.localeCompare(`${b?.courseLabel || ""} ${b?.title || ""}`);
  }

  function canonicalAssessmentIdentity(item, origin) {
    const course = String(item?.courseInstanceId || "").trim();
    const href = String(item?.href || item?.absoluteUrl || "").trim();
    if (!/^\d+$/.test(course) || !href) return null;
    let path = href;
    try { path = new URL(href, origin || "https://us.prairielearn.com").pathname.toLowerCase(); } catch { path = href.toLowerCase(); }
    return `v1|${String(origin || "").toLowerCase()}|${course}|${path}`;
  }

  async function sha256Hex(value) {
    const bytes = new TextEncoder().encode(value);
    if (global.crypto?.subtle) {
      const digest = await global.crypto.subtle.digest("SHA-256", bytes);
      return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    }
    throw new Error("Web Crypto is unavailable.");
  }

  async function stableEventId(item, origin) {
    const identity = canonicalAssessmentIdentity(item, origin);
    if (!identity) return null;
    return `plv1${await sha256Hex(identity)}`;
  }

  function escapeIcs(value) {
    return String(value || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  }

  function formatIcsUtc(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
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

  async function buildCalendarEvent(item, origin) {
    const deadline = getDeadlineAt(item);
    const end = new Date(deadline);
    const start = new Date(end.getTime() - 15 * 60 * 1000);
    const eventId = await stableEventId(item, origin);
    const resolvedUrl = resolvePrairieLearnAssessmentUrl(item?.href || item?.absoluteUrl, origin);
    if (!eventId || !resolvedUrl || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
    const course = item.courseLabel || "PrairieLearn";
    const badge = item.badge ? ` · ${item.badge}` : "";
    const title = `Due: ${course}${badge} · ${item.title || "Assessment"}`;
    return {
      id: eventId,
      summary: title,
      description: `PrairieLearn assessment deadline.\n${resolvedUrl}`,
      source: { title: "PrairieLearn assessment", url: resolvedUrl },
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
      transparency: "transparent",
      extendedProperties: { private: { prairieLearnTracker: "v1", assessmentIdentity: canonicalAssessmentIdentity(item, origin) } },
    };
  }

  function formatUtcCompact(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  }

  function isEligibleForCalendarAction(item, origin = "https://us.prairielearn.com", now = Date.now()) {
    let targetOrigin = origin;
    let targetNow = now;
    if (typeof origin === "number") {
      targetNow = origin;
      targetOrigin = typeof now === "string" ? now : "https://us.prairielearn.com";
    }
    if (!hasUsableDeadline(item) || !isOpen(item)) return false;
    const href = item?.href || item?.absoluteUrl;
    const resolvedUrl = resolvePrairieLearnAssessmentUrl(href, targetOrigin);
    if (!resolvedUrl) return false;
    const due = Date.parse(getDeadlineAt(item));
    return !Number.isNaN(due) && due > targetNow;
  }

  function buildGoogleCalendarComposeUrl(item, origin = "https://us.prairielearn.com", now = Date.now()) {
    if (!isEligibleForCalendarAction(item, origin, now)) return null;
    const resolvedUrl = resolvePrairieLearnAssessmentUrl(item?.href || item?.absoluteUrl, origin);
    if (!resolvedUrl) return null;
    const deadline = getDeadlineAt(item);
    const end = new Date(deadline);
    const start = new Date(end.getTime() - 15 * 60 * 1000);
    const startUtc = formatUtcCompact(start);
    const endUtc = formatUtcCompact(end);
    if (!startUtc || !endUtc) return null;
    const course = item.courseLabel || "PrairieLearn";
    const badge = item.badge ? ` · ${item.badge}` : "";
    const title = `Due: ${course}${badge} · ${item.title || "Assessment"}`;
    const details = `PrairieLearn assessment deadline.\n${resolvedUrl}`;
    const params = new URLSearchParams({
      action: "TEMPLATE",
      text: title,
      dates: `${startUtc}/${endUtc}`,
      details: details,
    });
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }

  function buildOutlookWebComposeUrl(item, origin = "https://us.prairielearn.com", now = Date.now()) {
    if (!isEligibleForCalendarAction(item, origin, now)) return null;
    const resolvedUrl = resolvePrairieLearnAssessmentUrl(item?.href || item?.absoluteUrl, origin);
    if (!resolvedUrl) return null;
    const deadline = getDeadlineAt(item);
    const end = new Date(deadline);
    const start = new Date(end.getTime() - 15 * 60 * 1000);
    const course = item.courseLabel || "PrairieLearn";
    const badge = item.badge ? ` · ${item.badge}` : "";
    const title = `Due: ${course}${badge} · ${item.title || "Assessment"}`;
    const details = `PrairieLearn assessment deadline.\n${resolvedUrl}`;
    const params = new URLSearchParams({
      path: "/calendar/action/compose",
      rru: "addevent",
      subject: title,
      startdt: start.toISOString(),
      enddt: end.toISOString(),
      body: details,
    });
    return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
  }

  function filterCalendarItemsByScope(items, scope = "all", options = {}, now = Date.now()) {
    const eligible = selectCalendarItems(items, now);
    const normalizedScope = String(scope || "all").toLowerCase();
    if (normalizedScope === "course") {
      const targetId = String(options.courseInstanceId || "").trim();
      if (!targetId) return [];
      return eligible.filter((item) => String(item.courseInstanceId || "").trim() === targetId);
    }
    if (normalizedScope === "week" || normalizedScope === "7days") {
      const horizon = now + 7 * 24 * 60 * 60 * 1000;
      return eligible.filter((item) => {
        const due = Date.parse(getDeadlineAt(item));
        return !Number.isNaN(due) && due <= horizon;
      });
    }
    return eligible;
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

  async function buildIcs(items, origin, now = Date.now(), options = {}) {
    const scope = options.scope || "all";
    const eligible = filterCalendarItemsByScope(items, scope, options, now);
    if (options.requireNonEmpty && eligible.length === 0) {
      return null;
    }
    const events = [];
    for (const item of eligible) {
      const event = await buildCalendarEvent(item, origin);
      if (!event) continue;
      const dtStart = formatIcsUtc(event.start.dateTime);
      const dtEnd = formatIcsUtc(event.end.dateTime);
      const valarms = buildValarmBlocks(event.end.dateTime, now);
      const lines = [
        "BEGIN:VEVENT",
        `UID:${event.id}@prairielearn-tracker`,
        `DTSTAMP:${formatIcsUtc(new Date(now).toISOString())}`,
        `DTSTART:${dtStart}`,
        `DTEND:${dtEnd}`,
        `SUMMARY:${escapeIcs(event.summary)}`,
        `DESCRIPTION:${escapeIcs(event.description)}`,
        `URL:${event.source.url}`,
      ];
      if (valarms.length > 0) {
        lines.push(...valarms);
      }
      lines.push("END:VEVENT");
      events.push(lines.join("\r\n"));
    }
    return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//PrairieLearn Tracker//EN", "CALSCALE:GREGORIAN", ...events, "END:VCALENDAR", ""].join("\r\n");
  }

  function isAssessment100PercentCompleted(score) {
    const percent = parseScorePercent(score);
    return percent !== null && percent >= 100;
  }

  function isAssessmentActiveOrDueSoon(item, now = Date.now(), horizonDays = 7) {
    if (!item || typeof item !== "object") return true;
    const status = String(item.status || "").toLowerCase();
    const avail = String(item.availabilityText || "");
    const score = String(item.scoreText || item.score || "");
    if (status === "closed" || /assessment closed/i.test(avail) || /assessment closed/i.test(score)) {
      return false;
    }
    if (hasUsableDeadline(item)) {
      const due = Date.parse(getDeadlineAt(item));
      if (Number.isNaN(due)) return true;
      if (due <= now) return false;
      return due <= now + horizonDays * 24 * 60 * 60 * 1000;
    }
    if (/^Available\b/i.test(avail)) {
      return false;
    }
    return true;
  }

  function matchesAssessmentSearch(item, query) {
    const q = normalizeWhitespace(query).toLowerCase();
    if (!q) return true;
    const parts = [
      item?.title,
      item?.badge,
      item?.group,
      item?.searchableText,
      item?.availabilityText,
    ].filter(Boolean).map((s) => String(s).toLowerCase());
    return parts.some((p) => p.includes(q));
  }

  function filterAssessmentItem(item, filters = {}, context = {}) {
    if (!item || typeof item !== "object") return true;
    const now = context.now || Date.now();
    const horizonDays = context.horizonDays || 7;

    if (filters.hideCompleted && isAssessment100PercentCompleted(item.score || item.scoreText)) {
      return false;
    }
    if (filters.onlyActiveDueSoon && !isAssessmentActiveOrDueSoon(item, now, horizonDays)) {
      return false;
    }
    if (filters.query && !matchesAssessmentSearch(item, filters.query)) {
      return false;
    }
    return true;
  }

  function computeFilteredAssessmentGroups(groups, filters = {}, context = {}) {
    let visibleItemCount = 0;
    let totalItemCount = 0;
    const processedGroups = (Array.isArray(groups) ? groups : []).map((group) => {
      const items = Array.isArray(group?.items) ? group.items : [];
      totalItemCount += items.length;
      const filteredItems = items.map((item) => {
        const itemData = item?.data || item;
        const isVisible = filterAssessmentItem(itemData, filters, context);
        if (isVisible) visibleItemCount += 1;
        return { ...item, isVisible };
      });
      const groupVisible = filteredItems.some((it) => it.isVisible);
      return {
        ...group,
        items: filteredItems,
        isVisible: groupVisible,
      };
    });
    return {
      totalItemCount,
      visibleItemCount,
      groups: processedGroups,
    };
  }

  global.PrairieLearnTrackerCore = {
    normalizeWhitespace,
    parsePrairieTimestamp,
    parseVisibleUntil,
    getDeadlineInfo,
    parseScorePercent,
    hasUsableDeadline,
    getDeadlineAt,
    selectUpcoming,
    selectCalendarItems,
    canonicalAssessmentIdentity,
    sha256Hex,
    stableEventId,
    buildCalendarEvent,
    buildIcs,
    escapeIcs,
    formatIcsUtc,
    formatUtcCompact,
    resolvePrairieLearnAssessmentUrl,
    isEligibleForCalendarAction,
    buildGoogleCalendarComposeUrl,
    buildOutlookWebComposeUrl,
    filterCalendarItemsByScope,
    buildValarmBlocks,
    isAssessment100PercentCompleted,
    isAssessmentActiveOrDueSoon,
    matchesAssessmentSearch,
    filterAssessmentItem,
    computeFilteredAssessmentGroups,
  };
})(globalThis);
