# Android Automation Compatibility Matrix

Last verified: 14 August 2026

The matrix is enforced by `ANDROID_ACTION_MATRIX` and the mobile replay preflight.
“Supported” means command mapping and deterministic fixture coverage exist. A real
device or emulator smoke remains required when changing Appium, UiAutomator2, the
Android SDK, or nominated OS/API levels.

| Capability | Native | Hybrid native context | WebView context | Evidence |
| --- | --- | --- | --- | --- |
| Inspect screenshot and hierarchy | Supported | Supported | Context-dependent | Screenshot + XML |
| Tap/click, input, clear | Supported | Supported | Supported locator dependent | Per-step screenshot |
| Double tap recording/replay | Supported | Supported | Driver dependent | Coalesced timeline step + UiAutomator2 gesture |
| Long press | Supported | Supported | Native context recommended | Per-step screenshot |
| Swipe and scroll | Supported | Supported | Supported | Per-step screenshot |
| Back, rotate, hide keyboard | Supported | Supported | Supported | Status + screenshot |
| Explicit context switch | N/A | Supported | Supported | Transition attachment |
| Time and element waits | Supported | Supported | Supported | Step timing |
| Visible, text, and value assertions | Supported | Supported | Supported locator dependent | Expected/actual + screenshot |
| Launch, terminate, reset | Supported | Supported | App package required | Step result |
| Deep link | Supported | Supported | App package required | Step result |
| Accept/dismiss alerts | Supported | Supported | Driver dependent | Step result |
| Grant/revoke permissions | Supported | Supported | Android permission required | Step result |
| Push/upload file | Supported | Supported | Remote path returned by test data | Step result |
| Locator healing | Supported | Supported | Same-context only | Healing audit in report |
| Logcat collection | Supported | Supported | Supported | JSON attachment |
| Native scrcpy mirror/control | Supported when installed | Supported | Device-wide | Owned process logs/status |
| Embedded MJPEG stream | Supported when endpoint available | Supported | Device-wide | Transport/latency status |
| Search, Go, Enter, Home keys | Supported | Supported | Driver dependent | Step result |
| Clear app data | Supported with confirmation | Supported | App package required | Serial/package/duration result |
| Concurrent managed sessions | Deterministically certified (2) | Deterministically certified (2) | Port-isolated | Unique four-port bundle per target |

## Phase 2.1 certification status

- Two concurrent managed Appium instances are covered deterministically with eight
  unique reserved ports across Appium, UiAutomator2, Chromedriver, and MJPEG.
- scrcpy processes are scoped to explicit device serials, reused per target, exposed
  through the inspector's **Live mirror** control, and stopped on disconnect or app exit.
- The embedded inspector remains available through MJPEG and screenshot fallbacks
  when scrcpy is missing or cannot start.
- Single-device physical certification passed on 14 August 2026 using a CUBOT
  KINGKONG_ES (`KKES250227044644`), Android 14/API 34, 720x1612. scrcpy 4.1
  deployed its server, rendered through Direct3D 11, and decoded a 320x720 live
  texture; FFmpeg Essentials 8.1.1 is installed for future embedded decoding work.
- A real UiAutomator2 session captured a 57,732-character hierarchy, executed
  `mobile: pressKey`, returned HTTP 200, and deleted the session cleanly. A prior
  pass also captured a 399,396-character base64 PNG screenshot response.
- **Record on Device physical journey passed on 14 August 2026** against Android
  Settings on the same KINGKONG_ES target: 11 reversible steps across five screens,
  exact clear-and-type of `display`, a W3C swipe, Back navigation, and final-screen
  verification at Connection preferences. Replay completed in 16.209 seconds.
- The certification used `noReset`, changed no Settings toggles, avoided the
  previously focused banking QA application, and deleted the Appium session and
  managed server process tree afterward.
- Physical **two-device** certification remains pending because only one authorized
  target is attached. Deterministic two-session/eight-port collision coverage passes.

## Guardrails

- Accessibility ID and resource ID remain preferred over XPath.
- Coordinates are allowed only as an explicit fallback and produce a preflight warning.
- Healing never crosses application, screen, context, automation-name, or role boundaries.
- Destructive actions always require approval even under automatic healing policy.
- Remote Appium hosts are rejected until host permissions and secret handling are implemented.
- Advanced capabilities accept only `platformName` and scalar `appium:` keys.
