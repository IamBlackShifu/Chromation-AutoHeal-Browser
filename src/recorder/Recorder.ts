/**
 * Recorder - Script Recording Module
 *
 * Records user browser interactions and converts them into automation scripts
 * Supports multiple export formats: Selenium, Playwright, Cypress, Puppeteer
 */

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
  | 'waitForPageLoad';

export interface AssertionMetadata {
  kind: 'text-contains' | 'visible' | 'value-equals' | 'attribute-equals';
  expected?: string;
  attributeName?: string;
}

export interface RecordedAction {
  type: ActionType;
  selector: string;
  value?: string;
  extra?: string;
  xpath?: string;
  timestamp: number;
  metadata?: Record<string, any> | AssertionMetadata;
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
      this.actions.push(action);
      console.log(`Action recorded: ${action.type} on ${action.selector}`);
    }
  }

  getActions(): RecordedAction[] {
    return [...this.actions];
  }

  setActions(actions: RecordedAction[]): void {
    this.actions = [...actions];
    console.log(`Recorder actions replaced. Loaded ${this.actions.length} actions`);
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
      case 'cypress':
        return this.generateCypressScript();
      case 'puppeteer':
        return this.generatePuppeteerScript();
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

    for (const action of this.actions) {
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
    }
  }

  private generateSeleniumJSScript(): string {
    let script = `const { Builder, By, Key } = require('selenium-webdriver');

(async function example() {
  let driver = await new Builder().forBrowser('chrome').build();

  try {
`;

    for (const action of this.actions) {
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

    for (const action of this.actions) {
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

    for (const action of this.actions) {
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

    for (const action of this.actions) {
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
}
