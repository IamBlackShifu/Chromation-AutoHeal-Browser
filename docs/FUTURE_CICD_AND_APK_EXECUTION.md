# Future CI/CD and APK Execution

## Status and sequencing

This is an approved future direction, not a currently implemented or
release-certified capability.

Implementation must begin only after OmniFlow QA can reliably complete the
Android authoring lifecycle on physical hardware:

`connect -> inspect -> record interactions -> edit -> save -> replay -> report`

The prerequisite is satisfied when representative five-screen Android journeys
capture the supported action set without missing or duplicating interactions and
replay successfully on the supported device/API matrix. Recording and replay
defects remain the higher priority until that gate is met.

As of `0.3.0-beta.2`, the active CI/CD work is limited to product quality gates:
Windows CI builds the desktop installer and runs the canonical web workflow
against the packaged executable. APK submission, remote coordination, runner
registration, and provider callbacks described below remain deferred until the
Android quality gate is satisfied.

## Product objective

Allow teams to submit an APK and an OmniFlow QA mobile suite from the desktop,
CLI, API, or CI/CD provider; execute it on an isolated Android target; monitor
the run in real time; and return machine-readable results and diagnostic
artifacts to the originating pipeline.

Initial provider targets are GitHub Actions, Azure DevOps, GitLab CI/CD, and
CircleCI. The execution contract should remain provider-neutral.

## Intended user workflow

1. Upload an APK, select a local artifact, or supply an authenticated artifact URL.
2. Validate the file and show its package name, version, SDK requirements,
   signature information, size, and SHA-256 checksum.
3. Select a versioned mobile suite, environment, device profile, reset policy,
   permissions, timeout, retries, and artifact-retention policy.
4. Queue the run and reserve one compatible device or emulator exclusively.
5. Install the APK, create an Appium session, and execute the selected suite.
6. Stream queue, setup, step, retry, healing, and completion events into a live
   Runs view.
7. Publish status, JUnit/JSON/HTML reports, logs, screenshots, hierarchy snapshots,
   and optional video back to the pipeline.

## Planned product surfaces

### Application Builds

- Drag-and-drop APK upload with progress, cancellation, validation, and clear
  failure remediation.
- Versioned build history keyed by package, version, checksum, branch, commit,
  and CI build identifier.
- Configurable retention and explicit deletion controls.
- Reuse of a previously verified artifact without uploading it again.

### CI/CD Runs

- Provider setup cards and generated pipeline snippets.
- Run configuration for build, suite, target, environment, reset mode,
  concurrency, retry, timeout, and evidence collection.
- Real-time queue and execution status, current step, elapsed time, device state,
  Appium/ADB logs, screenshots, and cancellation.
- Searchable history by provider, repository, branch, commit, build, suite,
  device, and outcome.

### Headless interfaces

- A versioned CLI command for local and CI execution.
- An authenticated REST API for build upload, run submission, status,
  cancellation, and artifact retrieval.
- WebSocket or Server-Sent Events for live run updates.
- Webhooks and provider-specific check/status callbacks.

## Proposed architecture

```text
GitHub / Azure / GitLab / CircleCI
                 |
          CLI or REST API
                 |
     OmniFlow coordinator + queue
                 |
       authenticated Runner Agent
                 |
       Appium -> device / emulator
                 |
  events + reports + diagnostic artifacts
```

The Runner Agent should initiate an outbound authenticated connection to the
coordinator. This allows a workstation or private device lab to accept jobs
without exposing Appium, ADB, or an inbound control port to the public internet.
A local-only deployment may run the CLI directly inside the pipeline.

## Reliability and isolation requirements

- One exclusive device lease per run, with heartbeat, expiry, and recovery.
- Per-run temporary storage, Appium port allocation, ADB-forward ownership, and
  guaranteed teardown.
- Queueing, cancellation, retry policy, global and step timeouts, and recovery
  after runner or coordinator disconnection.
- Immutable association between APK checksum, suite version, environment,
  runner version, device metadata, and final report.
- Idempotency keys for uploads and run submission.
- Backpressure and reconnect support for live event delivery.
- Clear separation between orchestration failure, infrastructure failure, test
  failure, and cancellation.

## Security requirements

- Treat every uploaded APK as untrusted input; inspect it without executing it on
  the coordinator.
- Enforce file type and size limits, safe filenames, checksum verification,
  malware scanning hooks, private storage, and configurable retention.
- Use scoped API tokens, signed runner registration, short-lived job credentials,
  audit logs, and secret masking.
- Never expose Appium or ADB directly to a CI provider.
- Redact secrets and sensitive device content from logs, screenshots, hierarchy
  data, reports, and live events according to project policy.

## Delivery sequence after the Android quality gate

1. Local APK upload, validation, metadata inspection, and versioned build storage.
2. Install-and-run workflow on one selected local device or emulator.
3. Durable run model, live status, cancellation, and diagnostic artifacts.
4. Headless CLI and provider-neutral REST/event APIs.
5. GitHub Actions integration and reusable workflow template.
6. GitLab CI/CD, Azure DevOps, and CircleCI templates.
7. Remote Runner Agent registration, device leasing, scheduling, and controlled
   concurrency.

## Acceptance criteria

- A user can upload a valid APK, inspect its verified metadata, select a certified
  mobile suite and compatible target, and start a run without manually entering
  package identifiers.
- A CI job can submit the same inputs non-interactively and receive a stable run ID.
- Run state and step results update in OmniFlow QA in real time without requiring
  users to switch to the CI provider.
- The provider receives the final pass/fail/cancelled result and downloadable
  JUnit, JSON, HTML, and diagnostic artifacts.
- Concurrent jobs cannot share a device, Appium port, ADB forward, temporary
  directory, credentials, or timeline state.
- Interrupted jobs recover or terminate deterministically and release all owned
  resources.
