/**
 * Advanced Element Discovery Engine
 * Integrated from OhScrapper - Intelligent element detection with semantic naming
 */

export interface DiscoveredElement {
  name: string;
  elementType: string;
  tagName: string;
  selectors: ElementSelector[];
  primarySelector: ElementSelector;
  attributes: Record<string, string>;
  visibleText: string;
  ariaLabel?: string;
  ariaRole?: string;
  labelText?: string;
  section?: string;
  formContext?: string;
  nearestHeading?: string;
  domPath: string;
  confidence: number;
  timestamp: string;
}

export interface ElementSelector {
  type: 'data-testid' | 'data-test' | 'data-qa' | 'id' | 'aria' | 'label' | 'css' | 'xpath';
  value: string;
  confidence: number;
  isUnique: boolean;
}

export interface NamingContext {
  pageTitle: string;
  pageUrl: string;
  nearestHeading?: string;
  section?: string;
  formName?: string;
  parentLabels: string[];
  semanticRole?: string;
}

export class ElementDiscoveryEngine {
  private selectorPriority = ['data-testid', 'data-test', 'data-qa', 'id', 'aria', 'label', 'css', 'xpath'];

  constructor() {
    console.log('ElementDiscoveryEngine initialized');
  }

  /**
   * Discover all interactive elements on a page
   */
  async discoverElements(webview: any): Promise<DiscoveredElement[]> {
    try {
      const elementsData = await webview.executeJavaScript(`
        (function() {
          const elements = [];
          const interactiveSelectors = [
            'input:not([type="hidden"])',
            'textarea',
            'select',
            'button',
            'a[href]',
            '[role="button"]',
            '[role="link"]',
            '[role="textbox"]',
            '[contenteditable="true"]'
          ];
          
          const allElements = document.querySelectorAll(interactiveSelectors.join(', '));
          
          allElements.forEach((el, index) => {
            if (!el.offsetParent && el.tagName !== 'A') return; // Skip hidden
            
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return;
            
            // Extract attributes
            const attributes = {};
            for (let attr of el.attributes) {
              attributes[attr.name] = attr.value;
            }
            
            // Find associated label
            let labelText = '';
            if (el.id) {
              const label = document.querySelector('label[for="' + el.id + '"]');
              if (label) labelText = label.textContent.trim();
            }
            if (!labelText && el.closest('label')) {
              labelText = el.closest('label').textContent.trim();
            }
            
            // Find nearest heading
            let nearestHeading = '';
            let current = el.previousElementSibling;
            while (current && !nearestHeading) {
              if (/^H[1-6]$/.test(current.tagName)) {
                nearestHeading = current.textContent.trim();
                break;
              }
              current = current.previousElementSibling;
            }
            
            // Find section
            let section = '';
            const sectionEl = el.closest('header, nav, main, footer, aside, section, form');
            if (sectionEl) {
              section = sectionEl.tagName.toLowerCase();
              if (sectionEl.id) section += '#' + sectionEl.id;
              else if (sectionEl.className) section += '.' + sectionEl.className.split(' ')[0];
            }
            
            // Find form context
            let formContext = '';
            const form = el.closest('form');
            if (form) {
              formContext = form.id || form.name || 'form';
            }
            
            // Get DOM path
            const getDomPath = (element) => {
              const path = [];
              while (element && element.nodeType === Node.ELEMENT_NODE) {
                let selector = element.nodeName.toLowerCase();
                if (element.id) {
                  selector += '#' + element.id;
                  path.unshift(selector);
                  break;
                } else {
                  let sibling = element;
                  let nth = 1;
                  while (sibling.previousElementSibling) {
                    sibling = sibling.previousElementSibling;
                    if (sibling.nodeName === element.nodeName) nth++;
                  }
                  if (nth > 1) selector += ':nth-of-type(' + nth + ')';
                }
                path.unshift(selector);
                element = element.parentElement;
              }
              return path.join(' > ');
            };
            
            elements.push({
              index: index,
              tagName: el.tagName.toLowerCase(),
              elementType: el.type || el.tagName.toLowerCase(),
              attributes: attributes,
              visibleText: el.textContent ? el.textContent.trim().substring(0, 100) : '',
              ariaLabel: attributes['aria-label'] || '',
              ariaRole: attributes['role'] || '',
              labelText: labelText,
              section: section,
              formContext: formContext,
              nearestHeading: nearestHeading,
              domPath: getDomPath(el)
            });
          });
          
          return elements;
        })();
      `);

      // Process and generate selectors for each element
      const discoveredElements: DiscoveredElement[] = [];
      
      for (const elData of elementsData) {
        const selectors = this.generateSelectors(elData);
        const name = this.generateSemanticName(elData, document.title);
        
        discoveredElements.push({
          name,
          elementType: elData.elementType,
          tagName: elData.tagName,
          selectors,
          primarySelector: selectors[0],
          attributes: elData.attributes,
          visibleText: elData.visibleText,
          ariaLabel: elData.ariaLabel,
          ariaRole: elData.ariaRole,
          labelText: elData.labelText,
          section: elData.section,
          formContext: elData.formContext,
          nearestHeading: elData.nearestHeading,
          domPath: elData.domPath,
          confidence: selectors[0]?.confidence || 0,
          timestamp: new Date().toISOString()
        });
      }

      return discoveredElements;
    } catch (error) {
      console.error('Element discovery failed:', error);
      return [];
    }
  }

  /**
   * Generate multiple selector strategies with confidence scoring
   */
  private generateSelectors(element: any): ElementSelector[] {
    const selectors: ElementSelector[] = [];
    const attrs = element.attributes;

    // 1. Test IDs (highest confidence)
    if (attrs['data-testid']) {
      selectors.push({
        type: 'data-testid',
        value: `[data-testid="${attrs['data-testid']}"]`,
        confidence: 1.0,
        isUnique: true
      });
    }
    if (attrs['data-test']) {
      selectors.push({
        type: 'data-test',
        value: `[data-test="${attrs['data-test']}"]`,
        confidence: 1.0,
        isUnique: true
      });
    }
    if (attrs['data-qa']) {
      selectors.push({
        type: 'data-qa',
        value: `[data-qa="${attrs['data-qa']}"]`,
        confidence: 1.0,
        isUnique: true
      });
    }

    // 2. Unique ID (high confidence)
    if (attrs.id && !this.isAutoGeneratedId(attrs.id)) {
      selectors.push({
        type: 'id',
        value: `#${attrs.id}`,
        confidence: 0.95,
        isUnique: true
      });
    }

    // 3. ARIA attributes
    if (attrs['aria-label']) {
      selectors.push({
        type: 'aria',
        value: `[aria-label="${attrs['aria-label']}"]`,
        confidence: 0.85,
        isUnique: false
      });
    }

    // 4. Name attribute
    if (attrs.name) {
      selectors.push({
        type: 'css',
        value: `[name="${attrs.name}"]`,
        confidence: 0.75,
        isUnique: false
      });
    }

    // 5. Label-based (for inputs)
    if (element.labelText) {
      selectors.push({
        type: 'label',
        value: `label:has-text("${element.labelText}") + ${element.tagName}`,
        confidence: 0.70,
        isUnique: false
      });
    }

    // 6. CSS with type/placeholder
    if (attrs.type || attrs.placeholder) {
      let cssSelector = element.tagName;
      if (attrs.type) cssSelector += `[type="${attrs.type}"]`;
      if (attrs.placeholder) cssSelector += `[placeholder="${attrs.placeholder}"]`;
      selectors.push({
        type: 'css',
        value: cssSelector,
        confidence: 0.65,
        isUnique: false
      });
    }

    // 7. XPath (last resort)
    if (selectors.length === 0) {
      selectors.push({
        type: 'xpath',
        value: element.domPath,
        confidence: 0.50,
        isUnique: false
      });
    }

    return selectors;
  }

  /**
   * Generate semantic name following pattern: {page}_{section}_{purpose}_{elementType}
   */
  private generateSemanticName(element: any, pageTitle: string): string {
    const parts: string[] = [];

    // 1. Page name
    const pageName = this.sanitizeName(pageTitle || 'page');
    parts.push(pageName);

    // 2. Section
    if (element.section) {
      parts.push(this.sanitizeName(element.section.split(/[#.]/)[0]));
    } else if (element.formContext) {
      parts.push(this.sanitizeName(element.formContext));
    }

    // 3. Purpose (from label, aria-label, placeholder, or text)
    let purpose = '';
    if (element.labelText) {
      purpose = element.labelText;
    } else if (element.ariaLabel) {
      purpose = element.ariaLabel;
    } else if (element.attributes.placeholder) {
      purpose = element.attributes.placeholder;
    } else if (element.visibleText && element.visibleText.length < 30) {
      purpose = element.visibleText;
    } else if (element.attributes.name) {
      purpose = element.attributes.name;
    }
    
    if (purpose) {
      parts.push(this.sanitizeName(purpose));
    }

    // 4. Element type
    const typeAbbrev = this.abbreviateType(element.elementType);
    parts.push(typeAbbrev);

    // Join and ensure uniqueness
    let name = parts.filter(p => p).join('_');
    
    // Truncate if too long
    if (name.length > 80) {
      name = name.substring(0, 80);
    }

    return name;
  }

  /**
   * Sanitize name for use as identifier
   */
  private sanitizeName(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .substring(0, 30);
  }

  /**
   * Abbreviate element type
   */
  private abbreviateType(type: string): string {
    const abbrevMap: Record<string, string> = {
      'button': 'btn',
      'input': 'input',
      'textarea': 'textarea',
      'select': 'select',
      'checkbox': 'checkbox',
      'radio': 'radio',
      'link': 'link',
      'a': 'link'
    };
    return abbrevMap[type.toLowerCase()] || type;
  }

  /**
   * Check if ID is auto-generated
   */
  private isAutoGeneratedId(id: string): boolean {
    const autoGenPatterns = [
      /^react-/i,
      /^ember\d/i,
      /^vue-/i,
      /^\d+$/,
      /^[a-f0-9]{8,}$/i,  // hex strings
      /^id_\d+$/
    ];
    
    return autoGenPatterns.some(pattern => pattern.test(id));
  }

  /**
   * Export elements to Page Object Model
   */
  generatePageObjectModel(elements: DiscoveredElement[], pageUrl: string, framework: string = 'playwright'): string {
    const className = this.generateClassName(pageUrl);
    
    if (framework === 'playwright') {
      return this.generatePlaywrightPOM(className, pageUrl, elements);
    } else if (framework === 'selenium-js') {
      return this.generateSeleniumJS(className, pageUrl, elements);
    } else if (framework === 'cypress') {
      return this.generateCypress(className, pageUrl, elements);
    }
    
    return '';
  }

  private generateClassName(url: string): string {
    try {
      const pathname = new URL(url).pathname;
      const parts = pathname.split('/').filter(Boolean);
      const pageName = parts.length > 0 ? parts[parts.length - 1] : 'Home';
      return pageName.replace(/[^a-zA-Z0-9]/g, '') + 'Page';
    } catch {
      return 'HomePage';
    }
  }

  private generatePlaywrightPOM(className: string, url: string, elements: DiscoveredElement[]): string {
    const locators = elements
      .map(el => {
        const comment = el.visibleText ? `  /** ${el.visibleText} */\n` : '';
        return `${comment}  readonly ${el.name}: Locator;`;
      })
      .join('\n\n');

    const constructor = elements
      .map(el => `    this.${el.name} = page.locator('${el.primarySelector.value}');`)
      .join('\n');

    return `import { Page, Locator } from '@playwright/test';

/**
 * Page Object Model for ${url}
 * Generated by Chromation AutoHeal Browser
 */
export class ${className} {
  readonly page: Page;

${locators}

  constructor(page: Page) {
    this.page = page;
${constructor}
  }

  async goto() {
    await this.page.goto('${url}');
  }
}

// Usage example:
// const ${className.charAt(0).toLowerCase() + className.slice(1)} = new ${className}(page);
// await ${className.charAt(0).toLowerCase() + className.slice(1)}.goto();
`;
  }

  private generateSeleniumJS(className: string, url: string, elements: DiscoveredElement[]): string {
    const locators = elements
      .map(el => `  this.${el.name} = By.css('${el.primarySelector.value}');`)
      .join('\n');

    return `const { By } = require('selenium-webdriver');

/**
 * Page Object for ${url}
 * Generated by Chromation AutoHeal Browser
 */
class ${className} {
  constructor(driver) {
    this.driver = driver;
${locators}
  }

  async goto() {
    await this.driver.get('${url}');
  }

${elements.map(el => `
  async get${this.toCamelCase(el.name, true)}() {
    return await this.driver.findElement(this.${el.name});
  }`).join('\n')}
}

module.exports = ${className};
`;
  }

  private generateCypress(className: string, url: string, elements: DiscoveredElement[]): string {
    const selectors = elements
      .map(el => `  ${el.name}: '${el.primarySelector.value}',`)
      .join('\n');

    return `/**
 * Cypress Page Object for ${url}
 * Generated by Chromation AutoHeal Browser
 */
export const ${className} = {
  url: '${url}',

  selectors: {
${selectors}
  },

  visit() {
    cy.visit(this.url);
  },

${elements.map(el => {
  const methodName = this.toCamelCase(el.name, false);
  return `  ${methodName}() {
    return cy.get(this.selectors.${el.name});
  },`;
}).join('\n\n')}
};
`;
  }

  private toCamelCase(str: string, capitalize: boolean = false): string {
    const camel = str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    return capitalize ? camel.charAt(0).toUpperCase() + camel.slice(1) : camel;
  }
}
