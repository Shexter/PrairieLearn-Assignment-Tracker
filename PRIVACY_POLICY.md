# PrairieLearn Tracker Privacy Policy

Last updated: September 10, 2026

PrairieLearn Tracker is a Chrome and Firefox extension that helps users track published PrairieLearn assessment deadlines.

## Data this extension accesses

The extension accesses PrairieLearn page content on `https://*.prairielearn.com/*` to read:

- enrolled course identifiers
- assessment titles
- due dates / access windows
- score/progress status

When the user explicitly selects Google Calendar sync, the extension also sends the selected published deadline event data to Google Calendar using the user's authorization. “Available” rows are never sent.

## How data is used

Data is used only to provide the extension's single purpose:

- show upcoming, incomplete assessments
- render the extension popup dashboard
- render the homepage "Upcoming" card
- create or update tracker-owned Google Calendar deadline events with the direct PrairieLearn URL
- create a local `.ics` calendar file when the user chooses the fallback

## Data storage

Parsed course/assessment data is stored locally in the browser using `chrome.storage.local`.

## Data sharing

- No user data is sold.
- No user data is transferred to third parties unless the user explicitly selects Google Calendar sync. In that case, only published deadline event details and PrairieLearn assessment links are sent to Google's Calendar API.
- No external analytics or ad SDKs are used.

## Remote code

The extension does not use remote code. All executable JavaScript is packaged with the extension.

## Security

The extension only requests permissions needed to function:

- `storage`
- `tabs`
- `identity`
- host access to `https://*.prairielearn.com/*`, Google authorization, and Google Calendar API endpoints

OAuth access tokens are stored only in browser-local extension storage, are never logged, and are removed when Google rejects them. The extension does not automatically delete calendar events.
