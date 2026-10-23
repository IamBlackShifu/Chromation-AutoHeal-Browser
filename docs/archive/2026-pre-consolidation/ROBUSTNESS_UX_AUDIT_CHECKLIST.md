# Chromation Robustness and UX Audit Checklist

Last audited: 29 July 2026

This document is the evidence-based improvement backlog for Chromation. It
separates capabilities that exist from capabilities that are proven under real
Electron/browser conditions. An item should only be checked after its acceptance
criteria pass in CI or an explicitly documented manual test.

## Status and maturity

- `[x]` Implemented and covered by the current automated checks.
- `[~]` Implemented, but needs production hardening or end-to-end validation.
- `[ ]` Missing or materially incomplete.
- **P0** blocks a reliable public MVP.
- **P1** is needed for dependable daily team use.
- **P2** improves scale, maintainability, or product polish.

## Audit snapshot

- 20 Jest suites and 110 tests pass.
- Coverage: 72.08% statements, 52.8% branches, 75.43% functions, and 75.63% lines.
- CI runs lint, coverage, and build on Node 20.
- The TypeScript executor is 1,134 lines.
- The renderer is 4,966 lines and the stylesheet is 2,361 lines.
- The renderer UI is primarily tested with source assertions, not a running Electron application.
- `Inspector.ts` and `UIManager.ts` still contain explicit implementation TODOs.
- The embedded-webview and Playwright replay engines have different supported action sets and behavior.

## What is implemented today

### Core automation

- [x] Browser action recording for navigation, clicks, typing, selection, scrolling, keyboard input, drag/drop, and upload.
- [x] Locator fingerprint capture at recording time.
- [x] Embedded-webview and Playwright replay paths.
- [x] Per-step and run-level timeout/retry controls.
- [x] Pause, resume, stop, single-step, and breakpoints.
- [x] Deterministic waits for page, URL, response, element, and DOM conditions.
- [x] Fingerprint-based locator healing with confidence and approval policies.
- [x] Visual step editing, assertions, reusable flows, hooks, variables, and environments.
- [x] Recording schema validation, migration, import, export, rename, and persistence.

### Evidence and reporting

- [x] Immediate post-run report workspace.
- [x] Persistent run history for both replay engines.
- [x] Run and step pass-rate calculations, trends, healing frequency, and flaky-step analytics.
- [x] Failure screenshots, console output, network summaries, DOM evidence, and attachments.
- [x] HTML, JSON, JUnit, HAR, Allure-compatible, and PDF exports.

### Product workflow

- [x] Workspace home, tool rail, command palette, recent recordings, recent runs, and project health.
- [x] Persistent execution bar and timeline-style step list.
- [x] Searchable run history and persistent browsing history.
- [x] Scraper Studio, suite organization, matrix execution, CLI runs, scheduling primitives, visual checks, API steps, accessibility checks, performance budgets, remote-worker primitives, and plugin SDK.
- [x] Light/dark themes, density settings, reduced motion, low-performance mode, focus styles, and semantic colors.

### Security baseline

- [x] Context-isolated preload bridge with channel allowlists.
- [x] Content Security Policy.
- [x] Recording import size/path/schema validation.
- [x] Secret masking and evidence-redaction primitives.
- [x] OS-backed secret storage when Electron `safeStorage` is available.
- [x] Origin-bound upload requests and path validation.

## P0 — Automation reliability

### Real application testing

- [ ] Add Playwright-for-Electron end-to-end tests for the complete workflow.
  - Cover record → edit → save → close/reopen → replay → heal → report → export.
  - Cover both embedded-webview and Playwright engines.
  - Acceptance: the workflow passes on Windows and Linux CI without manual interaction.
- [ ] Build local deterministic fixture pages.
  - Include dynamic IDs, delayed elements, iframes, open Shadow DOM, dialogs, popups, downloads, uploads, redirects, SPA navigation, authentication, and network failures.
  - Acceptance: no reliability test depends on a public third-party website.
- [ ] Add renderer behavioral tests using a DOM test environment.
  - Verify event deduplication, tab state, panel state, history actions, command palette keyboard behavior, dialogs, and execution-bar transitions.
  - Replace source-string assertions with interaction assertions where practical.
- [ ] Add restart/crash recovery tests.
  - Verify recordings, run history, browsing history, schedules, suites, environments, baselines, and plugins survive restart and partial writes.

### Navigation and browser events

- [ ] Implement explicit JavaScript dialog policies.
  - Support alert, confirm, prompt, and beforeunload with configurable accept/dismiss responses.
  - Record the chosen response and include unexpected dialogs in the failure report.
- [ ] Implement download policies.
  - Configure allowed directories, filename collision behavior, timeouts, checksum assertions, and report attachments.
  - Prevent a download from hanging a run.
- [ ] Implement popup and new-window policies.
  - Choose same tab, new controlled tab, block, or fail.
  - Associate child windows with the originating step.
- [ ] Detect unexpected navigation.
  - Allow explicit URL patterns and fail or warn when a step leaves the approved origin/path.
- [ ] Add browser crash, renderer crash, and disconnected-webview handling.
  - End the active run deterministically and preserve partial evidence.

### Frames and Shadow DOM

- [ ] Persist frame context with each recorded locator.
  - Store frame URL/name and a resilient frame fingerprint.
- [ ] Execute and heal actions inside same-origin and cross-origin iframes.
  - Playwright must support both; embedded replay must clearly report unsupported contexts.
- [ ] Persist open Shadow DOM host chains and execute through them.
- [ ] Add explicit diagnostics for closed Shadow DOM.
  - Explain why it cannot be traversed and offer a Playwright/test-hook alternative.

### Replay-engine parity

- [ ] Publish and enforce an action-support matrix for both engines.
- [ ] Add contract tests that run the same recording through both engines.
- [ ] Prevent selection of an engine that cannot execute the current recording.
  - Show unsupported steps before the run starts.
- [ ] Consolidate duplicated replay behavior.
  - Share status, timeout, retry, wait, healing, cancellation, and reporting contracts.
- [ ] Remove silent catches in home/history/report loading.
  - Surface recoverable warnings with retry and diagnostic details.

### Locator robustness

- [ ] Verify locator uniqueness against the live page before saving.
- [ ] Store multiple fallback locators with ranked stability reasons.
- [ ] Re-score fingerprints after navigation and major DOM mutation.
- [ ] Add false-heal protection.
  - Require semantic/role/text agreement for destructive or high-risk actions.
  - Never automatically heal payment, deletion, permission, or submission actions below a stricter threshold.
- [ ] Add healing telemetry per selector.
  - Track heal count, confidence drift, accepted/rejected candidates, and recurring unstable attributes.
- [ ] Add an approval queue for `ask` healing policy that cannot be lost when switching tabs.

### Action semantics

- [ ] Normalize action names and payloads across recorder, schema, both executors, reports, and exporters.
- [ ] Add preflight validation before replay.
  - Validate URLs, selectors, upload files, variables, environment bindings, action support, timeouts, and assertion payloads.
- [ ] Add idempotency/recovery guidance for steps that may have partially completed.
- [ ] Add clock and random-data controls for deterministic tests.
- [ ] Add configurable typing modes, input clearing, and composition-event support.
- [ ] Add robust support for contenteditable, rich-text editors, canvas, and virtualized lists.
- [ ] Add download, clipboard, geolocation, camera, microphone, and notification actions with explicit permissions.

## P0 — Security and data integrity

- [ ] Complete per-origin permission controls.
  - Recording, scraping, downloads, clipboard, geolocation, camera, microphone, notifications, and popups must default to least privilege.
- [ ] Add retention policies for screenshots, traces, videos, reports, browsing history, and recordings.
- [ ] Add quotas and graceful disk-full handling.
- [ ] Use atomic writes and backup recovery for all persisted JSON stores.
  - Run history, browsing history, suites, schedules, baselines, plugins, and settings.
- [ ] Validate persisted run-history and browsing-history schemas before import.
- [ ] Add corruption quarantine instead of failing the entire store.
- [ ] Encrypt or exclude sensitive report attachments and network bodies.
- [ ] Add a privacy mode that disables browsing history and evidence capture per origin.
- [ ] Add audit logging for permission changes, plugin installs, secret reads, and remote execution.
- [ ] Threat-model plugin sandbox escape, IPC abuse, untrusted recording import, and report HTML injection.

## P0 — Quality gates and release readiness

- [ ] Raise coverage thresholds in stages.
  - Immediate target: 65% branches and 80% lines.
  - Reliability target: 80% branches and 90% lines for executor, healing, schema, and security modules.
- [ ] Prioritize uncovered `ScriptExecutor` branches (currently 46.93% branch coverage).
- [ ] Prioritize `HealingEngine` coverage (58.45% line coverage).
- [ ] Prioritize `ScraperStudio` coverage (32.69% branch coverage).
- [ ] Add Windows CI because Electron, file uploads, paths, and `safeStorage` are platform-sensitive.
- [ ] Add an Electron smoke-test job with uploaded screenshots/logs on failure.
- [ ] Add dependency vulnerability scanning, license checks, and lockfile integrity checks.
- [ ] Add signed installers, update-channel validation, rollback, and release checksums.
- [ ] Add performance budgets for app startup, panel opening, 1,000-step recordings, and large histories.
- [ ] Define a support policy for Electron/Chromium/Playwright upgrades and run compatibility CI.

## P1 — Architecture and maintainability

- [ ] Split `ui/renderer.js` into modules.
  - Suggested modules: tabs, navigation, recorder, replay, reports, history, workspace, scraper, settings, command palette, persistence, and shared UI.
- [ ] Move renderer JavaScript to TypeScript with strict checking.
- [ ] Split `ui/styles.css` into tokens, layout, components, utilities, and feature styles.
- [ ] Remove duplicate/legacy functions and duplicate style definitions.
  - Examples include legacy history/report implementations retained beside current implementations.
- [ ] Finish or remove placeholder TypeScript classes.
  - `Inspector.ts` still marks inspection, locator generation, and highlighting as TODO.
  - `UIManager.ts` still marks highlight, healing, recording status, and locator flash as TODO.
- [ ] Establish one source of truth for UI behavior.
  - Avoid separate placeholder TypeScript APIs and working renderer-only implementations.
- [ ] Introduce typed IPC request/response contracts shared by main and preload.
- [ ] Introduce repository interfaces for recordings, reports, histories, suites, schedules, baselines, and settings.
- [ ] Add structured logging with levels, run IDs, step IDs, redaction, and exportable diagnostics.
- [ ] Remove corrupted text encoding and mojibake across HTML, renderer strings, reports, and documentation.

## P1 — Advanced feature hardening

### Visual regression

- [~] Baseline storage and comparison exist.
- [ ] Replace byte-by-byte image comparison with decoded pixel comparison.
- [ ] Add dimension handling, masks, ignored regions, anti-alias tolerance, and diff images.
- [ ] Persist baselines by project, environment, browser, viewport, and operating system.
- [ ] Add baseline approval/rejection workflow in the UI.

### Accessibility

- [~] Basic built-in checks exist.
- [ ] Integrate a comprehensive rule engine such as axe-core.
- [ ] Support rule configuration, exclusions, WCAG level, and impact thresholds.
- [ ] Attach element snapshots and remediation links to violations.

### Performance

- [~] Navigation and performance-entry measurement exists.
- [ ] Use PerformanceObserver during the complete interaction window for LCP, CLS, and INP.
- [ ] Add warm/cold run modes and statistical samples.
- [ ] Store trends by environment and detect regression significance.

### Scheduling and remote execution

- [~] Scheduling, worker coordination, and CI synchronization primitives exist.
- [ ] Persist scheduler state and run it in a durable background process.
- [ ] Add missed-run, overlap, retry, backoff, timezone, cron, and concurrency policies.
- [ ] Add worker heartbeats, leases, timeout recovery, capability matching, and duplicate-result protection.
- [ ] Persist the remote queue and pending CI synchronization.
- [ ] Add transport authentication rotation and TLS certificate validation guidance.

### Plugin SDK

- [~] Manifest validation, permissions, lifecycle hooks, storage, and extensions exist.
- [ ] Run plugins in a stronger isolation boundary than the current VM-only model.
- [ ] Add CPU/time/memory quotas and cancellation.
- [ ] Sign plugin bundles and verify provenance.
- [ ] Add API version compatibility tests and migration policy.
- [ ] Add a developer console, diagnostics, and safe hot reload.

## P1 — UI and UX improvements

### Information architecture

- [ ] Separate Settings from Plugin Manager.
  - Create dedicated Appearance, Automation, Permissions, Data & Privacy, Integrations, and Advanced sections.
- [ ] Add a project switcher and persistent current-project context.
- [ ] Add breadcrumbs or clear location context for Workspace, Reports, Recorder, and Settings.
- [ ] Make Recent Runs and browsing-history rows support keyboard selection and context menus.
- [ ] Add consistent primary/secondary/overflow action hierarchy.
- [ ] Add undo for non-destructive edits and soft-delete/trash for recordings.

### Recorder workflow

- [ ] Make the three Recorder areas resizable independently.
- [ ] Add virtualization for recordings with hundreds or thousands of steps.
- [ ] Keep search/filter state when closing and reopening Recorder.
- [ ] Add multi-select and bulk enable, disable, delete, tag, and move.
- [ ] Add a minimap/overview for long recordings.
- [ ] Add inline validation before a step is saved.
- [ ] Show variable resolution previews without revealing secrets.
- [ ] Add unsaved-change indicators and navigation guards.

### Reports and history

- [ ] Add pagination or virtualization for large run and browsing histories.
- [ ] Add date-range, tag, suite, environment, browser, and healed filters.
- [ ] Add compare-runs mode for failures, timings, screenshots, and healing changes.
- [ ] Add pin, favorite, archive, retention, and bulk-delete actions.
- [ ] Add shareable redacted report bundles.
- [ ] Add explicit history-disabled/private mode state.

### Accessibility and consistency

- [ ] Run automated accessibility tests against the Electron renderer.
- [ ] Verify 200% zoom, keyboard-only use, screen-reader names, and high-contrast mode.
- [ ] Ensure every icon button has a visible tooltip and accessible name.
- [ ] Replace remaining emoji, mojibake, and text glyph icons with the local SVG system.
- [ ] Standardize control heights, button wrapping, and responsive behavior at panel widths from 340–760 px.
- [ ] Add focus trapping and focus restoration to command, save, and confirmation dialogs.
- [ ] Announce async success, errors, progress, and filtered-result counts through live regions.
- [ ] Test comfortable and compact density modes on every panel.

### User guidance

- [x] Add contextual first-run onboarding for record → replay → report.
- [x] Add in-product explanations for replay-engine choice and capability differences.
- [x] Add actionable remediation links for failures and healing warnings.
- [x] Add a diagnostics screen with app/browser versions, storage paths, permissions, and health checks.
- [x] Add searchable documentation and shortcut reference inside the app.

## P2 — Team and enterprise readiness

- [ ] Project export/import with schema versioning and conflict resolution.
- [ ] Git-friendly text project format and deterministic serialization.
- [ ] Role-based access for secrets, baselines, plugins, and destructive actions.
- [ ] Centralized artifact storage and configurable retention.
- [ ] Test ownership, annotations, links to defects, and review/approval states.
- [ ] Notifications for scheduled/CI failures with deduplication and escalation rules.
- [ ] Quarantine and retry policies for flaky tests.
- [ ] Historical dashboards with environment/browser segmentation.
- [ ] OpenTelemetry-compatible logs, traces, and metrics.
- [ ] Backup, restore, and migration tooling.

## Recommended implementation sequence

1. Build deterministic local fixture pages and Electron end-to-end coverage.
2. Implement dialog/download/popup/unexpected-navigation policies.
3. Add iframe and Shadow DOM context recording/execution.
4. Add replay-engine capability preflight and parity contract tests.
5. Harden persisted stores with schemas, atomic writes, quotas, retention, and recovery.
6. Complete origin permissions and privacy controls.
7. Split and type the renderer; remove legacy functions, duplicate CSS, TODO classes, and encoding corruption.
8. Raise executor/healing/scraper branch coverage and add Windows Electron CI.
9. Harden visual, accessibility, performance, scheduling, remote execution, and plugins.
10. Add large-project performance, history virtualization, team workflows, and release packaging.

## Release gates

### Reliable MVP

- [ ] All P0 automation, security, and quality items above are complete.
- [ ] Record → save → restart → replay → heal → report passes in Electron CI.
- [ ] Both replay engines pass the shared contract suite.
- [ ] No third-party website is required by the reliability suite.
- [ ] No unresolved P0 security findings.
- [ ] Documentation advertises only behavior demonstrated by automated or documented manual tests.

### Daily-use ready

- [ ] A 1,000-step project remains responsive.
- [ ] Histories remain responsive with 5,000 entries.
- [ ] Crash recovery preserves valid work and quarantines corrupted data.
- [ ] Keyboard-only and 200% zoom acceptance tests pass.
- [ ] Windows installer upgrade and rollback tests pass.
