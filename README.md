# Daily Coach

A personal coaching email and web archive for cycling, running and strength training. The Performance Desk design uses a charcoal background, lime accents, a coaching decision, training history, a next-session plan, and inspectable sources.

## Run the app

Use Node.js 22.12 or newer.

```sh
npm install
npm run dev
```

Open `?preview=1` for clearly labelled illustrative content. The default view opens reports from the private links in coaching emails, or reports previously opened on the same device.

The minimal login form also accepts the complete private email link, which loads its report on a new device. An access key alone unlocks reports already stored in that browser. Opening an older email selects that report rather than the newest saved date. New revisions replace the same date in browser history.

Daily reports show the planned session before the charts. The header keeps Lock available and adds older/newer report controls when multiple reports are saved. Activity history supports date windows, sport, search, pagination and a separate toggle for excluded recordings. Trends compare the previous seven completed calendar days with the preceding seven, require complete coverage for percentage changes, and support sport-specific charts. Missing coverage is unavailable rather than a zero-training day.

Chart code loads separately after opening a report, so the locked login does not download the chart library on its initial load.

## Build and verify

```sh
npm test
npm run build:github
```

The `docs/` directory is ready for GitHub Pages. Configure Pages to deploy `main` from `/docs`.

## Prepare a report

1. Read the owner's current authorized source data.
2. Write a report matching `src/demo.js` into `.local/report.private.json`. Supply real per-field sources, a verified date window, raw activities, coaching rationale, session steps and data-quality notes.
3. Put the private configuration in `.local/config.private.json`, using `archiveKey` as a cryptographically random 32-byte base64url string, plus `siteUrl`, `email` and `repository`.
4. Run `node scripts/publish-report.mjs .local/report.private.json`.
5. Keep all personal report files in `.local/`. Publish only the viewer code, illustrative data and static assets in `docs/`. Report generation does not require a public repository update.
6. Verify that the private link decrypts to the intended report, then deliver the prepared MIME payload from `.local/email.private.json` through the authorized email connector. Search sent mail for the subject and date before sending.

The script preserves local report history, replaces a report for the same date, authenticates compressed encrypted data with AES-256-GCM, writes files atomically, and prepares both HTML and plain-text email. Each email link carries its single encrypted report and access key in the URL fragment. Private configuration and generated email stay in `.local/`. Keep the archive key in a private credential store with a backup. Daily sending and source retrieval require an authorized external scheduler and connected data sources.

## Sources and interpretation

Use Garmin Connect for device and recovery context, Intervals.icu for its own activity and load calculations, and Strava for cross-checks and session context. Follow each provider's current API permissions and data terms. The current report collection path reads the owner's signed-in browser. The Garmin Personal API offers an independent integration path after owner key setup.

Duplicate activities merge through shared provider IDs or a conservative match on sport, start time, duration and distance. Missing values stay unavailable. Non-training recordings remain available for review and are excluded from training totals. Every coaching decision should identify evidence, uncertainty and a practical adjustment rule.

## Private access

The public repository includes source code, illustrative data and viewer assets only. Personal readings, encrypted reports and archive keys belong in private files. Each report and its key travel in the private link's URL fragment, which browsers omit from HTTP requests. After unlocking, the app keeps the key in session storage, saves the encrypted report in browser-local storage, and removes the fragment from the visible address. A person with the full private link can read that report. Use the Lock archive control to clear the current browser session.

The public viewer and code remain discoverable. The archive lists reports opened in the current browser, so open a report's email link when using a new device. Browser storage can be cleared; retain the original emails. Private links are bearer access, rather than account-based access control.

## License

MIT covers the application source. Personal report content remains the owner's private data.
