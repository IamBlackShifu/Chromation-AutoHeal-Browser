# Suites and Automation Workflows

## The Chromation workflow

Chromation uses four connected layers:

1. **Recording** — an ordered set of browser actions and assertions.
2. **Test case** — a named copy of a recording added to a suite, with its own tags.
3. **Suite** — a related group of test cases, such as Checkout, Authentication, or Smoke.
4. **Run and report** — execution of one test or a suite across one or more browser configurations.

The usual path is:

`Record → review and save → add to suite → select browsers → run → inspect report`

## Create a reliable recording

1. Open the target page and select **Record**.
2. Start recording and complete one focused user outcome.
3. Stop recording and review every captured step.
4. Add assertions that prove the outcome, not only the clicks that led to it.
5. Give the recording a descriptive name, such as `Checkout - card payment`.
6. Replay it once on its own before adding it to a suite.

Keep recordings focused. A short test with one clear purpose is easier to diagnose
and reuse than one long test covering unrelated behavior.

## Create and populate a suite

1. Select **Suites** in the left tool rail.
2. Enter a suite name and optional comma-separated tags.
3. Select **Create suite**.
4. Load or record the test you want to add.
5. Enter a test name and optional test-specific tags.
6. Select **Add current recording to suite**.

Adding a recording stores its current actions in the suite. Later edits to the
standalone recording do not silently rewrite the suite test. Add the updated
recording again when you intentionally want a new suite version.

### Naming guidance

- Suites describe a product area or run purpose: `Authentication`, `Checkout`,
  `Release smoke`.
- Tests describe an observable behavior: `Valid user can sign in`, `Declined
  card shows an error`.
- Tags describe selection and policy: `smoke`, `critical`, `mobile`, `slow`,
  `checkout`.

## Run a suite

Choose the suite, enter comma-separated browser names, choose concurrency, and
select **Run selected suite**.

- **Browsers** define the matrix. `chrome, msedge` runs each selected test once
  per browser.
- **Concurrency** limits how many jobs run simultaneously. Start with `1` or `2`
  for local diagnosis; increase it in CI when the machine has enough resources.
- Only enabled tests are executed.
- Suite and test tags are inherited for filtering in CLI and matrix workflows.

Each browser/test combination is a job. For example, three tests across Chrome
and Edge produce six jobs.

## Read the results

Open **Reports** to inspect the run:

- Passed, failed, skipped, and healed counts
- Step timing and total duration
- Failure screenshots and diagnostic evidence
- Locator healing details
- Export formats for CI and sharing

Use **Rerun and compare** from a report to execute the source recording again and
see changes in status, pass rate, failures, healing, and duration.

## CLI suite runs

```powershell
npm.cmd run run:cli -- --suite .\suite.json --tags smoke --matrix '{"browser":["chrome","msedge"]}' --concurrency 2 --results .\chromation-results
```

Useful selection concepts:

- `--tags smoke` includes matching tests.
- `--exclude-tags slow` removes tests with excluded tags.
- `--matrix` expands each selected test across the supplied dimensions.
- `--concurrency` limits parallel jobs.
- `--results` chooses the output directory.

## Troubleshooting

### “Select a suite”

Create a suite or choose one from the suite selector before adding or running tests.

### “Enter a test name”

The suite stores a named test case. Give the currently loaded recording a
behavior-focused test name before adding it.

### The suite runs no jobs

Verify that the suite contains enabled tests and that tag filters do not exclude
them.

### A browser matrix job fails to start

Check Diagnostics for runtime versions and storage health. Confirm the selected
browser is installed and supported by the configured replay engine.

### Results differ between browsers

Open the individual reports and compare the first divergent step, screenshot,
locator healing event, network response, and timing. Differences are often caused
by browser-specific rendering, permissions, or race conditions.

## Recommended suite structure

- `Release smoke`: a small set of critical, fast tests
- `Authentication`: sign-in, sign-out, password reset, session expiry
- `Checkout`: cart, address, payment, confirmation
- `Regression`: broader behavior grouped by product area

Use tags to create alternate selections without duplicating the same test across
many suites.
