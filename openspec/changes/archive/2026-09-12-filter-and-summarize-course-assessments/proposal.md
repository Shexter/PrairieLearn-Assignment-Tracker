## Why

PrairieLearn course assessment pages can contain dozens of old, complete, and differently grouped assessments, forcing students to repeatedly scan the full table. The tracker already parses these rows, so it can add fast local filtering and an honest progress summary without changing PrairieLearn data.

## What Changes

- Inject an accessible toolbar above the student assessment list with text search, Hide 100% Completed, and Only Active / Due Soon controls.
- Compose filters predictably, preserve PrairieLearn headings and table semantics, expose a visible result count, and provide a one-action reset.
- Define Active / Due Soon from observable access state and the tracker deadline model; do not guess when a row lacks enough data.
- Add a progress summary for secured points and currently observable active points, with explicit partial/unknown states when rows or point values cannot be parsed.
- Persist filter preferences locally per course instance while leaving the search query session-only.

## Capabilities

### New Capabilities

- `assessment-list-filtering`: Course-page search and status filters with accessible, reversible row visibility.
- `course-progress-summary`: A transparent secured-versus-observable-points summary derived from student-visible assessment rows.

### Modified Capabilities

None.

## Impact

- Changes Chrome and Firefox course-page content behavior and shared pure filtering/aggregation helpers.
- Adds per-course local preferences but no new browser permissions or network requests.
- Requires real-page fixtures for assessment-set and module grouping, unavailable/closed rows, missing scores, bonus credit, and responsive/mobile layouts.

