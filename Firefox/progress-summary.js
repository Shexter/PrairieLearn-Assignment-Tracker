(function initPrairieLearnProgressSummary(global) {
  const PROVENANCE = Object.freeze({
    PARSED_POINTS: "parsed_points",
    PERCENTAGE_ONLY: "percentage_only",
    UNAVAILABLE: "unavailable",
    CLOSED: "closed",
    NOT_STARTED: "not_started",
    NO_DATA: "no_data",
  });

  const EXCLUSION_REASONS = Object.freeze({
    CLOSED: "CLOSED",
    UNAVAILABLE: "UNAVAILABLE",
    PERCENTAGE_ONLY: "PERCENTAGE_ONLY",
    NOT_STARTED_NO_POINTS: "NOT_STARTED_NO_POINTS",
    NO_POINTS_EXPOSED: "NO_POINTS_EXPOSED",
    NO_SCORE_DATA: "NO_SCORE_DATA",
    ZERO_POSSIBLE_POINTS: "ZERO_POSSIBLE_POINTS",
    INVALID_POINTS: "INVALID_POINTS",
  });

  const POINT_PAIR_PATTERN = /(?:^|[^\d./])([+-]?\d+(?:\.\d+)?)\s*(?:\/|\bout\s+of\b|\bof\b)\s*([+-]?\d+(?:\.\d+)?)(?:\s*(?:pts?|points?))?(?:$|[^\d./%])/i;
  const PERCENT_PATTERN = /([+-]?\d+(?:\.\d+)?)\s*%/;

  function normalizeWhitespace(value) {
    return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  }

  function roundTo(value, decimals = 2) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return 0;
    }
    const factor = Math.pow(10, decimals);
    return Math.round((value + Number.EPSILON) * factor) / factor;
  }

  function parsePointsFromString(str) {
    const text = normalizeWhitespace(str);
    if (!text) {
      return {
        pointsEarned: null,
        pointsPossible: null,
        isParsed: false,
        bonusPoints: 0,
        scorePercent: null,
        isPercentageOnly: false,
        isNotStarted: false,
        isInvalid: false,
      };
    }

    if (/not started/i.test(text)) {
      return {
        pointsEarned: null,
        pointsPossible: null,
        isParsed: false,
        bonusPoints: 0,
        scorePercent: null,
        isPercentageOnly: false,
        isNotStarted: true,
        isInvalid: false,
      };
    }

    const pairMatch = text.match(POINT_PAIR_PATTERN);
    if (pairMatch) {
      const earned = Number(pairMatch[1]);
      const possible = Number(pairMatch[2]);
      if (Number.isFinite(earned) && Number.isFinite(possible)) {
        if (earned < 0 || possible < 0) {
          return {
            pointsEarned: earned,
            pointsPossible: possible,
            isParsed: false,
            bonusPoints: 0,
            scorePercent: null,
            isPercentageOnly: false,
            isNotStarted: false,
            isInvalid: true,
          };
        }
        if (possible === 0) {
          return {
            pointsEarned: earned,
            pointsPossible: 0,
            isParsed: false,
            bonusPoints: earned > 0 ? earned : 0,
            scorePercent: null,
            isPercentageOnly: false,
            isNotStarted: false,
            isInvalid: false,
            isZeroPossible: true,
          };
        }
        const bonus = earned > possible ? roundTo(earned - possible, 4) : 0;
        const pct = roundTo((earned / possible) * 100, 2);
        return {
          pointsEarned: earned,
          pointsPossible: possible,
          isParsed: true,
          bonusPoints: bonus,
          scorePercent: pct,
          isPercentageOnly: false,
          isNotStarted: false,
          isInvalid: false,
        };
      }
    }

    const pctMatch = text.match(PERCENT_PATTERN);
    if (pctMatch) {
      const pct = Number(pctMatch[1]);
      if (Number.isFinite(pct)) {
        return {
          pointsEarned: null,
          pointsPossible: null,
          isParsed: false,
          bonusPoints: 0,
          scorePercent: pct,
          isPercentageOnly: true,
          isNotStarted: false,
          isInvalid: false,
        };
      }
    }

    return {
      pointsEarned: null,
      pointsPossible: null,
      isParsed: false,
      bonusPoints: 0,
      scorePercent: null,
      isPercentageOnly: false,
      isNotStarted: false,
      isInvalid: false,
    };
  }

  function parsePoints(input) {
    if (input === null || input === undefined) {
      return {
        pointsEarned: null,
        pointsPossible: null,
        isParsed: false,
        bonusPoints: 0,
        scorePercent: null,
        isPercentageOnly: false,
        isNotStarted: false,
        isInvalid: false,
      };
    }

    if (typeof input === "object") {
      const rawEarned = input.pointsEarned ?? input.earnedPoints ?? input.points ?? input.earned;
      const rawPossible = input.pointsPossible ?? input.possiblePoints ?? input.maxPoints ?? input.possible;

      if (rawEarned !== undefined && rawEarned !== null && rawEarned !== "" &&
          rawPossible !== undefined && rawPossible !== null && rawPossible !== "") {
        const earned = Number(rawEarned);
        const possible = Number(rawPossible);
        if (Number.isFinite(earned) && Number.isFinite(possible)) {
          if (earned < 0 || possible < 0) {
            return {
              pointsEarned: earned,
              pointsPossible: possible,
              isParsed: false,
              bonusPoints: 0,
              scorePercent: null,
              isPercentageOnly: false,
              isNotStarted: false,
              isInvalid: true,
            };
          }
          if (possible === 0) {
            return {
              pointsEarned: earned,
              pointsPossible: 0,
              isParsed: false,
              bonusPoints: earned > 0 ? earned : 0,
              scorePercent: null,
              isPercentageOnly: false,
              isNotStarted: false,
              isInvalid: false,
              isZeroPossible: true,
            };
          }
          const bonus = earned > possible ? roundTo(earned - possible, 4) : 0;
          const pct = roundTo((earned / possible) * 100, 2);
          return {
            pointsEarned: earned,
            pointsPossible: possible,
            isParsed: true,
            bonusPoints: bonus,
            scorePercent: pct,
            isPercentageOnly: false,
            isNotStarted: false,
            isInvalid: false,
          };
        }
      }

      const textCandidate = input.scoreText || input.score || input.pointsText || "";
      if (typeof textCandidate === "string") {
        const parsedFromText = parsePointsFromString(textCandidate);
        if (parsedFromText.scorePercent === null && input.scorePercent !== undefined && input.scorePercent !== null) {
          const sp = Number(input.scorePercent);
          if (Number.isFinite(sp)) {
            parsedFromText.scorePercent = sp;
          }
        }
        return parsedFromText;
      }

      return {
        pointsEarned: null,
        pointsPossible: null,
        isParsed: false,
        bonusPoints: 0,
        scorePercent: null,
        isPercentageOnly: false,
        isNotStarted: false,
        isInvalid: false,
      };
    }

    if (typeof input === "string") {
      return parsePointsFromString(input);
    }

    if (typeof input === "number") {
      return {
        pointsEarned: null,
        pointsPossible: null,
        isParsed: false,
        bonusPoints: 0,
        scorePercent: input,
        isPercentageOnly: true,
        isNotStarted: false,
        isInvalid: false,
      };
    }

    return {
      pointsEarned: null,
      pointsPossible: null,
      isParsed: false,
      bonusPoints: 0,
      scorePercent: null,
      isPercentageOnly: false,
      isNotStarted: false,
      isInvalid: false,
    };
  }

  function isClosedRow(item, now = null) {
    if (!item || typeof item !== "object") return false;
    if (item.isClosed === true) return true;
    const status = String(item.status || "").toLowerCase();
    if (status === "closed") return true;
    const avail = String(item.availabilityText || "");
    const score = String(item.scoreText || item.score || "");
    if (/assessment closed/i.test(avail) || /assessment closed/i.test(score)) {
      return true;
    }
    if (now !== null && now !== undefined) {
      const nowMs = now instanceof Date ? now.getTime() : Number(now);
      if (Number.isFinite(nowMs)) {
        const deadline = item.deadlineAt || (item.deadlineSource ? item.dueAt : null);
        if (deadline) {
          const dueMs = Date.parse(deadline);
          if (!Number.isNaN(dueMs) && dueMs <= nowMs) {
            return true;
          }
        }
      }
    }
    return false;
  }

  function isUnavailableRow(item, now = null) {
    if (!item || typeof item !== "object") return false;
    if (item.isUnavailable === true) return true;
    const status = String(item.status || "").toLowerCase();
    if (status === "unavailable") return true;
    const avail = String(item.availabilityText || "");
    if (/not yet available/i.test(avail) || /^available\b/i.test(avail) || /\bunavailable\b/i.test(avail)) {
      return true;
    }
    if (now !== null && now !== undefined) {
      const nowMs = now instanceof Date ? now.getTime() : Number(now);
      if (Number.isFinite(nowMs) && Array.isArray(item.accessWindows) && item.accessWindows.length > 0) {
        const starts = item.accessWindows
          .map((w) => Date.parse(w?.startIso || w?.start || ""))
          .filter((ms) => !Number.isNaN(ms));
        if (starts.length > 0 && starts.every((s) => s > nowMs)) {
          return true;
        }
      }
    }
    return false;
  }

  function classifyRow(item, options = {}) {
    const now = typeof options === "number" || options instanceof Date ? options : options?.now;
    if (!item || typeof item !== "object") {
      return {
        id: "unknown",
        title: "Unknown",
        badge: null,
        group: null,
        lifecycle: "unavailable",
        provenance: PROVENANCE.NO_DATA,
        pointsEarned: null,
        pointsPossible: null,
        bonusPoints: 0,
        scorePercent: null,
        isIncluded: false,
        exclusionReason: EXCLUSION_REASONS.NO_SCORE_DATA,
        exclusionReasons: [EXCLUSION_REASONS.NO_SCORE_DATA],
        raw: item,
      };
    }

    const id = String(item.id ?? item.assessmentId ?? item.badge ?? item.title ?? "unknown").trim() || "unknown";
    const title = String(item.title ?? item.badge ?? id).trim() || id;
    const badge = item.badge ? String(item.badge).trim() : null;
    const group = item.group ? String(item.group).trim() : null;

    const closed = isClosedRow(item, now);
    const unavailable = !closed && isUnavailableRow(item, now);
    const points = parsePoints(item);

    let lifecycle = "active";
    let provenance = PROVENANCE.NO_DATA;
    let isIncluded = false;
    let exclusionReason = null;
    const exclusionReasons = [];

    if (closed) {
      lifecycle = "closed";
      provenance = PROVENANCE.CLOSED;
      exclusionReason = EXCLUSION_REASONS.CLOSED;
      exclusionReasons.push(EXCLUSION_REASONS.CLOSED);
      if (!points.isParsed) {
        if (points.isPercentageOnly) exclusionReasons.push(EXCLUSION_REASONS.PERCENTAGE_ONLY);
        else if (points.isNotStarted) exclusionReasons.push(EXCLUSION_REASONS.NOT_STARTED_NO_POINTS);
        else exclusionReasons.push(EXCLUSION_REASONS.NO_POINTS_EXPOSED);
      }
    } else if (unavailable) {
      lifecycle = "unavailable";
      provenance = PROVENANCE.UNAVAILABLE;
      exclusionReason = EXCLUSION_REASONS.UNAVAILABLE;
      exclusionReasons.push(EXCLUSION_REASONS.UNAVAILABLE);
      if (!points.isParsed) {
        if (points.isPercentageOnly) exclusionReasons.push(EXCLUSION_REASONS.PERCENTAGE_ONLY);
        else if (points.isNotStarted) exclusionReasons.push(EXCLUSION_REASONS.NOT_STARTED_NO_POINTS);
        else exclusionReasons.push(EXCLUSION_REASONS.NO_POINTS_EXPOSED);
      }
    } else {
      lifecycle = "active";
      if (points.isParsed && points.pointsPossible > 0) {
        provenance = PROVENANCE.PARSED_POINTS;
        isIncluded = true;
        exclusionReason = null;
      } else if (points.isPercentageOnly) {
        provenance = PROVENANCE.PERCENTAGE_ONLY;
        exclusionReason = EXCLUSION_REASONS.PERCENTAGE_ONLY;
        exclusionReasons.push(EXCLUSION_REASONS.PERCENTAGE_ONLY);
      } else if (points.isNotStarted || /not started/i.test(item.scoreText || item.score || "")) {
        provenance = PROVENANCE.NOT_STARTED;
        exclusionReason = EXCLUSION_REASONS.NOT_STARTED_NO_POINTS;
        exclusionReasons.push(EXCLUSION_REASONS.NOT_STARTED_NO_POINTS);
      } else if (points.isZeroPossible) {
        provenance = PROVENANCE.NO_DATA;
        exclusionReason = EXCLUSION_REASONS.ZERO_POSSIBLE_POINTS;
        exclusionReasons.push(EXCLUSION_REASONS.ZERO_POSSIBLE_POINTS);
      } else if (points.isInvalid) {
        provenance = PROVENANCE.NO_DATA;
        exclusionReason = EXCLUSION_REASONS.INVALID_POINTS;
        exclusionReasons.push(EXCLUSION_REASONS.INVALID_POINTS);
      } else {
        provenance = PROVENANCE.NO_DATA;
        exclusionReason = EXCLUSION_REASONS.NO_SCORE_DATA;
        exclusionReasons.push(EXCLUSION_REASONS.NO_SCORE_DATA);
      }
    }

    return {
      id,
      title,
      badge,
      group,
      lifecycle,
      provenance,
      pointsEarned: points.pointsEarned,
      pointsPossible: points.pointsPossible,
      bonusPoints: points.bonusPoints || 0,
      scorePercent: points.scorePercent,
      isIncluded,
      exclusionReason,
      exclusionReasons,
      raw: item,
    };
  }

  function aggregateProgress(items, options = {}) {
    const now = typeof options === "number" || options instanceof Date ? options : options?.now;
    const itemList = Array.isArray(items) ? items : [];

    let totalSecuredPoints = 0;
    let activeSecuredPoints = 0;
    let closedSecuredPoints = 0;
    let activeAvailablePoints = 0;
    let activeBonusPoints = 0;
    let totalBonusPoints = 0;

    const classifiedRows = [];
    const includedRows = [];
    const excludedRows = [];

    const byProvenance = {
      parsed_points: 0,
      percentage_only: 0,
      unavailable: 0,
      closed: 0,
      not_started: 0,
      no_data: 0,
    };

    const byExclusionReason = {};

    const meanIncludedRows = [];
    const unattemptedRows = [];

    for (const item of itemList) {
      const row = classifyRow(item, { now });
      classifiedRows.push(row);

      const provKey = row.provenance;
      if (provKey && byProvenance[provKey] !== undefined) {
        byProvenance[provKey] += 1;
      } else if (provKey) {
        byProvenance[provKey] = 1;
      }

      if (row.isIncluded) {
        includedRows.push(row);
        activeSecuredPoints += row.pointsEarned || 0;
        activeAvailablePoints += row.pointsPossible || 0;
        activeBonusPoints += row.bonusPoints || 0;
      } else {
        excludedRows.push(row);
        if (row.exclusionReason) {
          byExclusionReason[row.exclusionReason] = (byExclusionReason[row.exclusionReason] || 0) + 1;
        }
        if (row.lifecycle === "closed" && typeof row.pointsEarned === "number") {
          closedSecuredPoints += row.pointsEarned;
          if (row.bonusPoints) totalBonusPoints += row.bonusPoints;
        }
      }

      // Mean percentage aggregation rules:
      // - Closed and unavailable rows stay excluded.
      // - Active rows with no attempt ("Not started") are excluded from the mean and counted separately.
      // - Unweighted mean over active rows with a parseable percentage.
      if (row.lifecycle === "active") {
        const isNotStarted =
          row.provenance === PROVENANCE.NOT_STARTED ||
          row.exclusionReason === EXCLUSION_REASONS.NOT_STARTED_NO_POINTS ||
          /not started/i.test(row.raw?.scoreText || row.raw?.score || "") ||
          String(row.raw?.status || "").toLowerCase() === "not_started";

        if (isNotStarted) {
          unattemptedRows.push(row);
        } else if (typeof row.scorePercent === "number" && Number.isFinite(row.scorePercent)) {
          meanIncludedRows.push(row);
        }
      }
    }

    activeSecuredPoints = roundTo(activeSecuredPoints, 4);
    activeAvailablePoints = roundTo(activeAvailablePoints, 4);
    activeBonusPoints = roundTo(activeBonusPoints, 4);
    closedSecuredPoints = roundTo(closedSecuredPoints, 4);
    totalSecuredPoints = roundTo(activeSecuredPoints + closedSecuredPoints, 4);
    totalBonusPoints = roundTo(activeBonusPoints + totalBonusPoints, 4);

    const hasPoints = activeAvailablePoints > 0 || includedRows.length > 0;
    const percentage = activeAvailablePoints > 0 ? roundTo((activeSecuredPoints / activeAvailablePoints) * 100, 2) : null;
    const isIncomplete = excludedRows.length > 0;
    const isComplete = !isIncomplete && itemList.length > 0;

    let meanPercentage = null;
    if (meanIncludedRows.length > 0) {
      const meanSum = meanIncludedRows.reduce((acc, r) => acc + r.scorePercent, 0);
      meanPercentage = roundTo(meanSum / meanIncludedRows.length, 2);
    }

    byProvenance["parsed-points"] = byProvenance.parsed_points;
    byProvenance["percentage-only"] = byProvenance.percentage_only;
    byProvenance["not-started"] = byProvenance.not_started;
    byProvenance["no-data"] = byProvenance.no_data;

    let bonusExplanation = null;
    if (activeBonusPoints > 0) {
      bonusExplanation = `Includes ${activeBonusPoints} bonus point${activeBonusPoints === 1 ? "" : "s"} above maximum.`;
    }

    let headlineKind = "none";
    let headline = "No progress figure can be derived";
    if (hasPoints) {
      headlineKind = "points";
      headline = percentage !== null
        ? `${activeSecuredPoints} / ${activeAvailablePoints} pts (${percentage}%)`
        : `${activeSecuredPoints} / ${activeAvailablePoints} pts`;
    } else if (meanPercentage !== null) {
      headlineKind = "mean_percentage";
      headline = `${meanPercentage}%`;
    }

    return {
      securedPoints: activeSecuredPoints,
      availablePoints: activeAvailablePoints,
      percentage,
      bonusPoints: activeBonusPoints,
      bonusExplanation,

      meanPercentage,
      meanPercent: meanPercentage,
      mean: meanPercentage,
      hasMeanPercentage: meanPercentage !== null,

      headlineKind,
      headline,

      activeSecuredPoints,
      activeAvailablePoints,
      closedSecuredPoints,
      totalSecuredPoints,
      totalBonusPoints,

      hasPoints,
      hasParseablePoints: hasPoints,
      isComplete,
      isIncomplete,

      provenance: {
        securedPoints: {
          value: activeSecuredPoints,
          source: PROVENANCE.PARSED_POINTS,
          includedRowCount: includedRows.length,
        },
        availablePoints: {
          value: activeAvailablePoints,
          source: PROVENANCE.PARSED_POINTS,
          includedRowCount: includedRows.length,
        },
        bonusPoints: {
          value: activeBonusPoints,
          source: PROVENANCE.PARSED_POINTS,
        },
        percentage: {
          value: percentage,
          source: activeAvailablePoints > 0 ? "derived_from_parsed_points" : "none",
        },
        meanPercentage: {
          value: meanPercentage,
          source: meanPercentage !== null ? "unweighted_mean_of_percentages" : "none",
          includedRowCount: meanIncludedRows.length,
        },
        mean: {
          value: meanPercentage,
          source: meanPercentage !== null ? "unweighted_mean_of_percentages" : "none",
          includedRowCount: meanIncludedRows.length,
        },
        meanPercent: {
          value: meanPercentage,
          source: meanPercentage !== null ? "unweighted_mean_of_percentages" : "none",
          includedRowCount: meanIncludedRows.length,
        },
      },

      counts: {
        totalRows: itemList.length,
        total: itemList.length,
        includedRows: includedRows.length,
        included: includedRows.length,
        excludedRows: excludedRows.length,
        excluded: excludedRows.length,
        byProvenance,
        byExclusionReason,
        meanIncludedRows: meanIncludedRows.length,
        meanExcludedRows: itemList.length - meanIncludedRows.length,
        unattemptedRows: unattemptedRows.length,
        notStartedRows: unattemptedRows.length,
      },

      rows: classifiedRows,
      includedRows,
      excludedRows,
      meanRows: meanIncludedRows,
      meanIncludedRows,
      unattemptedRows,
    };
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

  global.PrairieLearnProgressSummary = {
    PROVENANCE,
    EXCLUSION_REASONS,
    normalizeWhitespace,
    roundTo,
    parsePoints,
    parsePointsFromString,
    isClosedRow,
    isUnavailableRow,
    classifyRow,
    aggregateProgress,
    formatSummaryHeadline,
    computeProgressSummary: aggregateProgress,
    summarizeCourseProgress: aggregateProgress,
    aggregateCourseProgress: aggregateProgress,
  };
})(globalThis);
