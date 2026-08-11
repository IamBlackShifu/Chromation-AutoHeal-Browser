import type { InspectedElement, LocatorCandidate } from '../../automation/types';

export interface MobileHierarchyNode {
  type: string;
  attributes: Record<string, string>;
  bounds?: { x: number; y: number; width: number; height: number };
  children: MobileHierarchyNode[];
  path: number[];
}

export interface MobileHierarchy {
  roots: MobileHierarchyNode[];
  nodeCount: number;
}

const ATTRIBUTE_PATTERN = /([:\w.-]+)\s*=\s*("[^"]*"|'[^']*')/g;
const TOKEN_PATTERN = /<([^>]+)>/g;

export class MobileHierarchyParser {
  parse(source: string): MobileHierarchy {
    if (typeof source !== 'string' || source.trim().length === 0) {
      throw new Error('Mobile hierarchy source must be a non-empty XML string');
    }
    const roots: MobileHierarchyNode[] = [];
    const stack: MobileHierarchyNode[] = [];
    let nodeCount = 0;
    let token: RegExpExecArray | null;

    while ((token = TOKEN_PATTERN.exec(source)) !== null) {
      const raw = token[1].trim();
      if (!raw || raw.startsWith('?') || raw.startsWith('!')) continue;
      if (raw.startsWith('/')) {
        if (stack.length === 0) throw new Error('Mobile hierarchy contains an unexpected closing tag');
        stack.pop();
        continue;
      }

      const selfClosing = raw.endsWith('/');
      const nameMatch = /^([^\s/]+)/.exec(raw);
      if (!nameMatch) continue;
      const parent = stack[stack.length - 1];
      const siblings = parent ? parent.children : roots;
      const attributes = this.parseAttributes(raw);
      const node: MobileHierarchyNode = {
        type: nameMatch[1],
        attributes,
        bounds: parseBounds(attributes.bounds),
        children: [],
        path: [...(parent?.path ?? []), siblings.length],
      };
      siblings.push(node);
      nodeCount++;
      if (!selfClosing) stack.push(node);
    }
    if (roots.length === 0) throw new Error('Mobile hierarchy did not contain any elements');
    if (stack.length > 0) throw new Error('Mobile hierarchy contains unclosed elements');
    return { roots, nodeCount };
  }

  private parseAttributes(raw: string): Record<string, string> {
    const attributes: Record<string, string> = {};
    ATTRIBUTE_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = ATTRIBUTE_PATTERN.exec(raw)) !== null) {
      attributes[match[1]] = decodeXml(match[2].slice(1, -1));
    }
    return attributes;
  }
}

export class MobileInspector {
  constructor(private readonly parser = new MobileHierarchyParser()) {}

  inspect(source: string): { hierarchy: MobileHierarchy; elements: InspectedElement[] } {
    const hierarchy = this.parser.parse(source);
    const nodes = flatten(hierarchy.roots);
    return {
      hierarchy,
      elements: nodes.map((node) => this.toInspectedElement(node, nodes)),
    };
  }

  private toInspectedElement(node: MobileHierarchyNode, allNodes: MobileHierarchyNode[]): InspectedElement {
    const attributes = node.attributes;
    return {
      elementType: node.type,
      label: attributes['content-desc'] || attributes.label || attributes.name,
      text: attributes.text || attributes.label,
      value: attributes.value,
      attributes: { ...attributes },
      bounds: node.bounds,
      locators: rankLocators(node, allNodes),
    };
  }
}

function rankLocators(node: MobileHierarchyNode, allNodes: MobileHierarchyNode[]): LocatorCandidate[] {
  const candidates: LocatorCandidate[] = [];
  const attrs = node.attributes;
  const accessibilityId = attrs['content-desc'] || attrs['accessibility-id'] || attrs.label || attrs.name;
  if (accessibilityId) {
    candidates.push(candidate('accessibility id', accessibilityId, 0.98, allNodes,
      'Accessibility identifiers are cross-platform and user-facing'));
  }
  if (attrs['resource-id']) {
    candidates.push(candidate('id', attrs['resource-id'], 0.94, allNodes,
      'Android resource IDs are usually stable'));
  }
  if (attrs.text) {
    candidates.push(candidate('-android uiautomator',
      `new UiSelector().text(${JSON.stringify(attrs.text)})`, 0.76, allNodes,
      'Visible text may change with content or localization', attrs.text));
  }
  candidates.push({
    strategy: 'xpath',
    value: buildXPath(node),
    score: 0.35,
    reasons: ['Structural XPath is a last-resort locator'],
  });
  return candidates.sort((a, b) => b.score - a.score);
}

function candidate(
  strategy: string,
  value: string,
  baseScore: number,
  allNodes: MobileHierarchyNode[],
  reason: string,
  matchValue = value
): LocatorCandidate {
  const attributeName = strategy === 'id' ? 'resource-id'
    : strategy === 'accessibility id' ? undefined : 'text';
  const matches = allNodes.filter((node) => attributeName
    ? node.attributes[attributeName] === matchValue
    : [node.attributes['content-desc'], node.attributes['accessibility-id'], node.attributes.label, node.attributes.name]
      .includes(matchValue)).length;
  const unique = matches === 1;
  return {
    strategy,
    value,
    score: unique ? baseScore : Math.max(0.4, baseScore - 0.3),
    reasons: [reason, unique ? 'Unique in the current hierarchy' : `${matches} matching elements in the current hierarchy`],
  };
}

function buildXPath(node: MobileHierarchyNode): string {
  const attrs = node.attributes;
  if (attrs['resource-id']) return `//*[@resource-id=${xpathLiteral(attrs['resource-id'])}]`;
  if (attrs['content-desc']) return `//*[@content-desc=${xpathLiteral(attrs['content-desc'])}]`;
  if (attrs.text) return `//${node.type}[@text=${xpathLiteral(attrs.text)}]`;
  return `//${node.type}`;
}

function xpathLiteral(value: string): string {
  if (!value.includes("'")) return `'${value}'`;
  if (!value.includes('"')) return `"${value}"`;
  const parts = value.split("'").map((part) => `'${part}'`);
  return `concat(${parts.join(', "\'", ')})`;
}

function flatten(roots: MobileHierarchyNode[]): MobileHierarchyNode[] {
  const result: MobileHierarchyNode[] = [];
  const visit = (node: MobileHierarchyNode) => {
    result.push(node);
    node.children.forEach(visit);
  };
  roots.forEach(visit);
  return result;
}

function parseBounds(value?: string): MobileHierarchyNode['bounds'] {
  if (!value) return undefined;
  const match = /^\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]$/.exec(value);
  if (!match) return undefined;
  const [, left, top, right, bottom] = match.map(Number);
  return { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

function decodeXml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)));
}
