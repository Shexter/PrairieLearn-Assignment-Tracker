## Purpose

Lets students define category weights and explore local scenarios while using PrairieLearn only for observable per-assessment results.

## ADDED Requirements

### Requirement: Students define the complete grading model
The extension SHALL require the student to define or confirm every assessment category, its contribution to the total course grade, and its assessment membership before calculating a course result.

#### Scenario: Category weights are complete
- **WHEN** every included assessment is mapped and category weights total exactly 100%
- **THEN** the simulator accepts the grading model and identifies it as student-configured

#### Scenario: Category setup is incomplete
- **WHEN** weights do not total 100% or an included assessment is unmapped
- **THEN** the simulator identifies each missing or invalid input and does not calculate a course result

### Requirement: PrairieLearn supplies results, not course policy
The extension SHALL use only student-visible PrairieLearn titles, groups, scores, and points as assessment-result inputs and SHALL NOT treat PrairieLearn grouping as authoritative course weighting.

#### Scenario: PrairieLearn groups are detected
- **WHEN** assessment group labels are observable on the course page
- **THEN** the extension may suggest category names and mappings but requires the student to confirm them and enter every weight

#### Scenario: Canvas data would be required
- **WHEN** a grading rule or result exists only in Canvas or another LMS
- **THEN** the extension makes no LMS request and prompts the student to enter the needed assumption manually

### Requirement: Category aggregation is explicit
For each category, the extension SHALL require or visibly confirm equal-assessment averaging or visible-points weighting and SHALL use no hidden default.

#### Scenario: Visible-points aggregation is unavailable
- **WHEN** one or more mapped assessments lack parseable possible points
- **THEN** visible-points weighting is unavailable until the student supplies the missing values or selects equal-assessment averaging

### Requirement: Students can enter hypothetical outcomes
The extension SHALL let students enter or override future and incomplete assessment results without changing the observed PrairieLearn snapshot or sending writes to PrairieLearn.

#### Scenario: Hypothetical score changes
- **WHEN** the student enters a valid hypothetical result
- **THEN** the projected total updates and visually distinguishes the hypothetical value from the observed value

#### Scenario: Input is outside allowed bounds
- **WHEN** a hypothetical value is negative or exceeds the student-configured bonus limit
- **THEN** the simulator rejects it with an actionable validation message

### Requirement: Exceptional grading rules are manual
The extension SHALL apply dropped assessments, bonus or extra-credit treatment, caps, and category targets only when the student explicitly configures them.

#### Scenario: No drop rule is configured
- **WHEN** a category contains a low assessment score and the student has not configured a drop rule
- **THEN** the simulator includes that assessment and does not infer that it will be dropped

### Requirement: Target calculations disclose feasibility
The extension SHALL calculate the required score across selected remaining work for a user-defined target using the completed student-configured category model and SHALL report when the target is impossible, already secured, or underdetermined.

#### Scenario: Target is impossible
- **WHEN** even the maximum allowed selected outcomes cannot reach the target
- **THEN** the simulator reports the maximum reachable result and the shortfall

### Requirement: Configuration and simulations remain local
The extension SHALL label results as unofficial, store course grading configuration only in local extension storage, and SHALL not persist scenario inputs unless the student explicitly chooses to save them.

#### Scenario: Modal closes without save
- **WHEN** the student closes an unsaved scenario and reopens the simulator
- **THEN** the grading configuration remains but temporary hypothetical inputs are cleared
