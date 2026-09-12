## Context

See proposal.md. PrairieLearn course pages can expose assessment results and grouping labels, but the authoritative UBC course-grading scheme commonly lives in a syllabus or Canvas and is not reliably connected to PrairieLearn. This design deliberately avoids both Canvas and PrairieLearn gradebook integration.

## Goals / Non-Goals

**Goals:** Student-authored category models, deterministic pure calculations, field-level provenance, honest incomplete states, and zero PrairieLearn writes.

**Non-Goals:** Reading or importing Canvas/UBC LMS data, depending on PrairieLearn gradebook pages, predicting instructor policy, claiming an official final grade, or persisting scenarios by default.

## Decisions

### 1. Separate PrairieLearn results from student-authored policy
Course-page adapters emit a versioned snapshot with source URL/time and per-field provenance. A separate configuration stores category definitions, weights, membership, aggregation choice, and exceptional rules. The engine calculates only when those two validated inputs reconcile.

### 2. Require weights and mappings rather than discovering them
PrairieLearn group labels seed editable suggestions only. The student must confirm every category and mapping and enter weights totaling 100%. Alternative: scrape Canvas or infer weights from names/points; rejected as brittle and contrary to the requested manual contract.

### 3. Make within-category aggregation explicit
Each category stores either equal-assessment averaging or visible-points weighting. The latter is enabled only when every mapped item has compatible points or the student supplies missing maxima. No hidden default is applied.

### 4. Solve targets over selected remaining items
For a linear supported model, compute required aggregate points/percent and compare against explicit maxima. For nonlinear or incomplete models, disable the solver and name the blocker rather than approximate.

### 5. Persist configuration, keep scenarios ephemeral
The student-authored course model persists locally by origin/course-instance identity because re-entry would be burdensome. Hypothetical values live in modal state unless explicitly saved. Versioned validation isolates corrupt or stale mappings when course assessments change.

## Risks / Trade-offs

- [Students trust an incomplete projection] → Prominent provenance, excluded-row list, unofficial label, and no authoritative number when required inputs are absent.
- [Course-page markup changes] → Fixture adapters and unsupported-layout fail closed while manual entry remains available.
- [Student configuration becomes stale] → Show unmatched/new assessments and require reconciliation before recalculation.
- [Bonus/drop rules are nonlinear] → Implement only explicit tested rule types and surface unsupported policy.

## Migration Plan

Start with the local category schema/editor and pure weighted-category engine, then add optional PrairieLearn course-page result import and scenario/target UI. Gate release on hand-calculated course examples. Rollback removes entry points and local keys without touching PrairieLearn or any LMS.
