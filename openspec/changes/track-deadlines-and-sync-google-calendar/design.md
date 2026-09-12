## Context

See [proposal.md](proposal.md) for motivation. The extension currently ships two parallel, nearly identical source trees under `Chrome/` and `Firefox/`. Each background script fetches and parses enrolled-course assessment pages into `chrome.storage.local`; each content script repeats the parser for the authenticated page-context fallback and injects the home card and assessment-page Pin controls.

The current parser assigns `dueAt` from any parsed access-window end, then falls back to visible text containing `until`. Bare `Available` values already fail the fallback, but the model does not record why a date exists and it prefers the latest popover end over the student-facing “until” summary. The home UI applies a 14-day incomplete filter, while pins can retain entries outside that window.

BCITSchedDownload contains a reusable cross-browser Google Calendar implementation and a still-active Firefox-port OpenSpec change. Its reusable architecture is background-owned `identity.launchWebAuthFlow`, browser-issued redirect URIs, `calendar.events`, local tokens, REST writes, bounded batches, and ICS generation. Its current implementation uses a legacy implicit token flow, fabricates redirect URIs in fallback paths, omits OAuth `state` verification, stores no expiry, and inserts without stable event identity; those parts must not be copied unchanged. The BCITSchedDownload worktree is dirty and is read-only input to this change.

Current Google guidance still documents the implicit token response but strongly discourages direct implicit integrations for new browser applications. Chrome separately recommends its Identity API and manifest OAuth configuration. A single no-server flow must also work in Firefox, where the Chrome token broker is unavailable. This design therefore keeps the already-proven `launchWebAuthFlow` portability boundary for the first implementation, adds the missing CSRF and expiry controls, requests authorization only on a click, and leaves a future PKCE migration possible behind the same adapter.

## Goals / Non-Goals

**Goals:**

- Make deadline classification explicit and testable instead of inferring that every availability date is due work.
- Keep Chrome and Firefox behavior byte-for-byte equivalent where their manifests do not require differences.
- Make Google synchronization safe to repeat and useful even when titles, URLs, or deadlines change.
- Preserve local-first storage and avoid any extension-operated server.
- Provide a functional ICS escape hatch before OAuth release configuration is complete.

**Non-Goals:**

- Selecting a secondary Google calendar, synchronizing attendees, or reading unrelated calendar data.
- Automatically deleting, moving, or cancelling calendar events.
- Background/periodic calendar writes without a user action.
- Treating “Available” timestamps as reminders or predicting unpublished deadlines.
- Refactoring the whole extension into a bundled framework.

## Decisions

### 1. Represent deadline provenance explicitly

Parsing will produce `deadlineAt` plus `deadlineSource` (`visible_until` or `access_window_end`) and will retain `dueAt` as a compatibility alias during migration. The parser first parses the student-facing visible `until` summary; only if that is absent does it inspect finite access-window ends. A bare `Available` value produces no deadline. Filtering, pinning, and calendar code will require the explicit deadline classification, not merely a parseable date-shaped string.

Alternative considered: keep `dueAt` nullable and change only the fallback regex. Rejected because downstream code cannot distinguish a verified “until” deadline from an accidentally populated availability date or future parser regression.

### 2. Separate the seven-day display set from the calendar set

One pure selector returns the home set: explicitly pinned future deadlines first, then incomplete unpinned deadlines between now and `now + 7 days`, inclusive. A second pure selector returns all future open deadline-bearing assessments with usable absolute URLs for calendar sync, regardless of score or seven-day visibility. Both selectors deduplicate by the existing assessment identity.

Alternative considered: sync only what is visible in Upcoming. Rejected because the user asked to place every published task in Calendar, not only the next week.

### 3. Keep pin controls strict and group-agnostic

The existing assessment-row traversal already visits every group, including Preclass. It will render a control only when the row has an explicit future deadline and an actual anchor URL. Pin payloads will carry deadline provenance so stale or available-only entries cannot be introduced through message calls.

Alternative considered: allow pins without deadlines as permanent reminders. Rejected because it would reintroduce unpublished “Available” rows and contradict the requested task definition.

### 4. Put calendar orchestration in the background context

The content script will send `PL_SYNC_GOOGLE_CALENDAR` and `PL_EXPORT_CALENDAR_ICS` messages and render progress in an `aria-live` status line. The background context will own OAuth, token storage, event mapping, and Google API calls. Chrome will load a calendar module from its service worker; Firefox will list the same module before the background script. A parity check will enforce identical shared module and content behavior across the two package directories.

Alternative considered: copy BCITSchedDownload’s calendar code into the PrairieLearn content script. Rejected because it broadens token exposure to every matched PrairieLearn page and duplicates orchestration across page instances.

### 5. Reuse the BCIT OAuth boundary with stronger response validation

The build uses the same maintainer-provided public Google OAuth client ID pattern and minimal `https://www.googleapis.com/auth/calendar.events` scope. On the explicit sync click, the background asks `identity.getRedirectURL()`, normalizes only supported browser-returned HTTPS origins, creates a cryptographically random `state`, and calls `identity.launchWebAuthFlow({ interactive: true })`. It accepts an access token only when the returned origin and `state` both match, the required scope was granted, and an expiry is present. Token records contain the token and `expiresAt` only in extension-local storage; logs and UI never include the token.

The maintainer must add the tracker Chrome and Firefox redirect URIs to the existing Google OAuth web client (or provide a separate tracker client) and keep the public client ID in package configuration. No OAuth client secret is used. Missing configuration fails before navigation and exposes the ICS option.

Alternative considered: Chrome `identity.getAuthToken`. It is simpler and Google-recommended for Chrome, but requires a Chrome Extension OAuth client and does not supply the same Firefox path. A later browser-specific adapter can adopt it without changing the sync contract. Alternative considered: copy the implicit flow unchanged. Rejected because it lacks `state`, expiry, and strict redirect validation.

### 6. Use deterministic tracker-owned Google event IDs

For each assessment, compute SHA-256 over a versioned canonical identity containing PrairieLearn origin, course instance ID, and normalized assessment path. Encode the digest as lowercase hexadecimal with a short version prefix; those characters satisfy Google Calendar’s event ID alphabet. Use `GET /calendars/primary/events/{id}` to classify absent versus existing, then `POST` with the ID or `PUT` the full tracker-owned event. A 409 insert race falls back to GET/PUT. Private extended properties record the tracker version and assessment identity for diagnostics.

Events are transparent 15-minute deadline blocks ending at `deadlineAt`, titled `Due: <course> · <badge> <title>`. The description includes the full PrairieLearn URL and the event `source.url` uses the same absolute URL. Times are sent as absolute RFC 3339 instants so Google renders them in the user’s calendar time zone.

Alternative considered: always insert and remember Google-generated IDs locally. Rejected because clearing extension storage would create duplicates and cross-device reruns would lose identity. Alternative considered: delete events no longer present. Rejected as an unsafe destructive inference from a scrape.

### 7. Share one eligibility and identity pipeline with ICS fallback

ICS generation uses the same calendar selector, canonical identity, title, exact deadline, and URL. Each event gets a stable UID derived from the canonical digest and uses UTC timestamps. The background returns a calendar string to the content script, which triggers a user-selected download. OAuth failure does not silently download; the UI presents the explicit fallback action.

Alternative considered: no fallback. Rejected because OAuth client registration and store review are external release gates, while standards-based export can remain functional and testable.

### 8. Add a lightweight test harness before changing duplicated production files

Add a Node-based test setup that exercises parser fixtures representing visible “until”, popover ends, available-only rows, invalid dates, and Preclass anchors. Pure deadline selectors and calendar event mapping will use injected `now` values. Google calls will be tested against mocked fetch/identity/storage surfaces for create, update, unchanged, 401, 404, 409, partial failure, batch limit, and state mismatch. A namespace/parity check will cover both manifests and duplicated files.

Alternative considered: manual-only verification. Rejected because deadline-year inference, OAuth response handling, and idempotency are too risky to validate only through live clicks.

## Risks / Trade-offs

- [Google OAuth client and redirect registration are external release state] → Reuse the existing client only after adding both tracker-issued redirect URIs; fail closed with exact setup diagnostics and keep ICS available.
- [The portable implicit flow is legacy] → Limit token lifetime, validate state/origin/scope, store locally, prompt only on click, and isolate the flow behind a replaceable background adapter.
- [PrairieLearn HTML can change] → Preserve page-context fallback, use fixtures taken from current semantic attributes, require explicit deadline provenance, and fail closed on ambiguous timestamps.
- [A deterministic event ID could collide] → Use a full SHA-256-derived ID with a version prefix and verify tracker-owned extended properties before updating.
- [Updating an event could overwrite a user’s edits] → Update only deterministic tracker-owned events and only tracker-managed fields; document that these events are regenerated from PrairieLearn on sync.
- [Two package trees can drift] → Keep shared files identical and verify parity mechanically in tests and packaging checks.
- [Large course sets can hit quota or create unexpected volume] → Preflight the batch limit, rate-limit writes, and show the exact eligible count before/while synchronizing.

## Migration Plan

1. Add failing parser, selector, calendar mapping, OAuth-response, idempotency, and parity tests.
2. Introduce explicit deadline provenance while reading legacy stored `dueAt` snapshots only when they can be revalidated from source availability/access-window data; refresh replaces snapshots in place.
3. Change the home selector to seven days and tighten Pin eligibility in both browsers.
4. Add calendar/ICS modules, message contracts, manifests, public configuration example, and home-card actions in both browsers.
5. Load unpacked Chrome and temporary Firefox builds, record each browser-issued redirect URI, and register both on the chosen Google OAuth client.
6. Verify real PrairieLearn refresh/pin/Upcoming behavior, then test Google create and repeat-update with a non-production test calendar/account before store packaging.
7. Roll back by removing the calendar UI/module/permissions and restoring the prior selector; stored tracker-owned calendar events remain untouched and can be removed manually by the user.

## Open Questions

- Whether the existing BCITSchedDownload Google OAuth client is approved for reuse under the PrairieLearn Tracker product name is a maintainer/Google-console decision. The implementation and ICS fallback do not depend on that choice; only the configured public client ID and registered redirect URIs change.
