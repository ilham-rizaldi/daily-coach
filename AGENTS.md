# Prototype Instructions

The selected visual target is Performance Desk: charcoal background, lime accents, coaching decision first, readable charts and a next-session plan. GitHub hosts the public source and viewer. Personal report data stays in local private files and emailed URL fragments; never publish personal ciphertext or keys to GitHub. The archive is local to the browser that opened each report. Buildkite is excluded from the workflow.

The locked login page shows only the Performance Desk eyebrow, the two-line "Your training. Your private report." heading, the private-link instruction, the access-key input and the Open my report button. Do not show the global header, extra privacy paragraph or design-preview link on this screen. Show errors and loading state only when needed.

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.
