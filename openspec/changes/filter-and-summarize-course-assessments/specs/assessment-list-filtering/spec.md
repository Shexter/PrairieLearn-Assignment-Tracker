## Purpose

Lets students reduce long PrairieLearn assessment lists using fast, reversible, accessible filters that never alter course data.

## ADDED Requirements

### Requirement: Course lists have composable filters
The extension SHALL provide case-insensitive text search, Hide 100% Completed, and Only Active / Due Soon controls, and SHALL apply all enabled filters together.

#### Scenario: Search and completion filter combine
- **WHEN** the student searches for Lab and enables Hide 100% Completed
- **THEN** only incomplete rows whose searchable label contains Lab remain visible

#### Scenario: No matches remain
- **WHEN** enabled filters match no assessment rows
- **THEN** the extension shows a zero-result message and a reset action without removing the original rows from the document

### Requirement: Group structure remains understandable
The extension SHALL hide empty assessment groups, preserve the order of visible rows, and restore original headings and rows when filters reset.

#### Scenario: A group has no matching rows
- **WHEN** every assessment within a displayed group is filtered out
- **THEN** that group heading is hidden until a matching row returns

### Requirement: Filter state is bounded and accessible
Boolean filter preferences SHALL persist per PrairieLearn origin and course instance, while the text query SHALL reset on navigation; controls SHALL be keyboard operable and announce the result count.

#### Scenario: Student returns to a course
- **WHEN** the student previously enabled Hide 100% Completed and later reloads the same course
- **THEN** that preference is restored but the prior search text is not

