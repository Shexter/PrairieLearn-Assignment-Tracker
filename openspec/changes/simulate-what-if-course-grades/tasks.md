## 1. Course result discovery and configuration schema

- [ ] 1.1 Capture sanitized student course-page fixtures covering assessment groups, points, percentages, hidden/missing scores, bonus, closed work, and dynamic additions; do not add Canvas or gradebook fixtures.
- [x] 1.2 Define a versioned local schema for student-authored categories, total-grade weights, assessment mappings, aggregation choices, drops, bonus limits, and targets.
- [ ] 1.3 Build course-page adapters that emit observable assessment results with field provenance and suggested, unconfirmed category mappings.
- [ ] 1.4 Add migration/reconciliation tests for renamed, new, removed, duplicate, and unmapped assessments plus corrupt local configuration.

## 2. Calculation engine

- [x] 2.1 Add validation tests requiring all included assessments to be mapped, every category to have an aggregation choice, and category weights to total 100%.
- [x] 2.2 Implement equal-assessment and compatible visible-points category aggregation with explicit per-category calculation breakdowns.
- [x] 2.3 Implement immutable scenarios that keep observed PrairieLearn results, manually supplied results, and hypothetical values distinct.
- [x] 2.4 Implement explicit drop, cap, and extra-credit rules without any inferred defaults.
- [x] 2.5 Implement target solving for complete supported category models with already-secured, feasible, impossible, and underdetermined results.
- [x] 2.6 Add edge/property tests for zero maxima, negative input, over-bonus input, missing mappings, weight-sum precision, and rounding stability.

## 3. Simulator experience

- [ ] 3.1 Add accessible entry points on supported course pages and in the popup plus an accessible modal/side panel with focus trap and restore.
- [ ] 3.2 Build category setup for add/rename/delete, weight entry, assessment mapping, aggregation choice, and a visible 100% total with blocking errors.
- [ ] 3.3 Render PrairieLearn-observed versus manual result provenance, unmatched/new assessments, explicit exceptional rules, and per-category calculation breakdowns.
- [ ] 3.4 Add hypothetical result and target inputs with required/max reachable outcomes and prominent student-configured/unofficial wording.
- [ ] 3.5 Persist course configuration locally, keep scenarios ephemeral by default, and provide explicit save, reset, and delete-course-configuration actions.

## 4. Verification

- [ ] 4.1 Add Chrome/Firefox parity, unsupported-layout, no-write, and privacy tests proving no Canvas/LMS request and no PrairieLearn mutation.
- [ ] 4.2 Update documentation with manual category setup, local storage, aggregation choices, provenance, limitations, and examples that avoid institutional grade-cutoff claims.
- [ ] 4.3 Run automated, syntax, parity, strict OpenSpec, and diff checks.
- [ ] 4.4 Compare simulator results by hand against syllabus-style category examples for equal-assessment, points-weighted, drops, bonus, missing-data, and target scenarios in both browsers.
