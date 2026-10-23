import type { InspectedElement, LocatorCandidate } from '../../automation/types';

export interface Point { x: number; y: number }
export interface Size { width: number; height: number }
export interface Rect extends Point, Size {}
export type MobileOrientation = 'PORTRAIT' | 'LANDSCAPE';

export interface ScreenshotPoint extends Point {
  displayRect: Rect;
  originalSize: Size;
}

export interface AuthoringElement extends InspectedElement {
  nodePath?: number[];
}

/** Maps a client pointer through object-fit: contain to the source PNG pixels. */
export function mapScreenshotPointer(
  pointer: Point,
  viewport: Rect,
  original: Size,
  orientation: MobileOrientation
): ScreenshotPoint | null {
  if (![viewport.width, viewport.height, original.width, original.height].every((value) => value > 0)) return null;

  // Appium occasionally returns a PNG whose axes predate the latest rotation. In
  // that case the displayed authoring surface follows the reported orientation.
  const shouldRotate = orientation === 'LANDSCAPE'
    ? original.height > original.width
    : original.width > original.height;
  const displayed = shouldRotate
    ? { width: original.height, height: original.width }
    : original;
  const scale = Math.min(viewport.width / displayed.width, viewport.height / displayed.height);
  const displayRect = {
    x: viewport.x + (viewport.width - displayed.width * scale) / 2,
    y: viewport.y + (viewport.height - displayed.height * scale) / 2,
    width: displayed.width * scale,
    height: displayed.height * scale,
  };
  if (pointer.x < displayRect.x || pointer.y < displayRect.y
    || pointer.x > displayRect.x + displayRect.width || pointer.y > displayRect.y + displayRect.height) return null;

  const displayedX = (pointer.x - displayRect.x) / scale;
  const displayedY = (pointer.y - displayRect.y) / scale;
  const source = shouldRotate
    ? { x: displayedY, y: original.height - displayedX }
    : { x: displayedX, y: displayedY };
  return {
    x: clamp(source.x, 0, original.width - 1),
    y: clamp(source.y, 0, original.height - 1),
    displayRect,
    originalSize: original,
  };
}

/** Selects the deepest/smallest visible element under a screenshot pixel. */
export function resolveElementAtPoint(elements: AuthoringElement[], point: Point): AuthoringElement | null {
  return elements
    .filter((element) => {
      const bounds = element.bounds;
      if (!bounds || bounds.width <= 0 || bounds.height <= 0) return false;
      if (element.attributes?.displayed === 'false' || element.attributes?.visible === 'false') return false;
      return point.x >= bounds.x && point.y >= bounds.y
        && point.x <= bounds.x + bounds.width && point.y <= bounds.y + bounds.height;
    })
    .sort((left, right) => {
      const area = (left.bounds!.width * left.bounds!.height) - (right.bounds!.width * right.bounds!.height);
      return area || (right.nodePath?.length ?? 0) - (left.nodePath?.length ?? 0);
    })[0] ?? null;
}

export function stableLocators(locators: LocatorCandidate[]): LocatorCandidate[] {
  return locators.filter((locator) => locator.score >= 0.5 && locator.strategy.toLowerCase() !== 'xpath');
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
