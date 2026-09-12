# Google Calendar setup

The extension can always download an `.ics` file. Direct Google Calendar sync requires a Google Cloud OAuth client configured by the maintainer.

1. Enable the Google Calendar API in the selected Google Cloud project.
2. Configure the consent screen and add `https://www.googleapis.com/auth/calendar.events`.
3. Create or reuse a public OAuth client. Do not add a client secret to this repository.
4. Copy `Chrome/config.example.js` to `Chrome/config.js` (and `Firefox/config.example.js` to `Firefox/config.js` when testing Firefox) and set the public client ID. These files are ignored and must never contain a client secret.
5. Load the unpacked Chrome extension and inspect the service-worker console. Record the exact redirect URI returned by `identity.getRedirectURL()`.
6. Load the temporary Firefox extension and record its exact `identity.getRedirectURL()` result. Firefox redirects normally use the `extensions.allizom.org` host.
7. Add both exact trailing-slash redirect origins to the same OAuth client, or use separate clients if Google Cloud policy requires it.
8. Add the Google account used for testing as a consent-screen test user when the app is not published.

The Sync Google Calendar action is the only path that opens authorization. If configuration is missing, declined, expired, or rejected, use Download `.ics` and import the file into Google Calendar manually.
