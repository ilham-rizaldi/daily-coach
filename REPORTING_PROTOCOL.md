# Performance Dashboard reporting protocol

## Trigger and scope

Run when the owner commands it. There is no recurring schedule, automatic email, background refresh or report-generation hook on repository updates. Do not create or re-enable one without a new request.

Use the current command and established authorization to determine the requested output. A command to run the full report-and-email protocol includes delivery to the configured owner recipient. Do not request the same permission again. A request to verify access, inspect data, preview the dashboard or edit code does not by itself authorize email. Keep the recipient and account identifiers in private configuration.

The code repository and viewer remain public. Source captures, activity and wellness data, private report files, encrypted payloads, email content, keys and full private links remain outside GitHub, including its issues, pull requests, Actions logs and artifacts. A fresh report does not require a viewer deployment or a code commit.

## 1. Verify access and collect evidence

1. Establish the report date and local timezone from the owner's context. The existing report calculations use `Asia/Jakarta`. Record the capture timestamp separately from the date of each measurement.
2. Inspect the owner's authorized Chrome sessions for Garmin Connect, Strava and Intervals.icu. For any additional browser or extraction tool requested by the owner, verify that tool's actual session separately. An installed tool or successful page load does not prove access to private data. Use only authorized browser controls, connectors, provider APIs or native export actions. Do not extract cookies, reuse session credentials in another service, or use shell requests to bypass browser access controls.
3. For each source, record whether access worked, the latest visible activity, the date range retrieved, pagination/export completeness and any missing fields. Use native exports where available to retain exact values and units. Retain captures and their file hashes privately so another run can audit the extraction.
4. Keep browser observations and each extraction service's output distinguishable. Accept an extracted value only when its source, athlete identity, date, label and unit are supported. Quarantine sign-in pages, incomplete results and unverified tool output rather than merging them into the report.
5. Preserve historical captures as historical evidence. If current access fails, label the last verified capture and the missing refresh. Do not silently reuse it as a current reading. Keep partial captures as private diagnostics. Do not use them as current report data.

## Completeness gate

Run `captureReadinessIssues(report)` before preparing coaching. The gate checks dated Garmin recovery and load, Intervals.icu actual load and settings, three-provider activity coverage, and current verification of performance history. Recheck the native detail, settings, sync or export when a required metric is unavailable. Preserve optional sensor gaps and verified nonmeasurements separately from access or retrieval failures.

If a required metric remains unavailable or unverified, report `BLOCKED` with the source, missing evidence and exact next step. The report command enforces the gate before writing the private archive, dashboard link or email payload.

## 2. Reconcile activities and metrics

- Keep provider IDs, timestamps, sport, duration, distance, units and per-field source provenance. Merge copies using shared IDs or a conservative match on sport, start time, duration and distance. Preserve distinct sessions on the same day and unresolved conflicts.
- Keep non-training recordings available for inspection with an exclusion reason. Exclude them from training totals. Missing values remain unavailable, not zero.
- Use Garmin for its device, recovery and wellness observations; Intervals.icu for its own activity, fitness and fatigue calculations; and Strava for activity cross-checks and session context. Preserve disagreements rather than choosing an unsupported value.
- Separate Garmin acute/chronic load and load ratio from Intervals.icu load, fitness, fatigue and form. Do not combine unlike scales, use a recovery score as a diagnosis, or sum fitness/fatigue contributions as if they were activity load. Identify estimates such as HR-based strength load.
- Keep thresholds specific to sport, measurement type, date and source. A configured FTP or threshold heart rate is not a newly measured test result. Do not infer cycling FTP from running power, or transfer a running threshold to cycling. If zones conflict, prescribe by supported effort cues until the conflict is resolved.
- Use completed calendar days for week-to-week comparisons. Show today's partial data separately. Calculate 7-, 28- and longer-window trends only where source coverage supports them. Do not claim a complete period, percentage change, best effort, intensity distribution or power-duration result from incomplete records.

## 3. Produce the coaching assessment

Apply professional cycling-coaching reasoning without claiming a credential. Lead with the training decision and its evidence. Distinguish observed facts, calculated results, interpretations and recommendations.

Write `coaching.actionPlan` for Daily with a short decision, two or three dated data signals, and only the applicable training, recovery, fuel or rest actions. Include an alternative and a next check when either changes the decision. Give familiar meal examples and scale fueling to the actual session or recovery window. Link each plan's `referenceIds` to entries in `coaching.research` with `id`, `citation`, a peer-reviewed DOI `url`, and `application`. Keep source context in Reference. A device estimate or Load Focus gap informs the plan alongside recent training and self-reported recovery. Avoid treating either as a quota for the next session.

| Area | Required content when supported by the capture |
| --- | --- |
| Readiness and recovery | Current and baseline sleep, resting heart rate, HRV, recovery/readiness and reported fatigue; note conflicts, missing symptoms and observation times. |
| Training exposure | Deduplicated sessions and time by sport; completed-day volume and load trends; recent hard/easy sequencing; strength and cross-training context. |
| Session quality | Compare planned and completed work where both exist; inspect intervals, power, heart rate, cadence, elevation and conditions only when those details are available. |
| Fitness and durability | Identify supported changes in repeatable performance and sustained work; distinguish a model estimate from measured performance and avoid causal claims from coincident trends. |
| Next session | State purpose, sport, total duration, warm-up, work, recovery and cool-down. Step durations must equal the total. Give supported intensity targets, an easier alternative and a practical adjustment or stop rule. |
| Upcoming training | Relate the next session to verified planned workouts and recovery needs. Treat a longer progression as provisional when goals, availability or upcoming events are unknown. |
| Confidence and gaps | Explain the evidence behind consequential decisions, confidence, conflicting thresholds, missing streams, incomplete coverage and the next measurement that would change the decision. |

Use the available history for depth. A longer report cannot substitute for missing data. Do not invent power records, training zones, fitness gains, race targets, symptoms or causal explanations. Training advice is an interpretation of the captured evidence, not a medical diagnosis.

## 4. Prepare and verify the private report

1. Write the requested report in `.local/report.private.json`, following the shape in `src/demo.js`. Include the real date, source coverage, capture timestamps, deduplicated activity records, coaching rationale, session steps and data-quality notes. Keep supporting detail and source ledgers private.
2. Read `.local/config.private.json` or the existing `COACH_CONFIG` path. It contains `archiveKey`, `siteUrl`, `email` and `repository`. Keep the key private and backed up. Do not echo configuration or bearer links into public logs.

   For the next-day planner, capture `intervals.date`, fitness/fatigue, actual fitness/fatigue time constants when visible, and per-activity-type contribution percentages. Keep original load and timer fields. Missing settings remain explicitly assumed in the viewer. A prediction is a scenario on the Intervals scale, not an exact Garmin acute/chronic ratio prediction. Do not prescribe extra training to fill a ratio or treat a balanced model ratio as clearance for hard work.

   Expected workout load is calculated from the owner's selected activity, duration and effort, rather than entered as load points. Relative effort scenarios use same-sport historical load/hour quantiles until genuine session-RPE or verified intensity data supports a more specific calibration. Capture completed-session RPE, measured power, interval structure and validated sport-specific thresholds when available; never infer them from an activity title or substitute running power for cycling power. Keep the empirical proxy and its limits visible.

   For the separate Garmin rest-day estimate, capture dated daily acute/chronic chart values in `garminLoadHistory.rows`, with observation time, source URL and extraction method. Verify the current chart anchor against the report and native tooltips. Use complete activity coverage to identify completed days without any recording, including excluded non-training recordings. Preserve both components' paired changes, sample dates, scenario spread and extrapolation limits. A fresh data-enriched private link is required for old reports that lack the history; refreshing the public viewer cannot add private source data to an immutable emailed payload.
3. Run:

   When validated Garmin daily exports are present, attach the recovery history first, preserving source and report capture times:

   ```sh
   node scripts/attach-wellness.mjs .local/report.private.json .local/capture-YYYY-MM-DD/garmin-wellness-exports.json
   ```

   This maps dated source fields to `wellnessHistory.rows`, preserving nulls, units and per-field export pointers. It does not capture new data or refresh today's wellness. Future reports without daily exports leave history unavailable. Browser check-ins are separate encrypted subjective records; import them only when their actual entries are read during an authorized report run, without fabricating ratings or replacing provider TL.

   ```sh
   npm run report -- .local/report.private.json
   ```

   This validates and encrypts the report, preserves the private local archive and prepares email files. It does not capture source data, send mail or publish code.

4. Decrypt the generated private payload and verify that it matches the intended report, date and revision. Check units, totals, deduplication, exclusions, completed-day windows, source coverage and prescription duration. Verify the configured viewer destination and the intended report selection. Never paste a full private link into a public checker or issue.
5. If the viewer source changes, run its relevant tests and build before deployment. Commit only reviewed source, clearly illustrative examples and viewer assets. Review the outgoing file list and diff for private data before any GitHub write. Preserve unrelated changes and never force-push to overwrite another update.

## 5. Deliver only when requested

When the command authorizes email, verify the owner recipient against the private configuration and connected account context. Search sent mail for the report date and subject before sending. Do not resend an identical report accidentally; a requested revision or explicit resend is a separate delivery.

Deliver the prepared HTML and plain-text MIME payload from `.local/email.private.json` through the authorized mail connector. Confirm the sent result or sent-message record before claiming delivery. If delivery is blocked, preserve the prepared report and state the specific failure; do not label a draft or prepared file as sent.

Return the key coaching decision, material coverage limits, the report's verified state and email delivery state. Link only the intended private deliverable in the owner's conversation. Mention the GitHub commit only when code was actually updated. Future runs continue to require the owner's command.
