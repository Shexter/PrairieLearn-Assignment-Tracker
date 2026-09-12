## Purpose

Organizes PrairieLearn course cards conservatively while keeping enrollment, tracking, and calendar behavior independent from local visual preferences.

## ADDED Requirements

### Requirement: Automatic grouping is conservative
The extension SHALL classify a course as Past only from explicit term metadata or an unambiguous recognized term ending before the current date; ambiguous courses SHALL remain Unknown and visible.

#### Scenario: Past term is explicit
- **WHEN** a course card exposes a recognized term with an end before the current date
- **THEN** it appears in the Past section

#### Scenario: Term cannot be parsed
- **WHEN** no unambiguous term or end date is observable
- **THEN** the course appears in Unknown and remains expanded by default

### Requirement: Course visibility is reversible
The extension SHALL let students hide or restore individual courses and SHALL offer Show all and Reset organization actions, with hidden content remaining in the document.

#### Scenario: Student restores a course
- **WHEN** a hidden course is selected from the hidden-course control
- **THEN** its original card and link become visible in the appropriate section

### Requirement: Preferences use stable course identity
Manual visibility preferences SHALL be scoped by PrairieLearn origin and course-instance identity rather than display name.

#### Scenario: Two courses share a label
- **WHEN** two course instances have the same visible course name and one is hidden
- **THEN** the other course remains unaffected

### Requirement: Organization does not change tracking
Hiding or collapsing a course SHALL NOT unenroll the student, modify PrairieLearn, or exclude that course from deadline refresh, calendar export, sync, or notifications.

#### Scenario: Hidden course has a deadline
- **WHEN** a visually hidden course contains an eligible deadline
- **THEN** existing tracker deadline behavior continues for that assessment

### Requirement: Group controls are accessible
Sections and controls SHALL expose names, expanded state, counts, keyboard operation, and stable focus after hide, restore, reset, or dynamic page refresh.

#### Scenario: Focused course is hidden
- **WHEN** a keyboard user hides the currently focused course
- **THEN** focus moves to the nearest relevant organization control and is not lost

