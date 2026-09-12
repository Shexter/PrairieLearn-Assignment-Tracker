## 1. Baseline and fixtures

- [ ] 1.1 Finish or rebase onto `track-deadlines-and-sync-google-calendar`, confirm its automated gates, and document the exact dependency revision.
- [ ] 1.2 Capture sanitized modern and legacy access-window fixtures covering early, due, multiple late, terminal, ambiguous, completed, and available-only states.
- [ ] 1.3 Add test matrices for DST transitions, exact 12/48-hour urgency boundaries, and alarm offsets around export time.

## 2. Credit-window model

- [ ] 2.1 Add failing pure tests for ordered credit transitions, current credit, next transition, malformed order, and partial fallback.
- [ ] 2.2 Implement a versioned normalized transition model in shared code and thread it through Chrome and Firefox snapshots without breaking legacy deadline reads.
- [ ] 2.3 Update refresh migration and deduplication so changed/removed windows replace stale transitions.

## 3. Calendar actions and export

- [x] 3.1 Add tested canonical event projection and bounded Google Calendar/Outlook Web URL builders with exact URL encoding.
- [x] 3.2 Add per-assessment calendar action menus to Upcoming, course rows, and popup with keyboard/focus and popup-blocker-safe behavior.
- [x] 3.3 Add all-future, current-course, and seven-day export selectors with visible scope/count confirmation and empty-result handling.
- [x] 3.4 Extend ICS generation with valid nested `VALARM` blocks, omit past triggers, preserve stable UIDs, and test import syntax.

## 4. Countdown and urgency UI

- [ ] 4.1 Implement pure relative-time formatting and urgency classification with injected `now` and completion state.
- [ ] 4.2 Render current-credit/next-transition copy plus non-color urgency labels in home, popup, and course surfaces.
- [ ] 4.3 Add one visibility-aware minute-aligned update scheduler and verify it neither leaks timers nor duplicates badges after DOM refresh.

## 5. Local notifications

- [ ] 5.1 Add versioned default-off notification preferences and settings UI with explicit permission explanation.
- [ ] 5.2 Add `alarms` and `notifications` manifest permissions to both packages and extend parity/permission documentation checks.
- [ ] 5.3 Implement deterministic alarm naming, bounded reconciliation, stale cancellation, and completion/deadline-change rescheduling.
- [ ] 5.4 Implement notification display/click navigation and tests proving payloads contain no note, answer, OAuth, or unrelated assessment data.

## 6. Verification and release

- [ ] 6.1 Update README/privacy documentation for web intents, Apple/ICS behavior, scopes, alarms, best-effort notifications, and local data.
- [ ] 6.2 Run unit, syntax, manifest/parity, strict OpenSpec, and diff checks for both packages.
- [ ] 6.3 Load unpacked Chrome and temporary Firefox; verify web intents, all ICS scopes/alarms in a calendar client, transitions, countdown boundaries, opt-in, rescheduling, notification clicks, keyboard use, and narrow layouts.

