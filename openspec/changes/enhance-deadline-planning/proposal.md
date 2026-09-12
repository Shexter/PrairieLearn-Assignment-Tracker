## Why

The tracker now recognizes published deadlines and can sync them to Google Calendar, but students still lack permission-free calendar actions, meaningful access-window context, live urgency, and opt-in reminders. This change completes the deadline experience without making Google OAuth a prerequisite.

## What Changes

- Add one-click Google Calendar and Outlook Web event intents for each eligible assessment; keep standards-based ICS as the Apple Calendar and other calendar-client path.
- Extend ICS export with user-selectable all-future, current-course, and next-seven-days scopes plus default 24-hour and 2-hour `VALARM` reminders.
- Preserve the full ordered PrairieLearn credit-window timeline and identify the current and next transition, rather than reducing an assessment to one final timestamp.
- Add accessible live countdown and urgency badges whose state accounts for deadline distance and completion.
- Add separately opt-in 24-hour and 6-hour desktop notifications for unfinished work, scheduled locally with browser alarms and deduplicated across refreshes.
- Keep existing explicit Google Calendar sync behavior intact and make this change depend on completion of `track-deadlines-and-sync-google-calendar`.

## Capabilities

### New Capabilities

- `deadline-actions`: Permission-free per-assessment calendar intents and scoped ICS exports with alarms.
- `deadline-awareness`: Multi-stage credit-window messaging, relative countdowns, and urgency classification.
- `deadline-notifications`: Local opt-in alarm scheduling and desktop deadline notifications.

### Modified Capabilities

None. The related `assessment-deadlines` and `google-calendar-sync` specs belong to an active, not-yet-archived change, so this proposal declares additive capabilities and an explicit dependency instead of pretending main specs already exist.

## Impact

- Extends the shared deadline model, Chrome/Firefox background scripts, home content scripts, popup UI, manifests, local preferences, ICS generator, and tests.
- Adds browser `alarms` and `notifications` permissions only when the notification feature is implemented; calendar web intents require no OAuth or new host access.
- Requires fixture coverage for modern and legacy PrairieLearn access-window markup, DST-safe time handling, notification rescheduling, and Chrome/Firefox parity.

