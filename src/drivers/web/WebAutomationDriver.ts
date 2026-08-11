import type {
  AutomationDriver,
  CapabilityDescriptor,
  DriverCapabilities,
} from '../../automation/types';
import { ScriptExecutor } from '../../executor/ScriptExecutor';
import type { ExecutionOptions, ExecutionResult, ExecutionStateSnapshot } from '../../executor/types';
import type { RecordedAction } from '../../recorder/Recorder';

const WEB_ACTIONS = [
  'click', 'input', 'select', 'drag', 'upload', 'navigate', 'assert', 'wait',
  'hover', 'keyboard', 'keypress', 'scroll', 'doubleclick', 'rightclick',
  'checkbox', 'radio', 'focus', 'submit', 'waitForPageLoad', 'scrape', 'visual',
  'api', 'mockNetwork', 'accessibility', 'performance', 'plugin',
];

export class WebAutomationDriver implements AutomationDriver {
  readonly id = 'web-playwright';

  constructor(private readonly executor: ScriptExecutor = new ScriptExecutor()) {}

  getCapabilities(): DriverCapabilities {
    return {
      platform: 'web',
      modes: ['web', 'mobileWeb'],
      actions: [...WEB_ACTIONS],
      features: {
        inspection: true,
        recording: true,
        healing: true,
        contexts: false,
        deviceLogs: false,
      },
    };
  }

  getCapabilityDescriptors(): CapabilityDescriptor[] {
    return [
      { name: 'headless', type: 'boolean', defaultValue: true },
      { name: 'channel', type: 'string', defaultValue: 'chrome' },
      { name: 'executablePath', type: 'string' },
      { name: 'baseUrl', type: 'string' },
    ];
  }

  execute(actions: RecordedAction[], options?: ExecutionOptions): Promise<ExecutionResult> {
    return this.executor.execute(actions, options);
  }

  cancel(reason?: string): boolean { return this.executor.cancel(reason); }
  pause(): boolean { return this.executor.pause(); }
  resume(): boolean { return this.executor.resume(); }
  step(): boolean { return this.executor.step(); }
  getState(): ExecutionStateSnapshot { return this.executor.getState(); }
  close(): Promise<void> { return this.executor.close(); }
}

