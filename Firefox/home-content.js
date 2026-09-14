const REFRESH_CONCURRENCY = 3;
const HOME_CARD_ID = "pl-tracker-upcoming-card";
const HOME_CARD_BODY_ID = "pl-tracker-upcoming-body";
const HOME_CARD_SUBTITLE_ID = "pl-tracker-upcoming-subtitle";
const HOME_CARD_REFRESH_ID = "pl-tracker-upcoming-refresh";
const HOME_CARD_CALENDAR_ID = "pl-tracker-upcoming-calendar";
const HOME_CARD_EXPORT_ID = "pl-tracker-upcoming-export";
const HOME_CARD_EMPTY_CLASS = "pl-tracker-upcoming-empty";
const ASSESSMENT_PIN_BUTTON_CLASS = "pl-tracker-pin-btn";
const PRAIRIE_TEST_HOSTNAME = "us.prairielearn.com";
const PRAIRIE_TEST_URL = "https://us.prairietest.com/pt";
const PRAIRIE_TEST_NAV_ITEM_ID = "pl-tracker-prairietest-link";

if (shouldInjectPrairieTestLink()) {
  initPrairieTestHeaderLink();
}

if (isPrairieLearnHomePage()) {
  void initHomeUpcomingSection();
}

if (isAssessmentsPage()) {
  void initAssessmentsPinButtons();
  void initCourseAssessmentsFilterToolbar();
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== "object") {
    return;
  }

  if (message.type !== "PL_PAGE_REFRESH_REQUEST") {
    return;
  }

  void (async () => {
    try {
      const result = await runRefreshInPageContext(message.payload || {});
      sendResponse({ ok: true, ...result });
    } catch (error) {
      sendResponse({ ok: false, error: toErrorMessage(error) });
    }
  })();

  return true;
});

async function initHomeUpcomingSection() {
  const host = await waitForHomeCardsHost(10000);
  if (!host) {
    return;
  }

  ensureHomeUpcomingCard(host);
  await refreshAndRenderHomeUpcoming();
}

function isPrairieLearnHomePage() {
  const path = window.location.pathname || "/";
  return path === "/" || path === "/pl" || path === "/pl/";
}

function isAssessmentsPage() {
  const path = window.location.pathname || "";
  return /^\/pl\/course_instance\/\d+\/assessments\/?$/.test(path);
}

function shouldInjectPrairieTestLink() {
  return window.location.hostname.toLowerCase() === PRAIRIE_TEST_HOSTNAME;
}

function initPrairieTestHeaderLink() {
  if (ensurePrairieTestHeaderLink()) {
    return;
  }

  const observer = new MutationObserver(() => {
    if (ensurePrairieTestHeaderLink()) {
      observer.disconnect();
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.setTimeout(() => observer.disconnect(), 10000);
}

function ensurePrairieTestHeaderLink() {
  const navList = document.querySelector("#course-nav #main-nav") || document.querySelector("#main-nav");
  if (!navList) {
    return false;
  }

  const existingItem = navList.querySelector(`#${PRAIRIE_TEST_NAV_ITEM_ID}`);
  if (existingItem) {
    const link = existingItem.querySelector("a.nav-link");
    if (link) updatePrairieTestHeaderBadge(link);
    return true;
  }

  const existingLink = Array.from(navList.querySelectorAll("a")).find((anchor) => {
    const label = normalizeWhitespace(anchor.textContent).toLowerCase();
    return (
      label === "prairietest" ||
      label === "prairie test" ||
      anchor.href.startsWith(PRAIRIE_TEST_URL)
    );
  });
  if (existingLink) {
    updatePrairieTestHeaderBadge(existingLink);
    return true;
  }

  const navItem = document.createElement("li");
  navItem.id = PRAIRIE_TEST_NAV_ITEM_ID;
  navItem.className = "nav-item";

  const link = document.createElement("a");
  link.className = "nav-link";
  link.href = PRAIRIE_TEST_URL;
  link.textContent = "PrairieTest";
  navItem.appendChild(link);
  updatePrairieTestHeaderBadge(link);

  const homeItem = Array.from(navList.querySelectorAll(":scope > li.nav-item")).find((item) => {
    const homeLink = item.querySelector("a.nav-link");
    if (!homeLink) {
      return false;
    }

    const label = normalizeWhitespace(homeLink.textContent).toLowerCase();
    const href = (homeLink.getAttribute("href") || "").trim();
    return label === "home" || href === "/" || href === "/pl" || href === "/pl/";
  });

  if (homeItem?.parentElement === navList) {
    homeItem.insertAdjacentElement("afterend", navItem);
  } else {
    navList.appendChild(navItem);
  }

  return true;
}

function updatePrairieTestHeaderBadge(link) {
  if (!link || typeof chrome === "undefined" || !chrome.storage?.local) return;
  chrome.storage.local.get(["prairietest_unreserved_exams"], (data) => {
    const unreserved = data?.prairietest_unreserved_exams;
    let badge = link.querySelector(".pl-pt-nav-badge");
    if (Array.isArray(unreserved) && unreserved.length > 0) {
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "badge bg-danger ms-1 pl-pt-nav-badge";
        link.appendChild(badge);
      }
      badge.textContent = `⚠️ ${unreserved.length}`;
      link.title = `PrairieTest: You have ${unreserved.length} unreserved exam${unreserved.length > 1 ? "s" : ""}!`;
    } else if (badge) {
      badge.remove();
      link.title = "PrairieTest";
    }
  });
}

if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.prairietest_unreserved_exams) {
      const navItem = document.getElementById(PRAIRIE_TEST_NAV_ITEM_ID);
      const link = navItem?.querySelector("a.nav-link") || document.querySelector(`a[href^="${PRAIRIE_TEST_URL}"]`);
      if (link) {
        updatePrairieTestHeaderBadge(link);
      }
    }
    if (area === "local" && changes[STORAGE_BADGE_COLOR_OVERRIDES_KEY]) {
      badgeColorOverridesCache = changes[STORAGE_BADGE_COLOR_OVERRIDES_KEY].newValue || {};
      refreshAllBadgeColorsInDocument(document, badgeColorOverridesCache);
    }
  });
}

const STORAGE_BADGE_COLOR_OVERRIDES_KEY = "badge_color_overrides";
let badgeColorOverridesCache = {};

const PL_BADGE_PALETTES = [
  { id: "color-red2", label: "Red", bg: "#ffc4be", text: "#9c0f00", border: "#ff6c5c" },
  { id: "color-pink2", label: "Pink", bg: "#fdbed6", text: "#95053c", border: "#fa5c98" },
  { id: "color-purple3", label: "Purple", bg: "#dcaaf1", text: "#2a0938", border: "#5e147d" },
  { id: "color-purple1", label: "Lavender", bg: "#f1e8f3", text: "#72437b", border: "#dcc6e0" },
  { id: "color-blue1", label: "Cyan", bg: "#b0eeff", text: "#006f8c", border: "#39d5ff" },
  { id: "color-blue2", label: "Sky Blue", bg: "#9cd7f7", text: "#084465", border: "#1297e0" },
  { id: "color-blue3", label: "Navy", bg: "#7ec4ff", text: "#002748", border: "#0057a0" },
  { id: "color-turquoise2", label: "Teal", bg: "#a5eee9", text: "#125b56", border: "#27cbc0" },
  { id: "color-green2", label: "Green", bg: "#aaecc6", text: "#155c33", border: "#2ecc71" },
  { id: "color-yellow2", label: "Yellow", bg: "#fbebad", text: "#7f6606", border: "#f5ce32" },
  { id: "color-yellow3", label: "Gold", bg: "#ffe289", text: "#604800", border: "#d6a100" },
  { id: "color-orange2", label: "Orange", bg: "#ffd3c4", text: "#a32b00", border: "#ff926b" },
  { id: "color-gray2", label: "Gray", bg: "#d3d3d3", text: "#414141", border: "#909090" },
];

function getBadgePrefix(badge) {
  if (!badge) return "";
  const trimmed = badge.trim();
  const match = trimmed.match(/^[A-Za-z]+/);
  return match ? match[0].toUpperCase() : trimmed.toUpperCase();
}

function resolveBadgeColor(itemOrBadge, overrides = {}) {
  const badgeStr = typeof itemOrBadge === "string" ? itemOrBadge : itemOrBadge?.badge || "";
  const isPrairieTest = typeof itemOrBadge === "object" ? !!itemOrBadge.isPrairieTest : false;
  const originalColorClass = typeof itemOrBadge === "object" ? itemOrBadge.colorClass : null;

  const prefix = isPrairieTest ? "EXAM" : getBadgePrefix(badgeStr);

  // 1. User overrides have highest precedence
  const userOverride = overrides[prefix] || overrides[badgeStr];
  if (userOverride) {
    if (userOverride.startsWith("color-")) {
      const found = PL_BADGE_PALETTES.find((p) => p.id === userOverride);
      return { className: userOverride, ...(found || {}) };
    }
    return {
      customHex: userOverride,
      bg: userOverride,
      text: "#ffffff",
      border: userOverride,
    };
  }

  // 2. PrairieTest Exam defaults to Red
  if (isPrairieTest || prefix === "EXAM") {
    const red = PL_BADGE_PALETTES.find((p) => p.id === "color-red2");
    return { className: "color-red2", ...(red || {}) };
  }

  // 3. Original PrairieLearn colorClass if captured from page
  if (originalColorClass && originalColorClass.startsWith("color-")) {
    const found = PL_BADGE_PALETTES.find((p) => p.id === originalColorClass);
    return { className: originalColorClass, ...(found || {}) };
  }

  // 4. Default color mapping based on common assignment prefixes
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

  // 5. Deterministic palette assignment for other tags
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
  const prefix = (itemOrBadge?.isPrairieTest || badgeStr.toUpperCase() === "EXAM") ? "EXAM" : getBadgePrefix(badgeStr);

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

  const isPT = itemOrBadge?.isPrairieTest || false;
  const badgeStr = typeof itemOrBadge === "string" ? itemOrBadge : itemOrBadge?.badge || "";
  const prefix = isPT ? "EXAM" : getBadgePrefix(badgeStr);

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
      if (typeof onColorChanged === "function") {
        onColorChanged(prefix, p.id);
      }
    };
    swatchesContainer.appendChild(swatch);
  }
  popover.appendChild(swatchesContainer);

  const footer = document.createElement("div");
  footer.className = "pl-color-picker-footer";

  const customColorLabel = document.createElement("label");
  customColorLabel.className = "pl-color-custom-label";
  customColorLabel.innerHTML = `
    <span>Custom:</span>
    <input type="color" class="pl-color-input" value="#9c0f00">
  `;
  const colorInput = customColorLabel.querySelector("input");
  colorInput.onchange = async (e) => {
    e.stopPropagation();
    const hex = e.target.value;
    await saveBadgeColorOverride(prefix, hex);
    closeBadgeColorPicker();
    if (typeof onColorChanged === "function") {
      onColorChanged(prefix, hex);
    }
  };
  footer.appendChild(customColorLabel);

  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "pl-color-reset-btn";
  resetBtn.textContent = "Reset to Default";
  resetBtn.onclick = async (e) => {
    e.stopPropagation();
    await resetBadgeColorOverride(prefix);
    closeBadgeColorPicker();
    if (typeof onColorChanged === "function") {
      onColorChanged(prefix, null);
    }
  };
  footer.appendChild(resetBtn);

  popover.appendChild(footer);
  document.body.appendChild(popover);

  const rect = badgeEl.getBoundingClientRect();
  const popoverRect = popover.getBoundingClientRect();
  let top = window.scrollY + rect.bottom + 4;
  let left = window.scrollX + rect.left;

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
  const badges = Array.from(doc.querySelectorAll(".badge"));
  for (const el of badges) {
    const tag = el.getAttribute("data-badge-tag") || el.textContent.trim();
    if (!tag) continue;
    const isPT = tag.toUpperCase() === "EXAM";
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

function ensureBadgeStylesInjected() {
  if (typeof document === "undefined" || document.getElementById("pl-tracker-badge-styles")) {
    return;
  }
  const style = document.createElement("style");
  style.id = "pl-tracker-badge-styles";
  style.textContent = `
    .badge.color-red1 { color: #c73000; background-color: #ffebe4; border-color: #ffccbc; }
    .badge.color-red2 { color: #9c0f00; background-color: #ffc4be; border-color: #ff6c5c; }
    .badge.color-red3 { color: #5a140d; background-color: #f2aba3; border-color: #c72c1c; }
    .badge.color-pink1 { color: #c70053; background-color: #ffe4ef; border-color: #ffbcd8; }
    .badge.color-pink2 { color: #95053c; background-color: #fdbed6; border-color: #fa5c98; }
    .badge.color-pink3 { color: #540d28; background-color: #f2a8c4; border-color: #ba1c58; }
    .badge.color-purple1 { color: #72437b; background-color: #f1e8f3; border-color: #dcc6e0; }
    .badge.color-purple2 { color: #472555; background-color: #d7bde2; border-color: #9b59b6; }
    .badge.color-purple3 { color: #2a0938; background-color: #dcaaf1; border-color: #5e147d; }
    .badge.color-blue1 { color: #006f8c; background-color: #b0eeff; border-color: #39d5ff; }
    .badge.color-blue2 { color: #084465; background-color: #9cd7f7; border-color: #1297e0; }
    .badge.color-blue3 { color: #002748; background-color: #7ec4ff; border-color: #0057a0; }
    .badge.color-turquoise1 { color: #047573; background-color: #bffdfc; border-color: #5efaf7; }
    .badge.color-turquoise2 { color: #125b56; background-color: #a5eee9; border-color: #27cbc0; }
    .badge.color-turquoise3 { color: #003f3a; background-color: #6bfff3; border-color: #008c31; }
    .badge.color-green1 { color: #00632d; background-color: #d2ffe6; border-color: #8effc1; }
    .badge.color-green2 { color: #155c33; background-color: #aaecc6; border-color: #2ecc71; }
    .badge.color-green3 { color: #003f16; background-color: #6bff9f; border-color: #008c31; }
    .badge.color-yellow1 { color: #665502; background-color: #fef8db; border-color: #fdeea5; }
    .badge.color-yellow2 { color: #7f6606; background-color: #fbebad; border-color: #f5ce32; }
    .badge.color-yellow3 { color: #604800; background-color: #ffe289; border-color: #d6a100; }
    .badge.color-orange1 { color: #995000; background-color: #fff1e1; border-color: #ffdcb5; }
    .badge.color-orange2 { color: #a32b00; background-color: #ffd3c4; border-color: #ff926b; }
    .badge.color-orange3 { color: #582513; background-color: #ebb8a6; border-color: #c3522b; }
    .badge.color-gray1 { color: #656565; background-color: #f3f3f3; border-color: #e0e0e0; }
    .badge.color-gray2 { color: #414141; background-color: #d3d3d3; border-color: #909090; }
    .badge.color-gray3 { color: #242424; background-color: #bdbdbd; border-color: #505050; }
    .badge[data-badge-prefix]:hover { transform: scale(1.05); filter: brightness(0.95); }
    .pl-color-picker-popover {
      position: absolute;
      z-index: 99999;
      background: #ffffff;
      border: 1px solid #d0d7de;
      border-radius: 8px;
      padding: 10px;
      box-shadow: 0 8px 24px rgba(140, 149, 159, 0.28);
      font-family: inherit;
      font-size: 12px;
      width: 250px;
      animation: plFadeIn 0.15s ease-out;
    }
    @keyframes plFadeIn {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .pl-color-picker-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-weight: 600;
      color: #1f2328;
      margin-bottom: 8px;
      font-size: 11px;
    }
    .pl-color-picker-close {
      background: none;
      border: none;
      font-size: 16px;
      line-height: 1;
      color: #656d76;
      cursor: pointer;
      padding: 0 4px;
    }
    .pl-color-picker-close:hover { color: #1f2328; }
    .pl-color-swatches-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 6px;
      margin-bottom: 10px;
    }
    .pl-color-swatch-btn {
      height: 24px;
      border-radius: 4px;
      border: 1px solid;
      font-size: 10px;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      transition: transform 0.1s ease;
    }
    .pl-color-swatch-btn:hover { transform: scale(1.1); filter: brightness(0.92); }
    .pl-color-picker-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-top: 1px solid #eaeef2;
      padding-top: 8px;
      font-size: 11px;
    }
    .pl-color-custom-label {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      cursor: pointer;
      color: #57606a;
    }
    .pl-color-input {
      width: 22px;
      height: 22px;
      padding: 0;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      background: none;
    }
    .pl-color-reset-btn {
      background: #f6f8fa;
      border: 1px solid #d0d7de;
      border-radius: 4px;
      font-size: 10px;
      color: #57606a;
      padding: 2px 6px;
      cursor: pointer;
    }
    .pl-color-reset-btn:hover { background: #eaeef2; color: #24292f; }
  `;
  (document.head || document.documentElement).appendChild(style);
}

function getHomeCardsHost() {
  return document.querySelector('div[data-component="HomeCards"].js-hydrated-component');
}

async function waitForHomeCardsHost(timeoutMs) {
  const existing = getHomeCardsHost();
  if (existing) {
    return existing;
  }

  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      const next = getHomeCardsHost();
      if (next) {
        observer.disconnect();
        resolve(next);
      }
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.setTimeout(() => {
      observer.disconnect();
      resolve(getHomeCardsHost());
    }, timeoutMs);
  });
}

function ensureHomeUpcomingCard(host) {
  const existing = document.getElementById(HOME_CARD_ID);
  if (existing && host.contains(existing)) {
    return existing;
  }

  const card = createHomeUpcomingCard();
  const firstCard = host.querySelector(":scope > .card");
  host.insertBefore(card, firstCard || host.firstChild);
  return card;
}

function createHomeUpcomingCard() {
  const card = document.createElement("div");
  card.id = HOME_CARD_ID;
  card.className = "card mb-4";

  const header = document.createElement("div");
  header.className = "card-header bg-primary text-white d-flex align-items-center";

  const title = document.createElement("h2");
  title.className = "mb-0";
  title.textContent = "Upcoming";

  const refreshButton = document.createElement("button");
  refreshButton.id = HOME_CARD_REFRESH_ID;
  refreshButton.type = "button";
  refreshButton.className = "btn btn-light btn-sm ms-auto";
  refreshButton.textContent = "Refresh";

  const actionGroup = document.createElement("div");
  actionGroup.className = "d-flex flex-wrap gap-2 ms-auto";
  refreshButton.classList.remove("ms-auto");

  const calendarButton = document.createElement("button");
  calendarButton.id = HOME_CARD_CALENDAR_ID;
  calendarButton.type = "button";
  calendarButton.className = "btn btn-light btn-sm";
  calendarButton.textContent = "Sync Google Calendar";
  calendarButton.title = "Sync all future published deadlines, not only this seven-day list";

  const exportDropdown = document.createElement("div");
  exportDropdown.className = "dropdown d-inline-block";
  exportDropdown.style.position = "relative";

  const exportButton = document.createElement("button");
  exportButton.id = HOME_CARD_EXPORT_ID;
  exportButton.type = "button";
  exportButton.className = "btn btn-outline-light btn-sm dropdown-toggle";
  exportButton.setAttribute("aria-haspopup", "true");
  exportButton.setAttribute("aria-expanded", "false");
  exportButton.textContent = "Download .ics";
  exportButton.title = "Download future published deadlines for calendar import";

  const exportMenu = document.createElement("div");
  exportMenu.className = "dropdown-menu shadow-sm py-1";
  exportMenu.style.position = "absolute";
  exportMenu.style.zIndex = "1050";
  exportMenu.style.display = "none";
  exportMenu.style.top = "100%";
  exportMenu.style.left = "0";

  const allScopeBtn = document.createElement("button");
  allScopeBtn.type = "button";
  allScopeBtn.className = "dropdown-item small text-start w-100 border-0 bg-transparent py-1 px-3";
  allScopeBtn.textContent = "All future deadlines";
  allScopeBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    exportMenu.style.display = "none";
    exportButton.setAttribute("aria-expanded", "false");
    void exportCalendarFile(exportButton, "all");
  });

  const weekScopeBtn = document.createElement("button");
  weekScopeBtn.type = "button";
  weekScopeBtn.className = "dropdown-item small text-start w-100 border-0 bg-transparent py-1 px-3";
  weekScopeBtn.textContent = "Next 7 days only";
  weekScopeBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    exportMenu.style.display = "none";
    exportButton.setAttribute("aria-expanded", "false");
    void exportCalendarFile(exportButton, "week");
  });

  exportMenu.appendChild(allScopeBtn);
  exportMenu.appendChild(weekScopeBtn);

  exportButton.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const isOpen = exportMenu.style.display === "block";
    exportMenu.style.display = isOpen ? "none" : "block";
    exportButton.setAttribute("aria-expanded", String(!isOpen));
  });

  document.addEventListener("click", (e) => {
    if (!exportDropdown.contains(e.target)) {
      exportMenu.style.display = "none";
      exportButton.setAttribute("aria-expanded", "false");
    }
  });

  exportDropdown.appendChild(exportButton);
  exportDropdown.appendChild(exportMenu);

  const status = document.createElement("span");
  status.id = HOME_CARD_SUBTITLE_ID;
  status.className = "small ms-2 text-white";
  status.setAttribute("aria-live", "polite");

  calendarButton.addEventListener("click", () => syncGoogleCalendar(calendarButton, exportButton));

  refreshButton.addEventListener("click", async () => {
    refreshButton.disabled = true;
    try {
      await refreshAndRenderHomeUpcoming();
    } catch (error) {
      setHomeCardSubtitle(`Refresh failed: ${toErrorMessage(error)}`);
    } finally {
      refreshButton.disabled = false;
    }
  });

  actionGroup.appendChild(calendarButton);
  actionGroup.appendChild(exportDropdown);
  actionGroup.appendChild(refreshButton);
  header.appendChild(title);
  header.appendChild(actionGroup);
  header.appendChild(status);
  card.appendChild(header);

  const body = document.createElement("div");
  body.id = HOME_CARD_BODY_ID;
  body.className = "card-body";
  body.textContent = "Loading upcoming assessments...";
  card.appendChild(body);

  return card;
}

async function loadAndRenderHomeUpcomingFromBackground() {
  try {
    ensureBadgeStylesInjected();
    try {
      badgeColorOverridesCache = await getBadgeColorOverrides();
    } catch {
      badgeColorOverridesCache = {};
    }
    const response = await sendMessageToBackground({ type: "PL_GET_DASHBOARD" });
    if (!response?.ok) {
      throw new Error(response?.error || "Failed to load tracker dashboard.");
    }

    renderHomeUpcomingFromDashboard(response.data);
  } catch (error) {
    renderHomeUpcomingError(toErrorMessage(error));
  }
}

async function refreshAndRenderHomeUpcoming() {
  setHomeCardSubtitle("Refreshing...");
  ensureBadgeStylesInjected();
  try {
    badgeColorOverridesCache = await getBadgeColorOverrides();
  } catch {
    badgeColorOverridesCache = {};
  }
  const response = await sendMessageToBackground({
    type: "PL_REFRESH_REQUEST",
    payload: { origin: window.location.origin },
  });

  if (!response?.ok) {
    throw new Error(response?.error || "Refresh failed.");
  }

  if (response.data) {
    renderHomeUpcomingFromDashboard(response.data);
    return;
  }

  await loadAndRenderHomeUpcomingFromBackground();
} 

async function initAssessmentsPinButtons() {
  const tbody = await waitForAssessmentsTableBody(10000);
  if (!tbody) {
    return;
  }

  const courseInstanceId = getCourseInstanceIdFromPath(window.location.pathname);
  if (!courseInstanceId) {
    return;
  }

  const rows = collectAssessmentsForPinning(tbody, courseInstanceId);
  if (!rows.length) {
    return;
  }

  let pinStates = [];
  try {
    const response = await sendMessageToBackground({
      type: "PL_GET_ASSESSMENT_PINS",
      payload: {
        origin: window.location.origin,
        courseInstanceId,
        assessments: rows.map((entry) => entry.assessment),
      },
    });
    if (response?.ok) {
      pinStates = Array.isArray(response?.data?.items) ? response.data.items : [];
    }
  } catch (error) {
    console.warn("[PL Tracker] Failed to load pin states:", toErrorMessage(error));
  }

  rows.forEach((entry, index) => {
    const initialPinned = Boolean(pinStates[index]?.pinned);
    renderAssessmentPinButton(entry, initialPinned);
    renderAssessmentCalendarMenu(entry);
  });
}

async function waitForAssessmentsTableBody(timeoutMs) {
  const existing = document.querySelector('table[aria-label="Assessments"] tbody');
  if (existing) {
    return existing;
  }

  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      const tableBody = document.querySelector('table[aria-label="Assessments"] tbody');
      if (tableBody) {
        observer.disconnect();
        resolve(tableBody);
      }
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.setTimeout(() => {
      observer.disconnect();
      resolve(document.querySelector('table[aria-label="Assessments"] tbody'));
    }, timeoutMs);
  });
}

function getCourseInstanceIdFromPath(path) {
  if (typeof path !== "string") {
    return null;
  }

  const match = path.match(/\/pl\/course_instance\/(\d+)\//);
  return match?.[1] || null;
}

// Column positions are not fixed across course instances, so resolve them from
// the table header instead of counting cells. Falls back to the common layout
// when there is no header row to read.
const POSITIONAL_ASSESSMENT_COLUMNS = { title: 1, availability: 2, score: 3 };

function resolveAssessmentColumns(node) {
  const table = getAssessmentsTableFrom(node);
  const headerRow = table?.querySelector(":scope > thead > tr");
  const headers = headerRow
    ? Array.from(headerRow.children).map((cell) => normalizeWhitespace(cell.textContent))
    : [];

  if (!headers.length) {
    return { ...POSITIONAL_ASSESSMENT_COLUMNS };
  }

  const indexOf = (pattern) => {
    const found = headers.findIndex((text) => pattern.test(text));
    return found === -1 ? null : found;
  };

  return {
    title: indexOf(/^title$/i),
    availability: indexOf(/available\s*credit/i),
    score: indexOf(/^score$/i),
  };
}

function toAbsoluteAssessmentUrlSafe(href, origin) {
  if (!href) {
    return null;
  }
  try {
    return new URL(href, origin).toString();
  } catch {
    return null;
  }
}

function assessmentCellAt(cells, index) {
  return typeof index === "number" && index >= 0 && index < cells.length ? cells[index] : null;
}

// PrairieLearn renders one <tbody> per assessment group, so any scan anchored to
// a single tbody only ever sees the first group. Always walk the whole table.
function getAssessmentsTableFrom(node) {
  if (!node) {
    return null;
  }
  if (typeof node.closest === "function") {
    return node.closest("table") || (node.tagName === "TABLE" ? node : null);
  }
  return null;
}

function collectAssessmentTableRows(node) {
  const table = getAssessmentsTableFrom(node);
  if (!table) {
    return [];
  }
  return Array.from(table.querySelectorAll(":scope > tbody > tr"));
}

function getLastAssessmentTableBody(node) {
  const table = getAssessmentsTableFrom(node);
  if (!table) {
    return null;
  }
  const bodies = table.querySelectorAll(":scope > tbody");
  return bodies.length ? bodies[bodies.length - 1] : null;
}

function collectAssessmentsForPinning(tbody, courseInstanceId) {
  const rows = collectAssessmentTableRows(tbody);
  const columns = resolveAssessmentColumns(tbody);
  const entries = [];
  let currentGroup = null;

  for (const row of rows) {
    const groupHeading = row.querySelector('[data-testid="assessment-group-heading"]');
    if (groupHeading) {
      currentGroup = normalizeWhitespace(groupHeading.textContent);
      continue;
    }

    const badgeElement = row.querySelector('[data-testid="assessment-set-badge"]');
    const cells = row.querySelectorAll("td");
    if (!badgeElement || !cells.length) {
      continue;
    }

    const titleCell = assessmentCellAt(cells, columns.title);
    if (!titleCell) {
      continue;
    }
    const linkElement = titleCell.querySelector("a");
    const title = normalizeWhitespace(linkElement?.textContent || titleCell.textContent) || "Untitled";
    const href = linkElement?.getAttribute("href") || null;
    let absoluteUrl = null;
    if (href) {
      try {
        absoluteUrl = new URL(href, window.location.origin).toString();
      } catch {
        absoluteUrl = null;
      }
    }
    const badge = normalizeWhitespace(badgeElement.textContent) || null;
    const colorClass = Array.from(badgeElement.classList || []).find((c) => c.startsWith("color-")) || null;

    const availabilityCell = assessmentCellAt(cells, columns.availability);
    const availabilityText = normalizeWhitespace(availabilityCell?.textContent) || null;
    const popoverButton =
      availabilityCell?.querySelector('button[data-bs-toggle="popover"]') || null;
    const accessWindows = parsePopoverAccessDetails(popoverButton);
    const deadline = getDeadlineInfo(availabilityText, accessWindows);
    const dueAt = deadline.deadlineAt;

    const scoreText = normalizeWhitespace(assessmentCellAt(cells, columns.score)?.textContent);
    const isClosed =
      /assessment closed/i.test(availabilityText || "") || /assessment closed/i.test(scoreText || "");

    if (isClosed || !deadline.deadlineAt || isDueInPast(dueAt)) {
      continue;
    }

    entries.push({
      titleCell,
      linkElement,
      assessment: {
        courseInstanceId,
        group: currentGroup || null,
        badge,
        colorClass,
        title,
        href,
        absoluteUrl,
        dueAt,
        deadlineAt: deadline.deadlineAt,
        deadlineSource: deadline.deadlineSource,
      },
    });
  }

  return entries;
}

function renderAssessmentPinButton(entry, initiallyPinned) {
  if (!entry?.titleCell || !entry.assessment) {
    return;
  }

  let button = entry.titleCell.querySelector(`button.${ASSESSMENT_PIN_BUTTON_CLASS}`);
  if (!button) {
    button = document.createElement("button");
    button.type = "button";
    button.className = `btn btn-sm ${ASSESSMENT_PIN_BUTTON_CLASS}`;
    button.setAttribute("aria-label", "Pin to tracker home card");
    entry.titleCell.appendChild(button);
  }

  updateAssessmentPinButtonState(button, initiallyPinned);

  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (button.disabled) {
      return;
    }

    const payload = buildPinToggleAssessmentPayload(entry.assessment);
    if (!payload) {
      return;
    }

    button.disabled = true;
    try {
      const response = await sendMessageToBackground({
        type: "PL_TOGGLE_ASSESSMENT_PIN",
        payload: {
          origin: window.location.origin,
          assessment: payload,
        },
      });

      if (!response?.ok) {
        throw new Error(response?.error || "Failed to update pin state.");
      }

      updateAssessmentPinButtonState(button, !!response.pinned);
    } catch (error) {
      console.warn("[PL Tracker] Failed to toggle pin state:", error);
    } finally {
      button.disabled = false;
    }
  });
}

function updateAssessmentPinButtonState(button, pinned) {
  button.textContent = pinned ? "Pinned" : "Pin";
  button.title = pinned ? "Remove from the tracker home card" : "Pin to the tracker home card";
  button.classList.toggle("btn-warning", pinned);
  button.classList.toggle("btn-outline-secondary", !pinned);
}

function buildPinToggleAssessmentPayload(item) {
  if (!item || typeof item !== "object") {
    return null;
  }

  const courseInstanceId = String(item.courseInstanceId || "").trim();
  if (!/^\d+$/.test(courseInstanceId)) {
    return null;
  }

  return {
    courseInstanceId,
    title: typeof item.title === "string" ? item.title : "",
    badge: typeof item.badge === "string" ? item.badge : "",
    colorClass: typeof item.colorClass === "string" ? item.colorClass : null,
    group: typeof item.group === "string" ? item.group : "",
    href: typeof item.href === "string" ? item.href : null,
    absoluteUrl: typeof item.href === "string" ? item.href : null,
    dueAt: typeof item.dueAt === "string" ? item.dueAt : null,
    deadlineAt: typeof item.deadlineAt === "string" ? item.deadlineAt : null,
    deadlineSource: typeof item.deadlineSource === "string" ? item.deadlineSource : null,
  };
}

async function unpinFromHomePinnedTag(item) {
  const assessmentPayload = buildPinToggleAssessmentPayload(item);
  if (!assessmentPayload) {
    throw new Error("Invalid pinned assessment payload.");
  }

  const response = await sendMessageToBackground({
    type: "PL_TOGGLE_ASSESSMENT_PIN",
    payload: {
      origin: window.location.origin,
      assessment: assessmentPayload,
    },
  });

  if (!response?.ok) {
    throw new Error(response?.error || "Failed to update pin status.");
  }
}

function renderHomeUpcomingFromDashboard(dashboard) {
  const host = getHomeCardsHost();
  if (!host) {
    return;
  }
  ensureHomeUpcomingCard(host);

  const body = document.getElementById(HOME_CARD_BODY_ID);
  if (!body) {
    return;
  }

  const filtered = getSevenDayPendingAssessments(dashboard);
  const pinnedVisibleCount = filtered.filter((item) => item?.isPinned).length;
  const refreshedAt = dashboard?.meta?.lastRefreshAt || null;
  const refreshedLabel = refreshedAt
    ? `Updated ${formatHomeDueAt(refreshedAt)}`
    : "Updated just now";

  body.innerHTML = "";
  if (!filtered.length) {
    const empty = document.createElement("p");
    empty.className = HOME_CARD_EMPTY_CLASS;
    empty.textContent = "No pinned or near-due incomplete assessments.";
    body.appendChild(empty);
    setHomeCardSubtitle(refreshedLabel);
    return;
  }

  body.classList.remove(HOME_CARD_EMPTY_CLASS);

  const tableResponsive = document.createElement("div");
  tableResponsive.className = "table-responsive";

  const table = document.createElement("table");
  table.className = "table table-sm table-hover table-striped mb-0";
  table.setAttribute("aria-label", "Upcoming incomplete assessments");

  const thead = document.createElement("thead");
  thead.innerHTML = "<tr><th>Course</th><th>Assessment</th><th>Due</th><th>Progress</th></tr>";
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const item of filtered) {
    const row = document.createElement("tr");

    const courseCell = document.createElement("td");
    courseCell.className = "align-middle";
    courseCell.textContent = item.courseLabel || "Course";
    if (item.isPrairieTest) {
      const examBadge = document.createElement("span");
      examBadge.className = "badge ms-2";
      examBadge.textContent = "Exam";
      applyBadgeColorAndPicker(examBadge, { badge: "Exam", isPrairieTest: true, colorClass: item.colorClass }, badgeColorOverridesCache);
      courseCell.appendChild(examBadge);
    }
    row.appendChild(courseCell);

    const assessmentCell = document.createElement("td");
    assessmentCell.className = "align-middle";

    if (item.isPinned) {
      const pinnedBadge = document.createElement("button");
      pinnedBadge.type = "button";
      pinnedBadge.className = "badge bg-warning text-dark me-2 border-0";
      pinnedBadge.textContent = "Pinned";
      pinnedBadge.title = "Click to unpin";
      pinnedBadge.style.cursor = "pointer";

      pinnedBadge.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (pinnedBadge.disabled) {
          return;
        }

        pinnedBadge.disabled = true;
        setHomeCardSubtitle("Updating pin...");
        try {
          await unpinFromHomePinnedTag(item);
          await loadAndRenderHomeUpcomingFromBackground();
        } catch (error) {
          setHomeCardSubtitle(`Unpin failed: ${toErrorMessage(error)}`);
        } finally {
          pinnedBadge.disabled = false;
        }
      });

      assessmentCell.appendChild(pinnedBadge);
    }

    if (item.badge) {
      const badge = document.createElement("span");
      badge.className = "badge me-2";
      badge.textContent = item.badge;
      applyBadgeColorAndPicker(badge, item, badgeColorOverridesCache);
      assessmentCell.appendChild(badge);
    }

    const link = document.createElement("a");
    link.href = item.href || "#";
    link.textContent = item.title || "Untitled";
    if (!item.href) {
      link.removeAttribute("href");
    }
    assessmentCell.appendChild(link);
    if (item.location) {
      const loc = document.createElement("div");
      loc.className = "small text-muted";
      loc.textContent = `📍 ${item.location}`;
      assessmentCell.appendChild(loc);
    }
    const calMenu = renderCalendarActionMenu(item, window.location.origin);
    if (calMenu) {
      assessmentCell.appendChild(calMenu);
    }
    row.appendChild(assessmentCell);

    const dueCell = document.createElement("td");
    dueCell.className = "align-middle text-nowrap";
    dueCell.textContent = formatHomeDueAt(item.dueAt);
    row.appendChild(dueCell);

    const progressCell = document.createElement("td");
    progressCell.className = "align-middle";
    progressCell.style.minWidth = "120px";
    if (item.isPrairieTest) {
      const examBadge = document.createElement("span");
      examBadge.className = "badge bg-primary";
      examBadge.textContent = "Reserved";
      progressCell.appendChild(examBadge);
    } else {
      renderHomeProgressBar(progressCell, item);
    }
    row.appendChild(progressCell);

    tbody.appendChild(row);
  }

  table.appendChild(tbody);
  tableResponsive.appendChild(table);
  body.appendChild(tableResponsive);
  setHomeCardSubtitle(
    ` `
  );
}

function renderHomeUpcomingError(message) {
  const body = document.getElementById(HOME_CARD_BODY_ID);
  if (!body) {
    return;
  }

  body.innerHTML = "";
  const error = document.createElement("p");
  error.className = "text-danger mb-0";
  error.textContent = `Unable to load upcoming tracker data: ${message}`;
  body.appendChild(error);
  setHomeCardSubtitle("Data unavailable");
}

async function syncGoogleCalendar(calendarButton, exportButton) {
  const original = calendarButton.textContent;
  calendarButton.disabled = true;
  exportButton.disabled = true;
  setHomeCardSubtitle("Authorizing Google Calendar and syncing future published deadlines…");
  try {
    const response = await sendMessageToBackground({ type: "PL_SYNC_GOOGLE_CALENDAR" });
    if (!response?.ok) throw new Error(response?.error || "Google Calendar sync failed.");
    const result = response.result || {};
    setHomeCardSubtitle(`Calendar sync complete: ${result.created || 0} created, ${result.updated || 0} updated, ${result.unchanged || 0} unchanged${result.failed ? `, ${result.failed} failed` : ""}.`);
  } catch (error) {
    setHomeCardSubtitle(`Calendar sync unavailable: ${toErrorMessage(error)} Use Download .ics to import manually.`);
  } finally {
    calendarButton.textContent = original;
    calendarButton.disabled = false;
    exportButton.disabled = false;
  }
}

async function exportCalendarFile(exportButton, scope = "all", options = {}) {
  exportButton.disabled = true;
  const scopeLabel = scope === "week" ? "next 7 days" : scope === "course" ? "current course" : "all future";
  setHomeCardSubtitle(`Preparing ${scopeLabel} calendar file…`);
  try {
    const response = await sendMessageToBackground({
      type: "PL_EXPORT_CALENDAR_ICS",
      payload: { scope, ...options },
    });
    if (!response?.ok || typeof response.ics !== "string") throw new Error(response?.error || "Calendar file export failed.");
    const blob = new Blob([response.ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = response.filename || "prairielearn-deadlines.ics";
    link.click();
    URL.revokeObjectURL(url);
    const countMsg = response.count ? ` (${response.count} deadline${response.count === 1 ? "" : "s"})` : "";
    setHomeCardSubtitle(`Calendar file downloaded${countMsg}. Import it into your calendar.`);
  } catch (error) {
    setHomeCardSubtitle(`Calendar file export failed: ${toErrorMessage(error)}`);
  } finally {
    exportButton.disabled = false;
  }
}

function setHomeCardSubtitle(text) {
  const subtitle = document.getElementById(HOME_CARD_SUBTITLE_ID);
  if (subtitle) {
    subtitle.textContent = text;
  }
}

function getSevenDayPendingAssessments(dashboard) {
  const upcoming = Array.isArray(dashboard?.upcoming) ? dashboard.upcoming : [];
  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const maxDue = now + sevenDaysMs;

  return upcoming
    .filter((item) => {
      if (!item?.deadlineAt || !item?.deadlineSource) return false;
      const dueTime = Date.parse(item?.deadlineAt || item?.dueAt || "");
      const hasDue = !Number.isNaN(dueTime);

      if (item?.isPinned) {
        return !hasDue || dueTime >= now;
      }

      const scorePercent = parseScorePercent(item?.score);
      if (scorePercent !== null && scorePercent >= 100) {
        return false;
      }

      if (!hasDue || dueTime <= now || dueTime > maxDue) {
        return false;
      }

      return true;
    })
    .sort((a, b) => {
      if (Boolean(a?.isPinned) !== Boolean(b?.isPinned)) {
        return a?.isPinned ? -1 : 1;
      }

      const aDue = Date.parse(a?.deadlineAt || a?.dueAt || "");
      const bDue = Date.parse(b?.deadlineAt || b?.dueAt || "");
      const aHasDue = !Number.isNaN(aDue);
      const bHasDue = !Number.isNaN(bDue);

      if (aHasDue && bHasDue && aDue !== bDue) {
        return aDue - bDue;
      }
      if (aHasDue && !bHasDue) {
        return -1;
      }
      if (!aHasDue && bHasDue) {
        return 1;
      }

      return (a?.title || "").localeCompare(b?.title || "");
    });
}

function formatHomeDueAt(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "No due date";
  }

  return date.toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderHomeProgressBar(cell, item) {
  const percent = parseScorePercent(item?.score);

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

  const progressContainer = document.createElement("div");
  progressContainer.className = `progress border border-${colorClass}`;
  progressContainer.style.minWidth = "5em";
  progressContainer.style.maxWidth = "20em";

  const fill = document.createElement("div");
  fill.className = `progress-bar bg-${colorClass}`;
  fill.style.width = `${fillPercent}%`;
  if (label && fillPercent >= 15) {
    fill.textContent = label;
  }
  progressContainer.appendChild(fill);

  const remainder = document.createElement("div");
  remainder.className = "d-flex flex-column justify-content-center text-center";
  remainder.style.width = `${100 - fillPercent}%`;
  if (percent === null) {
    remainder.textContent = getHomeProgressLabel(item);
    remainder.style.fontSize = "11px";
  } else if (label && fillPercent < 15) {
    remainder.textContent = label;
    remainder.style.fontSize = "11px";
  }
  progressContainer.appendChild(remainder);

  cell.appendChild(progressContainer);
}

function getHomeProgressLabel(item) {
  if (item?.score) {
    return item.score;
  }
  if (item?.status === "not_started") {
    return "Not started";
  }
  if (item?.status === "action_available") {
    return "Action available";
  }
  if (item?.status === "text_status") {
    return "In progress";
  }
  return "Unknown";
}

function parseScorePercent(score) {
  if (typeof score !== "string") {
    return null;
  }

  const match = score.match(/(\d+(?:\.\d+)?)\s*%/);
  if (!match) {
    return null;
  }

  const value = Number.parseFloat(match[1]);
  return Number.isNaN(value) ? null : value;
}

function isDueInPast(dueAt) {
  if (typeof dueAt !== "string" || !dueAt) {
    return false;
  }

  const dueMs = Date.parse(dueAt);
  if (Number.isNaN(dueMs)) {
    return false;
  }

  return dueMs <= Date.now();
}

async function runRefreshInPageContext(payload) {
  const origin = normalizePrairieLearnOrigin(payload?.origin) || normalizePrairieLearnOrigin(window.location.origin);
  if (!origin) {
    throw new Error("Invalid PrairieLearn origin in page-context refresh.");
  }

  let courseInstanceIds = sanitizeCourseInstanceIds(payload?.courseInstanceIds);
  if (!courseInstanceIds.length) {
    courseInstanceIds = extractCourseInstanceIdsFromHomeDocument(document);
  }
  if (!courseInstanceIds.length) {
    courseInstanceIds = await fetchCourseInstanceIdsFromHome(origin);
  }
  if (!courseInstanceIds.length) {
    throw new Error("No PrairieLearn course IDs found in page context.");
  }

  const startedAt = new Date().toISOString();
  const results = await mapWithConcurrency(
    courseInstanceIds,
    REFRESH_CONCURRENCY,
    async (courseInstanceId) => {
      try {
        const snapshot = await fetchAndParseAssessments(origin, courseInstanceId);
        return { ok: true, courseInstanceId, snapshot };
      } catch (error) {
        return { ok: false, courseInstanceId, error: toErrorMessage(error) };
      }
    }
  );

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
    mode: "page_context",
    origin,
    requestedCourseCount: courseInstanceIds.length,
    succeeded: snapshots.length,
    failed: errors.length,
    errors,
    snapshots,
    startedAt,
    finishedAt: new Date().toISOString(),
  };
}

async function fetchCourseInstanceIdsFromHome(origin) {
  const candidates = ["/", "/pl/"];
  for (const candidate of candidates) {
    const url = new URL(candidate, origin).toString();
    const response = await fetch(url, { credentials: "include" });
    if (!response.ok) {
      continue;
    }

    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const ids = extractCourseInstanceIdsFromHomeDocument(doc);
    if (ids.length) {
      return ids;
    }
  }

  return [];
}

async function fetchAndParseAssessments(origin, courseInstanceId) {
  const assessmentsUrl = new URL(
    `/pl/course_instance/${encodeURIComponent(courseInstanceId)}/assessments`,
    origin
  ).toString();

  const response = await fetch(assessmentsUrl, { credentials: "include" });
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}.`);
  }

  const html = await response.text();
  const doc = new DOMParser().parseFromString(html, "text/html");
  const parsed = parseAssessmentsDocument(doc, {
    origin,
    assessmentsUrl,
    courseInstanceId,
  });

  if (!parsed) {
    throw new Error("Assessments table was not found.");
  }

  return parsed;
}

function parseAssessmentsDocument(doc, context) {
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
    if (!badgeElement || !cells.length) {
      continue;
    }

    const badge = normalizeWhitespace(badgeElement.textContent);
    const colorClass = Array.from(badgeElement.classList || []).find((c) => c.startsWith("color-")) || null;
    const titleCell = assessmentCellAt(cells, columns.title);
    const linkElement = titleCell?.querySelector("a") || null;
    const title =
      normalizeWhitespace(linkElement?.textContent || titleCell?.textContent) || "Untitled";
    const href = linkElement?.getAttribute("href") || null;
    const absoluteUrl = toAbsoluteAssessmentUrlSafe(href, context.origin);

    const availabilityCell = assessmentCellAt(cells, columns.availability);
    const availabilityText = normalizeWhitespace(availabilityCell?.textContent) || null;
    const popoverButton =
      availabilityCell?.querySelector('button[data-bs-toggle="popover"]') || null;
    const accessWindows = parsePopoverAccessDetails(popoverButton);

    const scoreCell = assessmentCellAt(cells, columns.score);
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

  if (
    Number.isNaN(hour) ||
    Number.isNaN(minute) ||
    Number.isNaN(day) ||
    month === undefined ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    day < 1 ||
    day > 31
  ) {
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

  const textarea = document.createElement("textarea");
  textarea.innerHTML = value;
  return textarea.value;
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

function normalizeWhitespace(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.replace(/\s+/g, " ").trim();
}

async function sendMessageToBackground(message) {
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

function formatUtcCompact(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function resolvePrairieLearnAssessmentUrl(rawUrl, origin = (typeof window !== "undefined" && window?.location?.origin) || "https://us.prairielearn.com") {
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

function isEligibleForCalendarAction(item, origin = (typeof window !== "undefined" && window?.location?.origin) || "https://us.prairielearn.com", now = Date.now()) {
  let targetOrigin = origin;
  let targetNow = now;
  if (typeof origin === "number") {
    targetNow = origin;
    targetOrigin = typeof now === "string" ? now : ((typeof window !== "undefined" && window?.location?.origin) || "https://us.prairielearn.com");
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

function buildGoogleCalendarComposeUrl(item, origin = (typeof window !== "undefined" && window?.location?.origin) || "https://us.prairielearn.com", now = Date.now()) {
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

function buildOutlookWebComposeUrl(item, origin = (typeof window !== "undefined" && window?.location?.origin) || "https://us.prairielearn.com", now = Date.now()) {
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

async function exportSingleAssessmentIcs(item, origin = (typeof window !== "undefined" && window?.location?.origin) || "https://us.prairielearn.com") {
  if (!isEligibleForCalendarAction(item, origin)) {
    return;
  }
  try {
    const response = await sendMessageToBackground({
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

function renderCalendarActionMenu(item, origin = (typeof window !== "undefined" && window?.location?.origin) || "https://us.prairielearn.com") {
  if (!isEligibleForCalendarAction(item, origin)) {
    return null;
  }

  const container = document.createElement("div");
  container.className = "btn-group btn-group-sm ms-2 pl-cal-menu-container d-inline-block";
  container.style.position = "relative";

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "btn btn-xs btn-outline-secondary pl-cal-menu-toggle";
  toggle.setAttribute("aria-haspopup", "true");
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-label", `Add ${item.title || "assessment"} to calendar`);
  toggle.title = "Add to calendar";
  toggle.textContent = "📅";

  const menu = document.createElement("div");
  menu.className = "dropdown-menu shadow-sm py-1 pl-cal-dropdown-menu";
  menu.style.position = "absolute";
  menu.style.zIndex = "1050";
  menu.style.minWidth = "170px";
  menu.style.display = "none";
  menu.style.top = "100%";
  menu.style.left = "0";

  const googleItem = document.createElement("button");
  googleItem.type = "button";
  googleItem.className = "dropdown-item small text-start w-100 border-0 bg-transparent py-1 px-3";
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
  outlookItem.className = "dropdown-item small text-start w-100 border-0 bg-transparent py-1 px-3";
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
  icsItem.className = "dropdown-item small text-start w-100 border-0 bg-transparent py-1 px-3";
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

function renderAssessmentCalendarMenu(entry) {
  if (!entry?.titleCell || !entry.assessment) return;
  const origin = (typeof window !== "undefined" && window?.location?.origin) || "https://us.prairielearn.com";
  if (!isEligibleForCalendarAction(entry.assessment, origin)) return;
  if (entry.titleCell.querySelector(".pl-cal-menu-container")) return;
  const menu = renderCalendarActionMenu(entry.assessment, origin);
  if (menu) {
    entry.titleCell.appendChild(menu);
  }
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
  const deadline = item.deadlineAt || (item.deadlineSource ? item.dueAt : null);
  if (deadline) {
    const due = Date.parse(deadline);
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

function getProgressSummaryEngine() {
  if (typeof PrairieLearnProgressSummary !== "undefined") {
    return PrairieLearnProgressSummary;
  }
  if (typeof globalThis !== "undefined" && globalThis.PrairieLearnProgressSummary) {
    return globalThis.PrairieLearnProgressSummary;
  }
  if (typeof window !== "undefined" && window.PrairieLearnProgressSummary) {
    return window.PrairieLearnProgressSummary;
  }
  if (typeof require === "function") {
    try {
      const mod = require("./progress-summary.js");
      return (typeof globalThis !== "undefined" && globalThis.PrairieLearnProgressSummary) || mod;
    } catch {
      try {
        const mod = require("../shared/progress-summary.js");
        return (typeof globalThis !== "undefined" && globalThis.PrairieLearnProgressSummary) || mod;
      } catch {}
    }
  }
  return null;
}

function formatSummaryHeadline(summary) {
  if (!summary || typeof summary !== "object") return "No progress figure can be derived";
  if (summary.hasPoints) {
    return summary.percentage !== null
      ? `${summary.securedPoints} / ${summary.availablePoints} pts (${summary.percentage}%)`
      : `${summary.securedPoints} / ${summary.availablePoints} pts`;
  }
  if (typeof summary.meanPercentage === "number" && Number.isFinite(summary.meanPercentage)) {
    return `${summary.meanPercentage}%`;
  }
  return "No progress figure can be derived";
}

function renderCourseProgressSummaryCard(summaryOrItems, cardElement, options = {}) {
  const card = cardElement || (typeof document !== "undefined" && document.getElementById("pl-course-progress-summary-card"));
  if (!card) return null;

  let summary = summaryOrItems;
  if (Array.isArray(summaryOrItems)) {
    const engine = getProgressSummaryEngine();
    if (engine && typeof engine.aggregateProgress === "function") {
      summary = engine.aggregateProgress(summaryOrItems, options);
    } else {
      summary = null;
    }
  }

  if (!summary) {
    card.style.display = "none";
    return card;
  }

  card.style.display = "";
  const now =
    options.now instanceof Date
      ? options.now
      : typeof options.now === "number"
      ? new Date(options.now)
      : new Date();
  const freshnessLabel = options.freshnessLabel || `Computed ${now.toLocaleTimeString()}`;

  let headlineHtml = "";
  let countsHtml = "";
  let disclaimerHtml = "";
  let bonusHtml = "";

  if (summary.hasPoints) {
    const pct = summary.percentage !== null ? ` <span class="text-muted fw-normal fs-5">(${summary.percentage}%)</span>` : "";
    headlineHtml = `<span id="pl-progress-headline" class="fs-4 fw-bold text-dark">${summary.securedPoints} / ${summary.availablePoints} pts</span>${pct}`;
    countsHtml = `<span id="pl-progress-counts"><strong>${summary.counts?.includedRows ?? 0}</strong> assessment${summary.counts?.includedRows === 1 ? "" : "s"} included, <strong>${summary.counts?.excludedRows ?? 0}</strong> excluded</span>`;
    disclaimerHtml = `<div class="text-muted small mt-2 pt-2 border-top fst-italic" id="pl-progress-disclaimer">Assessment-list summary only. Not an official course grade.</div>`;
  } else if (typeof summary.meanPercentage === "number" && Number.isFinite(summary.meanPercentage)) {
    headlineHtml = `<span id="pl-progress-headline" class="fs-4 fw-bold text-dark">${summary.meanPercentage}%</span> <span class="badge bg-secondary ms-2 align-middle" id="pl-progress-mean-badge">Unweighted mean</span>`;
    const unattemptedText = summary.counts?.unattemptedRows > 0 ? `, including ${summary.counts.unattemptedRows} unattempted` : "";
    countsHtml = `<span id="pl-progress-counts">Averaged <strong>${summary.counts?.meanIncludedRows ?? 0}</strong> visible assessment${summary.counts?.meanIncludedRows === 1 ? "" : "s"} (<strong>${summary.counts?.meanExcludedRows ?? 0}</strong> excluded${unattemptedText})</span>`;
    disclaimerHtml = `<div class="text-muted small mt-2 pt-2 border-top fst-italic" id="pl-progress-disclaimer">Assessment-list summary only. Not an official course grade. This figure is an unweighted mean of visible percentages; unattempted and unavailable assessments are excluded.</div>`;
  } else {
    headlineHtml = `<span id="pl-progress-headline" class="fs-5 fw-semibold text-muted">No progress figure can be derived</span>`;
    countsHtml = `<span id="pl-progress-counts">All <strong>${summary.counts?.totalRows || summary.counts?.excludedRows || 0}</strong> assessments excluded (no visible scores or points)</span>`;
    disclaimerHtml = `<div class="text-muted small mt-2 pt-2 border-top fst-italic" id="pl-progress-disclaimer">Assessment-list summary only. Not an official course grade. No visible assessment exposes measurable points or percentages.</div>`;
  }

  if (summary.bonusPoints > 0 || summary.bonusExplanation) {
    const explanation = summary.bonusExplanation || `Includes ${summary.bonusPoints} bonus point${summary.bonusPoints === 1 ? "" : "s"} above maximum.`;
    bonusHtml = `<div class="text-success small mt-1 fw-semibold" id="pl-progress-bonus">⭐ ${explanation}</div>`;
  }

  card.innerHTML = `
    <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-1">
      <div class="d-flex align-items-center gap-2">
        <span class="text-uppercase text-muted small fw-bold" style="letter-spacing: 0.5px;">Course Progress Summary</span>
      </div>
      <div class="text-muted small" id="pl-progress-freshness" title="${now.toISOString()}">${freshnessLabel}</div>
    </div>
    <div class="d-flex flex-wrap align-items-baseline gap-2 mt-1">
      ${headlineHtml}
    </div>
    <div class="text-muted small mt-1">
      ${countsHtml}
    </div>
    ${bonusHtml}
    ${disclaimerHtml}
  `;

  return card;
}

async function initCourseAssessmentsFilterToolbar() {
  const tbody = await waitForAssessmentsTableBody(10000);
  if (!tbody) return;

  const courseInstanceId = getCourseInstanceIdFromPath(window.location.pathname);
  if (!courseInstanceId) return;

  const table = tbody.closest("table") || tbody.parentElement;
  if (!table) return;

  if (document.getElementById("pl-assessment-filter-toolbar")) return;

  const targetContainer =
    table.parentElement && table.parentElement.classList.contains("table-responsive")
      ? table.parentElement
      : table;

  // Shelved UI feature: Course Progress Summary card
  const ENABLE_COURSE_PROGRESS_SUMMARY = false;

  let summaryCard = null;
  if (ENABLE_COURSE_PROGRESS_SUMMARY) {
    summaryCard = document.getElementById("pl-course-progress-summary-card");
    if (!summaryCard) {
      summaryCard = document.createElement("div");
      summaryCard.id = "pl-course-progress-summary-card";
      summaryCard.className = "card mb-3 p-3 bg-light border shadow-sm";
      if (targetContainer.parentElement) {
        targetContainer.parentElement.insertBefore(summaryCard, targetContainer);
      }
    }
  } else {
    const existingCard = document.getElementById("pl-course-progress-summary-card");
    if (existingCard) {
      existingCard.remove();
    }
  }

  const toolbar = document.createElement("div");
  toolbar.id = "pl-assessment-filter-toolbar";
  toolbar.className = "card mb-3 p-3 bg-light border";
  toolbar.innerHTML = `
    <div class="row g-2 align-items-center">
      <div class="col-12 col-md-5">
        <div class="input-group input-group-sm">
          <span class="input-group-text" id="pl-filter-search-label">🔍</span>
          <input type="search" class="form-control" id="pl-filter-search" placeholder="Search assessments..." aria-label="Search assessments" aria-describedby="pl-filter-search-label">
        </div>
      </div>
      <div class="col-auto">
        <div class="form-check form-switch mb-0">
          <input class="form-check-input" type="checkbox" id="pl-filter-hide-completed">
          <label class="form-check-label small" for="pl-filter-hide-completed">Hide 100% Completed</label>
        </div>
      </div>
      <div class="col-auto">
        <div class="form-check form-switch mb-0">
          <input class="form-check-input" type="checkbox" id="pl-filter-due-soon">
          <label class="form-check-label small" for="pl-filter-due-soon">Only Active / Due Soon</label>
        </div>
      </div>
      <div class="col-auto ms-auto d-flex align-items-center gap-2">
        <span id="pl-filter-count" class="text-muted small" aria-live="polite"></span>
        <button type="button" class="btn btn-sm btn-outline-secondary" id="pl-filter-reset">Reset</button>
        <button type="button" class="btn btn-sm btn-outline-primary" id="pl-filter-export-course-ics" title="Export this course's upcoming deadlines">Download Course .ics</button>
      </div>
    </div>
  `;

  if (targetContainer.parentElement) {
    targetContainer.parentElement.insertBefore(toolbar, targetContainer);
  }

  const searchInput = toolbar.querySelector("#pl-filter-search");
  const hideCompletedCheckbox = toolbar.querySelector("#pl-filter-hide-completed");
  const dueSoonCheckbox = toolbar.querySelector("#pl-filter-due-soon");
  const countSpan = toolbar.querySelector("#pl-filter-count");
  const resetBtn = toolbar.querySelector("#pl-filter-reset");
  const exportCourseBtn = toolbar.querySelector("#pl-filter-export-course-ics");

  const storageKey = `pl_filter_pref_${window.location.origin}_${courseInstanceId}`;

  function parseRows() {
    const trs = collectAssessmentTableRows(tbody);
    const columns = resolveAssessmentColumns(tbody);
    const groups = [];
    let currentGroup = { headingRow: null, heading: null, items: [] };

    for (const tr of trs) {
      if (tr.id === "pl-filter-zero-row") continue;
      const groupHeading = tr.querySelector('[data-testid="assessment-group-heading"]');
      if (groupHeading) {
        currentGroup = {
          headingRow: tr,
          heading: normalizeWhitespace(groupHeading.textContent),
          items: [],
        };
        groups.push(currentGroup);
        continue;
      }

      const cells = tr.querySelectorAll("td");
      if (!cells.length) {
        currentGroup.items.push({
          row: tr,
          item: { isUnknown: true, searchableText: normalizeWhitespace(tr.textContent) },
        });
        continue;
      }

      const badgeElement = tr.querySelector('[data-testid="assessment-set-badge"]');
      const titleCell = assessmentCellAt(cells, columns.title);
      const linkElement = titleCell ? titleCell.querySelector("a") : null;
      const title = normalizeWhitespace(linkElement?.textContent || titleCell?.textContent) || "Untitled";
      const href = linkElement?.getAttribute("href") || null;
      const badge = normalizeWhitespace(badgeElement?.textContent) || null;
      const colorClass = Array.from(badgeElement?.classList || []).find((c) => c.startsWith("color-")) || null;
      const availabilityCell = assessmentCellAt(cells, columns.availability);
      const availabilityText = normalizeWhitespace(availabilityCell?.textContent) || null;
      const popoverButton = availabilityCell ? availabilityCell.querySelector('button[data-bs-toggle="popover"]') : null;
      const accessWindows = parsePopoverAccessDetails(popoverButton);
      const deadline = getDeadlineInfo(availabilityText, accessWindows);
      const scoreText = normalizeWhitespace(assessmentCellAt(cells, columns.score)?.textContent);
      const isClosed =
        /assessment closed/i.test(availabilityText || "") || /assessment closed/i.test(scoreText || "");

      currentGroup.items.push({
        row: tr,
        item: {
          courseInstanceId,
          group: currentGroup.heading,
          badge,
          colorClass,
          title,
          href,
          availabilityText,
          accessWindows,
          score: scoreText,
          scoreText,
          dueAt: deadline.deadlineAt,
          deadlineAt: deadline.deadlineAt,
          deadlineSource: deadline.deadlineSource,
          status: isClosed ? "closed" : "open",
          searchableText: normalizeWhitespace(tr.textContent),
        },
      });
    }

    if (groups.length === 0 && currentGroup.items.length > 0) {
      groups.push(currentGroup);
    }
    return groups;
  }

  function applyFilters() {
    const query = searchInput ? searchInput.value : "";
    const hideCompleted = hideCompletedCheckbox ? hideCompletedCheckbox.checked : false;
    const onlyActiveDueSoon = dueSoonCheckbox ? dueSoonCheckbox.checked : false;
    const groups = parseRows();

    let totalAssessments = 0;
    let visibleAssessments = 0;

    for (const group of groups) {
      let groupVisibleCount = 0;
      for (const entry of group.items) {
        totalAssessments += 1;
        let isVisible = true;
        if (entry.item.isUnknown) {
          isVisible = true;
        } else {
          isVisible = filterAssessmentItem(entry.item, { query, hideCompleted, onlyActiveDueSoon });
        }

        if (isVisible) {
          groupVisibleCount += 1;
          visibleAssessments += 1;
          entry.row.hidden = false;
          entry.row.removeAttribute("aria-hidden");
        } else {
          entry.row.hidden = true;
          entry.row.setAttribute("aria-hidden", "true");
        }
      }

      if (group.headingRow) {
        if (groupVisibleCount === 0 && group.items.length > 0) {
          group.headingRow.hidden = true;
          group.headingRow.setAttribute("aria-hidden", "true");
        } else {
          group.headingRow.hidden = false;
          group.headingRow.removeAttribute("aria-hidden");
        }
      }
    }

    if (countSpan) {
      countSpan.textContent = `Showing ${visibleAssessments} of ${totalAssessments} assessments`;
    }

    let zeroRow = document.getElementById("pl-filter-zero-row");
    if (visibleAssessments === 0 && totalAssessments > 0) {
      if (!zeroRow) {
        zeroRow = document.createElement("tr");
        zeroRow.id = "pl-filter-zero-row";
        zeroRow.className = "text-center py-4";
        const td = document.createElement("td");
        td.colSpan = 100;
        td.className = "text-muted p-4";
        td.innerHTML =
          'No assessments match the selected filters. <button type="button" class="btn btn-link btn-sm p-0 ms-2" id="pl-filter-inline-reset">Reset filters</button>';
        zeroRow.appendChild(td);
        (getLastAssessmentTableBody(tbody) || tbody).appendChild(zeroRow);
        const inlineReset = zeroRow.querySelector("#pl-filter-inline-reset");
        if (inlineReset) {
          inlineReset.addEventListener("click", () => {
            resetFilters();
          });
        }
      }
      zeroRow.hidden = false;
    } else if (zeroRow) {
      zeroRow.hidden = true;
    }
  }

  function saveFilterPreferences() {
    if (!chrome?.storage?.local) return;
    chrome.storage.local.set({
      [storageKey]: {
        hideCompleted: hideCompletedCheckbox?.checked || false,
        onlyActiveDueSoon: dueSoonCheckbox?.checked || false,
      },
    });
  }

  function resetFilters() {
    if (searchInput) searchInput.value = "";
    if (hideCompletedCheckbox) hideCompletedCheckbox.checked = false;
    if (dueSoonCheckbox) dueSoonCheckbox.checked = false;
    applyFilters();
    saveFilterPreferences();
  }

  if (searchInput) {
    searchInput.addEventListener("input", applyFilters);
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        searchInput.value = "";
        applyFilters();
      }
    });
  }

  if (hideCompletedCheckbox) {
    hideCompletedCheckbox.addEventListener("change", () => {
      applyFilters();
      saveFilterPreferences();
    });
  }

  if (dueSoonCheckbox) {
    dueSoonCheckbox.addEventListener("change", () => {
      applyFilters();
      saveFilterPreferences();
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", resetFilters);
  }

  if (exportCourseBtn) {
    exportCourseBtn.addEventListener("click", async () => {
      exportCourseBtn.disabled = true;
      exportCourseBtn.textContent = "Exporting...";
      try {
        const res = await sendMessageToBackground({
          type: "PL_EXPORT_CALENDAR_ICS",
          payload: { scope: "course", courseInstanceId },
        });
        if (!res?.ok || typeof res.ics !== "string") {
          throw new Error(res?.error || "Export failed.");
        }
        const blob = new Blob([res.ics], { type: "text/calendar;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = res.filename || `prairielearn-course-${courseInstanceId}-deadlines.ics`;
        link.click();
        URL.revokeObjectURL(url);
        if (countSpan) {
          countSpan.textContent = `Downloaded ${res.count || 1} deadline${res.count === 1 ? "" : "s"}.`;
        }
      } catch (err) {
        if (countSpan) {
          countSpan.textContent = `Export failed: ${toErrorMessage(err)}`;
        }
      } finally {
        exportCourseBtn.disabled = false;
        exportCourseBtn.textContent = "Download Course .ics";
      }
    });
  }

  function updateSummary() {
    if (!ENABLE_COURSE_PROGRESS_SUMMARY || !summaryCard) return;
    const groups = parseRows();
    const rawItems = groups.flatMap((g) => g.items.map((entry) => entry.item)).filter((i) => !i.isUnknown);
    const engine = getProgressSummaryEngine();
    if (engine && typeof engine.aggregateProgress === "function") {
      const summary = engine.aggregateProgress(rawItems, { now: Date.now() });
      renderCourseProgressSummaryCard(summary, summaryCard, { now: Date.now() });
    }
  }

  if (chrome?.storage?.local) {
    chrome.storage.local.get([storageKey], (res) => {
      const pref = res?.[storageKey] || {};
      if (pref.hideCompleted && hideCompletedCheckbox) hideCompletedCheckbox.checked = true;
      if (pref.onlyActiveDueSoon && dueSoonCheckbox) dueSoonCheckbox.checked = true;
      applyFilters();
      updateSummary();
    });
  } else {
    applyFilters();
    updateSummary();
  }

  let debounceTimer = null;
  const observer = new MutationObserver((mutations) => {
    const isInternal = mutations.every((m) => {
      return (
        m.target.id === "pl-filter-zero-row" ||
        (m.target.closest && m.target.closest("#pl-assessment-filter-toolbar")) ||
        (m.target.closest && m.target.closest("#pl-course-progress-summary-card")) ||
        (m.type === "attributes" && (m.attributeName === "hidden" || m.attributeName === "aria-hidden"))
      );
    });
    if (isInternal) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      applyFilters();
      updateSummary();
    }, 150);
  });
  observer.observe(getAssessmentsTableFrom(tbody) || tbody, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "style"],
  });
  window.addEventListener("beforeunload", () => observer.disconnect(), { once: true });
}

if (typeof window !== "undefined") {
  window.__PL_PRODUCTION_RUNTIME__ = {
    resolvePrairieLearnAssessmentUrl,
    isEligibleForCalendarAction,
    buildGoogleCalendarComposeUrl,
    buildOutlookWebComposeUrl,
    filterAssessmentItem,
    isAssessment100PercentCompleted,
    isAssessmentActiveOrDueSoon,
    matchesAssessmentSearch,
    renderCourseProgressSummaryCard,
    formatSummaryHeadline,
    getProgressSummaryEngine,
    resolveBadgeColor,
    getBadgePrefix,
    applyBadgeStyle,
    PL_BADGE_PALETTES,
  };
}
