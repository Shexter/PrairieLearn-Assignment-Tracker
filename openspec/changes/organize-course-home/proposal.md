## Why

PrairieLearn home pages may retain courses from prior terms, leaving active courses mixed with historical ones. Students need a reversible local organization layer that does not unenroll them or guess incorrectly about ambiguous semester labels.

## What Changes

- Group observable course cards into Active, Past, and Unknown sections using explicit page metadata or conservative term parsing.
- Keep Active and Unknown visible by default; collapse Past courses without removing their links or data.
- Let students manually hide, show, and restore individual courses, with preferences stored by PrairieLearn origin and stable course-instance identity.
- Provide Show all and Reset organization controls plus accessible result counts and keyboard behavior.
- Keep hidden courses eligible for background deadline tracking and calendar actions unless the user separately changes tracking behavior.

## Capabilities

### New Capabilities

- `course-home-organization`: Conservative term grouping and reversible local visibility preferences for PrairieLearn course cards.

### Modified Capabilities

None.

## Impact

- Changes home-page content behavior, local preference storage, course identity/term parsing helpers, CSS, popup settings, and Chrome/Firefox parity tests.
- Adds no new permissions or enrollment mutations.
- Requires fixtures for multiple home-page layouts, missing/ambiguous terms, duplicate course labels, cross-origin PrairieLearn installations, and responsive layouts.
