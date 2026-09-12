## 1. Test and packaging foundation

- [x] 1.1 Add a minimal Node test harness and fixture helpers for extension scripts without changing runtime packaging.
- [x] 1.2 Capture sanitized assessment-table fixtures for visible “until”, access-detail end, available-only, invalid-date, completed, closed, and Preclass-link rows.
- [x] 1.3 Add checks that Chrome and Firefox shared source files stay identical and that each manifest references every required runtime file with only browser-required differences.

## 2. Deadline classification

- [x] 2.1 Add failing parser tests proving visible “until” is preferred, access-detail finite ends are the only fallback, and bare “Available” values never produce a deadline.
- [x] 2.2 Implement explicit `deadlineAt` and `deadlineSource` output in both background and page-context parsers while retaining a bounded legacy `dueAt` compatibility alias.
- [x] 2.3 Add pure, injected-time eligibility selectors for seven-day Upcoming entries, future pins, and all future calendar tasks, including exact-boundary and completion cases.
- [x] 2.4 Migrate stored snapshots through refresh/revalidation so legacy parseable “Available” timestamps cannot remain actionable deadlines.

## 3. Upcoming and pin behavior

- [x] 3.1 Change the home card from the 14-day heuristic to the tested seven-day incomplete-deadline selector while retaining valid explicit pins first.
- [x] 3.2 Require explicit future deadline provenance and a usable assessment anchor before rendering Pin/Unpin controls in every assessment group, including Preclass.
- [x] 3.3 Preserve exact assessment/instance URLs through storage, home rendering, pin toggles, and refresh merges.
- [x] 3.4 Add accessible home-card status text and responsive header actions with loading, success, partial-failure, empty, and disabled states.

## 4. Calendar event and ICS core

- [x] 4.1 Port and adapt the BCITSchedDownload Calendar REST and ICS primitives into background-owned tracker modules without modifying the BCITSchedDownload worktree.
- [x] 4.2 Implement canonical assessment identity, SHA-256-based Google event IDs and ICS UIDs, and collision/ownership validation.
- [x] 4.3 Map eligible assessments to transparent 15-minute deadline events ending at the exact deadline with course/badge/title, `source.url`, description URL, and private tracker metadata.
- [x] 4.4 Implement RFC 5545 ICS generation from the same eligible set with escaping, UTC timestamps, stable UIDs, and a bounded download payload.
- [x] 4.5 Add mapping and ICS tests for long/special-character titles, time-zone-preserving instants, exact links, stable identity, empty sets, and batch limits.

## 5. Google authorization

- [x] 5.1 Add per-browser identity and Google API permissions plus a public client-ID configuration example that fails closed when unset and contains no client secret.
- [x] 5.2 Implement browser-issued redirect URI discovery and strict supported-origin normalization without any fabricated extension-ID fallback.
- [x] 5.3 Implement user-initiated `launchWebAuthFlow` authorization with cryptographic state validation, granted-scope validation, expiry-aware local token storage, and cancellation diagnostics.
- [x] 5.4 Ensure expired or rejected tokens are removed and reported without automatically reopening interactive authorization.
- [x] 5.5 Add mocked Chrome/Firefox authorization tests for success, cancellation, missing configuration, missing identity API, redirect mismatch, state mismatch, missing scope, and expiry.

## 6. Idempotent Google Calendar synchronization

- [x] 6.1 Add background message contracts that preflight and synchronize the full eligible future-deadline set only after an explicit home-page action.
- [x] 6.2 Implement bounded, rate-limited GET plus POST/PUT upsert behavior with 404 creation, 409 race recovery, tracker-ownership checks, and no delete path.
- [x] 6.3 Return and render created, updated, unchanged, skipped, and failed counts with actionable partial-failure and reauthorization messages that never include tokens.
- [x] 6.4 Add mocked Calendar API tests for first create, repeat unchanged, source update, insert race, independent partial failure, 401/403 token invalidation, non-tracker collision, and over-limit preflight.

## 7. Main-page calendar experience

- [x] 7.1 Add a “Sync Google Calendar” button beside Refresh on the home Upcoming card, with keyboard/focus behavior and clear explanation that it syncs all future published deadlines rather than only visible seven-day rows.
- [x] 7.2 Add an explicit “Download calendar file” fallback action for missing, declined, or failed OAuth without triggering a download automatically.
- [x] 7.3 Prevent double submission, announce progress/results through an `aria-live` status, and retain useful recovery actions after failure.
- [x] 7.4 Mirror the behavior in the extension popup or link users to the main-page sync control so the two tracker surfaces do not contradict one another.

## 8. Documentation and release configuration

- [x] 8.1 Update README and privacy documentation for the seven-day deadline contract, exclusion of “Available” rows, local OAuth token handling, Google Calendar writes, ICS fallback, and non-deletion behavior.
- [x] 8.2 Add a maintainer OAuth runbook that discovers the exact Chrome and Firefox redirect URIs, registers them on the selected Google client, records test-user/verification requirements, and never commits a client secret.
- [x] 8.3 Update Chrome and Firefox versions and package validation so the source/config files required by each manifest are included in store artifacts.

## 9. Verification and acceptance

- [x] 9.1 Run the full automated suite, strict OpenSpec validation, JavaScript syntax checks, manifest/parity checks, and `git diff --check`.
- [ ] 9.2 Load the unpacked Chrome build against the real PrairieLearn account and verify CPSC 313 P2/P3 (and any other real “until” rows inside seven days) appear automatically while “Available” rows do not.
- [ ] 9.3 Verify real Chrome Preclass Pin/Unpin, exact assessment navigation, seven-day boundary behavior, disabled/loading states, and inspected desktop layout.
- [ ] 9.4 Load the temporary Firefox build and repeat deadline, pin, link, responsive layout, and namespace-regression acceptance.
- [ ] 9.5 Register both browser-issued redirect URIs and test first Google authorization, create sync, repeat no-duplicate sync, source update, cancellation, expired-token recovery, and exact PrairieLearn links using a test Google calendar/account.
- [ ] 9.6 Download and inspect the ICS fallback in a calendar client, confirming only future published deadlines, stable UIDs, exact times, and exact PrairieLearn links.
