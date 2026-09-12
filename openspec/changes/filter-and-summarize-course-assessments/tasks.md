## 1. Page contract and fixtures

- [ ] 1.1 Capture sanitized student course-list fixtures for assessment-set and module grouping, completed/open/closed/unavailable rows, bonus scores, missing points, and dynamic updates.
- [x] 1.2 Define supported course-page detection and row/group adapters; add fail-open tests for unknown markup.

## 2. Filtering engine

- [x] 2.1 Add pure tests for normalized search, completion detection, Active / Due Soon boundaries, composed filters, and result/group counts.
- [x] 2.2 Implement the shared row index and filter predicates without reading hidden instructor data or mutating source values.
- [x] 2.3 Implement non-destructive row/group visibility and reset behavior with a debounced MutationObserver and teardown path.

## 3. Filter interface and persistence

- [x] 3.1 Inject the search field, two toggle controls, result count, zero-state, and reset action above supported lists.
- [x] 3.2 Add keyboard, focus, screen-reader announcement, and narrow-layout behavior; verify original table semantics remain intact.
- [x] 3.3 Persist only boolean filters by origin/course-instance ID and test that search text resets across navigation.

## 4. Progress aggregation

- [x] 4.1 Add parser fixtures and pure tests for earned/possible points, percentages that cannot be converted, bonuses, unavailable rows, and exclusion reasons.
- [x] 4.2 Implement provenance-bearing aggregation of secured and observable active points with incomplete-state metadata.
- [x] 4.3 Render the summary card with exact included/excluded counts, bonus explanation, freshness, and non-official wording.

## 5. Cross-browser verification

- [x] 5.1 Mirror/shared-wire the implementation in Chrome and Firefox and extend parity/syntax checks.
- [x] 5.2 Run automated tests, strict OpenSpec validation, and `git diff --check`.
- [ ] 5.3 Verify real course pages in Chrome and Firefox for combined filters, dynamic updates, reset, persistence, summary math, keyboard/focus, and desktop/mobile layouts.

