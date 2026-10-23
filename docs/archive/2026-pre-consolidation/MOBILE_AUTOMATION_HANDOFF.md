# Mobile Automation Session Handoff

Date: 14 August 2026
Branch: `feature/mobile-automation`
Base commit: `951f00f` (`Updates`)  
Worktree: intentionally uncommitted; includes tracked edits and new untracked mobile modules/tests.

## Session outcome

Chromation can now open and own a persistent Android UiAutomator2 session through
Electron, display the device screenshot and parsed native hierarchy, rank locators,
run common live actions, and add locator-backed mobile steps to the existing
recorder. Mobile fingerprints carry app, screen, context, orientation, role,
ancestry, bounds, and ranked locator information for conservative healing.

The dashboard was also simplified by removing the duplicated Quick start block.
The mobile inspector can expand into a large portrait workspace so the screenshot,
hierarchy, and locator controls remain visible together.

Phase 0 and Phase 1 are now complete in the application and deterministic test
fixture. Android target metadata survives save/import/load; Replay automatically
routes mobile recordings through the main-process Appium driver; an existing live
authoring session is reused without being destroyed, while a managed replay session
is always cleaned up. Every replayed step captures a screenshot when available and
the run attaches normalized capabilities plus the final hierarchy. Recorder export
now includes executable Appium TypeScript.

Phase 2 is also implemented in code: long press, swipe/scroll, element waits,
richer assertions, lifecycle/reset/deep-link operations, alerts, permissions,
keyboard status, uploads, full setup doctor, reusable profiles, validated advanced
capabilities, preflight warnings, retries, timeouts, managed-session recovery,
healing audit data, logcat, context transitions, and richer report attachments.
The UI keeps these controls behind progressive disclosure in a focused Action
Studio. See [ANDROID_COMPATIBILITY_MATRIX.md](ANDROID_COMPATIBILITY_MATRIX.md).

## Completed slices

- Added platform-neutral automation contracts and a web driver adapter.
- Migrated recordings to backward-compatible schema version 2 with target metadata.
- Added an Appium HTTP client and Android automation driver.
- Added persistent connect, status, inspect, action, and disconnect lifecycle.
- Added Android source/screenshot inspection and hierarchy parsing.
- Ranked accessibility ID, resource ID, UiAutomator, class, and XPath locators.
- Added context-aware mobile fingerprints and conservative locator healing.
- Protected healing across incompatible apps, screens, contexts, and roles.
- Added stricter safeguards for destructive actions and ambiguous candidates.
- Added Electron IPC validation, trusted-renderer checks, and localhost Appium URL checks.
- Added device name, explicit UDID, app ID, connection state, and live session UI.
- Added live tap, type, clear, back, hide-keyboard, and rotate actions.
- Added native/WebView context discovery and switching.
- Added selected mobile actions to the existing recorder with fingerprint metadata.
- Removed repeated mobile status/setup UI and the dashboard Quick start duplication.
- Added an expandable portrait device inspector, restorable with its button or Escape.
- Added screenshot hit testing, element highlighting, stable-locator selection, and
  explicit coordinate fallback with portrait/landscape responsive presentation.
- Preserved Android target metadata through save, import, load, and rerun.
- Added automatic Appium replay routing, cancellation, and safe live/managed session ownership.
- Added per-step Android screenshots, capability evidence, and final hierarchy evidence.
- Added executable Appium TypeScript export to the Recorder.
- Added a deterministic Android login workflow covering record -> save -> reopen ->
  replay -> report -> export -> cleanup.

## Local environment known to work

- Node.js: `22.14.0` (project supports Node 20 through 22).
- Appium server: `3.6.0`, normally at `http://127.0.0.1:4723`.
- UiAutomator2 driver: `6.3.0`.
- Emulator used: `Medium_Phone_API_36.0` / serial such as `emulator-5554`.
- A physical device may also appear in `adb`; use the explicit serial/UDID field
  whenever more than one target is connected.

UiAutomator2 `8.2.2` was removed because its installed dependency tree produced an
ES-module cycle involving `asyncbox` and `p-limit` on this machine. Version `6.3.0`
passed the driver doctor and successfully accepted Android session requests.

Useful startup checks:

```powershell
appium.cmd driver list --installed
appium.cmd driver doctor uiautomator2
adb devices -l
appium.cmd
```

Both emulator and USB targets must show as `device`, not `unauthorized`, before
connecting. Accept the Android USB-debugging prompt when necessary.

## Verification at handoff

`npm run check` passes after the Phase 2 completion work:

- ESLint passed.
- 30 Jest suites passed.
- 160 tests passed.
- TypeScript compilation passed.
- Webpack compiled successfully.
- `git diff --check` passed; only expected Windows LF-to-CRLF warnings remain.

Local readiness was rechecked on 13 August 2026: Appium 3.6.0 and UiAutomator2
6.3.0 are installed; the driver doctor reports zero required fixes; Android SDK,
adb, emulator tooling, and Java are available. No emulator or USB device was online
during the final check. Optional bundletool, ffmpeg, and GStreamer integrations are
not installed and are not required for the Phase 2 action matrix.

## Completed authoring slice

The previous recommended expanded-screenshot authoring slice is complete:

1. Map screenshot pointer coordinates to the original screenshot dimensions,
   including letterboxing and orientation.
2. Resolve the smallest compatible hierarchy element whose bounds contain the point.
3. Highlight that element and show its ranked locators before executing anything.
4. Let the user choose **Tap now**, **Add step**, or both; retain coordinates only as
   an explicit fallback when no stable locator exists.
5. Add tests for scaling, offsets, overlapping bounds, orientation, and no-match cases.

This preserves accessibility-first recordings while making the large device view
feel direct and precise.

## Phase 2 completion and external certification

- Package the deterministic login fixture as a distributable sample APK.
- Run and publish the compatibility matrix against the nominated emulator/API levels
  and an authorized USB device in CI/device lab.
- Validate vendor-specific permission, alert, and log endpoints whenever pinned
  Appium or UiAutomator2 versions change.
- Refactor the large renderer after web and mobile replay share the same driver routing.

## Next planned milestone: Phase 2.1 hardening

The roadmap now treats the following as a P0 milestone before iOS work:

- Managed local Appium processes with health checks, owned-process cleanup, and
  collision-free per-device port bundles.
- A scrcpy-first live inspector with MJPEG and screenshot-polling fallbacks;
  hierarchy retrieval occurs on pause, debounced inspection hover, explicit
  refresh, and state-changing actions instead of per frame.
- Explicit, confirmed `adb shell pm clear` app-data reset with serial/package
  validation and diagnostic evidence.
- Bounded dynamic WebView waits plus automatic Chromedriver matching with pinned
  offline overrides.
- Typed Search, Go, Enter, and Home mobile-key actions with preflight support.
- Equivalent executable Appium exports for TypeScript, Java, and Python.

Detailed behavior, safety rules, fallbacks, and exit criteria are recorded in
[MOBILE_AUTOMATION_PLAN.md](MOBILE_AUTOMATION_PLAN.md#phase-21---android-infrastructure-and-handoff-hardening-p0-2-3-weeks).

Implemented on 14 August 2026:

- `AppiumProcessManager` owns local processes, polls readiness, retains bounded
  logs, and cleans up only its own instances.
- `PortAllocator` reserves unique Appium, UiAutomator2, Chromedriver, and MJPEG
  ports; the managed-mode UI injects them into capabilities automatically.
- Device streaming has a transport-neutral fallback coordinator, MJPEG frame
  parsing, screenshot polling, stale-frame avoidance, and stream health metadata.
- Hierarchy refreshes support explicit action/pause refresh and debounced hover.
- `clearAppData` validates serial/package, requires the application confirmation
  sheet, executes targeted `adb shell pm clear`, and captures a typed result.
- Generic `WEBVIEW` context changes now use bounded discovery waits; pinned and
  auto-matched Chromedriver capabilities are exposed by the Android driver.
- `mobileKey` supports Search, Go, Enter, and Home through Android keycodes.
- Recorder exports now include Appium TypeScript, Java, and Python options with
  context waits, key actions, locator mapping, lifecycle, and guaranteed cleanup.

The native scrcpy lifecycle is now wired through Electron and the inspector's
**Live mirror** action. Each mirror is bound to an explicit serial, exposes status
and bounded logs, is reused per target, and is cleaned up on disconnect or exit.
The embedded inspector retains MJPEG and screenshot fallbacks.

Deterministic certification now starts two managed Appium instances concurrently
and proves all eight Appium/UiAutomator2/Chromedriver/MJPEG ports are unique. The
single-device hardware path is now certified on a CUBOT KINGKONG_ES running
Android 14/API 34. scrcpy 4.1 rendered successfully through Direct3D 11, FFmpeg
Essentials 8.1.1 is installed, and a real UiAutomator2 session captured source and
screenshot evidence, executed `mobile: pressKey`, and cleaned up successfully.
Physical two-device replay remains pending because only one target is attached.

The Mobile target configuration now discovers `adb devices -l` targets through a
refreshable connected-device picker. It displays friendly model, transport, and
authorization state; disables unavailable targets; auto-selects a sole ready
device; and fills device name plus serial while preserving manual configuration.

## Resume checklist

1. Check out `feature/mobile-automation` and confirm the uncommitted worktree is present.
2. Run `git status --short --branch`; do not discard untracked `src/automation`,
   `src/drivers`, `src/mobile`, or their tests.
3. Start Appium and confirm the selected device is authorized in `adb devices -l`.
4. Run `npm run check` before beginning the next slice.
5. Manually smoke-test Connect -> Refresh hierarchy -> Expand view -> select locator
   -> Tap/Type -> Add step -> switch context -> Rotate -> Disconnect.
