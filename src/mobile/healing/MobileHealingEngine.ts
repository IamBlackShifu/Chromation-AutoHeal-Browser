import type { ActionType } from '../../recorder/Recorder';
import type {
  HealingApprovalPolicy,
  HealingResult,
  HealingScoreBreakdown,
  LocatorFingerprint,
} from '../../healing/HealingEngine';
import {
  MobileHierarchy,
  MobileHierarchyNode,
  MobileInspector,
} from '../inspector/MobileHierarchy';

export interface MobileAutomationContext {
  platform: 'android' | 'ios';
  mode: 'native' | 'hybrid' | 'mobileWeb';
  appId: string;
  automationName: string;
  contextName: string;
  screen?: string;
  window?: string;
  orientation?: 'PORTRAIT' | 'LANDSCAPE';
}

export interface MobileLocatorFingerprint extends LocatorFingerprint {
  mobileContext: MobileAutomationContext;
  nodePath: number[];
  locatorCandidates: Array<{ strategy: string; value: string; score: number }>;
  enabled?: boolean;
  displayed?: boolean;
  selected?: boolean;
}

export interface MobileHealingOptions {
  confidenceThreshold?: number;
  ambiguityMargin?: number;
  approvalPolicy?: HealingApprovalPolicy;
}

const DESTRUCTIVE_ACTIONS = new Set<ActionType>(['submit', 'launchApp', 'terminateApp']);

export class MobileHealingEngine {
  private readonly confidenceThreshold: number;
  private readonly ambiguityMargin: number;
  private approvalPolicy: HealingApprovalPolicy;
  private history: HealingResult[] = [];

  constructor(
    options: MobileHealingOptions = {},
    private readonly inspector = new MobileInspector()
  ) {
    this.confidenceThreshold = options.confidenceThreshold ?? 0.82;
    this.ambiguityMargin = options.ambiguityMargin ?? 0.12;
    this.approvalPolicy = options.approvalPolicy ?? 'ask';
  }

  captureFingerprint(
    node: MobileHierarchyNode,
    hierarchy: MobileHierarchy,
    context: MobileAutomationContext
  ): MobileLocatorFingerprint {
    const inspection = this.inspector.inspect(serializeHierarchy(hierarchy));
    const flatNodes = flatten(hierarchy.roots);
    const index = flatNodes.indexOf(node);
    if (index < 0) throw new Error('Element is not part of the supplied mobile hierarchy');
    const element = inspection.elements[index];
    const ancestors = ancestorTypes(hierarchy, node.path);
    return {
      tagName: node.type,
      role: node.attributes.class || node.type,
      attributes: { ...node.attributes },
      text: node.attributes.text || node.attributes.label,
      accessibleName: node.attributes['content-desc'] || node.attributes.label || node.attributes.name,
      domPath: ancestors,
      boundingBox: node.bounds,
      mobileContext: { ...context },
      nodePath: [...node.path],
      locatorCandidates: element.locators.map(({ strategy, value, score }) => ({ strategy, value, score })),
      enabled: parseBoolean(node.attributes.enabled),
      displayed: parseBoolean(node.attributes.displayed),
      selected: parseBoolean(node.attributes.selected),
    };
  }

  heal(
    originalSelector: string,
    original: MobileLocatorFingerprint,
    source: string,
    currentContext: MobileAutomationContext,
    actionType: ActionType
  ): HealingResult | null {
    if (!sameContext(original.mobileContext, currentContext)) return null;
    const inspection = this.inspector.inspect(source);
    const nodes = flatten(inspection.hierarchy.roots);
    const candidates = nodes
      .map((node, index) => {
        const element = inspection.elements[index];
        const locator = element.locators.find((item) => item.score >= 0.5);
        if (!locator || !compatibleRole(original, node)) return null;
        const fingerprint = this.captureFingerprint(node, inspection.hierarchy, currentContext);
        const scoreBreakdown = scoreFingerprint(original, fingerprint);
        const confidence = weightedConfidence(scoreBreakdown);
        return {
          selector: `${locator.strategy}=${locator.value}`,
          confidence,
          scoreBreakdown,
        };
      })
      .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
      .sort((left, right) => right.confidence - left.confidence);

    const best = candidates[0];
    const runnerUp = candidates[1];
    if (!best || best.confidence < this.confidenceThreshold) return null;
    if (runnerUp && best.confidence - runnerUp.confidence < this.ambiguityMargin) return null;
    if (candidates.filter((item) => item.selector === best.selector).length !== 1) return null;

    const destructive = isDestructive(actionType, original);
    const applied = this.approvalPolicy === 'automatic' && !destructive;
    const result: HealingResult = {
      originalSelector,
      healedSelector: best.selector,
      confidence: best.confidence,
      strategy: 'mobile-context-fingerprint',
      timestamp: Date.now(),
      scoreBreakdown: best.scoreBreakdown,
      alternatives: candidates.slice(1, 4).map(({ selector, confidence }) => ({ selector, confidence })),
      approved: applied,
      applied,
      policy: destructive && this.approvalPolicy === 'automatic' ? 'ask' : this.approvalPolicy,
    };
    this.history.push(result);
    return result;
  }

  approve(result: HealingResult): HealingResult {
    result.approved = true;
    result.applied = true;
    return result;
  }
  reject(result: HealingResult): HealingResult {
    result.approved = false;
    result.applied = false;
    return result;
  }
  setApprovalPolicy(policy: HealingApprovalPolicy): void { this.approvalPolicy = policy; }
  getHistory(): HealingResult[] { return [...this.history]; }
  clearHistory(): void { this.history = []; }
}

function sameContext(expected: MobileAutomationContext, actual: MobileAutomationContext): boolean {
  return expected.platform === actual.platform &&
    expected.mode === actual.mode &&
    expected.appId === actual.appId &&
    expected.automationName.toLowerCase() === actual.automationName.toLowerCase() &&
    expected.contextName === actual.contextName &&
    (!expected.screen || expected.screen === actual.screen) &&
    (!expected.window || !actual.window || expected.window === actual.window);
}

function compatibleRole(original: MobileLocatorFingerprint, candidate: MobileHierarchyNode): boolean {
  const originalRole = (original.role || original.tagName).toLowerCase();
  const candidateRole = (candidate.attributes.class || candidate.type).toLowerCase();
  return originalRole === candidateRole;
}

function scoreFingerprint(
  original: MobileLocatorFingerprint,
  candidate: MobileLocatorFingerprint
): HealingScoreBreakdown {
  const stableNames = ['resource-id', 'content-desc', 'accessibility-id', 'name', 'label', 'class'];
  const expectedAttributes = Object.fromEntries(stableNames.flatMap((name) =>
    original.attributes[name] ? [[name, original.attributes[name]]] : []));
  const matching = Object.entries(expectedAttributes).filter(([name, value]) =>
    normalize(value) === normalize(candidate.attributes[name])).length;
  const attributes = Object.keys(expectedAttributes).length
    ? matching / Object.keys(expectedAttributes).length : 0;
  const text = similarity(original.text, candidate.text);
  const semantics = similarity(original.accessibleName, candidate.accessibleName) * 0.6 +
    (normalize(original.role) === normalize(candidate.role) ? 0.4 : 0);
  const hierarchy = pathSimilarity(original.domPath, candidate.domPath);
  const position = positionSimilarity(original.boundingBox, candidate.boundingBox);
  return { attributes, text, semantics, hierarchy, position };
}

function weightedConfidence(score: HealingScoreBreakdown): number {
  return score.attributes * 0.38 + score.text * 0.18 + score.semantics * 0.26 +
    score.hierarchy * 0.12 + score.position * 0.06;
}

function similarity(left?: string, right?: string): number {
  if (!left || !right) return 0;
  const a = normalize(left);
  const b = normalize(right);
  if (a === b) return 1;
  const aTokens = new Set(a.split(/\s+/));
  const bTokens = new Set(b.split(/\s+/));
  const matches = [...aTokens].filter((token) => bTokens.has(token)).length;
  return matches / new Set([...aTokens, ...bTokens]).size;
}

function pathSimilarity(left: string[] = [], right: string[] = []): number {
  if (!left.length || !right.length) return 0;
  let matches = 0;
  const length = Math.min(left.length, right.length);
  for (let offset = 1; offset <= length; offset++) {
    if (normalize(left.at(-offset)) === normalize(right.at(-offset))) matches++;
  }
  return matches / Math.max(left.length, right.length);
}

function positionSimilarity(
  left?: LocatorFingerprint['boundingBox'], right?: LocatorFingerprint['boundingBox']
): number {
  if (!left || !right) return 0;
  const leftCenter = { x: left.x + left.width / 2, y: left.y + left.height / 2 };
  const rightCenter = { x: right.x + right.width / 2, y: right.y + right.height / 2 };
  return Math.max(0, 1 - Math.hypot(leftCenter.x - rightCenter.x, leftCenter.y - rightCenter.y) / 1200);
}

function isDestructive(action: ActionType, fingerprint: MobileLocatorFingerprint): boolean {
  if (DESTRUCTIVE_ACTIONS.has(action)) return true;
  const content = [fingerprint.text, fingerprint.accessibleName, ...Object.values(fingerprint.attributes)]
    .filter(Boolean).join(' ').toLowerCase();
  return /\b(delete|remove|purchase|pay|confirm order|erase|uninstall)\b/.test(content);
}

function normalize(value?: string): string { return (value ?? '').trim().toLowerCase(); }
function parseBoolean(value?: string): boolean | undefined {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

function flatten(roots: MobileHierarchyNode[]): MobileHierarchyNode[] {
  const result: MobileHierarchyNode[] = [];
  const visit = (node: MobileHierarchyNode) => { result.push(node); node.children.forEach(visit); };
  roots.forEach(visit);
  return result;
}

function ancestorTypes(hierarchy: MobileHierarchy, path: number[]): string[] {
  const types: string[] = [];
  let siblings = hierarchy.roots;
  for (const index of path) {
    const node = siblings[index];
    if (!node) break;
    types.push(node.attributes.class || node.type);
    siblings = node.children;
  }
  return types;
}

function serializeHierarchy(hierarchy: MobileHierarchy): string {
  const serializeNode = (node: MobileHierarchyNode): string => {
    const attributes = Object.entries(node.attributes)
      .map(([name, value]) => ` ${name}="${escapeXml(value)}"`).join('');
    return `<${node.type}${attributes}>${node.children.map(serializeNode).join('')}</${node.type}>`;
  };
  return hierarchy.roots.map(serializeNode).join('');
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
