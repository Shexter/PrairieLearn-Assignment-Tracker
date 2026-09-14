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

const openPtButton = document.getElementById("openPtBtn");
if (openPtButton) {
  openPtButton.addEventListener("click", () => {
    chrome.tabs.create({ url: "https://us.prairietest.com/pt" });
  });
}

void loadDashboard();

async function loadDashboard() {
  setBusy(true, "Loading dashboard...");
  try {
    try {
      badgeColorOverridesCache = await getBadgeColorOverrides();
    } catch {
      badgeColorOverridesCache = {};
    }
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

  renderPrairieTestAlert(data);

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
    row.appendChild(renderCourseCell(item, badgeColorOverridesCache));
    row.appendChild(renderAssessmentCell(item, badgeColorOverridesCache));
    row.appendChild(renderDueCell(item));
    row.appendChild(renderStatusCell(item));
    upcomingBody.appendChild(row);
  }
}

function renderPrairieTestAlert(data) {
  const alertEl = document.getElementById("prairieTestAlert");
  if (!alertEl) return;

  const unreserved = Array.isArray(data?.prairietestUnreserved) ? data.prairietestUnreserved : [];
  if (!unreserved.length) {
    alertEl.classList.add("hidden");
    return;
  }

  alertEl.classList.remove("hidden");
  const ptAlertTitle = document.getElementById("ptAlertTitle");
  const ptAlertDesc = document.getElementById("ptAlertDesc");
  const ptAlertBtn = document.getElementById("ptAlertBtn");

  const count = unreserved.length;
  if (ptAlertTitle) {
    ptAlertTitle.textContent = `Action Required: ${count} Unreserved PrairieTest Exam${count > 1 ? "s" : ""}!`;
  }
  const first = unreserved[0];
  const deadlineText = first.reserveDeadlineFormatted ? `Recommended to reserve before ${first.reserveDeadlineFormatted}` : "Reserve your exam timeslot";
  if (ptAlertDesc) {
    ptAlertDesc.textContent = `${first.title}: ${deadlineText}`;
  }
  if (ptAlertBtn) {
    ptAlertBtn.onclick = () => {
      chrome.tabs.create({ url: first.reserveUrl || "https://us.prairietest.com/pt" });
    };
  }
}

const STORAGE_BADGE_COLOR_OVERRIDES_KEY = "badge_color_overrides";

const PL_BADGE_PALETTES = [
  { id: "color-purple3", label: "Purple", text: "#2a0938", bg: "#dcaaf1", border: "#5e147d" },
  { id: "color-blue1", label: "Cyan", text: "#006f8c", bg: "#b0eeff", border: "#39d5ff" },
  { id: "color-blue2", label: "Blue", text: "#084465", bg: "#9cd7f7", border: "#1297e0" },
  { id: "color-blue3", label: "Dark Blue", text: "#002748", bg: "#7ec4ff", border: "#0057a0" },
  { id: "color-yellow3", label: "Yellow", text: "#604800", bg: "#ffe289", border: "#d6a100" },
  { id: "color-green2", label: "Green", text: "#155c33", bg: "#aaecc6", border: "#2ecc71" },
  { id: "color-pink2", label: "Pink", text: "#95053c", bg: "#fdbed6", border: "#fa5c98" },
  { id: "color-red2", label: "Red", text: "#9c0f00", bg: "#ffc4be", border: "#ff6c5c" },
  { id: "color-orange2", label: "Orange", text: "#a32b00", bg: "#ffd3c4", border: "#ff926b" },
  { id: "color-turquoise2", label: "Turquoise", text: "#125b56", bg: "#a5eee9", border: "#27cbc0" },
  { id: "color-gray2", label: "Gray", text: "#414141", bg: "#d3d3d3", border: "#909090" },
];

let badgeColorOverridesCache = {};

function getBadgePrefix(badge) {
  if (!badge) return "";
  const str = String(badge).trim();
  const match = str.match(/^[A-Za-z]+/);
  return match ? match[0].toUpperCase() : str.toUpperCase();
}

function resolveBadgeColor(itemOrBadge, overrides = {}) {
  const badgeStr = typeof itemOrBadge === "string" ? itemOrBadge : itemOrBadge?.badge || "";
  const colorClass = typeof itemOrBadge === "object" ? itemOrBadge?.colorClass : null;
  const isPrairieTest = typeof itemOrBadge === "object" ? itemOrBadge?.isPrairieTest : false;

  const prefix = getBadgePrefix(badgeStr);

  const override = overrides[badgeStr] || overrides[prefix] || overrides[prefix.toLowerCase()];
  if (override) {
    if (typeof override === "string") {
      const found = PL_BADGE_PALETTES.find((p) => p.id === override);
      if (found) return { className: found.id, ...found };
      return { customHex: override, bg: override, text: "#ffffff", border: override };
    }
    if (typeof override === "object") {
      return override;
    }
  }

  if (isPrairieTest || prefix === "EXAM") {
    const redPreset = PL_BADGE_PALETTES.find((p) => p.id === "color-red2");
    return { className: "color-red2", ...redPreset };
  }

  if (colorClass && colorClass.startsWith("color-")) {
    const found = PL_BADGE_PALETTES.find((p) => p.id === colorClass);
    return { className: colorClass, ...(found || {}) };
  }

  const DEFAULT_MAP = {
    P: "color-purple3",
    QI: "color-blue1",
    Q: "color-blue2",
    T: "color-yellow3",
    L: "color-blue3",
    I: "color-purple1",
    R: "color-pink2",
    HW: "color-green2",
    EXAM: "color-red2",
  };

  const defaultId = DEFAULT_MAP[prefix];
  if (defaultId) {
    const found = PL_BADGE_PALETTES.find((p) => p.id === defaultId);
    return { className: defaultId, ...(found || {}) };
  }

  let hash = 0;
  for (let i = 0; i < prefix.length; i++) {
    hash = (hash * 31 + prefix.charCodeAt(i)) % PL_BADGE_PALETTES.length;
  }
  const hashed = PL_BADGE_PALETTES[hash];
  return { className: hashed.id, ...hashed };
}

function applyBadgeStyle(badgeEl, itemOrBadge, overrides = {}) {
  const badgeStr = typeof itemOrBadge === "string" ? itemOrBadge : itemOrBadge?.badge || "";
  const style = resolveBadgeColor(itemOrBadge, overrides);
  const prefix = getBadgePrefix(badgeStr);

  Array.from(badgeEl.classList).forEach((cls) => {
    if (cls.startsWith("color-")) {
      badgeEl.classList.remove(cls);
    }
  });

  if (style.className) {
    badgeEl.classList.add(style.className);
    badgeEl.style.backgroundColor = "";
    badgeEl.style.color = "";
    badgeEl.style.borderColor = "";
  } else if (style.customHex) {
    badgeEl.style.backgroundColor = style.bg;
    badgeEl.style.color = style.text || "#ffffff";
    badgeEl.style.borderColor = style.border || style.bg;
  }

  badgeEl.title = `Tag: ${badgeStr} (Click to change color for "${prefix}" tags)`;
  badgeEl.style.cursor = "pointer";
  badgeEl.setAttribute("data-badge-prefix", prefix);
  badgeEl.setAttribute("data-badge-tag", badgeStr);
}

function closeBadgeColorPicker() {
  const existing = document.getElementById("pl-badge-color-picker-popover");
  if (existing) existing.remove();
}

async function getBadgeColorOverrides() {
  return new Promise((resolve) => {
    if (typeof chrome === "undefined" || !chrome.storage?.local) {
      resolve({});
      return;
    }
    chrome.storage.local.get([STORAGE_BADGE_COLOR_OVERRIDES_KEY], (data) => {
      resolve(data?.[STORAGE_BADGE_COLOR_OVERRIDES_KEY] || {});
    });
  });
}

async function saveBadgeColorOverride(prefix, colorValue) {
  const current = await getBadgeColorOverrides();
  current[prefix] = colorValue;
  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    await chrome.storage.local.set({ [STORAGE_BADGE_COLOR_OVERRIDES_KEY]: current });
  }
}

async function resetBadgeColorOverride(prefix) {
  const current = await getBadgeColorOverrides();
  delete current[prefix];
  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    await chrome.storage.local.set({ [STORAGE_BADGE_COLOR_OVERRIDES_KEY]: current });
  }
}

function openBadgeColorPicker(badgeEl, itemOrBadge, onColorChanged) {
  closeBadgeColorPicker();

  const badgeStr = typeof itemOrBadge === "string" ? itemOrBadge : itemOrBadge?.badge || "";
  const prefix = getBadgePrefix(badgeStr);

  const popover = document.createElement("div");
  popover.id = "pl-badge-color-picker-popover";
  popover.className = "pl-color-picker-popover shadow-lg";

  const header = document.createElement("div");
  header.className = "pl-color-picker-header";
  header.innerHTML = `
    <span>Color for <strong>${prefix}</strong> tags:</span>
    <button type="button" class="pl-color-picker-close" aria-label="Close">&times;</button>
  `;
  header.querySelector(".pl-color-picker-close").onclick = (e) => {
    e.stopPropagation();
    closeBadgeColorPicker();
  };
  popover.appendChild(header);

  const swatchesContainer = document.createElement("div");
  swatchesContainer.className = "pl-color-swatches-grid";

  for (const p of PL_BADGE_PALETTES) {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "pl-color-swatch-btn";
    swatch.title = p.label;
    swatch.style.backgroundColor = p.bg;
    swatch.style.color = p.text;
    swatch.style.borderColor = p.border;
    swatch.textContent = prefix;

    swatch.onclick = async (e) => {
      e.stopPropagation();
      await saveBadgeColorOverride(prefix, p.id);
      closeBadgeColorPicker();
      if (onColorChanged) onColorChanged(prefix, p.id);
    };
    swatchesContainer.appendChild(swatch);
  }
  popover.appendChild(swatchesContainer);

  const footer = document.createElement("div");
  footer.className = "pl-color-picker-footer";

  const customLabel = document.createElement("label");
  customLabel.className = "pl-color-custom-label";
  customLabel.textContent = "Custom: ";
  const colorInput = document.createElement("input");
  colorInput.type = "color";
  colorInput.value = "#ff4d4f";
  colorInput.className = "pl-color-input";
  colorInput.onchange = async (e) => {
    const hex = e.target.value;
    await saveBadgeColorOverride(prefix, hex);
    closeBadgeColorPicker();
    if (onColorChanged) onColorChanged(prefix, hex);
  };
  customLabel.appendChild(colorInput);
  footer.appendChild(customLabel);

  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "pl-color-reset-btn";
  resetBtn.textContent = "Reset Default";
  resetBtn.onclick = async (e) => {
    e.stopPropagation();
    await resetBadgeColorOverride(prefix);
    closeBadgeColorPicker();
    if (onColorChanged) onColorChanged(prefix, null);
  };
  footer.appendChild(resetBtn);

  popover.appendChild(footer);

  document.body.appendChild(popover);
  const rect = badgeEl.getBoundingClientRect();
  const popoverRect = popover.getBoundingClientRect();

  let top = rect.bottom + window.scrollY + 4;
  let left = rect.left + window.scrollX;

  if (left + popoverRect.width > window.innerWidth - 10) {
    left = window.innerWidth - popoverRect.width - 10;
  }
  if (left < 10) left = 10;

  popover.style.top = `${top}px`;
  popover.style.left = `${left}px`;

  const onDocClick = (e) => {
    if (!popover.contains(e.target) && e.target !== badgeEl) {
      closeBadgeColorPicker();
      document.removeEventListener("click", onDocClick);
    }
  };
  setTimeout(() => document.addEventListener("click", onDocClick), 10);
}

function refreshAllBadgeColorsInDocument(doc, overrides) {
  const badges = Array.from(doc.querySelectorAll(".badge, .badge-exam"));
  for (const el of badges) {
    const tag = el.getAttribute("data-badge-tag") || el.textContent.trim();
    const isPT = el.classList.contains("badge-exam") || tag.toUpperCase() === "EXAM";
    const existingColorClass = el.getAttribute("data-original-color-class") ||
      Array.from(el.classList).find((c) => c.startsWith("color-")) || null;
    applyBadgeStyle(el, { badge: tag, isPrairieTest: isPT, colorClass: existingColorClass }, overrides);
  }
}

function applyBadgeColorAndPicker(badgeEl, itemOrBadge, overrides) {
  if (itemOrBadge?.colorClass) {
    badgeEl.setAttribute("data-original-color-class", itemOrBadge.colorClass);
  }
  applyBadgeStyle(badgeEl, itemOrBadge, overrides || badgeColorOverridesCache);

  badgeEl.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    openBadgeColorPicker(badgeEl, itemOrBadge, (changedPrefix, newColor) => {
      if (newColor) {
        badgeColorOverridesCache[changedPrefix] = newColor;
      } else {
        delete badgeColorOverridesCache[changedPrefix];
      }
      refreshAllBadgeColorsInDocument(document, badgeColorOverridesCache);
    });
  });
}

if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[STORAGE_BADGE_COLOR_OVERRIDES_KEY]) {
      badgeColorOverridesCache = changes[STORAGE_BADGE_COLOR_OVERRIDES_KEY].newValue || {};
      refreshAllBadgeColorsInDocument(document, badgeColorOverridesCache);
    }
  });
}

function renderCourseCell(item, overrides = badgeColorOverridesCache) {
  const cell = document.createElement("td");
  cell.textContent = item.courseLabel || "Course";
  if (item.isPrairieTest) {
    const examBadge = document.createElement("span");
    examBadge.className = "badge-exam";
    examBadge.textContent = "Exam";
    applyBadgeColorAndPicker(examBadge, { badge: "Exam", isPrairieTest: true, colorClass: item.colorClass }, overrides);
    cell.appendChild(examBadge);
  }
  return cell;
}

function renderAssessmentCell(item, overrides = badgeColorOverridesCache) {
  const cell = document.createElement("td");
  const wrapper = document.createElement("div");
  wrapper.className = "assessment-title";

  if (item.badge) {
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = item.badge;
    applyBadgeColorAndPicker(badge, item, overrides);
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

  if (item.location) {
    const loc = document.createElement("div");
    loc.className = "sub-meta";
    loc.textContent = `📍 ${item.location}`;
    content.appendChild(loc);
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

  if (item.isPrairieTest && item.durationMinutes) {
    const sub = document.createElement("span");
    sub.className = "sub";
    sub.textContent = `${item.durationMinutes} min session`;
    cell.appendChild(sub);
  } else if (!item.dueAt && item.availabilityText) {
    const sub = document.createElement("span");
    sub.className = "sub";
    sub.textContent = item.availabilityText;
    cell.appendChild(sub);
  }

  return cell;
}

function renderStatusCell(item) {
  const cell = document.createElement("td");
  if (item.isPrairieTest) {
    const badge = document.createElement("span");
    badge.className = "badge-exam";
    badge.textContent = "Reserved";
    cell.appendChild(badge);
    return cell;
  }
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
  if (item.isPrairieTest) {
    const due = Date.parse(item.startDate || item.deadlineAt);
    return !Number.isNaN(due) && due > targetNow;
  }
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
  if (item.isPrairieTest) {
    const start = new Date(item.startDate || item.deadlineAt);
    const end = new Date(item.endDate || (start.getTime() + (item.durationMinutes || 60) * 60 * 1000));
    const startUtc = formatUtcCompact(start);
    const endUtc = formatUtcCompact(end);
    if (!startUtc || !endUtc) return null;
    const title = `Exam: ${item.fullTitle || item.title || "PrairieTest Exam"}`;
    const details = [
      "PrairieTest Exam Reservation",
      item.location ? `Location: ${item.location}` : null,
      item.sessionDetails ? `Details: ${item.sessionDetails}` : null,
      `Reservation: ${item.href || item.absoluteUrl || "https://us.prairietest.com/pt"}`,
    ].filter(Boolean).join("\n");
    const params = new URLSearchParams({
      action: "TEMPLATE",
      text: title,
      dates: `${startUtc}/${endUtc}`,
      details,
      location: item.location || "",
    });
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }
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
  if (item.isPrairieTest) {
    const start = new Date(item.startDate || item.deadlineAt);
    const end = new Date(item.endDate || (start.getTime() + (item.durationMinutes || 60) * 60 * 1000));
    const title = `Exam: ${item.fullTitle || item.title || "PrairieTest Exam"}`;
    const details = [
      "PrairieTest Exam Reservation",
      item.location ? `Location: ${item.location}` : null,
      item.sessionDetails ? `Details: ${item.sessionDetails}` : null,
      `Reservation: ${item.href || item.absoluteUrl || "https://us.prairietest.com/pt"}`,
    ].filter(Boolean).join("\n");
    const params = new URLSearchParams({
      path: "/calendar/action/compose",
      rru: "addevent",
      subject: title,
      startdt: start.toISOString(),
      enddt: end.toISOString(),
      body: details,
      location: item.location || "",
    });
    return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
  }
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
    resolveBadgeColor,
    getBadgePrefix,
    applyBadgeStyle,
    PL_BADGE_PALETTES,
  };
}
