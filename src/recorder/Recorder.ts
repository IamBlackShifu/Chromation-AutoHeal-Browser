/**
 * Recorder - Script Recording Module
 *
 * Records user browser interactions and converts them into automation scripts
 * Supports multiple export formats: Selenium, Playwright, Cypress, Puppeteer
 */
import type { LocatorFingerprint } from '../healing/HealingEngine';
import { validateRecordedAction, validateRecordedActions } from '../recording/RecordingSchema';
import { sanitizeRecordedAction } from '../recording/Security';

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
  | 'plugin';

export interface AssertionMetadata {
  kind:
    | 'text-contains'
    | 'visible'
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

    switch (format) {
      case 'playwright':
        return this.generatePlaywrightScript();
      case 'selenium-js':
        return this.generateSeleniumJSScript();
      case 'selenium-python':
        return this.generateSeleniumPythonScript();
      case 'selenium-java':
        return this.generateSeleniumJavaScript();
      case 'cypress':
        return this.generateCypressScript();
      case 'puppeteer':
        return this.generatePuppeteerScript();
      case 'cdp':
        return this.generateCDPScript();
      default:
        return this.generatePlaywrightScript();
    }
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
    return `import org.openqa.selenium.*;\nimport org.openqa.selenium.chrome.ChromeDriver;\nimport org.openqa.selenium.support.ui.Select;\npublic class ChromationTest {\n  public static void main(String[] args) {\n    WebDriver driver = new ChromeDriver();\n    try {\n${lines}\n    } finally { driver.quit(); }\n  }\n}\n`;
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
