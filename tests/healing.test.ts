import { HealingEngine, HealingResult } from '../src/healing/HealingEngine';

describe('HealingEngine', () => {
  let healingEngine: HealingEngine;

  beforeEach(() => {
    healingEngine = new HealingEngine();
  });

  test('should initialize correctly', () => {
    expect(healingEngine).toBeDefined();
    expect(healingEngine.isEnabled()).toBe(true);
  });

  test('should enable and disable healing', () => {
    healingEngine.disable();
    expect(healingEngine.isEnabled()).toBe(false);

    healingEngine.enable();
    expect(healingEngine.isEnabled()).toBe(true);
  });

  test('should detect broken locators', async () => {
    const isBroken = await healingEngine.detectBrokenLocator('#non-existent');
    expect(typeof isBroken).toBe('boolean');
  });

  test('should attempt to heal locator', async () => {
    const result = await healingEngine.healLocator('#broken-selector', {});
    
    expect(result).toBeDefined();
    if (result) {
      expect(result.originalSelector).toBe('#broken-selector');
      expect(result.confidence).toBeGreaterThanOrEqual(0);
    }
  });

  test('should not heal when disabled', async () => {
    healingEngine.disable();
    const result = await healingEngine.healLocator('#broken', {});
    expect(result).toBeNull();
  });

  test('should track healing history', async () => {
    await healingEngine.healLocator('#selector1', {});
    await healingEngine.healLocator('#selector2', {});
    
    const history = healingEngine.getHealingHistory();
    expect(history).toHaveLength(2);
  });

  test('should clear history', async () => {
    await healingEngine.healLocator('#selector', {});
    healingEngine.clearHistory();
    
    const history = healingEngine.getHealingHistory();
    expect(history).toHaveLength(0);
  });
});
