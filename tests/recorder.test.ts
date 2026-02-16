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
