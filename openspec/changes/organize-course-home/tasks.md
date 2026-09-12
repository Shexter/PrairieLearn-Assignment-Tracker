## 1. Home-page contract

- [ ] 1.1 Capture sanitized fixtures for current and alternate course-card layouts, explicit terms, season/year labels, date ranges, missing terms, duplicate names, and dynamic additions.
- [x] 1.2 Define stable course-instance extraction and add tests proving display-name collisions and different PrairieLearn origins remain isolated.
- [x] 1.3 Implement and test a strict term parser with explicit boundaries, injected current date/time zone, and Unknown-visible fallback.

## 2. Non-destructive organization

- [ ] 2.1 Build an index of original course nodes and restoration anchors; test repeated initialization and complete teardown.
- [ ] 2.2 Inject accessible Active, Past, and Unknown sections using original nodes while preserving links, IDs, handlers, order within groups, and tracker parsing.
- [ ] 2.3 Add Past collapse/expand with visible counts, default-collapsed behavior, keyboard operation, and persistent section preference.
- [ ] 2.4 Add a debounced dynamic reconciliation path that minimally moves new/changed cards without losing focus.

## 3. Manual visibility controls

- [ ] 3.1 Add per-course Hide actions and a discoverable hidden-course manager with Restore, Show all, and confirmed Reset organization.
- [ ] 3.2 Store versioned manual preferences by origin/course-instance ID and test reload, stale/disappeared courses, corrupt storage, and reset.
- [ ] 3.3 Implement deterministic focus movement and screen-reader announcements after hide, restore, show-all, reset, and refresh.

## 4. Tracking independence and verification

- [ ] 4.1 Add integration tests proving hidden/collapsed courses remain in deadline refresh, Upcoming, Google sync, ICS export, and notification eligibility.
- [ ] 4.2 Extend Chrome/Firefox parity, syntax, and packaging checks and update user/privacy documentation.
- [ ] 4.3 Run automated tests, strict OpenSpec validation, and `git diff --check`.
- [ ] 4.4 Verify real Chrome and Firefox home pages with active/past/unknown courses, duplicate labels, reload/dynamic refresh, keyboard/focus, tracker refresh, and narrow layouts.
