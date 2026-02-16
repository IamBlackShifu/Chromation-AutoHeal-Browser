import { Inspector, LocatorStrategy } from '../src/inspector/Inspector';

describe('Inspector', () => {
  let inspector: Inspector;

  beforeEach(() => {
    inspector = new Inspector();
  });

  test('should initialize correctly', () => {
    expect(inspector).toBeDefined();
    expect(inspector.isInspecting()).toBe(false);
  });

  test('should start and stop inspection', () => {
    inspector.startInspection();
    expect(inspector.isInspecting()).toBe(true);

    inspector.stopInspection();
    expect(inspector.isInspecting()).toBe(false);
  });

  test('should inspect element', async () => {
    const mockElement = {};
    const info = await inspector.inspectElement(mockElement);
    
    expect(info).toBeDefined();
    expect(info.tag).toBe('div');
    expect(info.visible).toBe(true);
  });

  test('should generate locators', async () => {
    const mockElement = {};
    const locators = await inspector.generateLocators(mockElement);
    
    expect(Array.isArray(locators)).toBe(true);
  });
});
