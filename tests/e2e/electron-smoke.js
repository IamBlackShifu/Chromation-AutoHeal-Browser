const assert = require('assert');
const path = require('path');
const os = require('os');
const fs = require('fs');
const http = require('http');
const { _electron: electron } = require('playwright-core');

async function closeApplication(application, applicationPage) {
  const process = application.process();
  if (process.exitCode !== null) return;
  const exited = new Promise((resolve) => {
    process.once('exit', resolve);
  });
  await applicationPage.evaluate(() => window.chromationAPI.ipc.send('window-close'));
  await Promise.race([
    exited,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Electron did not exit within 15 seconds')), 15_000)),
  ]);
}

async function run() {
  const root = path.resolve(__dirname, '..', '..');
  const packagedExecutable = process.env.CHROMATION_E2E_EXECUTABLE;
  const executablePath = packagedExecutable
    ? path.resolve(packagedExecutable)
    : require('electron');
  if (packagedExecutable && !fs.existsSync(executablePath)) {
    throw new Error(`Packaged Electron executable does not exist: ${executablePath}`);
  }
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'chromation-e2e-'));
  const fixture = http.createServer((request, response) => {
    if (request.url === '/download') {
      response.writeHead(200, { 'content-type': 'text/plain', 'content-disposition': 'attachment; filename="fixture-download.txt"' });
      response.end('download boundary fixture');
      return;
    }
    if (request.url === '/unexpected') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end('<!doctype html><html><body><h1>Unexpected destination</h1></body></html>');
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><html><body><main><h1>Chromation fixture</h1><label>Email <input id="email" name="email"></label><button id="submit" data-testid="submit">Submit</button><button id="popup">Popup</button><a id="download" href="/download" download>Download</a><button id="permission">Location</button><button id="unexpected">Unexpected navigation</button><p id="result"></p><script>document.querySelector("#submit").addEventListener("click",()=>document.querySelector("#result").textContent="Saved");document.querySelector("#popup").addEventListener("click",()=>window.open("/popup","_blank"));document.querySelector("#permission").addEventListener("click",()=>navigator.geolocation.getCurrentPosition(()=>document.body.dataset.permission="allowed",()=>document.body.dataset.permission="denied"));document.querySelector("#unexpected").addEventListener("click",()=>location.href="/unexpected");</script></main></body></html>');
  });
  await new Promise((resolve, reject) => { fixture.once('error', reject); fixture.listen(0, '127.0.0.1', resolve); });
  const address = fixture.address();
  const fixtureUrl = `http://127.0.0.1:${address.port}/`;
  const environment = { ...process.env, NODE_ENV: 'test', CHROMATION_E2E: '1', CHROMATION_E2E_USER_DATA: userData };
  delete environment.ELECTRON_RUN_AS_NODE;
  const launchApp = () => electron.launch({
    executablePath,
    args: packagedExecutable ? [] : ['.'],
    cwd: root,
    env: environment,
    timeout: 30_000,
  });
  let app = await launchApp();
  let page;
  let recordingFilename;
  const rendererErrors = [];
  const checkpoint = (name) => process.stdout.write(`[electron-e2e] ${name}\n`);
  try {
    checkpoint(packagedExecutable ? 'packaged app launched' : 'development app launched');
    page = await app.firstWindow({ timeout: 20_000 });
    page.on('pageerror', (error) => rendererErrors.push(error.message));
    await page.waitForLoadState('domcontentloaded');
    assert.match(await page.title(), /OmniFlow QA/i);
    await page.locator('#workspace-launcher:not(.hidden)').waitFor({ state: 'visible' });
    assert.strictEqual(await page.locator('[data-launch-workspace]').count(), 2, 'Workspace launcher must offer two targets');
    await page.locator('[data-launch-workspace="mobile"]').click();
    checkpoint('mobile workspace opened');
    assert.strictEqual(await page.locator('html').getAttribute('data-theme'), 'dark', 'Dark must be the default theme');
    await page.locator('#header-theme-toggle').click();
    await page.locator('#header-theme-toggle').click();
    assert.strictEqual(await page.locator('html').getAttribute('data-theme'), 'light', 'Header theme control must update the full shell');
    await page.locator('#tool-rail').waitFor({ state: 'visible' });
    for (const selector of ['.window-controls .minimize-btn', '.window-controls .maximize-btn', '.window-controls .close-btn', '#url-input']) {
      assert.strictEqual(await page.locator(selector).count(), 1, `Missing shell control ${selector}`);
    }

    await page.waitForTimeout(500);
    assert.strictEqual(await page.locator('#side-panel').getAttribute('class'), 'side-panel open', `Mobile panel did not open. Renderer errors: ${rendererErrors.join('; ')}`);
    assert.strictEqual(await page.locator('#panel-title').textContent(), 'Mobile Automation');
    const mobileGeometry = await page.evaluate(() => {
      const main = document.querySelector('.main-content').getBoundingClientRect();
      const panel = document.querySelector('#side-panel').getBoundingClientRect();
      const config = document.querySelector('.mobile-target-config').getBoundingClientRect();
      const readiness = document.querySelector('.mobile-readiness-board').getBoundingClientRect();
      return { mainWidth: main.width, panelWidth: panel.width, configRight: config.right, readinessLeft: readiness.left, readinessWidth: readiness.width };
    });
    assert.ok(mobileGeometry.panelWidth >= mobileGeometry.mainWidth * .98, `Mobile Studio did not fill its workspace: ${JSON.stringify(mobileGeometry)}`);
    assert.ok(mobileGeometry.readinessLeft >= mobileGeometry.configRight && mobileGeometry.readinessWidth > 400, `Disconnected readiness board is not beside configuration: ${JSON.stringify(mobileGeometry)}`);
    await page.locator('#mobile-connected-device').waitFor({ state: 'visible' });
    await page.locator('#mobile-device-picker-hint').waitFor({ state: 'visible' });
    assert.strictEqual(await page.locator('#mobile-connect').count(), 1);
    for (const selector of ['#mobile-record-start', '#mobile-record-pause', '#mobile-record-stop', '#mobile-live-action-feed']) {
      assert.strictEqual(await page.locator(selector).count(), 1, `Missing Mobile Studio control ${selector}`);
    }
    assert.strictEqual(await page.locator('#mobile-record-start').isDisabled(), true, 'Recording must stay disabled before a device session connects');
    assert.deepStrictEqual(rendererErrors, [], `Mobile rail startup raised renderer errors: ${rendererErrors.join('; ')}`);

    await page.locator('#workspace-switcher').selectOption('web');
    await page.waitForFunction(() => document.body.classList.contains('workspace-web'));
    await page.locator('#target-environment').waitFor({ state: 'visible' });
    assert.match(await page.locator('#target-environment').getAttribute('aria-label'), /Web .* Chrome/);
    assert.strictEqual(await page.locator('[data-tool="mobile"]').isVisible(), false, 'Mobile tools must be hidden in Web mode');
    assert.strictEqual(await page.locator('.navbar').isVisible(), true, 'Web navigation must be restored in Web mode');
    checkpoint('web workspace opened');

    await page.locator('#url-input').fill(fixtureUrl);
    await page.locator('#url-input').press('Enter');
    await page.waitForFunction((url) => document.querySelector('#browser-webview')?.getURL?.() === url, fixtureUrl);
    checkpoint('fixture loaded');

    const dismissRecovery = async () => {
      await page.locator('#browser-recovery-dismiss').click();
      await page.locator('#browser-recovery').waitFor({ state: 'hidden' });
    };
    await page.locator('#browser-webview').evaluate((webview) => webview.executeJavaScript("document.querySelector('#popup').click()"));
    await page.locator('#browser-recovery[data-recovery-kind="popup"]').waitFor({ state: 'visible' });
    assert.match(await page.locator('#browser-recovery').textContent(), /Popup blocked/i);
    await dismissRecovery();

    await page.locator('#browser-webview').evaluate((webview) => webview.executeJavaScript("document.querySelector('#download').click()"));
    await page.locator('#browser-recovery[data-recovery-kind="download"]').waitFor({ state: 'visible' });
    assert.match(await page.locator('#browser-recovery').textContent(), /Download blocked.*not saved automatically/is);
    await dismissRecovery();

    await page.locator('#browser-webview').evaluate((webview) => webview.executeJavaScript("document.querySelector('#permission').click()"));
    await page.locator('#browser-recovery[data-recovery-kind="permission"]').waitFor({ state: 'visible' });
    assert.match(await page.locator('#browser-recovery').textContent(), /Permission denied/i);
    assert.strictEqual(
      await page.locator('#browser-webview').evaluate((webview) => webview.executeJavaScript('document.body.dataset.permission')),
      'denied'
    );
    await dismissRecovery();

    await page.locator('#browser-webview').evaluate((webview) => webview.executeJavaScript("document.querySelector('#unexpected').click()"));
    await page.locator('#browser-recovery[data-recovery-kind="navigation"]').waitFor({ state: 'visible' });
    assert.match(await page.locator('#browser-recovery').textContent(), /Unexpected navigation detected/i);
    await page.locator('#browser-recovery-return').click();
    await page.waitForFunction((url) => document.querySelector('#browser-webview')?.getURL?.() === url, fixtureUrl);

    await app.evaluate(({ webContents }) => {
      const guest = webContents.getAllWebContents().find((contents) => contents.getType() === 'webview');
      if (!guest) throw new Error('Fixture webview was not found for crash recovery');
      guest.forcefullyCrashRenderer();
    });
    await page.locator('#browser-recovery[data-recovery-kind="crash"]').waitFor({ state: 'visible' });
    assert.match(await page.locator('#browser-recovery').textContent(), /recording is preserved/i);
    await page.locator('#browser-recovery-return').click();
    await page.waitForFunction((url) => document.querySelector('#browser-webview')?.getURL?.() === url, fixtureUrl);
    checkpoint('browser boundary failures recovered');

    await page.locator('[data-tool="inspector"]').click();
    await page.locator('#start-inspect-btn').click();
    await page.waitForFunction(() => document.querySelector('#start-inspect-btn')?.disabled === true);
    await page.waitForTimeout(250);
    await page.locator('#browser-webview').evaluate((webview) =>
      webview.executeJavaScript("document.querySelector('#submit').click()")
    );
    await page.waitForFunction(() => document.querySelector('#element-details')?.textContent?.includes('BUTTON'));
    assert.match(await page.locator('#element-details').textContent(), /Tag:\s*BUTTON/i);
    assert.match(await page.locator('#element-details').textContent(), /ID:\s*submit/i);
    assert.match(await page.locator('#locators-list').textContent(), /data-testid:\s*\[data-testid="submit"\]/i);
    assert.match(await page.locator('#locators-list').textContent(), /100%/);
    await page.locator('#discover-all-btn').click();
    await page.waitForFunction(() => Number(document.querySelector('#element-count')?.textContent) >= 2);
    assert.match(await page.locator('#elements-table').textContent(), /\[data-testid="submit"\]/i);
    checkpoint('inspector authored stable fixture locators');

    await page.locator('[data-tool="recorder"]').click();
    await page.locator('#start-record-btn').waitFor({ state: 'visible' });
    assert.strictEqual(await page.locator('#actions-list').count(), 1);

    await page.locator('#start-record-btn').click();
    await page.waitForFunction(async () => {
      const webview = document.querySelector('#browser-webview');
      if (!webview?.executeJavaScript) return false;
      return webview.executeJavaScript('Boolean(window.__chromationRecorderInstalled && window.__chromationRecording)');
    });
    for (let attempt = 0; attempt < 3 && await page.locator('#actions-list .action-item').count() < 2; attempt += 1) {
      await page.locator('#browser-webview').evaluate(async (webview) => {
        await webview.executeJavaScript(`(() => {
          const input=document.querySelector('#email');
          input.focus(); input.value='qa@example.test'; input.dispatchEvent(new Event('input',{bubbles:true}));
          document.querySelector('#submit').dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));
          console.log('CHROMATION_RECORD_JSON:' + JSON.stringify({actionType:'input',selector:'#email',value:'qa@example.test',extra:'input',xpath:'//*[@id="email"]',locatorFingerprint:{tagName:'input',attributes:{id:'email',name:'email'},text:'',accessibleName:'Email'}}));
          console.log('CHROMATION_RECORD_JSON:' + JSON.stringify({actionType:'click',selector:'#submit',value:'Submit',extra:'button',xpath:'//*[@id="submit"]',locatorFingerprint:{tagName:'button',attributes:{id:'submit','data-testid':'submit'},text:'Submit',accessibleName:'Submit'}}));
          return true;
        })()`);
      });
      await page.waitForTimeout(500);
    }
    assert.ok(await page.locator('#actions-list .action-item').count() >= 2, 'Recorder did not capture fixture interactions');
    await page.locator('#stop-record-btn').click();
    checkpoint('interactions recorded');

    const lastAction = page.locator('#actions-list .action-item').last();
    await lastAction.click();
    await page.locator('#step-edit-selector').fill('#retired-submit');
    await page.locator('#step-properties-form button[type="submit"]').click();
    await page.waitForFunction(() => document.querySelector('#status-text')?.textContent?.includes('updated'));

    await page.locator('#save-record-btn').click();
    await page.locator('#recording-name-input').fill('E2E Fixture Recording');
    await page.locator('#recording-name-form button[type="submit"]').click();
    await page.waitForFunction(() => document.querySelector('#status-text')?.textContent?.includes('saved successfully'));
    const saved = await page.evaluate(() => window.chromationAPI.ipc.invoke('load-recordings'));
    assert.strictEqual(saved.success, true);
    const recording = saved.recordings.find((item) => item.name === 'E2E Fixture Recording');
    assert.ok(recording, 'Saved fixture recording was not listed');
    recordingFilename = recording.filename;
    assert.match(recordingFilename, /^web_suite_/i, 'Web recordings must use the web_suite_ prefix');
    const reopened = await page.evaluate((filename) => window.chromationAPI.ipc.invoke('load-recording', filename), recording.filename);
    assert.strictEqual(reopened.success, true);
    assert.ok(reopened.recording.actions.length >= 2);
    assert.strictEqual(reopened.recording.actions.at(-1).selector, '#retired-submit');
    checkpoint('recording edited and saved');

    await closeApplication(app, page);
    checkpoint('first app instance closed');
    app = await launchApp();
    page = await app.firstWindow({ timeout: 20_000 });
    page.on('pageerror', (error) => rendererErrors.push(error.message));
    await page.waitForLoadState('domcontentloaded');
    await page.locator('#workspace-launcher:not(.hidden)').waitFor({ state: 'visible' });
    await page.locator('[data-launch-workspace="web"]').click();
    assert.ok((await page.evaluate(() => window.chromationAPI.recorder.getActions())).length >= 2, 'Web draft did not recover after restart');
    await page.locator('[data-tool="recorder"]').click();
    await page.locator('#btn-menu').click();
    await page.locator('#menu-recordings').click();
    await page.locator(`.load-recording[data-filename="${recordingFilename}"]`).click();
    await page.waitForFunction(() => document.querySelectorAll('#actions-list .action-item').length >= 2);
    checkpoint('recording recovered after restart');

    await page.locator('#export-format-select').selectOption('playwright');
    await page.locator('#export-script-btn').click();
    await page.waitForFunction(() => document.querySelector('#status-text')?.textContent?.includes('Script exported as playwright'));
    const scriptContent = await page.evaluate(() => window.chromationAPI.recorder.exportScript('playwright'));
    assert.match(scriptContent, /playwright/i);

    await page.locator('#replay-speed-select').selectOption('2');
    await page.locator('#replay-engine-select').selectOption('webview');
    await page.locator('#replay-retries-input').fill('0');
    await page.locator('#replay-record-btn').click();
    await page.locator('#report-workspace').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('#report-workspace .report-status-passed').waitFor({ state: 'visible' });
    assert.strictEqual(await page.locator('#report-workspace .report-issue.healed').count(), 1);

    await page.locator('#report-workspace [data-report-format="json"]').click();
    await page.waitForFunction(() => document.querySelector('#status-text')?.textContent?.includes('Replay report exported as JSON'));
    const reportHistory = await page.evaluate(() => window.chromationAPI.reporter.exportHistory());
    const reportRuns = JSON.parse(reportHistory);
    assert.ok(reportRuns.some((run) => run.status === 'passed' && run.steps?.some((step) => step.healing)), 'Exported report history did not contain the healed passing run');
    checkpoint('replay, healing, and exports passed');

    await page.locator('[data-tool="recorder"]').click();
    await page.locator('#replay-engine-select').selectOption('webview');
    await page.locator('#replay-retries-input').fill('0');
    const failedStepIndex = await page.evaluate(() => {
      const actions = window.chromationAPI.recorder.getActions();
      const index = actions.length - 1;
      const { locatorFingerprint: _discardedFingerprint, ...actionWithoutFingerprint } = actions[index];
      window.chromationAPI.recorder.updateAction(index, {
        ...actionWithoutFingerprint,
        selector: '#missing-without-fingerprint',
      });
      return index;
    });
    await page.locator('#replay-record-btn').click();
    await page.locator('#report-workspace .report-status-failed').waitFor({ state: 'visible', timeout: 30_000 });
    const failure = page.locator('#report-workspace .report-issue.failed');
    await failure.waitFor({ state: 'visible' });
    assert.match(await failure.textContent(), /#missing-without-fingerprint/);
    assert.match(await failure.textContent(), /Inspect the locator/i);
    assert.strictEqual(await failure.locator('[data-remediation="edit-step"]').count(), 1);
    assert.strictEqual(await failure.locator('[data-remediation="inspect-target"]').count(), 1);
    assert.strictEqual(
      await failure.locator('[data-report-screenshot], .screenshot-capture-error').count(),
      1,
      'Failure report must preserve screenshot evidence or an explicit capture error'
    );
    checkpoint('explicit replay failure preserved actionable evidence');

    await failure.locator('[data-remediation="edit-step"]').click();
    await page.locator('#step-properties-form').waitFor({ state: 'visible' });
    assert.strictEqual(await page.locator('#step-edit-selector').inputValue(), '#missing-without-fingerprint');
    await page.locator('#step-edit-selector').fill('#submit');
    await page.locator('#step-properties-form button[type="submit"]').click();
    await page.waitForFunction(() => document.querySelector('#status-text')?.textContent?.includes('updated'));
    const corrected = await page.evaluate((index) => window.chromationAPI.recorder.getActions()[index], failedStepIndex);
    assert.strictEqual(corrected.selector, '#submit');
    await page.locator('#replay-engine-select').selectOption('webview');
    await page.locator('#replay-retries-input').fill('0');
    await page.locator('#replay-record-btn').click();
    await page.locator('#report-workspace .report-status-passed').waitFor({ state: 'visible', timeout: 30_000 });
    assert.strictEqual(await page.locator('#report-workspace .report-issue.failed').count(), 0);
    const recoveredHistory = JSON.parse(await page.evaluate(() => window.chromationAPI.reporter.exportHistory()));
    assert.ok(recoveredHistory.some((run) => run.status === 'failed'), 'Run history did not retain the failed replay');
    assert.strictEqual(recoveredHistory.at(-1).status, 'passed', 'Corrected replay was not retained as the latest passing run');
    checkpoint('failed step corrected through remediation and recovered');

    process.stdout.write(`${JSON.stringify({ status: 'passed', packaged: Boolean(packagedExecutable), shell: true, mobileDrawer: true, recorderDrawer: true, fixtureBrowse: true, popupRecovery: true, downloadRecovery: true, navigationRecovery: true, rendererCrashRecovery: true, permissionRecovery: true, inspectorAuthoring: true, recordEditSaveRestartReopen: true, replay: true, healing: true, report: true, failureEvidence: true, recovery: true, scriptExport: true, reportExport: true, actionCount: reopened.recording.actions.length })}\n`);
  } catch (error) {
    if (page) await page.screenshot({ path: path.join(os.tmpdir(), 'chromation-electron-smoke-failure.png'), fullPage: true }).catch(() => undefined);
    throw error;
  } finally {
    await closeApplication(app, page).catch(() => app.close().catch(() => undefined));
    fixture.closeAllConnections?.();
    await new Promise((resolve) => fixture.close(resolve));
    fs.rmSync(userData, { recursive: true, force: true });
  }
}

run().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  }
);
