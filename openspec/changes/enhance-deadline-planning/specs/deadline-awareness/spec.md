## Purpose

Explains PrairieLearn credit-window transitions and deadline urgency without collapsing multi-stage access rules into a misleading single due state.

## ADDED Requirements

### Requirement: Credit windows are presented as an ordered timeline
The extension SHALL preserve every student-visible finite deadline/credit transition in chronological order and identify the current credit and next transition when both are observable.

#### Scenario: Late-credit window follows full credit
- **WHEN** an assessment is worth 100% until October 10 and 80% until October 14
- **THEN** before October 10 the extension states that 100% credit ends then and drops to 80% afterward

#### Scenario: Timeline is ambiguous
- **WHEN** visible markup cannot associate a credit value with a deadline
- **THEN** the extension shows only the verified deadline and does not invent a credit transition

### Requirement: Countdown badges update accessibly
The extension SHALL show a relative countdown for the next actionable transition, update it without a page reload, and expose equivalent non-color text to assistive technology.

#### Scenario: Countdown crosses a unit boundary
- **WHEN** a displayed deadline changes from 4 hours remaining to 3 hours 59 minutes
- **THEN** the visible and accessible countdown update without duplicating page elements

### Requirement: Urgency accounts for time and completion
The extension SHALL classify incomplete work under 12 hours as critical, incomplete work from 12 through 48 hours as warning, and work beyond 48 hours or complete work as non-urgent.

#### Scenario: Near deadline and incomplete
- **WHEN** a verified transition is 8 hours away and the observed score is below 100%
- **THEN** the assessment receives critical styling and text

#### Scenario: Completed assessment
- **WHEN** the observed score is 100%
- **THEN** the assessment is non-urgent even when its deadline is near

