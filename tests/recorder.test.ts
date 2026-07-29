import { Recorder, RecordedAction } from '../src/recorder/Recorder';

describe('Recorder', () => {
  let recorder: Recorder;

  beforeEach(() => {
    recorder = new Recorder();
  });

  test('should initialize correctly', () => {
    expect(recorder).toBeDefined();
    expect(recorder.isActive()).toBe(false);
  });

  test('should start and stop recording', () => {
    recorder.startRecording('manual');
    expect(recorder.isActive()).toBe(true);

    recorder.stopRecording();
    expect(recorder.isActive()).toBe(false);
  });

  test('should record actions', () => {
    recorder.startRecording();
    
    const action: RecordedAction = {
      type: 'click',
      selector: '#submit-button',
      timestamp: Date.now(),
    };
    
    recorder.recordAction(action);
    const actions = recorder.getActions();
    
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('click');
  });

  test('should export script', async () => {
    recorder.startRecording();
    
    const action: RecordedAction = {
      type: 'input',
      selector: '#username',
      value: 'testuser',
      timestamp: Date.now(),
    };
    
    recorder.recordAction(action);
    const script = await recorder.exportScript('selenium-python');
    
    expect(script).toBeDefined();
    expect(typeof script).toBe('string');
  });

  test('should export playwright assertions and page load waits', async () => {
    recorder.startRecording();

    recorder.recordAction({
      type: 'waitForPageLoad',
      selector: 'window',
      timestamp: Date.now(),
    });

    recorder.recordAction({
      type: 'assert',
      selector: '.success-message',
      timestamp: Date.now(),
      metadata: {
        kind: 'text-contains',
        expected: 'Success',
      },
    });

    const script = await recorder.exportScript('playwright');

    expect(script).toContain("waitForLoadState('domcontentloaded')");
    expect(script).toContain("Assertion failed: expected text to contain Success");
    expect(script).toContain("page.locator('.success-message')");
  });

  test('should clear actions', () => {
    recorder.startRecording();
    recorder.recordAction({
      type: 'click',
      selector: '#button',
      timestamp: Date.now(),
    });
    
    recorder.clearActions();
    expect(recorder.getActions()).toHaveLength(0);
  });

  test('rejects malformed imported actions', () => {
    expect(() => recorder.setActions([
      { type: 'click', selector: '#valid', timestamp: -1 },
    ])).toThrow('timestamp must be a non-negative number');
  });

  test('updates the stored final input action across bridge-style clones', () => {
    recorder.startRecording();
    recorder.recordAction({
      type: 'input',
      selector: '#name',
      value: 'a',
      timestamp: 100,
    });

    const clonedAction = { ...recorder.getActions()[0], value: 'complete text', timestamp: 200 };
    expect(recorder.updateLastAction(clonedAction)).toBe(true);

    expect(recorder.getActions()).toHaveLength(1);
    expect(recorder.getActions()[0].value).toBe('complete text');
    expect(recorder.getActions()[0].timestamp).toBe(200);
  });

  test('does not update a missing final action', () => {
    expect(recorder.updateLastAction({
      type: 'input',
      selector: '#name',
      value: 'text',
      timestamp: 100,
    })).toBe(false);
  });
});
