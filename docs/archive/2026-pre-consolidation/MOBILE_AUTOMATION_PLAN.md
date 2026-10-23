# Mobile Application Automation Plan

Last reviewed: 14 August 2026

Current implementation and resume notes: [MOBILE_AUTOMATION_HANDOFF.md](MOBILE_AUTOMATION_HANDOFF.md).

## Implementation status

Phase 0, Phase 1, and the Android Phase 2 usable-MVP code paths are implemented on `feature/mobile-automation`. This includes
the shared contracts and schema migration, Android Appium session ownership,
screenshot/hierarchy authoring, ranked locators, mobile recording persistence,
automatic Android replay routing, conservative healing foundations, replay
screenshots and diagnostic evidence, Appium TypeScript export, and a deterministic
login workflow covering save, reopen, replay, report, and export. Phase 2 gestures,
lifecycle breadth, setup diagnostics, profiles, recovery, and physical-device/CI
coverage remain pending. Phase 2 adds gestures, lifecycle, alerts, permissions,
uploads, setup diagnostics, profiles, advanced capabilities, preflight, retries,
timeouts, reconnect handling, healing audits, logcat, and context/evidence capture.
See the handoff and [ANDROID_COMPATIBILITY_MATRIX.md](ANDROID_COMPATIBILITY_MATRIX.md).

## Goal and approach

Extend Chromation so its authoring, healing, execution, suites, and reporting
work for Android and iOS native, hybrid, and mobile-web applications. The easiest
maintainable route is to retain Chromation as the orchestration and UX layer and
use Appium as the device-automation transport.

Appium exposes platform drivers through W3C WebDriver, while Appium Inspector
can display screenshots and app hierarchies, find elements, run commands, and
record interactions. Those boundaries align with Chromation's modules:

- <https://appium.io/docs/en/latest/intro/appium/>
- <https://appium.io/docs/en/latest/ecosystem/tools/>

## Scope

### MVP

- Android native apps on one emulator and one USB device.
- Android hybrid apps with explicit native/webview context switching.
- Inspect, tap, long-press, type, clear, swipe, scroll, back, rotate, wait, assert.
- Record -> edit -> replay -> heal -> report in the existing workspace.
- App install/launch/reset/terminate lifecycle.
- Screenshots, page source, device logs, capabilities, and healing evidence.
- Export executable Appium TypeScript tests.

### Next

- iOS simulator and real-device support through XCUITest on macOS.
- Mobile web on Android Chrome and iOS Safari.
- Device matrices, cloud providers, deep links, permissions, biometrics,
  geolocation, notifications, and network conditioning where supported.

### Deferred

- A custom mobile driver, vision-only interaction, owning a physical device farm,
  and parity for every vendor-specific command.

## Architecture

```text
Chromation UI / CLI
        |
Canonical recording (platform + actions + locators + capabilities)
        |
AutomationSession + AutomationDriver contracts
        |-------------------------------|
WebAutomationDriver                 MobileAutomationDriver
(Playwright/webview)                (Appium client)
                                            |
                                      Appium Server
                                      /           \
                              Android driver    iOS driver
```

Recorder, healing, reporting, suites, matrices, secrets, and policies remain
platform-neutral. Only inspection and command execution are driver-specific.

### New core contracts

Create these under `src/automation/` before adding Appium dependencies:

- `AutomationPlatform`: `web | android | ios` and `native | hybrid | mobileWeb`.
- `AutomationSession`: lifecycle, capabilities, contexts, device/app metadata.
- `AutomationDriver`: inspect, locate, execute, screenshot, source, logs, close.
- `CanonicalAction`: shared actions plus typed platform extensions.
- `LocatorCandidate`: strategy, value, context path, score, fingerprint.
- `CapabilityDescriptor`: name, type, default, secret flag, platform, validation.
- `DriverCapabilities`: supported features used by preflight and the UI.

Use discriminated action unions. Shared actions such as `activate`, `input`,
`wait`, and `assert` get common semantics. Mobile-only `swipe`, `longPress`,
`rotate`, `hideKeyboard`, and `switchContext` keep typed payloads. Do not force
mobile gestures into CSS-click-shaped records.

### Locator and healing model

Prefer, in order:

1. Accessibility ID/content description.
2. Stable resource ID (Android) or identifier/name (iOS).
3. Platform-native predicate/class-chain strategies where appropriate.
4. Text/label plus type and ancestry.
5. XPath only as a fallback.
6. Coordinates/image matching only as an explicit last resort.

Fingerprints include platform, automation name, app/package/bundle, screen or
activity, native/webview context, window, ancestors, role/class, label/text/value,
bounds, state, and ranked locators. Healing stays within compatible contexts and
roles, requires uniqueness, and defaults to `ask` until false-heal rates are
known. Never silently heal destructive actions such as purchase or delete.

## Ease-of-use design

- Add a **Mobile** project target instead of a separate app.
- Provide a setup doctor for Appium, installed drivers, Android SDK, `adb`, Java,
  emulator/device visibility, Xcode, signing, and WebDriverAgent.
- Generate validated capability forms; retain advanced JSON for experts.
- Offer reusable device/app presets and protect secret capabilities.
- Show a live device mirror, hierarchy, locator candidates, and one-click actions
  in the existing Inspector workspace.
- Always show context, screen/activity, orientation, keyboard, and connection state.
- Preflight recording/replay and provide actionable remediation.
- Ship native smoke, login, hybrid checkout, deep-link, permission, and mobile-web
  templates.
- Reference APK/IPA/build artifacts through a provider-neutral model.
- Offer a managed local Appium mode that discovers an available port, reports
  startup health and logs, and reliably stops only processes it owns.
- Prefer a low-latency scrcpy stream for Android interaction, with MJPEG as a
  compatible fallback and screenshot polling as the final fallback.

## Delivery plan

### Phase 0 - Reliability and contracts (P0, 1-2 weeks)

Status: **Complete in automated local coverage.** Existing web recordings migrate,
the automation contracts have web and Android contract tests, Electron IPC and UI
surfaces have smoke coverage, and the complete repository check remains green.

- Complete the local Electron happy-path fixture and smoke E2E test.
- Inventory action semantics across schema, renderer, executor, reports, exporters.
- Add automation contracts and web-adapter contract tests.
- Migrate recordings to a backward-compatible schema with target metadata.

Exit: web recordings migrate and all current checks remain green.

### Phase 1 - Android proof of concept (P0, 2 weeks)

Status: **Complete in code and deterministic fixture coverage.** A real Appium
installation remains necessary for the optional hardware smoke described in the
handoff, but it is no longer a code-path blocker.

- Add Appium connection/session lifecycle and an Android profile.
- Connect a sample APK on one emulator.
- Implement source/screenshot inspection and stable locator strategies.
- Execute launch, tap, input, clear, back, wait, and assertions.
- Reuse Reporter evidence and export an Appium TypeScript test.

Exit: a deterministic login records, saves, reopens, replays, and reports.

### Phase 2 - Android usable MVP (P0, 3-4 weeks)

Status: **Complete in application code and deterministic fixture coverage.** The
published compatibility matrix distinguishes this from environment certification;
real-device/API-level runs remain an external validation gate.

- Add gestures, orientation, lifecycle, deep links, alerts, permissions, keyboard,
  hybrid contexts, uploads, and logs.
- Add setup doctor, profiles, preflight, cancellation, timeouts, disconnect
  recovery, and an action-support matrix.
- Add mobile fingerprints, fallbacks, healing approval, and audit history.
- Test an emulator and real device across nominated OS/API levels.

Exit: the Android action matrix passes locally and in CI/device lab.

### Phase 2.1 - Android infrastructure and handoff hardening (P0, 2-3 weeks)

Status: **In progress.** The managed Appium lifecycle, collision-free Android port
bundles, Electron ownership IPC, MJPEG/screenshot stream fallback contract,
hierarchy refresh policy, safe app-data reset, dynamic WebView wait, mobile keys,
and TypeScript/Java/Python export paths are implemented with deterministic coverage.
Native scrcpy mirror/control lifecycle is implemented with MJPEG/screenshot fallback,
and two managed sessions have deterministic collision coverage. An embedded scrcpy
decoder and real two-device certification remain external/tooling-dependent work.
This is a required hardening milestone before Phase 3. It
extends the completed Phase 2 action surface without changing the canonical
recording model or making streaming a prerequisite for automation.

#### Appium infrastructure management

- Add an `AppiumProcessManager` for opt-in local server ownership: executable and
  driver validation, start, readiness polling, structured stdout/stderr capture,
  graceful shutdown, forced-cleanup fallback, and orphan detection on restart.
- Discover and reserve an available loopback port per managed server. Hold the
  reservation until process spawn and verify readiness against that exact server
  to avoid time-of-check/time-of-use collisions.
- Allocate isolated Appium base paths and Android system ports (`systemPort`,
  `chromedriverPort`, MJPEG/server ports where applicable) per device/session.
- Keep remote or user-managed Appium endpoints supported. Never terminate a
  process Chromation did not start, and surface ownership, PID, endpoint, logs,
  and health in diagnostics.
- Add bounded startup/restart policies and deterministic cleanup for normal exit,
  cancellation, renderer failure, and application shutdown.

#### Inspector and streaming performance

- Add a transport-neutral `DeviceStream` contract with scrcpy as the preferred
  Android implementation, Appium MJPEG as fallback, and current screenshot polling
  as the no-extra-dependency fallback.
- Decouple visual streaming from Appium hierarchy retrieval. Pull XML on stream
  pause, explicit refresh, inspection hover after a short debounce, and after
  state-changing actions; do not continuously request page source per frame.
- Map pointer input through stream viewport, letterboxing, rotation, density, and
  device dimensions before hit testing or dispatch.
- Apply backpressure by dropping stale frames, keep only the newest pending frame,
  and automatically degrade transports when startup, decoding, or health checks fail.
- Show stream transport, latency, paused/live state, stale-hierarchy age, and
  fallback reason without blocking recording or replay.

#### Resilience and diagnostics

- Add an explicit **Clear app data** reset option backed by
  `adb -s <serial> shell pm clear <package>`. Validate serial and package, require
  confirmation, distinguish it from cache-only reset language, then relaunch and
  wait for the configured activity when requested.
- Capture the clear result, command duration, relaunch state, and remediation in
  diagnostics. Never run it against an implicit device when multiple targets exist.
- Add bounded WebView discovery waits with context polling, actionable timeout
  evidence, native-context fallback, and recovery when a WebView is recreated.
- Support automatic Chromedriver compatibility through UiAutomator2 capabilities
  and Appium-managed driver discovery/download where policy permits. Provide pinned
  executable and mapping-file overrides for offline or controlled environments,
  and record browser/driver versions in reports.
- Add typed mobile key actions for Search, Go, Enter, and Home. Use W3C/Appium
  commands where supported, Android keycodes as the platform fallback, and declare
  unsupported combinations during preflight rather than during execution.

#### Developer tooling and cross-team export

- Retain Appium TypeScript export using W3C WebDriver semantics.
- Add executable Appium Java and Python exporters using official client bindings,
  including capabilities, session lifecycle, contexts, waits, gestures, key actions,
  evidence hooks, and `finally` cleanup.
- Centralize action-to-command mapping so TypeScript, Java, and Python exports share
  locator priority, timeout, escaping, and fallback semantics.
- Generate dependency/version manifests and concise run instructions with every
  export. Reject or annotate actions that cannot be represented faithfully.

Exit: two Android targets can replay concurrently through independently managed
local Appium sessions without port collisions; the inspector sustains live control
with hierarchy refreshes decoupled from frames; reset, dynamic WebView, and mobile
key workflows pass deterministic tests; and the same fixture exports runnable,
semantically equivalent TypeScript, Java, and Python tests.

### Phase 3 - iOS support (P1, 3-5 weeks)

- Add a macOS worker and XCUITest profile.
- Implement simulator first, then signed WebDriverAgent real-device flows.
- Reuse contract tests; add iOS locators, alerts, lifecycle, permissions,
  webview/Safari contexts, evidence, and diagnostics.

Exit: sample journeys pass on a simulator and nominated real device.

### Phase 4 - Scale and polish (P1/P2, 3-6 weeks)

- Add local/remote matrices and a provider adapter that maps generic capabilities
  to cloud options without leaking them into recordings.
- Add queues, leases, health, retries, concurrency, retention, secrets, cost
  controls, and synchronization.
- Enable performance/accessibility/visual features only where drivers support
  them; surface unsupported features before execution.

Exit: one suite runs across selected browser/mobile targets with comparable
reports and no provider-specific test rewrite.

## Proposed layout

```text
src/
  automation/       # contracts, actions, preflight, capabilities
  drivers/web/      # current Playwright/webview adapter
  drivers/appium/   # client, server/session lifecycle, commands
  mobile/inspector/ # hierarchy and screenshot model
  mobile/recorder/  # gesture/context normalization
  mobile/healing/   # fingerprints and scoring
  mobile/diagnostics/
tests/contracts/
tests/fixtures/mobile/
tests/e2e/mobile/
```

## Quality strategy

- Unit-test command mapping without a device.
- Run driver contracts against deterministic sample apps.
- Run Android emulator smoke tests on relevant PRs; broader API and real-device
  matrices nightly.
- Run iOS simulator tests on macOS and real devices in protected workflows.
- Pin and report Appium, driver, SDK, device OS, and sample-app versions.
- Separate infrastructure failures from app failures.
- Preserve server/device logs, screenshot, hierarchy, optional video,
  capabilities, context transitions, and the failed command.

## Risks and controls

| Risk | Control |
| --- | --- |
| Platform behavior diverges | Capability preflight and per-driver contracts |
| Hierarchy/IDs change | Accessibility-first locators and conservative healing |
| iOS needs macOS/signing | Remote macOS worker, simulator-first, certificate rotation docs |
| Gestures vary by screen | Element-relative normalized coordinates with safe-area/orientation metadata |
| Hybrid contexts are flaky | Explicit context waits and recorded context transitions |
| Device outages look like app bugs | Infrastructure error class, health checks, provider diagnostics |
| Evidence contains sensitive data | Extend redaction to screenshots, source, logs, clipboard, notifications |
| Upgrades break drivers | Version pinning, compatibility matrix, scheduled contract suite |
| Managed servers leak or collide | Explicit ownership, per-session port bundles, readiness checks, shutdown audit |
| Live stream overloads Appium | Separate stream transport, hierarchy debounce, stale-frame dropping, fallback ladder |
| `pm clear` destroys unintended data | Explicit serial/package validation, confirmation, audit evidence |
| WebView/Chromedriver mismatch | Bounded context waits, version evidence, managed matching plus pinned offline override |
| Export languages drift | Shared command model and cross-language golden/fixture tests |

## MVP acceptance criteria

- A non-coder connects an Android emulator using guided diagnostics.
- Native and hybrid sample journeys can be inspected, recorded, edited, saved,
  restarted, replayed, healed with approval, and reported.
- Selecting another supported Android target requires no test source change.
- Unsupported actions fail at preflight, not during a run.
- Cancellation, timeout, disconnect, app crash, and cleanup are deterministic.
- Secrets and sensitive regions are absent from saved evidence.
- Mobile contract/E2E tests and existing web checks pass in CI.
- A tested action/device compatibility matrix is published.
- Two local devices can run concurrently without Appium or Android auxiliary-port
  collisions, and every managed process is accounted for after completion.
- Live inspection remains usable when scrcpy is unavailable by falling back to
  MJPEG and then screenshot polling without changing recorded steps.
- TypeScript, Java, and Python exports preserve equivalent actions, locators,
  waits, contexts, key commands, and cleanup behavior.

## First implementation slice

Start with one Android emulator, one bundled sample APK, and one login journey.
Implement contracts, session creation, screenshot/source, accessibility-ID lookup,
tap/input/assert, evidence, and TypeScript export. This validates the design before
recorder mirroring, gestures, healing, iOS signing, or cloud providers.
