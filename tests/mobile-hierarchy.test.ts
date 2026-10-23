import { MobileHierarchyParser, MobileInspector } from '../src/mobile/inspector/MobileHierarchy';

const SOURCE = `<?xml version="1.0" encoding="UTF-8"?>
<hierarchy rotation="0">
  <android.widget.FrameLayout bounds="[0,0][1080,1920]">
    <android.widget.EditText resource-id="org.example:id/username" content-desc="Username" text="" bounds="[24,100][1056,180]" />
    <android.widget.Button resource-id="org.example:id/login" content-desc="Log in" text="Sign in &amp; continue" bounds="[24,200][1056,280]" />
    <android.widget.TextView text="Repeated" bounds="[24,300][400,350]" />
    <android.widget.TextView text="Repeated" bounds="[24,360][400,410]" />
  </android.widget.FrameLayout>
</hierarchy>`;

describe('MobileHierarchy', () => {
  test('parses the Appium XML tree, attributes, paths, and bounds', () => {
    const hierarchy = new MobileHierarchyParser().parse(SOURCE);
    const frame = hierarchy.roots[0].children[0];
    const button = frame.children[1];

    expect(hierarchy.nodeCount).toBe(6);
    expect(button.path).toEqual([0, 0, 1]);
    expect(button.attributes.text).toBe('Sign in & continue');
    expect(button.bounds).toEqual({ x: 24, y: 200, width: 1032, height: 80 });
  });

  test('ranks unique accessibility and resource IDs above text and XPath', () => {
    const inspected = new MobileInspector().inspect(SOURCE);
    const button = inspected.elements.find((element) => element.label === 'Log in');

    expect(button?.locators.map((locator) => locator.strategy)).toEqual([
      'accessibility id', 'id', '-android uiautomator', 'xpath',
    ]);
    expect(button?.locators[0]).toEqual(expect.objectContaining({ value: 'Log in', score: 0.98 }));
  });

  test('penalizes duplicate visible-text locators', () => {
    const inspected = new MobileInspector().inspect(SOURCE);
    const repeated = inspected.elements.find((element) => element.text === 'Repeated');
    const textLocator = repeated?.locators.find((locator) => locator.strategy === '-android uiautomator');

    expect(textLocator?.score).toBeLessThan(0.76);
    expect(textLocator?.reasons).toContain('2 matching elements in the current hierarchy');
  });

  test('rejects empty or structurally incomplete hierarchy source', () => {
    const parser = new MobileHierarchyParser();
    expect(() => parser.parse('')).toThrow('non-empty XML');
    expect(() => parser.parse('<hierarchy>')).toThrow('unclosed elements');
  });
});
