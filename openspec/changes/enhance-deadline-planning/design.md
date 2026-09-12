## Context

See proposal.md. This change builds on the active `track-deadlines-and-sync-google-calendar` model and must not land before that change's deadline provenance, stable identity, ICS, and Chrome/Firefox parity work. Modern PrairieLearn access control can expose early, due, late, and after-deadline credit transitions; current tracker code retains access windows but selects only one end.

## Goals / Non-Goals

**Goals:** Share one normalized transition model across badges, intents, ICS, and alarms; make all time behavior deterministic under injected clocks; keep reminders local and opt-in.

**Non-Goals:** Background Google Calendar sync, recurring events, arbitrary reminder editors, automatic Apple Calendar insertion, or inferred deadlines.

## Decisions

### 1. Normalize an ordered credit timeline before presentation
Add a pure model containing transition time, credit, source, and terminal behavior. Reject non-finite, non-chronological, or unassociated values while retaining a simpler verified deadline. Alternative: parse labels independently in each UI; rejected because states would disagree.

### 2. Use provider URL adapters and one canonical event projection
Google and Outlook adapters receive the same title/time/link projection as ICS. Use a 15-minute transparent deadline block and URL length limits. Apple/system calendars use ICS because no universal Apple web compose contract exists.

### 3. Keep notification ownership in the background
Store a versioned preference plus deterministic alarm names derived from assessment identity, deadline, and offset. Reconciliation cancels orphaned alarms before scheduling bounded future ones. Content scripts only render settings/status.

### 4. Update countdowns on a shared cadence
Render from absolute instants, align updates to minute boundaries, pause when hidden, and refresh immediately on visibility change. Urgency is a pure classification, never CSS-only meaning.

## Risks / Trade-offs

- [PrairieLearn markup omits full credit timelines] → Fail closed to verified deadline-only display and fixture every supported shape.
- [Browser alarm delivery is not exact] → Describe reminders as best-effort and calculate displayed remaining time when delivered.
- [Notification permission broadens review surface] → Request only after opt-in and document local payloads.
- [DST or locale parsing drifts] → Normalize once to absolute instants and test DST boundaries with an injected zone/clock.

## Migration Plan

Land after the baseline calendar change; add the versioned transition model compatibly; ship web intents and scoped ICS first; then enable countdowns; finally request alarm/notification permissions and expose opt-in. Rollback removes UI and permissions, cancels tracker-owned alarms, and preserves deadline snapshots.

