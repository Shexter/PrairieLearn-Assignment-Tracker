## Why

PrairieLearn exposes per-assessment results but does not know the complete UBC/Canvas course-grading scheme. A useful simulator therefore needs students to define their own assessment categories and total-grade weights instead of attempting a brittle gradebook or Canvas integration.

## What Changes

- Add a course-page and popup entry point for a local What-If Grade simulator; do not integrate with Canvas or depend on PrairieLearn's gradebook page.
- Reuse student-visible PrairieLearn assessment titles, groups, scores, and points when available, but treat them only as source results rather than a complete course grade.
- Require the student to create/confirm every grading category, map assessments to it, and enter how much that category contributes to the total course grade before calculating a result.
- Require category weights to total 100%; let the student choose equal-assessment or visible-points aggregation within each category and explain the selected assumption.
- Let students enter hypothetical scores for unfinished or future assessments and compare scenarios without changing PrairieLearn.
- Let students define target percentages and optional personal labels such as A, B, or Pass; do not infer institutional cutoffs.
- Let students explicitly configure dropped items, bonus/extra-credit treatment, and category targets; never infer these rules.
- Explain missing or unmapped assessments and refuse to calculate while required category inputs are incomplete.

## Capabilities

### New Capabilities

- `what-if-grade-simulation`: Student-configured category weights and local grade scenarios using PrairieLearn only for observable assessment results.

### Modified Capabilities

None.

## Impact

- Adds course-page result parsing, category-setup and simulator UI, pure calculation helpers, local configuration, temporary scenario state, and tests in both browser packages.
- Adds no Canvas/UBC integration, gradebook-page dependency, grade writes, instructor endpoints, external APIs, or claims about official final grades.
- Requires the student to maintain course-specific grading configuration in browser-local storage.
