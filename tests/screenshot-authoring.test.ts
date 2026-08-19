import { mapScreenshotPointer, resolveElementAtPoint, stableLocators } from '../src/mobile/inspector/ScreenshotAuthoring';

describe('expanded screenshot authoring', () => {
  test('maps scaled pointer coordinates to original screenshot pixels', () => {
    expect(mapScreenshotPointer({ x: 150, y: 300 }, { x: 0, y: 0, width: 300, height: 600 },
      { width: 100, height: 200 }, 'PORTRAIT')).toEqual(expect.objectContaining({ x: 50, y: 100 }));
  });

  test('accounts for viewport offsets and rejects letterboxing', () => {
    const viewport = { x: 20, y: 30, width: 400, height: 300 };
    expect(mapScreenshotPointer({ x: 220, y: 180 }, viewport, { width: 100, height: 100 }, 'PORTRAIT'))
      .toEqual(expect.objectContaining({ x: 50, y: 50 }));
    expect(mapScreenshotPointer({ x: 30, y: 180 }, viewport, { width: 100, height: 100 }, 'PORTRAIT')).toBeNull();
  });

  test('normalizes a portrait source screenshot to landscape orientation', () => {
    const point = mapScreenshotPointer({ x: 150, y: 25 }, { x: 0, y: 0, width: 200, height: 100 },
      { width: 100, height: 200 }, 'LANDSCAPE');
    expect(point).toEqual(expect.objectContaining({ x: 25, y: 50 }));
  });

  test('resolves the smallest compatible element for overlapping bounds', () => {
    const parent = { elementType: 'Frame', attributes: {}, bounds: { x: 0, y: 0, width: 200, height: 200 }, locators: [], nodePath: [0] };
    const child = { elementType: 'Button', attributes: {}, bounds: { x: 40, y: 40, width: 80, height: 60 }, locators: [], nodePath: [0, 0] };
    expect(resolveElementAtPoint([parent, child], { x: 50, y: 50 })).toBe(child);
  });

  test('returns no match outside bounds and excludes unstable XPath fallbacks', () => {
    expect(resolveElementAtPoint([], { x: 1, y: 1 })).toBeNull();
    expect(stableLocators([
      { strategy: 'xpath', value: '//Button', score: .9, reasons: [] },
      { strategy: 'id', value: 'login', score: .49, reasons: [] },
    ])).toEqual([]);
  });
});
