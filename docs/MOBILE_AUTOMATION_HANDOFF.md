# Mobile Automation Session Handoff

Date: 11 August 2026  
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

`npm run check` passed after the final UI cleanup:

- ESLint passed.
- 27 Jest suites passed.
- 145 tests passed.
- TypeScript compilation passed.
- Webpack compiled successfully.
- `git diff --check` passed; only expected Windows LF-to-CRLF warnings remain.

## Recommended next slice

Make the expanded screenshot an accurate authoring surface:

1. Map screenshot pointer coordinates to the original screenshot dimensions,
   including letterboxing and orientation.
2. Resolve the smallest compatible hierarchy element whose bounds contain the point.
3. Highlight that element and show its ranked locators before executing anything.
4. Let the user choose **Tap now**, **Add step**, or both; retain coordinates only as
   an explicit fallback when no stable locator exists.
5. Add tests for scaling, offsets, overlapping bounds, orientation, and no-match cases.

This preserves accessibility-first recordings while making the large device view
feel direct and precise.

## Remaining MVP work

- Wire saved mobile recordings into the main Replay workflow and Android driver selection.
- Reuse an existing live session safely during replay or close it before a managed run.
- Export executable Appium TypeScript tests.
- Add long-press, swipe/scroll, element-relative gestures, waits, and richer assertions.
- Add app install/launch/reset/terminate and deep-link controls.
- Add alerts, permissions, keyboard state, device logs, and disconnect recovery.
- Attach screenshots, hierarchy, capabilities, context transitions, and logs to reports.
- Add healing approval UI and persisted mobile healing audit history.
- Replace the basic Check session action with a full setup doctor.
- Add reusable device/app profiles and validated advanced capabilities.
- Add a deterministic sample APK login journey and a real emulator Electron E2E test.
- Publish and test the Android action/device compatibility matrix.
- Refactor the large renderer after web and mobile replay share the same driver routing.

## Resume checklist

1. Check out `feature/mobile-automation` and confirm the uncommitted worktree is present.
2. Run `git status --short --branch`; do not discard untracked `src/automation`,
   `src/drivers`, `src/mobile`, or their tests.
3. Start Appium and confirm the selected device is authorized in `adb devices -l`.
4. Run `npm run check` before beginning the next slice.
5. Manually smoke-test Connect -> Refresh hierarchy -> Expand view -> select locator
   -> Tap/Type -> Add step -> switch context -> Rotate -> Disconnect.

