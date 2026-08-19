# OmniFlow QA Current Product and Engineering State

Last verified: 14 August 2026  
Version: `0.3.0-beta.1`  
Primary desktop target: Windows 10/11

This document is the source of truth for what OmniFlow QA currently does, how the
web and mobile paths fit together, what has been verified, and what remains.
Archived plans and historical audits describe how the product arrived here but
must not be used as current feature claims.

## Executive standpoint

OmniFlow QA is a working Electron desktop QA automation application. It is not a
custom Chromium fork. Its primary workflow is:

`Browse or connect a device -> inspect -> record -> edit -> save -> replay -> heal -> report -> export`

Web automation is the broader and more mature surface. Android automation now has
a functional Appium/UiAutomator2 path with real-device certification for session
creation, hierarchy, screenshot, key dispatch, cleanup, and scrcpy mirroring.
iOS is planned but not implemented.

### Critical mobile recording limitation

Mobile interaction recording is an experimental foundation and is **not yet
reliable or release-ready**. It can capture the initial application launch and
some physical-device or embedded-preview gestures, but real journeys still lose
interactions. Touch boundary variants, multi-touch/slot handling, soft-keyboard
text reconstruction, system UI transitions, WebView context changes, stream
recovery, orientation transforms, and action/hierarchy timing require substantial
additional implementation and physical-device certification. No release claim
may describe mobile recording as complete until repeatable five-screen journeys
capture every supported user action and replay them successfully across the
supported device matrix.

The repository passes its complete automated gate: ESLint, 34 Jest suites with
183 tests, TypeScript compilation, and Webpack. A Playwright Electron smoke also
certifies shell startup plus Mobile and Recorder drawer access. This is not a
substitute for signed-release testing or the full record-to-report E2E matrix.

## Product shell and UX

### Implemented

- Frameless Electron shell with custom minimize, maximize/restore, and close
  controls, draggable chrome, accessible labels, and native-feeling hover states.
- Compact collapsible tool rail for Browse, Inspector, Recorder, Mobile, Suites,
  Reports, and Settings.
- Unified dark/light theme tokens, consistent radii, typography, focus rings,
  form controls, reduced-motion support, density preferences, and low-performance
  mode.
- Address bar with search affordance, clear action, navigation state, and active
  target badge (`Web · Chrome` or `Android · device`).
- Dashboard KPI widgets, recent-recording table, status tags, relative context,
  and quick actions.
- Command palette, keyboard shortcuts, contextual help, diagnostics, toasts, and
  application-owned confirmation sheets instead of native blocking dialogs.
- Resizable side panel, expanded mobile inspector, responsive layouts, truncation,
  tooltips, empty/loading/error states, and progressive disclosure for advanced
  controls.
- Footer health indicators use compact status pills instead of raw status text.

### UX principles now in use

- Common actions stay visible; advanced capabilities and destructive operations
  stay behind explicit disclosure or confirmation.
- Technical identifiers use monospace presentation where useful.
- Unsupported or unavailable operations are disabled or rejected during preflight.
- A failure should preserve the user's recording and provide a remediation path.
- Mobile setup favors discovery and presets over manually entering identifiers.

### Known UX debt

- `ui/renderer.js` and `ui/styles.css` remain large and should be decomposed after
  web/mobile command routing is fully unified.
- Accessibility has deterministic UI checks but still needs a full keyboard and
  screen-reader audit in packaged builds.
- The native scrcpy mirror opens as an owned low-latency control window. The
  embedded inspector uses MJPEG or screenshot fallback; embedded scrcpy decoding
  is not yet the default presentation.

## Web automation standpoint

### Browsing and targets

- Electron webview browsing, tabs, address navigation, back/forward/refresh/home,
  history, bookmarks, and permission-aware desktop integration.
- Separate Playwright-based execution path for evidence-rich replay.
- Runtime selection between embedded-webview and Playwright execution, plus
  automatic routing based on the recording target.
- Supported baseline: Node.js 20/22, npm 10, Electron 40, and the Chromium bundled
  with Electron. Exact dependency versions live in `package-lock.json`.

### Inspection and locators

- Element inspection with DOM metadata and ranked locator candidates.
- CSS, ID, XPath, text, ARIA/accessibility, data-test, class, and relative locator
  generation depending on available element data.
- Locator fingerprints include stable attributes and structural context for
  healing and diagnostics.
- Element discovery and Page Object Model/JSON export surfaces are present.

### Recording and authoring

- Auto, manual, and step-by-step recording modes.
- Browser actions include navigation, click/double-click/right-click, input,
  select, checkbox/radio, keyboard, focus, hover, scroll, drag/drop, upload,
  submit, waits, assertions, scrape, API, mock, visual, accessibility,
  performance, and plugin actions where their engines support them.
- Versioned recording schema with backward-compatible migration and target
  metadata.
- Save, import, reopen, rename, delete, duplicate, reorder, disable, and edit
  recorded steps.
- Variables, environment profiles, reusable flows, lifecycle hooks, breakpoints,
  per-step timeouts/retries, and continue-on-failure policy.
- Assertions cover visibility, text, values, attributes, counts, URL, title, and
  response status in supported engines.

### Replay and resilience

- Run states, cancellation, pause, resume, single-step, global timeout, step
  timeout, retries, deterministic wait primitives, and result normalization.
- Web driver adapter and platform-neutral automation contracts.
- Locator healing with scored candidates, thresholds, approval policies,
  history, audit data, and optional persistence of approved replacements.
- Healing evidence is visible in execution results and reports.
- Secrets and recording inputs pass through schema validation and sanitization;
  IPC uses allowlists and trusted-renderer checks.

### Suites, matrices, and workflow

- Named suites containing copied test recordings, enabled state, and suite/test
  tags.
- Browser matrix configuration, visual browser tags, concurrency control, and job
  expansion.
- CLI selection by tags and matrix dimensions with result output.
- Suite UI uses three guided stages: define suite, add tests, configure/run matrix.
- See [Suites and Automation Workflows](SUITES_AND_WORKFLOWS.md) for operating
  guidance.

### Reporting and evidence

- Per-step status, duration, retries, error, screenshot evidence, and healing data.
- Run-history workspace with totals, trends, filtering, rerun, and comparison.
- HTML, JSON, JUnit, HAR, Allure-oriented, and PDF report/export foundations.
- Console/network summaries and evidence-retention primitives are available where
  the selected executor supplies them.

### Other implemented foundations

- Scraper Studio models for list/table extraction, mapping, cleaning,
  deduplication, pagination/infinite-scroll, and CSV/JSON/Excel-oriented output.
- Visual baseline, accessibility, performance, API/mock, scheduling, remote
  execution, and plugin foundations with deterministic tests.
- Sandboxed Plugin SDK with manifest validation, permissions, extension points,
  lifecycle events, execution limits, and isolated failures. See
  [Plugin SDK](PLUGIN_SDK.md).

### Web limitations and remaining hardening

- A packaged Electron record-to-report E2E suite against controlled fixture apps
  is still required for release certification.
- Popup/new-window, downloads, renderer crashes, unexpected navigation, and some
  permission/storage failure policies need broader packaged-app testing.
- Cross-origin iframe and closed Shadow DOM behavior must remain explicit; these
  browser security boundaries cannot be treated as universally inspectable.
- Engine parity is capability-dependent. A recording is only engine-independent
  after it passes both embedded-webview and Playwright paths.
- Advanced testing modules are useful foundations, not hosted enterprise services.

## Mobile automation standpoint

### Supported targets

- Android native, hybrid, and mobile-web recording metadata and driver routing.
- Appium 3 with UiAutomator2 is the implemented transport.
- Emulator, USB, and ADB network targets are discoverable.
- iOS/XCUITest is not implemented and requires a macOS execution environment.

### Setup and device selection

- Setup Doctor checks Appium, UiAutomator2, ADB, Java, connected targets, and
  scrcpy availability with actionable remediation.
- Connected-device picker parses `adb devices -l`, shows friendly model,
  transport, and state, disables unauthorized/offline targets, refreshes on
  demand, and auto-selects a sole ready device.
- Selecting a target fills its device name and exact serial/UDID. Manual entry
  remains available.
- Reusable profiles store target configuration while rejecting secret-like
  capabilities.
- Capability form plus validated advanced JSON supports controlled expert use.

### Appium infrastructure

- External/user-managed localhost Appium endpoints remain supported.
- Optional application-managed Appium mode starts and owns local processes,
  polls readiness, keeps bounded logs, exposes health, and cleans up only its own
  processes.
- Each managed Android session receives unique Appium, UiAutomator2 `systemPort`,
  Chromedriver, and MJPEG ports.
- Startup failures, timeouts, cancellation, disconnect, and application shutdown
  have bounded cleanup behavior.
- Remote Appium hosts remain disabled until explicit host trust and secret policy
  are implemented.

### Mobile inspection and streaming

- Appium screenshot and XML hierarchy retrieval, parsed native tree, element
  bounds, hit testing, highlighting, and ranked locator selection.
- Accessibility ID and resource ID are preferred; UiAutomator/class are fallback
  strategies; XPath and coordinates are progressively less preferred.
- Large portrait device frame, orientation-aware coordinate mapping, context and
  screen badges, hierarchy/locator tabs, and toolbar actions.
- Native scrcpy mirror/control is available from **Live mirror**, bound to an
  explicit serial and owned by the application.
- Embedded transport supports Appium MJPEG frame parsing with screenshot polling
  fallback, stale-frame avoidance, health state, and latency metadata.
- Hierarchy retrieval is decoupled from video frames and supports explicit,
  action-triggered, pause, and debounced-hover refresh policy.

### Mobile recording and actions

- **Record on Device** provides connection-gated start, pause/resume, stop,
  duration, step count, assertion shortcut, and a live action feed in Mobile
  Device Studio.
- Pointer interactions on the device preview are translated into normalized tap,
  long-press, and swipe actions, executed through the active Appium session, and
  appended to the shared editable recorder timeline in real time.
- Recording inserts one initial launch step, suppresses rapid duplicates, retains
  hierarchy age and stream/device coordinates, and visibly identifies semantic,
  ambiguous, and coordinate-only resolution.
- Locator-backed steps retain ranked candidates, element bounds, text,
  accessibility name, node path, context, screen, orientation, and application
  identity for replay and healing.
- Two taps on the same target within 300 ms are coalesced into one replayable
  Android double-tap step. Editable fields open a clear-and-type capture dialog;
  likely secrets are automatically marked and stored as redacted placeholders.
- Cached hierarchy hover previews show the predicted element, locator, and
  stability without blocking pointer input. Concurrent refresh requests share one
  in-flight Appium hierarchy operation.
- Live-feed steps can be opened in the full timeline editor or deleted while the
  device recording session remains active; the launch step remains protected.
- Tap/click, input, clear, back, hide keyboard, rotate, long press, swipe, scroll,
  waits, visible/text/value assertions, and coordinate fallback.
- Launch, terminate, restart, install, deep link, accept/dismiss alert,
  grant/revoke permission, upload/push file, and context switching.
- Search, Go, Enter, and Home use UiAutomator2 `mobile: pressKey`, with a guarded
  legacy fallback for older compatible servers.
- Destructive **Clear app data** uses an explicit serial and package, requires
  confirmation, runs targeted `adb shell pm clear`, records duration/output, and
  can relaunch the app.
- Generic `WEBVIEW` switching uses bounded polling. Explicit WebView names remain
  supported, and Chromedriver auto-matching or pinned executable capabilities are
  available for online and controlled/offline environments.

### Mobile healing, replay, and evidence

- Mobile fingerprints include platform, automation name, app/package, screen,
  context, orientation, role/class, ancestry, bounds, and locator candidates.
- Healing is context-constrained, uniqueness-aware, approval-driven, and guarded
  for destructive actions.
- Saved Android recordings automatically route through the Appium driver.
- Live authoring sessions are reused; replay-owned sessions are cleaned up.
- Evidence includes per-step screenshots, final hierarchy, capabilities, context
  transitions, logcat when available, healing history, and normalized results.

### Mobile export

- Executable Appium TypeScript, Java, and Python export options.
- Exports include capabilities, session lifecycle, locator mapping, WebView waits,
  key actions, common interactions, assertions, and guaranteed cleanup.
- Destructive app-data clearing is intentionally not silently executed by exported
  tests; it requires an approved reset fixture.

### Mobile verification status

- Deterministic Android fixtures cover recording persistence, login workflow,
  inspection, actions, healing, replay, diagnostics, infrastructure, streaming,
  exporters, and two concurrent managed sessions with eight unique ports.
- Physical certification passed on a CUBOT KINGKONG_ES, Android 14/API 34:
  scrcpy 4.1 server deployment and Direct3D 11 rendering, Appium session creation,
  hierarchy and screenshot capture, `mobile: pressKey`, and clean session teardown.
- FFmpeg Essentials 8.1.1 is installed on the certification workstation.
- Physical two-device concurrent replay is pending because only one authorized
  target was attached. See [Android Compatibility Matrix](ANDROID_COMPATIBILITY_MATRIX.md).

## Security and data integrity

### Implemented baseline

- Electron context isolation, constrained preload API, IPC channel allowlists,
  trusted-renderer checks, CSP, navigation restrictions, and external URL allowlist.
- Recording/schema validation, file-size and path controls, sanitized persisted
  actions, secret-like capability rejection, and safe-storage integration.
- Explicit confirmation for destructive user actions.
- Plugin sandbox and permission approval model.

### Remaining security work

- Complete threat model and packaged-app penetration review.
- Broader evidence redaction for screenshots, hierarchy, logs, clipboard, and
  notification content.
- Formal per-origin permissions, storage quotas, retention, corruption recovery,
  and privacy-mode acceptance tests.
- Signed installers, upgrade/rollback verification, and dependency/security CI.

## Architecture at a glance

```text
Electron shell + renderer workspaces
             |
Versioned recording + target metadata
             |
AutomationDriver contract
       /                    \
WebAutomationDriver     AndroidAutomationDriver
Playwright/webview      Appium/UiAutomator2 + ADB
       \                    /
 recorder · healing · suites · reports · exporters
```

Key code areas:

- `src/automation/`: shared target and driver contracts.
- `src/drivers/web/`: web execution adapter.
- `src/drivers/appium/`: client, Android driver, process/port management, device
  commands, and Appium exporters.
- `src/mobile/`: hierarchy, screenshot authoring, healing, diagnostics, and
  streaming.
- `src/recording/` and `src/recorder/`: schema, sanitization, authoring, exports.
- `src/executor/`, `src/suite/`, `src/reporter/`: execution, matrices, reports.
- `electron-main.js`, `preload.js`, `ui/`: desktop ownership, secure IPC, and UX.

## Verification and release interpretation

Run the complete deterministic gate with:

```powershell
npm.cmd run check
```

Current result: 35 suites and 183 tests, plus lint and production build. The test
count may grow; a green `npm run check` is the operative requirement.

“Implemented” means the code path and deterministic coverage exist. “Physically
certified” means it ran against named hardware. “Production-ready” additionally
requires packaged Electron E2E, installer/signing, upgrade/rollback, security,
performance, and supported-environment acceptance gates.

## Recommended next work

1. Run the existing web record/edit/save/restart/replay/heal/report/export journey
   against packaged Electron artifacts and add inspector and failure/recovery
   coverage.
2. Attach a second Android target and publish the physical concurrent replay result.
3. Decompose renderer/styles and move remaining IPC payloads to typed contracts.
4. Complete evidence redaction, origin permissions, retention, and corruption
   recovery acceptance tests.
5. Add Windows signed installer, upgrade/rollback, security, and performance gates.
6. Begin iOS only after a macOS/XCUITest worker and signing strategy exist.

## Deferred product direction

After Android interaction recording and replay are repeatably certified across
representative physical-device journeys, implement APK upload and CI/CD-triggered
execution. This future capability will cover versioned application builds,
isolated runners, live run monitoring, provider status callbacks, and diagnostic
artifacts. It must not displace the current recording/replay reliability work.

See [Future CI/CD and APK Execution](FUTURE_CICD_AND_APK_EXECUTION.md) for the
proposed scope, architecture, security requirements, delivery sequence, and
acceptance criteria.

## Active documentation

- [Documentation index](README.md)
- [Getting started](GETTING_STARTED.md)
- [Suites and workflows](SUITES_AND_WORKFLOWS.md)
- [Android compatibility matrix](ANDROID_COMPATIBILITY_MATRIX.md)
- [Runtime compatibility](COMPATIBILITY.md)
- [Plugin SDK](PLUGIN_SDK.md)
- [Testing](TESTING.md)
- [Future CI/CD and APK execution](FUTURE_CICD_AND_APK_EXECUTION.md)
- [Historical archive](archive/README.md)
