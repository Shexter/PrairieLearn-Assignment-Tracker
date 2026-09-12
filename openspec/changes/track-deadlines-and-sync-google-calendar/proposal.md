## Why

PrairieLearn exposes real assessment deadlines as access windows that say “until”, but the tracker currently mixes those deadlines with “Available” timestamps and does not reliably surface or pin preclass work. Students also need one safe, repeatable action to put every currently published PrairieLearn deadline into Google Calendar with a link back to the exact assessment.

## What Changes

- Treat only an access window with an explicit “until” end time as a task deadline; “Available” timestamps are publication metadata and are excluded from deadline, pin, Upcoming, and calendar behavior.
- Show every incomplete assessment with a real deadline in the next seven days on the PrairieLearn home Upcoming card, while retaining explicit future pins outside that window.
- Offer Pin/Unpin controls for every open, future assessment that has a real deadline and a usable assessment link, including Preclass rows.
- Add a main-page “Sync Google Calendar” action that creates or updates all future published deadline events in the user’s primary calendar and attaches the direct PrairieLearn assessment URL.
- Make repeated calendar syncs idempotent, report created/updated/skipped/failed counts, request Google authorization only from the explicit user action, and never delete calendar events automatically.
- Reuse the proven BCITSchedDownload extension flow where compatible: background-owned browser identity authorization, browser-provided redirect URIs, the minimal `calendar.events` scope, local token storage, bounded/rate-limited Calendar API calls, and an ICS fallback.
- Support both the existing Chrome and Firefox extension packages without introducing a server.

## Capabilities

### New Capabilities

- `assessment-deadlines`: Classify real PrairieLearn deadlines, render the seven-day Upcoming list, and allow deadline-bearing assessments to be pinned across assessment groups.
- `google-calendar-sync`: Authorize Google Calendar access and idempotently create or update deadline events containing direct PrairieLearn links, with bounded failure handling and an ICS fallback.

### Modified Capabilities

None. This repository has no existing OpenSpec capability specifications.

## Impact

- Changes the duplicated Chrome and Firefox background, content, popup, and manifest code paths.
- Adds Google identity and Calendar API host permissions plus a maintainer-provided OAuth client configuration; no client secret is stored in the extension.
- Changes the home-card horizon from 14 days to seven days and stops treating bare “Available” dates as due dates.
- Adds local calendar-sync metadata for deterministic event identity and diagnostics, while keeping PrairieLearn assessment data and OAuth tokens in browser-local extension storage.
- Requires parser, filtering, calendar mapping, idempotency, and browser-namespace tests plus manual Chrome and Firefox acceptance using real PrairieLearn and Google accounts.
