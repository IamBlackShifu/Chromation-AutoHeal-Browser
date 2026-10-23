# U3 Evidence Privacy and Reliability Engineering Log

Last updated: 18 September 2026

This log records the implemented U3 slices, issues discovered during delivery,
verification evidence, and work that remains external or deliberately deferred.
The present-tense product contract remains [Current Product and Engineering
State](CURRENT_STATE.md).

## Delivered slices

### Automatic web evidence masking

- Playwright failure screenshots mask common password, one-time-code,
  payment-card, token/secret, and explicitly privacy-marked fields.
- Application-specific selectors are merged with automatic masks.
- Explicit redaction opt-out remains available for controlled test environments.

### Atomic and recoverable core persistence

- Saved recordings, run history, browsing history, mobile profiles, the encrypted
  environment vault, and origin permissions use same-directory temporary writes,
  flushed data, atomic rename, and last-known-good backups.
- Existing valid stores receive a backup on first read.
- Malformed or schema-invalid primaries recover from backup and are quarantined.
- If both run-history or other defaultable stores are invalid, corrupt copies are
  quarantined before a safe default is created.
- Corruption quarantine is capped at three files per store.
- Interrupted recording writes that leave only a `.bak` are restored before the
  recordings directory is enumerated.
- Explicit history clearing purges primary, backup, temporary, and quarantine
  files before creating empty primary and backup stores.

Current limits:

| Store | Limit |
| --- | ---: |
| Recording document | 10 MB each |
| Run history | 25 MB / 500 runs |
| Browsing history | 5 MB / 5,000 visits |
| Mobile profiles | 1 MB / 100 profiles |
| Environment vault | 2 MB / 256 variables |
| Origin permission policy | 512 KB / 200 origins |

### Privacy mode

- Privacy mode is an explicit setting with destructive confirmation.
- Enabling it clears browsing history, run history, their recovery artifacts,
  and recoverable workspace drafts.
- Explicitly saved recordings, mobile profiles, and encrypted environment
  variables are retained and are identified as such in the confirmation copy.
- While enabled, browsing visits, run history, and workspace drafts are not
  persisted.
- Webview, Playwright, and Android execution suppress screenshots, DOM/hierarchy
  snapshots, console/device logs, network evidence, traces, and video.
- Playwright state mirroring excludes cookies and web storage in privacy mode.
- Enforcement exists in renderer, preload, and Electron main-process paths so a
  single UI omission cannot silently re-enable evidence capture.

### Durable origin policy and truthful diagnostics

- Explicit guest permission decisions use a bounded allowlist and trusted-renderer
  validation, then persist atomically by normalized origin.
- Empty origin policies are removed rather than retained indefinitely.
- Diagnostics now validate and recover JSON stores instead of treating file
  existence as health.
- Recording documents are schema-checked during diagnostics.
- Recovered stores are labeled `Recovered`, privacy-mode state is visible, and
  permission sets are flattened into actual origin/permission rows.

### Broader secret and mobile-evidence redaction

- Central classification now handles password/token variants, authorization,
  cookies, private/client secrets, access/refresh tokens, OTP/PIN, and CVV/CVC.
- Text redaction covers structured assignments, Bearer and Basic credentials,
  JWTs, and private-key bodies.
- Recursive structured redaction protects nested capability and log objects.
- Web and Android run/step failure messages are sanitized by default.
- Android capability attachments, password-like hierarchy nodes, logcat, and
  replay diagnostics are sanitized before report construction.
- Users can configure up to 50 device-pixel mask rectangles for Android evidence.
  Sensitive recorded mobile fields automatically add their captured element
  bounds. Canvas masking runs before report/history persistence; a decode or mask
  failure discards the screenshot instead of retaining it unmasked.

### Acceptance coverage

- Final local gate: `npm.cmd run check` passed all 45 Jest suites and 242 tests,
  followed by TypeScript compilation and the production Webpack build.
- Deterministic tests cover atomic rotation, first-read backup migration, backup
  recovery, dual corruption fallback, validation/size rejection, targeted purge,
  privacy enforcement, origin policy contracts, structured redaction, Android
  evidence suppression/redaction, and mobile mask fail-closed behavior.
- The Electron record-to-report smoke now seeds malformed run history, verifies
  quarantine and backup recovery, completes the canonical journey, enables
  privacy mode through the real confirmation UI, and verifies histories, backups,
  and drafts are empty or absent.
- The expanded development Electron journey passes. Windows packaged CI runs the
  same script; a clean hosted result remains the release gate.

## Issues discovered and resolved

1. **First-write stores had no recovery copy.** Atomic writes now create a backup
   even when no previous primary exists.
2. **Windows missing-file errors were misclassified as corruption.** Error-code
   detection is now structural rather than dependent on `instanceof` behavior.
3. **A crash between primary rotation and replacement could hide recordings.**
   Orphaned recording backups are restored before listing.
4. **Clearing history left sensitive data in backups and quarantine files.**
   Targeted owned-file purge now precedes the empty-store reset.
5. **Diagnostics reported any existing path as healthy.** It now parses, validates,
   recovers, and reports source/recovery state.
6. **Origin permission `Set` objects rendered as `{}` and vanished on restart.**
   Policies are now flattened for display and atomically persisted.
7. **Android captured screenshots, hierarchy, capabilities, and logcat regardless
   of privacy evidence policy.** The driver now honors evidence controls.
8. **Failure messages and structured mobile artifacts could contain credentials.**
   Central redaction now covers both web and Android result paths.
9. **No bitmap dependency was available for mobile masks.** Renderer Canvas is
   used before persistence, with fail-closed screenshot deletion on errors,
   avoiding a new native runtime dependency.

## Remaining gates and known limits

- Obtain a clean hosted Windows packaged result for the expanded U3 smoke.
- Physically certify configured and automatic Android masks against representative
  portrait/landscape screenshots and device-density variants.
- Automatic mobile masking currently derives regions from sensitive recorded
  fields plus configured rectangles; it does not perform OCR or visual PII
  discovery across arbitrary screen content.
- Web automatic masking is semantic/selector based and does not perform OCR over
  canvas, video, or rasterized third-party widgets.
- Complete the formal threat model, packaged penetration review, and broader
  real-world origin/storage/provider policy matrix.
- Code signing, upgrade/rollback, dependency-security CI, and supported-platform
  release certification remain U5/external gates.
