## Context

See proposal.md. The home content script already locates the Courses card and parses course-instance links. Course titles and term formats vary across institutions, so display text alone is not a safe archival authority.

## Goals / Non-Goals

**Goals:** Preserve original course nodes, classify conservatively, key preferences stably, and keep visual organization independent of tracking eligibility.

**Non-Goals:** Unenrollment, deletion, course sorting by guessed importance, or disabling refresh/calendar/notifications.

## Decisions

### 1. Build an organization view around original nodes
Wrap or move original cards into injected labeled sections while recording anchors for full restoration. A debounced observer reconciles new cards. Alternative: clone cards; rejected because handlers, IDs, and accessibility relations could break.

### 2. Use a strict term parser with Unknown fallback
Prefer explicit attributes/labels. Support a tested vocabulary of season/year ranges and institution-independent ISO-like dates; classify Past only when an end boundary is certain. Current/future terms are Active.

### 3. Store overrides by origin and course-instance ID
Manual hide/show overrides beat automatic grouping but do not alter the normalized course record used by background tracking. Version storage and prune preferences only when intentionally reset, not merely when a card disappears.

### 4. Make collapse distinct from hide
Past section collapse is one reversible presentation state; individual hidden courses remain discoverable in a management control with counts.

## Risks / Trade-offs

- [Term parser misclassifies a course] → Unknown-visible default and manual restore/override.
- [Moving DOM nodes breaks upstream layout] → Fixture and real-browser checks; restore anchors on disable.
- [Dynamic refresh loses focus] → Reconcile minimally and manage focus after user actions.

## Migration Plan

Add identity/term tests, ship sections without auto-collapse, add manual controls/persistence, then enable Past collapse after real-page validation. Rollback restores nodes to recorded anchors and removes injected wrappers; tracking data is untouched.
