## Why

PrairieTest reservations and PrairieLearn workspace lifecycle state are time-sensitive but live outside the tracker’s current deadline view. Surfacing them can prevent missed exam slots and lost work, provided the extension uses only authenticated student-visible state and does not fabricate reservation or shutdown times.

## What Changes

- Discover and document the student-visible PrairieTest reservation source, authentication boundary, fields, and stability before enabling a reservation widget.
- When a supported source exists, show upcoming reservation time, location/mode, linked course or exam, status, and a direct PrairieTest link in Upcoming and the popup.
- Fail closed to the existing PrairieTest navigation link when reservation data is unavailable, ambiguous, cross-origin-blocked, or unsupported.
- Detect observable workspace lifecycle or activity state and show a session/idle warning only when a trustworthy deadline or countdown can be derived.
- When no authoritative shutdown time exists, provide a non-countdown save-work reminder based on local page inactivity and clearly label it as a tracker reminder.
- Never send keepalive traffic, defeat platform shutdown, inspect workspace file contents, or claim that work has been saved.

## Capabilities

### New Capabilities

- `prairietest-reservations`: Bounded, authenticated display of student-visible upcoming exam reservations.
- `workspace-session-safety`: Truthful workspace lifecycle warnings and local inactivity reminders without keepalive behavior.

### Modified Capabilities

None.

## Impact

- May extend matched origins/host permissions only after discovery proves a required PrairieTest origin and store-review rationale; otherwise uses existing links only.
- Changes content/background/popup modules, local reminder state, parsers, permissions documentation, privacy policy, and cross-browser tests.
- Requires sanitized live fixtures and manual acceptance with authorized test accounts; no unsupported private PrairieTest API is assumed.

