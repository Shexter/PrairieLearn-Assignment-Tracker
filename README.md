# PrairieLearn Tracker (Chrome / Firefox Extension)

Track published PrairieLearn assessment deadlines directly on your PrairieLearn home page and sync them to Google Calendar.

## Screenshot

![PrairieLearn Tracker screenshot](Sample%20Screenshot.png)


Chrome: https://chromewebstore.google.com/detail/prairielearn-tracker/pknbbjomfgmhgeapppniakidbcmephob?authuser=0&hl=en 
Firefox: https://addons.mozilla.org/en-US/firefox/addon/prairielearn-tracker/ 

## What this extension does

- Adds an **Upcoming** section above your **Courses** card on `https://*.prairielearn.com/`
- Shows incomplete assessments with an explicit **“until …” deadline** in the next **7 days**
- Excludes **“Available …”** rows because they are unpublished, not due dates
- Lets you pin future deadline-bearing assessments from every group, including Preclass
- Syncs every future published deadline to Google Calendar with the direct PrairieLearn link
- Offers permission-free 1-click Google Calendar, Outlook Web, and Apple/system (.ics) action menus for individual assessment deadlines
- Offers scoped `.ics` downloads (all future deadlines, current course, or next 7 days) with embedded RFC 5545 VALARM display reminders
- Adds an accessible assessment filter toolbar on course pages with search, Hide 100% Completed, and Only Active / Due Soon controls
- Keeps the list updated automatically when you open the PrairieLearn home page
- Includes a popup dashboard if you want a full list view
- Copies an assessment's questions to the clipboard as one plain-text transcript
- Copies the question you are looking at to the clipboard as a PNG image


## First run

1. Log in to PrairieLearn
2. Open your home page: `https://us.prairielearn.com/` (or your PrairieLearn subdomain home)
3. Wait a few seconds for the **Upcoming** card to populate

## Daily use

- Just open PrairieLearn home and the card refreshes automatically.
- You can still open the extension popup for a broader dashboard view.
- The card’s **Refresh** button is available if you want to force an update immediately.
- **Sync Google Calendar** updates tracker-owned events in your primary Google calendar without deleting events.
- **Download .ics** creates a standards-based calendar file for manual import.

### Copy Questions

On an assessment you have open, **Copy Questions** puts every question in that
assessment on the clipboard as plain text, with the group headings preserved and
the questions numbered straight through.

It takes **two clicks, by design**. The first click fetches the questions and the
button changes to **Copy to clipboard**; the second click performs the copy.
Browsers only allow a clipboard write during a fresh click, and that permission
has expired by the time a long assessment finishes downloading — so the write
gets its own click. A question that cannot be read is marked unavailable in the
transcript rather than failing the whole export, and if the copy is refused the
transcript is kept so you can click again.

### Screenshot

On a question page, **Screenshot** copies the question panel to the clipboard as
a PNG — the whole panel, even when it is taller than the window. The control is
left out of its own image. If the browser cannot accept an image on the
clipboard, or the capture comes out blank, it says so instead of copying a
broken image.

## Browser support

| | Chrome | Firefox |
| --- | --- | --- |
| Deadlines, pins, filters | yes | yes |
| Google Calendar sync, `.ics` export | yes | yes |
| Copy Questions | yes | yes |
| Screenshot | yes | **Firefox 127 or newer** |

Firefox gained clipboard image writes in version 127. On anything older the
Screenshot control reports that the browser cannot put an image on the
clipboard; every other feature works as normal.

Both builds ship the same files — `npm run check:parity` fails if they drift.

## Troubleshooting

- If no items appear:
  1. Confirm you are logged in to PrairieLearn
  2. Open the PrairieLearn home page (not just a course page)
  3. Wait a few seconds, then reload the page once
- If data seems stale:
  1. Click the card **Refresh** button

## Privacy

- Data is stored locally in your browser (`chrome.storage.local`)
- PrairieLearn data and OAuth tokens stay in browser-local extension storage.
- Google Calendar is contacted only after an explicit sync action, using the `calendar.events` scope.
- The extension requests PrairieLearn, Google authorization, and Google Calendar API host access; no external application server is required.

See [OAUTH_SETUP.md](OAUTH_SETUP.md) before enabling direct Google sync in a local or store build.

