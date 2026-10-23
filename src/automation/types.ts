import type { ExecutionOptions, ExecutionResult, ExecutionStateSnapshot } from '../executor/types';
import type { RecordedAction } from '../recorder/Recorder';

export type AutomationPlatform = 'web' | 'android' | 'ios';
export type ApplicationMode = 'web' | 'native' | 'hybrid' | 'mobileWeb';

export interface AutomationTarget {
  platform: AutomationPlatform;
  mode: ApplicationMode;
  name?: string;
  appId?: string;
  appActivity?: string;
  deviceProfile?: string;
  deviceUdid?: string;
  automationName?: string;
  serverUrl?: string;
}

export interface CapabilityDescriptor {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object';
  required?: boolean;
  secret?: boolean;
  defaultValue?: unknown;
  description?: string;
}

export interface DriverCapabilities {
  platform: AutomationPlatform;
  modes: ApplicationMode[];
  actions: string[];
  features: {
    inspection: boolean;
    recording: boolean;
    healing: boolean;
    contexts: boolean;
    deviceLogs: boolean;
  };
}

export interface AutomationSessionInfo {
  id: string;
  target: AutomationTarget;
  startedAt: number;
  capabilities: Record<string, unknown>;
  contexts: string[];
  currentContext?: string;
}

export interface LocatorCandidate {
  strategy: string;
  value: string;
  score: number;
  contextPath?: string[];
  reasons?: string[];
}

export interface InspectedElement {
  elementType: string;
  label?: string;
  text?: string;
  value?: string;
  attributes: Record<string, string>;
  bounds?: { x: number; y: number; width: number; height: number };
  locators: LocatorCandidate[];
}

export interface AutomationDriver {
  readonly id: string;
  getCapabilities(): DriverCapabilities;
  getCapabilityDescriptors(): CapabilityDescriptor[];
  execute(actions: RecordedAction[], options?: ExecutionOptions): Promise<ExecutionResult>;
  cancel(reason?: string): boolean;
  pause(): boolean;
  resume(): boolean;
  step(): boolean;
  getState(): ExecutionStateSnapshot;
  close(): Promise<void>;
}

export const DEFAULT_WEB_TARGET: AutomationTarget = Object.freeze({
  platform: 'web',
  mode: 'web',
});
