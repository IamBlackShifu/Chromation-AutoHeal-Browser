# Testing and Verification

## Complete deterministic gate

```powershell
npm.cmd run check
```

This runs ESLint, all Jest suites in-band, TypeScript compilation, and Webpack.
As of 14 August 2026 the gate passes 35 suites and 183 tests.

The interactive desktop smoke gate is separate:

```powershell
npm.cmd run test:e2e:electron
```

It launches Electron through Playwright with isolated application data, serves a
deterministic local fixture, verifies the premium shell and Mobile device picker,
then browses, records, edits a locator, saves, restarts, reopens through the UI,
replays with automatic locator healing, verifies the report, and exercises script
and report exports. It captures a failure screenshot when needed and closes the
application deterministically.

## Useful commands

```powershell
npm.cmd test -- --runInBand
npm.cmd test -- --runInBand tests/mobile-phase21.test.ts
npm.cmd run lint
npm.cmd run build
git diff --check
```

Focused tests are useful during implementation, but a change is not complete until
the full `check` command passes.

## Coverage areas

- Web driver, browser core, recording schema, recorder, replay/executor, healing,
  reports, history, security, plugins, suites, and matrices.
- Electron/renderer structural tests for core workflows, mobile UI, premium shell,
  report workspace, and user guidance.
- Android Appium client/driver commands, inspection, screenshot authoring, healing,
  IPC, Phase 1/2 workflows, Phase 2.1 infrastructure, streaming, and exporters.
- Deterministic two-session port isolation and managed-process cleanup.

## Hardware checks

Deterministic mocks do not certify USB, emulator, Appium-driver, browser-driver,
GPU, or operating-system behavior. Record hardware evidence separately.

Current Android physical evidence is in
[Android Compatibility Matrix](ANDROID_COMPATIBILITY_MATRIX.md). When validating a
new device or Appium/UiAutomator2 version, cover at minimum:

1. Device discovery and authorization.
2. Appium session creation with explicit serial.
3. Hierarchy and screenshot capture.
4. Stable locator selection and one element action.
5. Gesture, key, context, and lifecycle paths relevant to the target app.
6. Evidence/report generation.
7. Session, instrumentation, forwarded-port, Appium, and scrcpy cleanup.

## Release interpretation

- **Implemented:** code path plus deterministic coverage.
- **Physically certified:** executed successfully on named hardware/software.
- **Release certified:** packaged Electron E2E, installer/signing,
  upgrade/rollback, security, and supported-environment gates also pass.

The repository is currently implemented and strongly deterministic; it is not yet
fully release-certified.
