import type { LocatorCandidate } from '../../automation/types';

export type MobileRecordingState = 'idle' | 'recording' | 'paused';
export type MobileCaptureResolution = 'resolved' | 'ambiguous' | 'coordinate-only';
export interface Point { x: number; y: number }
export interface Rectangle extends Point { width: number; height: number }
export interface PointerSample { start: Point; end: Point; startedAt: number; endedAt: number }
export interface AndroidTouchCalibration { rawWidth: number; rawHeight: number; rotation: 0 | 1 | 2 | 3 }
export interface MobileRecordingElement {
  elementType: string; label?: string; text?: string; attributes?: Record<string, string>;
  bounds?: Rectangle; nodePath?: number[]; locators: LocatorCandidate[];
}
export interface TranslationContext {
  elements: MobileRecordingElement[];
  viewportSize: { width: number; height: number };
  hierarchyCapturedAt?: number;
  platform?: 'android' | 'ios'; mode?: string; appId?: string; automationName?: string; contextName?: string;
  screen?: string; orientation?: string;
}
export interface RecordedMobileAction {
  id: string; schemaVersion: 1; type: 'launchApp' | 'tap' | 'doubleclick' | 'longPress' | 'swipe';
  selector: string; timestamp: number; value?: string; extra?: string;
  locatorFingerprint?: Record<string, unknown>;
  metadata: {
    mobileRecording: true; resolution: MobileCaptureResolution; confidence: number;
    streamStart: Point; streamEnd: Point; deviceStart: Point; deviceEnd: Point;
    durationMs: number; direction?: 'up' | 'down' | 'left' | 'right'; distanceRatio: number;
    startX?: number; startY?: number; endX?: number; endY?: number;
    hierarchyAgeMs?: number; warnings: string[];
  };
}

export function mapStreamPoint(point: Point, viewport: Rectangle, frame: { width: number; height: number }): Point | null {
  if (frame.width <= 0 || frame.height <= 0 || viewport.width <= 0 || viewport.height <= 0) return null;
  const scale = Math.min(viewport.width / frame.width, viewport.height / frame.height);
  const width = frame.width * scale; const height = frame.height * scale;
  const left = viewport.x + (viewport.width - width) / 2; const top = viewport.y + (viewport.height - height) / 2;
  if (point.x < left || point.y < top || point.x > left + width || point.y > top + height) return null;
  return { x: Math.round((point.x - left) / scale), y: Math.round((point.y - top) / scale) };
}

export function mapAndroidInputPoint(point: Point, calibration: AndroidTouchCalibration, display: { width: number; height: number }): Point {
  const rawX = Math.min(calibration.rawWidth - 1, Math.max(0, point.x));
  const rawY = Math.min(calibration.rawHeight - 1, Math.max(0, point.y));
  const normalizedX = rawX / Math.max(1, calibration.rawWidth - 1);
  const normalizedY = rawY / Math.max(1, calibration.rawHeight - 1);
  const rotated = calibration.rotation === 1 ? { x: normalizedY, y: 1 - normalizedX }
    : calibration.rotation === 2 ? { x: 1 - normalizedX, y: 1 - normalizedY }
      : calibration.rotation === 3 ? { x: 1 - normalizedY, y: normalizedX }
        : { x: normalizedX, y: normalizedY };
  return { x: Math.round(rotated.x * Math.max(0, display.width - 1)), y: Math.round(rotated.y * Math.max(0, display.height - 1)) };
}

export function classifyGesture(sample: PointerSample, viewport: { width: number; height: number }) {
  const durationMs = Math.max(0, sample.endedAt - sample.startedAt);
  const dx = sample.end.x - sample.start.x; const dy = sample.end.y - sample.start.y;
  const distanceRatio = Math.max(Math.abs(dx) / Math.max(1, viewport.width), Math.abs(dy) / Math.max(1, viewport.height));
  if (distanceRatio >= 0.035) {
    const direction = (Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up')) as 'up' | 'down' | 'left' | 'right';
    return { type: 'swipe' as const, durationMs, direction, distanceRatio };
  }
  return { type: durationMs >= 500 ? 'longPress' as const : 'tap' as const, durationMs, distanceRatio };
}

export function resolveElementAtPoint(elements: MobileRecordingElement[], point: Point) {
  const matches = elements.map((element, index) => ({ element, index })).filter(({ element }) => {
    const b = element.bounds;
    return b && b.width > 0 && b.height > 0 && element.attributes?.displayed !== 'false' && element.attributes?.visible !== 'false'
      && point.x >= b.x && point.y >= b.y && point.x <= b.x + b.width && point.y <= b.y + b.height;
  }).sort((a, b) => area(a.element.bounds!) - area(b.element.bounds!) || (b.element.nodePath?.length || 0) - (a.element.nodePath?.length || 0));
  if (!matches[0]) return null;
  return { ...matches[0], ambiguous: Boolean(matches[1] && area(matches[0].element.bounds!) === area(matches[1].element.bounds!)) };
}

export function translatePointerInteraction(sample: PointerSample, context: TranslationContext): RecordedMobileAction {
  const gesture = classifyGesture(sample, context.viewportSize);
  const targetPoint = gesture.type === 'swipe' || gesture.type === 'longPress' ? sample.start : sample.end;
  const hit = resolveElementAtPoint(context.elements, targetPoint);
  const candidates = hit?.element.locators || [];
  const ranked = [...candidates].sort((left, right) => locatorPriority(left.strategy) - locatorPriority(right.strategy) || right.score - left.score);
  const primary = ranked.find((locator) => locator.score >= 0.5 && locator.strategy.toLowerCase() !== 'xpath')
    || ranked.find((locator) => locator.score >= 0.5);
  const resolution: MobileCaptureResolution = hit?.ambiguous ? 'ambiguous' : primary ? 'resolved' : 'coordinate-only';
  const warnings = resolution === 'coordinate-only' ? ['No stable locator was resolved; replay will use coordinates.']
    : resolution === 'ambiguous' ? ['Multiple elements share these bounds; review the target.'] : [];
  const isStale = Boolean(context.hierarchyCapturedAt && sample.endedAt - context.hierarchyCapturedAt > 1500);
  if (isStale) warnings.push('Hierarchy snapshot is stale (>1.5s old); locator accuracy may be reduced.');
  return {
    id: `mobile_${sample.endedAt}_${sample.end.x}_${sample.end.y}`, schemaVersion: 1, type: gesture.type,
    selector: primary ? `${primary.strategy}=${primary.value}` : `coordinates=${targetPoint.x},${targetPoint.y}`,
    timestamp: sample.endedAt, value: gesture.type === 'swipe' ? `${sample.end.x},${sample.end.y}` : undefined,
    extra: gesture.type === 'longPress' ? String(gesture.durationMs) : gesture.direction,
    locatorFingerprint: hit ? {
      tagName: hit.element.elementType, attributes: { ...(hit.element.attributes || {}) }, text: hit.element.text,
      accessibleName: hit.element.label, boundingBox: hit.element.bounds, nodePath: hit.element.nodePath || [],
      locatorCandidates: ranked.map(({ strategy, value, score }) => ({ strategy, value, score })),
      mobileContext: { platform: context.platform || 'android', mode: context.mode || 'native', appId: context.appId || 'current-app',
        automationName: context.automationName || (context.platform === 'ios' ? 'XCUITest' : 'UiAutomator2'),
        contextName: context.contextName || 'NATIVE_APP', screen: context.screen, orientation: context.orientation },
    } : undefined,
    metadata: { mobileRecording: true, resolution, confidence: primary?.score || 0,
      streamStart: { ...sample.start }, streamEnd: { ...sample.end }, deviceStart: { ...sample.start }, deviceEnd: { ...sample.end },
      durationMs: gesture.durationMs, direction: gesture.direction, distanceRatio: Number(gesture.distanceRatio.toFixed(4)),
      startX: sample.start.x, startY: sample.start.y, endX: sample.end.x, endY: sample.end.y,
      hierarchyAgeMs: context.hierarchyCapturedAt ? Math.max(0, sample.endedAt - context.hierarchyCapturedAt) : undefined, warnings },
  };
}

export class MobileRecordingSession {
  private state: MobileRecordingState = 'idle'; private startedAt = 0; private actions: RecordedMobileAction[] = [];
  start(appId: string, now = Date.now()): RecordedMobileAction {
    if (this.state !== 'idle') throw new Error('Mobile recording is already active');
    if (!appId.trim() || appId === 'current-app') throw new Error('An explicit application ID is required before recording');
    this.state = 'recording'; this.startedAt = now; this.actions = [];
    const zero = { x: 0, y: 0 };
    const action: RecordedMobileAction = { id: `mobile_${now}_launch`, schemaVersion: 1, type: 'launchApp', selector: 'device', value: appId,
      timestamp: now, metadata: { mobileRecording: true, resolution: 'resolved', confidence: 1, streamStart: zero, streamEnd: zero,
        deviceStart: zero, deviceEnd: zero, durationMs: 0, distanceRatio: 0, warnings: [] } };
    this.actions.push(action); return action;
  }
  pause(): void { if (this.state === 'recording') this.state = 'paused'; }
  resume(): void { if (this.state === 'paused') this.state = 'recording'; }
  append(action: RecordedMobileAction): boolean {
    if (this.state !== 'recording') return false;
    const previous = this.actions.at(-1);
    if (previous?.type === action.type && previous.selector === action.selector && action.timestamp - previous.timestamp < 120) return false;
    this.actions.push(action); return true;
  }
  capture(sample: PointerSample, context: TranslationContext): { action: RecordedMobileAction; executeAction: RecordedMobileAction; replacedLast: boolean } | null {
    if (this.state !== 'recording') return null;
    const translated = translatePointerInteraction(sample, context);
    const previous = this.actions.at(-1);
    if (translated.type === 'tap' && previous?.type === 'tap' && previous.selector === translated.selector
      && translated.timestamp - previous.timestamp <= 300) {
      const action: RecordedMobileAction = { ...translated, type: 'doubleclick', id: `${translated.id}_double`,
        metadata: { ...translated.metadata, durationMs: translated.timestamp - previous.timestamp } };
      this.actions[this.actions.length - 1] = action;
      return { action, executeAction: translated, replacedLast: true };
    }
    return this.append(translated) ? { action: translated, executeAction: translated, replacedLast: false } : null;
  }
  stop(): RecordedMobileAction[] { this.state = 'idle'; return this.getActions(); }
  remove(id: string): boolean {
    const index = this.actions.findIndex((action) => action.id === id);
    if (index <= 0) return false;
    this.actions.splice(index, 1); return true;
  }
  duplicate(id: string, now = Date.now()): RecordedMobileAction | null {
    const index = this.actions.findIndex((action) => action.id === id);
    if (index <= 0) return null;
    const copy = { ...this.actions[index], id: `mobile_${now}_copy`, timestamp: now,
      metadata: { ...this.actions[index].metadata, warnings: [...this.actions[index].metadata.warnings] } };
    this.actions.splice(index + 1, 0, copy); return copy;
  }
  move(id: string, toIndex: number): boolean {
    const fromIndex = this.actions.findIndex((action) => action.id === id);
    const target = Math.max(1, Math.min(this.actions.length - 1, Math.trunc(toIndex)));
    if (fromIndex <= 0 || fromIndex === target) return false;
    const [action] = this.actions.splice(fromIndex, 1); this.actions.splice(target, 0, action); return true;
  }
  getState(): MobileRecordingState { return this.state; }
  getElapsedMs(now = Date.now()): number { return this.startedAt ? Math.max(0, now - this.startedAt) : 0; }
  getActions(): RecordedMobileAction[] { return this.actions.map((action) => ({ ...action, metadata: { ...action.metadata, warnings: [...action.metadata.warnings] } })); }
}

const area = (bounds: Rectangle) => bounds.width * bounds.height;

const locatorPriority = (strategy: string): number => {
  const normalized = strategy.toLowerCase().replace(/[\s_-]/g, '');
  if (normalized.includes('accessibility')) return 0;
  if (normalized === 'id' || normalized.includes('resourceid') || normalized === 'name') return 1;
  if (normalized.includes('class') || normalized.includes('text')) return 2;
  if (normalized.includes('xpath')) return 3;
  return 4;
};
