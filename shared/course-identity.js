(function initPrairieLearnCourseIdentity(global) {
  "use strict";

  const MONTHS = {
    jan: 0, january: 0,
    feb: 1, february: 1,
    mar: 2, march: 2,
    apr: 3, april: 3,
    may: 4,
    jun: 5, june: 5,
    jul: 6, july: 6,
    aug: 7, august: 7,
    sep: 8, sept: 8, september: 8,
    oct: 9, october: 9,
    nov: 10, november: 10,
    dec: 11, december: 11,
  };

  function normalizeWhitespace(value) {
    return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  }

  function normalizeOrigin(raw) {
    if (typeof raw !== "string" || !raw.trim()) {
      return null;
    }
    const trimmed = raw.trim();
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    try {
      const parsed = new URL(withProto);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return null;
      }
      return parsed.origin.toLowerCase();
    } catch {
      return null;
    }
  }

  function extractCourseInstanceId(input) {
    if (typeof input === "number" && Number.isInteger(input) && input > 0) {
      return String(input);
    }
    if (typeof input !== "string" || !input.trim()) {
      return null;
    }
    const trimmed = input.trim();
    if (/^\d+$/.test(trimmed)) {
      return trimmed;
    }
    const match = trimmed.match(/\/pl\/course_instance\/(\d+)(?:[/?#]|$)/i);
    if (match) {
      return match[1];
    }
    return null;
  }

  function getCourseIdentityKey(origin, courseInstanceId) {
    const normOrigin = normalizeOrigin(origin);
    const normId = extractCourseInstanceId(courseInstanceId);
    if (!normOrigin || !normId) {
      return null;
    }
    return `${normOrigin}|${normId}`;
  }

  function deriveCourseIdentity(courseOrUrl, fallbackOrigin) {
    if (!courseOrUrl) {
      return null;
    }

    if (typeof courseOrUrl === "string") {
      const trimmed = courseOrUrl.trim();
      const directOrigin = normalizeOrigin(trimmed);
      const effectiveOrigin = (trimmed.startsWith("http://") || trimmed.startsWith("https://")) && directOrigin
        ? directOrigin
        : normalizeOrigin(fallbackOrigin);

      const id = extractCourseInstanceId(trimmed);
      if (!effectiveOrigin || !id) {
        return null;
      }
      return {
        origin: effectiveOrigin,
        courseInstanceId: id,
        key: `${effectiveOrigin}|${id}`,
      };
    }

    if (typeof courseOrUrl === "object") {
      const urlCandidate = courseOrUrl.href || courseOrUrl.url || courseOrUrl.link || null;
      const rawOrigin = courseOrUrl.origin || (urlCandidate ? normalizeOrigin(urlCandidate) : null) || fallbackOrigin;
      const effectiveOrigin = normalizeOrigin(rawOrigin);

      const idCandidate = courseOrUrl.courseInstanceId
        ?? courseOrUrl.course_instance_id
        ?? courseOrUrl.course_instance?.id
        ?? courseOrUrl.courseInstance?.id
        ?? courseOrUrl.id
        ?? (urlCandidate ? extractCourseInstanceId(urlCandidate) : null);

      const id = extractCourseInstanceId(idCandidate);
      if (!effectiveOrigin || !id) {
        return null;
      }
      return {
        origin: effectiveOrigin,
        courseInstanceId: id,
        key: `${effectiveOrigin}|${id}`,
      };
    }

    return null;
  }

  function areCourseIdentitiesEqual(a, b) {
    const idA = deriveCourseIdentity(a);
    const idB = deriveCourseIdentity(b);
    if (!idA || !idB) {
      return false;
    }
    return idA.key === idB.key;
  }

  function normalizeReferenceDate(ref) {
    if (!ref) {
      return null;
    }
    if (ref instanceof Date) {
      return Number.isNaN(ref.getTime()) ? null : ref;
    }
    if (typeof ref === "string" || typeof ref === "number") {
      const parsed = new Date(ref);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    return null;
  }

  function makeZonedDate(year, month, day, hour = 0, minute = 0, second = 0, ms = 0, timeZone = "UTC") {
    if (!timeZone || timeZone === "UTC" || timeZone === "Etc/UTC" || timeZone === "Z") {
      return new Date(Date.UTC(year, month - 1, day, hour, minute, second, ms));
    }
    const offsetMatch = String(timeZone).match(/^([+-])(\d{2}):?(\d{2})$/);
    if (offsetMatch) {
      const sign = offsetMatch[1] === "+" ? 1 : -1;
      const offsetMin = sign * (parseInt(offsetMatch[2], 10) * 60 + parseInt(offsetMatch[3], 10));
      const utcMs = Date.UTC(year, month - 1, day, hour, minute, second, ms) - offsetMin * 60 * 1000;
      return new Date(utcMs);
    }
    try {
      const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second, ms);
      const d = new Date(utcGuess);
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
        second: "numeric",
        hour12: false,
      });
      const parts = formatter.formatToParts(d);
      let pY, pM, pD, pH = 0, pMin = 0, pS = 0;
      for (const p of parts) {
        if (p.type === "year") pY = parseInt(p.value, 10);
        else if (p.type === "month") pM = parseInt(p.value, 10);
        else if (p.type === "day") pD = parseInt(p.value, 10);
        else if (p.type === "hour") pH = parseInt(p.value, 10) % 24;
        else if (p.type === "minute") pMin = parseInt(p.value, 10);
        else if (p.type === "second") pS = parseInt(p.value, 10);
      }
      const targetWallClockMs = Date.UTC(pY, pM - 1, pD, pH, pMin, pS, ms);
      const diff = targetWallClockMs - utcGuess;
      return new Date(utcGuess - diff);
    } catch {
      return new Date(Date.UTC(year, month - 1, day, hour, minute, second, ms));
    }
  }

  function getSeasonBoundaries(season, year, termNumber = null, timeZone = "UTC") {
    if (!season || !year || !Number.isInteger(year) || year <= 0) {
      return null;
    }

    const normSeason = season.toLowerCase();
    let start, end;

    if (normSeason === "fall") {
      start = makeZonedDate(year, 8, 1, 0, 0, 0, 0, timeZone);
      end = makeZonedDate(year, 12, 31, 23, 59, 59, 999, timeZone);
    } else if (normSeason === "spring") {
      start = makeZonedDate(year, 1, 1, 0, 0, 0, 0, timeZone);
      end = makeZonedDate(year, 5, 31, 23, 59, 59, 999, timeZone);
    } else if (normSeason === "summer") {
      if (termNumber === 1) {
        start = makeZonedDate(year, 5, 1, 0, 0, 0, 0, timeZone);
        end = makeZonedDate(year, 6, 30, 23, 59, 59, 999, timeZone);
      } else if (termNumber === 2) {
        start = makeZonedDate(year, 7, 1, 0, 0, 0, 0, timeZone);
        end = makeZonedDate(year, 8, 31, 23, 59, 59, 999, timeZone);
      } else {
        start = makeZonedDate(year, 5, 1, 0, 0, 0, 0, timeZone);
        end = makeZonedDate(year, 8, 31, 23, 59, 59, 999, timeZone);
      }
    } else if (normSeason === "winter") {
      if (termNumber === 1) {
        start = makeZonedDate(year, 9, 1, 0, 0, 0, 0, timeZone);
        end = makeZonedDate(year, 12, 31, 23, 59, 59, 999, timeZone);
      } else if (termNumber === 2) {
        start = makeZonedDate(year, 1, 1, 0, 0, 0, 0, timeZone);
        end = makeZonedDate(year, 4, 30, 23, 59, 59, 999, timeZone);
      } else {
        start = makeZonedDate(year, 1, 1, 0, 0, 0, 0, timeZone);
        end = makeZonedDate(year, 4, 30, 23, 59, 59, 999, timeZone);
      }
    } else {
      return null;
    }

    return {
      startDate: start,
      endDate: end,
      startIso: start.toISOString(),
      endIso: end.toISOString(),
    };
  }

  function parseSingleDate(str, isEnd = false, defaultYear = null) {
    if (!str || typeof str !== "string") return null;
    const s = str.trim();
    const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (isoMatch) {
      return [
        parseInt(isoMatch[1], 10),
        parseInt(isoMatch[2], 10),
        parseInt(isoMatch[3], 10),
        isEnd ? 23 : 0,
        isEnd ? 59 : 0,
        isEnd ? 59 : 0,
        isEnd ? 999 : 0,
      ];
    }
    const mdyMatch = s.match(/^([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?$/i);
    if (mdyMatch) {
      const mName = mdyMatch[1].toLowerCase().slice(0, 3);
      if (MONTHS[mName] !== undefined) {
        const y = mdyMatch[3] ? parseInt(mdyMatch[3], 10) : defaultYear;
        if (!y) return null;
        return [
          y,
          MONTHS[mName] + 1,
          parseInt(mdyMatch[2], 10),
          isEnd ? 23 : 0,
          isEnd ? 59 : 0,
          isEnd ? 59 : 0,
          isEnd ? 999 : 0,
        ];
      }
    }
    const dmyMatch = s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\.?,?\s+(\d{4})$/i);
    if (dmyMatch) {
      const mName = dmyMatch[2].toLowerCase().slice(0, 3);
      if (MONTHS[mName] !== undefined) {
        const y = parseInt(dmyMatch[3], 10);
        return [
          y,
          MONTHS[mName] + 1,
          parseInt(dmyMatch[1], 10),
          isEnd ? 23 : 0,
          isEnd ? 59 : 0,
          isEnd ? 59 : 0,
          isEnd ? 999 : 0,
        ];
      }
    }
    return null;
  }

  function parseDateRange(rangeStr, options = {}) {
    if (typeof rangeStr !== "string") return null;
    const timeZone = options.timeZone || "UTC";
    const s = normalizeWhitespace(rangeStr);
    const match = s.match(/^(?:from\s+)?(.+?)\s+(?:to|through|until|–|—|-|\/|\.\.)\s+(.+)$/i);
    if (!match) return null;

    const startRaw = match[1].trim();
    const endRaw = match[2].trim();

    const endParts = parseSingleDate(endRaw, true);
    if (!endParts) return null;
    const endYear = endParts[0];

    const startParts = parseSingleDate(startRaw, false, endYear);
    if (!startParts) return null;

    const startDate = makeZonedDate(startParts[0], startParts[1], startParts[2], startParts[3], startParts[4], startParts[5], startParts[6], timeZone);
    const endDate = makeZonedDate(endParts[0], endParts[1], endParts[2], endParts[3], endParts[4], endParts[5], endParts[6], timeZone);

    return {
      type: "date_range",
      season: null,
      termNumber: null,
      year: endYear,
      startDate,
      endDate,
      startIso: startDate.toISOString(),
      endIso: endDate.toISOString(),
      isConfident: true,
    };
  }

  function parseTermString(label) {
    if (typeof label !== "string" || !label.trim()) return null;
    const s = normalizeWhitespace(label);

    // 1. Session codes: 2026W1, 2026W2, 2026S1, 2026S2, 2026W, 2026F, 2026FA, 2026SP
    const sessionMatch = s.match(/^(\d{4})\s*[-_]?\s*(W|S|F|FA|SP|SU|WI|WN)\s*([12])?$/i);
    if (sessionMatch) {
      const y = parseInt(sessionMatch[1], 10);
      const code = sessionMatch[2].toUpperCase();
      const termNum = sessionMatch[3] ? parseInt(sessionMatch[3], 10) : null;
      let season = "Unknown";
      if (code === "W" || code === "WI" || code === "WN") season = "Winter";
      else if (code === "S" || code === "SU") season = "Summer";
      else if (code === "F" || code === "FA") season = "Fall";
      else if (code === "SP") season = "Spring";
      return { season, termNumber: termNum, year: y };
    }

    // 2. Multi-year spans: 2025/2026 Winter Term 2, 2025-2026 Winter Term 2, 2025/26 Winter Term 2
    const multiYearMatch = s.match(/^(\d{4})\s*[-/]\s*(\d{2,4})\s+(Winter|Fall|Spring|Summer|Autumn)\s*(?:Term\s*([12]))?$/i);
    if (multiYearMatch) {
      const y1 = parseInt(multiYearMatch[1], 10);
      let y2 = parseInt(multiYearMatch[2], 10);
      if (y2 < 100) y2 = Math.floor(y1 / 100) * 100 + y2;
      const seasonRaw = multiYearMatch[3].toLowerCase();
      const season = seasonRaw === "autumn" ? "Fall" : seasonRaw.charAt(0).toUpperCase() + seasonRaw.slice(1);
      const termNum = multiYearMatch[4] ? parseInt(multiYearMatch[4], 10) : null;
      const year = (season === "Winter" && termNum === 2) ? y2 : y1;
      return { season, termNumber: termNum, year };
    }

    // 3. Season + Term X + Year (e.g. Winter Term 2 2026, 2026 Winter Term 2, Winter 2026 Term 2)
    const seasonTermYearMatch1 = s.match(/^(Winter|Fall|Spring|Summer|Autumn)\s+Term\s*([12])\s*,?\s*(\d{4})$/i);
    if (seasonTermYearMatch1) {
      const seasonRaw = seasonTermYearMatch1[1].toLowerCase();
      const season = seasonRaw === "autumn" ? "Fall" : seasonRaw.charAt(0).toUpperCase() + seasonRaw.slice(1);
      return { season, termNumber: parseInt(seasonTermYearMatch1[2], 10), year: parseInt(seasonTermYearMatch1[3], 10) };
    }
    const seasonTermYearMatch2 = s.match(/^(\d{4})\s+(Winter|Fall|Spring|Summer|Autumn)\s+Term\s*([12])$/i);
    if (seasonTermYearMatch2) {
      const seasonRaw = seasonTermYearMatch2[2].toLowerCase();
      const season = seasonRaw === "autumn" ? "Fall" : seasonRaw.charAt(0).toUpperCase() + seasonRaw.slice(1);
      return { season, termNumber: parseInt(seasonTermYearMatch2[3], 10), year: parseInt(seasonTermYearMatch2[1], 10) };
    }
    const seasonTermYearMatch3 = s.match(/^(Winter|Fall|Spring|Summer|Autumn)\s+(\d{4})\s+Term\s*([12])$/i);
    if (seasonTermYearMatch3) {
      const seasonRaw = seasonTermYearMatch3[1].toLowerCase();
      const season = seasonRaw === "autumn" ? "Fall" : seasonRaw.charAt(0).toUpperCase() + seasonRaw.slice(1);
      return { season, termNumber: parseInt(seasonTermYearMatch3[3], 10), year: parseInt(seasonTermYearMatch3[2], 10) };
    }

    // 4. Season + Term X without year (e.g. Winter Term 2, Winter Term 1)
    const seasonTermMatch = s.match(/^(Winter|Fall|Spring|Summer|Autumn)\s+Term\s*([12])$/i);
    if (seasonTermMatch) {
      const seasonRaw = seasonTermMatch[1].toLowerCase();
      const season = seasonRaw === "autumn" ? "Fall" : seasonRaw.charAt(0).toUpperCase() + seasonRaw.slice(1);
      return { season, termNumber: parseInt(seasonTermMatch[2], 10), year: null };
    }

    // 5. Season + Year (e.g. Fall 2026, Spring 2026, 2026 Fall, Fall '26)
    const seasonYearMatch1 = s.match(/^(Winter|Fall|Spring|Summer|Autumn)\s+['’]?(\d{2,4})$/i);
    if (seasonYearMatch1) {
      const seasonRaw = seasonYearMatch1[1].toLowerCase();
      const season = seasonRaw === "autumn" ? "Fall" : seasonRaw.charAt(0).toUpperCase() + seasonRaw.slice(1);
      let y = parseInt(seasonYearMatch1[2], 10);
      if (y < 100) y = 2000 + y;
      return { season, termNumber: null, year: y };
    }
    const seasonYearMatch2 = s.match(/^(\d{4})\s+(Winter|Fall|Spring|Summer|Autumn)$/i);
    if (seasonYearMatch2) {
      const seasonRaw = seasonYearMatch2[2].toLowerCase();
      const season = seasonRaw === "autumn" ? "Fall" : seasonRaw.charAt(0).toUpperCase() + seasonRaw.slice(1);
      return { season, termNumber: null, year: parseInt(seasonYearMatch2[1], 10) };
    }

    // 6. Short codes like FA26, SP26, SU26, WI26
    const shortMatch = s.match(/^(FA|SP|SU|WI|WN|FL)\s*['’]?(\d{2,4})$/i);
    if (shortMatch) {
      const code = shortMatch[1].toUpperCase();
      let season = "Fall";
      if (code === "SP") season = "Spring";
      else if (code === "SU") season = "Summer";
      else if (code === "WI" || code === "WN") season = "Winter";
      let y = parseInt(shortMatch[2], 10);
      if (y < 100) y = 2000 + y;
      return { season, termNumber: null, year: y };
    }

    return null;
  }

  function parseTerm(label, options = {}) {
    const timeZone = options.timeZone || "UTC";
    const refDate = normalizeReferenceDate(options.referenceDate || options.now);

    const unknownResult = {
      raw: typeof label === "string" ? label : "",
      isConfident: false,
      type: "unknown",
      season: null,
      termNumber: null,
      year: null,
      startDate: null,
      endDate: null,
      startIso: null,
      endIso: null,
      classification: "Unknown",
      status: "Unknown",
    };

    if (typeof label !== "string" || !label.trim()) {
      return unknownResult;
    }

    const dateRangeResult = parseDateRange(label, options);
    if (dateRangeResult) {
      const classification = refDate
        ? (refDate.getTime() > dateRangeResult.endDate.getTime() ? "Past" : "Active")
        : "Unknown";
      return {
        raw: label,
        ...dateRangeResult,
        classification,
        status: classification,
      };
    }

    const termDetails = parseTermString(label);
    if (!termDetails) {
      return unknownResult;
    }

    let effectiveYear = termDetails.year;
    if (!effectiveYear) {
      if (options.year && Number.isInteger(options.year) && options.year > 0) {
        effectiveYear = options.year;
      } else if (options.defaultYear && Number.isInteger(options.defaultYear) && options.defaultYear > 0) {
        effectiveYear = options.defaultYear;
      } else if (refDate) {
        effectiveYear = refDate.getFullYear();
      }
    }

    if (!effectiveYear) {
      return unknownResult;
    }

    const boundaries = getSeasonBoundaries(termDetails.season, effectiveYear, termDetails.termNumber, timeZone);
    if (!boundaries) {
      return unknownResult;
    }

    const classification = refDate
      ? (refDate.getTime() > boundaries.endDate.getTime() ? "Past" : "Active")
      : "Unknown";

    return {
      raw: label,
      isConfident: true,
      type: "term",
      season: termDetails.season,
      termNumber: termDetails.termNumber,
      year: effectiveYear,
      startDate: boundaries.startDate,
      endDate: boundaries.endDate,
      startIso: boundaries.startIso,
      endIso: boundaries.endIso,
      classification,
      status: classification,
    };
  }

  function classifyCourseTerm(termOrLabel, options = {}) {
    if (!termOrLabel) {
      return "Unknown";
    }
    if (typeof termOrLabel === "object" && termOrLabel.classification && typeof termOrLabel.classification === "string") {
      const refDate = normalizeReferenceDate(options.referenceDate || options.now);
      if (refDate && termOrLabel.endDate instanceof Date) {
        return refDate.getTime() > termOrLabel.endDate.getTime() ? "Past" : "Active";
      }
      return termOrLabel.classification;
    }
    const parsed = parseTerm(String(termOrLabel), options);
    return parsed.classification;
  }

  global.PrairieLearnCourseIdentity = {
    normalizeWhitespace,
    normalizeOrigin,
    extractCourseInstanceId,
    getCourseIdentityKey,
    deriveCourseIdentity,
    areCourseIdentitiesEqual,
    getSeasonBoundaries,
    parseDateRange,
    parseTerm,
    classifyCourseTerm,
  };
})(globalThis);
