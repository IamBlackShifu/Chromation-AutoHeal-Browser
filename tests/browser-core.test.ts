import type { Browser, BrowserContext, BrowserType, Page } from 'playwright-core';
import { BrowserCore } from '../src/core/BrowserCore';

describe('BrowserCore', () => {
  test('launches a configured browser and creates a page', async () => {
    const page = {} as Page;
    const context = {
      newPage: jest.fn().mockResolvedValue(page),
      close: jest.fn().mockResolvedValue(undefined),
    } as unknown as BrowserContext;
    const browser = {
      isConnected: jest.fn().mockReturnValue(true),
      newContext: jest.fn().mockResolvedValue(context),
      close: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
    } as unknown as Browser;
    const browserType = {
      launch: jest.fn().mockResolvedValue(browser),
    } as unknown as BrowserType;

    const core = new BrowserCore(
      { headless: true, executablePath: 'C:\\browsers\\chrome.exe' },
      browserType
    );

    await core.launch();
    expect(core.isConnected()).toBe(true);
    expect(browserType.launch).toHaveBeenCalledWith(
      expect.objectContaining({
        headless: true,
        executablePath: 'C:\\browsers\\chrome.exe',
        channel: undefined,
      })
    );
    await expect(core.newPage()).resolves.toBe(page);

    await core.close();
    expect(context.close).toHaveBeenCalled();
    expect(browser.close).toHaveBeenCalled();
    expect(core.isConnected()).toBe(false);
  });

  test('refuses to create a page before launch', async () => {
    const core = new BrowserCore();
    await expect(core.newPage()).rejects.toThrow('Browser is not connected');
  });
});
