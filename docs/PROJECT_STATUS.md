# Project Status

Last audited: 11 August 2026

## Executive summary

Chromation is a working `0.3.0-beta.1` Electron/TypeScript desktop automation
application, not yet the Chromium fork described in the original product brief.
Its strongest path is the Electron workflow: record, edit, save, replay, heal,
and report. Reusable TypeScript packages cover execution, schemas, reports,
suites, scraping, and advanced test primitives, but a few older APIs remain
placeholders.

The repository is healthy at the unit/integration level. On 11 August 2026,
`npm run check` passed ESLint, 20 Jest suites (110 tests), TypeScript compilation,
and the Webpack build. This does not establish production readiness because
there is no real Electron end-to-end suite.

## What is done

| Area | Evidence-backed state |
| --- | --- |
| Desktop shell | Electron main process, isolated preload bridge, webview, CSP, IPC allowlists, navigation, and persistence |
| Recording | Common browser actions, locator fingerprints, schema migration, import/export, editing, variables, environments, hooks, and reusable flows |
| Replay | Embedded-webview and Playwright engines, states, pause/resume/stop/single-step, breakpoints, timeouts, retries, and deterministic waits |
| Healing | Fingerprint candidates, confidence thresholds, policies, history, and approved-change persistence |
| Reporting | Run history, evidence, trends, HTML/JSON/JUnit/HAR/Allure/PDF outputs, and trace/video retention primitives |
| Scraping | Table/list extraction, pagination/infinite scroll, mapping/cleaning/deduplication, and CSV/JSON/Excel output |
| Extended testing | Suites, tags, matrices, CLI, API steps, mocking, accessibility/performance primitives, visual baselines, scheduling/remote/plugin foundations |
| Product UI | Workspace, tool rail, command palette, recorder timeline, execution bar, reports, help, diagnostics, themes, density, and reduced motion |
| Quality | Clean worktree at audit start; lint, 110 tests, TypeScript, and Webpack pass |

## What is pending

### Release-blocking work

1. Add local fixture apps and Playwright-for-Electron tests for record -> edit ->
   save -> restart -> replay -> heal -> report.
2. Implement dialog, download, popup/new-window, unexpected navigation, renderer
   crash, and disconnected-webview policies.
3. Persist and execute iframe paths and open Shadow DOM host chains, with clear
   cross-origin and closed-root diagnostics.
4. Establish replay-engine capability preflight and shared contract tests.
5. Complete per-origin permissions, retention, quotas, atomic writes, corruption
   recovery, privacy mode, and security threat modelling.
6. Add Windows Electron smoke CI, dependency/security checks, signed installers,
   upgrade/rollback verification, and performance budgets.

### Architecture debt

- `ui/renderer.js` and `ui/styles.css` are large monoliths and contain behavior
  duplicated by TypeScript modules.
- `src/inspector/Inspector.ts` and `src/ui/UIManager.ts` still contain placeholder
  paths although richer behavior exists in the renderer.
- Browser actions lack one canonical, platform-neutral contract.
- IPC contracts and persistence repositories are not consistently typed.
- Several documents and UI strings contain mojibake or stale foundational text.
- Advanced features are foundations rather than hardened production services;
  their acceptance work remains in the robustness audit.

## Recommended next order

1. Finish desktop reliability fixtures and Electron E2E coverage.
2. Introduce the platform-neutral contracts in the mobile roadmap.
3. Put current browser execution behind a `WebAutomationDriver` adapter without
   changing recording files or visible behavior.
4. Deliver the Android Appium proof of concept and shared contract suite.
5. Harden Android, then add iOS on macOS hardware.
6. Refactor the renderer and retire duplicates after web and mobile share a core.

## Source of truth

- This file is the concise status snapshot.
- [ROADMAP.md](ROADMAP.md) is the feature checklist.
- [ROBUSTNESS_UX_AUDIT_CHECKLIST.md](ROBUSTNESS_UX_AUDIT_CHECKLIST.md) contains
  detailed hardening criteria.
- [MOBILE_AUTOMATION_PLAN.md](MOBILE_AUTOMATION_PLAN.md) defines the mobile plan.

