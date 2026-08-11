import { MobileHierarchyParser } from '../src/mobile/inspector/MobileHierarchy';
import {
  MobileAutomationContext,
  MobileHealingEngine,
} from '../src/mobile/healing/MobileHealingEngine';

const context: MobileAutomationContext = {
  platform: 'android', mode: 'native', appId: 'org.example',
  automationName: 'UiAutomator2', contextName: 'NATIVE_APP', screen: 'LoginActivity',
};
const originalSource = `<hierarchy><android.widget.FrameLayout class="android.widget.FrameLayout">
  <android.widget.Button class="android.widget.Button" resource-id="org.example:id/login-old"
    content-desc="Log in" text="Sign in" enabled="true" displayed="true" bounds="[20,200][300,280]" />
</android.widget.FrameLayout></hierarchy>`;
const changedSource = `<hierarchy><android.widget.FrameLayout class="android.widget.FrameLayout">
  <android.widget.Button class="android.widget.Button" resource-id="org.example:id/login-new"
    content-desc="Log in" text="Sign in" enabled="true" displayed="true" bounds="[22,202][302,282]" />
  <android.widget.Button class="android.widget.Button" resource-id="org.example:id/help"
    content-desc="Help" text="Need help" bounds="[20,500][300,580]" />
</android.widget.FrameLayout></hierarchy>`;

describe('MobileHealingEngine', () => {
  function originalFingerprint(engine: MobileHealingEngine) {
    const hierarchy = new MobileHierarchyParser().parse(originalSource);
    return engine.captureFingerprint(hierarchy.roots[0].children[0].children[0], hierarchy, context);
  }

  test('captures platform, app, context, hierarchy, state, and ranked locators', () => {
    const engine = new MobileHealingEngine();
    const fingerprint = originalFingerprint(engine);

    expect(fingerprint.mobileContext).toEqual(context);
    expect(fingerprint.domPath).toEqual(['hierarchy', 'android.widget.FrameLayout', 'android.widget.Button']);
    expect(fingerprint.enabled).toBe(true);
    expect(fingerprint.locatorCandidates[0]).toEqual(expect.objectContaining({
      strategy: 'accessibility id', value: 'Log in',
    }));
  });

  test('proposes a unique high-confidence match but asks before applying by default', () => {
    const engine = new MobileHealingEngine();
    const result = engine.heal(
      'id=org.example:id/login-old', originalFingerprint(engine), changedSource, context, 'tap'
    );

    expect(result).toEqual(expect.objectContaining({
      healedSelector: 'accessibility id=Log in', strategy: 'mobile-context-fingerprint',
      policy: 'ask', approved: false, applied: false,
    }));
    expect(result!.confidence).toBeGreaterThanOrEqual(0.82);
  });

  test('rejects candidates from a different app or native/webview context', () => {
    const engine = new MobileHealingEngine();
    const fingerprint = originalFingerprint(engine);
    expect(engine.heal('old', fingerprint, changedSource, { ...context, appId: 'other.app' }, 'tap')).toBeNull();
    expect(engine.heal('old', fingerprint, changedSource, { ...context, contextName: 'WEBVIEW_org.example' }, 'tap')).toBeNull();
    expect(engine.heal('old', fingerprint, changedSource, { ...context, screen: 'CheckoutActivity' }, 'tap')).toBeNull();
  });

  test('rejects ambiguous matches rather than guessing', () => {
    const engine = new MobileHealingEngine();
    const ambiguous = changedSource.replace('</android.widget.FrameLayout>',
      `<android.widget.Button class="android.widget.Button" resource-id="org.example:id/login-copy"
       content-desc="Log in" text="Sign in" bounds="[24,204][304,284]" /></android.widget.FrameLayout>`);
    expect(engine.heal('old', originalFingerprint(engine), ambiguous, context, 'tap')).toBeNull();
  });

  test('never automatically applies a destructive healing proposal', () => {
    const engine = new MobileHealingEngine({ approvalPolicy: 'automatic' });
    const hierarchy = new MobileHierarchyParser().parse(originalSource.replace(/Log in/g, 'Delete account'));
    const fingerprint = engine.captureFingerprint(hierarchy.roots[0].children[0].children[0], hierarchy, context);
    const changed = changedSource.replace(/Log in/g, 'Delete account');
    const result = engine.heal('old-delete', fingerprint, changed, context, 'tap');

    expect(result).toEqual(expect.objectContaining({ policy: 'ask', applied: false, approved: false }));
  });
});
