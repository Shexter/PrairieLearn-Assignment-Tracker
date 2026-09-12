const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function loadGradeModel() {
  const source = fs.readFileSync("shared/grade-model.js", "utf8");
  const context = {
    console,
    Math,
    Number,
    Array,
    Object,
    String,
    Boolean,
    Date,
    JSON,
  };
  context.globalThis = context;
  vm.runInNewContext(source, context);
  return context.PrairieLearnGradeModel;
}

// ---------------------------------------------------------------------------
// 1. Module and Schema version tests (Task 1.2)
// ---------------------------------------------------------------------------

test("grade-model exports expected interface and schema version", () => {
  const model = loadGradeModel();
  assert.equal(typeof model, "object");
  assert.equal(typeof model.SCHEMA_VERSION, "number");
  assert.ok(model.SCHEMA_VERSION >= 1);
  assert.equal(typeof model.AGGREGATION_MODES, "object");
  assert.equal(model.AGGREGATION_MODES.EQUAL_ASSESSMENT, "equal-assessment");
  assert.equal(model.AGGREGATION_MODES.VISIBLE_POINTS, "visible-points");
  assert.equal(typeof model.validate, "function");
  assert.equal(typeof model.calculateCategoryGrade, "function");
  assert.equal(typeof model.calculateCourseGrade, "function");
  assert.equal(typeof model.roundTo, "function");
});

test("validate() never throws on bad, null, or malformed input", () => {
  const model = loadGradeModel();
  const badInputs = [
    null,
    undefined,
    "",
    "invalid string",
    123,
    true,
    [],
    {},
    { schemaVersion: "bad" },
    { schemaVersion: 1, categories: null },
    { schemaVersion: 1, categories: "not-an-array" },
    { schemaVersion: 1, categories: [null, undefined, 42] },
  ];

  for (const input of badInputs) {
    let result;
    assert.doesNotThrow(() => {
      result = model.validate(input);
    }, `validate() should never throw on input: ${JSON.stringify(input)}`);
    assert.equal(typeof result, "object");
    assert.equal(result.isValid, false);
    assert.ok(Array.isArray(result.errors));
    assert.ok(result.errors.length > 0);
  }
});

test("validate() reports schema version mismatch", () => {
  const model = loadGradeModel();
  const result = model.validate({ schemaVersion: 999, categories: [] });
  assert.equal(result.isValid, false);
  const err = result.errors.find((e) => e.code === "INVALID_SCHEMA_VERSION");
  assert.ok(err, "Should contain INVALID_SCHEMA_VERSION error");
});

test("validate() rejects empty or missing categories", () => {
  const model = loadGradeModel();
  const result = model.validate({ schemaVersion: model.SCHEMA_VERSION, categories: [] });
  assert.equal(result.isValid, false);
  const err = result.errors.find((e) => e.code === "EMPTY_CATEGORIES");
  assert.ok(err, "Should contain EMPTY_CATEGORIES error");
});

test("validate() rejects categories with duplicate or invalid IDs", () => {
  const model = loadGradeModel();
  const config = {
    schemaVersion: model.SCHEMA_VERSION,
    categories: [
      { id: "hw", name: "Homework", weight: 50, aggregation: "equal-assessment" },
      { id: "hw", name: "Duplicate HW", weight: 50, aggregation: "equal-assessment" },
    ],
  };
  const result = model.validate(config);
  assert.equal(result.isValid, false);
  const err = result.errors.find((e) => e.code === "DUPLICATE_CATEGORY_ID");
  assert.ok(err, "Should detect duplicate category ID");
});

// ---------------------------------------------------------------------------
// 2. Validation: Mappings, Aggregation Choice, 100% Weight Sum (Task 2.1)
// ---------------------------------------------------------------------------

test("validate() requires every included assessment to be mapped", () => {
  const model = loadGradeModel();
  const config = {
    schemaVersion: model.SCHEMA_VERSION,
    categories: [
      { id: "hw", name: "Homework", weight: 60, aggregation: "equal-assessment", assessmentIds: ["hw1"] },
      { id: "exam", name: "Exams", weight: 40, aggregation: "equal-assessment", assessmentIds: ["midterm"] },
    ],
  };
  const assessments = [
    { id: "hw1", title: "HW 1", score: 100 },
    { id: "midterm", title: "Midterm", score: 90 },
    { id: "final", title: "Final Exam", score: 85 }, // unmapped!
  ];

  const result = model.validate(config, assessments);
  assert.equal(result.isValid, false);
  const unmapped = result.errors.filter((e) => e.code === "UNMAPPED_ASSESSMENT");
  assert.equal(unmapped.length, 1);
  assert.equal(unmapped[0].assessmentId, "final");

  // Map the final exam and verify it now passes
  const fixedConfig = {
    ...config,
    categories: [
      config.categories[0],
      { ...config.categories[1], assessmentIds: ["midterm", "final"] },
    ],
  };
  const fixedResult = model.validate(fixedConfig, assessments);
  assert.equal(fixedResult.isValid, true);
  assert.equal(fixedResult.errors.length, 0);
});

test("validate() rejects assessments mapped to nonexistent or multiple categories", () => {
  const model = loadGradeModel();
  const config = {
    schemaVersion: model.SCHEMA_VERSION,
    categories: [
      { id: "hw", name: "Homework", weight: 50, aggregation: "equal-assessment", assessmentIds: ["item1"] },
      { id: "lab", name: "Labs", weight: 50, aggregation: "equal-assessment", assessmentIds: ["item1"] },
    ],
    mappings: {
      orphan: "nonexistent-category",
    },
  };
  const assessments = [{ id: "item1" }, { id: "orphan" }];
  const result = model.validate(config, assessments);
  assert.equal(result.isValid, false);
  assert.ok(result.errors.some((e) => e.code === "DUPLICATE_MAPPING"));
  assert.ok(result.errors.some((e) => e.code === "INVALID_CATEGORY_MAPPING"));
});

test("validate() requires every category to have an explicit aggregation choice", () => {
  const model = loadGradeModel();
  const badConfigs = [
    // missing aggregation
    {
      schemaVersion: model.SCHEMA_VERSION,
      categories: [
        { id: "hw", name: "Homework", weight: 100 },
      ],
    },
    // null aggregation
    {
      schemaVersion: model.SCHEMA_VERSION,
      categories: [
        { id: "hw", name: "Homework", weight: 100, aggregation: null },
      ],
    },
    // invalid aggregation string
    {
      schemaVersion: model.SCHEMA_VERSION,
      categories: [
        { id: "hw", name: "Homework", weight: 100, aggregation: "auto-magic" },
      ],
    },
  ];

  for (const bad of badConfigs) {
    const res = model.validate(bad);
    assert.equal(res.isValid, false);
    const err = res.errors.find((e) => e.code === "MISSING_AGGREGATION");
    assert.ok(err, "Category without explicit aggregation must yield MISSING_AGGREGATION");
  }
});

test("validate() requires category weights to total exactly 100%", () => {
  const model = loadGradeModel();
  // Sum = 90
  const under = model.validate({
    schemaVersion: model.SCHEMA_VERSION,
    categories: [
      { id: "c1", name: "C1", weight: 40, aggregation: "equal-assessment" },
      { id: "c2", name: "C2", weight: 50, aggregation: "equal-assessment" },
    ],
  });
  assert.equal(under.isValid, false);
  assert.ok(under.errors.some((e) => e.code === "INVALID_WEIGHT_SUM"));

  // Sum = 105
  const over = model.validate({
    schemaVersion: model.SCHEMA_VERSION,
    categories: [
      { id: "c1", name: "C1", weight: 55, aggregation: "equal-assessment" },
      { id: "c2", name: "C2", weight: 50, aggregation: "equal-assessment" },
    ],
  });
  assert.equal(over.isValid, false);
  assert.ok(over.errors.some((e) => e.code === "INVALID_WEIGHT_SUM"));

  // Exactly 100 passes
  const exact = model.validate({
    schemaVersion: model.SCHEMA_VERSION,
    categories: [
      { id: "c1", name: "C1", weight: 40, aggregation: "equal-assessment" },
      { id: "c2", name: "C2", weight: 60, aggregation: "equal-assessment" },
    ],
  });
  assert.equal(exact.isValid, true);
  assert.equal(exact.errors.length, 0);
});

// ---------------------------------------------------------------------------
// 3. Two Aggregation Modes & Explicit Calculation Breakdowns (Task 2.2)
// ---------------------------------------------------------------------------

test("equal-assessment aggregation calculates simple average with explicit breakdown", () => {
  const model = loadGradeModel();
  const category = {
    id: "quizzes",
    name: "Quizzes",
    weight: 20,
    aggregation: "equal-assessment",
  };
  const items = [
    { id: "q1", title: "Quiz 1", score: 80 },
    { id: "q2", title: "Quiz 2", score: 90 },
    { id: "q3", title: "Quiz 3", score: 100 },
  ];

  const breakdown = model.calculateCategoryGrade(category, items);
  assert.equal(breakdown.categoryId, "quizzes");
  assert.equal(breakdown.categoryName, "Quizzes");
  assert.equal(breakdown.weight, 20);
  assert.equal(breakdown.aggregation, "equal-assessment");
  assert.equal(breakdown.rawScore, 90);
  assert.equal(breakdown.finalScore, 90);
  assert.equal(breakdown.weightedContribution, 18); // 90 * 0.20 = 18

  // Breakdown details
  const details = breakdown.calculationDetails;
  assert.equal(details.aggregation, "equal-assessment");
  assert.equal(details.itemCount, 3);
  assert.equal(details.sumOfScores, 270);
  assert.equal(details.averageScore, 90);
  assert.equal(Array.from(details.numbersUsed).length, 3);
  assert.equal(details.numbersUsed[0], 80);
  assert.equal(details.numbersUsed[1], 90);
  assert.equal(details.numbersUsed[2], 100);
  assert.ok(typeof details.formula, "string");
});

test("compatible visible-points aggregation sums points with explicit breakdown", () => {
  const model = loadGradeModel();
  const category = {
    id: "labs",
    name: "Labs",
    weight: 30,
    aggregation: "visible-points",
  };
  const items = [
    { id: "l1", title: "Lab 1", points: 15, maxPoints: 20 }, // 75%
    { id: "l2", title: "Lab 2", points: 45, maxPoints: 50 }, // 90%
    { id: "l3", title: "Lab 3", points: 30, maxPoints: 30 }, // 100%
  ];
  // Total earned: 15 + 45 + 30 = 90
  // Total possible: 20 + 50 + 30 = 100
  // Result: 90 / 100 = 90%

  const breakdown = model.calculateCategoryGrade(category, items);
  assert.equal(breakdown.categoryId, "labs");
  assert.equal(breakdown.rawScore, 90);
  assert.equal(breakdown.finalScore, 90);
  assert.equal(breakdown.weightedContribution, 27); // 90 * 0.30 = 27

  const details = breakdown.calculationDetails;
  assert.equal(details.aggregation, "visible-points");
  assert.equal(details.totalPointsEarned, 90);
  assert.equal(details.totalPointsPossible, 100);
  assert.equal(details.percentage, 90);
  assert.equal(Array.from(details.itemsUsed).length, 3);
  assert.equal(details.itemsUsed[0].earned, 15);
  assert.equal(details.itemsUsed[0].possible, 20);
});

test("visible-points aggregation requires compatible points and flags missing maxima", () => {
  const model = loadGradeModel();
  const category = {
    id: "labs",
    name: "Labs",
    weight: 30,
    aggregation: "visible-points",
    assessmentIds: ["l1", "l2"],
  };
  const config = {
    schemaVersion: model.SCHEMA_VERSION,
    categories: [
      category,
      { id: "other", name: "Other", weight: 70, aggregation: "equal-assessment", assessmentIds: ["o1"] },
    ],
  };

  // l2 lacks maxPoints
  const items = [
    { id: "l1", points: 10, maxPoints: 10 },
    { id: "l2", points: 10 }, // missing possible points!
    { id: "o1", score: 100 },
  ];

  const validation = model.validate(config, items);
  assert.equal(validation.isValid, false);
  const err = validation.errors.find((e) => e.code === "INCOMPATIBLE_VISIBLE_POINTS");
  assert.ok(err, "Must report INCOMPATIBLE_VISIBLE_POINTS when max points are missing");
  assert.equal(err.assessmentId, "l2");

  // calculateCourseGrade refuses to calculate when visible points are incompatible
  const courseResult = model.calculateCourseGrade(config, items);
  assert.equal(courseResult.canCalculate, false);
  assert.equal(courseResult.courseGrade, null);
});

// ---------------------------------------------------------------------------
// 4. Explicit Drop, Cap, and Extra-Credit Rules (Task 2.4)
// ---------------------------------------------------------------------------

test("no drop rule is inferred when not configured", () => {
  const model = loadGradeModel();
  const category = {
    id: "hw",
    name: "Homework",
    weight: 50,
    aggregation: "equal-assessment",
    // dropLowest is NOT configured
  };
  const items = [
    { id: "h1", score: 0 },
    { id: "h2", score: 100 },
  ];

  const breakdown = model.calculateCategoryGrade(category, items);
  assert.equal(breakdown.droppedItems.length, 0);
  assert.equal(breakdown.includedItems.length, 2);
  assert.equal(breakdown.finalScore, 50); // (0 + 100) / 2 = 50, NOT dropped to 100
  assert.equal(breakdown.rulesApplied.dropLowest, 0);
});

test("explicit dropLowest drops the lowest scores and records them in breakdown", () => {
  const model = loadGradeModel();
  const category = {
    id: "hw",
    name: "Homework",
    weight: 50,
    aggregation: "equal-assessment",
    dropLowest: 1,
  };
  const items = [
    { id: "h1", score: 60 },
    { id: "h2", score: 90 },
    { id: "h3", score: 100 },
  ];

  const breakdown = model.calculateCategoryGrade(category, items);
  assert.equal(breakdown.droppedItems.length, 1);
  assert.equal(breakdown.droppedItems[0].id, "h1");
  assert.equal(breakdown.includedItems.length, 2);
  assert.equal(breakdown.finalScore, 95); // (90 + 100) / 2 = 95
  assert.equal(breakdown.rulesApplied.dropLowest, 1);
  assert.equal(breakdown.rulesApplied.droppedCount, 1);
});

test("explicit dropLowest works in visible-points mode", () => {
  const model = loadGradeModel();
  const category = {
    id: "hw",
    name: "Homework",
    weight: 50,
    aggregation: "visible-points",
    dropLowest: 1,
  };
  const items = [
    { id: "h1", points: 5, maxPoints: 10 },   // 50%
    { id: "h2", points: 9, maxPoints: 10 },   // 90%
    { id: "h3", points: 10, maxPoints: 10 },  // 100%
  ];

  const breakdown = model.calculateCategoryGrade(category, items);
  assert.equal(breakdown.droppedItems.length, 1);
  assert.equal(breakdown.droppedItems[0].id, "h1");
  assert.equal(breakdown.finalScore, 95); // (9 + 10) / 20 = 95%
});

test("explicit cap rule caps the category score and records it", () => {
  const model = loadGradeModel();
  // Without cap: bonus items can exceed 100%
  const uncappedCategory = {
    id: "extra",
    name: "Extra",
    weight: 100,
    aggregation: "equal-assessment",
  };
  const bonusItems = [
    { id: "e1", score: 110 },
    { id: "e2", score: 100 },
  ];
  const uncappedResult = model.calculateCategoryGrade(uncappedCategory, bonusItems);
  assert.equal(uncappedResult.finalScore, 105);
  assert.equal(uncappedResult.rulesApplied.isCapped, false);

  // With explicit cap: 100%
  const cappedCategory = {
    ...uncappedCategory,
    cap: 100,
  };
  const cappedResult = model.calculateCategoryGrade(cappedCategory, bonusItems);
  assert.equal(cappedResult.rawScore, 105);
  assert.equal(cappedResult.finalScore, 100);
  assert.equal(cappedResult.rulesApplied.isCapped, true);
  assert.equal(cappedResult.rulesApplied.cap, 100);
});

test("explicit bonus limit enforces maximum allowed bonus", () => {
  const model = loadGradeModel();
  const category = {
    id: "quizzes",
    name: "Quizzes",
    weight: 50,
    aggregation: "equal-assessment",
    bonusLimit: 5, // max 5% bonus, so max allowed score is 105%
    assessmentIds: ["q1"],
  };
  const config = {
    schemaVersion: model.SCHEMA_VERSION,
    categories: [
      category,
      { id: "other", name: "Other", weight: 50, aggregation: "equal-assessment", assessmentIds: ["o1"] },
    ],
  };

  // Score within bonus limit (104%) passes
  const validItems = [
    { id: "q1", score: 104 },
    { id: "o1", score: 90 },
  ];
  const validRes = model.validate(config, validItems);
  assert.equal(validRes.isValid, true);

  // Score exceeding bonus limit (110% > 105%) rejected
  const overBonusItems = [
    { id: "q1", score: 110 },
    { id: "o1", score: 90 },
  ];
  const overRes = model.validate(config, overBonusItems);
  assert.equal(overRes.isValid, false);
  const err = overRes.errors.find((e) => e.code === "OVER_BONUS_LIMIT");
  assert.ok(err, "Must reject score exceeding bonus limit");
  assert.equal(err.assessmentId, "q1");
});

// ---------------------------------------------------------------------------
// 5. Edge and Property Tests (Task 2.6)
// ---------------------------------------------------------------------------

test("zero maxima is handled cleanly without division by zero or NaN", () => {
  const model = loadGradeModel();
  const category = {
    id: "proj",
    name: "Projects",
    weight: 100,
    aggregation: "visible-points",
    assessmentIds: ["p1"],
  };
  const config = {
    schemaVersion: model.SCHEMA_VERSION,
    categories: [category],
  };
  const items = [{ id: "p1", points: 0, maxPoints: 0 }];

  // validate identifies zero maxPoints in visible-points mode
  const validation = model.validate(config, items);
  assert.equal(validation.isValid, false);
  assert.ok(validation.errors.some((e) => e.code === "ZERO_MAX_POINTS" || e.code === "INCOMPATIBLE_VISIBLE_POINTS"));

  // calculateCategoryGrade does not throw or return NaN
  let breakdown;
  assert.doesNotThrow(() => {
    breakdown = model.calculateCategoryGrade(category, items);
  });
  assert.equal(Number.isNaN(breakdown.rawScore), false);
  assert.equal(Number.isNaN(breakdown.finalScore), false);
  assert.equal(Number.isNaN(breakdown.weightedContribution), false);
});

test("negative inputs are rejected with structured errors", () => {
  const model = loadGradeModel();
  // Negative weight
  const negWeight = model.validate({
    schemaVersion: model.SCHEMA_VERSION,
    categories: [
      { id: "c1", name: "C1", weight: -10, aggregation: "equal-assessment" },
      { id: "c2", name: "C2", weight: 110, aggregation: "equal-assessment" },
    ],
  });
  assert.equal(negWeight.isValid, false);
  assert.ok(negWeight.errors.some((e) => e.code === "NEGATIVE_WEIGHT"));

  // Negative drop count
  const negDrop = model.validate({
    schemaVersion: model.SCHEMA_VERSION,
    categories: [
      { id: "c1", name: "C1", weight: 100, aggregation: "equal-assessment", dropLowest: -1 },
    ],
  });
  assert.equal(negDrop.isValid, false);
  assert.ok(negDrop.errors.some((e) => e.code === "NEGATIVE_DROP_COUNT"));

  // Negative cap
  const negCap = model.validate({
    schemaVersion: model.SCHEMA_VERSION,
    categories: [
      { id: "c1", name: "C1", weight: 100, aggregation: "equal-assessment", cap: -5 },
    ],
  });
  assert.equal(negCap.isValid, false);
  assert.ok(negCap.errors.some((e) => e.code === "NEGATIVE_CAP"));

  // Negative bonusLimit
  const negBonus = model.validate({
    schemaVersion: model.SCHEMA_VERSION,
    categories: [
      { id: "c1", name: "C1", weight: 100, aggregation: "equal-assessment", bonusLimit: -2 },
    ],
  });
  assert.equal(negBonus.isValid, false);
  assert.ok(negBonus.errors.some((e) => e.code === "NEGATIVE_BONUS_LIMIT"));

  // Negative score input
  const config = {
    schemaVersion: model.SCHEMA_VERSION,
    categories: [
      { id: "c1", name: "C1", weight: 100, aggregation: "equal-assessment", assessmentIds: ["a1"] },
    ],
  };
  const negScore = model.validate(config, [{ id: "a1", score: -15 }]);
  assert.equal(negScore.isValid, false);
  assert.ok(negScore.errors.some((e) => e.code === "NEGATIVE_SCORE"));
});

test("drop count exceeding mapped items produces structured error", () => {
  const model = loadGradeModel();
  const config = {
    schemaVersion: model.SCHEMA_VERSION,
    categories: [
      { id: "hw", name: "HW", weight: 100, aggregation: "equal-assessment", dropLowest: 3, assessmentIds: ["h1", "h2"] },
    ],
  };
  const res = model.validate(config, [{ id: "h1", score: 80 }, { id: "h2", score: 90 }]);
  assert.equal(res.isValid, false);
  assert.ok(res.errors.some((e) => e.code === "EXCESSIVE_DROP_COUNT"));
});

test("weight-sum floating-point precision is handled accurately", () => {
  const model = loadGradeModel();
  // 33.33 + 33.33 + 33.34 = 100
  const threeWay = model.validate({
    schemaVersion: model.SCHEMA_VERSION,
    categories: [
      { id: "c1", name: "C1", weight: 33.33, aggregation: "equal-assessment" },
      { id: "c2", name: "C2", weight: 33.33, aggregation: "equal-assessment" },
      { id: "c3", name: "C3", weight: 33.34, aggregation: "equal-assessment" },
    ],
  });
  assert.equal(threeWay.isValid, true);

  // Classic IEEE 754 precision quirk: 14.2 + 28.5 + 57.3 = 100.00000000000001
  const ieeeFloat = model.validate({
    schemaVersion: model.SCHEMA_VERSION,
    categories: [
      { id: "c1", name: "C1", weight: 14.2, aggregation: "equal-assessment" },
      { id: "c2", name: "C2", weight: 28.5, aggregation: "equal-assessment" },
      { id: "c3", name: "C3", weight: 57.3, aggregation: "equal-assessment" },
    ],
  });
  assert.equal(ieeeFloat.isValid, true);

  // Close but definitely not 100 (99.9%)
  const notQuite = model.validate({
    schemaVersion: model.SCHEMA_VERSION,
    categories: [
      { id: "c1", name: "C1", weight: 33.3, aggregation: "equal-assessment" },
      { id: "c2", name: "C2", weight: 33.3, aggregation: "equal-assessment" },
      { id: "c3", name: "C3", weight: 33.3, aggregation: "equal-assessment" },
    ],
  });
  assert.equal(notQuite.isValid, false);
  assert.ok(notQuite.errors.some((e) => e.code === "INVALID_WEIGHT_SUM"));
});

test("rounding stability and deterministic calculation across repeated runs", () => {
  const model = loadGradeModel();
  assert.equal(model.roundTo(89.99999, 2), 90);
  assert.equal(model.roundTo(85.555, 2), 85.56);
  assert.equal(model.roundTo(85.554, 2), 85.55);
  assert.equal(model.roundTo(100, 2), 100);

  const config = {
    schemaVersion: model.SCHEMA_VERSION,
    categories: [
      { id: "hw", name: "HW", weight: 33.33, aggregation: "equal-assessment", assessmentIds: ["h1", "h2", "h3"] },
      { id: "lab", name: "Labs", weight: 33.33, aggregation: "visible-points", assessmentIds: ["l1", "l2"] },
      { id: "exam", name: "Exams", weight: 33.34, aggregation: "equal-assessment", assessmentIds: ["e1"] },
    ],
  };
  const items = [
    { id: "h1", score: 85 },
    { id: "h2", score: 92.5 },
    { id: "h3", score: 78 },
    { id: "l1", points: 18, maxPoints: 20 },
    { id: "l2", points: 48, maxPoints: 50 },
    { id: "e1", score: 88 },
  ];

  const run1 = model.calculateCourseGrade(config, items);
  const run2 = model.calculateCourseGrade(config, items);

  assert.equal(run1.canCalculate, true);
  assert.equal(run2.canCalculate, true);
  assert.equal(run1.courseGrade, run2.courseGrade);
  assert.equal(typeof run1.courseGrade, "number");
  assert.equal(Number.isNaN(run1.courseGrade), false);
});

test("calculateCourseGrade integrates categories and evaluates targets", () => {
  const model = loadGradeModel();
  const config = {
    schemaVersion: model.SCHEMA_VERSION,
    targets: [
      { id: "t1", label: "A", targetPercent: 85 },
      { id: "t2", label: "A+", targetPercent: 90 },
    ],
    categories: [
      { id: "hw", name: "HW", weight: 40, aggregation: "equal-assessment", assessmentIds: ["h1"] },
      { id: "exam", name: "Exam", weight: 60, aggregation: "equal-assessment", assessmentIds: ["e1"] },
    ],
  };
  const items = [
    { id: "h1", score: 90 }, // 90 * 0.40 = 36
    { id: "e1", score: 85 }, // 85 * 0.60 = 51
  ];
  // Total = 36 + 51 = 87%

  const res = model.calculateCourseGrade(config, items);
  assert.equal(res.canCalculate, true);
  assert.equal(res.courseGrade, 87);
  assert.equal(res.breakdown.totalCourseGrade, 87);
  assert.equal(res.breakdown.categories.length, 2);

  // Targets evaluation
  assert.ok(Array.isArray(res.targets));
  assert.equal(res.targets.length, 2);
  const targetA = res.targets.find((t) => t.label === "A");
  assert.equal(targetA.reached, true);
  const targetAPlus = res.targets.find((t) => t.label === "A+");
  assert.equal(targetAPlus.reached, false);
});

// ---------------------------------------------------------------------------
// 6. Immutable Scenarios (Task 2.3)
// ---------------------------------------------------------------------------

test("grade-model exports RESULT_KINDS with strictly distinct result types", () => {
  const model = loadGradeModel();
  assert.equal(typeof model.RESULT_KINDS, "object");
  assert.equal(model.RESULT_KINDS.OBSERVED, "observed");
  assert.equal(model.RESULT_KINDS.MANUAL, "manual");
  assert.equal(model.RESULT_KINDS.HYPOTHETICAL, "hypothetical");
  assert.equal(typeof model.applyScenario, "function");
  assert.equal(typeof model.createScenario, "function");
});

test("scenario keeps observed, manual, and hypothetical results strictly distinct", () => {
  const model = loadGradeModel();
  const baseAssessments = [
    { id: "hw1", title: "HW 1", score: 90, resultKind: "observed" },
    { id: "hw2", title: "HW 2", score: 85, resultKind: "manual" },
    { id: "hw3", title: "HW 3", score: 70 }, // defaults to observed
  ];

  const scenario = model.applyScenario(baseAssessments, [
    { id: "hw1", score: 100, resultKind: "hypothetical" },
    { id: "hw4", title: "HW 4 Future", score: 95, resultKind: "hypothetical" },
  ]);

  // Item hw1: was observed in base, now overridden as hypothetical in scenario
  const sHw1 = scenario.getAssessment("hw1");
  assert.equal(sHw1.resultKind, "hypothetical");
  assert.equal(sHw1.isHypothetical, true);
  assert.equal(sHw1.isObserved, false);
  assert.equal(sHw1.isManual, false);
  assert.equal(sHw1.isOverridden, true);
  assert.equal(sHw1.scorePercent, 100);
  assert.equal(sHw1.baseResult.resultKind, "observed");
  assert.equal(sHw1.baseResult.scorePercent, 90);

  // Item hw2: manual in base, untouched in scenario
  const sHw2 = scenario.getAssessment("hw2");
  assert.equal(sHw2.resultKind, "manual");
  assert.equal(sHw2.isManual, true);
  assert.equal(sHw2.isObserved, false);
  assert.equal(sHw2.isHypothetical, false);
  assert.equal(sHw2.isOverridden, false);
  assert.equal(sHw2.scorePercent, 85);

  // Item hw3: defaulted to observed, untouched
  const sHw3 = scenario.getAssessment("hw3");
  assert.equal(sHw3.resultKind, "observed");
  assert.equal(sHw3.isObserved, true);
  assert.equal(sHw3.isManual, false);
  assert.equal(sHw3.isHypothetical, false);
  assert.equal(sHw3.isOverridden, false);
  assert.equal(sHw3.scorePercent, 70);

  // Item hw4: newly added hypothetical item
  const sHw4 = scenario.getAssessment("hw4");
  assert.equal(sHw4.resultKind, "hypothetical");
  assert.equal(sHw4.isHypothetical, true);
  assert.equal(sHw4.isObserved, false);
  assert.equal(sHw4.isManual, false);

  // Base results must be completely untouched and retain their original kinds and values
  assert.equal(baseAssessments.length, 3);
  assert.equal(baseAssessments[0].score, 90);
  assert.equal(baseAssessments[0].resultKind, "observed");
  assert.equal(baseAssessments[1].score, 85);
  assert.equal(baseAssessments[1].resultKind, "manual");
  assert.equal(baseAssessments[2].score, 70);
});

test("applying a scenario returns a new object and mutating it cannot reach back into base data", () => {
  const model = loadGradeModel();
  const originalItem = {
    id: "midterm",
    title: "Midterm Exam",
    score: 80,
    pointsEarned: 80,
    pointsPossible: 100,
    resultKind: "observed",
    details: { room: "HEBB 100" },
  };
  const baseAssessments = [originalItem];

  const scenario = model.applyScenario(baseAssessments, [
    { id: "midterm", score: 95 },
  ]);

  // Check that returned scenario is a new object
  assert.equal(typeof scenario, "object");
  assert.notEqual(scenario, baseAssessments);
  assert.notEqual(scenario.assessments, baseAssessments);
  assert.notEqual(scenario.assessments[0], originalItem);

  // Mutate returned scenario assessment fields
  scenario.assessments[0].score = 999;
  scenario.assessments[0].scorePercent = 999;
  scenario.assessments[0].title = "MUTATED TITLE";
  scenario.assessments[0].resultKind = "MUTATED_KIND";
  if (scenario.assessments[0].details) {
    scenario.assessments[0].details.room = "MUTATED ROOM";
  }
  // Push an extra assessment into scenario
  scenario.assessments.push({ id: "extra", score: 100 });

  // Verify base data was NEVER touched or mutated
  assert.equal(baseAssessments.length, 1);
  assert.equal(originalItem.score, 80);
  assert.equal(originalItem.title, "Midterm Exam");
  assert.equal(originalItem.resultKind, "observed");
  assert.equal(originalItem.details.room, "HEBB 100");

  // Mutate base data and verify scenario remains isolated
  originalItem.score = 50;
  assert.equal(scenario.assessments[0].score, 999);
});

test("scenario integrates with calculateCourseGrade without mutating base calculation", () => {
  const model = loadGradeModel();
  const config = {
    schemaVersion: model.SCHEMA_VERSION,
    categories: [
      { id: "hw", name: "HW", weight: 50, aggregation: "equal-assessment", assessmentIds: ["h1"] },
      { id: "exam", name: "Exam", weight: 50, aggregation: "equal-assessment", assessmentIds: ["e1"] },
    ],
  };
  const baseAssessments = [
    { id: "h1", score: 80, resultKind: "observed" },
    { id: "e1", score: 60, resultKind: "observed" },
  ];

  // Base grade: 80 * 0.5 + 60 * 0.5 = 70
  const baseGrade = model.calculateCourseGrade(config, baseAssessments);
  assert.equal(baseGrade.courseGrade, 70);

  // Scenario: what if exam is 100?
  const scenario = model.applyScenario(baseAssessments, {
    e1: { score: 100, resultKind: "hypothetical" },
  });

  // Calculate with scenario
  const scenarioGrade = model.calculateCourseGrade(config, scenario);
  assert.equal(scenarioGrade.courseGrade, 90); // 80 * 0.5 + 100 * 0.5 = 90

  // Verify breakdown keeps result kinds distinct
  const examCat = scenarioGrade.categories.find((c) => c.categoryId === "exam");
  assert.equal(examCat.items[0].resultKind, "hypothetical");
  assert.equal(examCat.items[0].isHypothetical, true);

  const hwCat = scenarioGrade.categories.find((c) => c.categoryId === "hw");
  assert.equal(hwCat.items[0].resultKind, "observed");
  assert.equal(hwCat.items[0].isObserved, true);

  // Recalculate base to prove no mutation
  const baseGradeAfter = model.calculateCourseGrade(config, baseAssessments);
  assert.equal(baseGradeAfter.courseGrade, 70);
});

// ---------------------------------------------------------------------------
// 7. Target Solving for Complete Supported Category Models (Task 2.5)
// ---------------------------------------------------------------------------

test("grade-model exports TARGET_OUTCOMES with the four distinguished states", () => {
  const model = loadGradeModel();
  assert.equal(typeof model.TARGET_OUTCOMES, "object");
  assert.equal(model.TARGET_OUTCOMES.ALREADY_SECURED, "already-secured");
  assert.equal(model.TARGET_OUTCOMES.FEASIBLE, "feasible");
  assert.equal(model.TARGET_OUTCOMES.IMPOSSIBLE, "impossible");
  assert.equal(model.TARGET_OUTCOMES.UNDERDETERMINED, "underdetermined");
  assert.equal(typeof model.solveTarget, "function");
});

test("target solving: 'already secured' outcome when target is met no matter what remains", () => {
  const model = loadGradeModel();
  const config = {
    schemaVersion: model.SCHEMA_VERSION,
    categories: [
      { id: "hw", name: "HW", weight: 60, aggregation: "equal-assessment", assessmentIds: ["h1"] },
      { id: "final", name: "Final", weight: 40, aggregation: "equal-assessment", assessmentIds: ["f1"] },
    ],
  };
  // HW has 100%. Even with 0% on final, course grade is 60%.
  // Target of 50% is already secured!
  const assessments = [
    { id: "h1", score: 100 },
    { id: "f1", score: null, isRemaining: true },
  ];

  const result = model.solveTarget(config, assessments, 50);
  assert.equal(typeof result, "object");
  assert.equal(result.outcome, model.TARGET_OUTCOMES.ALREADY_SECURED);
  assert.equal(result.isAlreadySecured, true);
  assert.equal(result.isFeasible, false);
  assert.equal(result.isImpossible, false);
  assert.equal(result.isUnderdetermined, false);
  assert.equal(result.targetPercent, 50);
  assert.equal(result.minReachable, 60);
  assert.equal(result.shortfall, 0);
  assert.equal(typeof result.reason, "string");
  assert.ok(result.reason.length > 0);
});

test("target solving: 'feasible' outcome with accurate required score and points", () => {
  const model = loadGradeModel();
  const config = {
    schemaVersion: model.SCHEMA_VERSION,
    categories: [
      { id: "hw", name: "HW", weight: 40, aggregation: "equal-assessment", assessmentIds: ["h1"] },
      { id: "exam", name: "Exam", weight: 60, aggregation: "visible-points", assessmentIds: ["e1"] },
    ],
  };
  // HW is 90% -> contributes 36%.
  // Target is 85%. Required contribution from exam is 85 - 36 = 49%.
  // Exam has weight 60%. Required score is 49 / 60 = 81.67%.
  // Exam maxPoints = 200. Required points = 81.67% of 200 = 163.33 points.
  const assessments = [
    { id: "h1", score: 90 },
    { id: "e1", pointsPossible: 200, pointsEarned: null, isRemaining: true },
  ];

  const result = model.solveTarget(config, assessments, 85);
  assert.equal(typeof result, "object");
  assert.equal(result.outcome, model.TARGET_OUTCOMES.FEASIBLE);
  assert.equal(result.isFeasible, true);
  assert.equal(result.isAlreadySecured, false);
  assert.equal(result.isImpossible, false);
  assert.equal(result.isUnderdetermined, false);
  assert.equal(result.targetPercent, 85);
  assert.equal(result.requiredScorePercent, 81.67);
  assert.equal(result.requiredScore, 81.67);
  assert.equal(result.requiredPoints, 163.34);
  assert.equal(result.shortfall, 0);
  assert.equal(result.minReachable, 36);
  assert.equal(result.maxReachable, 96);
});

test("target solving: 'impossible' outcome with maximum reachable score and shortfall", () => {
  const model = loadGradeModel();
  const config = {
    schemaVersion: model.SCHEMA_VERSION,
    categories: [
      { id: "hw", name: "HW", weight: 50, aggregation: "equal-assessment", assessmentIds: ["h1"] },
      { id: "final", name: "Final", weight: 50, aggregation: "equal-assessment", assessmentIds: ["f1"] },
    ],
  };
  // HW is 70% (35 pts). Max possible on final is 100% (50 pts).
  // Max reachable course grade is 85%.
  // Target of 90% is impossible; shortfall is 5%.
  const assessments = [
    { id: "h1", score: 70 },
    { id: "f1", score: null, isRemaining: true },
  ];

  const result = model.solveTarget(config, assessments, 90);
  assert.equal(typeof result, "object");
  assert.equal(result.outcome, model.TARGET_OUTCOMES.IMPOSSIBLE);
  assert.equal(result.isImpossible, true);
  assert.equal(result.isAlreadySecured, false);
  assert.equal(result.isFeasible, false);
  assert.equal(result.isUnderdetermined, false);
  assert.equal(result.targetPercent, 90);
  assert.equal(result.maxReachable, 85);
  assert.equal(result.shortfall, 5);
  assert.equal(result.requiredScorePercent, null);
  assert.ok(typeof result.reason, "string");
  assert.ok(result.reason.includes("impossible"));
});

test("target solving: 'underdetermined' when no remaining assessments exist and target not met", () => {
  const model = loadGradeModel();
  const config = {
    schemaVersion: model.SCHEMA_VERSION,
    categories: [
      { id: "hw", name: "HW", weight: 50, aggregation: "equal-assessment", assessmentIds: ["h1"] },
      { id: "exam", name: "Exam", weight: 50, aggregation: "equal-assessment", assessmentIds: ["e1"] },
    ],
  };
  // All assessments are already completed (no remaining assessments)
  const assessments = [
    { id: "h1", score: 80 },
    { id: "e1", score: 80 },
  ];
  // Total grade is 80%. Target is 90%. Cannot solve because no remaining work exists.
  const result = model.solveTarget(config, assessments, 90);
  assert.equal(typeof result, "object");
  assert.equal(result.outcome, model.TARGET_OUTCOMES.UNDERDETERMINED);
  assert.equal(result.isUnderdetermined, true);
  assert.equal(result.isFeasible, false);
  assert.equal(result.isAlreadySecured, false);
  assert.equal(result.isImpossible, false);
  assert.equal(result.blocker, "NO_REMAINING_ASSESSMENTS");
});

test("target solving: 'underdetermined' when remaining assessment lacks maxima in visible-points mode", () => {
  const model = loadGradeModel();
  const config = {
    schemaVersion: model.SCHEMA_VERSION,
    categories: [
      { id: "lab", name: "Labs", weight: 50, aggregation: "visible-points", assessmentIds: ["l1", "l2"] },
      { id: "exam", name: "Exam", weight: 50, aggregation: "equal-assessment", assessmentIds: ["e1"] },
    ],
  };
  // l2 is remaining in visible-points mode, but has NO maxPoints!
  const assessments = [
    { id: "l1", points: 10, maxPoints: 10 },
    { id: "l2", pointsEarned: null, pointsPossible: null, isRemaining: true },
    { id: "e1", score: 80 },
  ];

  const result = model.solveTarget(config, assessments, 85);
  assert.equal(typeof result, "object");
  assert.equal(result.outcome, model.TARGET_OUTCOMES.UNDERDETERMINED);
  assert.equal(result.isUnderdetermined, true);
  assert.equal(result.blocker, "MISSING_MAXIMA");
  assert.equal(result.assessmentId, "l2");
  assert.ok(typeof result.reason, "string");
  assert.ok(result.reason.includes("possible points"));
});

test("target solving: 'underdetermined' when model configuration is incomplete or invalid", () => {
  const model = loadGradeModel();
  // Weights do not sum to 100% (40 + 40 = 80%)
  const badConfig = {
    schemaVersion: model.SCHEMA_VERSION,
    categories: [
      { id: "c1", name: "C1", weight: 40, aggregation: "equal-assessment", assessmentIds: ["a1"] },
      { id: "c2", name: "C2", weight: 40, aggregation: "equal-assessment", assessmentIds: ["a2"] },
    ],
  };
  const assessments = [
    { id: "a1", score: 80 },
    { id: "a2", score: null, isRemaining: true },
  ];

  const result = model.solveTarget(badConfig, assessments, 75);
  assert.equal(result.outcome, model.TARGET_OUTCOMES.UNDERDETERMINED);
  assert.equal(result.isUnderdetermined, true);
  assert.equal(result.blocker, "INVALID_CONFIG");
  assert.ok(Array.isArray(result.errors));
});

test("target solving: 'underdetermined' when remaining category has active drop rule", () => {
  const model = loadGradeModel();
  const config = {
    schemaVersion: model.SCHEMA_VERSION,
    categories: [
      { id: "hw", name: "HW", weight: 50, aggregation: "equal-assessment", dropLowest: 1, assessmentIds: ["h1", "h2", "h3"] },
      { id: "exam", name: "Exam", weight: 50, aggregation: "equal-assessment", assessmentIds: ["e1"] },
    ],
  };
  const assessments = [
    { id: "h1", score: 90 },
    { id: "h2", score: 80 },
    { id: "h3", score: null, isRemaining: true },
    { id: "e1", score: 70 },
  ];

  const result = model.solveTarget(config, assessments, 80);
  assert.equal(result.outcome, model.TARGET_OUTCOMES.UNDERDETERMINED);
  assert.equal(result.isUnderdetermined, true);
  assert.equal(result.blocker, "NONLINEAR_DROP_RULE");
  assert.ok(result.reason.includes("non-linear"));
});

test("target solving: category-level target solving handles all four outcomes", () => {
  const model = loadGradeModel();
  const category = {
    id: "quizzes",
    name: "Quizzes",
    weight: 20,
    aggregation: "equal-assessment",
  };
  const items = [
    { id: "q1", score: 100 },
    { id: "q2", score: null, isRemaining: true },
  ];

  // 1. Target 40%: already secured because min score is 50%
  const secured = model.solveTarget(category, items, 40);
  assert.equal(secured.outcome, model.TARGET_OUTCOMES.ALREADY_SECURED);
  assert.equal(secured.isAlreadySecured, true);

  // 2. Target 75%: feasible because required score is 50%
  const feasible = model.solveTarget(category, items, 75);
  assert.equal(feasible.outcome, model.TARGET_OUTCOMES.FEASIBLE);
  assert.equal(feasible.isFeasible, true);
  assert.equal(feasible.requiredScorePercent, 50);

  // 3. Target 105%: impossible without bonus (max score is 100%)
  const impossible = model.solveTarget(category, items, 105);
  assert.equal(impossible.outcome, model.TARGET_OUTCOMES.IMPOSSIBLE);
  assert.equal(impossible.isImpossible, true);
  assert.equal(impossible.shortfall, 5);

  // 4. Target 80% on completed quizzes (no remaining): underdetermined
  const allDone = [{ id: "q1", score: 70 }];
  const underdetermined = model.solveTarget(category, allDone, 80);
  assert.equal(underdetermined.outcome, model.TARGET_OUTCOMES.UNDERDETERMINED);
  assert.equal(underdetermined.isUnderdetermined, true);
  assert.equal(underdetermined.blocker, "NO_REMAINING_ASSESSMENTS");
});

test("target solving: never returns a bare number for any outcome", () => {
  const model = loadGradeModel();
  const config = {
    schemaVersion: model.SCHEMA_VERSION,
    categories: [
      { id: "c1", name: "C1", weight: 100, aggregation: "equal-assessment", assessmentIds: ["a1"] },
    ],
  };

  const cases = [
    { items: [{ id: "a1", score: 100 }], target: 50 },     // already-secured
    { items: [{ id: "a1", score: null, isRemaining: true }], target: 80 }, // feasible
    { items: [{ id: "a1", score: null, isRemaining: true }], target: 120 }, // impossible
    { items: [{ id: "a1", score: 70 }], target: 90 },       // underdetermined
  ];

  for (const c of cases) {
    const res = model.solveTarget(config, c.items, c.target);
    assert.equal(typeof res, "object");
    assert.notEqual(typeof res, "number");
    assert.ok(
      res.outcome === model.TARGET_OUTCOMES.ALREADY_SECURED ||
      res.outcome === model.TARGET_OUTCOMES.FEASIBLE ||
      res.outcome === model.TARGET_OUTCOMES.IMPOSSIBLE ||
      res.outcome === model.TARGET_OUTCOMES.UNDERDETERMINED
    );
  }
});

