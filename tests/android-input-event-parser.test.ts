import { AndroidInputEventParser } from '../src/mobile/recording/AndroidInputEventParser';

describe('Android input event parser', () => {
  it('uses device timestamps and completes a BTN_TOUCH gesture once', () => {
    const parser = new AndroidInputEventParser();
    const parsed = parser.push(`[ 10.000] /dev/input/event3: EV_KEY BTN_TOUCH DOWN\n[ 10.000] /dev/input/event3: EV_ABS ABS_MT_TRACKING_ID 00000001\n[ 10.010] /dev/input/event3: EV_ABS ABS_MT_POSITION_X 00000168\n[ 10.010] /dev/input/event3: EV_ABS ABS_MT_POSITION_Y 00000320\n[ 10.700] /dev/input/event3: EV_ABS ABS_MT_TRACKING_ID ffffffff\n[ 10.700] /dev/input/event3: EV_KEY BTN_TOUCH UP\n`, 20_000);
    expect(parsed.touches).toHaveLength(1);
    expect(parsed.touches[0]).toMatchObject({ start: { x: 360, y: 800 }, end: { x: 360, y: 800 } });
    expect(parsed.touches[0].endedAt - parsed.touches[0].startedAt).toBe(700);
  });

  it('tracks independent multi-touch slots and hardware keys', () => {
    const parser = new AndroidInputEventParser();
    const parsed = parser.push(`[ 20.000] x: EV_ABS ABS_MT_SLOT 00000001\n[ 20.000] x: EV_ABS ABS_MT_TRACKING_ID 00000002\n[ 20.010] x: EV_ABS ABS_MT_POSITION_X 00000064\n[ 20.010] x: EV_ABS ABS_MT_POSITION_Y 000000c8\n[ 20.100] x: EV_ABS ABS_MT_TRACKING_ID ffffffff\n[ 20.200] x: EV_KEY KEY_BACK DOWN\n`, 30_000);
    expect(parsed.touches[0]).toMatchObject({ start: { x: 100, y: 200 } });
    expect(parsed.keys).toEqual([{ key: 'BACK', timestamp: 30200 }]);
  });
});
