const refreshButton = document.getElementById("refreshBtn");
const openHomeButton = document.getElementById("openHomeBtn");
const statusLine = document.getElementById("statusLine");
const metaLine = document.getElementById("metaLine");
const upcomingBody = document.getElementById("upcomingBody");
const emptyState = document.getElementById("emptyState");
const calendarButton = document.getElementById("calendarBtn");
const icsButton = document.getElementById("icsBtn");

let latestOrigin = null;

calendarButton.addEventListener("click", async () => {
  setBusy(true, "Syncing future published deadlines to Google Calendar...");
  try {
    const response = await sendMessage({ type: "PL_SYNC_GOOGLE_CALENDAR" });
    if (!response?.ok) throw new Error(response?.error || "Google Calendar sync failed.");
    const result = response.result || {};
    statusLine.textContent = `Calendar sync: ${result.created || 0} created, ${result.updated || 0} updated, ${result.unchanged || 0} unchanged${result.failed ? `, ${result.failed} failed` : ""}.`;
  } catch (error) {
    statusLine.textContent = `Calendar sync unavailable: ${toErrorMessage(error)}. Use Download .ics instead.`;
  } finally {
    setBusy(false);
  }
});

icsButton.addEventListener("click", async () => {
  icsButton.disabled = true;
  const icsScopeSelect = document.getElementById("icsScopeSelect");
  const scope = icsScopeSelect?.value || "all";
  const scopeLabel = scope === "week" ? "next 7 days" : "all future";
  statusLine.textContent = `Preparing ${scopeLabel} calendar file...`;
  try {
    const response = await sendMessage({
      type: "PL_EXPORT_CALENDAR_ICS",
      payload: { scope },
    });
    if (!response?.ok || typeof response.ics !== "string") throw new Error(response?.error || "Calendar file export failed.");
    const blobUrl = URL.createObjectURL(new Blob([response.ics], { type: "text/calendar;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = response.filename || "prairielearn-deadlines.ics";
    link.click();
    URL.revokeObjectURL(blobUrl);
    const countMsg = response.count ? ` (${response.count} deadline${response.count === 1 ? "" : "s"})` : "";
    statusLine.textContent = `Calendar file downloaded${countMsg}. Import it into your calendar app.`;
  } catch (error) {
    statusLine.textContent = `Calendar file export failed: ${toErrorMessage(error)}`;
  } finally {
    icsButton.disabled = false;
  }
});

refreshButton.addEventListener("click", async () => {
  setBusy(true, "Refreshing PrairieLearn data...");
  try {
    const payload = latestOrigin ? { origin: latestOrigin } : {};
    const response = await sendMessage({ type: "PL_REFRESH_REQUEST", payload });
    if (!response?.ok) {
      throw new Error(response?.error || "Refresh failed.");
    }
    renderDashboard(response.data);
    if (response.refreshSummary) {
      statusLine.textContent = formatRefreshSummary(response.refreshSummary);
    }
  } catch (error) {
    statusLine.textContent = `Refresh failed: ${toErrorMessage(error)}`;
  } finally {
    setBusy(false);
  }
});

openHomeButton.addEventListener("click", () => {
  const origin = latestOrigin || "https://us.prairielearn.com";
  chrome.tabs.create({ url: `${origin}/` });
});

void loadDashboard();

async function loadDashboard() {
  setBusy(true, "Loading dashboard...");
  try {
    const response = await sendMessage({ type: "PL_GET_DASHBOARD" });
    if (!response?.ok) {
      throw new Error(response?.error || "Failed to load dashboard.");
    }
    renderDashboard(response.data);
  } catch (error) {
    statusLine.textContent = `Failed to load: ${toErrorMessage(error)}`;
    emptyState.textContent =
      "Open your PrairieLearn home page once while logged in, then click Refresh.";
    emptyState.classList.remove("hidden");
  } finally {
    setBusy(false);
  }
}

function renderDashboard(data) {
  const meta = data?.meta || null;
  const upcoming = Array.isArray(data?.upcoming) ? data.upcoming : [];
  const stats = data?.stats || { courseSnapshots: 0, assessments: 0, upcoming: 0 };

  latestOrigin = typeof meta?.origin === "string" ? meta.origin : null;

  if (meta?.lastError) {
    statusLine.textContent = `Last refresh warning: ${meta.lastError}`;
  } else if (meta?.lastRefreshAt) {
    statusLine.textContent = `Last refresh: ${formatDateTime(meta.lastRefreshAt)}`;
  } else {
    statusLine.textContent = "No refresh has run yet.";
  }

  const courseCount = stats.courseSnapshots || 0;
  const totalAssessments = stats.assessments || 0;
  const upcomingCount = stats.upcoming || 0;
  metaLine.textContent = `${courseCount} courses synced, ${totalAssessments} assessments parsed, ${upcomingCount} upcoming`;

  upcomingBody.innerHTML = "";
  if (!upcoming.length) {
    emptyState.textContent = meta?.origin
      ? "No upcoming assessments found. Try refreshing after visiting your course pages."
      : "No PrairieLearn data found yet. Open PrairieLearn home page and click Refresh.";
    emptyState.classList.remove("hidden");
    return;
  }

  emptyState.classList.add("hidden");
  for (const item of upcoming) {
    const row = document.createElement("tr");
    row.appendChild(renderCourseCell(item));
    row.appendChild(renderAssessmentCell(item));
    row.appendChild(renderDueCell(item));
    row.appendChild(renderStatusCell(item));
    upcomingBody.appendChild(row);
  }
}

function renderCourseCell(item) {
  const cell = document.createElement("td");
  cell.textContent = item.courseLabel || "Course";
  return cell;
}

function renderAssessmentCell(item) {
  const cell = document.createElement("td");
  const wrapper = document.createElement("div");
  wrapper.className = "assessment-title";

  if (item.badge) {
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = item.badge;
    wrapper.appendChild(badge);
  }

  const content = document.createElement("div");
  if (item.href) {
    const link = document.createElement("a");
    link.className = "assessment-link";
    link.href = item.href;
    link.textContent = item.title || "Untitled";
    link.target = "_blank";
    link.rel = "noreferrer";
    content.appendChild(link);
  } else {
    content.textContent = item.title || "Untitled";
  }

  if (item.group) {
    const group = document.createElement("span");
    group.className = "sub";
    group.textContent = item.group;
    content.appendChild(group);
  }

  wrapper.appendChild(content);
  const calMenu = renderCalendarActionMenu(item, latestOrigin || "https://us.prairielearn.com");
  if (calMenu) {
    wrapper.appendChild(calMenu);
  }
  cell.appendChild(wrapper);
  return cell;
}

function renderDueCell(item) {
  const cell = document.createElement("td");
  cell.textContent = item.dueAt ? formatDateTime(item.dueAt) : "No due date";

  if (!item.dueAt && item.availabilityText) {
    const sub = document.createElement("span");
    sub.className = "sub";
    sub.textContent = item.availabilityText;
    cell.appendChild(sub);
  }

  return cell;
}

function renderStatusCell(item) {
  const cell = document.createElement("td");
  const percent = parseScorePercent(item.score);

  const progressContainer = document.createElement("div");
  progressContainer.className = "pl-progress";

  let fillPercent = 0;
  let colorClass = "secondary";
  let label = "";

  if (percent !== null) {
    fillPercent = Math.min(percent, 100);
    if (percent >= 100) {
      colorClass = "success";
    } else if (percent >= 50) {
      colorClass = "primary";
    } else if (percent > 0) {
      colorClass = "warning";
    } else {
      colorClass = "secondary";
    }
    label = `${percent}%`;
  }

  progressContainer.classList.add(`border-${colorClass}`);

  const fill = document.createElement("div");
  fill.className = `pl-progress-fill bg-${colorClass}`;
  fill.style.width = `${fillPercent}%`;
  if (label && fillPercent >= 15) {
    fill.textContent = label;
  }
  progressContainer.appendChild(fill);

  const remainder = document.createElement("div");
  remainder.className = "pl-progress-remainder";
  remainder.style.width = `${100 - fillPercent}%`;
  if (percent === null) {
    remainder.textContent = statusToLabel(item.status);
  } else if (label && fillPercent < 15) {
    remainder.textContent = label;
  }
  progressContainer.appendChild(remainder);

  cell.appendChild(progressContainer);
  return cell;
}

function parseScorePercent(score) {
  if (typeof score !== "string") {
    return null;
  }
  const match = score.match(/(\d+(?:\.\d+)?)\s*%/);
  if (!match) {
    return null;
  }
  const value = parseFloat(match[1]);
  return Number.isNaN(value) ? null : Math.round(value * 10) / 10;
}

function statusToLabel(status) {
  if (status === "not_started") {
    return "Not started";
  }
  if (status === "action_available") {
    return "Start";
  }
  if (status === "scored") {
    return "Scored";
  }
  if (status === "text_status") {
    return "In progress";
  }
  return "—";
}

function formatDateTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "Invalid date";
  }

  return date.toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRefreshSummary(summary) {
  const succeeded = summary?.succeeded ?? 0;
  const failed = summary?.failed ?? 0;
  const total = summary?.requestedCourseCount ?? succeeded + failed;
  const mode = summary?.mode === "page_context" ? " (page context)" : "";
  const base = `Refreshed ${succeeded}/${total} courses${failed ? `, ${failed} failed` : ""}${mode}.`;
  if (!failed || !Array.isArray(summary?.errors) || summary.errors.length === 0) {
    return base;
  }

  const details = summary.errors
    .slice(0, 2)
    .map((entry) => `${entry?.courseInstanceId || "?"}: ${entry?.error || "Unknown failure"}`)
    .join(" | ");
  const suffix = summary.errors.length > 2 ? ` (+${summary.errors.length - 2} more)` : "";
  return `${base} ${details}${suffix}`;
}

function setBusy(isBusy, message) {
  refreshButton.disabled = isBusy;
  if (isBusy && message) {
    statusLine.textContent = message;
  }
}

function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        reject(new Error(runtimeError.message));
        return;
      }
      resolve(response);
    });
  });
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

function formatUtcCompact(value) {
  const date = value instanceof Date ? value : new Date(value);
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

function buildGoogleCalendarComposeUrl(item, origin = "https://us.prairielearn.com", now = Date.now()) {
  if (!isEligibleForCalendarAction(item, origin, now)) return null;
  const resolvedUrl = resolvePrairieLearnAssessmentUrl(item?.href || item?.absoluteUrl, origin);
  if (!resolvedUrl) return null;
  const deadline = item.deadlineAt || (item.deadlineSource ? item.dueAt : null);
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
  const deadline = item.deadlineAt || (item.deadlineSource ? item.dueAt : null);
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

async function exportSingleAssessmentIcs(item, origin = "https://us.prairielearn.com") {
  if (!isEligibleForCalendarAction(item, origin)) {
    return;
  }
  try {
    const response = await sendMessage({
      type: "PL_EXPORT_CALENDAR_ICS",
      payload: { singleAssessment: item },
    });
    if (!response?.ok || typeof response.ics !== "string") {
      throw new Error(response?.error || "Export failed.");
    }
    const blob = new Blob([response.ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = response.filename || "prairielearn-deadline.ics";
    link.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.warn("[PL Tracker] Single assessment ICS download failed:", toErrorMessage(err));
  }
}

function renderCalendarActionMenu(item, origin = "https://us.prairielearn.com") {
  if (!isEligibleForCalendarAction(item, origin)) {
    return null;
  }

  const container = document.createElement("div");
  container.className = "pl-cal-menu-container";

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "pl-cal-menu-toggle";
  toggle.setAttribute("aria-haspopup", "true");
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-label", `Add ${item.title || "assessment"} to calendar`);
  toggle.title = "Add to calendar";
  toggle.textContent = "📅";

  const menu = document.createElement("div");
  menu.className = "pl-cal-dropdown-menu";

  const googleItem = document.createElement("button");
  googleItem.type = "button";
  googleItem.textContent = "Google Calendar";
  googleItem.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeMenu();
    const url = buildGoogleCalendarComposeUrl(item, origin);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  });

  const outlookItem = document.createElement("button");
  outlookItem.type = "button";
  outlookItem.textContent = "Outlook Web";
  outlookItem.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeMenu();
    const url = buildOutlookWebComposeUrl(item, origin);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  });

  const icsItem = document.createElement("button");
  icsItem.type = "button";
  icsItem.textContent = "Apple / iCal (.ics)";
  icsItem.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeMenu();
    await exportSingleAssessmentIcs(item, origin);
  });

  menu.appendChild(googleItem);
  menu.appendChild(outlookItem);
  menu.appendChild(icsItem);

  function openMenu() {
    menu.style.display = "block";
    toggle.setAttribute("aria-expanded", "true");
    googleItem.focus();
  }

  function closeMenu() {
    menu.style.display = "none";
    toggle.setAttribute("aria-expanded", "false");
  }

  toggle.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const isOpen = menu.style.display === "block";
    if (isOpen) {
      closeMenu();
    } else {
      openMenu();
    }
  });

  container.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      closeMenu();
      toggle.focus();
    }
  });

  document.addEventListener("click", (e) => {
    if (!container.contains(e.target)) {
      closeMenu();
    }
  });

  container.appendChild(toggle);
  container.appendChild(menu);
  return container;
}

if (typeof window !== "undefined") {
  window.__PL_POPUP_RUNTIME__ = {
    resolvePrairieLearnAssessmentUrl,
    isEligibleForCalendarAction,
    buildGoogleCalendarComposeUrl,
    buildOutlookWebComposeUrl,
  };
}
