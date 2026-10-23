import type { PointerSample } from './MobileInteractionRecorder';

export interface ParsedAndroidInput {
  touches: PointerSample[];
  keys: Array<{ key: string; timestamp: number }>;
}

interface ActiveTouch { startX?: number; startY?: number; x?: number; y?: number; startedAt: number }

/** Stateful parser for Android `getevent -lt` output, including multi-touch slots. */
export class AndroidInputEventParser {
  private buffer = '';
  private slot = 0;
  private readonly touches = new Map<number, ActiveTouch>();
  private deviceClockOffset?: number;

  push(chunk: string, receivedAt = Date.now()): ParsedAndroidInput {
    this.buffer += chunk;
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() || '';
    const output: ParsedAndroidInput = { touches: [], keys: [] };
    for (const line of lines) this.parseLine(line, receivedAt, output);
    return output;
  }

  private parseLine(line: string, receivedAt: number, output: ParsedAndroidInput): void {
    const deviceSeconds = Number(line.match(/^\[\s*([\d.]+)\]/)?.[1]);
    if (Number.isFinite(deviceSeconds) && this.deviceClockOffset === undefined) this.deviceClockOffset = receivedAt - deviceSeconds * 1000;
    const timestamp = Number.isFinite(deviceSeconds) ? Math.round(deviceSeconds * 1000 + (this.deviceClockOffset || 0)) : receivedAt;
    const key = line.match(/EV_KEY\s+(KEY_BACK|KEY_HOME|KEY_ENTER|KEY_SEARCH|KEY_APPSELECT)\s+DOWN/i);
    if (key) output.keys.push({ key: key[1].replace('KEY_', ''), timestamp });
    const event = line.match(/EV_(?:ABS|KEY)\s+(ABS_MT_SLOT|ABS_MT_POSITION_X|ABS_MT_POSITION_Y|ABS_X|ABS_Y|ABS_MT_TRACKING_ID|BTN_TOUCH)\s+([0-9a-f]+|DOWN|UP)/i);
    if (!event) return;
    const [code, raw] = [event[1].toUpperCase(), event[2].toLowerCase()];
    if (code === 'ABS_MT_SLOT') { this.slot = parseInt(raw, 16); return; }
    if (code === 'BTN_TOUCH' && raw === 'down') { if (!this.touches.has(this.slot)) this.touches.set(this.slot, { startedAt: timestamp }); return; }
    if (code === 'BTN_TOUCH' && raw === 'up') { this.finish(this.slot, timestamp, output); return; }
    if (code === 'ABS_MT_TRACKING_ID') {
      if (raw === 'ffffffff') this.finish(this.slot, timestamp, output);
      else this.touches.set(this.slot, { startedAt: timestamp });
      return;
    }
    const active = this.touches.get(this.slot);
    if (!active) return;
    const value = parseInt(raw, 16);
    if (code.endsWith('POSITION_X') || code === 'ABS_X') { active.x = value; active.startX ??= value; }
    if (code.endsWith('POSITION_Y') || code === 'ABS_Y') { active.y = value; active.startY ??= value; }
  }

  private finish(slot: number, endedAt: number, output: ParsedAndroidInput): void {
    const active = this.touches.get(slot);
    if (!active) return;
    this.touches.delete(slot);
    if ([active.startX, active.startY, active.x, active.y].some((value) => value === undefined)) return;
    output.touches.push({ start: { x: active.startX!, y: active.startY! }, end: { x: active.x!, y: active.y! }, startedAt: active.startedAt, endedAt });
  }
}
