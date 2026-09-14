// PrairieTest Content Script for PrairieLearn Tracker extension.
// Handles parsing exam reservations and available exams, injecting calendar action buttons,
// warning for unreserved exams, and communicating with background service worker.

(function initPrairieTestTracker(global) {
  "use strict";

  const PT_RESERVATIONS_CARD_ACTIONS_ID = "pl-pt-reservations-card-actions";
  const PT_WARNING_BANNER_ID = "pl-pt-unreserved-warning-banner";

  function normalizeWhitespace(value) {
    return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  }

  function toAbsoluteUrl(href, origin) {
    if (!href) return null;
    try {
      return new URL(href, origin || (typeof window !== "undefined" && window.location.origin) || "https://us.prairietest.com").toString();
    } catch {
      return null;
    }
  }

  function formatUtcCompact(date) {
    if (!date || Number.isNaN(date.getTime())) return null;
    return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  }

  function parseDurationMinutes(text) {
    if (!text) return 60;
    const match = String(text).match(/(\d+)\s*(?:min|mins|minute|minutes)/i);
    return match ? Number.parseInt(match[1], 10) : 60;
  }

  function cleanLocationText(element) {
    if (!element) return "";
    const clone = element.cloneNode(true);
    // Remove links or icons if needed, get text
    const small = clone.querySelector("small");
    const smallText = small ? normalizeWhitespace(small.textContent) : "";
    if (small) small.remove();
    const mainText = normalizeWhitespace(clone.textContent).replace(/^ORCA:\s*/i, "ORCA: ").replace(/[🎯📍]/g, "").trim();
    if (smallText && !mainText.includes(smallText)) {
      return `${mainText} (${smallText})`;
    }
    return mainText;
  }

  function calculateReservationDeadline(examStartDate) {
    if (!examStartDate) return null;
    const start = new Date(examStartDate);
    if (Number.isNaN(start.getTime())) return null;
    // Deadline is 1 day before the first available exam reservation day, end of day in UTC (23:59:59.999Z)
    const deadline = new Date(start.getTime());
    deadline.setUTCDate(deadline.getUTCDate() - 1);
    deadline.setUTCHours(23, 59, 59, 999);
    return deadline;
  }

  function formatDeadlineFriendly(date) {
    if (!date) return "";
    const options = {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "UTC",
    };
    try {
      return new Intl.DateTimeFormat("en-US", options).format(date);
    } catch {
      return date.toUTCString();
    }
  }

  function parseReservationItem(li, origin) {
    const examEl = li.querySelector('[data-testid="exam"]');
    const examLink = examEl?.querySelector("a");
    const rawTitle = normalizeWhitespace(examLink?.textContent || examEl?.textContent);
    if (!rawTitle) return null;

    const href = examLink?.getAttribute("href") || "";
    const absoluteUrl = toAbsoluteUrl(href, origin);
    const idMatch = href.match(/\/reservation\/(\d+)/);
    const id = idMatch ? idMatch[1] : `pt-${Date.now()}`;

    let courseLabel = "";
    let examTitle = rawTitle;
    if (rawTitle.includes(":")) {
      const parts = rawTitle.split(":");
      courseLabel = parts[0].trim();
      examTitle = parts.slice(1).join(":").trim();
    }

    const dateEl = li.querySelector('[data-testid="date"]');
    const dateSpan = dateEl?.querySelector("[data-format-date]") || dateEl;
    let startDateIso = null;
    let timezone = null;

    if (dateSpan) {
      const rawJson = dateSpan.getAttribute("data-format-date");
      if (rawJson) {
        try {
          const parsed = JSON.parse(rawJson);
          startDateIso = parsed.date || null;
          timezone = parsed.timezone || null;
        } catch {
          // ignore json error
        }
      }
      if (!startDateIso) {
        const titleAttr = dateSpan.getAttribute("data-bs-title") || dateSpan.getAttribute("title");
        if (titleAttr) {
          const cleanTitle = titleAttr.replace(/\s*\([^)]+\)\s*$/, "").trim();
          const parsedTime = Date.parse(cleanTitle);
          if (!Number.isNaN(parsedTime)) {
            startDateIso = new Date(parsedTime).toISOString();
          }
        }
      }
    }

    if (!startDateIso && dateEl) {
      const text = normalizeWhitespace(dateEl.textContent);
      const parsedTime = Date.parse(text);
      if (!Number.isNaN(parsedTime)) {
        startDateIso = new Date(parsedTime).toISOString();
      }
    }

    const friendlyDateText = normalizeWhitespace(dateEl?.textContent || "");

    const locationEl = li.querySelector('[data-testid="location"]');
    const location = cleanLocationText(locationEl);

    // Details / duration column (any column that is not exam, date, location)
    const rowCols = Array.from(li.querySelectorAll(".row > div"));
    const detailsCol = rowCols.find((col) => {
      const tid = col.getAttribute("data-testid");
      return !tid && col !== examEl && col !== dateEl && col !== locationEl;
    });

    const sessionDetails = normalizeWhitespace(detailsCol?.textContent || "");
    const durationMinutes = parseDurationMinutes(sessionDetails);

    let endDateIso = null;
    if (startDateIso) {
      const startMs = Date.parse(startDateIso);
      if (!Number.isNaN(startMs)) {
        endDateIso = new Date(startMs + durationMinutes * 60 * 1000).toISOString();
      }
    }

    return {
      id,
      title: rawTitle,
      courseLabel,
      examTitle,
      startDate: startDateIso,
      endDate: endDateIso,
      durationMinutes,
      timezone,
      friendlyDateText,
      location,
      sessionDetails,
      href,
      absoluteUrl,
      isPrairieTest: true,
      status: "reserved",
    };
  }

  function parseUnreservedItem(li, origin) {
    const text = normalizeWhitespace(li.textContent);
    if (!text || /you don't currently have any exams available/i.test(text) || /no exams available/i.test(text)) {
      return null;
    }

    const examLink = li.querySelector('a[href*="/exam/"], a[href*="/reservation/"], [data-testid="exam"] a') || li.querySelector("a");
    const rawTitle = normalizeWhitespace(examLink?.textContent || li.querySelector("strong, h3, h4")?.textContent || text);
    const reserveUrl = toAbsoluteUrl(examLink?.getAttribute("href") || "/pt", origin);

    let courseLabel = "";
    let examTitle = rawTitle;
    if (rawTitle.includes(":")) {
      const parts = rawTitle.split(":");
      courseLabel = parts[0].trim();
      examTitle = parts.slice(1).join(":").trim();
    }

    // Try finding date elements or date strings
    const dateSpans = Array.from(li.querySelectorAll("[data-format-date]"));
    let windowStartDate = null;
    let windowEndDate = null;

    if (dateSpans.length > 0) {
      for (const span of dateSpans) {
        try {
          const parsed = JSON.parse(span.getAttribute("data-format-date") || "{}");
          if (parsed.date) {
            const d = new Date(parsed.date);
            if (!Number.isNaN(d.getTime())) {
              if (!windowStartDate || d < windowStartDate) windowStartDate = d;
              if (!windowEndDate || d > windowEndDate) windowEndDate = d;
            }
          }
        } catch {}
      }
    }

    if (!windowStartDate) {
      // Look for regex dates e.g. Sep 16, 2026 or 2026-09-16
      const dateMatches = Array.from(text.matchAll(/(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s*)?([A-Za-z]{3})\s+(\d{1,2})(?:,\s*(\d{4}))?/gi));
      if (dateMatches.length > 0) {
        const months = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
        const now = new Date();
        for (const m of dateMatches) {
          const mon = months[m[1].toLowerCase()];
          const day = Number.parseInt(m[2], 10);
          const year = m[3] ? Number.parseInt(m[3], 10) : now.getFullYear();
          if (mon !== undefined && !Number.isNaN(day)) {
            const candidate = new Date(Date.UTC(year, mon, day, 9, 0, 0));
            if (!windowStartDate || candidate < windowStartDate) windowStartDate = candidate;
            if (!windowEndDate || candidate > windowEndDate) windowEndDate = candidate;
          }
        }
      }
    }

    const reserveDeadline = windowStartDate ? calculateReservationDeadline(windowStartDate) : null;
    const reserveDeadlineFormatted = reserveDeadline ? formatDeadlineFriendly(reserveDeadline) : "";

    return {
      title: rawTitle,
      courseLabel,
      examTitle,
      windowStartDate: windowStartDate ? windowStartDate.toISOString() : null,
      windowEndDate: windowEndDate ? windowEndDate.toISOString() : null,
      reserveDeadline: reserveDeadline ? reserveDeadline.toISOString() : null,
      reserveDeadlineFormatted,
      reserveUrl,
      rawDetails: text,
    };
  }

  function parsePrairieTestDocument(doc, origin = "https://us.prairietest.com") {
    const reservations = [];
    const unreservedExams = [];

    const cards = Array.from(doc.querySelectorAll(".card"));
    for (const card of cards) {
      const heading = normalizeWhitespace(card.querySelector(".card-header h2, .card-header")?.textContent || "").toLowerCase();

      if (heading.includes("exam reservations")) {
        const items = Array.from(card.querySelectorAll("ul.list-group > li.list-group-item"));
        for (const li of items) {
          const res = parseReservationItem(li, origin);
          if (res) reservations.push(res);
        }
      } else if (heading.includes("exams available for reservations")) {
        const items = Array.from(card.querySelectorAll("ul.list-group > li.list-group-item"));
        for (const li of items) {
          const unres = parseUnreservedItem(li, origin);
          if (unres) unreservedExams.push(unres);
        }
      }
    }

    return { reservations, unreservedExams };
  }

  function parseSingleReservationPage(doc, pageUrl = "") {
    if (!doc) return null;
    let urlObj = null;
    try {
      urlObj = new URL(pageUrl || (typeof window !== "undefined" && window.location.href) || "https://us.prairietest.com/pt");
    } catch {
      urlObj = new URL("https://us.prairietest.com/pt");
    }

    const origin = urlObj.origin;
    const pathname = urlObj.pathname;
    const idMatch = pathname.match(/\/reservation\/(\d+)/i) || (pageUrl && pageUrl.match(/\/reservation\/(\d+)/i));
    const id = idMatch ? idMatch[1] : `pt-${Date.now()}`;

    // Title / exam name detection
    let rawTitle = "";

    const breadcrumb = doc.querySelector("ol.breadcrumb, nav[aria-label='breadcrumb']");
    if (breadcrumb) {
      const items = Array.from(breadcrumb.querySelectorAll("li"));
      for (let i = items.length - 1; i >= 0; i--) {
        const text = normalizeWhitespace(items[i].textContent);
        if (text && !/^(home|reservation|reservations)$/i.test(text)) {
          rawTitle = text;
          break;
        }
      }
    }

    if (!rawTitle) {
      const rows = Array.from(doc.querySelectorAll("tr, dl > div, dl"));
      for (const row of rows) {
        const headerText = normalizeWhitespace(row.querySelector("th, dt")?.textContent || "").toLowerCase();
        if (headerText.includes("exam") || headerText.includes("assessment")) {
          const valEl = row.querySelector("td, dd");
          if (valEl) {
            rawTitle = normalizeWhitespace(valEl.textContent);
            break;
          }
        }
      }
    }

    if (!rawTitle) {
      const h1 = doc.querySelector("main h1, #content h1, h1, .card-header h2, .card-header h1");
      const hText = normalizeWhitespace(h1?.textContent || "");
      if (hText && !/^(reservation|reservations|exam reservation)$/i.test(hText)) {
        rawTitle = hText;
      }
    }

    if (!rawTitle) {
      const examLink = doc.querySelector('a[href*="/exam/"], [data-testid="exam"]');
      if (examLink) {
        rawTitle = normalizeWhitespace(examLink.textContent);
      }
    }

    if (!rawTitle) {
      const docTitle = normalizeWhitespace(doc.title || "");
      rawTitle = docTitle.replace(/\s*[-—|]\s*PrairieTest.*$/i, "").trim();
    }

    if (!rawTitle || /^(reservation|reservations)$/i.test(rawTitle)) {
      rawTitle = `PrairieTest Reservation #${id}`;
    }

    let courseLabel = "";
    let examTitle = rawTitle;
    if (rawTitle.includes(":")) {
      const parts = rawTitle.split(":");
      courseLabel = parts[0].trim();
      examTitle = parts.slice(1).join(":").trim();
    }

    // Date & Time detection
    let startDateIso = null;
    let timezone = null;
    const dateSpan = doc.querySelector("[data-format-date]");
    if (dateSpan) {
      const rawJson = dateSpan.getAttribute("data-format-date");
      if (rawJson) {
        try {
          const parsed = JSON.parse(rawJson);
          startDateIso = parsed.date || null;
          timezone = parsed.timezone || null;
        } catch {}
      }
      if (!startDateIso) {
        const titleAttr = dateSpan.getAttribute("data-bs-title") || dateSpan.getAttribute("title");
        if (titleAttr) {
          const cleanTitle = titleAttr.replace(/\s*\([^)]+\)\s*$/, "").trim();
          const parsedTime = Date.parse(cleanTitle);
          if (!Number.isNaN(parsedTime)) {
            startDateIso = new Date(parsedTime).toISOString();
          }
        }
      }
    }

    if (!startDateIso) {
      const dateEl = doc.querySelector('[data-testid="date"]');
      if (dateEl) {
        const text = normalizeWhitespace(dateEl.textContent);
        const parsedTime = Date.parse(text);
        if (!Number.isNaN(parsedTime)) {
          startDateIso = new Date(parsedTime).toISOString();
        }
      }
    }

    if (!startDateIso) {
      const rows = Array.from(doc.querySelectorAll("tr, dl > div, dl"));
      for (const row of rows) {
        const headerText = normalizeWhitespace(row.querySelector("th, dt")?.textContent || "").toLowerCase();
        if (headerText.includes("date") || headerText.includes("time") || headerText.includes("when")) {
          const valEl = row.querySelector("td, dd");
          if (valEl) {
            const span = valEl.querySelector("[data-format-date]");
            if (span) {
              try {
                const parsed = JSON.parse(span.getAttribute("data-format-date") || "{}");
                if (parsed.date) {
                  startDateIso = parsed.date;
                  timezone = parsed.timezone || null;
                  break;
                }
              } catch {}
            }
            const text = normalizeWhitespace(valEl.textContent);
            const parsedTime = Date.parse(text);
            if (!Number.isNaN(parsedTime)) {
              startDateIso = new Date(parsedTime).toISOString();
              break;
            }
          }
        }
      }
    }

    const friendlyDateText = normalizeWhitespace(dateSpan?.textContent || doc.querySelector('[data-testid="date"]')?.textContent || "");

    // Location detection
    let location = "";
    const locEl = doc.querySelector('[data-testid="location"]');
    if (locEl) {
      location = cleanLocationText(locEl);
    } else {
      const rows = Array.from(doc.querySelectorAll("tr, dl > div, dl"));
      for (const row of rows) {
        const headerText = normalizeWhitespace(row.querySelector("th, dt")?.textContent || "").toLowerCase();
        if (headerText.includes("location") || headerText.includes("room") || headerText.includes("building") || headerText.includes("testing center")) {
          const valEl = row.querySelector("td, dd");
          if (valEl) {
            location = cleanLocationText(valEl);
            break;
          }
        }
      }
    }

    // Duration detection
    let durationMinutes = 60;
    const bodyText = normalizeWhitespace(doc.querySelector("main#content, main, .container, body")?.textContent || "");
    const durationMatch = bodyText.match(/(\d+)\s*(?:min|mins|minute|minutes)/i);
    if (durationMatch) {
      durationMinutes = Number.parseInt(durationMatch[1], 10);
    }

    let endDateIso = null;
    if (startDateIso) {
      const startMs = Date.parse(startDateIso);
      if (!Number.isNaN(startMs)) {
        endDateIso = new Date(startMs + durationMinutes * 60 * 1000).toISOString();
      }
    }

    const sessionDetails = `${durationMinutes}min${location ? `, ${location}` : ""}`;
    const href = `/pt/student/reservation/${id}`;
    const absoluteUrl = toAbsoluteUrl(href, origin);

    return {
      id,
      title: rawTitle,
      courseLabel,
      examTitle,
      startDate: startDateIso,
      endDate: endDateIso,
      durationMinutes,
      timezone,
      friendlyDateText,
      location,
      sessionDetails,
      href,
      absoluteUrl,
      isPrairieTest: true,
      status: "reserved",
    };
  }

  function buildGoogleCalendarComposeUrl(res) {
    if (!res || !res.startDate) return null;
    const start = new Date(res.startDate);
    const end = res.endDate ? new Date(res.endDate) : new Date(start.getTime() + (res.durationMinutes || 60) * 60 * 1000);
    const startUtc = formatUtcCompact(start);
    const endUtc = formatUtcCompact(end);
    if (!startUtc || !endUtc) return null;

    const title = `Exam: ${res.title || "PrairieTest Exam"}`;
    const details = [
      "PrairieTest Exam Reservation",
      res.location ? `Location: ${res.location}` : null,
      res.sessionDetails ? `Details: ${res.sessionDetails}` : null,
      res.absoluteUrl ? `Reservation: ${res.absoluteUrl}` : null,
    ].filter(Boolean).join("\n");

    const params = new URLSearchParams({
      action: "TEMPLATE",
      text: title,
      dates: `${startUtc}/${endUtc}`,
      details,
      location: res.location || "",
    });
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }

  function buildOutlookWebComposeUrl(res) {
    if (!res || !res.startDate) return null;
    const start = new Date(res.startDate);
    const end = res.endDate ? new Date(res.endDate) : new Date(start.getTime() + (res.durationMinutes || 60) * 60 * 1000);
    const title = `Exam: ${res.title || "PrairieTest Exam"}`;
    const details = [
      "PrairieTest Exam Reservation",
      res.location ? `Location: ${res.location}` : null,
      res.sessionDetails ? `Details: ${res.sessionDetails}` : null,
      res.absoluteUrl ? `Reservation: ${res.absoluteUrl}` : null,
    ].filter(Boolean).join("\n");

    const params = new URLSearchParams({
      path: "/calendar/action/compose",
      rru: "addevent",
      subject: title,
      startdt: start.toISOString(),
      enddt: end.toISOString(),
      body: details,
      location: res.location || "",
    });
    return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
  }

  function buildIcsContent(reservations, now = Date.now()) {
    const esc = (value) => String(value || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
    const utc = (iso) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    const stamp = utc(new Date(now).toISOString());

    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//PrairieLearn Tracker//PrairieTest//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
    ];

    for (const res of reservations) {
      if (!res.startDate) continue;
      const start = new Date(res.startDate);
      const end = res.endDate ? new Date(res.endDate) : new Date(start.getTime() + (res.durationMinutes || 60) * 60 * 1000);
      const startUtc = utc(start.toISOString());
      const endUtc = utc(end.toISOString());
      const details = [
        "PrairieTest Exam Reservation",
        res.location ? `Location: ${res.location}` : null,
        res.sessionDetails ? `Details: ${res.sessionDetails}` : null,
        res.absoluteUrl ? `Reservation: ${res.absoluteUrl}` : null,
      ].filter(Boolean).join("\n");

      lines.push(
        "BEGIN:VEVENT",
        `UID:pt-${res.id || startUtc}@prairietest-tracker`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${startUtc}`,
        `DTEND:${endUtc}`,
        `SUMMARY:${esc(`Exam: ${res.title}`)}`,
        `DESCRIPTION:${esc(details)}`,
        res.location ? `LOCATION:${esc(res.location)}` : null,
        res.absoluteUrl ? `URL:${res.absoluteUrl}` : null,
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        "DESCRIPTION:Exam in 24 hours",
        "TRIGGER:-PT24H",
        "END:VALARM",
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        "DESCRIPTION:Exam in 2 hours",
        "TRIGGER:-PT2H",
        "END:VALARM",
        "END:VEVENT"
      );
    }

    lines.push("END:VCALENDAR");
    return lines.filter(Boolean).join("\r\n");
  }

  function downloadIcsFile(filename, icsContent) {
    const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // Inject action buttons into "Exam reservations" card header
  function injectReservationsCardActions(card, reservations) {
    const cardHeader = card.querySelector(".card-header");
    if (!cardHeader || cardHeader.querySelector(`#${PT_RESERVATIONS_CARD_ACTIONS_ID}`)) return;

    const doc = card.ownerDocument || document;

    cardHeader.classList.add("d-flex", "justify-content-between", "align-items-center", "flex-wrap", "gap-2");

    const actionContainer = doc.createElement("div");
    actionContainer.id = PT_RESERVATIONS_CARD_ACTIONS_ID;
    actionContainer.className = "d-flex align-items-center gap-2";

    const statusSpan = doc.createElement("span");
    statusSpan.className = "small text-light opacity-75 d-none d-md-inline";
    statusSpan.id = "pl-pt-sync-status";

    if (!reservations || !reservations.length) {
      return;
    }

    // "Add All to Calendar" button dropdown
    const btnGroup = doc.createElement("div");
    btnGroup.className = "btn-group btn-group-sm position-relative";

    const mainBtn = doc.createElement("button");
    mainBtn.type = "button";
    mainBtn.className = "btn btn-light btn-sm fw-semibold shadow-sm";
    mainBtn.innerHTML = "📅 Add All to Calendar";
    mainBtn.title = "Add all registered PrairieTest exam sessions to calendar";

    const dropdownToggle = doc.createElement("button");
    dropdownToggle.type = "button";
    dropdownToggle.className = "btn btn-light btn-sm dropdown-toggle dropdown-toggle-split";
    dropdownToggle.setAttribute("aria-expanded", "false");

    const menu = doc.createElement("div");
    menu.className = "dropdown-menu dropdown-menu-end shadow-sm py-1";
    menu.style.display = "none";
    menu.style.position = "absolute";
    menu.style.top = "100%";
    menu.style.right = "0";
    menu.style.zIndex = "1050";
    menu.style.minWidth = "210px";

    const syncGoogleItem = doc.createElement("button");
    syncGoogleItem.type = "button";
    syncGoogleItem.className = "dropdown-item small py-1 px-3";
    syncGoogleItem.textContent = "⚡ Sync Google Calendar";
    syncGoogleItem.onclick = async (e) => {
      e.preventDefault();
      closeDropdown();
      statusSpan.textContent = "Syncing Google Calendar...";
      try {
        const resp = await chrome.runtime.sendMessage({ type: "PL_SYNC_GOOGLE_CALENDAR" });
        if (!resp?.ok) throw new Error(resp?.error || "Sync failed");
        const res = resp.result || {};
        statusSpan.textContent = `Sync complete: ${res.created || 0} created, ${res.updated || 0} updated.`;
      } catch (err) {
        statusSpan.textContent = `Sync failed: ${err.message}. Use Download .ics.`;
      }
    };

    const downloadIcsItem = doc.createElement("button");
    downloadIcsItem.type = "button";
    downloadIcsItem.className = "dropdown-item small py-1 px-3";
    downloadIcsItem.textContent = "📥 Download .ics (All Reservations)";
    downloadIcsItem.onclick = (e) => {
      e.preventDefault();
      closeDropdown();
      const ics = buildIcsContent(reservations);
      downloadIcsFile("prairietest-reservations.ics", ics);
      statusSpan.textContent = "Downloaded calendar file.";
    };

    menu.appendChild(syncGoogleItem);
    menu.appendChild(downloadIcsItem);

    // If there is only 1 reservation, also provide direct Google Calendar & Outlook links
    if (reservations.length === 1) {
      const gcalItem = doc.createElement("button");
      gcalItem.type = "button";
      gcalItem.className = "dropdown-item small py-1 px-3";
      gcalItem.textContent = "Google Calendar (Compose)";
      gcalItem.onclick = (e) => {
        e.preventDefault();
        closeDropdown();
        const url = buildGoogleCalendarComposeUrl(reservations[0]);
        if (url) window.open(url, "_blank", "noopener,noreferrer");
      };

      const outlookItem = doc.createElement("button");
      outlookItem.type = "button";
      outlookItem.className = "dropdown-item small py-1 px-3";
      outlookItem.textContent = "Outlook Web (Compose)";
      outlookItem.onclick = (e) => {
        e.preventDefault();
        closeDropdown();
        const url = buildOutlookWebComposeUrl(reservations[0]);
        if (url) window.open(url, "_blank", "noopener,noreferrer");
      };

      menu.appendChild(gcalItem);
      menu.appendChild(outlookItem);
    }

    function toggleDropdown() {
      const isOpen = menu.style.display === "block";
      menu.style.display = isOpen ? "none" : "block";
      dropdownToggle.setAttribute("aria-expanded", String(!isOpen));
    }

    function closeDropdown() {
      menu.style.display = "none";
      dropdownToggle.setAttribute("aria-expanded", "false");
    }

    mainBtn.onclick = (e) => {
      e.stopPropagation();
      // Default action: download ICS or open menu
      toggleDropdown();
    };

    dropdownToggle.onclick = (e) => {
      e.stopPropagation();
      toggleDropdown();
    };

    doc.addEventListener("click", (e) => {
      if (!btnGroup.contains(e.target)) {
        closeDropdown();
      }
    });

    btnGroup.appendChild(mainBtn);
    btnGroup.appendChild(dropdownToggle);
    btnGroup.appendChild(menu);

    actionContainer.appendChild(statusSpan);
    actionContainer.appendChild(btnGroup);
    cardHeader.appendChild(actionContainer);
  }

  // Inject individual row calendar menu
  function injectReservationRowActions(li, res) {
    if (!res || !res.startDate || li.querySelector(".pl-pt-row-calendar-btn")) return;

    const doc = li.ownerDocument || document;
    const row = li.querySelector(".row");
    if (!row) return;

    // Find the last column or append to it
    const lastCol = row.querySelector(".col-xxl-4, .col-md-6, .col-xs-12:last-child") || row.lastElementChild;
    if (!lastCol) return;

    const menuContainer = doc.createElement("div");
    menuContainer.className = "pl-pt-row-calendar-btn d-inline-block ms-2 position-relative";

    const btn = doc.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-outline-secondary btn-sm py-0 px-2";
    btn.textContent = "📅 Add to Calendar";
    btn.title = `Add ${res.title} to calendar`;

    const dropdown = doc.createElement("div");
    dropdown.className = "dropdown-menu shadow-sm py-1";
    dropdown.style.display = "none";
    dropdown.style.position = "absolute";
    dropdown.style.zIndex = "1050";
    dropdown.style.minWidth = "180px";
    dropdown.style.right = "0";

    const googleItem = doc.createElement("button");
    googleItem.type = "button";
    googleItem.className = "dropdown-item small py-1 px-3";
    googleItem.textContent = "Google Calendar";
    googleItem.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropdown.style.display = "none";
      const url = buildGoogleCalendarComposeUrl(res);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    };

    const outlookItem = doc.createElement("button");
    outlookItem.type = "button";
    outlookItem.className = "dropdown-item small py-1 px-3";
    outlookItem.textContent = "Outlook Web";
    outlookItem.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropdown.style.display = "none";
      const url = buildOutlookWebComposeUrl(res);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    };

    const icsItem = doc.createElement("button");
    icsItem.type = "button";
    icsItem.className = "dropdown-item small py-1 px-3";
    icsItem.textContent = "Apple / iCal (.ics)";
    icsItem.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropdown.style.display = "none";
      const ics = buildIcsContent([res]);
      downloadIcsFile(`prairietest-${res.id || "exam"}.ics`, ics);
    };

    dropdown.appendChild(googleItem);
    dropdown.appendChild(outlookItem);
    dropdown.appendChild(icsItem);

    btn.onclick = (e) => {
      e.stopPropagation();
      dropdown.style.display = dropdown.style.display === "block" ? "none" : "block";
    };

    doc.addEventListener("click", (e) => {
      if (!menuContainer.contains(e.target)) {
        dropdown.style.display = "none";
      }
    });

    menuContainer.appendChild(btn);
    menuContainer.appendChild(dropdown);
    lastCol.appendChild(menuContainer);
  }

  // Inject prominent warning banner for unreserved exams
  function injectUnreservedWarningBanner(container, unreservedExams) {
    if (!unreservedExams || !unreservedExams.length) return;
    const doc = container.ownerDocument || document;
    if (doc.getElementById(PT_WARNING_BANNER_ID)) return;

    const banner = doc.createElement("div");
    banner.id = PT_WARNING_BANNER_ID;
    banner.className = "alert alert-warning border border-warning shadow-sm my-3 p-3";
    banner.setAttribute("role", "alert");

    const count = unreservedExams.length;
    const headerDiv = doc.createElement("div");
    headerDiv.className = "d-flex align-items-center mb-2";
    headerDiv.innerHTML = `
      <span class="fs-4 me-2">⚠️</span>
      <strong class="fs-5 text-dark">Action Required: You have ${count} unreserved exam${count > 1 ? "s" : ""}!</strong>
    `;
    banner.appendChild(headerDiv);

    const desc = doc.createElement("p");
    desc.className = "mb-3 text-secondary";
    desc.textContent = "You have not reserved a session for the following upcoming exam(s). Reserve before the deadline (1 day before testing window starts) to secure a seat:";
    banner.appendChild(desc);

    const list = doc.createElement("div");
    list.className = "list-group list-group-flush border rounded bg-white";

    for (const item of unreservedExams) {
      const itemEl = doc.createElement("div");
      itemEl.className = "list-group-item d-flex justify-content-between align-items-center flex-wrap gap-2 py-2";

      const left = doc.createElement("div");
      const titleStrong = doc.createElement("strong");
      titleStrong.textContent = item.title;
      left.appendChild(titleStrong);

      const deadlineNote = doc.createElement("div");
      deadlineNote.className = "small text-danger fw-semibold";
      if (item.reserveDeadlineFormatted) {
        deadlineNote.textContent = `⚠️ Reserve by: ${item.reserveDeadlineFormatted}`;
      } else {
        deadlineNote.textContent = "⚠️ Reservation open — reserve as soon as possible!";
      }
      left.appendChild(deadlineNote);

      const reserveBtn = doc.createElement("a");
      reserveBtn.href = item.reserveUrl || "/pt";
      reserveBtn.className = "btn btn-success btn-sm fw-bold px-3";
      reserveBtn.textContent = "Make a reservation";

      itemEl.appendChild(left);
      itemEl.appendChild(reserveBtn);
      list.appendChild(itemEl);
    }

    banner.appendChild(list);

    // Insert banner above the cards in main container
    const firstCard = container.querySelector(".card");
    if (firstCard) {
      container.insertBefore(banner, firstCard);
    } else {
      container.prepend(banner);
    }
  }

  // Inject action buttons into single reservation detail page
  const PT_SINGLE_RESERVATION_ACTIONS_ID = "pl-pt-single-reservation-actions";

  function injectSingleReservationActions(targetContainer, res) {
    if (!res || !targetContainer) return;
    const doc = targetContainer.ownerDocument || document;
    if (doc.getElementById(PT_SINGLE_RESERVATION_ACTIONS_ID)) return;

    const actionContainer = doc.createElement("div");
    actionContainer.id = PT_SINGLE_RESERVATION_ACTIONS_ID;
    actionContainer.className = "d-inline-flex align-items-center gap-2 my-2";

    const statusSpan = doc.createElement("span");
    statusSpan.className = "small text-muted";
    statusSpan.id = "pl-pt-single-sync-status";

    const btnGroup = doc.createElement("div");
    btnGroup.className = "btn-group btn-group-sm position-relative";

    const mainBtn = doc.createElement("button");
    mainBtn.type = "button";
    mainBtn.className = "btn btn-outline-primary btn-sm fw-semibold shadow-sm";
    mainBtn.innerHTML = "📅 Add to Calendar";
    mainBtn.title = `Add ${res.title} to calendar`;

    const dropdownToggle = doc.createElement("button");
    dropdownToggle.type = "button";
    dropdownToggle.className = "btn btn-outline-primary btn-sm dropdown-toggle dropdown-toggle-split";
    dropdownToggle.setAttribute("aria-expanded", "false");

    const menu = doc.createElement("div");
    menu.className = "dropdown-menu dropdown-menu-end shadow-sm py-1";
    menu.style.display = "none";
    menu.style.position = "absolute";
    menu.style.top = "100%";
    menu.style.right = "0";
    menu.style.zIndex = "1050";
    menu.style.minWidth = "200px";

    function toggleDropdown() {
      const open = menu.style.display === "block";
      menu.style.display = open ? "none" : "block";
      dropdownToggle.setAttribute("aria-expanded", open ? "false" : "true");
    }

    function closeDropdown() {
      menu.style.display = "none";
      dropdownToggle.setAttribute("aria-expanded", "false");
    }

    mainBtn.onclick = (e) => {
      e.stopPropagation();
      toggleDropdown();
    };

    dropdownToggle.onclick = (e) => {
      e.stopPropagation();
      toggleDropdown();
    };

    doc.addEventListener("click", (e) => {
      if (!btnGroup.contains(e.target)) {
        closeDropdown();
      }
    });

    const googleItem = doc.createElement("button");
    googleItem.type = "button";
    googleItem.className = "dropdown-item small py-1 px-3";
    googleItem.textContent = "📅 Google Calendar";
    googleItem.onclick = (e) => {
      e.preventDefault();
      closeDropdown();
      const url = buildGoogleCalendarComposeUrl(res);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    };

    const outlookItem = doc.createElement("button");
    outlookItem.type = "button";
    outlookItem.className = "dropdown-item small py-1 px-3";
    outlookItem.textContent = "📅 Outlook Web";
    outlookItem.onclick = (e) => {
      e.preventDefault();
      closeDropdown();
      const url = buildOutlookWebComposeUrl(res);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    };

    const icsItem = doc.createElement("button");
    icsItem.type = "button";
    icsItem.className = "dropdown-item small py-1 px-3";
    icsItem.textContent = "📥 Download .ics";
    icsItem.onclick = (e) => {
      e.preventDefault();
      closeDropdown();
      const ics = buildIcsContent([res]);
      downloadIcsFile(`prairietest-${res.id || "exam"}.ics`, ics);
    };

    const syncItem = doc.createElement("button");
    syncItem.type = "button";
    syncItem.className = "dropdown-item small py-1 px-3";
    syncItem.textContent = "⚡ Sync Google Calendar";
    syncItem.onclick = async (e) => {
      e.preventDefault();
      closeDropdown();
      statusSpan.textContent = "Syncing...";
      try {
        const resp = await chrome.runtime.sendMessage({ type: "PL_SYNC_GOOGLE_CALENDAR" });
        if (!resp?.ok) throw new Error(resp?.error || "Sync failed");
        statusSpan.textContent = "Synced!";
      } catch (err) {
        statusSpan.textContent = "Sync failed. Use Download .ics";
      }
    };

    menu.appendChild(googleItem);
    menu.appendChild(outlookItem);
    menu.appendChild(icsItem);
    menu.appendChild(syncItem);

    btnGroup.appendChild(mainBtn);
    btnGroup.appendChild(dropdownToggle);
    btnGroup.appendChild(menu);

    actionContainer.appendChild(btnGroup);
    actionContainer.appendChild(statusSpan);

    targetContainer.appendChild(actionContainer);
  }

  // Main initializer
  async function runPrairieTestTracker() {
    const origin = (typeof window !== "undefined" && window.location.origin) || "https://us.prairietest.com";
    const pathname = (typeof window !== "undefined" && window.location.pathname) || "/pt";

    // Handle single reservation detail page
    if (/\/reservation\/\d+/i.test(pathname)) {
      const res = parseSingleReservationPage(document, window.location.href);
      if (res) {
        try {
          await chrome.runtime.sendMessage({
            type: "PT_DATA_DISCOVERED",
            payload: {
              origin,
              isSingleReservation: true,
              reservations: [res],
              unreservedExams: [],
              capturedAt: new Date().toISOString(),
            },
          });
        } catch (err) {
          console.warn("[PrairieLearn Tracker] Failed to send single reservation to background:", err);
        }

        const cardHeader = document.querySelector(".card-header");
        const actionButtonsContainer = document.querySelector(".card-footer, .card-body .btn-group, .d-flex.gap-2") ||
                                       document.querySelector("main .card, #content .card, main, #content");
        const target = cardHeader || actionButtonsContainer || document.body;
        if (target) {
          if (cardHeader && target === cardHeader) {
            cardHeader.classList.add("d-flex", "justify-content-between", "align-items-center", "flex-wrap", "gap-2");
          }
          injectSingleReservationActions(target, res);
        }
      }
      return;
    }

    const { reservations, unreservedExams } = parsePrairieTestDocument(document, origin);

    // Notify background worker
    try {
      await chrome.runtime.sendMessage({
        type: "PT_DATA_DISCOVERED",
        payload: {
          origin,
          reservations,
          unreservedExams,
          capturedAt: new Date().toISOString(),
        },
      });
    } catch (err) {
      console.warn("[PrairieLearn Tracker] Failed to send PT data to background:", err);
    }

    // Inject UI elements
    const mainContainer = document.querySelector("main#content") || document.querySelector("main, .container") || document.body;

    if (unreservedExams.length > 0 && mainContainer) {
      injectUnreservedWarningBanner(mainContainer, unreservedExams);
    }

    const cards = Array.from(document.querySelectorAll(".card"));
    for (const card of cards) {
      const heading = normalizeWhitespace(card.querySelector(".card-header h2, .card-header")?.textContent || "").toLowerCase();

      if (heading.includes("exam reservations")) {
        injectReservationsCardActions(card, reservations);

        const items = Array.from(card.querySelectorAll("ul.list-group > li.list-group-item"));
        for (let i = 0; i < items.length; i++) {
          if (reservations[i]) {
            injectReservationRowActions(items[i], reservations[i]);
          }
        }
      } else if (heading.includes("exams available for reservations")) {
        // Highlight unreserved rows with badges if any
        const items = Array.from(card.querySelectorAll("ul.list-group > li.list-group-item"));
        for (let i = 0; i < items.length; i++) {
          if (unreservedExams[i] && !items[i].querySelector(".pl-pt-unreserved-badge")) {
            const badge = document.createElement("span");
            badge.className = "badge bg-danger ms-2 pl-pt-unreserved-badge";
            badge.textContent = unreservedExams[i].reserveDeadlineFormatted
              ? `Reserve by: ${unreservedExams[i].reserveDeadlineFormatted}`
              : "Not Reserved";
            const target = items[i].querySelector('[data-testid="exam"], strong, a') || items[i];
            target.appendChild(badge);
          }
        }
      }
    }
  }

  // Export runtime helpers for testing under node / jsdom
  const runtimeApi = {
    parsePrairieTestDocument,
    parseReservationItem,
    parseUnreservedItem,
    parseSingleReservationPage,
    calculateReservationDeadline,
    formatDeadlineFriendly,
    buildGoogleCalendarComposeUrl,
    buildOutlookWebComposeUrl,
    buildIcsContent,
    injectReservationsCardActions,
    injectReservationRowActions,
    injectSingleReservationActions,
    injectUnreservedWarningBanner,
  };

  if (typeof window !== "undefined") {
    window.__PL_PRAIRIETEST_RUNTIME__ = runtimeApi;
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", runPrairieTestTracker);
    } else {
      void runPrairieTestTracker();
    }
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = runtimeApi;
  }
})(typeof globalThis !== "undefined" ? globalThis : self);
