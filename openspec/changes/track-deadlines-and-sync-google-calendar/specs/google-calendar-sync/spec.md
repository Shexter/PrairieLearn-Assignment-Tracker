## Purpose

Defines a user-initiated, cross-browser Google Calendar synchronization flow for published PrairieLearn deadlines with stable identity and direct assessment links.

## ADDED Requirements

### Requirement: Calendar sync is explicit and consented
The extension SHALL start Google authorization and calendar writes only after the user selects the main-page Sync Google Calendar action. It SHALL request only the Google Calendar events scope needed to create and update events.

#### Scenario: First sync requires authorization
- **WHEN** the user selects Sync Google Calendar without a valid stored token
- **THEN** the browser opens an interactive Google authorization flow for the calendar events scope
- **AND** no calendar request is sent unless authorization succeeds

#### Scenario: User declines authorization
- **WHEN** the user cancels or denies Google authorization
- **THEN** the extension writes no calendar events
- **AND** the home card explains that authorization was not granted and offers calendar-file export as an alternative

#### Scenario: Tracker loads normally
- **WHEN** the user opens PrairieLearn without selecting Sync Google Calendar
- **THEN** the extension does not open an authorization prompt or write to Google Calendar

### Requirement: Calendar sync includes every future published deadline
The extension SHALL synchronize every non-past assessment across tracked courses that has a real deadline and a usable PrairieLearn assessment URL, including assessments outside the seven-day Upcoming horizon. It SHALL exclude available-only, closed, past-due, and unlinkable assessments.

#### Scenario: Published task outside Upcoming
- **WHEN** an assessment has a real deadline more than seven days away and a usable URL
- **THEN** calendar sync includes it even though it is not automatically visible in Upcoming

#### Scenario: Completed future task
- **WHEN** an assessment is already 100% complete but its real deadline is still in the future
- **THEN** calendar sync includes or updates its event so the calendar remains a deadline record

#### Scenario: Unpublished assessment
- **WHEN** an assessment has only an “Available” timestamp or lacks a usable assessment URL
- **THEN** calendar sync skips it and does not invent a deadline or destination

### Requirement: Calendar events preserve the deadline and direct link
Each synchronized event SHALL identify the course and assessment, represent the exact parsed deadline, and attach the absolute PrairieLearn assessment URL in a link-capable event field and in the description.

#### Scenario: Event content is created
- **WHEN** a deadline-bearing assessment is synchronized
- **THEN** its event title identifies the course, badge when present, and assessment title
- **AND** its event time is anchored to the exact deadline
- **AND** its PrairieLearn URL opens the exact source assessment

#### Scenario: Browser locale differs from PrairieLearn locale
- **WHEN** a deadline has already been normalized to an absolute timestamp
- **THEN** the event preserves that instant without hard-coding a different course time zone

### Requirement: Repeated sync creates no duplicates
The extension SHALL derive a stable Google Calendar event identity from the PrairieLearn course and assessment identity. A later sync SHALL update the existing matching event or create it if absent, without creating a duplicate.

#### Scenario: First synchronization
- **WHEN** no event exists for an eligible assessment
- **THEN** the extension creates one event with the stable identity

#### Scenario: Deadline or title changes
- **WHEN** an event exists and the source assessment title, deadline, or URL has changed
- **THEN** the extension updates that same event

#### Scenario: Sync is repeated without changes
- **WHEN** the user synchronizes the same unchanged assessment again
- **THEN** no duplicate event is created

### Requirement: Sync never deletes calendar events automatically
The extension SHALL limit synchronization to creating and updating tracker-owned events. It SHALL NOT delete an event because an assessment disappeared, became unpublished, was completed, or is no longer returned by PrairieLearn.

#### Scenario: Previously synced task is absent
- **WHEN** a previously synchronized assessment is absent from the latest PrairieLearn snapshot
- **THEN** the extension leaves its Google Calendar event unchanged

### Requirement: Sync is bounded and reports its outcome
The extension SHALL bound each synchronization batch, rate-limit Calendar API writes, continue across independent event failures where safe, and report created, updated, unchanged, skipped, and failed counts without exposing access tokens.

#### Scenario: Mixed synchronization result
- **WHEN** some eligible events succeed and another event fails
- **THEN** the home card reports the partial result and a useful recovery message
- **AND** successful events remain synchronized

#### Scenario: Authorization token expires
- **WHEN** Google rejects an expired or invalid token
- **THEN** the extension removes the invalid local token and asks the user to run the explicit sync action again
- **AND** it does not launch an unexpected authorization prompt in the background

#### Scenario: Batch exceeds safety limit
- **WHEN** the eligible event count exceeds the configured synchronization limit
- **THEN** the extension stops before calendar writes and explains how many events exceeded the limit

### Requirement: Calendar-file fallback preserves the same task contract
The extension SHALL offer an ICS download for the same eligible assessment set when Google OAuth is unavailable, unconfigured, or declined. Each calendar-file event SHALL have a stable UID, exact deadline, and direct PrairieLearn URL.

#### Scenario: OAuth client is not configured
- **WHEN** the user selects Sync Google Calendar and the build has no valid Google OAuth client ID
- **THEN** the extension explains the configuration problem without opening a broken OAuth flow
- **AND** offers to download the eligible deadlines as an ICS file

#### Scenario: ICS file is generated
- **WHEN** the user chooses the calendar-file fallback
- **THEN** the downloaded file contains only eligible future published deadlines with stable UIDs and direct PrairieLearn links

### Requirement: Chrome and Firefox use their browser-issued redirect identities
The extension SHALL obtain an OAuth redirect URI from the running browser identity API, validate and normalize that returned URI, and SHALL NOT fabricate a redirect host from an assumed extension ID.

#### Scenario: Chrome authorization
- **WHEN** authorization runs in Chrome
- **THEN** the exact normalized redirect origin returned by Chrome is used and must be registered on the configured OAuth client

#### Scenario: Firefox authorization
- **WHEN** authorization runs in Firefox
- **THEN** the exact normalized redirect origin returned by Firefox is used and must be registered on the configured OAuth client

#### Scenario: OAuth state mismatch
- **WHEN** the authorization response does not contain the random state value sent by the extension
- **THEN** the extension rejects the response and stores no token

