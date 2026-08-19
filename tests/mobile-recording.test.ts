import {
  MobileRecordingSession,
  classifyGesture,
  mapStreamPoint,
  mapAndroidInputPoint,
  resolveElementAtPoint,
  translatePointerInteraction,
} from '../src/mobile/recording/MobileInteractionRecorder';
import { validateRecordedAction } from '../src/recording/RecordingSchema';

const elements = [
  { elementType: 'android.widget.FrameLayout', bounds: { x: 0, y: 0, width: 1080, height: 1920 }, nodePath: [0], locators: [] },
  { elementType: 'android.widget.Button', label: 'Continue', text: 'Continue', bounds: { x: 200, y: 700, width: 680, height: 140 }, nodePath: [0, 3],
    attributes: { 'resource-id': 'org.example:id/continue', clickable: 'true' },
    locators: [{ strategy: 'accessibility id', value: 'Continue', score: .98, reasons: ['stable'] }, { strategy: 'xpath', value: '//button', score: .35, reasons: ['fallback'] }] },
];

describe('mobile interaction recording', () => {
  it('maps letterboxed stream coordinates into device pixels', () => {
    expect(mapStreamPoint({ x: 270, y: 480 }, { x: 0, y: 0, width: 540, height: 960 }, { width: 1080, height: 1920 })).toEqual({ x: 540, y: 960 });
    expect(mapStreamPoint({ x: 10, y: 10 }, { x: 0, y: 0, width: 800, height: 400 }, { width: 1080, height: 1920 })).toBeNull();
  });

  it('calibrates raw Android input coordinates for every display rotation', () => {
    expect(mapAndroidInputPoint({ x: 360, y: 806 }, { rawWidth: 720, rawHeight: 1612, rotation: 0 }, { width: 720, height: 1612 })).toEqual({ x: 360, y: 806 });
    expect(mapAndroidInputPoint({ x: 360, y: 806 }, { rawWidth: 720, rawHeight: 1612, rotation: 1 }, { width: 1612, height: 720 })).toEqual({ x: 806, y: 359 });
    expect(mapAndroidInputPoint({ x: 360, y: 806 }, { rawWidth: 720, rawHeight: 1612, rotation: 2 }, { width: 720, height: 1612 })).toEqual({ x: 359, y: 805 });
    expect(mapAndroidInputPoint({ x: 360, y: 806 }, { rawWidth: 720, rawHeight: 1612, rotation: 3 }, { width: 1612, height: 720 })).toEqual({ x: 805, y: 360 });
  });

  it('classifies tap, long press, and swipe using normalized distance', () => {
    expect(classifyGesture({ start: { x: 5, y: 5 }, end: { x: 7, y: 6 }, startedAt: 0, endedAt: 80 }, { width: 1080, height: 1920 }).type).toBe('tap');
    expect(classifyGesture({ start: { x: 5, y: 5 }, end: { x: 5, y: 5 }, startedAt: 0, endedAt: 700 }, { width: 1080, height: 1920 }).type).toBe('longPress');
    expect(classifyGesture({ start: { x: 500, y: 1200 }, end: { x: 500, y: 300 }, startedAt: 0, endedAt: 400 }, { width: 1080, height: 1920 })).toMatchObject({ type: 'swipe', direction: 'up' });
    expect(classifyGesture({ start: { x: 10, y: 10 }, end: { x: 55, y: 10 }, startedAt: 0, endedAt: 120 }, { width: 1000, height: 2000 })).toMatchObject({ type: 'swipe', direction: 'right' });
  });

  it('resolves the deepest smallest visible element and emits healing metadata', () => {
    expect(resolveElementAtPoint(elements, { x: 400, y: 760 })?.index).toBe(1);
    const action = translatePointerInteraction({ start: { x: 400, y: 760 }, end: { x: 400, y: 760 }, startedAt: 100, endedAt: 180 },
      { elements, viewportSize: { width: 1080, height: 1920 }, hierarchyCapturedAt: 120, appId: 'org.example', screen: 'MainActivity' });
    expect(action).toMatchObject({ type: 'tap', selector: 'accessibility id=Continue', schemaVersion: 1 });
    expect(action.metadata).toMatchObject({ resolution: 'resolved', confidence: .98, hierarchyAgeMs: 60 });
    expect(action.locatorFingerprint).toMatchObject({ accessibleName: 'Continue', mobileContext: {
      appId: 'org.example', automationName: 'UiAutomator2', contextName: 'NATIVE_APP',
    } });
    expect(() => validateRecordedAction(action)).not.toThrow();
  });

  it('falls back explicitly to coordinates and deduplicates rapid duplicate input', () => {
    const action = translatePointerInteraction({ start: { x: 40, y: 50 }, end: { x: 40, y: 50 }, startedAt: 1, endedAt: 20 },
      { elements: [], viewportSize: { width: 1080, height: 1920 } });
    expect(action.metadata.resolution).toBe('coordinate-only');
    expect(action.metadata.warnings).toHaveLength(1);
    const session = new MobileRecordingSession();
    expect(session.start('org.example', 1).type).toBe('launchApp');
    expect(session.append(action)).toBe(true);
    expect(session.append({ ...action, timestamp: 80 })).toBe(false);
    session.pause(); expect(session.append({ ...action, timestamp: 500 })).toBe(false);
    session.resume(); expect(session.append({ ...action, timestamp: 500 })).toBe(true);
    expect(session.stop()).toHaveLength(3);
  });

  it('resolves swipe and long-press targets from the gesture start point', () => {
    const swipe = translatePointerInteraction({ start: { x: 400, y: 760 }, end: { x: 400, y: 200 }, startedAt: 100, endedAt: 450 },
      { elements, viewportSize: { width: 1080, height: 1920 } });
    expect(swipe).toMatchObject({ type: 'swipe', selector: 'accessibility id=Continue' });

    const longPress = translatePointerInteraction({ start: { x: 400, y: 760 }, end: { x: 405, y: 762 }, startedAt: 100, endedAt: 800 },
      { elements, viewportSize: { width: 1080, height: 1920 } });
    expect(longPress).toMatchObject({ type: 'longPress', selector: 'accessibility id=Continue' });
  });

  it('uses a scored XPath when no stable native locator exists', () => {
    const xpathOnly = [{ ...elements[1], locators: [{ strategy: 'xpath', value: '//android.widget.Button[@text="Continue"]', score: .72, reasons: ['fallback'] }] }];
    const action = translatePointerInteraction({ start: { x: 400, y: 760 }, end: { x: 400, y: 760 }, startedAt: 100, endedAt: 150 },
      { elements: xpathOnly, viewportSize: { width: 1080, height: 1920 } });
    expect(action).toMatchObject({ selector: 'xpath=//android.widget.Button[@text="Continue"]', metadata: { resolution: 'resolved', confidence: .72 } });
  });

  it('uses accessibility and resource identifiers before class or XPath candidates', () => {
    const unordered = [{ ...elements[1], locators: [
      { strategy: 'xpath', value: '//button', score: .99, reasons: ['fallback'] },
      { strategy: 'id', value: 'org.example:id/continue', score: .8, reasons: ['native id'] },
      { strategy: 'accessibility id', value: 'Continue', score: .7, reasons: ['a11y'] },
    ] }];
    const action = translatePointerInteraction({ start: { x: 400, y: 760 }, end: { x: 400, y: 760 }, startedAt: 1, endedAt: 50 },
      { elements: unordered, viewportSize: { width: 1080, height: 1920 } });
    expect(action.selector).toBe('accessibility id=Continue');
    expect((action.locatorFingerprint as any).locatorCandidates.map((candidate: any) => candidate.strategy)).toEqual(['accessibility id', 'id', 'xpath']);
  });

  it('requires an explicit app target and keeps launch fixed while editing the session', () => {
    const session = new MobileRecordingSession();
    expect(() => session.start('')).toThrow('explicit application ID');
    const launch = session.start('org.example', 1);
    const action = translatePointerInteraction({ start: { x: 400, y: 760 }, end: { x: 400, y: 760 }, startedAt: 10, endedAt: 50 },
      { elements, viewportSize: { width: 1080, height: 1920 } });
    session.append(action);
    const copy = session.duplicate(action.id, 100);
    expect(copy?.id).not.toBe(action.id);
    expect(session.move(copy!.id, 1)).toBe(true);
    expect(session.remove(launch.id)).toBe(false);
    expect(session.getActions().map(({ id }) => id)).toEqual([launch.id, copy!.id, action.id]);
  });

  it('warns when locator resolution uses a hierarchy older than 1.5 seconds', () => {
    const action = translatePointerInteraction({ start: { x: 400, y: 760 }, end: { x: 400, y: 760 }, startedAt: 2500, endedAt: 3001 },
      { elements, viewportSize: { width: 1080, height: 1920 }, hierarchyCapturedAt: 1000 });
    expect(action.metadata.hierarchyAgeMs).toBe(2001);
    expect(action.metadata.warnings).toContain('Hierarchy snapshot is stale (>1.5s old); locator accuracy may be reduced.');
  });

  it('coalesces two nearby taps into one replayable double tap', () => {
    const session = new MobileRecordingSession(); session.start('org.example', 1);
    const context = { elements, viewportSize: { width: 1080, height: 1920 } };
    const first = session.capture({ start: { x: 400, y: 760 }, end: { x: 400, y: 760 }, startedAt: 100, endedAt: 150 }, context);
    const second = session.capture({ start: { x: 400, y: 760 }, end: { x: 400, y: 760 }, startedAt: 260, endedAt: 300 }, context);
    expect(first).toMatchObject({ action: { type: 'tap' }, replacedLast: false });
    expect(second).toMatchObject({ action: { type: 'doubleclick' }, executeAction: { type: 'tap' }, replacedLast: true });
    expect(session.getActions().map((action) => action.type)).toEqual(['launchApp', 'doubleclick']);
  });
});
