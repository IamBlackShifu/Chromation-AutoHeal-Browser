# OmniFlow QA Mission Delivery Program

Last reviewed: 18 September 2026

This program maps the premium QA automation mission to evidence in the current
repository. Status meanings:

- **Implemented:** functional code path and deterministic tests exist.
- **Partial:** a useful foundation exists, but one or more acceptance gates remain.
- **Missing:** no production-capable implementation exists yet.
- **External gate:** implementation depends on hardware, signing, or credentials
  not available in this repository.

## Mission scorecard

| Mission area | Status | Current evidence | Required completion gate |
| --- | --- | --- | --- |
| Premium Electron shell | Implemented | Custom chrome, themes, density, responsive rail/drawers, KPI/recording workspace, focus/motion modes | Packaged accessibility audit |
| Modular renderer | Partial | Renderer module runtime, connected-device picker module, target-environment component, separate report workspace, and TypeScript services | Continue splitting the monolithic renderer/styles into typed feature modules/components |
| Unified driver layer | Implemented for Web/Android | Shared contracts, web adapter, Android Appium driver | Add iOS driver and shared cross-driver contracts in CI |
| Electron security baseline | Implemented baseline | Context isolation, no Node integration, CSP, preload/IPC allowlists, safeStorage vault, durable origin policy, atomic core persistence, backup recovery, corruption quarantine, and privacy mode | Threat model, packaged penetration review, broader origin/storage policy gates |
| Web inspector/discovery | Implemented | Ranked locators, fingerprints, discovery/POM foundations | Cross-origin/closed-root diagnostics and full multi-language POM parity |
| Mobile inspector | Implemented for Android | XML tree, bounds, highlighting, ranked native locators, screenshot authoring | iOS hierarchy and embedded low-latency decoded stream |
| Timeline authoring | Implemented broadly | Edit/reorder/duplicate/disable, assertions, waits, retries, breakpoints, variables/flows | Typed custom code-snippet sandbox and packaged workflow E2E |
| Self-healing | Implemented | Weighted candidates, policies, history, evidence, promotion | Side-by-side visual diff polish and production false-heal benchmark |
| Android Device Studio | Implemented and single-device certified | Discovery, Appium ownership, scrcpy control, streaming fallbacks, Record on Device gesture/text translation, hover/live-feed authoring, actions, Doctor; five-screen physical replay passed on Android 14 | Two-device physical run and embedded H.264 canvas path |
| iOS Device Studio | Missing | Target contracts only | macOS worker, XCUITest, WebDriverAgent/signing, simulator and real device |
| Suites/matrices/CLI | Implemented foundation | Tags, suites, browser matrices, concurrency, CLI | Mobile/cloud matrix UI integration and CI examples |
| Reports/diagnostics | Implemented foundation | HTML/JSON/JUnit/HAR/Allure/PDF paths, evidence, logs, trends, validation-aware storage health and recovery state | Shareable artifact packaging and packaged redaction acceptance suite |
| PII redaction | Partial | Structured web/Android secret redaction, automatic sensitive web masks, configurable and sensitive-field mobile bounds, privacy-mode evidence suppression | OCR/visual discovery for arbitrary raster content, physical mask certification, and packaged acceptance |
| Automated unit/integration gate | Implemented | `npm run check`, 45 suites/242 tests | Maintain as blocking CI |
| Electron workflow E2E | Partial | Development and locally packaged Windows canonical workflows pass; development U3 smoke also proves corruption recovery and privacy purge/suppression | Obtain a clean hosted Windows result for the expanded U3 script, then broaden real-world browser-boundary variants |
| Signed distribution | Partial/external | Reproducible unsigned Windows NSIS setup, end-user dependency guide, checksum, and beta.2 GitHub prerelease | Signing credentials, macOS/Linux artifacts, notarization, updates, and rollback certification |

## Delivery order

### Milestone U1 — Renderer and design-system modularization (P0)

1. Introduce typed feature boundaries for shell, browser, recorder, mobile,
   suites, reports, settings, dialogs, and notifications.
2. Move shared tokens/components into one design-system package.
3. Preserve DOM contracts while migrating one workspace at a time.
4. Add keyboard and WCAG 2.1 AA automated checks plus manual audit scripts.

Exit: no feature controller exceeds an agreed size budget, global cross-feature
state is typed, and current UI tests remain green.

### Milestone U2 — Packaged workflow certification (P0)

1. Maintain a deterministic local web fixture and Android fixture application.
2. Launch Electron through Playwright, then cover browse -> inspect -> record ->
   edit -> save -> restart -> replay -> heal -> report -> export.
3. Add mobile connect -> inspect -> author -> replay -> disconnect where hardware
   is available, while keeping deterministic driver fixtures in CI.
4. Capture screenshots, traces, console, main-process logs, and failed-step state.

Exit: Windows CI runs the packaged happy path and failure/recovery paths without
manual intervention.

### Milestone U3 — Evidence privacy and reliability (P0)

1. Maintain centralized secret classification across recordings, logs, network
   bodies, capabilities, hierarchy, failures, and reports.
2. Maintain automatic sensitive web masks and configurable/derived mobile bounds;
   extend to visual discovery only with measurable false-mask benchmarks.
3. Maintain atomic core persistence, quotas, retention, corruption recovery, and
   privacy mode; obtain packaged recovery/privacy acceptance.
4. Broaden navigation, popup, download, crash, permission, and storage policies
   beyond the deterministic packaged fixtures.

Exit: security and privacy acceptance suite passes on packaged builds.

### Milestone U4 — Cross-platform/mobile depth (P1)

1. Embed decoded Android streaming where it materially improves over the owned
   scrcpy window; retain fallback ladder.
2. Add mobile targets to suite matrices and cloud/provider adapters.
3. Establish macOS worker, XCUITest driver, WebDriverAgent signing, and iOS Doctor.
4. Certify simulator, nominated iOS device, and two concurrent Android targets.

Exit: equivalent canonical journeys pass across selected web, Android, and iOS
targets without source rewrites.

### Milestone U5 — Distribution and enterprise release (P1)

1. Add reproducible Windows `.exe`/`.msi`, macOS Universal `.dmg`, and Linux
   `.AppImage`/`.deb` pipelines.
2. Add signing/notarization, SBOM, vulnerability/license checks, update channels,
   staged rollout, rollback, and migration tests.
3. Add performance budgets and long-running reliability tests.

Exit: signed artifacts pass install, upgrade, rollback, and smoke certification on
every supported operating system.

## Non-negotiable release rules

- UI claims must match executable behavior and published compatibility evidence.
- Destructive actions require explicit target selection and confirmation.
- Healing may not cross incompatible app/screen/context/role boundaries.
- A managed process must expose ownership and be cleaned up deterministically.
- Secrets may not appear in saved recordings, logs, IPC diagnostics, or reports.
- Unsupported actions fail at capability preflight, not halfway through a run.
- No feature is called enterprise-ready solely because unit tests pass.

For the detailed present-tense product description, see
[Current Product and Engineering State](CURRENT_STATE.md).
