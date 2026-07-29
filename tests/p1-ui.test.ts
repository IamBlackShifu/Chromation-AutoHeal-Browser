import fs from 'fs';
import path from 'path';

describe('P1 recorder UI integrations', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'ui', 'browser.html'), 'utf8');
  const renderer = fs.readFileSync(path.join(__dirname, '..', 'ui', 'renderer.js'), 'utf8');
  const preload = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8');

  test('exposes project data, environments, flows, hooks, healing policies, and limitations', () => {
    expect(html).toContain('Test Data & Environment');
    expect(html).toContain('save-environment-btn');
    expect(html).toContain('save-flow-btn');
    expect(html).toContain('save-hook-btn');
    expect(html).toContain('healing-policy-select');
    expect(html).toContain('Closed Shadow DOM');
    expect(renderer).toContain('initializeP1AuthoringControls');
    expect(renderer).toContain('scoreRecordedLocator');
    expect(renderer).toContain('buildFingerprintLocators');
    expect(preload).toContain('persistHealedLocator');
  });

  test('offers every supported script and report format', () => {
    ['playwright', 'selenium-js', 'selenium-python', 'selenium-java', 'cypress', 'puppeteer', 'cdp']
      .forEach((format) => expect(html).toContain(`value="${format}"`));
    expect(html).toContain('value="pdf"');
  });

  test('exposes P2 suite organization and matrix execution controls', () => {
    expect(html).toContain('Suites & Matrix Runs');
    expect(html).toContain('create-suite-btn');
    expect(html).toContain('add-suite-test-btn');
    expect(html).toContain('run-suite-matrix-btn');
    expect(renderer).toContain('initializeSuiteControls');
    expect(preload).toContain('executeSuiteMatrix');
  });

  test('exposes reviewed generation, schedules, and advanced executor step configuration', () => {
    expect(html).toContain('Generate Test from Language');
    expect(html).toContain('approve-generated-test-btn');
    expect(html).toContain('Headless Schedule');
    expect(renderer).toContain('initializeAdvancedP2Controls');
    expect(renderer).toContain("'mockNetwork'");
    expect(renderer).toContain("'accessibility'");
    expect(renderer).toContain("'performance'");
    expect(preload).toContain('executableActions');
    expect(preload).toContain('scheduler.create');
  });

  test('exposes permission-reviewed plugin management and custom plugin steps', () => {
    expect(html).toContain('menu-plugins');
    expect(html).toContain('plugins-panel-template');
    expect(html).toContain('approve-plugin-permissions');
    expect(renderer).toContain('showPluginsPanel');
    expect(renderer).toContain("'plugin'");
    expect(preload).toContain('approvePermissions');
    expect(preload).toContain('listExtensions');
  });
});
