import type { RecordedAction } from '../../recorder/Recorder';

export const ANDROID_ACTION_MATRIX = Object.freeze({
  tap: 'supported', click: 'supported', input: 'supported', clear: 'supported', assert: 'supported', wait: 'supported',
  back: 'supported', longPress: 'supported', swipe: 'supported', scroll: 'supported', rotate: 'supported',
  hideKeyboard: 'supported', switchContext: 'supported', launchApp: 'supported', terminateApp: 'supported',
  resetApp: 'supported', deepLink: 'supported', acceptAlert: 'supported', dismissAlert: 'supported',
  grantPermission: 'supported', revokePermission: 'supported',
  upload: 'supported',
  installApp: 'supported',
  clearAppData: 'supported', mobileKey: 'supported',
} as const);

export interface MobileProfile {
  id: string;
  name: string;
  platform: 'android';
  mode: 'native' | 'hybrid' | 'mobileWeb';
  serverUrl: string;
  deviceName: string;
  udid?: string;
  appId?: string;
  appActivity?: string;
  capabilities?: Record<string, unknown>;
}

export interface DoctorCheck {
  id: 'appium' | 'uiautomator2' | 'adb' | 'java' | 'device' | 'scrcpy';
  label: string;
  status: 'passed' | 'failed' | 'warning';
  detail: string;
  remedy?: string;
}

export function validateMobileProfile(value: unknown): MobileProfile {
  if (!value || typeof value !== 'object') throw new Error('Mobile profile must be an object');
  const profile = value as Partial<MobileProfile>;
  if (!profile.id || !/^[a-z0-9][a-z0-9_-]{1,63}$/i.test(profile.id)) throw new Error('Profile ID must contain 2-64 letters, numbers, dashes, or underscores');
  if (!profile.name?.trim()) throw new Error('Profile name is required');
  if (profile.platform !== 'android') throw new Error('Only Android profiles are supported');
  if (!['native', 'hybrid', 'mobileWeb'].includes(String(profile.mode))) throw new Error('Profile mode is invalid');
  const url = new URL(String(profile.serverUrl));
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) throw new Error('Appium server must be local HTTP');
  if (!profile.deviceName?.trim()) throw new Error('Device name is required');
  if (profile.capabilities && (Array.isArray(profile.capabilities) || typeof profile.capabilities !== 'object')) throw new Error('Advanced capabilities must be an object');
  const secretCapability = Object.keys(profile.capabilities ?? {}).find((name) => /(password|token|secret|api.?key|access.?key)/i.test(name));
  if (secretCapability) throw new Error(`Secret capability ${secretCapability} must use the encrypted environment vault and cannot be saved in a profile`);
  return JSON.parse(JSON.stringify({ ...profile, name: profile.name.trim(), deviceName: profile.deviceName.trim(), serverUrl: url.toString().replace(/\/$/, '') }));
}

export function preflightAndroidActions(actions: RecordedAction[]): { supported: boolean; unsupported: string[]; warnings: string[] } {
  const unsupported = [...new Set(actions.map(({ type }) => type).filter((type) => !(type in ANDROID_ACTION_MATRIX)))];
  const warnings = actions.flatMap((action, index) => {
    if (/^coordinates=/.test(action.selector)) return [`Step ${index + 1} uses coordinate fallback and may move across devices`];
    if (/^xpath=/.test(action.selector)) return [`Step ${index + 1} uses a brittle XPath locator`];
    if (action.type === 'clearAppData' && (action.metadata as Record<string, unknown> | undefined)?.confirmed !== true) return [`Step ${index + 1} requires explicit confirmation before clearing app data`];
    return [];
  });
  return { supported: unsupported.length === 0, unsupported, warnings };
}
