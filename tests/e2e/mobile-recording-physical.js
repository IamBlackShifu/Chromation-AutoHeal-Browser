const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { _electron: electron } = require('playwright-core');

async function run() {
  const serial = process.env.OMNIFLOW_ANDROID_SERIAL;
  if (!serial) throw new Error('OMNIFLOW_ANDROID_SERIAL is required');
  const root = path.resolve(__dirname, '..', '..');
  execFileSync('adb', ['-s', serial, 'shell', 'am', 'start', '-a', 'android.settings.SETTINGS'], { stdio: 'ignore' });
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'omniflow-mobile-recording-'));
  const environment = { ...process.env, NODE_ENV: 'test', CHROMATION_E2E: '1', CHROMATION_E2E_USER_DATA: userData };
  delete environment.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: require('electron'), args: ['.'], cwd: root, env: environment, timeout: 30_000 });
  const rendererErrors = [];
  try {
    const page = await app.firstWindow({ timeout: 20_000 });
    console.log('stage:window-ready');
    page.on('pageerror', (error) => rendererErrors.push(error.message));
    await page.locator('#brand-splash.is-ready').waitFor({ state: 'attached' });
    await page.locator('#workspace-launcher:not(.hidden)').waitFor({ state: 'visible' });
    await page.locator('[data-launch-workspace="mobile"]').click();
    console.log('stage:mobile-open');
    await page.locator('#mobile-connected-device').waitFor({ state: 'visible' });
    await page.waitForFunction((expected) => document.querySelector('#mobile-device-udid')?.value === expected, serial, { timeout: 20_000 });
    await page.locator('#mobile-app-id').fill('com.android.settings');
    await page.locator('#mobile-app-activity').fill('.homepage.SettingsHomepageActivity');
    await page.locator('#mobile-connect').click();
    console.log('stage:connecting');
    await page.waitForFunction(() => document.querySelector('#mobile-connection-state')?.classList.contains('ready'), null, { timeout: 60_000 });
    console.log('stage:connected');
    await page.waitForFunction(() => document.querySelector('.mobile-panel')?.classList.contains('mobile-connected'));
    const studioGeometry = await page.evaluate(() => {
      const inspector = document.querySelector('.mobile-inspector-card').getBoundingClientRect();
      const timeline = document.querySelector('.mobile-recording-studio').getBoundingClientRect();
      return { inspectorLeft: inspector.left, inspectorRight: inspector.right, timelineLeft: timeline.left, timelineWidth: timeline.width };
    });
    assert.ok(studioGeometry.timelineLeft >= studioGeometry.inspectorRight - 2 && studioGeometry.timelineWidth >= 330, `Connected studio panes overlap or collapse: ${JSON.stringify(studioGeometry)}`);
    const containment = await page.evaluate(() => {
      const inspector = document.querySelector('.mobile-inspector-card').getBoundingClientRect();
      const controls = document.querySelector('.mobile-device-controls').getBoundingClientRect();
      const timeline = document.querySelector('.mobile-recording-studio').getBoundingClientRect();
      const replay = document.querySelector('#mobile-record-replay').getBoundingClientRect();
      const buttons = [...document.querySelectorAll('.mobile-recording-bar button')].map((button) => button.getBoundingClientRect());
      return { controlsInside: controls.left >= inspector.left && controls.right <= inspector.right && controls.top >= inspector.top && controls.bottom <= inspector.bottom,
        replayVisible: replay.width > 0 && replay.height > 0, buttonsInside: buttons.every((box) => box.left >= timeline.left && box.right <= timeline.right && box.top >= timeline.top && box.bottom <= timeline.bottom) };
    });
    assert.deepStrictEqual(containment, { controlsInside: true, replayVisible: true, buttonsInside: true }, `Studio controls escaped their cards: ${JSON.stringify(containment)}`);
    await page.locator('#mobile-expand-preview').click();
    await page.waitForFunction(() => document.querySelector('.mobile-panel')?.classList.contains('focus-mode'));
    await page.locator('#mobile-expand-preview').click();
    await page.waitForFunction(() => !document.querySelector('.mobile-panel')?.classList.contains('focus-mode'));
    await page.locator('#mobile-record-start').click();
    try { await page.waitForFunction(() => document.querySelector('#mobile-recording-health')?.classList.contains('recording'), null, { timeout: 20_000 }); }
    catch (error) {
      const diagnostic = await page.evaluate(() => ({ guidance: document.querySelector('#mobile-recording-guidance')?.textContent,
        health: document.querySelector('#mobile-recording-health')?.textContent, toast: document.querySelector('.toast:last-child')?.textContent }));
      throw new Error(`Recording startup failed: ${JSON.stringify(diagnostic)}; renderer=${rendererErrors.join('; ')}`, { cause: error });
    }
    console.log('stage:recording');
    const screenshot = page.locator('.mobile-device-screenshot');
    await screenshot.waitFor({ state: 'visible' });
    const box = await screenshot.boundingBox(); assert.ok(box, 'Device screenshot has no interactive bounds');
    await screenshot.evaluate((image, position) => {
      image.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 11, clientX: position.x, clientY: position.y }));
      image.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 11, clientX: position.x, clientY: position.y }));
    }, { x: box.x + box.width * .5, y: box.y + box.height * .28 });
    try { await page.waitForFunction(() => document.querySelector('#mobile-record-stream')?.textContent?.includes('1 captured'), null, { timeout: 30_000 }); }
    catch (error) { const detail = await page.evaluate(async () => ({ stream: document.querySelector('#mobile-record-stream')?.textContent,
      captureStatus: await window.chromationAPI.ipc.invoke('mobile-touch-capture-status'), guidance: document.querySelector('#mobile-recording-guidance')?.textContent, actions: await window.chromationAPI.mobileRecording.getActions() }));
      throw new Error(`Controlled device tap capture failed: ${JSON.stringify(detail)}`, { cause: error }); }
    console.log('stage:tap-captured');
    await screenshot.scrollIntoViewIfNeeded(); const refreshedBox = await screenshot.boundingBox(); assert.ok(refreshedBox);
    await screenshot.evaluate((image, position) => {
      image.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 12, clientX: position.x, clientY: position.startY }));
      image.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 12, clientX: position.x, clientY: position.endY }));
    }, { x: refreshedBox.x + refreshedBox.width * .5, startY: refreshedBox.y + refreshedBox.height * .75, endY: refreshedBox.y + refreshedBox.height * .35 });
    try { await page.waitForFunction(() => document.querySelector('#mobile-record-stream')?.textContent?.includes('2 captured'), null, { timeout: 30_000 }); }
    catch (error) { const detail = await page.evaluate(async () => ({ stream: document.querySelector('#mobile-record-stream')?.textContent,
      actions: await window.chromationAPI.mobileRecording.getActions() })); throw new Error(`Controlled swipe capture failed: ${JSON.stringify(detail)}`, { cause: error }); }
    console.log('stage:swipe-captured');
    await page.locator('#mobile-record-stop').click();
    const result = await page.evaluate(async () => ({
      actions: await window.chromationAPI.mobileRecording.getActions(),
      stream: document.querySelector('#mobile-record-stream')?.textContent,
    }));
    assert.ok(result.actions.some((action) => action.type === 'tap'), `Controlled tap was not recorded: ${JSON.stringify(result.actions)}`);
    assert.ok(result.actions.some((action) => action.type === 'swipe'), `Controlled swipe was not recorded: ${JSON.stringify(result.actions)}`);
    await page.locator('#mobile-record-replay').click();
    await page.waitForFunction(() => document.querySelector('#status-text')?.textContent?.includes('Android replay completed'), null, { timeout: 90_000 });
    const replayStatus = await page.locator('#status-text').textContent();
    const replayReportText = await page.locator('#report-workspace').innerText().catch(() => 'Report workspace unavailable');
    assert.match(replayStatus, /Android replay completed: [1-9]\d* passed, 0 failed/, `Replay did not execute recorded actions: ${replayStatus}; report=${replayReportText}`);
    const resumedActivity = execFileSync('adb', ['-s', serial, 'shell', 'dumpsys', 'activity', 'activities'], { encoding: 'utf8' });
    assert.match(resumedActivity, /topResumedActivity=.*com\.android\.settings\/\.homepage\.SettingsHomepageActivity/, 'Replay did not leave the configured Main Activity in the foreground');
    assert.deepStrictEqual(rendererErrors, []);
    process.stdout.write(JSON.stringify({ status: 'passed', actionTypes: result.actions.map((action) => action.type), stream: result.stream, replayStatus }));
  } finally { await Promise.race([app.close().catch(() => undefined), new Promise((resolve) => setTimeout(resolve, 10_000))]); }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
