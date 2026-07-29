import {
  Browser,
  BrowserContext,
  BrowserType,
  LaunchOptions,
  Page,
  chromium,
} from 'playwright-core';

export interface BrowserCoreOptions {
  headless?: boolean;
  channel?: string;
  executablePath?: string;
  launchOptions?: Omit<LaunchOptions, 'headless' | 'channel' | 'executablePath'>;
}

export class BrowserCore {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  constructor(
    private readonly options: BrowserCoreOptions = {},
    private readonly browserType: BrowserType = chromium
  ) {}

  async launch(): Promise<void> {
    if (this.isConnected()) {
      return;
    }

    const executablePath =
      this.options.executablePath ?? process.env.CHROMATION_BROWSER_PATH;
    const channel = executablePath
      ? undefined
      : this.options.channel ?? process.env.CHROMATION_BROWSER_CHANNEL ?? 'chrome';

    this.browser = await this.browserType.launch({
      ...this.options.launchOptions,
      headless: this.options.headless ?? false,
      executablePath,
      channel,
    });

    this.browser.on('disconnected', () => {
      this.browser = null;
      this.context = null;
    });
  }

  async close(): Promise<void> {
    const context = this.context;
    const browser = this.browser;
    this.context = null;
    this.browser = null;

    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }

  async newPage(): Promise<Page> {
    if (!this.browser || !this.browser.isConnected()) {
      throw new Error('Browser is not connected. Call launch() before newPage().');
    }

    if (!this.context) {
      this.context = await this.browser.newContext();
    }

    return this.context.newPage();
  }

  isConnected(): boolean {
    return this.browser?.isConnected() ?? false;
  }
}
