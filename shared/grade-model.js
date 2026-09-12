(function initPrairieLearnGradeModel(global) {
  const SCHEMA_VERSION = 1;

  const AGGREGATION_MODES = Object.freeze({
    EQUAL_ASSESSMENT: "equal-assessment",
    VISIBLE_POINTS: "visible-points",
  });

  const RESULT_KINDS = Object.freeze({
    OBSERVED: "observed",
    MANUAL: "manual",
    HYPOTHETICAL: "hypothetical",
  });

  const TARGET_OUTCOMES = Object.freeze({
    ALREADY_SECURED: "already-secured",
    FEASIBLE: "feasible",
    IMPOSSIBLE: "impossible",
    UNDERDETERMINED: "underdetermined",
  });

  const VALIDATION_CODES = Object.freeze({
    INVALID_CONFIG: "INVALID_CONFIG",
    INVALID_SCHEMA_VERSION: "INVALID_SCHEMA_VERSION",
    EMPTY_CATEGORIES: "EMPTY_CATEGORIES",
    INVALID_CATEGORY: "INVALID_CATEGORY",
    DUPLICATE_CATEGORY_ID: "DUPLICATE_CATEGORY_ID",
    INVALID_WEIGHT: "INVALID_WEIGHT",
    NEGATIVE_WEIGHT: "NEGATIVE_WEIGHT",
    INVALID_WEIGHT_SUM: "INVALID_WEIGHT_SUM",
    MISSING_AGGREGATION: "MISSING_AGGREGATION",
    NEGATIVE_DROP_COUNT: "NEGATIVE_DROP_COUNT",
    EXCESSIVE_DROP_COUNT: "EXCESSIVE_DROP_COUNT",
    NEGATIVE_CAP: "NEGATIVE_CAP",
    NEGATIVE_BONUS_LIMIT: "NEGATIVE_BONUS_LIMIT",
    NEGATIVE_TARGET: "NEGATIVE_TARGET",
    UNMAPPED_ASSESSMENT: "UNMAPPED_ASSESSMENT",
    DUPLICATE_MAPPING: "DUPLICATE_MAPPING",
    INVALID_CATEGORY_MAPPING: "INVALID_CATEGORY_MAPPING",
    INCOMPATIBLE_VISIBLE_POINTS: "INCOMPATIBLE_VISIBLE_POINTS",
    ZERO_MAX_POINTS: "ZERO_MAX_POINTS",
    NEGATIVE_SCORE: "NEGATIVE_SCORE",
    OVER_BONUS_LIMIT: "OVER_BONUS_LIMIT",
  });

  function roundTo(value, decimals = 2) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return 0;
    }
    const factor = Math.pow(10, decimals);
    return Math.round((value + Number.EPSILON) * factor) / factor;
  }

  function normalizeAggregationMode(mode) {
    if (typeof mode !== "string") {
      return null;
    }
    const trimmed = mode.trim().toLowerCase().replace(/_/g, "-");
    if (trimmed === "equal-assessment" || trimmed === "equal" || trimmed === "equal-weight") {
      return AGGREGATION_MODES.EQUAL_ASSESSMENT;
    }
    if (trimmed === "visible-points" || trimmed === "points") {
      return AGGREGATION_MODES.VISIBLE_POINTS;
    }
    return null;
  }

  function normalizeResultKind(kind) {
    if (typeof kind !== "string") {
      return RESULT_KINDS.OBSERVED;
    }
    const trimmed = kind.trim().toLowerCase();
    if (trimmed === RESULT_KINDS.MANUAL) {
      return RESULT_KINDS.MANUAL;
    }
    if (trimmed === RESULT_KINDS.HYPOTHETICAL || trimmed === "what-if") {
      return RESULT_KINDS.HYPOTHETICAL;
    }
    if (trimmed === RESULT_KINDS.OBSERVED || trimmed === "pl" || trimmed === "prairielearn") {
      return RESULT_KINDS.OBSERVED;
    }
    return RESULT_KINDS.OBSERVED;
  }

  function deepClone(value) {
    if (value === null || typeof value !== "object") {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map((entry) => deepClone(entry));
    }
    const copy = {};
    for (const [k, v] of Object.entries(value)) {
      copy[k] = deepClone(v);
    }
    return copy;
  }

  function parseAssessmentScores(item) {
    if (!item || typeof item !== "object") {
      return {
        id: "unknown",
        title: "Unknown",
        scorePercent: null,
        pointsEarned: null,
        pointsPossible: null,
        resultKind: RESULT_KINDS.OBSERVED,
        kind: RESULT_KINDS.OBSERVED,
        isHypothetical: false,
        isManual: false,
        isObserved: true,
        raw: item,
      };
    }

    const id = String(item.id ?? item.assessmentId ?? item.badge ?? item.title ?? "").trim() || "unknown";
    const title = String(item.title ?? item.badge ?? id).trim() || id;

    let resultKind = RESULT_KINDS.OBSERVED;
    if (item.resultKind) {
      resultKind = normalizeResultKind(item.resultKind);
    } else if (item.kind) {
      resultKind = normalizeResultKind(item.kind);
    } else if (item.isManual || item.source === "manual") {
      resultKind = RESULT_KINDS.MANUAL;
    } else if (item.isHypothetical || item.source === "hypothetical") {
      resultKind = RESULT_KINDS.HYPOTHETICAL;
    } else if (item.isObserved || item.source === "observed") {
      resultKind = RESULT_KINDS.OBSERVED;
    }

    const isHypothetical = resultKind === RESULT_KINDS.HYPOTHETICAL;
    const isManual = resultKind === RESULT_KINDS.MANUAL;
    const isObserved = resultKind === RESULT_KINDS.OBSERVED;

    let pointsEarned = null;
    const rawPointsEarned = item.pointsEarned ?? item.points ?? item.earnedPoints;
    if (rawPointsEarned !== undefined && rawPointsEarned !== null && rawPointsEarned !== "") {
      const p = Number(rawPointsEarned);
      if (Number.isFinite(p)) {
        pointsEarned = p;
      }
    }

    let pointsPossible = null;
    const rawPointsPossible = item.pointsPossible ?? item.maxPoints ?? item.possiblePoints;
    if (rawPointsPossible !== undefined && rawPointsPossible !== null && rawPointsPossible !== "") {
      const mp = Number(rawPointsPossible);
      if (Number.isFinite(mp)) {
        pointsPossible = mp;
      }
    }

    let scorePercent = null;
    const rawScorePercent = item.scorePercent;
    if (rawScorePercent !== undefined && rawScorePercent !== null && rawScorePercent !== "") {
      const sp = Number(rawScorePercent);
      if (Number.isFinite(sp)) {
        scorePercent = sp;
      }
    } else if (item.score !== undefined && item.score !== null && item.score !== "") {
      if (typeof item.score === "number") {
        if (Number.isFinite(item.score)) {
          scorePercent = item.score;
        }
      } else if (typeof item.score === "string") {
        const match = item.score.match(/([+-]?\d+(?:\.\d+)?)\s*%?/);
        if (match) {
          const parsed = Number(match[1]);
          if (Number.isFinite(parsed)) {
            scorePercent = parsed;
          }
        }
      }
    }

    if (scorePercent === null && pointsEarned !== null && pointsPossible !== null && pointsPossible > 0) {
      scorePercent = (pointsEarned / pointsPossible) * 100;
    }

    return {
      id,
      title,
      scorePercent,
      pointsEarned,
      pointsPossible,
      resultKind,
      kind: resultKind,
      isHypothetical,
      isManual,
      isObserved,
      raw: item,
    };
  }

  function createDefaultConfig(initial = {}) {
    return {
      schemaVersion: SCHEMA_VERSION,
      categories: Array.isArray(initial.categories) ? initial.categories : [],
      mappings: typeof initial.mappings === "object" && initial.mappings !== null ? initial.mappings : {},
      targets: Array.isArray(initial.targets) ? initial.targets : [],
    };
  }

  function buildMappingsMap(config, assessmentsList) {
    // Map: assessmentId -> Set of categoryIds
    const assessmentToCategories = new Map();

    // 1. From category.assessmentIds
    if (Array.isArray(config?.categories)) {
      for (const cat of config.categories) {
        if (!cat || typeof cat !== "object" || !cat.id) continue;
        const catId = String(cat.id);
        const ids = Array.isArray(cat.assessmentIds) ? cat.assessmentIds : [];
        for (const rawId of ids) {
          const aId = String(rawId).trim();
          if (!aId) continue;
          if (!assessmentToCategories.has(aId)) {
            assessmentToCategories.set(aId, new Set());
          }
          assessmentToCategories.get(aId).add(catId);
        }
      }
    }

    // 2. From config.mappings (object or array)
    if (config?.mappings && typeof config.mappings === "object") {
      if (Array.isArray(config.mappings)) {
        for (const entry of config.mappings) {
          if (!entry || typeof entry !== "object") continue;
          const aId = String(entry.assessmentId ?? entry.id ?? "").trim();
          const catId = String(entry.categoryId ?? entry.category ?? "").trim();
          if (aId && catId) {
            if (!assessmentToCategories.has(aId)) {
              assessmentToCategories.set(aId, new Set());
            }
            assessmentToCategories.get(aId).add(catId);
          }
        }
      } else {
        for (const [rawId, rawCat] of Object.entries(config.mappings)) {
          const aId = String(rawId).trim();
          const catId = String(rawCat).trim();
          if (aId && catId) {
            if (!assessmentToCategories.has(aId)) {
              assessmentToCategories.set(aId, new Set());
            }
            assessmentToCategories.get(aId).add(catId);
          }
        }
      }
    }

    // 3. From assessmentsList directly if categoryId is attached
    if (Array.isArray(assessmentsList)) {
      for (const item of assessmentsList) {
        if (!item || typeof item !== "object") continue;
        const parsed = parseAssessmentScores(item);
        const directCat = item.categoryId || item.category;
        if (directCat) {
          const catId = String(directCat).trim();
          if (!assessmentToCategories.has(parsed.id)) {
            assessmentToCategories.set(parsed.id, new Set());
          }
          assessmentToCategories.get(parsed.id).add(catId);
        }
      }
    }

    return assessmentToCategories;
  }

  function validate(config, assessmentsOrOptions) {
    const errors = [];
    const warnings = [];

    try {
      if (!config || typeof config !== "object" || Array.isArray(config)) {
        errors.push({
          field: "config",
          code: VALIDATION_CODES.INVALID_CONFIG,
          message: "Configuration must be a non-null object",
        });
        return { isValid: false, errors, warnings };
      }

      if (config.schemaVersion !== SCHEMA_VERSION) {
        errors.push({
          field: "schemaVersion",
          code: VALIDATION_CODES.INVALID_SCHEMA_VERSION,
          message: `Unsupported schema version: expected ${SCHEMA_VERSION}, received ${config.schemaVersion}`,
        });
      }

      if (!Array.isArray(config.categories) || config.categories.length === 0) {
        errors.push({
          field: "categories",
          code: VALIDATION_CODES.EMPTY_CATEGORIES,
          message: "Categories must be a non-empty array",
        });
        return { isValid: false, errors, warnings };
      }

      const categoryIds = new Set();
      let totalWeight = 0;

      for (let i = 0; i < config.categories.length; i++) {
        const cat = config.categories[i];
        const path = `categories[${i}]`;

        if (!cat || typeof cat !== "object" || Array.isArray(cat)) {
          errors.push({
            field: path,
            code: VALIDATION_CODES.INVALID_CATEGORY,
            message: `Category at index ${i} is not a valid object`,
          });
          continue;
        }

        const id = cat.id !== undefined && cat.id !== null ? String(cat.id).trim() : "";
        if (!id) {
          errors.push({
            field: `${path}.id`,
            code: VALIDATION_CODES.INVALID_CATEGORY,
            message: `Category at index ${i} must have a non-empty string ID`,
          });
        } else if (categoryIds.has(id)) {
          errors.push({
            field: `${path}.id`,
            code: VALIDATION_CODES.DUPLICATE_CATEGORY_ID,
            categoryId: id,
            message: `Duplicate category ID: "${id}"`,
          });
        } else {
          categoryIds.add(id);
        }

        const name = cat.name !== undefined && cat.name !== null ? String(cat.name).trim() : "";
        if (!name) {
          errors.push({
            field: `${path}.name`,
            code: VALIDATION_CODES.INVALID_CATEGORY,
            categoryId: id,
            message: `Category "${id || i}" must have a non-empty name`,
          });
        }

        // Weight validation
        if (typeof cat.weight !== "number" || !Number.isFinite(cat.weight)) {
          errors.push({
            field: `${path}.weight`,
            code: VALIDATION_CODES.INVALID_WEIGHT,
            categoryId: id,
            message: `Category "${name || id}" weight must be a finite number`,
          });
        } else if (cat.weight < 0) {
          errors.push({
            field: `${path}.weight`,
            code: VALIDATION_CODES.NEGATIVE_WEIGHT,
            categoryId: id,
            message: `Category "${name || id}" weight cannot be negative (${cat.weight})`,
          });
        } else {
          totalWeight += cat.weight;
        }

        // Explicit aggregation choice validation
        const normalizedMode = normalizeAggregationMode(cat.aggregation);
        if (!normalizedMode) {
          errors.push({
            field: `${path}.aggregation`,
            code: VALIDATION_CODES.MISSING_AGGREGATION,
            categoryId: id,
            message: `Category "${name || id}" must specify an explicit aggregation choice ('equal-assessment' or 'visible-points')`,
          });
        }

        // Exceptional rules validation
        if (cat.dropLowest !== undefined && cat.dropLowest !== null) {
          if (!Number.isInteger(cat.dropLowest) || cat.dropLowest < 0) {
            errors.push({
              field: `${path}.dropLowest`,
              code: VALIDATION_CODES.NEGATIVE_DROP_COUNT,
              categoryId: id,
              message: `Category "${name || id}" drop count must be a non-negative integer`,
            });
          }
        }

        if (cat.cap !== undefined && cat.cap !== null) {
          if (typeof cat.cap !== "number" || !Number.isFinite(cat.cap) || cat.cap < 0) {
            errors.push({
              field: `${path}.cap`,
              code: VALIDATION_CODES.NEGATIVE_CAP,
              categoryId: id,
              message: `Category "${name || id}" cap must be a non-negative number`,
            });
          }
        }

        if (cat.bonusLimit !== undefined && cat.bonusLimit !== null) {
          if (typeof cat.bonusLimit !== "number" || !Number.isFinite(cat.bonusLimit) || cat.bonusLimit < 0) {
            errors.push({
              field: `${path}.bonusLimit`,
              code: VALIDATION_CODES.NEGATIVE_BONUS_LIMIT,
              categoryId: id,
              message: `Category "${name || id}" bonus limit must be a non-negative number`,
            });
          }
        }

        if (cat.target !== undefined && cat.target !== null) {
          if (typeof cat.target !== "number" || !Number.isFinite(cat.target) || cat.target < 0) {
            errors.push({
              field: `${path}.target`,
              code: VALIDATION_CODES.NEGATIVE_TARGET,
              categoryId: id,
              message: `Category "${name || id}" target must be a non-negative number`,
            });
          }
        }
      }

      // Check total weight equals 100% with floating-point precision tolerance
      if (Math.abs(totalWeight - 100) > 1e-5) {
        errors.push({
          field: "categories",
          code: VALIDATION_CODES.INVALID_WEIGHT_SUM,
          currentSum: roundTo(totalWeight, 4),
          message: `Category weights must total exactly 100% (currently ${roundTo(totalWeight, 2)}%)`,
        });
      }

      // Extract included assessments list
      let assessmentsList = null;
      if (Array.isArray(assessmentsOrOptions)) {
        assessmentsList = assessmentsOrOptions;
      } else if (assessmentsOrOptions && typeof assessmentsOrOptions === "object") {
        if (Array.isArray(assessmentsOrOptions.assessments)) {
          assessmentsList = assessmentsOrOptions.assessments;
        } else if (Array.isArray(assessmentsOrOptions.includedAssessments)) {
          assessmentsList = assessmentsOrOptions.includedAssessments;
        }
      } else if (Array.isArray(config.assessments)) {
        assessmentsList = config.assessments;
      }

      const mappingsMap = buildMappingsMap(config, assessmentsList);

      // Check mapping validity: nonexistent categories & duplicate mappings
      for (const [assessmentId, assignedCategories] of mappingsMap.entries()) {
        for (const catId of assignedCategories) {
          if (!categoryIds.has(catId)) {
            errors.push({
              field: "mappings",
              code: VALIDATION_CODES.INVALID_CATEGORY_MAPPING,
              assessmentId,
              categoryId: catId,
              message: `Assessment "${assessmentId}" is mapped to nonexistent category "${catId}"`,
            });
          }
        }
        if (assignedCategories.size > 1) {
          errors.push({
            field: "mappings",
            code: VALIDATION_CODES.DUPLICATE_MAPPING,
            assessmentId,
            categories: Array.from(assignedCategories),
            message: `Assessment "${assessmentId}" is mapped to multiple categories: ${Array.from(assignedCategories).join(", ")}`,
          });
        }
      }

      // If assessments are provided, check that every included assessment is mapped
      if (Array.isArray(assessmentsList)) {
        const categoryItemCounts = new Map();
        for (const id of categoryIds) {
          categoryItemCounts.set(id, 0);
        }

        for (const rawItem of assessmentsList) {
          const parsed = parseAssessmentScores(rawItem);
          const mappedCats = mappingsMap.get(parsed.id);

          if (!mappedCats || mappedCats.size === 0) {
            errors.push({
              field: "mappings",
              code: VALIDATION_CODES.UNMAPPED_ASSESSMENT,
              assessmentId: parsed.id,
              message: `Included assessment "${parsed.title || parsed.id}" must be mapped to a category`,
            });
            continue;
          }

          const catId = Array.from(mappedCats)[0];
          if (categoryItemCounts.has(catId)) {
            categoryItemCounts.set(catId, categoryItemCounts.get(catId) + 1);
          }

          const categoryObj = config.categories.find((c) => String(c?.id) === catId);
          const mode = normalizeAggregationMode(categoryObj?.aggregation);

          // Visible points compatibility check
          if (mode === AGGREGATION_MODES.VISIBLE_POINTS) {
            if (parsed.pointsPossible === null || parsed.pointsPossible === undefined || !Number.isFinite(parsed.pointsPossible)) {
              errors.push({
                field: "aggregation",
                code: VALIDATION_CODES.INCOMPATIBLE_VISIBLE_POINTS,
                categoryId: catId,
                assessmentId: parsed.id,
                message: `Assessment "${parsed.title || parsed.id}" in category "${categoryObj?.name || catId}" lacks parseable possible points for visible-points aggregation`,
              });
            } else if (parsed.pointsPossible === 0) {
              errors.push({
                field: "aggregation",
                code: VALIDATION_CODES.ZERO_MAX_POINTS,
                categoryId: catId,
                assessmentId: parsed.id,
                message: `Assessment "${parsed.title || parsed.id}" has zero possible points`,
              });
            }
          }

          // Negative score or points validation
          if (parsed.scorePercent !== null && parsed.scorePercent < 0) {
            errors.push({
              field: "score",
              code: VALIDATION_CODES.NEGATIVE_SCORE,
              assessmentId: parsed.id,
              message: `Assessment "${parsed.title || parsed.id}" score cannot be negative (${parsed.scorePercent})`,
            });
          }
          if (parsed.pointsEarned !== null && parsed.pointsEarned < 0) {
            errors.push({
              field: "pointsEarned",
              code: VALIDATION_CODES.NEGATIVE_SCORE,
              assessmentId: parsed.id,
              message: `Assessment "${parsed.title || parsed.id}" points earned cannot be negative (${parsed.pointsEarned})`,
            });
          }

          // Bonus limit validation
          if (categoryObj && categoryObj.bonusLimit !== undefined && categoryObj.bonusLimit !== null) {
            const limit = Number(categoryObj.bonusLimit);
            const maxPercent = 100 + limit;
            if (parsed.scorePercent !== null && parsed.scorePercent > maxPercent) {
              errors.push({
                field: "score",
                code: VALIDATION_CODES.OVER_BONUS_LIMIT,
                assessmentId: parsed.id,
                categoryId: catId,
                score: parsed.scorePercent,
                bonusLimit: limit,
                message: `Assessment "${parsed.title || parsed.id}" score (${parsed.scorePercent}%) exceeds category bonus limit (${maxPercent}%)`,
              });
            }
          }
        }

        // Check if dropLowest >= number of mapped items in category
        for (const cat of config.categories) {
          if (!cat || !cat.id) continue;
          const dropCount = Number(cat.dropLowest);
          if (dropCount > 0) {
            const count = categoryItemCounts.get(String(cat.id)) || 0;
            if (count > 0 && dropCount >= count) {
              errors.push({
                field: "dropLowest",
                code: VALIDATION_CODES.EXCESSIVE_DROP_COUNT,
                categoryId: String(cat.id),
                dropLowest: dropCount,
                itemCount: count,
                message: `Category "${cat.name || cat.id}" drop count (${dropCount}) must be less than mapped assessment count (${count})`,
              });
            }
          }
        }
      }
    } catch (err) {
      errors.push({
        field: "general",
        code: VALIDATION_CODES.INVALID_CONFIG,
        message: `Validation encountered an unexpected error: ${err?.message || String(err)}`,
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  function calculateCategoryGrade(category, items, options = {}) {
    const categoryId = String(category?.id ?? "");
    const categoryName = String(category?.name ?? categoryId);
    const weight = Number(category?.weight ?? 0);
    const mode = normalizeAggregationMode(category?.aggregation) || AGGREGATION_MODES.EQUAL_ASSESSMENT;

    const parsedItems = (Array.isArray(items) ? items : []).map(parseAssessmentScores);

    // Sort items for potential drop rule
    // Equal assessment: lowest score percent first
    // Visible points: lowest ratio (pointsEarned / pointsPossible) first
    const sorted = [...parsedItems].sort((a, b) => {
      const scoreA = a.scorePercent ?? (a.pointsPossible > 0 ? (a.pointsEarned / a.pointsPossible) * 100 : 0);
      const scoreB = b.scorePercent ?? (b.pointsPossible > 0 ? (b.pointsEarned / b.pointsPossible) * 100 : 0);
      return scoreA - scoreB;
    });

    const dropCount = Number.isInteger(category?.dropLowest) && category.dropLowest > 0
      ? Math.min(category.dropLowest, Math.max(0, sorted.length - 1))
      : 0;

    const droppedSet = new Set();
    for (let i = 0; i < dropCount; i++) {
      droppedSet.add(sorted[i].id);
    }

    const processedItems = parsedItems.map((item) => ({
      ...item,
      isDropped: droppedSet.has(item.id),
    }));

    const droppedItems = processedItems.filter((it) => it.isDropped);
    const includedItems = processedItems.filter((it) => !it.isDropped);

    let rawScore = 0;
    let calculationDetails = {};

    if (mode === AGGREGATION_MODES.EQUAL_ASSESSMENT) {
      const numbersUsed = includedItems.map((it) => roundTo(it.scorePercent ?? 0, 4));
      const sumOfScores = numbersUsed.reduce((acc, s) => acc + s, 0);
      const itemCount = includedItems.length;
      rawScore = itemCount > 0 ? sumOfScores / itemCount : 0;

      calculationDetails = {
        aggregation: AGGREGATION_MODES.EQUAL_ASSESSMENT,
        itemCount,
        sumOfScores: roundTo(sumOfScores, 4),
        averageScore: roundTo(rawScore, 4),
        formula: itemCount > 0
          ? `${roundTo(sumOfScores, 2)} / ${itemCount} = ${roundTo(rawScore, 2)}%`
          : "0 / 0 = 0%",
        numbersUsed,
      };
    } else {
      // VISIBLE_POINTS mode
      const itemsUsed = includedItems.map((it) => ({
        id: it.id,
        title: it.title,
        earned: it.pointsEarned ?? 0,
        possible: it.pointsPossible ?? 0,
        percent: it.scorePercent,
      }));

      const totalPointsEarned = itemsUsed.reduce((acc, it) => acc + it.earned, 0);
      const totalPointsPossible = itemsUsed.reduce((acc, it) => acc + it.possible, 0);

      rawScore = totalPointsPossible > 0
        ? (totalPointsEarned / totalPointsPossible) * 100
        : 0;

      calculationDetails = {
        aggregation: AGGREGATION_MODES.VISIBLE_POINTS,
        totalPointsEarned: roundTo(totalPointsEarned, 4),
        totalPointsPossible: roundTo(totalPointsPossible, 4),
        percentage: roundTo(rawScore, 4),
        formula: totalPointsPossible > 0
          ? `${roundTo(totalPointsEarned, 2)} / ${roundTo(totalPointsPossible, 2)} * 100 = ${roundTo(rawScore, 2)}%`
          : "0 / 0 = 0%",
        itemsUsed,
      };
    }

    // Apply explicit rules: bonus limit and cap
    let finalScore = rawScore;
    let isCapped = false;
    let isBonusLimited = false;

    if (category?.bonusLimit !== undefined && category?.bonusLimit !== null) {
      const maxAllowed = 100 + Number(category.bonusLimit);
      if (finalScore > maxAllowed) {
        finalScore = maxAllowed;
        isBonusLimited = true;
      }
    }

    if (category?.cap !== undefined && category?.cap !== null) {
      const capValue = Number(category.cap);
      if (finalScore > capValue) {
        finalScore = capValue;
        isCapped = true;
      }
    }

    const weightedContribution = roundTo((finalScore * weight) / 100, 4);

    const rulesApplied = {
      dropLowest: category?.dropLowest || 0,
      droppedCount: droppedItems.length,
      cap: category?.cap !== undefined && category?.cap !== null ? Number(category.cap) : null,
      isCapped,
      bonusLimit: category?.bonusLimit !== undefined && category?.bonusLimit !== null ? Number(category.bonusLimit) : null,
      isBonusLimited,
    };

    const target = category?.target !== undefined && category?.target !== null ? Number(category.target) : null;
    const targetMet = target !== null ? finalScore >= target : null;

    return {
      categoryId,
      categoryName,
      weight,
      aggregation: mode,
      rawScore: roundTo(rawScore, 2),
      finalScore: roundTo(finalScore, 2),
      scorePercent: roundTo(finalScore, 2),
      weightedContribution,
      items: processedItems,
      includedItems,
      droppedItems,
      calculationDetails,
      rulesApplied,
      target,
      targetMet,
    };
  }

  function calculateCourseGrade(config, assessments, options = {}) {
    const validation = validate(config, assessments);
    if (!validation.isValid) {
      return {
        canCalculate: false,
        isValid: false,
        errors: validation.errors,
        courseGrade: null,
        totalCourseGrade: null,
        breakdown: null,
      };
    }

    const assessmentsList = Array.isArray(assessments)
      ? assessments
      : (assessments?.assessments || config.assessments || []);

    const mappingsMap = buildMappingsMap(config, assessmentsList);

    // Group items by category
    const itemsByCategory = new Map();
    for (const cat of config.categories) {
      itemsByCategory.set(String(cat.id), []);
    }

    for (const item of assessmentsList) {
      const parsed = parseAssessmentScores(item);
      const mappedCats = mappingsMap.get(parsed.id);
      if (mappedCats) {
        for (const catId of mappedCats) {
          if (itemsByCategory.has(catId)) {
            itemsByCategory.get(catId).push(item);
          }
        }
      }
    }

    const categoryBreakdowns = config.categories.map((cat) => {
      const catItems = itemsByCategory.get(String(cat.id)) || [];
      return calculateCategoryGrade(cat, catItems, options);
    });

    const totalCourseGrade = roundTo(
      categoryBreakdowns.reduce((acc, cat) => acc + cat.weightedContribution, 0),
      2
    );

    // Evaluate targets if present
    const evaluatedTargets = [];
    const configTargets = Array.isArray(config.targets) ? config.targets : [];
    for (const target of configTargets) {
      if (!target || typeof target !== "object") continue;
      const targetPercent = Number(target.targetPercent ?? target.target);
      if (!Number.isFinite(targetPercent)) continue;
      const reached = totalCourseGrade >= targetPercent;
      const shortfall = reached ? 0 : roundTo(targetPercent - totalCourseGrade, 2);
      evaluatedTargets.push({
        id: target.id || target.label,
        label: target.label || String(targetPercent),
        targetPercent,
        reached,
        shortfall,
      });
    }

    return {
      canCalculate: true,
      isValid: true,
      courseGrade: totalCourseGrade,
      totalCourseGrade,
      categories: categoryBreakdowns,
      breakdown: {
        categories: categoryBreakdowns,
        totalWeight: 100,
        totalCourseGrade,
      },
      targets: evaluatedTargets,
    };
  }

  function applyScenario(arg1, arg2, arg3, arg4) {
    let config = null;
    let baseAssessments = null;
    let scenarioOverrides = null;
    let options = {};

    if (arg1 && typeof arg1 === "object" && (Array.isArray(arg1.categories) || arg1.schemaVersion !== undefined)) {
      config = deepClone(arg1);
      baseAssessments = Array.isArray(arg2) ? arg2 : (arg1.assessments || []);
      scenarioOverrides = arg3;
      options = (arg4 && typeof arg4 === "object") ? arg4 : {};
    } else {
      baseAssessments = Array.isArray(arg1) ? arg1 : [];
      scenarioOverrides = arg2;
      options = (arg3 && typeof arg3 === "object") ? arg3 : {};
    }

    const scenarioId = options.id || scenarioOverrides?.id || "scenario-" + Math.random().toString(36).slice(2, 9);
    const scenarioName = options.name || scenarioOverrides?.name || "Scenario";

    // Deep-clone base assessments so mutating the returned scenario cannot reach base data
    const clonedBase = deepClone(baseAssessments);

    const baseMap = new Map();
    const scenarioAssessments = clonedBase.map((raw) => {
      const parsed = parseAssessmentScores(raw);
      const kind = parsed.resultKind || RESULT_KINDS.OBSERVED;
      const item = {
        ...parsed,
        resultKind: kind,
        kind,
        isObserved: kind === RESULT_KINDS.OBSERVED,
        isManual: kind === RESULT_KINDS.MANUAL,
        isHypothetical: kind === RESULT_KINDS.HYPOTHETICAL,
        isOverridden: false,
      };
      baseMap.set(item.id, item);
      return item;
    });

    let rawOverrides = scenarioOverrides;
    if (rawOverrides && typeof rawOverrides === "object" && !Array.isArray(rawOverrides) && rawOverrides.overrides) {
      rawOverrides = rawOverrides.overrides;
    }

    const overrideList = [];
    if (Array.isArray(rawOverrides)) {
      for (const entry of rawOverrides) {
        if (entry && typeof entry === "object") {
          overrideList.push(deepClone(entry));
        }
      }
    } else if (rawOverrides && typeof rawOverrides === "object") {
      for (const [key, val] of Object.entries(rawOverrides)) {
        if (val !== null && typeof val === "object") {
          overrideList.push({ id: key, ...deepClone(val) });
        } else if (typeof val === "number") {
          overrideList.push({ id: key, score: val, scorePercent: val });
        }
      }
    }

    for (const override of overrideList) {
      const overrideId = String(override.id ?? override.assessmentId ?? "").trim();
      if (!overrideId) continue;

      let overrideKind = RESULT_KINDS.HYPOTHETICAL;
      if (override.resultKind || override.kind) {
        overrideKind = normalizeResultKind(override.resultKind || override.kind);
      } else if (override.isManual || override.source === "manual") {
        overrideKind = RESULT_KINDS.MANUAL;
      } else if (override.isObserved || override.source === "observed") {
        overrideKind = RESULT_KINDS.OBSERVED;
      }

      if (baseMap.has(overrideId)) {
        const existing = baseMap.get(overrideId);
        const originalCopy = deepClone(existing);

        if (override.scorePercent !== undefined) {
          existing.scorePercent = override.scorePercent;
        } else if (override.score !== undefined) {
          if (typeof override.score === "number") {
            existing.scorePercent = override.score;
          } else {
            const m = String(override.score).match(/([+-]?\d+(?:\.\d+)?)\s*%?/);
            if (m) existing.scorePercent = Number(m[1]);
          }
        }
        if (override.pointsEarned !== undefined) existing.pointsEarned = override.pointsEarned;
        if (override.pointsPossible !== undefined) existing.pointsPossible = override.pointsPossible;
        if (override.title !== undefined) existing.title = override.title;

        existing.resultKind = overrideKind;
        existing.kind = overrideKind;
        existing.isHypothetical = (overrideKind === RESULT_KINDS.HYPOTHETICAL);
        existing.isManual = (overrideKind === RESULT_KINDS.MANUAL);
        existing.isObserved = (overrideKind === RESULT_KINDS.OBSERVED);
        existing.isOverridden = true;
        existing.baseResult = originalCopy;
      } else {
        const parsed = parseAssessmentScores(override);
        const newItem = {
          ...parsed,
          resultKind: overrideKind,
          kind: overrideKind,
          isHypothetical: (overrideKind === RESULT_KINDS.HYPOTHETICAL),
          isManual: (overrideKind === RESULT_KINDS.MANUAL),
          isObserved: (overrideKind === RESULT_KINDS.OBSERVED),
          isOverridden: true,
        };
        scenarioAssessments.push(newItem);
        baseMap.set(newItem.id, newItem);
      }
    }

    const scenarioResult = {
      id: scenarioId,
      name: scenarioName,
      assessments: scenarioAssessments,
      overrides: deepClone(overrideList),
      baseAssessments: deepClone(baseAssessments),
      getAssessment(id) {
        return this.assessments.find((a) => String(a.id) === String(id)) || null;
      },
      [Symbol.iterator]() {
        return this.assessments[Symbol.iterator]();
      },
      get length() {
        return this.assessments.length;
      },
    };

    for (let i = 0; i < scenarioAssessments.length; i++) {
      Object.defineProperty(scenarioResult, i, {
        get() { return this.assessments[i]; },
        set(v) { this.assessments[i] = v; },
        enumerable: false,
        configurable: true,
      });
    }

    if (config) {
      scenarioResult.config = config;
      scenarioResult.calculateGrade = (opts) => calculateCourseGrade(config, scenarioResult.assessments, opts);
    }

    return scenarioResult;
  }

  function createScenario(nameOrOptions, maybeOverrides, maybeOptions) {
    let name = "Scenario";
    let overrides = [];
    let options = {};

    if (typeof nameOrOptions === "string") {
      name = nameOrOptions;
      overrides = maybeOverrides || [];
      options = maybeOptions || {};
    } else if (nameOrOptions && typeof nameOrOptions === "object") {
      name = nameOrOptions.name || "Scenario";
      overrides = nameOrOptions.overrides || [];
      options = nameOrOptions;
    }

    return {
      id: options.id || "scenario-" + Math.random().toString(36).slice(2, 9),
      name,
      overrides: deepClone(overrides),
      options: deepClone(options),
    };
  }

  function solveCategoryTarget(category, items, targetPercent, options = {}) {
    const parsedItems = (Array.isArray(items) ? items : []).map(parseAssessmentScores);
    const mode = normalizeAggregationMode(category?.aggregation) || AGGREGATION_MODES.EQUAL_ASSESSMENT;

    const remainingIds = new Set();
    if (Array.isArray(options.remainingAssessmentIds)) {
      for (const id of options.remainingAssessmentIds) remainingIds.add(String(id).trim());
    } else if (Array.isArray(options.selectedAssessmentIds)) {
      for (const id of options.selectedAssessmentIds) remainingIds.add(String(id).trim());
    } else {
      for (const it of parsedItems) {
        if (it.raw?.isRemaining === true || (it.scorePercent === null && it.pointsEarned === null)) {
          remainingIds.add(it.id);
        }
      }
    }

    const remainingItems = parsedItems.filter((it) => remainingIds.has(it.id));

    if (remainingItems.length === 0) {
      const currentScore = calculateCategoryGrade(category, parsedItems).finalScore;
      if (currentScore >= targetPercent) {
        return {
          outcome: TARGET_OUTCOMES.ALREADY_SECURED,
          status: TARGET_OUTCOMES.ALREADY_SECURED,
          isAlreadySecured: true,
          isFeasible: false,
          isImpossible: false,
          isUnderdetermined: false,
          targetPercent,
          currentGrade: currentScore,
          requiredScorePercent: 0,
          requiredScore: 0,
          maxReachable: currentScore,
          shortfall: 0,
          remainingCount: 0,
          reason: `Category target of ${targetPercent}% is already secured (current score is ${currentScore}%)`,
        };
      } else {
        return {
          outcome: TARGET_OUTCOMES.UNDERDETERMINED,
          status: TARGET_OUTCOMES.UNDERDETERMINED,
          isAlreadySecured: false,
          isFeasible: false,
          isImpossible: false,
          isUnderdetermined: true,
          targetPercent,
          currentGrade: currentScore,
          requiredScorePercent: null,
          requiredScore: null,
          maxReachable: currentScore,
          shortfall: roundTo(targetPercent - currentScore, 2),
          blocker: "NO_REMAINING_ASSESSMENTS",
          reason: "No remaining assessments in category to reach target",
        };
      }
    }

    if (mode === AGGREGATION_MODES.VISIBLE_POINTS) {
      for (const rem of remainingItems) {
        if (rem.pointsPossible === null || rem.pointsPossible === undefined || rem.pointsPossible <= 0 || !Number.isFinite(rem.pointsPossible)) {
          return {
            outcome: TARGET_OUTCOMES.UNDERDETERMINED,
            status: TARGET_OUTCOMES.UNDERDETERMINED,
            isAlreadySecured: false,
            isFeasible: false,
            isImpossible: false,
            isUnderdetermined: true,
            targetPercent,
            requiredScorePercent: null,
            requiredScore: null,
            maxReachable: null,
            shortfall: null,
            blocker: "MISSING_MAXIMA",
            assessmentId: rem.id,
            reason: `Assessment "${rem.title || rem.id}" lacks possible points (maxima) for visible-points target solving`,
          };
        }
      }
    }

    if (Number.isInteger(category?.dropLowest) && category.dropLowest > 0 && !options.allowNonlinear) {
      return {
        outcome: TARGET_OUTCOMES.UNDERDETERMINED,
        status: TARGET_OUTCOMES.UNDERDETERMINED,
        isAlreadySecured: false,
        isFeasible: false,
        isImpossible: false,
        isUnderdetermined: true,
        targetPercent,
        requiredScorePercent: null,
        requiredScore: null,
        maxReachable: null,
        shortfall: null,
        blocker: "NONLINEAR_DROP_RULE",
        reason: `Category "${category.name || category.id}" has an active drop rule which makes target solving non-linear`,
      };
    }

    const minItems = parsedItems.map((it) => {
      if (remainingIds.has(it.id)) {
        return { ...it, scorePercent: 0, pointsEarned: 0 };
      }
      return it;
    });

    let limit = 100;
    if (category?.bonusLimit !== undefined && category.bonusLimit !== null) {
      limit = 100 + Number(category.bonusLimit);
    }

    const maxItems = parsedItems.map((it) => {
      if (remainingIds.has(it.id)) {
        const earned = it.pointsPossible ? (limit / 100) * it.pointsPossible : null;
        return { ...it, scorePercent: limit, pointsEarned: earned };
      }
      return it;
    });

    const minScore = calculateCategoryGrade(category, minItems).finalScore;
    const maxScore = calculateCategoryGrade(category, maxItems).finalScore;

    if (minScore >= targetPercent) {
      return {
        outcome: TARGET_OUTCOMES.ALREADY_SECURED,
        status: TARGET_OUTCOMES.ALREADY_SECURED,
        isAlreadySecured: true,
        isFeasible: false,
        isImpossible: false,
        isUnderdetermined: false,
        targetPercent,
        currentGrade: minScore,
        minReachable: minScore,
        maxReachable: maxScore,
        requiredScorePercent: 0,
        requiredScore: 0,
        shortfall: 0,
        remainingCount: remainingItems.length,
        reason: `Category target of ${targetPercent}% is already secured (minimum score is ${minScore}%)`,
      };
    }

    if (maxScore < targetPercent) {
      const shortfall = roundTo(targetPercent - maxScore, 2);
      return {
        outcome: TARGET_OUTCOMES.IMPOSSIBLE,
        status: TARGET_OUTCOMES.IMPOSSIBLE,
        isAlreadySecured: false,
        isFeasible: false,
        isImpossible: true,
        isUnderdetermined: false,
        targetPercent,
        currentGrade: minScore,
        minReachable: minScore,
        maxReachable: maxScore,
        shortfall,
        requiredScorePercent: null,
        requiredScore: null,
        remainingCount: remainingItems.length,
        reason: `Category target of ${targetPercent}% is impossible (maximum reachable is ${maxScore}%, shortfall is ${shortfall}%)`,
      };
    }

    const span = maxScore - minScore;
    if (span <= 0) {
      return {
        outcome: TARGET_OUTCOMES.UNDERDETERMINED,
        status: TARGET_OUTCOMES.UNDERDETERMINED,
        isAlreadySecured: false,
        isFeasible: false,
        isImpossible: false,
        isUnderdetermined: true,
        targetPercent,
        currentGrade: minScore,
        maxReachable: maxScore,
        shortfall: roundTo(targetPercent - maxScore, 2),
        blocker: "ZERO_GRADE_SPAN",
        reason: "Remaining items do not contribute to category score",
      };
    }

    const fraction = (targetPercent - minScore) / span;
    const requiredScorePercent = roundTo(fraction * limit, 2);

    let requiredPoints = null;
    if (remainingItems.length === 1 && remainingItems[0].pointsPossible > 0) {
      requiredPoints = roundTo((requiredScorePercent / 100) * remainingItems[0].pointsPossible, 2);
    }

    return {
      outcome: TARGET_OUTCOMES.FEASIBLE,
      status: TARGET_OUTCOMES.FEASIBLE,
      isAlreadySecured: false,
      isFeasible: true,
      isImpossible: false,
      isUnderdetermined: false,
      targetPercent,
      currentGrade: minScore,
      minReachable: minScore,
      maxReachable: maxScore,
      requiredScorePercent,
      requiredScore: requiredScorePercent,
      requiredPoints,
      shortfall: 0,
      remainingAssessments: remainingItems.map((it) => it.id),
      remainingCount: remainingItems.length,
      reason: `Category target of ${targetPercent}% is feasible with an average score of ${requiredScorePercent}% on remaining work`,
    };
  }

  function solveTarget(configOrCategory, assessments, targetInput, options = {}) {
    let targetPercent = null;
    let targetCategoryId = null;

    if (typeof targetInput === "number" && Number.isFinite(targetInput)) {
      targetPercent = targetInput;
    } else if (targetInput && typeof targetInput === "object") {
      const raw = targetInput.targetPercent ?? targetInput.target ?? targetInput.desiredGrade;
      if (typeof raw === "number" && Number.isFinite(raw)) {
        targetPercent = raw;
      } else if (raw !== undefined && raw !== null && !isNaN(Number(raw))) {
        targetPercent = Number(raw);
      }
      if (targetInput.categoryId) {
        targetCategoryId = String(targetInput.categoryId);
      }
    }

    if (options.targetPercent !== undefined && Number.isFinite(Number(options.targetPercent))) {
      targetPercent = Number(options.targetPercent);
    }
    if (options.categoryId) {
      targetCategoryId = String(options.categoryId);
    }

    if (targetPercent === null || !Number.isFinite(targetPercent) || targetPercent < 0) {
      return {
        outcome: TARGET_OUTCOMES.UNDERDETERMINED,
        status: TARGET_OUTCOMES.UNDERDETERMINED,
        isAlreadySecured: false,
        isFeasible: false,
        isImpossible: false,
        isUnderdetermined: true,
        targetPercent,
        requiredScorePercent: null,
        requiredScore: null,
        maxReachable: null,
        shortfall: null,
        blocker: "INVALID_TARGET",
        reason: "Target grade must be a non-negative finite number",
      };
    }

    const isSingleCategory = configOrCategory && !Array.isArray(configOrCategory.categories) && configOrCategory.id && configOrCategory.aggregation;

    if (isSingleCategory) {
      return solveCategoryTarget(configOrCategory, assessments, targetPercent, options);
    }

    const config = configOrCategory;
    const validation = validate(config, assessments);
    if (!validation.isValid) {
      const missingMaximaErr = validation.errors.find(
        (e) => e.code === VALIDATION_CODES.INCOMPATIBLE_VISIBLE_POINTS || e.code === VALIDATION_CODES.ZERO_MAX_POINTS
      );
      if (missingMaximaErr) {
        return {
          outcome: TARGET_OUTCOMES.UNDERDETERMINED,
          status: TARGET_OUTCOMES.UNDERDETERMINED,
          isAlreadySecured: false,
          isFeasible: false,
          isImpossible: false,
          isUnderdetermined: true,
          targetPercent,
          requiredScorePercent: null,
          requiredScore: null,
          maxReachable: null,
          shortfall: null,
          blocker: "MISSING_MAXIMA",
          assessmentId: missingMaximaErr.assessmentId,
          reason: missingMaximaErr.message || `Assessment "${missingMaximaErr.assessmentId}" lacks possible points (maxima)`,
          errors: validation.errors,
        };
      }
      return {
        outcome: TARGET_OUTCOMES.UNDERDETERMINED,
        status: TARGET_OUTCOMES.UNDERDETERMINED,
        isAlreadySecured: false,
        isFeasible: false,
        isImpossible: false,
        isUnderdetermined: true,
        targetPercent,
        requiredScorePercent: null,
        requiredScore: null,
        maxReachable: null,
        shortfall: null,
        blocker: "INVALID_CONFIG",
        reason: "Grading configuration is incomplete or invalid",
        errors: validation.errors,
      };
    }

    if (targetCategoryId) {
      const cat = config.categories.find((c) => String(c.id) === targetCategoryId);
      if (!cat) {
        return {
          outcome: TARGET_OUTCOMES.UNDERDETERMINED,
          status: TARGET_OUTCOMES.UNDERDETERMINED,
          isAlreadySecured: false,
          isFeasible: false,
          isImpossible: false,
          isUnderdetermined: true,
          targetPercent,
          requiredScorePercent: null,
          requiredScore: null,
          maxReachable: null,
          shortfall: null,
          blocker: "CATEGORY_NOT_FOUND",
          reason: `Category "${targetCategoryId}" not found in configuration`,
        };
      }
      const mappingsMap = buildMappingsMap(config, assessments);
      const catItems = (Array.isArray(assessments) ? assessments : []).filter((item) => {
        const parsed = parseAssessmentScores(item);
        const mapped = mappingsMap.get(parsed.id);
        return mapped && mapped.has(String(cat.id));
      });
      return solveCategoryTarget(cat, catItems, targetPercent, options);
    }

    const assessmentsList = Array.isArray(assessments) ? assessments : (assessments?.assessments || config.assessments || []);
    const mappingsMap = buildMappingsMap(config, assessmentsList);

    const remainingIds = new Set();
    if (Array.isArray(options.remainingAssessmentIds)) {
      for (const id of options.remainingAssessmentIds) remainingIds.add(String(id).trim());
    } else if (Array.isArray(options.selectedAssessmentIds)) {
      for (const id of options.selectedAssessmentIds) remainingIds.add(String(id).trim());
    } else {
      for (const item of assessmentsList) {
        const parsed = parseAssessmentScores(item);
        if (item.isRemaining === true || (parsed.scorePercent === null && parsed.pointsEarned === null)) {
          remainingIds.add(parsed.id);
        }
      }
    }

    const remainingItems = assessmentsList.filter((item) => {
      const parsed = parseAssessmentScores(item);
      return remainingIds.has(parsed.id);
    });

    if (remainingItems.length === 0) {
      const currentGrade = calculateCourseGrade(config, assessmentsList).courseGrade;
      if (currentGrade >= targetPercent) {
        return {
          outcome: TARGET_OUTCOMES.ALREADY_SECURED,
          status: TARGET_OUTCOMES.ALREADY_SECURED,
          isAlreadySecured: true,
          isFeasible: false,
          isImpossible: false,
          isUnderdetermined: false,
          targetPercent,
          currentGrade,
          requiredScorePercent: 0,
          requiredScore: 0,
          maxReachable: currentGrade,
          shortfall: 0,
          remainingCount: 0,
          reason: `Target of ${targetPercent}% is already secured (current course grade is ${currentGrade}%)`,
        };
      } else {
        return {
          outcome: TARGET_OUTCOMES.UNDERDETERMINED,
          status: TARGET_OUTCOMES.UNDERDETERMINED,
          isAlreadySecured: false,
          isFeasible: false,
          isImpossible: false,
          isUnderdetermined: true,
          targetPercent,
          currentGrade,
          requiredScorePercent: null,
          requiredScore: null,
          maxReachable: currentGrade,
          shortfall: roundTo(targetPercent - currentGrade, 2),
          blocker: "NO_REMAINING_ASSESSMENTS",
          reason: "No remaining assessments exist to reach target grade",
        };
      }
    }

    for (const remItem of remainingItems) {
      const parsed = parseAssessmentScores(remItem);
      const catIdSet = mappingsMap.get(parsed.id);
      if (!catIdSet) continue;
      for (const catId of catIdSet) {
        const cat = config.categories.find((c) => String(c.id) === catId);
        if (cat && normalizeAggregationMode(cat.aggregation) === AGGREGATION_MODES.VISIBLE_POINTS) {
          if (parsed.pointsPossible === null || parsed.pointsPossible === undefined || parsed.pointsPossible <= 0 || !Number.isFinite(parsed.pointsPossible)) {
            return {
              outcome: TARGET_OUTCOMES.UNDERDETERMINED,
              status: TARGET_OUTCOMES.UNDERDETERMINED,
              isAlreadySecured: false,
              isFeasible: false,
              isImpossible: false,
              isUnderdetermined: true,
              targetPercent,
              requiredScorePercent: null,
              requiredScore: null,
              maxReachable: null,
              shortfall: null,
              blocker: "MISSING_MAXIMA",
              assessmentId: parsed.id,
              reason: `Assessment "${parsed.title || parsed.id}" in visible-points category "${cat.name || cat.id}" lacks possible points (maxima)`,
            };
          }
        }
      }
    }

    for (const remItem of remainingItems) {
      const parsed = parseAssessmentScores(remItem);
      const catIdSet = mappingsMap.get(parsed.id);
      if (!catIdSet) continue;
      for (const catId of catIdSet) {
        const cat = config.categories.find((c) => String(c.id) === catId);
        if (cat && Number.isInteger(cat.dropLowest) && cat.dropLowest > 0 && !options.allowNonlinear) {
          return {
            outcome: TARGET_OUTCOMES.UNDERDETERMINED,
            status: TARGET_OUTCOMES.UNDERDETERMINED,
            isAlreadySecured: false,
            isFeasible: false,
            isImpossible: false,
            isUnderdetermined: true,
            targetPercent,
            requiredScorePercent: null,
            requiredScore: null,
            maxReachable: null,
            shortfall: null,
            blocker: "NONLINEAR_DROP_RULE",
            categoryId: cat.id,
            reason: `Category "${cat.name || cat.id}" has an active drop rule (dropLowest: ${cat.dropLowest}) which makes target solving non-linear; disabled per linear model specification`,
          };
        }
      }
    }

    const minAssessments = assessmentsList.map((item) => {
      const parsed = parseAssessmentScores(item);
      if (remainingIds.has(parsed.id)) {
        return {
          ...deepClone(item),
          scorePercent: 0,
          score: 0,
          pointsEarned: 0,
          isHypothetical: true,
        };
      }
      return deepClone(item);
    });

    const maxAssessments = assessmentsList.map((item) => {
      const parsed = parseAssessmentScores(item);
      if (remainingIds.has(parsed.id)) {
        const catIdSet = mappingsMap.get(parsed.id);
        let limit = 100;
        if (catIdSet) {
          for (const catId of catIdSet) {
            const cat = config.categories.find((c) => String(c.id) === catId);
            if (cat?.bonusLimit !== undefined && cat.bonusLimit !== null) {
              limit = 100 + Number(cat.bonusLimit);
            }
          }
        }
        const earned = parsed.pointsPossible ? (limit / 100) * parsed.pointsPossible : null;
        return {
          ...deepClone(item),
          scorePercent: limit,
          score: limit,
          pointsEarned: earned,
          isHypothetical: true,
        };
      }
      return deepClone(item);
    });

    const minResult = calculateCourseGrade(config, minAssessments);
    const maxResult = calculateCourseGrade(config, maxAssessments);

    const minGrade = minResult.courseGrade;
    const maxGrade = maxResult.courseGrade;

    if (minGrade >= targetPercent) {
      return {
        outcome: TARGET_OUTCOMES.ALREADY_SECURED,
        status: TARGET_OUTCOMES.ALREADY_SECURED,
        isAlreadySecured: true,
        isFeasible: false,
        isImpossible: false,
        isUnderdetermined: false,
        targetPercent,
        currentGrade: minGrade,
        minReachable: minGrade,
        maxReachable: maxGrade,
        requiredScorePercent: 0,
        requiredScore: 0,
        shortfall: 0,
        remainingCount: remainingItems.length,
        reason: `Target of ${targetPercent}% is already secured (minimum reachable grade is ${minGrade}%)`,
      };
    }

    if (maxGrade < targetPercent) {
      const shortfall = roundTo(targetPercent - maxGrade, 2);
      return {
        outcome: TARGET_OUTCOMES.IMPOSSIBLE,
        status: TARGET_OUTCOMES.IMPOSSIBLE,
        isAlreadySecured: false,
        isFeasible: false,
        isImpossible: true,
        isUnderdetermined: false,
        targetPercent,
        currentGrade: minGrade,
        minReachable: minGrade,
        maxReachable: maxGrade,
        shortfall,
        requiredScorePercent: null,
        requiredScore: null,
        remainingCount: remainingItems.length,
        reason: `Target of ${targetPercent}% is impossible to reach (maximum reachable is ${maxGrade}%, shortfall is ${shortfall}%)`,
      };
    }

    const gradeSpan = maxGrade - minGrade;
    if (gradeSpan <= 0) {
      return {
        outcome: TARGET_OUTCOMES.UNDERDETERMINED,
        status: TARGET_OUTCOMES.UNDERDETERMINED,
        isAlreadySecured: false,
        isFeasible: false,
        isImpossible: false,
        isUnderdetermined: true,
        targetPercent,
        currentGrade: minGrade,
        maxReachable: maxGrade,
        shortfall: roundTo(targetPercent - maxGrade, 2),
        blocker: "ZERO_GRADE_SPAN",
        reason: "Remaining assessments do not contribute to course grade",
      };
    }

    const fraction = (targetPercent - minGrade) / gradeSpan;
    const requiredScorePercent = roundTo(fraction * 100, 2);

    let requiredPoints = null;
    if (remainingItems.length === 1) {
      const single = parseAssessmentScores(remainingItems[0]);
      if (single.pointsPossible && single.pointsPossible > 0) {
        requiredPoints = roundTo((requiredScorePercent / 100) * single.pointsPossible, 2);
      }
    }

    return {
      outcome: TARGET_OUTCOMES.FEASIBLE,
      status: TARGET_OUTCOMES.FEASIBLE,
      isAlreadySecured: false,
      isFeasible: true,
      isImpossible: false,
      isUnderdetermined: false,
      targetPercent,
      currentGrade: minGrade,
      minReachable: minGrade,
      maxReachable: maxGrade,
      requiredScorePercent,
      requiredScore: requiredScorePercent,
      requiredPoints,
      shortfall: 0,
      remainingAssessments: remainingItems.map((it) => parseAssessmentScores(it).id),
      remainingCount: remainingItems.length,
      reason: `Target of ${targetPercent}% is feasible with an average score of ${requiredScorePercent}% across remaining assessments`,
    };
  }

  global.PrairieLearnGradeModel = {
    SCHEMA_VERSION,
    AGGREGATION_MODES,
    VALIDATION_CODES,
    RESULT_KINDS,
    TARGET_OUTCOMES,
    roundTo,
    normalizeAggregationMode,
    normalizeResultKind,
    parseAssessmentScores,
    createDefaultConfig,
    validate,
    calculateCategoryGrade,
    calculateCourseGrade,
    deepClone,
    applyScenario,
    createScenario,
    solveTarget,
    calculateTargetRequirement: solveTarget,
    solveTargetGrade: solveTarget,
  };
})(globalThis);
