/**
 * Recorder - Script Recording Module
 *
 * Records user browser interactions and converts them into automation scripts
 * Supports multiple export formats: Selenium, Playwright, Cypress, Puppeteer
 */
import type { LocatorFingerprint } from '../healing/HealingEngine';
import { validateRecordedAction, validateRecordedActions } from '../recording/RecordingSchema';
import { sanitizeRecordedAction } from '../recording/Security';
import { generateAppiumJava, generateAppiumPython } from '../drivers/appium/AppiumExporters';

export type ActionType =
  | 'click'
  | 'input'
  | 'select'
  | 'drag'
  | 'upload'
  | 'navigate'
  | 'assert'
  | 'wait'
  | 'hover'
  | 'keyboard'
  | 'keypress'
  | 'scroll'
  | 'doubleclick'
  | 'rightclick'
  | 'checkbox'
  | 'radio'
  | 'focus'
  | 'dragstart'
  | 'drop'
  | 'submit'
  | 'waitForPageLoad'
  | 'scrape'
  | 'visual'
  | 'api'
  | 'mockNetwork'
  | 'accessibility'
  | 'performance'
  | 'plugin'
  | 'tap'
  | 'longPress'
  | 'swipe'
  | 'back'
  | 'rotate'
  | 'clear'
  | 'launchApp'
  | 'terminateApp'
  | 'switchContext'
  | 'hideKeyboard'
  | 'deepLink'
  | 'acceptAlert'
  | 'dismissAlert'
  | 'grantPermission'
  | 'revokePermission'
  | 'resetApp'
  | 'installApp'
  | 'clearAppData'
  | 'mobileKey';

export interface AssertionMetadata {
  kind:
    | 'text-contains'
    | 'visible'
    | 'enabled'
    | 'value-equals'
    | 'attribute-equals'
    | 'count-equals'
    | 'url-equals'
    | 'url-contains'
    | 'title-equals'
    | 'response-status';
  expected?: string;
  attributeName?: string;
  responseUrl?: string;
}

export interface RecordedAction {
  type: ActionType;
  selector: string;
  value?: string;
  extra?: string;
  xpath?: string;
  timestamp: number;
  metadata?: Record<string, unknown> | AssertionMetadata;
  locatorFingerprint?: LocatorFingerprint;
}

export type ExportFormat =
  | 'appium-typescript'
  | 'appium-java'
  | 'appium-python'
  | 'selenium-java'
  | 'selenium-python'
  | 'selenium-js'
  | 'playwright'
  | 'cypress'
  | 'puppeteer'
  | 'cdp';

export class Recorder {
  private isRecording: boolean = false;
  private actions: RecordedAction[] = [];
  private recordingMode: 'manual' | 'auto' | 'step' = 'manual';

  constructor() {
    console.log('Recorder initialized');
  }

  startRecording(mode: 'manual' | 'auto' | 'step' = 'manual'): void {
    this.isRecording = true;
    this.recordingMode = mode;
    this.actions = [];
    console.log(`Recording started in ${mode} mode`);
  }

  stopRecording(): void {
    this.isRecording = false;
    console.log(`Recording stopped. Captured ${this.actions.length} actions`);
  }

  recordAction(action: RecordedAction): void {
    if (this.isRecording) {
      this.actions.push(sanitizeRecordedAction(validateRecordedAction(action)));
      console.log(`Action recorded: ${action.type} on ${action.selector}`);
    }
  }

  getActions(): RecordedAction[] {
    return [...this.actions];
  }

  updateLastAction(action: RecordedAction): boolean {
    if (this.actions.length === 0) {
      return false;
    }
    const current = this.actions[this.actions.length - 1];
    if (current.type !== action.type || current.selector !== action.selector) {
      return false;
    }
    this.actions[this.actions.length - 1] = sanitizeRecordedAction(validateRecordedAction(action));
    return true;
  }

  setActions(actions: RecordedAction[]): void {
    this.actions = validateRecordedActions(actions).map(sanitizeRecordedAction);
    console.log(`Recorder actions replaced. Loaded ${this.actions.length} actions`);
  }

  updateAction(index: number, action: RecordedAction): RecordedAction {
    this.assertActionIndex(index);
    const validated = sanitizeRecordedAction(validateRecordedAction(action));
    this.actions[index] = validated;
    return validated;
  }

  duplicateAction(index: number): RecordedAction {
    this.assertActionIndex(index);
    const duplicate = validateRecordedAction({
      ...this.actions[index],
      timestamp: Date.now(),
      metadata: this.actions[index].metadata
        ? { ...this.actions[index].metadata }
        : undefined,
    });
    this.actions.splice(index + 1, 0, duplicate);
    return duplicate;
  }

  deleteAction(index: number): RecordedAction {
    this.assertActionIndex(index);
    return this.actions.splice(index, 1)[0];
  }

  moveAction(fromIndex: number, toIndex: number): boolean {
    this.assertActionIndex(fromIndex);
    if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex >= this.actions.length) {
      return false;
    }
    if (fromIndex === toIndex) return true;
    const [action] = this.actions.splice(fromIndex, 1);
    this.actions.splice(toIndex, 0, action);
    return true;
  }

  setActionDisabled(index: number, disabled: boolean): RecordedAction {
    this.assertActionIndex(index);
    const action = this.actions[index];
    return this.updateAction(index, {
      ...action,
      metadata: { ...(action.metadata ?? {}), disabled },
    });
  }

  persistHealedLocator(index: number, healedSelector: string): RecordedAction {
    this.assertActionIndex(index);
    const action = this.actions[index];
    return this.updateAction(index, {
      ...action,
      selector: healedSelector,
      metadata: { ...(action.metadata ?? {}), previousSelector: action.selector, healingApprovedAt: Date.now() },
    });
  }

  async exportScript(format: ExportFormat): Promise<string> {
    console.log(`Exporting script in ${format} format with ${this.actions.length} actions...`);
    let script: string;
    switch (format) {
      case 'appium-typescript':
        script = this.generateAppiumTypeScript(); break;
      case 'appium-java':
        script = generateAppiumJava(this.enabledActions()); break;
      case 'appium-python':
        script = generateAppiumPython(this.enabledActions()); break;
      case 'playwright':
        script = this.generatePlaywrightScript(); break;
      case 'selenium-js':
        script = this.generateSeleniumJSScript(); break;
      case 'selenium-python':
        script = this.generateSeleniumPythonScript(); break;
      case 'selenium-java':
        script = this.generateSeleniumJavaScript(); break;
      case 'cypress':
        script = this.generateCypressScript(); break;
      case 'puppeteer':
        script = this.generatePuppeteerScript(); break;
      case 'cdp':
        script = this.generateCDPScript(); break;
      default:
        script = this.generatePlaywrightScript();
    }
    return `/**\n * Generated by OmniFlow QA\n * Product of Infinity Lines of Code Pvt Ltd\n * Date: ${new Date().toISOString()}\n */\n${script}`;
  }

  private generatePlaywrightScript(): string {
    let script = `const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
`;

    for (const action of this.enabledActions()) {
      const selector = this.escapeSingleQuoted(action.selector);
      const value = this.escapeSingleQuoted(action.value ?? '');

      switch (action.type) {
        case 'navigate':
          script += `    await page.goto('${value}');\n`;
          break;
        case 'click':
          script += `    await page.click('${selector}');\n`;
          break;
        case 'input':
          script += `    await page.fill('${selector}', '${value}');\n`;
          break;
        case 'select':
          script += `    await page.selectOption('${selector}', '${value}');\n`;
          break;
        case 'hover':
          script += `    await page.hover('${selector}');\n`;
          break;
        case 'keyboard':
        case 'keypress':
          script += `    await page.keyboard.press('${value}');\n`;
          break;
        case 'waitForPageLoad':
          script += `    await page.waitForLoadState('domcontentloaded');\n`;
          break;
        case 'assert':
          script += this.generatePlaywrightAssertion(action);
          break;
      }
    }

    script += `
    console.log('Test completed successfully!');
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await browser.close();
  }
})();
`;

    return script;
  }

  private generatePlaywrightAssertion(action: RecordedAction): string {
    const metadata = action.metadata as AssertionMetadata | undefined;
    const selector = this.escapeSingleQuoted(action.selector);
    const expected = this.escapeSingleQuoted(metadata?.expected ?? '');
    const attributeName = this.escapeSingleQuoted(metadata?.attributeName ?? '');

    switch (metadata?.kind) {
      case 'text-contains':
        return `    const assertText = await page.locator('${selector}').first().textContent();\n    if (!assertText || !assertText.includes('${expected}')) {\n      throw new Error('Assertion failed: expected text to contain ${expected}');\n    }\n`;
      case 'value-equals':
        return `    const assertValue = await page.locator('${selector}').first().inputValue();\n    if (assertValue !== '${expected}') {\n      throw new Error('Assertion failed: expected value ${expected} but got ' + assertValue);\n    }\n`;
      case 'attribute-equals':
        return `    const assertAttr = await page.locator('${selector}').first().getAttribute('${attributeName}');\n    if ((assertAttr || '') !== '${expected}') {\n      throw new Error('Assertion failed: expected attribute ${attributeName}=${expected} but got ' + (assertAttr || ''));\n    }\n`;
      case 'visible':
      default:
        return `    await page.locator('${selector}').first().waitFor({ state: 'visible' });\n`;
      case 'count-equals':
        return `    const assertCount = await page.locator('${selector}').count();\n    if (assertCount !== Number('${expected}')) throw new Error('Assertion failed: expected count ${expected} but got ' + assertCount);\n`;
      case 'url-equals':
        return `    if (page.url() !== '${expected}') throw new Error('Assertion failed: expected URL ${expected} but got ' + page.url());\n`;
      case 'url-contains':
        return `    if (!page.url().includes('${expected}')) throw new Error('Assertion failed: expected URL to contain ${expected}');\n`;
      case 'title-equals':
        return `    const assertTitle = await page.title();\n    if (assertTitle !== '${expected}') throw new Error('Assertion failed: expected title ${expected} but got ' + assertTitle);\n`;
      case 'response-status': {
        const responseUrl = this.escapeSingleQuoted(metadata?.responseUrl ?? '');
        return `    const assertResponse = await page.waitForResponse(response => response.url().includes('${responseUrl}'));\n    if (assertResponse.status() !== Number('${expected}')) throw new Error('Assertion failed: expected response status ${expected} but got ' + assertResponse.status());\n`;
      }
    }
  }

  private generateSeleniumJSScript(): string {
    let script = `const { Builder, By, Key } = require('selenium-webdriver');

(async function example() {
  let driver = await new Builder().forBrowser('chrome').build();

  try {
`;

    for (const action of this.enabledActions()) {
      const selector = this.escapeSingleQuoted(action.selector);
      const value = this.escapeSingleQuoted(action.value ?? '');

      switch (action.type) {
        case 'navigate':
          script += `    await driver.get('${value}');\n`;
          break;
        case 'click':
          script += `    await driver.findElement(By.css('${selector}')).click();\n`;
          break;
        case 'input':
          script += `    await driver.findElement(By.css('${selector}')).sendKeys('${value}');\n`;
          break;
      }
    }

    script += `
    console.log('Test completed successfully!');
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await driver.quit();
  }
})();
`;

    return script;
  }

  private generateSeleniumPythonScript(): string {
    let script = `from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
import time

driver = webdriver.Chrome()

try:
`;

    for (const action of this.enabledActions()) {
      const selector = this.escapeSingleQuoted(action.selector);
      const value = this.escapeSingleQuoted(action.value ?? '');

      switch (action.type) {
        case 'navigate':
          script += `    driver.get('${value}')\n`;
          break;
        case 'click':
          script += `    driver.find_element(By.CSS_SELECTOR, '${selector}').click()\n`;
          break;
        case 'input':
          script += `    driver.find_element(By.CSS_SELECTOR, '${selector}').send_keys('${value}')\n`;
          break;
      }
      script += `    time.sleep(0.5)\n`;
    }

    script += `
    print('Test completed successfully!')
except Exception as e:
    print(f'Test failed: {e}')
finally:
    driver.quit()
`;

    return script;
  }

  private generateCypressScript(): string {
    let script = `describe('Recorded Test', () => {
  it('should execute recorded actions', () => {
`;

    for (const action of this.enabledActions()) {
      const selector = this.escapeSingleQuoted(action.selector);
      const value = this.escapeSingleQuoted(action.value ?? '');

      switch (action.type) {
        case 'navigate':
          script += `    cy.visit('${value}');\n`;
          break;
        case 'click':
          script += `    cy.get('${selector}').click();\n`;
          break;
        case 'input':
          script += `    cy.get('${selector}').type('${value}');\n`;
          break;
      }
    }

    script += `  });
});
`;

    return script;
  }

  private generatePuppeteerScript(): string {
    let script = `const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  try {
`;

    for (const action of this.enabledActions()) {
      const selector = this.escapeSingleQuoted(action.selector);
      const value = this.escapeSingleQuoted(action.value ?? '');

      switch (action.type) {
        case 'navigate':
          script += `    await page.goto('${value}');\n`;
          break;
        case 'click':
          script += `    await page.click('${selector}');\n`;
          break;
        case 'input':
          script += `    await page.type('${selector}', '${value}');\n`;
          break;
      }
    }

    script += `
    console.log('Test completed successfully!');
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await browser.close();
  }
})();
`;

    return script;
  }

  private generateAppiumTypeScript(): string {
    const actions = JSON.stringify(this.enabledActions(), null, 2).replace(/</g, '\\u003c');
    return `import { remote } from 'webdriverio';

const capabilities = {
  platformName: 'Android',
  'appium:automationName': 'UiAutomator2',
  'appium:deviceName': process.env.APPIUM_DEVICE_NAME || 'Android',
  ...(process.env.APPIUM_UDID ? { 'appium:udid': process.env.APPIUM_UDID } : {}),
  ...(process.env.APPIUM_APP_ID ? { 'appium:appPackage': process.env.APPIUM_APP_ID } : {}),
};

const actions = ${actions} as const;

async function find(driver: WebdriverIO.Browser, selector: string) {
  const separator = selector.indexOf('=');
  const strategy = separator < 0 ? 'accessibility id' : selector.slice(0, separator);
  const value = separator < 0 ? selector : selector.slice(separator + 1);
  const prefixes: Record<string, string> = {
    'accessibility id': '~', id: 'id=', xpath: '', 'class name': 'class name=',
    '-android uiautomator': 'android=',
  };
  return driver.$(strategy === 'xpath' ? value : \`${'${prefixes[strategy] ?? "~"}'}${'${value}'}\`);
}

async function run() {
  const driver = await remote({ hostname: '127.0.0.1', port: 4723, path: '/', capabilities });
  try {
    for (const action of actions) {
      if (action.type === 'wait') { await driver.pause(Number(action.value) || 0); continue; }
      if (action.type === 'back') { await driver.back(); continue; }
      if (action.type === 'hideKeyboard') { await driver.hideKeyboard(); continue; }
      if (action.type === 'rotate') { await driver.setOrientation(String(action.value || 'PORTRAIT')); continue; }
      if (action.type === 'switchContext') {
        const deadline = Date.now() + Number(action.metadata?.timeoutMs || 20000);
        let target: string | undefined;
        while (Date.now() < deadline && !target) { const contexts = await driver.getContexts(); target = contexts.find((context) => context === String(action.value) || (String(action.value) === 'WEBVIEW' && context.startsWith('WEBVIEW'))); if (!target) await driver.pause(250); }
        if (!target) throw new Error('WebView context was not available'); await driver.switchContext(target); continue;
      }
      if (action.type === 'launchApp') { await driver.activateApp(String(action.value)); continue; }
      if (action.type === 'terminateApp') { await driver.terminateApp(String(action.value)); continue; }
      if (action.type === 'installApp') { await driver.installApp(String(action.value)); continue; }
      if (action.type === 'resetApp') { const appId = String(action.value || process.env.APPIUM_APP_ID || ''); await driver.terminateApp(appId); await driver.activateApp(appId); continue; }
      if (action.type === 'mobileKey') { const codes: Record<string, number> = { home: 3, enter: 66, go: 66, search: 84 }; await driver.execute('mobile: pressKey', { keycode: codes[String(action.value).toLowerCase()] }); continue; }
      if (action.type === 'clearAppData') { throw new Error('clearAppData requires an approved device reset fixture and is not executed by exported tests'); }
      if (action.type === 'deepLink') { await driver.execute('mobile: deepLink', { url: String(action.value), package: String(action.metadata?.package || process.env.APPIUM_APP_ID || '') }); continue; }
      if (action.type === 'acceptAlert') { await driver.acceptAlert(); continue; }
      if (action.type === 'dismissAlert') { await driver.dismissAlert(); continue; }
      if (action.type === 'grantPermission' || action.type === 'revokePermission') { await driver.execute('mobile: changePermissions', { action: action.type === 'grantPermission' ? 'grant' : 'revoke', appPackage: String(action.metadata?.package || process.env.APPIUM_APP_ID || ''), permissions: [String(action.value)] }); continue; }
      if (action.type === 'swipe' || action.type === 'scroll') { const data = action.metadata || {}; await driver.action('pointer', { parameters: { pointerType: 'touch' } }).move({ x: Number(data.startX), y: Number(data.startY) }).down().move({ duration: Number(data.durationMs || 500), x: Number(data.endX), y: Number(data.endY) }).up().perform(); continue; }
      const coordinate = action.selector.match(/^coordinates=(\\d+),(\\d+)$/);
      if (action.type === 'tap' && coordinate) { await driver.action('pointer', { parameters: { pointerType: 'touch' } }).move({ x: Number(coordinate[1]), y: Number(coordinate[2]) }).down().up().perform(); continue; }
      const element = await find(driver, action.selector);
      if (action.type === 'tap' || action.type === 'click') await element.click();
      if (action.type === 'longPress') await driver.action('pointer', { parameters: { pointerType: 'touch' } }).move({ origin: element }).down().pause(Number(action.metadata?.durationMs || 800)).up().perform();
      if (action.type === 'clear') await element.clearValue();
      if (action.type === 'input') await element.setValue(action.value || '');
      if (action.type === 'assert') {
        const expected = String(action.metadata?.expected ?? action.value ?? '');
        const actual = await element.getText();
        if (!actual.includes(expected)) throw new Error(\`Expected "${'${expected}'}" in "${'${actual}'}"\`);
      }
    }
  } finally { await driver.deleteSession(); }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
`;
  }

  private generateSeleniumJavaScript(): string {
    const lines = this.enabledActions().map((action) => {
      const selector = this.escapeDoubleQuoted(action.selector);
      const value = this.escapeDoubleQuoted(action.value ?? '');
      if (action.type === 'navigate') return `    driver.get("${value}");`;
      if (action.type === 'click') return `    driver.findElement(By.cssSelector("${selector}")).click();`;
      if (action.type === 'input') return `    driver.findElement(By.cssSelector("${selector}")).sendKeys("${value}");`;
      if (action.type === 'select') return `    new Select(driver.findElement(By.cssSelector("${selector}"))).selectByValue("${value}");`;
      return `    // ${action.type}: ${selector}`;
    }).join('\n');
    return `import org.openqa.selenium.*;\nimport org.openqa.selenium.chrome.ChromeDriver;\nimport org.openqa.selenium.support.ui.Select;\npublic class OmniFlowQATest {\n  public static void main(String[] args) {\n    WebDriver driver = new ChromeDriver();\n    try {\n${lines}\n    } finally { driver.quit(); }\n  }\n}\n`;
  }

  private generateCDPScript(): string {
    const actions = JSON.stringify(this.enabledActions()).replace(/</g, '\\u003c');
    return `const CDP = require('chrome-remote-interface');\n(async () => {\n  const client = await CDP();\n  const { Runtime, Page } = client;\n  await Promise.all([Runtime.enable(), Page.enable()]);\n  const actions = ${actions};\n  for (const action of actions) {\n    if (action.type === 'navigate') { await Page.navigate({ url: action.value }); await Page.loadEventFired(); continue; }\n    const expression = \`(() => { const el = document.querySelector(\${JSON.stringify(action.selector)}); if (!el) throw new Error('Element not found'); if (\${JSON.stringify(action.type)} === 'click') el.click(); if (\${JSON.stringify(action.type)} === 'input') { el.value = \${JSON.stringify(action.value || '')}; el.dispatchEvent(new Event('input', { bubbles: true })); } })()\`;\n    await Runtime.evaluate({ expression, awaitPromise: true });\n  }\n  await client.close();\n})().catch(error => { console.error(error); process.exitCode = 1; });\n`;
  }

  clearActions(): void {
    this.actions = [];
    console.log('Recording cleared');
  }

  isActive(): boolean {
    return this.isRecording;
  }

  private escapeSingleQuoted(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
  }

  private escapeDoubleQuoted(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
  }

  private enabledActions(): RecordedAction[] {
    return this.actions.filter((action) =>
      (action.metadata as Record<string, unknown> | undefined)?.disabled !== true
    );
  }

  private assertActionIndex(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.actions.length) {
      throw new RangeError(`Action index ${index} is out of range`);
    }
  }
}
