import fs from 'fs';
import path from 'path';

describe('Mobile automation UI', () => {
  const html = fs.readFileSync(path.join(process.cwd(), 'ui', 'browser.html'), 'utf8');
  const renderer = fs.readFileSync(path.join(process.cwd(), 'ui', 'renderer.js'), 'utf8');
  const styles = fs.readFileSync(path.join(process.cwd(), 'ui', 'styles.css'), 'utf8');
  const devicePicker = fs.readFileSync(path.join(process.cwd(), 'ui', 'modules', 'connected-device-picker.js'), 'utf8');

  test('adds Mobile as a first-class labeled workspace', () => {
    expect(html).toContain('data-tool="mobile"');
    expect(html).toContain('<span>Mobile</span>');
    expect(renderer).toContain("case 'mobile':");
    expect(renderer).toContain('function showMobilePanel()');
  });

  test('provides target configuration and clear disconnected state', () => {
    for (const id of ['mobile-platform', 'mobile-mode', 'mobile-server-url', 'mobile-device-name',
      'mobile-connected-device', 'mobile-refresh-devices', 'mobile-device-picker-hint', 'mobile-device-udid', 'mobile-app-id', 'mobile-run-doctor', 'mobile-connect', 'mobile-connection-state']) {
      expect(html).toContain(`id="${id}"`);
    }
    expect(devicePicker).toContain("invoke('mobile-list-devices')");
    expect(renderer).toContain('chromation-device-selected');
    expect(html).toContain('Disconnected');
    expect(renderer).toContain('Opening Appium session');
  });

  test('shows device, context, hierarchy, and locator inspection surfaces', () => {
    for (const id of ['mobile-context', 'mobile-screen', 'mobile-orientation', 'mobile-device-preview',
      'mobile-refresh-hierarchy', 'mobile-hierarchy-empty', 'mobile-locator-preview']) {
      expect(html).toContain(`id="${id}"`);
    }
    expect(html).toContain('Select an element from the live hierarchy');
    expect(styles).toContain('.mobile-device-frame');
    expect(styles).toContain('.mobile-session-strip');
  });

  test('connects the UI to allowlisted mobile IPC and renders live inspection data', () => {
    for (const channel of ['mobile-connect', 'mobile-status', 'mobile-inspect', 'mobile-action', 'mobile-disconnect']) {
      expect(renderer).toContain(`ipcRenderer.invoke('${channel}'`);
    }
    expect(renderer).toContain('function renderMobileInspection(');
    expect(renderer).toContain('mobile-device-screenshot');
    expect(renderer).toContain('data-mobile-element-index');
    expect(html).not.toContain('Implementation status');
  });

  test('supports live tap, type, clear, locator selection, and adding recorder steps', () => {
    for (const marker of ['mobile-live-tap', 'mobile-live-type', 'mobile-live-clear', 'mobile-add-step',
      'function runLiveMobileAction(', 'function addSelectedMobileStep(', 'locatorFingerprint']) {
      expect(renderer).toContain(marker);
    }
  });

  test('supports hybrid contexts and common live device controls', () => {
    for (const marker of ['mobile-live-back', 'mobile-live-keyboard', 'mobile-live-rotate',
      'function runMobileDeviceAction(', "runMobileDeviceAction('switchContext'"]) {
      expect(`${html}\n${renderer}`).toContain(marker);
    }
  });

  test('can expand the live portrait inspector for precise recording', () => {
    expect(html).toContain('id="mobile-expand-preview"');
    expect(renderer).toContain('function toggleExpandedMobileInspector()');
    expect(styles).toContain('.mobile-inspector-card.expanded');
    expect(styles).toContain('height: min(640px, 76vh)');
  });

  test('uses screenshot hit testing as a preview-first authoring surface', () => {
    for (const marker of ['handleMobileScreenshotPointer', 'mapMobileScreenshotPointer',
      'resolveMobileElementAtPoint', 'mobile-element-highlight', 'Tap &amp; add step',
      'No stable locator is available', 'coordinates=']) {
      expect(`${renderer}\n${styles}`).toContain(marker);
    }
  });

  test('records preview gestures into a live, editable automation timeline foundation', () => {
    for (const id of ['mobile-record-start', 'mobile-record-pause', 'mobile-record-stop', 'mobile-record-replay', 'mobile-record-save',
      'mobile-record-assert', 'mobile-record-duration', 'mobile-record-count', 'mobile-record-stream', 'mobile-live-action-feed']) {
      expect(html).toContain(`id="${id}"`);
    }
    expect(html).toContain('id="mobile-app-activity"');
    expect(html).toContain('id="mobile-target-dialog"');
    expect(html).toContain('Save target &amp; record');
    expect(html).toContain('id="mobile-replay-reset-state"');
    expect(html).toContain('id="replay-reset-app-state"');
    expect(renderer).toContain('Android main activity is required before recording');
    expect(renderer).toContain('requestMobileTargetIdentification(platform, appId, appActivity)');
    expect(renderer).toContain("finish({ appId: targetAppId, appActivity: ios ? '' : targetActivity })");
    expect(renderer).toContain("ipcRenderer.invoke('mobile-workspace-readiness'");
    expect(renderer).toContain('data-mobile-feed-duplicate');
    expect(renderer).toContain("addEventListener('dragstart'");
    for (const marker of ['startMobileDeviceRecording', 'finishMobileRecordingPointer',
      'mobileRecording.capture', 'mobileRecording.append', 'renderMobileRecordingFeed',
      'mobile-capture-ripple', 'mobile-touch-capture-start', 'mobile-native-touch']) {
      expect(`${renderer}\n${styles}`).toContain(marker);
    }
    expect(html).toContain('id="mobile-text-dialog"');
    expect(renderer).toContain('captureMobileTextInput');
    expect(renderer).toContain('previewMobileRecordingTarget');
    expect(renderer).toContain('mobileInspectionRefreshPromise');
    expect(renderer).toContain('data-mobile-feed-delete');
    expect(renderer).toContain("ipcRenderer.invoke('mobile-status')");
    expect(renderer).toContain('Restored the active mobile device session.');
    expect(renderer).toContain('Recording could not start:');
    expect(renderer).toContain('replayMobileRecordingFromStudio');
    expect(renderer).toContain('beginIsolatedMobileRecording(launchAction');
    expect(renderer).toContain('await recorder.setActions([launchAction])');
    expect(renderer).toContain("save?.addEventListener('click', saveRecording)");
    expect(renderer).toContain("ipcRenderer.invoke('mobile-replay-status')");
    expect(renderer).toContain('Android replay stopped before completion:');
    expect(renderer).toContain('Android replay did not execute any steps');
    expect(renderer).toContain('resetAppState: policy.resetAppState === true');
    expect(renderer).toContain('findFocusedEditableMobileElement');
    expect(renderer).toContain('captureChangedMobileText');
    expect(renderer).toContain('mobileNativeCaptureQueue');
    expect(renderer).toContain('function showToast(');
  });

  test('keeps Phase 2 setup and operations powerful but progressively disclosed', () => {
    for (const marker of ['mobile-profile-row', 'mobile-advanced', 'mobile-command-studio',
      'mobile-doctor-results', 'Action studio', 'Advanced capabilities', 'mobile-keyboard-state',
      'mobile-preflight', 'mobile-save-profile']) {
      expect(`${html}\n${renderer}\n${styles}`).toContain(marker);
    }
  });

  test('asks authors to choose mobile identifiers and makes coordinate fallback explicit', () => {
    for (const id of ['mobile-locator-dialog', 'mobile-locator-form', 'mobile-locator-choices', 'mobile-locator-cancel']) {
      expect(html).toContain(`id="${id}"`);
    }
    expect(renderer).toContain('requestMobileCaptureLocator(sample, context)');
    expect(renderer).toContain("'Use coordinates for this step?'");
    expect(renderer).toContain('preferredLocator: candidates');
    expect(styles).toContain('.mobile-locator-choice');
  });

  test('shows exact copyable remediation commands for failed mobile setup checks', () => {
    expect(renderer).toContain('mobile-doctor-copy');
    expect(renderer).toContain('navigator.clipboard.writeText');
    expect(styles).toContain('.mobile-doctor-command');
  });
});
