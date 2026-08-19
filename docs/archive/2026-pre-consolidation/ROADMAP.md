# Chromation Pending Work Checklist

Last reviewed: 11 August 2026

For the audited implementation snapshot, see [PROJECT_STATUS.md](PROJECT_STATUS.md).
The staged Android/iOS extension is defined in
[MOBILE_AUTOMATION_PLAN.md](MOBILE_AUTOMATION_PLAN.md).

This is the working roadmap for turning Chromation into a comprehensive and
reliable automation-testing tool. Check an item only after its acceptance
criteria and relevant automated tests pass.

## Status and priority

- `[x]` Implemented and covered by the current build/tests
- `[ ]` Pending
- **P0** Required for a trustworthy MVP
- **P1** Important for a complete daily testing workflow
- **P2** Product polish or advanced capability

## Implemented baseline

- [x] Record common browser actions, including input and file upload
- [x] Capture locator fingerprints while recording
- [x] Replay through the embedded webview or Playwright executor
- [x] Retry failed steps and invoke fingerprint-based locator healing
- [x] Recover dynamic selectors during embedded replay
- [x] Capture execution screenshots, console output, network summaries, and DOM evidence
- [x] Export HTML, JSON, JUnit, HAR, and Allure-compatible report data
- [x] Stop active replay and enforce a global execution timeout
- [x] Version and validate saved recording data
- [x] Use an isolated Electron preload API with IPC allowlists and CSP
- [x] Unit test the recorder, schema, executor, healing, reporter, inspector, and browser core

## P0 — Reliable MVP

### Execution reliability

- [x] Add pause, resume, and single-step execution controls
  - Acceptance: a run can pause between steps, resume without restarting, and execute exactly one step while paused.
- [x] Add breakpoints on recorded actions
  - Acceptance: replay pauses before every enabled breakpoint in both supported replay engines.
- [x] Add explicit run states
  - Acceptance: UI and API consistently expose `idle`, `starting`, `running`, `paused`, `stopping`, `passed`, `failed`, and `cancelled`.
- [x] Add per-action timeout and retry overrides
  - Acceptance: individual actions can override run defaults and the report shows the effective policy.
- [ ] Add navigation/download/dialog/new-window policies
  - Acceptance: alerts, confirms, downloads, popups, and unexpected navigation cannot hang a run.
- [ ] Add iframe and open Shadow DOM action execution
  - Acceptance: recorded frame/shadow context is persisted and used during replay and healing.
- [x] Add deterministic wait strategies
  - Acceptance: users can choose element state, URL, response, DOM, and page-load waits without fixed sleeps.

### Test coverage and quality gates

- [ ] Add Electron end-to-end tests for record → save → replay → report
  - Acceptance: CI exercises input, click, select, upload, healing, cancellation, and report export.
- [ ] Add real-site fixture pages for dynamic locators, frames, shadow roots, dialogs, and uploads
  - Acceptance: fixtures run locally and do not depend on third-party websites.
- [ ] Add renderer tests for event deduplication and replay UI state
- [ ] Add regression tests for multiple tabs and panel switching during recording/replay
- [x] Fix the existing ESLint failures in `Inspector`, `ScraperStudio`, and `UIManager`
- [x] Add CI gates for build, tests, lint, and coverage
- [x] Set initial coverage thresholds and publish coverage artifacts

### Security and data safety

- [x] Mask passwords, tokens, authorization headers, cookies, and secret-like input values
  - Acceptance: secrets never appear in recordings, logs, screenshots metadata, or exported reports.
- [x] Add configurable evidence redaction
  - Acceptance: selectors/regions can be blurred or omitted from screenshots and DOM snapshots.
- [ ] Add per-origin permission controls for recording, scraping, downloads, clipboard, camera, and microphone
- [x] Validate imported recording size, paths, schemas, and action payloads
- [x] Add secure test-data/environment variable storage

### Product truth and maintenance

- [x] Update README/API documentation to distinguish implemented features from planned features
- [x] Remove or regenerate stale compiled `src/**/*.js` files
  - Current risk: these files contain older placeholder implementations and can confuse contributors.
- [x] Define supported Electron, Chrome, Playwright, and Node versions
- [x] Add migration tests for every recording-schema version

## P1 — Complete daily testing workflow

### Test authoring

- [x] Add a visual step editor: reorder, duplicate, disable, delete, and edit actions
- [x] Add assertion builder for text, value, attribute, visibility, count, URL, title, and response
- [x] Add reusable variables and test-data binding
- [x] Add environment profiles for base URLs and non-secret configuration
- [x] Add reusable flows/components such as login and logout
- [x] Add before/after hooks and setup/teardown steps
- [x] Add keyboard shortcut editor and command reference
- [x] Validate all generated Playwright, Selenium, Cypress, Puppeteer, and CDP exports with executable tests

### Locator and healing

- [x] Show locator uniqueness and stability scores during recording
- [x] Let users preview and choose primary/fallback locators
- [x] Add healing approval policies: automatic, ask, or report-only
- [x] Persist approved healed locators back into the recording
- [x] Add healing history comparison and confidence thresholds
- [x] Add closed Shadow DOM and cross-origin frame limitations to the UI
- [x] Add visual/geometry similarity only after deterministic strategies are exhausted

### Reporting and diagnostics

- [x] Implement real PDF export; the current TypeScript reporter returns a placeholder
- [x] Add a run-history store with searchable past results
- [x] Add failure trends, duration trends, healing frequency, and flaky-step analytics
- [x] Show skipped/cancelled steps distinctly from failed steps
- [x] Add report attachments for downloads and relevant network bodies
- [x] Add optional trace/video capture with retention limits
- [x] Add side-by-side expected/actual assertion details

### Scraper Studio

- [x] Implement production table/list extraction in the TypeScript module
- [x] Implement pagination and infinite-scroll traversal
- [x] Implement real CSV and Excel export; both are currently placeholders in the TypeScript module
- [x] Add visual field mapping, preview, type detection, cleaning, and deduplication
- [x] Add scraper limits, cancellation, progress, and partial-result recovery
- [x] Add scraper actions to recorded automation flows

## P2 — Advanced capabilities

- [x] Parallel and matrix execution
- [x] Project/suite organization with tags and filtering
- [x] Scheduled/headless CLI runs
- [x] Visual regression testing and baselines
- [x] API test steps and network mocking
- [x] Accessibility scans
- [x] Performance budgets and Web Vitals
- [x] Natural-language test generation with explicit review
- [x] Remote workers and CI result synchronization
- [x] Plugin/integration SDK

## Mobile application automation

- [ ] Extract platform-neutral action, locator, session, and driver contracts
- [ ] Preserve web behavior behind a `WebAutomationDriver` adapter
- [ ] Add Appium session management and setup diagnostics
- [ ] Deliver Android native/hybrid inspection, recording, replay, evidence, and export
- [ ] Add context-aware mobile locator healing with conservative approval policies
- [ ] Add deterministic Android emulator and real-device contract/E2E coverage
- [ ] Add iOS simulator and real-device support through a macOS worker
- [ ] Add provider-neutral local/cloud device matrices and capability mapping

Acceptance criteria, sequencing, risks, and the recommended first slice are in
[MOBILE_AUTOMATION_PLAN.md](MOBILE_AUTOMATION_PLAN.md).

## UI and UX modernization roadmap

### Phase 1 — Make functions easy to find

- [x] Replace icon-only tool buttons with a labeled left tool rail
  - Suggested groups: **Browse**, **Inspect**, **Record**, **Replay**, **Scrape**, **Reports**, **Settings**.
- [x] Add a command palette and global function search (`Ctrl+K`)
  - Search actions such as “Start recording”, “Inspect element”, “Open reports”, and “Export Playwright”.
- [x] Add a workspace/home screen
  - Show recent recordings, recent runs, quick start actions, and project health.
- [x] Add badges to tools
  - Examples: recording dot, action count, failed-run count, and healing-event count.
- [x] Add tooltips and keyboard shortcuts to every toolbar action
- [x] Keep the active tool and panel state when switching tabs

### Phase 2 — Improve the testing workflow

- [x] Convert the Recorder panel into three clear areas:
  - run controls and status;
  - searchable/editable step list;
  - selected-step properties.
- [x] Add a persistent execution bar
  - Show elapsed time, current step, progress, pause/resume, stop, and failures without requiring the Recorder panel to remain open.
- [x] Add step filters for all, passed, failed, healed, skipped, and disabled
- [x] Use a timeline-style step list with clear action icons and status colors
- [x] Add an inline locator editor and healing comparison drawer
- [x] Add resizable panels and remember panel widths
- [x] Replace blocking dialogs with consistent toasts and confirmation sheets

### Phase 3 — Modern visual system

- [x] Define reusable spacing, radius, typography, elevation, and semantic-color tokens
- [x] Improve light and dark themes and use the operating-system preference by default
- [x] Use semantic colors consistently:
  - green = passed;
  - red = failed;
  - amber = warning/healed;
  - blue = active/running;
  - gray = skipped/disabled.
- [x] Add compact and comfortable density modes
- [x] Add polished empty, loading, error, and first-use states
- [x] Add reduced-motion and low-performance settings
- [x] Replace corrupted/emoji status glyphs with a consistent local SVG icon set
- [x] Make keyboard focus visible and meet WCAG contrast/label requirements

## Recommended implementation order

1. Fix lint and establish CI quality gates.
2. Add explicit execution states, pause/resume, and breakpoints.
3. Add local end-to-end fixture pages and Electron workflow tests.
4. Implement the labeled tool rail, command palette, and persistent execution bar.
5. Add the visual step editor and assertion builder.
6. Complete secret masking, evidence redaction, and permission controls.
7. Complete PDF reporting and run-history analytics.
8. Complete Scraper Studio extraction and export.
9. Add iframe/Shadow DOM reliability and advanced healing controls.
10. Begin advanced suite, parallel, visual, accessibility, and performance features.

## Definition of MVP-ready

The MVP is ready when all P0 items are complete, all quality gates pass, the
record → edit → replay → heal → report workflow is covered by Electron E2E
tests, and documentation only advertises behavior demonstrated by those tests.
