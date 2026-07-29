import {
  RECORDING_SCHEMA_VERSION,
  RecordingValidationError,
  createRecordingDocument,
  parseRecordingDocument,
  validateRecordedActions,
} from '../src/recording/RecordingSchema';

describe('RecordingSchema', () => {
  const action = {
    type: 'click' as const,
    selector: '#save',
    timestamp: 100,
    locatorFingerprint: {
      tagName: 'button',
      attributes: { id: 'save' },
      text: 'Save',
    },
  };

  test('creates a versioned recording document', () => {
    const recording = createRecordingDocument('  Smoke test  ', [action], 500);

    expect(recording.schemaVersion).toBe(RECORDING_SCHEMA_VERSION);
    expect(recording.name).toBe('Smoke test');
    expect(recording.actionCount).toBe(1);
    expect(recording.createdAt).toBe(500);
  });

  test('migrates a legacy recording without a schema version', () => {
    const migrated = parseRecordingDocument({
      name: 'Legacy',
      timestamp: 1234,
      actionCount: 99,
      actions: [action],
    });

    expect(migrated.schemaVersion).toBe(RECORDING_SCHEMA_VERSION);
    expect(migrated.createdAt).toBe(1234);
    expect(migrated.actionCount).toBe(1);
  });

  test('rejects unknown future schema versions', () => {
    expect(() =>
      parseRecordingDocument({
        schemaVersion: 99,
        name: 'Future',
        actions: [],
        createdAt: 1,
        updatedAt: 1,
      })
    ).toThrow('schemaVersion 99 is not supported');
  });

  test('reports the exact path of malformed actions', () => {
    try {
      validateRecordedActions([
        action,
        { type: 'click', selector: 42, timestamp: -1 },
      ]);
      throw new Error('Expected validation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(RecordingValidationError);
      expect((error as RecordingValidationError).issues).toEqual(
        expect.arrayContaining([
          'actions[1].selector must be a string',
          'actions[1].timestamp must be a non-negative number',
        ])
      );
    }
  });

  test('rejects malformed fingerprints', () => {
    expect(() =>
      validateRecordedActions([{
        ...action,
        locatorFingerprint: { tagName: '', attributes: { id: 12 } },
      }])
    ).toThrow('locatorFingerprint');
  });

  test('validates multi-file upload metadata', () => {
    expect(() => validateRecordedActions([{
      type: 'upload',
      selector: '#files',
      value: 'first.txt',
      metadata: { files: ['first.txt', 'second.txt'] },
      timestamp: 100,
    }])).not.toThrow();

    expect(() => validateRecordedActions([{
      type: 'upload',
      selector: '#files',
      metadata: { files: [] },
      timestamp: 100,
    }])).toThrow('metadata.files must be a non-empty string array');
  });
});
