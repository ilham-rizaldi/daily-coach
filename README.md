# Daily Coach

A personal coaching email and web archive for cycling, running and strength training. Reports run on the owner's command. The Performance Desk design uses a charcoal background, lime accents, a coaching decision, training history, a next-session plan, and inspectable sources.

## Reporting protocol

Follow [REPORTING_PROTOCOL.md](REPORTING_PROTOCOL.md) for a requested run, source verification, coaching depth, validation and email delivery. Run only when the owner asks. Do not install or enable recurring schedules, background refreshes, automatic email, or repository-triggered report runs.

The owner's current request determines whether to capture and analyze data, prepare a private report, or also email it. A request invoking the already authorized full report-and-email protocol authorizes that delivery without a second confirmation. A preview, code change or data-access check does not itself authorize email. Keep the recipient in private configuration rather than public source.

## Run the app

Use Node.js 22.12 or newer.

```sh
npm install
npm run dev
```

Open `?preview=1` for clearly labelled illustrative content. The default view opens reports from the private links in coaching emails, or reports previously opened on the same device.

The minimal login form also accepts the complete private email link, which loads its report on a new device. An access key alone unlocks reports already stored in that browser. Opening an older email selects that report rather than the newest saved date. New revisions replace the same date in browser history.

Daily reports begin with a compact body dashboard: readiness/Body Battery score meters, an HRV baseline band, sleep-stage composition, RHR, recovery, vitals, Garmin load history, separate Intervals CTL/ATL/Form, VO₂ max and heat acclimation. Only captured series produce history plots. The HRV baseline marker uses the seven-day mean, while overnight HRV remains a separate readout. Awake time stays separate from the sleep-stage total. Missing data uses a dash.

The interface uses concise English training terms and Garmin-inspired metric/status colors. Readiness categories follow [Garmin's published color mapping](https://www8.garmin.com/manuals-apac/webhelp/forerunner265series/EN-SG/GUID-35D1273C-4F9C-4029-9B8F-F997F4D7C3A8-7793.html). Reference consolidates the searchable glossary, color key, calculation methods, calibration, field verification and per-metric provenance. Capture/measurement/compilation dates remain separate there; a load-history supplement does not refresh wellness. Recovery time remains a captured snapshot.

The session plan uses a proportional phase timeline with optional detail. Forecasts show current/rest/session comparisons and range whiskers, retaining provider labels and estimate states. The header keeps Lock available and adds older/newer report controls. Activity history defaults to all captured sessions and supports date windows, sport, search, pagination and excluded recordings. Trends include matched-period bars, duration charts and sport composition. Weekly changes require complete coverage; missing coverage is not a zero-training day.

Chart code loads separately after opening a report, so the locked login does not download the chart library on its initial load.

## Next-day training forecast

"Tomorrow if I rest" shows the observed Garmin ratio beside an empirical no-new-training estimate for acute load, chronic load and ratio. It needs `garminLoadHistory.rows` with dated `acute` and `chronic` values, a current anchor matching the report and complete activity coverage. At least three consecutive historical transitions ending on completed days with no recorded activity must qualify. All recordings, including excluded non-training records, prevent that date being treated as a no-new-load day. The current partial day is excluded.

The estimate applies paired historical acute/chronic change factors to the current anchor. A representative pair nearest the median projected ratio supplies a consistent numerator and denominator. The displayed spread is the minimum and maximum of these scenarios, not a confidence interval. Current states outside the historical anchor range are flagged as extrapolation. Confidence remains low: activity ages, unsynced workouts and Garmin's undisclosed weights can differ. Both loads change, so rest does not guarantee a lower ratio. Reports without this source history cannot calculate a numeric Garmin estimate; refresh the private report data rather than substituting assumed decay percentages.

Open Plan → Next-day load simulator to choose rest, cycling, running or strength, duration and intended effort. Expected load is a read-only result, calculated automatically from the previous 42 completed days of same-sport load/hour observations. Effort changes both the estimate and the recovery check. Easy uses the lower-quartile rate, moderate the median and hard the upper-quartile rate. Duration in hours multiplies that selected rate.

These effort bands are empirical relative scenarios, not measured session RPE or validated physiological zones. Easy variation uses minimum-to-median rates; moderate uses the middle 50%; hard uses median-to-maximum. The ranges overlap and are not confidence intervals. Equal or sparse source rates cannot establish precise effort differences. Missing history remains unavailable. Durations outside the observed range are flagged as extrapolation. Non-training records, missing load and sessions below 15 minutes are excluded; recorded timers include rests and pauses.

The forecast advances a dated Intervals fitness/fatigue anchor once using exponential daily weighting. A remaining-today session is selected by activity, duration and effort, with its load calculated automatically. It adds only its weighted delta, avoiding a second decay of the already-updated current-day anchor. The displayed projection range varies tomorrow’s load while holding today’s estimate at its central value. Fitness/fatigue time constants start at assumed 42/7 days and can be edited. Captured activity-type contribution settings take precedence; missing weights are explicitly assumed. Empty duration inputs stay unavailable.

Outputs are estimated end-of-next-day fitness, fatigue, raw form and a **model ATL/CTL ratio**, with a rest comparison. This ratio does not predict Garmin's proprietary acute/chronic load ratio. The Garmin rest estimate remains a separate empirical analogy. The planner does not forecast aerobic/anaerobic load-focus categories, future readiness, performance gains or safety. Recovery context can conflict with a numerical load scenario. Historical reports forecast the day after their own snapshot, not the user's current tomorrow. Nothing is added to the source calendar, sent by email or stored outside the current page.

Method references: [Intervals exponential calculation](https://forum.intervals.icu/t/change-fatigue-atl-and-fitness-ctl-factors/300?page=2), [activity-type contributions](https://forum.intervals.icu/t/fitness-and-fatigue-for-different-activity-types/652), [Garmin load definitions](https://support.garmin.com/en-SG/?faq=SEkNpdGyhR917js0qQL3Q6).

## Build and verify

```sh
npm test
npm run build:github
```

The `docs/` directory is ready for GitHub Pages. Configure Pages to deploy `main` from `/docs`.

## Prepare a report

1. Start from the owner's current command and read the authorized source data. Verify each source's signed-in state, capture time, latest activity and available date range; record any source that could not be read.
2. Write a report matching `src/demo.js` into `.local/report.private.json`. Supply real per-field sources, a verified date window, raw activities, coaching rationale, session steps and data-quality notes.
3. Put the private configuration in `.local/config.private.json`, using `archiveKey` as a cryptographically random 32-byte base64url string, plus `siteUrl`, `email` and `repository`.
4. Run `npm run report -- .local/report.private.json` to prepare the encrypted report and email files. This command does not retrieve source data, send email, commit code or deploy the viewer.
5. Keep all personal report files in `.local/`. Publish only the viewer code, illustrative data and static assets in `docs/`. Report generation does not require a public repository update.
6. Verify that the private link decrypts to the intended report. If the owner's command authorizes email, verify the configured recipient, search sent mail for the subject and report date to avoid an accidental duplicate, then deliver the prepared MIME payload from `.local/email.private.json` through the authorized email connector. Confirm the sent message before claiming delivery.

The script preserves local report history, replaces a report for the same date, authenticates compressed encrypted data with AES-256-GCM, writes files atomically, and prepares both HTML and plain-text email. Each email link carries its single encrypted report and access key in the URL fragment. Private configuration and generated email stay in `.local/`. Keep the archive key in a private credential store with a backup. Source retrieval and email delivery are separate, explicitly requested actions through available authorized tools.

## Sources and interpretation

Use Garmin Connect for device and recovery context, Intervals.icu for its own activity and load calculations, and Strava for cross-checks and session context. Follow each provider's current API permissions and data terms. The current report collection path reads the owner's signed-in browser. The Garmin Personal API offers an independent integration path after owner key setup.

Duplicate activities merge through shared provider IDs or a conservative match on sport, start time, duration and distance. Missing values stay unavailable. Non-training recordings remain available for review and are excluded from training totals. Every coaching decision should identify evidence, uncertainty and a practical adjustment rule.

## Private access

The public repository includes source code, illustrative data and viewer assets only. Personal readings, encrypted reports and archive keys belong in private files. Each report and its key travel in the private link's URL fragment, which browsers omit from HTTP requests. After unlocking, the app keeps the key in session storage, saves the encrypted report in browser-local storage, and removes the fragment from the visible address. A person with the full private link can read that report. Use the Lock archive control to clear the current browser session.

The public viewer and code remain discoverable. The archive lists reports opened in the current browser, so open a report's email link when using a new device. Browser storage can be cleared; retain the original emails. Private links are bearer access, rather than account-based access control.

## License

MIT covers the application source. Personal report content remains the owner's private data.
