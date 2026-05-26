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
});
