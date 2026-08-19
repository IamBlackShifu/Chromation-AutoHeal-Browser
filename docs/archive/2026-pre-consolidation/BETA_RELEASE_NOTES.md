# Chromation 0.3.0-beta.1

Release date: 30 July 2026

This is a beta release for hands-on workflow and compatibility testing. It is
not yet a production release.

## Highlights

- Workspace Home as the application landing page
- Recording, reusable suites, matrix runs, and headless CLI execution
- In-browser, Playwright, and automatic replay-engine selection
- Locator fingerprints and rules-based healing
- Failure evidence, run history, analytics, exports, and rerun comparison
- Variables, environments, reusable flows, hooks, schedules, and plugins
- Visual, API, accessibility, and performance test steps
- Searchable help, onboarding, diagnostics, browsing history, and modernized UI

## Replay improvements

- `Auto (recommended)` keeps ordinary interactive flows in the current tab.
- Advanced, frame, and Shadow DOM workflows are routed to Playwright.
- Playwright mirrors the active page URL, accessible cookies, local storage, and
  session storage.
- Playwright reuses a warm browser process for nearby interactive runs while
  keeping every test in a fresh browser context.
- Browser-side evaluation no longer passes sandboxed Electron functions into
  Playwright.

## Known beta limitations

- In-browser and Playwright replay do not yet have complete action parity.
- HttpOnly cookies cannot be copied from page JavaScript into a Playwright run,
  so some authenticated applications may still require a login/setup flow.
- Dialog, download, popup, cross-origin frame, and closed Shadow DOM policies
  need further end-to-end hardening.
- Electron workflow coverage is not yet running across Windows and Linux CI.
- Visual comparison, scheduling, remote execution, and plugin isolation remain
  beta capabilities.
- Large histories and very long recordings still need virtualization and
  performance acceptance testing.

## Beta testing focus

Please test:

1. Record → save → reopen → replay → report.
2. Auto, In-Browser, and forced Playwright replay on the same recording.
3. Authentication and state-heavy applications.
4. Uploads, dynamic locators, healing, frames, and Shadow DOM.
5. Suite matrix runs across Chrome and Edge.
6. Report rerun comparison and exports.

When reporting an issue, attach Diagnostics output, the selected replay engine,
the failed step number, the error message, and a redacted recording or report
when possible.
