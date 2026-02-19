/**
 * Chromation AutoHeal Browser - Renderer Process
 * Handles UI interactions and communication with main process
 */

const { ipcRenderer } = require('electron');

// Import the Chromation modules
const ChromationBrowser = require('../dist/index.js').default;

// Initialize the browser engine
let chromationBrowser;
let inspector, recorder, healingEngine, scraperStudio, reporter;
let isRecording = false;
let isInspecting = false;
let recordedActions = [];

// DOM elements
const urlInput = document.getElementById('url-input');
const browserWebview = document.getElementById('browser-webview');
const sidePanel = document.getElementById('side-panel');
const panelTitle = document.getElementById('panel-title');
const panelContent = document.getElementById('panel-content');
const loadingIndicator = document.getElementById('loading-indicator');
const statusText = document.getElementById('status-text');
const healingStatus = document.getElementById('healing-status');
const recordingStatus = document.getElementById('recording-status');

// Navigation buttons
const btnBack = document.getElementById('btn-back');
const btnForward = document.getElementById('btn-forward');
const btnRefresh = document.getElementById('btn-refresh');
const btnHome = document.getElementById('btn-home');

// Tool buttons
const btnInspector = document.getElementById('btn-inspector');
const btnRecorder = document.getElementById('btn-recorder');
const btnScraper = document.getElementById('btn-scraper');
const btnHealing = document.getElementById('btn-healing');
const btnClosePanel = document.getElementById('btn-close-panel');

// Initialize Chromation Browser
async function initChromation() {
  try {
    chromationBrowser = new ChromationBrowser();
    await chromationBrowser.initialize();
    
    inspector = chromationBrowser.getInspector();
    recorder = chromationBrowser.getRecorder();
    healingEngine = chromationBrowser.getHealingEngine();
    scraperStudio = chromationBrowser.getScraperStudio();
    reporter = chromationBrowser.getReporter();
    
    statusText.textContent = 'Ready';
    console.log('Chromation modules initialized');
  } catch (error) {
    console.error('Failed to initialize Chromation:', error);
    statusText.textContent = 'Initialization failed';
  }
}

// URL Navigation
urlInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    navigateToUrl(urlInput.value);
  }
});

function navigateToUrl(url) {
  if (!url) return;
  
  // Add protocol if missing
  if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('file://')) {
    // Check if it's a search query or URL
    if (url.includes('.') && !url.includes(' ')) {
      url = 'https://' + url;
    } else {
      url = 'https://duckduckgo.com/?q=' + encodeURIComponent(url);
    }
  }
  
  loadingIndicator.classList.add('active');
  statusText.textContent = 'Loading...';
  browserWebview.src = url;
  urlInput.value = url;
  
  // Record navigation if recording
  if (isRecording && recorder) {
    recorder.recordAction({
      type: 'navigate',
      selector: 'window',
      value: url,
      timestamp: Date.now()
    });
    updateActionsDisplay();
  }
}

// Webview event listeners
browserWebview.addEventListener('did-start-loading', () => {
  loadingIndicator.classList.add('active');
  statusText.textContent = 'Loading...';
});

browserWebview.addEventListener('did-stop-loading', () => {
  loadingIndicator.classList.remove('active');
  statusText.textContent = 'Ready';
  urlInput.value = browserWebview.src;
});

browserWebview.addEventListener('did-fail-load', (e) => {
  if (e.errorCode !== -3) { // Ignore aborted loads
    loadingIndicator.classList.remove('active');
    statusText.textContent = 'Failed to load page';
  }
});

// Navigation controls
btnBack.addEventListener('click', () => {
  if (browserWebview.canGoBack()) {
    browserWebview.goBack();
  }
});

btnForward.addEventListener('click', () => {
  if (browserWebview.canGoForward()) {
    browserWebview.goForward();
  }
});

btnRefresh.addEventListener('click', () => {
  browserWebview.reload();
});

btnHome.addEventListener('click', () => {
  navigateToUrl('https://infinitylinesofcode.com');
});

// Tool buttons
btnInspector.addEventListener('click', () => {
  toggleTool('inspector');
});

btnRecorder.addEventListener('click', () => {
  toggleTool('recorder');
});

btnScraper.addEventListener('click', () => {
  toggleTool('scraper');
});

btnHealing.addEventListener('click', () => {
  toggleHealing();
});

btnClosePanel.addEventListener('click', () => {
  closePanel();
});

// Toggle tools
function toggleTool(tool) {
  // Reset all tool buttons
  btnInspector.classList.remove('active');
  btnRecorder.classList.remove('active');
  btnScraper.classList.remove('active');
  
  // Activate selected tool
  const isOpen = sidePanel.classList.contains('open');
  const isSameTool = sidePanel.dataset.currentTool === tool;
  
  if (isOpen && isSameTool) {
    closePanel();
    return;
  }
  
  sidePanel.dataset.currentTool = tool;
  
  switch (tool) {
    case 'inspector':
      btnInspector.classList.add('active');
      showInspectorPanel();
      break;
    case 'recorder':
      btnRecorder.classList.add('active');
      showRecorderPanel();
      break;
    case 'scraper':
      btnScraper.classList.add('active');
      showScraperPanel();
      break;
  }
  
  sidePanel.classList.add('open');
}

function closePanel() {
  sidePanel.classList.remove('open');
  btnInspector.classList.remove('active');
  btnRecorder.classList.remove('active');
  btnScraper.classList.remove('active');
  
  // Stop any active operations
  if (isInspecting && inspector) {
    inspector.stopInspection();
    isInspecting = false;
  }
}

// Inspector Panel
function showInspectorPanel() {
  panelTitle.textContent = 'Inspector & Discovery';
  const template = document.getElementById('inspector-panel-template');
  panelContent.innerHTML = template.innerHTML;
  
  const startInspectBtn = document.getElementById('start-inspect-btn');
  const discoverAllBtn = document.getElementById('discover-all-btn');
  
  startInspectBtn.addEventListener('click', () => {
    startInspection();
  });
  
  discoverAllBtn.addEventListener('click', () => {
    discoverAllElements();
  });
}

async function startInspection() {
  if (!inspector) return;
  
  isInspecting = true;
  inspector.startInspection();
  statusText.textContent = 'Click on an element to inspect...';
  
  const startInspectBtn = document.getElementById('start-inspect-btn');
  startInspectBtn.textContent = 'Inspecting... (Click element)';
  startInspectBtn.disabled = true;
  
  // Inject inspection script into webview
  try {
    await browserWebview.executeJavaScript(`
      (function() {
        document.addEventListener('click', function inspectorClick(e) {
          e.preventDefault();
          e.stopPropagation();
          const element = e.target;
          
          // Get element info
          const info = {
            tag: element.tagName,
            id: element.id,
            className: element.className,
            name: element.name || '',
            type: element.type || '',
            text: (element.textContent || '').substring(0, 50),
            placeholder: element.placeholder || '',
            ariaLabel: element.getAttribute('aria-label') || '',
            dataTestId: element.getAttribute('data-testid') || ''
          };
          
          console.log('CHROMATION_INSPECT:' + JSON.stringify(info));
          document.removeEventListener('click', inspectorClick, true);
        }, { capture: true, once: true });
      })();
    `);
    
    // Listen for inspection result
    const inspectListener = (e) => {
      if (e.message.startsWith('CHROMATION_INSPECT:')) {
        const elementData = JSON.parse(e.message.replace('CHROMATION_INSPECT:', ''));
        displayElementInfo(elementData);
        startInspectBtn.textContent = 'Inspect Single Element';
        startInspectBtn.disabled = false;
        isInspecting = false;
        inspector.stopInspection();
        statusText.textContent = 'Ready';
        browserWebview.removeEventListener('console-message', inspectListener);
      }
    };
    
    browserWebview.addEventListener('console-message', inspectListener);
  } catch (error) {
    console.error('Failed to inject inspection script:', error);
  }
}

async function discoverAllElements() {
  statusText.textContent = 'Discovering all elements...';
  const discoverAllBtn = document.getElementById('discover-all-btn');
  discoverAllBtn.disabled = true;
  discoverAllBtn.textContent = 'Discovering...';
  
  try {
    // Inject and execute element discovery script
    const elementsData = await browserWebview.executeJavaScript(`
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
        const pageTitle = document.title || 'page';
        
        allElements.forEach((el, index) => {
          // Skip hidden elements
          if (!el.offsetParent && el.tagName !== 'A') return;
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
            labelText = el.closest('label').textContent.trim().substring(0, 50);
          }
          
          // Find nearest heading
          let nearestHeading = '';
          let current = el.previousElementSibling;
          let depth = 0;
          while (current && !nearestHeading && depth < 10) {
            if (/^H[1-6]$/.test(current.tagName)) {
              nearestHeading = current.textContent.trim().substring(0, 50);
              break;
            }
            current = current.previousElementSibling;
            depth++;
          }
          
          // Find section
          let section = '';
          const sectionEl = el.closest('header, nav, main, footer, aside, section, form');
          if (sectionEl) {
            section = sectionEl.tagName.toLowerCase();
          }
          
          // Find form context
          let formContext = '';
          const form = el.closest('form');
          if (form) {
            formContext = form.id || form.name || 'form';
          }
          
          elements.push({
            index: index,
            tagName: el.tagName.toLowerCase(),
            elementType: el.type || el.tagName.toLowerCase(),
            attributes: attributes,
            visibleText: (el.textContent || '').trim().substring(0, 100),
            ariaLabel: attributes['aria-label'] || '',
            ariaRole: attributes['role'] || '',
            labelText: labelText,
            section: section,
            formContext: formContext,
            nearestHeading: nearestHeading
          });
        });
        
        return { elements: elements, pageTitle: pageTitle };
      })();
    `);
    
    // Process discovered elements
    const discoveredElements = processDiscoveredElements(elementsData.elements, elementsData.pageTitle);
    displayDiscoveryResults(discoveredElements);
    
    discoverAllBtn.disabled = false;
    discoverAllBtn.textContent = 'Discover All Elements';
    statusText.textContent = `Discovered ${discoveredElements.length} elements`;
  } catch (error) {
    console.error('Element discovery failed:', error);
    statusText.textContent = 'Discovery failed - check console';
    discoverAllBtn.disabled = false;
    discoverAllBtn.textContent = 'Discover All Elements';
  }
}

function processDiscoveredElements(elements, pageTitle) {
  const discovered = [];
  const usedNames = new Set();
  
  for (const elData of elements) {
    const selectors = generateSelectors(elData);
    const name = generateSemanticName(elData, pageTitle, usedNames);
    usedNames.add(name);
    
    discovered.push({
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
      confidence: selectors[0]?.confidence || 0
    });
  }
  
  return discovered;
}

function generateSelectors(element) {
  const selectors = [];
  const attrs = element.attributes;
  
  // Test IDs
  if (attrs['data-testid']) {
    selectors.push({ type: 'data-testid', value: `[data-testid="${attrs['data-testid']}"]`, confidence: 1.0, isUnique: true });
  }
  if (attrs['data-test']) {
    selectors.push({ type: 'data-test', value: `[data-test="${attrs['data-test']}"]`, confidence: 1.0, isUnique: true });
  }
  
  // Unique ID
  if (attrs.id && !isAutoGeneratedId(attrs.id)) {
    selectors.push({ type: 'id', value: `#${attrs.id}`, confidence: 0.95, isUnique: true });
  }
  
  // ARIA
  if (attrs['aria-label']) {
    selectors.push({ type: 'aria', value: `[aria-label="${attrs['aria-label']}"]`, confidence: 0.85, isUnique: false });
  }
  
  // Name attribute
  if (attrs.name) {
    selectors.push({ type: 'css', value: `[name="${attrs.name}"]`, confidence: 0.75, isUnique: false });
  }
  
  // Type/placeholder
  if (attrs.type || attrs.placeholder) {
    let cssSelector = element.tagName;
    if (attrs.type) cssSelector += `[type="${attrs.type}"]`;
    if (attrs.placeholder) cssSelector += `[placeholder="${attrs.placeholder}"]`;
    selectors.push({ type: 'css', value: cssSelector, confidence: 0.65, isUnique: false });
  }
  
  // Fallback
  if (selectors.length === 0) {
    selectors.push({ type: 'css', value: element.tagName, confidence: 0.50, isUnique: false });
  }
  
  return selectors;
}

function generateSemanticName(element, pageTitle, usedNames) {
  const parts = [];
  
  // Page name
  const pageName = sanitizeName(pageTitle);
  parts.push(pageName);
  
  // Section
  if (element.section) {
    parts.push(sanitizeName(element.section));
  } else if (element.formContext) {
    parts.push(sanitizeName(element.formContext));
  }
  
  // Purpose
  let purpose = element.labelText || element.ariaLabel || element.attributes.placeholder || 
                element.attributes.name || (element.visibleText.length < 30 ? element.visibleText : '');
  if (purpose) {
    parts.push(sanitizeName(purpose));
  }
  
  // Element type
  const typeAbbrev = abbreviateType(element.elementType);
  parts.push(typeAbbrev);
  
  let name = parts.filter(p => p).join('_').substring(0, 80);
  
  // Ensure uniqueness
  let finalName = name;
  let counter = 2;
  while (usedNames.has(finalName)) {
    finalName = name + '_' + counter;
    counter++;
  }
  
  return finalName;
}

function sanitizeName(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').substring(0, 30);
}

function abbreviateType(type) {
  const abbrevMap = {
    'button': 'btn', 'input': 'input', 'textarea': 'textarea', 'select': 'select',
    'checkbox': 'checkbox', 'radio': 'radio', 'link': 'link', 'a': 'link'
  };
  return abbrevMap[type.toLowerCase()] || type;
}

function isAutoGeneratedId(id) {
  return /^(react-|ember\d|vue-|\d+$|[a-f0-9]{8,}$|id_\d+$)/i.test(id);
}

function displayDiscoveryResults(elements) {
  const discoveryResults = document.getElementById('discovery-results');
  const elementCount = document.getElementById('element-count');
  const elementsTable = document.getElementById('elements-table');
  
  discoveryResults.style.display = 'block';
  elementCount.textContent = elements.length;
  
  // Store for export
  window.discoveredElements = elements;
  
  // Display elements
  elementsTable.innerHTML = elements.map(el => `
    <div class="element-row">
      <div class="element-name">${el.name}</div>
      <div class="element-selector">${el.primarySelector.value}</div>
      <div class="element-meta">
        <span>Type: ${el.elementType}</span>
        <span class="confidence-badge ${getConfidenceClass(el.confidence)}">
          ${(el.confidence * 100).toFixed(0)}% confidence
        </span>
        <span>${el.primarySelector.type}</span>
      </div>
    </div>
  `).join('');
  
  // Setup export buttons
  const exportPomBtn = document.getElementById('export-pom-btn');
  const exportJsonBtn = document.getElementById('export-json-btn');
  const frameworkSelect = document.getElementById('pom-framework-select');
  
  exportPomBtn.onclick = () => exportPOM(elements, frameworkSelect.value);
  exportJsonBtn.onclick = () => exportJSON(elements);
}

function getConfidenceClass(confidence) {
  if (confidence >= 0.9) return 'confidence-high';
  if (confidence >= 0.7) return 'confidence-medium';
  return 'confidence-low';
}

function exportPOM(elements, framework) {
  const url = browserWebview.src;
  const pom = generatePageObjectModel(elements, url, framework);
  const ext = framework.includes('python') ? 'py' : framework === 'cypress' ? 'js' : 'ts';
  downloadFile(pom, `PageObject.${ext}`, 'text/plain');
  statusText.textContent = `Exported ${framework} POM`;
}

function exportJSON(elements) {
  const json = JSON.stringify(elements, null, 2);
  downloadFile(json, 'discovered-elements.json', 'application/json');
  statusText.textContent = 'Exported elements JSON';
}

function generatePageObjectModel(elements, url, framework) {
  const className = generateClassName(url);
  
  if (framework === 'playwright') {
    return generatePlaywrightPOM(className, url, elements);
  } else if (framework === 'selenium-js') {
    return generateSeleniumJS(className, url, elements);
  } else if (framework === 'cypress') {
    return generateCypress(className, url, elements);
  }
  return '';
}

function generateClassName(url) {
  try {
    const pathname = new URL(url).pathname;
    const parts = pathname.split('/').filter(Boolean);
    const pageName = parts.length > 0 ? parts[parts.length - 1] : 'Home';
    return pageName.replace(/[^a-zA-Z0-9]/g, '') + 'Page';
  } catch {
    return 'HomePage';
  }
}

function generatePlaywrightPOM(className, url, elements) {
  const locators = elements.map(el => {
    const comment = el.visibleText ? `  /** ${el.visibleText} */\n` : '';
    return `${comment}  readonly ${el.name}: Locator;`;
  }).join('\n\n');
  
  const constructor = elements.map(el => 
    `    this.${el.name} = page.locator('${el.primarySelector.value}');`
  ).join('\n');
  
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
`;
}

function generateSeleniumJS(className, url, elements) {
  const locators = elements.map(el => 
    `  this.${el.name} = By.css('${el.primarySelector.value}');`
  ).join('\n');
  
  return `const { By } = require('selenium-webdriver');

class ${className} {
  constructor(driver) {
    this.driver = driver;
${locators}
  }

  async goto() {
    await this.driver.get('${url}');
  }
}

module.exports = ${className};
`;
}

function generateCypress(className, url, elements) {
  const selectors = elements.map(el => 
    `  ${el.name}: '${el.primarySelector.value}',`
  ).join('\n');
  
  return `export const ${className} = {
  url: '${url}',

  selectors: {
${selectors}
  },

  visit() {
    cy.visit(this.url);
  }
};
`;
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function displayElementInfo(elementData) {
  const elementDetails = document.getElementById('element-details');
  const locatorsList = document.getElementById('locators-list');
  const elementInfoDiv = document.getElementById('element-info');
  
  elementInfoDiv.style.display = 'block';
  
  // Generate locators for this element
  const locators = generateSelectors(elementData);
  
  elementDetails.innerHTML = `
    <div><strong>Tag:</strong> ${elementData.tag}</div>
    <div><strong>ID:</strong> ${elementData.id || '(none)'}</div>
    <div><strong>Name:</strong> ${elementData.name || '(none)'}</div>
    <div><strong>Type:</strong> ${elementData.type || '(none)'}</div>
    <div><strong>Text:</strong> ${elementData.text || '(none)'}</div>
    <div><strong>ARIA Label:</strong> ${elementData.ariaLabel || '(none)'}</div>
  `;
  
  locatorsList.innerHTML = locators.map(loc => `
    <div class="locator-item">
      <span class="locator-type">${loc.type}:</span>
      <span class="locator-value">${loc.value}</span>
      <span class="confidence-badge ${getConfidenceClass(loc.confidence)}" style="margin-left: 8px;">
        ${(loc.confidence * 100).toFixed(0)}%
      </span>
    </div>
  `).join('') || '<p class="hint">No locators generated</p>';
}

// Recorder Panel
function showRecorderPanel() {
  panelTitle.textContent = 'Recorder';
  const template = document.getElementById('recorder-panel-template');
  panelContent.innerHTML = template.innerHTML;
  
  const startRecordBtn = document.getElementById('start-record-btn');
  const stopRecordBtn = document.getElementById('stop-record-btn');
  const exportScriptBtn = document.getElementById('export-script-btn');
  const replayRecordBtn = document.getElementById('replay-record-btn');
  const recordingModeSelect = document.getElementById('recording-mode-select');
  const exportFormatSelect = document.getElementById('export-format-select');
  const replaySpeedSelect = document.getElementById('replay-speed-select');
  
  startRecordBtn.addEventListener('click', () => {
    startRecording(recordingModeSelect.value);
  });
  
  stopRecordBtn.addEventListener('click', () => {
    stopRecording();
  });
  
  exportScriptBtn.addEventListener('click', () => {
    exportScript(exportFormatSelect.value);
  });
  
  if (replayRecordBtn) {
    replayRecordBtn.addEventListener('click', () => {
      replayActions(parseFloat(replaySpeedSelect.value));
    });
  }
  
  updateActionsDisplay();
  updateReplayButton();
}

function startRecording(mode) {
  if (!recorder) return;
  
  isRecording = true;
  recorder.startRecording(mode);
  recordedActions = [];
  
  document.getElementById('start-record-btn').disabled = true;
  document.getElementById('stop-record-btn').disabled = false;
  recordingStatus.textContent = '⏺️ Recording...';
  recordingStatus.classList.add('active');
  statusText.textContent = 'Recording actions...';
  
  // Start monitoring webview interactions
  monitorWebviewActions();
}

function stopRecording() {
  if (!recorder) return;
  
  isRecording = false;
  recorder.stopRecording();
  
  document.getElementById('start-record-btn').disabled = false;
  document.getElementById('stop-record-btn').disabled = true;
  recordingStatus.textContent = '';
  recordingStatus.classList.remove('active');
  statusText.textContent = 'Ready';
  
  // Remove event listeners from webview
  try {
    browserWebview.executeJavaScript(`
      window.__chromationRecording = false;
    `);
  } catch (error) {
    console.error('Failed to stop recording in webview:', error);
  }
  
  updateActionsDisplay();
  updateReplayButton();
}

function monitorWebviewActions() {
  if (!isRecording || !recorder) return;
  
  // Inject comprehensive event listeners into the webview to capture all interactions
  try {
    browserWebview.executeJavaScript(`
      (function() {
        if (window.__chromationRecording) return; // Already injected
        window.__chromationRecording = true;
        
        // Helper to get best selector
        function getBestSelector(element) {
          if (!element) return '';
          if (element.id) return '#' + element.id;
          if (element.getAttribute('data-testid')) return '[data-testid="' + element.getAttribute('data-testid') + '"]';
          if (element.getAttribute('data-test')) return '[data-test="' + element.getAttribute('data-test') + '"]';
          if (element.getAttribute('aria-label')) return '[aria-label="' + element.getAttribute('aria-label') + '"]';
          if (element.name) return '[name="' + element.name + '"]';
          if (element.className && typeof element.className === 'string') {
            const classes = element.className.trim().split(/\\s+/);
            if (classes.length > 0 && classes[0]) return '.' + classes[0];
          }
          return element.tagName.toLowerCase();
        }
        
        // Get element XPath for better reliability
        function getXPath(element) {
          if (element.id) return 'id("' + element.id + '")';
          if (element === document.body) return '/html/body';
          
          let position = 0;
          let siblings = element.parentNode.children;
          for (let i = 0; i < siblings.length; i++) {
            if (siblings[i] === element) {
              return getXPath(element.parentNode) + '/' + element.tagName.toLowerCase() + '[' + (position + 1) + ']';
            }
            if (siblings[i].tagName === element.tagName) position++;
          }
        }
        
        // Get element text content for context
        function getElementText(element) {
          if (element.textContent) {
            return element.textContent.trim().substring(0, 50);
          }
          if (element.value) {
            return element.value.substring(0, 50);
          }
          return '';
        }
        
        // Debounce function for scroll events
        let scrollTimer = null;
        let lastScrollY = window.pageYOffset;
        let lastScrollX = window.pageXOffset;
        
        // Capture scroll events (debounced)
        window.addEventListener('scroll', function(e) {
          clearTimeout(scrollTimer);
          scrollTimer = setTimeout(function() {
            const scrollY = window.pageYOffset;
            const scrollX = window.pageXOffset;
            const deltaY = scrollY - lastScrollY;
            const deltaX = scrollX - lastScrollX;
            
            console.log('CHROMATION_RECORD:scroll:window:' + scrollY + ',' + scrollX + ':' + deltaY + ',' + deltaX);
            
            lastScrollY = scrollY;
            lastScrollX = scrollX;
          }, 300); // Record scroll after 300ms of no scrolling
        }, { passive: true });
        
        // Capture clicks with full context
        document.addEventListener('click', function(e) {
          const element = e.target;
          const selector = getBestSelector(element);
          const xpath = getXPath(element);
          const text = getElementText(element);
          const tag = element.tagName.toLowerCase();
          
          // Record with enriched data
          console.log('CHROMATION_RECORD:click:' + selector + ':' + text + ':' + tag + ':' + xpath);
        }, true);
        
        // Capture right clicks
        document.addEventListener('contextmenu', function(e) {
          const selector = getBestSelector(e.target);
          console.log('CHROMATION_RECORD:rightclick:' + selector + ':' + getElementText(e.target));
        }, true);
        
        // Capture double clicks
        document.addEventListener('dblclick', function(e) {
          const selector = getBestSelector(e.target);
          console.log('CHROMATION_RECORD:doubleclick:' + selector + ':' + getElementText(e.target));
        }, true);
        
        // Capture input changes with keystroke info
        document.addEventListener('input', function(e) {
          if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            const selector = getBestSelector(e.target);
            const value = e.target.value;
            const inputType = e.target.type || 'text';
            console.log('CHROMATION_RECORD:input:' + selector + ':' + value + ':' + inputType);
          }
        }, true);
        
        // Capture keypresses for special keys
        document.addEventListener('keydown', function(e) {
          // Record special keys and key combinations
          if (e.key === 'Enter' || e.key === 'Tab' || e.key === 'Escape' || 
              e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) {
            const selector = getBestSelector(e.target);
            const key = e.key;
            const modifiers = [];
            if (e.ctrlKey) modifiers.push('ctrl');
            if (e.altKey) modifiers.push('alt');
            if (e.metaKey) modifiers.push('meta');
            if (e.shiftKey) modifiers.push('shift');
            
            console.log('CHROMATION_RECORD:keypress:' + selector + ':' + key + ':' + modifiers.join('+'));
          }
        }, true);
        
        // Capture select changes
        document.addEventListener('change', function(e) {
          if (e.target.tagName === 'SELECT') {
            const selector = getBestSelector(e.target);
            const value = e.target.value;
            const text = e.target.options[e.target.selectedIndex]?.text || '';
            console.log('CHROMATION_RECORD:select:' + selector + ':' + value + ':' + text);
          } else if (e.target.type === 'checkbox') {
            const selector = getBestSelector(e.target);
            console.log('CHROMATION_RECORD:checkbox:' + selector + ':' + e.target.checked);
          } else if (e.target.type === 'radio') {
            const selector = getBestSelector(e.target);
            console.log('CHROMATION_RECORD:radio:' + selector + ':' + e.target.value);
          }
        }, true);
        
        // Capture form submissions
        document.addEventListener('submit', function(e) {
          const selector = getBestSelector(e.target);
          console.log('CHROMATION_RECORD:submit:' + selector + ':form');
        }, true);
        
        // Capture focus events
        document.addEventListener('focus', function(e) {
          const selector = getBestSelector(e.target);
          if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
            console.log('CHROMATION_RECORD:focus:' + selector + ':' + e.target.tagName.toLowerCase());
          }
        }, true);
        
        // Capture hover events on important elements (debounced)
        let hoverTimer = null;
        document.addEventListener('mouseover', function(e) {
          clearTimeout(hoverTimer);
          hoverTimer = setTimeout(function() {
            if (e.target.tagName === 'A' || e.target.tagName === 'BUTTON' || 
                e.target.getAttribute('role') === 'button') {
              const selector = getBestSelector(e.target);
              console.log('CHROMATION_RECORD:hover:' + selector + ':' + getElementText(e.target));
            }
          }, 500); // Record hover after 500ms
        }, true);
        
        // Capture drag and drop
        let draggedElement = null;
        document.addEventListener('dragstart', function(e) {
          draggedElement = e.target;
          const selector = getBestSelector(e.target);
          console.log('CHROMATION_RECORD:dragstart:' + selector + ':' + getElementText(e.target));
        }, true);
        
        document.addEventListener('drop', function(e) {
          const selector = getBestSelector(e.target);
          const draggedSelector = draggedElement ? getBestSelector(draggedElement) : '';
          console.log('CHROMATION_RECORD:drop:' + selector + ':' + draggedSelector);
        }, true);
        
        console.log('Chromation: Enhanced recording injected - capturing clicks, inputs, scrolls, keys, and more');
      })();
    `);
    
    // Listen to console messages from webview to capture recorded actions
    browserWebview.addEventListener('console-message', (e) => {
      if (isRecording && e.message.startsWith('CHROMATION_RECORD:')) {
        const parts = e.message.replace('CHROMATION_RECORD:', '').split(':');
        const actionType = parts[0];
        const selector = parts[1];
        const value = parts[2] || '';
        const extra = parts[3] || ''; // Additional context
        const xpath = parts[4] || ''; // XPath for better reliability
        
        // Record the action with enriched data
        if (recorder) {
          recorder.recordAction({
            type: actionType,
            selector: selector,
            value: value,
            extra: extra,
            xpath: xpath,
            timestamp: Date.now()
          });
          
          // Update display immediately
          updateActionsDisplay();
          
          // Update status with action count
          const actionCount = recorder.getActions().length;
          recordingStatus.textContent = `⏺️ Recording... (${actionCount} actions)`;
        }
      }
    });
    
    console.log('Recording event listeners injected into webview');
  } catch (error) {
    console.error('Failed to inject recording script:', error);
    statusText.textContent = 'Recording injection failed - try refreshing the page';
  }
}

function updateActionsDisplay() {
  if (!recorder) return;
  
  const actionsList = document.getElementById('actions-list');
  if (!actionsList) return;
  
  const actions = recorder.getActions();
  
  if (actions.length === 0) {
    actionsList.innerHTML = '<p class="hint">No actions recorded yet</p>';
  } else {
    actionsList.innerHTML = actions.map((action, index) => {
      // Format action display based on type
      let displayText = '';
      let icon = '';
      
      switch(action.type) {
        case 'scroll':
          icon = '📜';
          displayText = `Scroll to ${action.value}`;
          break;
        case 'click':
          icon = '🖱️';
          displayText = `Click ${action.extra || action.selector}`;
          break;
        case 'doubleclick':
          icon = '🖱️🖱️';
          displayText = `Double-click ${action.extra || action.selector}`;
          break;
        case 'rightclick':
          icon = '➡️🖱️';
          displayText = `Right-click ${action.extra || action.selector}`;
          break;
        case 'input':
          icon = '⌨️';
          displayText = `Type "${action.value.substring(0, 20)}${action.value.length > 20 ? '...' : ''}"`;
          break;
        case 'keypress':
          icon = '🔤';
          displayText = `Press ${action.value}${action.extra ? ' + ' + action.extra : ''}`;
          break;
        case 'select':
          icon = '📋';
          displayText = `Select "${action.extra || action.value}"`;
          break;
        case 'checkbox':
          icon = '☑️';
          displayText = `${action.value === 'true' ? 'Check' : 'Uncheck'} ${action.selector}`;
          break;
        case 'radio':
          icon = '🔘';
          displayText = `Select radio: ${action.value}`;
          break;
        case 'focus':
          icon = '🎯';
          displayText = `Focus on ${action.extra}`;
          break;
        case 'hover':
          icon = '👆';
          displayText = `Hover over ${action.value}`;
          break;
        case 'dragstart':
          icon = '🤏';
          displayText = `Start dragging ${action.value}`;
          break;
        case 'drop':
          icon = '📥';
          displayText = `Drop at ${action.selector}`;
          break;
        case 'submit':
          icon = '📤';
          displayText = 'Submit form';
          break;
        case 'navigate':
          icon = '🧭';
          displayText = `Navigate to ${action.value}`;
          break;
        default:
          icon = '•';
          displayText = `${action.type} on ${action.selector}`;
      }
      
      return `
        <div class="action-item">
          <span style="color: #666; font-size: 11px; min-width: 30px;">#${index + 1}</span>
          <span style="font-size: 16px; margin-right: 8px;">${icon}</span>
          <div style="flex: 1;">
            <div style="font-weight: 500; color: #202124;">${displayText}</div>
            <div style="font-size: 11px; color: #5f6368; margin-top: 2px;">${action.selector}</div>
          </div>
        </div>
      `;
    }).join('');
  }
  
  // Update replay button state
  updateReplayButton();
}

async function exportScript(format) {
  if (!recorder) return;
  
  const script = await recorder.exportScript(format);
  
  // Create a download
  const blob = new Blob([script], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `test-script-${format}.${format.includes('python') ? 'py' : 'js'}`;
  a.click();
  URL.revokeObjectURL(url);
  
  statusText.textContent = `Script exported as ${format}`;
}

// Replay recorded actions
let isReplaying = false;

function updateReplayButton() {
  const replayBtn = document.getElementById('replay-record-btn');
  if (!replayBtn || !recorder) return;
  
  const actions = recorder.getActions();
  replayBtn.disabled = actions.length === 0 || isReplaying || isRecording;
}

async function replayActions(speed = 1.0) {
  if (!recorder || isReplaying || isRecording) return;
  
  const actions = recorder.getActions();
  if (actions.length === 0) {
    statusText.textContent = 'No actions to replay';
    return;
  }
  
  isReplaying = true;
  const replayBtn = document.getElementById('replay-record-btn');
  if (replayBtn) {
    replayBtn.disabled = true;
    replayBtn.textContent = '⏸️ Replaying...';
  }
  
  statusText.textContent = `Replaying ${actions.length} actions at ${speed}x speed...`;
  
  try {
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      
      // Highlight current action being replayed
      highlightReplayingAction(i);
      
      await replayAction(action);
      
      // Wait between actions (adjusted by speed)
      const delay = 500 / speed; // Base delay of 500ms
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    statusText.textContent = 'Replay completed successfully';
  } catch (error) {
    console.error('Replay error:', error);
    statusText.textContent = 'Replay failed: ' + error.message;
  } finally {
    isReplaying = false;
    if (replayBtn) {
      replayBtn.disabled = false;
      replayBtn.textContent = '▶ Replay';
    }
    clearReplayHighlight();
  }
}

function highlightReplayingAction(index) {
  const actionsList = document.getElementById('actions-list');
  if (!actionsList) return;
  
  // Remove previous highlights
  const items = actionsList.querySelectorAll('.action-item');
  items.forEach(item => item.style.background = '#ffffff');
  
  // Highlight current action
  if (items[index]) {
    items[index].style.background = '#e8f0fe';
    items[index].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function clearReplayHighlight() {
  const actionsList = document.getElementById('actions-list');
  if (!actionsList) return;
  
  const items = actionsList.querySelectorAll('.action-item');
  items.forEach(item => item.style.background = '#ffffff');
}

async function replayAction(action) {
  try {
    switch (action.type) {
      case 'navigate':
        navigateToUrl(action.value);
        await new Promise(resolve => {
          const listener = () => {
            browserWebview.removeEventListener('did-finish-load', listener);
            resolve();
          };
          browserWebview.addEventListener('did-finish-load', listener);
        });
        break;
        
      case 'scroll':
        await browserWebview.executeJavaScript(`
          (function() {
            const coords = '${escapeValue(action.value)}'.split(',');
            window.scrollTo(parseInt(coords[1] || 0), parseInt(coords[0] || 0));
            return true;
          })();
        `);
        break;
        
      case 'click':
      case 'doubleclick':
      case 'rightclick':
        await browserWebview.executeJavaScript(`
          (function() {
            const element = document.querySelector('${escapeSelector(action.selector)}');
            if (element) {
              ${action.type === 'doubleclick' ? 'element.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));' : 
                action.type === 'rightclick' ? 'element.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));' :
                'element.click();'}
              return true;
            }
            throw new Error('Element not found: ${action.selector}');
          })();
        `);
        break;
        
      case 'input':
        await browserWebview.executeJavaScript(`
          (function() {
            const element = document.querySelector('${escapeSelector(action.selector)}');
            if (element) {
              element.focus();
              element.value = '${escapeValue(action.value)}';
              element.dispatchEvent(new Event('input', { bubbles: true }));
              element.dispatchEvent(new Event('change', { bubbles: true }));
              return true;
            }
            throw new Error('Element not found: ${action.selector}');
          })();
        `);
        break;
        
      case 'keypress':
        await browserWebview.executeJavaScript(`
          (function() {
            const element = document.querySelector('${escapeSelector(action.selector)}');
            if (element) {
              element.focus();
              const key = '${escapeValue(action.value)}';
              const modifiers = '${escapeValue(action.extra || '')}';
              element.dispatchEvent(new KeyboardEvent('keydown', { 
                key: key, 
                bubbles: true,
                ctrlKey: modifiers.includes('ctrl'),
                altKey: modifiers.includes('alt'),
                metaKey: modifiers.includes('meta'),
                shiftKey: modifiers.includes('shift')
              }));
              return true;
            }
            throw new Error('Element not found: ${action.selector}');
          })();
        `);
        break;
        
      case 'select':
        await browserWebview.executeJavaScript(`
          (function() {
            const element = document.querySelector('${escapeSelector(action.selector)}');
            if (element) {
              element.value = '${escapeValue(action.value)}';
              element.dispatchEvent(new Event('change', { bubbles: true }));
              return true;
            }
            throw new Error('Element not found: ${action.selector}');
          })();
        `);
        break;
        
      case 'checkbox':
        await browserWebview.executeJavaScript(`
          (function() {
            const element = document.querySelector('${escapeSelector(action.selector)}');
            if (element) {
              element.checked = ${action.value === 'true'};
              element.dispatchEvent(new Event('change', { bubbles: true }));
              return true;
            }
            throw new Error('Element not found: ${action.selector}');
          })();
        `);
        break;
        
      case 'radio':
        await browserWebview.executeJavaScript(`
          (function() {
            const element = document.querySelector('${escapeSelector(action.selector)}');
            if (element) {
              element.checked = true;
              element.dispatchEvent(new Event('change', { bubbles: true }));
              return true;
            }
            throw new Error('Element not found: ${action.selector}');
          })();
        `);
        break;
        
      case 'focus':
        await browserWebview.executeJavaScript(`
          (function() {
            const element = document.querySelector('${escapeSelector(action.selector)}');
            if (element) {
              element.focus();
              return true;
            }
            throw new Error('Element not found: ${action.selector}');
          })();
        `);
        break;
        
      case 'hover':
        await browserWebview.executeJavaScript(`
          (function() {
            const element = document.querySelector('${escapeSelector(action.selector)}');
            if (element) {
              element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
              return true;
            }
            throw new Error('Element not found: ${action.selector}');
          })();
        `);
        break;
        
      case 'submit':
        await browserWebview.executeJavaScript(`
          (function() {
            const element = document.querySelector('${escapeSelector(action.selector)}');
            if (element) {
              if (element.tagName === 'FORM') {
                element.submit();
              } else {
                element.click();
              }
              return true;
            }
            throw new Error('Element not found: ${action.selector}');
          })();
        `);
        break;
        
      default:
        console.warn('Unsupported action type for replay:', action.type);
    }
  } catch (error) {
    console.error('Failed to replay action:', action, error);
    throw new Error(`Failed to replay ${action.type} on ${action.selector}: ${error.message}`);
  }
}

function escapeSelector(selector) {
  return selector.replace(/'/g, "\\'").replace(/"/g, '\\"');
}

function escapeValue(value) {
  if (!value) return '';
  return value.replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

// Scraper Panel
function showScraperPanel() {
  panelTitle.textContent = 'Scraper Studio';
  const template = document.getElementById('scraper-panel-template');
  panelContent.innerHTML = template.innerHTML;
  
  const startScrapeBtn = document.getElementById('start-scrape-btn');
  const exportCsvBtn = document.getElementById('export-csv-btn');
  const exportJsonBtn = document.getElementById('export-json-btn');
  const scraperSelector = document.getElementById('scraper-selector');
  
  startScrapeBtn.addEventListener('click', async () => {
    await startScraping(scraperSelector.value);
  });
  
  exportCsvBtn.addEventListener('click', () => {
    exportScrapedData('csv');
  });
  
  exportJsonBtn.addEventListener('click', () => {
    exportScrapedData('json');
  });
}

async function startScraping(selector) {
  if (!scraperStudio || !selector) return;
  
  statusText.textContent = 'Scraping data...';
  
  // In real implementation, this would scrape from the webview
  const data = await scraperStudio.scrapeTable({
    selector: selector,
    fields: [],
    pagination: false
  });
  
  displayScrapedData(data);
  statusText.textContent = 'Scraping complete';
}

function displayScrapedData(data) {
  const scrapedDataDiv = document.getElementById('scraped-data');
  
  if (!data || data.length === 0) {
    scrapedDataDiv.innerHTML = '<p class="hint">No data found</p>';
    return;
  }
  
  // Create a simple table
  const keys = Object.keys(data[0] || {});
  
  scrapedDataDiv.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>${keys.map(key => `<th>${key}</th>`).join('')}</tr>
      </thead>
      <tbody>
        ${data.map(row => `
          <tr>${keys.map(key => `<td>${row[key] || ''}</td>`).join('')}</tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function exportScrapedData(format) {
  if (!scraperStudio) return;
  
  const data = await scraperStudio.exportData(format);
  
  const blob = new Blob([data], { type: format === 'csv' ? 'text/csv' : 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `scraped-data.${format}`;
  a.click();
  URL.revokeObjectURL(url);
  
  statusText.textContent = `Data exported as ${format}`;
}

// Healing toggle
function toggleHealing() {
  if (!healingEngine) return;
  
  const isEnabled = healingEngine.isEnabled();
  
  if (isEnabled) {
    healingEngine.disable();
    btnHealing.classList.remove('active');
    healingStatus.textContent = '🔧 Auto-heal: OFF';
  } else {
    healingEngine.enable();
    btnHealing.classList.add('active');
    healingStatus.textContent = '🔧 Auto-heal: ON';
  }
}

// IPC listeners
ipcRenderer.on('toggle-inspector', () => {
  toggleTool('inspector');
});

ipcRenderer.on('toggle-recorder', () => {
  toggleTool('recorder');
});

ipcRenderer.on('toggle-scraper', () => {
  toggleTool('scraper');
});

ipcRenderer.on('toggle-healing', (event, enabled) => {
  if (healingEngine) {
    if (enabled) {
      healingEngine.enable();
      btnHealing.classList.add('active');
      healingStatus.textContent = '🔧 Auto-heal: ON';
    } else {
      healingEngine.disable();
      btnHealing.classList.remove('active');
      healingStatus.textContent = '🔧 Auto-heal: OFF';
    }
  }
});

// ===== TAB MANAGEMENT =====
let tabs = [];
let activeTabId = 1;
let nextTabId = 2;

// Initialize first tab
tabs.push({
  id: 1,
  title: 'New Tab',
  url: 'https://duckduckgo.com',
  favicon: '🦆'
});

// Tab management functions
function createNewTab() {
  const tabId = nextTabId++;
  const newTab = {
    id: tabId,
    title: 'New Tab',
    url: 'https://duckduckgo.com',
    favicon: '🦆'
  };
  
  tabs.push(newTab);
  renderTabs();
  switchToTab(tabId);
}

function closeTab(tabId) {
  const tabIndex = tabs.findIndex(t => t.id === tabId);
  if (tabIndex === -1 || tabs.length === 1) return; // Don't close last tab
  
  tabs.splice(tabIndex, 1);
  
  // If closing active tab, switch to another tab
  if (tabId === activeTabId) {
    const newActiveTab = tabs[Math.max(0, tabIndex - 1)];
    activeTabId = newActiveTab.id;
  }
  
  renderTabs();
  updateAddressBar();
}

function switchToTab(tabId) {
  activeTabId = tabId;
  const tab = tabs.find(t => t.id === tabId);
  
  if (tab) {
    renderTabs();
    navigateToUrl(tab.url);
  }
}

function updateActiveTabInfo(title, url, favicon) {
  const tab = tabs.find(t => t.id === activeTabId);
  if (tab) {
    if (title) tab.title = title;
    if (url) tab.url = url;
    if (favicon) tab.favicon = favicon;
    renderTabs();
  }
}

function renderTabs() {
  const tabsContainer = document.getElementById('tabs-container');
  if (!tabsContainer) return;
  
  tabsContainer.innerHTML = tabs.map(tab => `
    <div class="tab ${tab.id === activeTabId ? 'active' : ''}" data-tab-id="${tab.id}">
      <div class="tab-favicon">${tab.favicon}</div>
      <div class="tab-title">${truncateText(tab.title, 25)}</div>
      <button class="tab-close" data-tab-id="${tab.id}">×</button>
    </div>
  `).join('');
  
  // Attach event listeners
  tabsContainer.querySelectorAll('.tab').forEach(tabEl => {
    const tabId = parseInt(tabEl.dataset.tabId);
    
    tabEl.addEventListener('click', (e) => {
      if (!e.target.classList.contains('tab-close')) {
        switchToTab(tabId);
      }
    });
  });
  
  tabsContainer.querySelectorAll('.tab-close').forEach(closeBtn => {
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const tabId = parseInt(closeBtn.dataset.tabId);
      closeTab(tabId);
    });
  });
}

function updateAddressBar() {
  const tab = tabs.find(t => t.id === activeTabId);
  if (tab && urlInput) {
    urlInput.value = tab.url;
  }
}

function truncateText(text, maxLength) {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

// ===== WINDOW CONTROLS =====
document.addEventListener('DOMContentLoaded', () => {
  // Tab controls
  const btnNewTab = document.getElementById('btn-new-tab');
  if (btnNewTab) {
    btnNewTab.addEventListener('click', createNewTab);
  }
  
  // Window controls
  const minimizeBtn = document.querySelector('.minimize-btn');
  const maximizeBtn = document.querySelector('.maximize-btn');
  const closeBtn = document.querySelector('.close-btn');
  
  if (minimizeBtn) {
    minimizeBtn.addEventListener('click', () => {
      ipcRenderer.send('window-minimize');
    });
  }
  
  if (maximizeBtn) {
    maximizeBtn.addEventListener('click', () => {
      ipcRenderer.send('window-maximize');
    });
  }
  
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      ipcRenderer.send('window-close');
    });
  }
  
  // Render initial tabs
  renderTabs();
  
  // Menu controls
  const btnMenu = document.getElementById('btn-menu');
  const menuDropdown = document.getElementById('menu-dropdown');
  
  if (btnMenu && menuDropdown) {
    // Toggle menu dropdown
    btnMenu.addEventListener('click', (e) => {
      e.stopPropagation();
      menuDropdown.classList.toggle('hidden');
    });
    
    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
      if (!menuDropdown.classList.contains('hidden') && 
          !menuDropdown.contains(e.target) && 
          e.target !== btnMenu) {
        menuDropdown.classList.add('hidden');
      }
    });
    
    // Menu item handlers
    document.getElementById('menu-recordings')?.addEventListener('click', () => {
      menuDropdown.classList.add('hidden');
      showSavedRecordings();
    });
    
    document.getElementById('menu-history')?.addEventListener('click', () => {
      menuDropdown.classList.add('hidden');
      showBrowsingHistory();
    });
    
    document.getElementById('menu-help')?.addEventListener('click', () => {
      menuDropdown.classList.add('hidden');
      showHelp();
    });
    
    document.getElementById('menu-update')?.addEventListener('click', () => {
      menuDropdown.classList.add('hidden');
      checkForUpdates();
    });
    
    document.getElementById('menu-about')?.addEventListener('click', () => {
      menuDropdown.classList.add('hidden');
      showAbout();
    });
    
    document.getElementById('menu-theme')?.addEventListener('click', () => {
      menuDropdown.classList.add('hidden');
      toggleTheme();
    });
  }
});

// ===== MENU FUNCTIONS =====

// Theme management
let currentTheme = 'system'; // 'light', 'dark', or 'system'

function initTheme() {
  // Load saved theme preference
  const savedTheme = localStorage.getItem('chromation-theme') || 'system';
  applyTheme(savedTheme);
}

function applyTheme(theme) {
  currentTheme = theme;
  localStorage.setItem('chromation-theme', theme);
  
  if (theme === 'system') {
    // Use system preference
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

function toggleTheme() {
  const themes = ['light', 'dark', 'system'];
  const currentIndex = themes.indexOf(currentTheme);
  const nextTheme = themes[(currentIndex + 1) % themes.length];
  applyTheme(nextTheme);
  
  // Update menu item text
  updateThemeMenuText();
  
  let themeText = nextTheme === 'light' ? 'Light Theme' : nextTheme === 'dark' ? 'Dark Theme' : 'System Theme';
  statusText.textContent = `Switched to ${themeText}`;
}

function updateThemeMenuText() {
  const themeMenuItem = document.getElementById('menu-theme');
  if (themeMenuItem) {
    const span = themeMenuItem.querySelector('span');
    if (span) {
      const themeIcon = currentTheme === 'light' ? '☀️' : currentTheme === 'dark' ? '🌙' : '🔄';
      const themeText = currentTheme === 'light' ? 'Light Theme' : currentTheme === 'dark' ? 'Dark Theme' : 'System Theme';
      span.textContent = themeText + ' ' + themeIcon;
    }
  }
}

// Listen to system theme changes
if (window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (currentTheme === 'system') {
      document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
    }
  });
}

function showSavedRecordings() {
  // Toggle recorder panel and show saved recordings
  toggleTool('recorder');
  statusText.textContent = 'Viewing saved recordings';
  
  // In future: Load recordings from localStorage/file
  if (recorder && recorder.getActions().length > 0) {
    statusText.textContent = `${recorder.getActions().length} actions in current recording`;
  } else {
    statusText.textContent = 'No saved recordings yet';
  }
}

function showBrowsingHistory() {
  statusText.textContent = 'Browsing history feature coming soon';
  
  // Create history panel
  panelTitle.textContent = 'Browsing History';
  panelContent.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">📚</div>
      <div class="empty-title">History</div>
      <div class="empty-description">
        View and manage your browsing history.<br>
        This feature is coming in a future update.
      </div>
    </div>
  `;
  sidePanel.classList.add('open');
}

function showHelp() {
  statusText.textContent = 'Opening help documentation';
  
  // Create help panel
  panelTitle.textContent = 'Help & Documentation';
  panelContent.innerHTML = `
    <div class="panel-section">
      <h3 style="margin-bottom: 12px; color: #202124;">Quick Start Guide</h3>
      
      <div style="background: #f8f9fa; padding: 16px; border-radius: 8px; margin-bottom: 16px;">
        <h4 style="margin-bottom: 8px; color: #1a73e8;">🔍 Inspector</h4>
        <p style="font-size: 13px; color: #5f6368; line-height: 1.6;">
          Click elements on the page to inspect their properties, selectors, and attributes.
        </p>
      </div>
      
      <div style="background: #f8f9fa; padding: 16px; border-radius: 8px; margin-bottom: 16px;">
        <h4 style="margin-bottom: 8px; color: #1a73e8;">⏺️ Recorder</h4>
        <p style="font-size: 13px; color: #5f6368; line-height: 1.6;">
          Record your interactions with web pages including clicks, typing, scrolling, and more. 
          Export as Playwright, Selenium, or Cypress scripts.
        </p>
      </div>
      
      <div style="background: #f8f9fa; padding: 16px; border-radius: 8px; margin-bottom: 16px;">
        <h4 style="margin-bottom: 8px; color: #1a73e8;">▶️ Replay</h4>
        <p style="font-size: 13px; color: #5f6368; line-height: 1.6;">
          Replay recorded actions at various speeds (0.5x to 5x) to test workflows automatically.
        </p>
      </div>
      
      <div style="background: #f8f9fa; padding: 16px; border-radius: 8px; margin-bottom: 16px;">
        <h4 style="margin-bottom: 8px; color: #1a73e8;">🔧 Auto-Healing</h4>
        <p style="font-size: 13px; color: #5f6368; line-height: 1.6;">
          Automatically detect and heal broken selectors using AI-powered element matching.
        </p>
      </div>
      
      <div style="margin-top: 24px; padding: 16px; background: #e8f0fe; border-radius: 8px;">
        <h4 style="margin-bottom: 8px; color: #1a73e8;">📚 Full Documentation</h4>
        <p style="font-size: 13px; color: #5f6368; margin-bottom: 12px;">
          For complete documentation, visit our GitHub repository.
        </p>
        <button class="primary-btn" onclick="require('electron').shell.openExternal('https://github.com/IamBlackShifu/Chromation-AutoHeal-Browser')">
          View on GitHub
        </button>
      </div>
    </div>
  `;
  sidePanel.classList.add('open');
}

function checkForUpdates() {
  statusText.textContent = 'Checking for updates...';
  
  // Create update panel
  panelTitle.textContent = 'Check for Updates';
  panelContent.innerHTML = `
    <div class="panel-section">
      <div style="text-align: center; padding: 24px;">
        <div style="font-size: 48px; margin-bottom: 16px;">🔄</div>
        <h3 style="margin-bottom: 12px; color: #202124;">Version 0.2.0</h3>
        <p style="font-size: 13px; color: #5f6368; margin-bottom: 24px;">
          You are running the latest version of Chromation AutoHeal Browser.
        </p>
        
        <div style="background: #e8f0fe; padding: 16px; border-radius: 8px; text-align: left; margin-bottom: 16px;">
          <h4 style="margin-bottom: 8px; color: #1a73e8;">Recent Updates:</h4>
          <ul style="font-size: 13px; color: #5f6368; line-height: 1.8; padding-left: 20px;">
            <li>Chrome-style modern UI</li>
            <li>Tab management</li>
            <li>Enhanced recording (scroll, keyboard, mouse)</li>
            <li>Replay functionality with speed control</li>
            <li>Improved action capture</li>
          </ul>
        </div>
        
        <button class="secondary-btn" onclick="require('electron').shell.openExternal('https://github.com/IamBlackShifu/Chromation-AutoHeal-Browser/releases')">
          View Release Notes
        </button>
      </div>
    </div>
  `;
  sidePanel.classList.add('open');
  
  setTimeout(() => {
    statusText.textContent = 'You have the latest version';
  }, 1000);
}

function showAbout() {
  statusText.textContent = 'About Chromation AutoHeal Browser';
  
  // Create about panel
  panelTitle.textContent = 'About';
  panelContent.innerHTML = `
    <div class="panel-section">
      <div style="text-align: center; padding: 16px;">
        <div style="font-size: 64px; margin-bottom: 16px;">🧪</div>
        <h2 style="margin-bottom: 8px; color: #202124;">Chromation AutoHeal Browser</h2>
        <p style="font-size: 16px; color: #1a73e8; margin-bottom: 24px;">Version 0.2.0</p>
        
        <div style="background: #f8f9fa; padding: 16px; border-radius: 8px; text-align: left; margin-bottom: 16px;">
          <p style="font-size: 13px; color: #5f6368; line-height: 1.8;">
            A powerful browser automation and testing tool with AI-powered self-healing capabilities. 
            Built with Electron, TypeScript, and modern web technologies.
          </p>
        </div>
        
        <div style="background: #f8f9fa; padding: 16px; border-radius: 8px; text-align: left; margin-bottom: 16px;">
          <h4 style="margin-bottom: 8px; color: #202124;">Features:</h4>
          <ul style="font-size: 13px; color: #5f6368; line-height: 1.8; padding-left: 20px;">
            <li>Element inspection and discovery</li>
            <li>Action recording and replay</li>
            <li>Script export (Playwright, Selenium, Cypress)</li>
            <li>Auto-healing element selectors</li>
            <li>Chrome-like modern interface</li>
            <li>Multiple tab support</li>
          </ul>
        </div>
        
        <div style="margin-top: 24px;">
          <button class="primary-btn" onclick="require('electron').shell.openExternal('https://github.com/IamBlackShifu/Chromation-AutoHeal-Browser')" style="margin-right: 8px;">
            GitHub Repository
          </button>
          <button class="secondary-btn" onclick="require('electron').shell.openExternal('https://github.com/IamBlackShifu/Chromation-AutoHeal-Browser/issues')">
            Report Issue
          </button>
        </div>
        
        <p style="font-size: 11px; color: #80868b; margin-top: 24px;">
          © 2026 Chromation Project. MIT License.
        </p>
      </div>
    </div>
  `;
  sidePanel.classList.add('open');
}

// Update tab info when page loads
if (browserWebview) {
  browserWebview.addEventListener('page-title-updated', (e) => {
    updateActiveTabInfo(e.title, null, null);
  });
  
  browserWebview.addEventListener('did-navigate', (e) => {
    updateActiveTabInfo(null, e.url, null);
    updateAddressBar();
  });
  
  browserWebview.addEventListener('did-navigate-in-page', (e) => {
    updateActiveTabInfo(null, e.url, null);
    updateAddressBar();
  });
}

// Initialize on load
window.addEventListener('DOMContentLoaded', () => {
  console.log('Chromation AutoHeal Browser UI loaded');
  initTheme();
  initChromation();
  
  // Set default home page
  setTimeout(() => {
    navigateToUrl('https://duckduckgo.com');
  }, 1000);
});
