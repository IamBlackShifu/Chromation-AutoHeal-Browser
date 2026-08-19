# Getting Started

## Requirements

- Windows 10/11 for the primary desktop experience.
- Node.js 20 or 22 and npm 10.
- Chrome or Edge when using external Playwright browser channels.

Android work additionally requires Java, Android platform tools (`adb`), Appium 3,
the UiAutomator2 driver, and an authorized USB device or running emulator. scrcpy
is optional but recommended for low-latency control.

## Install and start

```powershell
npm install
npm.cmd run check
npm.cmd start
```

`npm start` builds before launching Electron. During development, use
`npm.cmd run build` after source changes or `npm.cmd run dev` for TypeScript watch.

## First web recording

1. Open a target URL in the address bar.
2. Open **Recorder**, choose a recording mode, and select **Start Recording**.
3. Complete one focused workflow and stop recording.
4. Review selectors, values, waits, and assertions in the step list.
5. Replay the recording and inspect step evidence.
6. Save it, then optionally add it to a suite or export a script.

Use the embedded engine for quick in-app feedback and Playwright for richer
execution evidence. Treat a recording as engine-independent only after validating
both paths.

## First Android session

1. Enable USB debugging or start an emulator.
2. Open **Mobile** and select **Check session** to run Setup Doctor.
3. Choose a ready target from **Connected device**. OmniFlow QA fills the model and
   serial automatically.
4. Enter an app package when lifecycle/deep-link/reset actions require one.
5. Use the default localhost Appium endpoint, or enable **Manage local Appium**.
6. Select **Connect device**, refresh hierarchy, and choose an element.
7. Use **Tap now**, **Add step**, Action Studio, or **Live mirror** as needed.
8. Replay, inspect screenshots/logs/healing, then disconnect.

Unauthorized or offline devices are shown but cannot be selected. Accept the USB
debugging prompt on the device, then refresh the list.

## Suites and reports

See [Suites and Automation Workflows](SUITES_AND_WORKFLOWS.md) for naming,
organization, browser matrices, concurrency, report reading, and CLI selection.

## Troubleshooting

- Run `npm.cmd run check` after dependency or source changes.
- Use the in-app Diagnostics and Mobile Setup Doctor before changing capabilities.
- For Android, confirm `adb devices -l` reports `device`, not `unauthorized` or
  `offline`.
- Appium and auxiliary-port collisions are avoided by managed mode; external
  servers remain the user's responsibility.
- Current limitations and evidence are documented in
  [Current Product and Engineering State](CURRENT_STATE.md).
