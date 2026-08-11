import { WebAutomationDriver } from '../src/drivers/web/WebAutomationDriver';
import type { ScriptExecutor } from '../src/executor/ScriptExecutor';

describe('WebAutomationDriver', () => {
  test('publishes web capabilities for preflight', () => {
    const driver = new WebAutomationDriver();
    const capabilities = driver.getCapabilities();

    expect(capabilities.platform).toBe('web');
    expect(capabilities.modes).toContain('mobileWeb');
    expect(capabilities.actions).toEqual(expect.arrayContaining(['click', 'input', 'assert']));
    expect(capabilities.features.healing).toBe(true);
  });

  test('delegates execution and lifecycle controls to ScriptExecutor', async () => {
    const result = { runId: 'run-1' };
    const executor = {
      execute: jest.fn().mockResolvedValue(result),
      cancel: jest.fn().mockReturnValue(true),
      pause: jest.fn().mockReturnValue(true),
      resume: jest.fn().mockReturnValue(true),
      step: jest.fn().mockReturnValue(true),
      getState: jest.fn().mockReturnValue({ state: 'idle' }),
      close: jest.fn().mockResolvedValue(undefined),
    } as unknown as ScriptExecutor;
    const driver = new WebAutomationDriver(executor);

    await expect(driver.execute([])).resolves.toBe(result);
    expect(driver.pause()).toBe(true);
    expect(driver.resume()).toBe(true);
    expect(driver.step()).toBe(true);
    expect(driver.cancel('stop')).toBe(true);
    expect(driver.getState()).toEqual({ state: 'idle' });
    await driver.close();

    expect(executor.execute).toHaveBeenCalledWith([], undefined);
    expect(executor.cancel).toHaveBeenCalledWith('stop');
    expect(executor.close).toHaveBeenCalled();
  });
});
