# Runtime Compatibility

Last verified: 14 August 2026

| Component | Current supported baseline |
| --- | --- |
| Desktop OS | Windows 10/11 primary target |
| Node.js | 20.x or 22.x |
| npm | 10.x |
| Electron | 40.x |
| Embedded browser | Chromium bundled with Electron 40.x |
| Web execution | Embedded webview and installed `playwright-core` |
| External browsers | Installed Chrome/Edge channels supported by Playwright |
| Android transport | Appium 3.x and UiAutomator2 |
| Android tooling | ADB/platform-tools 36 validated; compatible recent versions expected |
| Android physical evidence | Android 14/API 34 CUBOT KINGKONG_ES |
| Device mirror | scrcpy 4.1 physically verified; MJPEG/screenshot fallback |
| Optional decoding tooling | FFmpeg Essentials 8.1.1 installed on certification host |
| iOS | Not implemented |

Exact JavaScript dependency versions are recorded in `package-lock.json`. A
dependency, Electron, Appium, driver, SDK, or device-OS upgrade is supported only
after `npm.cmd run check` and relevant physical smoke tests pass.

The embedded Electron webview and Playwright executor are separate browser
processes. Recordings are engine-independent only after they pass on both.

Remote Appium hosts are intentionally rejected until host trust, transport
security, and secret handling are explicitly implemented.
