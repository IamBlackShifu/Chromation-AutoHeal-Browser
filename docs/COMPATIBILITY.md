# Compatibility

The following versions define the supported development and execution baseline
for Chromation 0.2.x.

| Component | Supported baseline |
| --- | --- |
| Node.js | 20.x and 22.x |
| npm | 10.x |
| Electron | 40.x |
| Embedded browser | The Chromium version bundled with the supported Electron 40.x release |
| Playwright executor | `playwright-core` 1.58.x |
| External Chrome | Current stable Chrome through Playwright's `chrome` channel |
| Operating systems | Windows 10/11 are the primary desktop target; Linux is used for CI unit/build verification |

Exact dependency versions are recorded in `package-lock.json`. A dependency
upgrade is supported only after `npm run check` and the Electron workflow tests
pass against it.

The embedded Electron webview and the separate Playwright executor are different
browser processes. A recording must pass on both engines before behavior is
described as engine-independent.
