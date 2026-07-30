/**
 * Chromation AutoHeal Browser - Renderer Process
 * Handles UI interactions and communication with main process
 */

const ipcRenderer = window.chromationAPI.ipc;

// Initialize the browser engine
let chromationBrowser;
let inspector, recorder, healingEngine, scraperStudio, reporter, testProject, shortcutManager, suiteManager;
let testGenerator, runScheduler, currentGeneratedDraft;
let pluginManager;
let isRecording = false;
let isInspecting = false;
let recordedActions = [];
let uploadSelectionInProgress = false;
let selectedStepIndex = null;
let activeStepFilter = 'all';
let stepSearchQuery = '';
let executionElapsedTimer = null;
let runHistoryHydrated = false;

function normalizeRecordedActions(actions) {
  if (!Array.isArray(actions)) return [];

  return actions
    .filter((action) => action && typeof action.type === 'string')
    .map((action) => ({
      ...action,
      selector: typeof action.selector === 'string' ? action.selector : '',
      timestamp: Number.isFinite(action.timestamp) ? action.timestamp : Date.now(),
      locatorFingerprint:
        action.locatorFingerprint &&
        typeof action.locatorFingerprint.tagName === 'string' &&
        action.locatorFingerprint.attributes &&
        typeof action.locatorFingerprint.attributes === 'object'
          ? action.locatorFingerprint
          : undefined,
    }));
}

function escapeReportText(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

// DOM elements
const urlInput = document.getElementById('url-input');
const browserWebview = document.getElementById('browser-webview');
const browserView = document.getElementById('browser-view');
const reportWorkspace = document.getElementById('report-workspace');
const reportWorkspaceContent = document.getElementById('report-workspace-content');
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

document.addEventListener('click', (event) => {
  const external = event.target.closest('[data-external-url]');
  if (external) {
    window.chromationAPI.openExternal(external.dataset.externalUrl);
    return;
  }
  const reportExport = event.target.closest('[data-report-format]');
  if (reportExport) {
    exportReplayReport(reportExport.dataset.reportFormat);
    return;
  }
  const exportAll = event.target.closest('[data-export-all-reports]');
  if (exportAll) {
    exportAllReplayReports();
    return;
  }
  const tool = event.target.closest('[data-open-tool]');
  if (tool) {
    toggleTool(tool.dataset.openTool);
  }
});

// Tool buttons (now in menu)
const btnClosePanel = document.getElementById('btn-close-panel');

// Initialize Chromation Browser
async function initChromation() {
  try {
    chromationBrowser = window.chromationAPI;
    await chromationBrowser.initialize();
    
    inspector = {
      startInspection: chromationBrowser.inspector.start,
      stopInspection: chromationBrowser.inspector.stop,
    };
    recorder = {
      startRecording: chromationBrowser.recorder.start,
      stopRecording: chromationBrowser.recorder.stop,
      recordAction: chromationBrowser.recorder.record,
      getActions: chromationBrowser.recorder.getActions,
      updateLastAction: chromationBrowser.recorder.updateLastAction,
      updateAction: chromationBrowser.recorder.updateAction,
      duplicateAction: chromationBrowser.recorder.duplicateAction,
      deleteAction: chromationBrowser.recorder.deleteAction,
      moveAction: chromationBrowser.recorder.moveAction,
      setActionDisabled: chromationBrowser.recorder.setActionDisabled,
      setActions: chromationBrowser.recorder.setActions,
      exportScript: chromationBrowser.recorder.exportScript,
      clearActions: chromationBrowser.recorder.clear,
    };
    healingEngine = chromationBrowser.healing;
    scraperStudio = chromationBrowser.scraper;
    reporter = chromationBrowser.reporter;
    testProject = chromationBrowser.project;
    shortcutManager = chromationBrowser.shortcuts;
    suiteManager = chromationBrowser.suites;
    testGenerator = chromationBrowser.generation;
    runScheduler = chromationBrowser.scheduler;
    pluginManager = chromationBrowser.plugins;
    
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
    
    // Add page load wait assertion
    const pageLoadListener = () => {
      if (isRecording && recorder) {
        recorder.recordAction({
          type: 'waitForPageLoad',
          selector: 'window',
          value: url,
          extra: 'Page loaded successfully',
          timestamp: Date.now()
        });
        updateActionsDisplay();
      }
      browserWebview.removeEventListener('did-finish-load', pageLoadListener);
    };
    
    browserWebview.addEventListener('did-finish-load', pageLoadListener);
    
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
  showHomeWorkspace();
});

// Close panel button
btnClosePanel.addEventListener('click', () => {
  closePanel();
});

// Toggle tools
function toggleTool(tool) {
  homeWorkspace?.classList.add('hidden');
  reportWorkspace?.classList.add('hidden');
  browserView?.classList.remove('hidden');
  // Activate selected tool
  const isOpen = sidePanel.classList.contains('open');
  const isSameTool = sidePanel.dataset.currentTool === tool;
  
  if (isOpen && isSameTool) {
    closePanel();
    return;
  }
  
  sidePanel.dataset.currentTool = tool;
  setActiveRailAction(tool);
  
  switch (tool) {
    case 'inspector':
      showInspectorPanel();
      break;
    case 'recorder':
      showRecorderPanel();
      break;
    case 'scraper':
      showScraperPanel();
      break;
  }
  
  sidePanel.classList.add('open');
  const tab = tabs?.find?.((item) => item.id === activeTabId);
  if (tab) tab.uiState = { ...(tab.uiState || {}), activeTool: tool, panelOpen: true };
}

function closePanel() {
  sidePanel.classList.remove('open');
  setActiveRailAction('browse');
  const tab = tabs?.find?.((item) => item.id === activeTabId);
  if (tab) tab.uiState = { ...(tab.uiState || {}), activeTool: null, panelOpen: false };
  
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
  const exportExcelBtn = document.getElementById('export-excel-btn');
  const cancelScrapeBtn = document.getElementById('cancel-scrape-btn');
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

async function refreshP1AuthoringSummary() {
  const summary = document.getElementById('project-summary');
  if (summary && testProject) {
    const project = await testProject.export();
    summary.textContent = `${Object.keys(project.variables).length} variables · ${project.environments.length} environments · ${Object.keys(project.flows).length} flows · ${Object.keys(project.hooks).length} hooks`;
  }
  const healingSummary = document.getElementById('healing-history-summary');
  if (healingSummary && healingEngine?.compareHistory) {
    const comparisons = await healingEngine.compareHistory();
    healingSummary.textContent = comparisons.length
      ? comparisons.map((item) => `${item.selector}: ${item.attempts} attempts · ${Math.round(item.averageConfidence * 100)}% average`).join('\n')
      : 'No healing history yet.';
  }
}

function setActiveRailAction(value) {
  document.querySelectorAll('.rail-action').forEach((button) => {
    button.classList.toggle('active', button.dataset.tool === value || button.dataset.workspace === value || button.dataset.action === value);
  });
}

function initializeP1AuthoringControls(healingPolicySelect) {
  if (!testProject) return;
  document.getElementById('add-project-variable-btn')?.addEventListener('click', async () => {
    const name = document.getElementById('project-variable-name')?.value.trim();
    const value = document.getElementById('project-variable-value')?.value ?? '';
    if (!name) return showToast('Enter a variable name', 'error');
    await testProject.setVariable(name, value);
    await refreshP1AuthoringSummary();
    showToast(`Variable ${name} saved`, 'success');
  });
  document.getElementById('save-environment-btn')?.addEventListener('click', async () => {
    const name = document.getElementById('environment-name')?.value.trim();
    const baseUrl = document.getElementById('environment-base-url')?.value.trim();
    if (!name) return showToast('Enter an environment name', 'error');
    await testProject.setEnvironment({ name, baseUrl: baseUrl || undefined, values: {} });
    await refreshP1AuthoringSummary();
    showToast(`Environment ${name} saved`, 'success');
  });
  document.getElementById('save-flow-btn')?.addEventListener('click', async () => {
    const name = document.getElementById('reusable-flow-name')?.value.trim();
    if (!name) return showToast('Enter a reusable flow name', 'error');
    await testProject.setFlow(name, await recorder.getActions());
    await refreshP1AuthoringSummary();
    showToast(`Reusable flow ${name} saved`, 'success');
  });
  document.getElementById('save-hook-btn')?.addEventListener('click', async () => {
    const hook = document.getElementById('hook-name')?.value;
    await testProject.setHook(hook, await recorder.getActions());
    await refreshP1AuthoringSummary();
    showToast(`${hook} hook saved`, 'success');
  });
  if (healingPolicySelect && healingEngine) {
    Promise.resolve(healingEngine.getApprovalPolicy()).then((policy) => { healingPolicySelect.value = policy; });
    healingPolicySelect.addEventListener('change', () => {
      healingEngine.setApprovalPolicy(healingPolicySelect.value);
      showToast(`Healing policy: ${healingPolicySelect.value}`, 'success');
    });
  }
  refreshP1AuthoringSummary();
  const refreshShortcuts = async () => {
    const target = document.getElementById('shortcut-reference');
    if (target && shortcutManager) {
      const reference = await shortcutManager.reference();
      target.textContent = reference.map((item) => `${item.keys} — ${item.description} (${item.command})`).join('\n');
    }
  };
  document.getElementById('save-shortcut-btn')?.addEventListener('click', async () => {
    const command = document.getElementById('shortcut-command')?.value.trim();
    const keys = document.getElementById('shortcut-keys')?.value.trim();
    const description = document.getElementById('shortcut-description')?.value.trim();
    if (!command || !keys || !description) return showToast('Complete all shortcut fields', 'error');
    try {
      await shortcutManager.set({ command, keys, description });
      await refreshShortcuts();
      showToast('Shortcut saved', 'success');
    } catch (error) { showToast(error.message, 'error'); }
  });
  refreshShortcuts();
  initializeSuiteControls();
  initializeAdvancedP2Controls();
}

async function initializeAdvancedP2Controls() {
  const preview = document.getElementById('generated-test-preview');
  const approve = document.getElementById('approve-generated-test-btn');
  const reject = document.getElementById('reject-generated-test-btn');
  document.getElementById('generate-test-btn')?.addEventListener('click', async () => {
    const prompt = document.getElementById('generation-prompt')?.value.trim();
    if (!prompt) return showToast('Describe the test to generate', 'error');
    currentGeneratedDraft = await testGenerator.generate(prompt);
    if (preview) preview.textContent = JSON.stringify(currentGeneratedDraft.actions, null, 2);
    approve.disabled = false; reject.disabled = false;
  });
  approve?.addEventListener('click', async () => {
    if (!currentGeneratedDraft) return;
    await testGenerator.approve(currentGeneratedDraft.id, 'Approved in Recorder');
    recorder.setActions(await testGenerator.executableActions(currentGeneratedDraft.id));
    updateActionsDisplay();
    approve.disabled = true; reject.disabled = true;
    showToast('Generated test approved and loaded', 'success');
  });
  reject?.addEventListener('click', async () => {
    if (!currentGeneratedDraft) return;
    await testGenerator.reject(currentGeneratedDraft.id, 'Rejected in Recorder');
    if (preview) preview.textContent = 'Draft rejected. No actions were loaded.';
    approve.disabled = true; reject.disabled = true;
  });
  const refreshSchedules = async () => {
    const target = document.getElementById('schedule-summary');
    if (!target || !runScheduler) return;
    const schedules = await runScheduler.list();
    target.textContent = schedules.length ? schedules.map((schedule) =>
      `${schedule.name} · every ${schedule.intervalMinutes} min · next ${new Date(schedule.nextRunAt).toLocaleString()}`
    ).join('\n') : 'No schedules configured.';
  };
  document.getElementById('create-schedule-btn')?.addEventListener('click', async () => {
    const name = document.getElementById('schedule-name')?.value.trim();
    const interval = Number(document.getElementById('schedule-interval')?.value || 0);
    const suiteId = document.getElementById('suite-select')?.value;
    if (!name || !suiteId) return showToast('Enter a schedule name and select a suite', 'error');
    await runScheduler.create(name, interval, { suiteId, headless: true });
    await refreshSchedules();
    showToast('Headless schedule created', 'success');
  });
  refreshSchedules();
}

async function initializeSuiteControls() {
  if (!suiteManager) return;
  const select = document.getElementById('suite-select');
  const summary = document.getElementById('suite-selection-summary');
  let suites = [];
  const renderSelection = () => {
    if (!summary) return;
    const suite = suites.find((item) => item.id === select?.value);
    if (!suite) {
      summary.innerHTML = '<span>No suite selected</span><small>Create or choose a suite to add and run tests.</small>';
      return;
    }
    const tags = suite.tags || [];
    summary.innerHTML = `<strong>${escapeReportText(suite.name)}</strong><span>${suite.tests.length} test${suite.tests.length === 1 ? '' : 's'} · ${tags.length ? tags.map((tag) => `#${escapeReportText(tag)}`).join(' ') : 'No tags'}</span>${suite.tests.length ? `<small>${suite.tests.map((test) => escapeReportText(test.name)).join(' · ')}</small>` : '<small>Add the current recording as the first test.</small>'}`;
  };
  const refresh = async () => {
    if (!select) return;
    suites = await suiteManager.list();
    const selected = select.value;
    select.innerHTML = '<option value="">Select a suite</option>' + suites.map((suite) =>
      `<option value="${escapeReportText(suite.id)}">${escapeReportText(suite.name)} (${suite.tests.length})</option>`
    ).join('');
    select.value = selected;
    renderSelection();
  };
  select?.addEventListener('change', renderSelection);
  document.getElementById('suite-help-btn')?.addEventListener('click', () => showHelp('suite'));
  document.getElementById('create-suite-btn')?.addEventListener('click', async () => {
    const name = document.getElementById('suite-name')?.value.trim();
    const tags = String(document.getElementById('suite-tags')?.value || '').split(',').map((tag) => tag.trim()).filter(Boolean);
    if (!name) return showToast('Enter a suite name', 'error');
    const suite = await suiteManager.create(name, { tags });
    await refresh();
    select.value = suite.id;
    showToast(`Suite ${name} created`, 'success');
  });
  document.getElementById('add-suite-test-btn')?.addEventListener('click', async () => {
    const name = document.getElementById('suite-test-name')?.value.trim();
    const tags = String(document.getElementById('suite-test-tags')?.value || '').split(',').map((tag) => tag.trim()).filter(Boolean);
    if (!select?.value || !name) return showToast('Select a suite and enter a test name', 'error');
    const actions = await recorder.getActions();
    if (!actions.length) return showToast('Record or load a test before adding it to a suite', 'warning');
    await suiteManager.addTest(select.value, { name, tags, enabled: true, actions });
    await refresh();
    showToast(`Test ${name} added`, 'success');
  });
  document.getElementById('run-suite-matrix-btn')?.addEventListener('click', async () => {
    if (!select?.value) return showToast('Select a suite', 'error');
    const selectedSuite = (await suiteManager.list()).find((suite) => suite.id === select.value);
    if (!selectedSuite?.tests?.length) return showToast('Add at least one test before running this suite', 'warning');
    const browsers = String(document.getElementById('matrix-browsers')?.value || 'chrome').split(',').map((item) => item.trim()).filter(Boolean);
    const concurrency = Number(document.getElementById('matrix-concurrency')?.value || 2);
    const summary = document.getElementById('matrix-run-summary');
    if (summary) summary.textContent = 'Matrix run in progress…';
    const run = await suiteManager.runMatrix({ text: selectedSuite?.name, enabledOnly: true }, { browser: browsers }, concurrency, { headless: true });
    if (summary) summary.textContent = `${run.summary.total} jobs · ${run.summary.passed} passed · ${run.summary.failed} failed · ${run.durationMs}ms`;
  });
  refresh();
}

function showSuitesWorkspace() {
  showBrowseWorkspace();
  sidePanel.dataset.currentTool = 'suites';
  showRecorderPanel();
  panelTitle.textContent = 'Suites';
  setActiveRailAction('suites');
  sidePanel.classList.add('open');
  const section = document.getElementById('suite-builder-section');
  if (section) {
    section.open = true;
    requestAnimationFrame(() => section.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  }
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
  const pauseReplayBtn = document.getElementById('pause-replay-btn');
  const resumeReplayBtn = document.getElementById('resume-replay-btn');
  const stepReplayBtn = document.getElementById('step-replay-btn');
  const recordingModeSelect = document.getElementById('recording-mode-select');
  const exportFormatSelect = document.getElementById('export-format-select');
  const replayEngineSelect = document.getElementById('replay-engine-select');
  const replayTimeoutInput = document.getElementById('replay-timeout-input');
  const replayRetriesInput = document.getElementById('replay-retries-input');
  const replayContinueOnFailure = document.getElementById('replay-continue-on-failure');
  const reportFormatSelect = document.getElementById('report-format-select');
  const exportReportBtn = document.getElementById('export-report-btn');
  const exportAllReportsBtn = document.getElementById('export-all-reports-btn');
  const runHistoryBtn = document.getElementById('run-history-btn');
  const replaySpeedSelect = document.getElementById('replay-speed-select');
  const addAssertionBtn = document.getElementById('add-assertion-btn');
  const closeStepEditorBtn = document.getElementById('close-step-editor-btn');
  const healingPolicySelect = document.getElementById('healing-policy-select');
  
  // Add save, import buttons dynamically
  const panelSection = panelContent.querySelector('.panel-section:last-child');
  if (panelSection && !document.getElementById('save-record-btn')) {
    const saveImportHTML = `
      <div class="button-group" style="margin-top: 16px;">
        <button id="save-record-btn" class="secondary-btn full-width">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
            <polyline points="17 21 17 13 7 13 7 21"></polyline>
            <polyline points="7 3 7 8 15 8"></polyline>
          </svg>
          Save Recording
        </button>
        <button id="import-record-btn" class="secondary-btn full-width">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="17 8 12 3 7 8"></polyline>
            <line x1="12" y1="3" x2="12" y2="15"></line>
          </svg>
          Import Recording
        </button>
      </div>
    `;
    panelSection.insertAdjacentHTML('beforeend', saveImportHTML);
  }
  
  startRecordBtn.addEventListener('click', () => {
    startRecording(recordingModeSelect.value);
  });
  
  stopRecordBtn.addEventListener('click', () => {
    stopRecording();
  });
  
  exportScriptBtn.addEventListener('click', () => {
    exportScript(exportFormatSelect.value);
  });

  if (exportReportBtn && reportFormatSelect) {
    exportReportBtn.addEventListener('click', () => {
      exportReplayReport(reportFormatSelect.value);
    });
  }

  if (exportAllReportsBtn) {
    exportAllReportsBtn.addEventListener('click', () => {
      exportAllReplayReports();
    });
  }
  
  if (replayRecordBtn) {
    replayRecordBtn.addEventListener('click', () => {
      if (isReplaying) {
        cancelReplay();
        return;
      }
      const policy = {
        timeoutMs: Math.max(1000, parseInt(replayTimeoutInput?.value || '8000', 10) || 8000),
        retries: Math.max(0, parseInt(replayRetriesInput?.value || '1', 10) || 0),
        continueOnFailure: Boolean(replayContinueOnFailure?.checked),
      };
      replayActions(parseFloat(replaySpeedSelect.value), replayEngineSelect?.value || 'webview', policy);
    });
  }
  runHistoryBtn?.addEventListener('click', showRunHistoryPanel);
  pauseReplayBtn?.addEventListener('click', pauseReplay);
  resumeReplayBtn?.addEventListener('click', resumeReplay);
  stepReplayBtn?.addEventListener('click', stepReplay);
  addAssertionBtn?.addEventListener('click', addAssertionStep);
  closeStepEditorBtn?.addEventListener('click', closeStepEditor);
  replayEngineSelect?.addEventListener('change', () => updateReplayEngineGuidance(replayEngineSelect.value));
  updateReplayEngineGuidance(replayEngineSelect?.value || 'webview');
  document.getElementById('step-search-input')?.addEventListener('input', (event) => {
    stepSearchQuery = event.target.value.toLowerCase().trim();
    updateActionsDisplay();
  });
  document.querySelectorAll('[data-step-filter]').forEach((button) => button.addEventListener('click', () => {
    activeStepFilter = button.dataset.stepFilter;
    document.querySelectorAll('[data-step-filter]').forEach((item) => item.classList.toggle('active', item === button));
    updateActionsDisplay();
  }));
  initializeP1AuthoringControls(healingPolicySelect);
  
  // Save recording button
  const saveBtn = document.getElementById('save-record-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      saveRecording();
    });
  }
  
  // Import recording button
  const importBtn = document.getElementById('import-record-btn');
  if (importBtn) {
    importBtn.addEventListener('click', () => {
      importRecording();
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
  currentRecordingFilename = null;
  
  // Automatically record the current URL as the first action
  const currentUrl = browserWebview.getURL();
  if (currentUrl && currentUrl !== 'about:blank') {
    recordedActions.push({
      type: 'navigate',
      selector: 'window',
      value: currentUrl,
      timestamp: Date.now()
    });
    recorder.recordAction({
      type: 'navigate',
      selector: 'window',
      value: currentUrl,
      timestamp: Date.now()
    });
  }
  
  document.getElementById('start-record-btn').disabled = true;
  document.getElementById('stop-record-btn').disabled = false;
  recordingStatus.textContent = '⏺️ Recording...';
  recordingStatus.classList.add('active');
  statusText.textContent = 'Recording actions...';
  
  // Update display to show the initial URL action
  updateActionsDisplay();
  
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
  
  // Clean up navigation listeners
  if (browserWebview._chromationNavListeners) {
    browserWebview._chromationNavListeners.forEach(({ event, handler }) => {
      browserWebview.removeEventListener(event, handler);
    });
    browserWebview._chromationNavListeners = null;
  }
  
  updateActionsDisplay();
  updateReplayButton();
}

function monitorWebviewActions() {
  if (!isRecording || !recorder) return;
  
  // Re-inject recording script when page navigates
  const handlePageNavigation = () => {
    if (isRecording && recorder) {
      console.log('Page navigated, re-injecting recording script...');
      // Small delay to ensure page is ready
      setTimeout(() => {
        injectRecordingScript();
      }, 500);
    }
  };
  
  // Listen for navigation events to re-inject recording script
  browserWebview.addEventListener('did-navigate', handlePageNavigation);
  browserWebview.addEventListener('did-navigate-in-page', handlePageNavigation);
  
  // Store listeners for cleanup
  browserWebview._chromationNavListeners = [
    { event: 'did-navigate', handler: handlePageNavigation },
    { event: 'did-navigate-in-page', handler: handlePageNavigation }
  ];
  
  // Inject the recording script
  injectRecordingScript();
}

function injectRecordingScript() {
  if (!isRecording || !recorder) return;
  
  // Inject comprehensive event listeners into the webview to capture all interactions
  try {
    browserWebview.executeJavaScript(`
      (function() {
        if (window.__chromationRecorderInstalled) {
          window.__chromationRecording = true;
          return;
        }
        window.__chromationRecorderInstalled = true;
        window.__chromationRecording = true;
        
        function cssEscape(value) {
          const normalized = String(value || '');
          return window.CSS && typeof window.CSS.escape === 'function'
            ? window.CSS.escape(normalized)
            : normalized.replace(/[^a-zA-Z0-9_-]/g, function(character) {
                return '\\\\' + character;
              });
        }

        function isGeneratedId(id) {
          return /^(react-aria|html5_|ember|vue-|id_\\d+|\\d+$)/i.test(String(id || '')) ||
            /[a-f0-9]{12,}/i.test(String(id || ''));
        }

        // Build a deterministic CSS path so replay targets the exact recorded element.
        function buildCssPath(element) {
          if (!element || element.nodeType !== Node.ELEMENT_NODE) return '';
          const segments = [];
          let current = element;

          while (current && current.nodeType === Node.ELEMENT_NODE && current.tagName.toLowerCase() !== 'html') {
            let segment = current.tagName.toLowerCase();

            if (current.id && !isGeneratedId(current.id)) {
              segment += '#' + cssEscape(current.id);
              segments.unshift(segment);
              break;
            }

            const siblings = current.parentNode ? Array.from(current.parentNode.children).filter((child) => child.tagName === current.tagName) : [];
            if (siblings.length > 1) {
              const index = siblings.indexOf(current) + 1;
              segment += ':nth-of-type(' + index + ')';
            }

            segments.unshift(segment);
            current = current.parentElement;
          }

          return segments.join(' > ');
        }

        // Helper to get best selector
        function getBestSelector(element) {
          if (!element) return '';

          if (element.getAttribute('data-testid')) {
            const selector = '[data-testid="' + cssEscape(element.getAttribute('data-testid')) + '"]';
            if (document.querySelectorAll(selector).length === 1) {
              return selector;
            }
          }

          if (element.getAttribute('data-test')) {
            const selector = '[data-test="' + cssEscape(element.getAttribute('data-test')) + '"]';
            if (document.querySelectorAll(selector).length === 1) {
              return selector;
            }
          }

          if (element.getAttribute('aria-label')) {
            const selector = element.tagName.toLowerCase() + '[aria-label="' + cssEscape(element.getAttribute('aria-label')) + '"]';
            if (document.querySelectorAll(selector).length === 1) {
              return selector;
            }
          }

          if (element.name) {
            const selector = element.tagName.toLowerCase() + '[name="' + cssEscape(element.name) + '"]';
            if (document.querySelectorAll(selector).length === 1) {
              return selector;
            }
          }

          return buildCssPath(element);
        }
        
        // Get element XPath for better reliability
        function getXPath(element) {
          if (!element || element.nodeType !== Node.ELEMENT_NODE) return '';
          if (element.id) return '//*[@id="' + element.id.replace(/"/g, '\\"') + '"]';

          const parts = [];
          let current = element;
          while (current && current.nodeType === Node.ELEMENT_NODE) {
            let index = 1;
            let sibling = current.previousSibling;
            while (sibling) {
              if (sibling.nodeType === Node.ELEMENT_NODE && sibling.nodeName === current.nodeName) {
                index++;
              }
              sibling = sibling.previousSibling;
            }

            parts.unshift(current.nodeName.toLowerCase() + '[' + index + ']');
            current = current.parentNode;
          }

          return '/' + parts.join('/');
        }

        function captureFingerprint(element) {
          if (!element || element.nodeType !== Node.ELEMENT_NODE) return undefined;
          const attributes = {};
          ['id', 'name', 'type', 'placeholder', 'title', 'aria-label', 'data-testid', 'data-test', 'data-qa']
            .forEach(function(name) {
              const value = element.getAttribute(name);
              if (value) attributes[name] = value;
            });
          const domPath = [];
          let current = element;
          while (current && current.nodeType === Node.ELEMENT_NODE && domPath.length < 8) {
            domPath.unshift(current.tagName.toLowerCase());
            current = current.parentElement;
          }

          if (element.getAttribute('data-qa')) {
            const selector = '[data-qa="' + cssEscape(element.getAttribute('data-qa')) + '"]';
            if (document.querySelectorAll(selector).length === 1) {
              return selector;
            }
          }

          if (element.id && !isGeneratedId(element.id)) {
            const idSelector = '#' + cssEscape(element.id);
            if (document.querySelectorAll(idSelector).length === 1) {
              return idSelector;
            }
          }
          const rect = element.getBoundingClientRect();
          return {
            tagName: element.tagName.toLowerCase(),
            attributes: attributes,
            text: (element.textContent || '').trim().replace(/\\s+/g, ' ').substring(0, 160),
            accessibleName: element.getAttribute('aria-label') || undefined,
            role: element.getAttribute('role') || undefined,
            domPath: domPath,
            boundingBox: {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height
            }
          };
        }

        function emitRecord(payload, element) {
          if (element) {
            payload.locatorFingerprint = captureFingerprint(element);
          }
          console.log('CHROMATION_RECORD_JSON:' + JSON.stringify(payload));
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
            
            emitRecord({
              actionType: 'scroll',
              selector: 'window',
              value: scrollY + ',' + scrollX,
              extra: deltaY + ',' + deltaX,
              xpath: '',
            });
            
            lastScrollY = scrollY;
            lastScrollX = scrollX;
          }, 300); // Record scroll after 300ms of no scrolling
        }, { passive: true });
        
        // Capture clicks with full context
        document.addEventListener('click', function(e) {
          const element = e.target;
          if (
            !window.__chromationRecording ||
            !element ||
            element.tagName !== 'INPUT' ||
            element.type !== 'file'
          ) {
            return;
          }

          e.preventDefault();
          e.stopImmediatePropagation();
          console.log('CHROMATION_FILE_REQUEST_JSON:' + JSON.stringify({
            selector: getBestSelector(element),
            xpath: getXPath(element),
            multiple: Boolean(element.multiple),
            locatorFingerprint: captureFingerprint(element)
          }));
        }, true);

        document.addEventListener('click', function(e) {
          const element = e.target;
          const selector = getBestSelector(element);
          const xpath = getXPath(element);
          const text = getElementText(element);
          const tag = element.tagName.toLowerCase();
          
          emitRecord({
            actionType: 'click',
            selector: selector,
            value: text,
            extra: tag,
            xpath: xpath,
          }, element);
        }, true);
        
        // Capture right clicks
        document.addEventListener('contextmenu', function(e) {
          const selector = getBestSelector(e.target);
          emitRecord({ actionType: 'rightclick', selector: selector, value: getElementText(e.target), extra: '', xpath: getXPath(e.target) }, e.target);
        }, true);
        
        // Capture double clicks
        document.addEventListener('dblclick', function(e) {
          const selector = getBestSelector(e.target);
          emitRecord({ actionType: 'doubleclick', selector: selector, value: getElementText(e.target), extra: '', xpath: getXPath(e.target) }, e.target);
        }, true);
        
        // Capture input changes with keystroke info
        document.addEventListener('input', function(e) {
          if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            if (e.target.type === 'file') return;
            const selector = getBestSelector(e.target);
            const value = e.target.value;
            const inputType = e.target.type || 'text';
            emitRecord({ actionType: 'input', selector: selector, value: value, extra: inputType, xpath: getXPath(e.target) }, e.target);
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
            
            emitRecord({ actionType: 'keypress', selector: selector, value: key, extra: modifiers.join('+'), xpath: getXPath(e.target) }, e.target);
          }
        }, true);
        
        // Capture select changes
        document.addEventListener('change', function(e) {
          if (e.target.tagName === 'SELECT') {
            const selector = getBestSelector(e.target);
            const value = e.target.value;
            const text = e.target.options[e.target.selectedIndex]?.text || '';
            emitRecord({ actionType: 'select', selector: selector, value: value, extra: text, xpath: getXPath(e.target) }, e.target);
          } else if (e.target.type === 'checkbox') {
            const selector = getBestSelector(e.target);
            emitRecord({ actionType: 'checkbox', selector: selector, value: String(e.target.checked), extra: '', xpath: getXPath(e.target) }, e.target);
          } else if (e.target.type === 'radio') {
            const selector = getBestSelector(e.target);
            emitRecord({ actionType: 'radio', selector: selector, value: e.target.value, extra: '', xpath: getXPath(e.target) }, e.target);
          }
        }, true);
        
        // Capture form submissions
        document.addEventListener('submit', function(e) {
          const selector = getBestSelector(e.target);
          emitRecord({ actionType: 'submit', selector: selector, value: 'form', extra: '', xpath: getXPath(e.target) }, e.target);
        }, true);
        
        // Capture focus events
        document.addEventListener('focus', function(e) {
          const selector = getBestSelector(e.target);
          if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
            emitRecord({ actionType: 'focus', selector: selector, value: e.target.tagName.toLowerCase(), extra: '', xpath: getXPath(e.target) }, e.target);
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
              emitRecord({ actionType: 'hover', selector: selector, value: getElementText(e.target), extra: '', xpath: getXPath(e.target) }, e.target);
            }
          }, 500); // Record hover after 500ms
        }, true);
        
        // Capture drag and drop
        let draggedElement = null;
        document.addEventListener('dragstart', function(e) {
          draggedElement = e.target;
        }, true);
        
        document.addEventListener('drop', function(e) {
          if (!draggedElement) return;
          const sourceSelector = getBestSelector(draggedElement);
          const targetSelector = getBestSelector(e.target);
          emitRecord({
            actionType: 'drag',
            selector: sourceSelector,
            value: targetSelector,
            extra: getElementText(e.target),
            xpath: getXPath(draggedElement)
          }, draggedElement);
          draggedElement = null;
        }, true);
        
        console.log('Chromation: Enhanced recording injected - capturing clicks, inputs, scrolls, keys, and more');
      })();
    `);
    
    // Listen to console messages from webview to capture recorded actions
    if (browserWebview._chromationConsoleHandler) {
      browserWebview.removeEventListener('console-message', browserWebview._chromationConsoleHandler);
    }
    const handleChromationConsoleMessage = async (e) => {
      if (!isRecording) return;

      if (e.message.startsWith('CHROMATION_FILE_REQUEST_JSON:')) {
        if (uploadSelectionInProgress) return;
        uploadSelectionInProgress = true;
        try {
          const request = JSON.parse(e.message.replace('CHROMATION_FILE_REQUEST_JSON:', ''));
          const result = await ipcRenderer.invoke('choose-upload-files', {
            guestWebContentsId: browserWebview.getWebContentsId(),
            selector: request.selector,
            multiple: request.multiple,
          });
          if (result.success && result.filePaths.length > 0 && recorder) {
            recorder.recordAction({
              type: 'upload',
              selector: request.selector,
              value: result.filePaths[0],
              xpath: request.xpath || '',
              metadata: { files: result.filePaths },
              locatorFingerprint: request.locatorFingerprint,
              timestamp: Date.now(),
            });
            updateActionsDisplay();
            const actionCount = recorder.getActions().length;
            recordingStatus.textContent = `⏺️ Recording... (${actionCount} actions)`;
          } else if (!result.canceled) {
            throw new Error(result.error || 'File selection failed');
          }
        } catch (error) {
          console.error('Failed to record file selection:', error);
          statusText.textContent = `File selection failed: ${error.message}`;
        } finally {
          uploadSelectionInProgress = false;
        }
        return;
      }

      if (e.message.startsWith('CHROMATION_RECORD_JSON:')) {
        let payload;
        try {
          payload = JSON.parse(e.message.replace('CHROMATION_RECORD_JSON:', ''));
        } catch (error) {
          console.error('Failed to parse CHROMATION_RECORD_JSON payload:', error);
          return;
        }

        const actionType = payload.actionType;
        const selector = payload.selector || '';
        const value = payload.value || '';
        const extra = payload.extra || '';
        const xpath = payload.xpath || '';
        const locatorFingerprint = payload.locatorFingerprint;

        if (recorder) {
          const actions = recorder.getActions();
          const lastAction = actions[actions.length - 1];

          const isDuplicate = lastAction &&
            lastAction.type === actionType &&
            lastAction.selector === selector &&
            lastAction.value === value &&
            (Date.now() - lastAction.timestamp) < 1000;

          if (actionType === 'input') {
            if (lastAction && lastAction.type === 'input' && lastAction.selector === selector) {
              recorder.updateLastAction({
                ...lastAction,
                value,
                timestamp: Date.now(),
                locatorFingerprint: locatorFingerprint || lastAction.locatorFingerprint,
              });
              updateActionsDisplay();
              return;
            }
          }

          if (isDuplicate) {
            return;
          }

          recorder.recordAction({
            type: actionType,
            selector: selector,
            value: value,
            extra: extra,
            xpath: xpath,
            locatorFingerprint: locatorFingerprint,
            timestamp: Date.now()
          });

          updateActionsDisplay();
          const actionCount = recorder.getActions().length;
          recordingStatus.textContent = `⏺️ Recording... (${actionCount} actions)`;
        }

        return;
      }

      if (e.message.startsWith('CHROMATION_RECORD:')) {
        const parts = e.message.replace('CHROMATION_RECORD:', '').split(':');
        const actionType = parts[0];
        const selector = parts[1];
        const value = parts[2] || '';
        const extra = parts[3] || ''; // Additional context
        const xpath = parts[4] || ''; // XPath for better reliability
        
        // Smart deduplication - prevent recording duplicate consecutive actions
        if (recorder) {
          const actions = recorder.getActions();
          const lastAction = actions[actions.length - 1];
          
          // Check if this is a duplicate of the last action
          const isDuplicate = lastAction && 
            lastAction.type === actionType &&
            lastAction.selector === selector &&
            lastAction.value === value &&
            (Date.now() - lastAction.timestamp) < 1000; // Within 1 second
          
          // Special handling for input events - only record the final value
          if (actionType === 'input') {
            // If last action was also input on same selector, just update it
            if (lastAction && lastAction.type === 'input' && lastAction.selector === selector) {
              recorder.updateLastAction({
                ...lastAction,
                value,
                timestamp: Date.now(),
              });
              updateActionsDisplay();
              return; // Don't add new action
            }
          }
          
          // Skip if duplicate
          if (isDuplicate) {
            return;
          }
          
          // Record the action with enriched data
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
    };
    browserWebview._chromationConsoleHandler = handleChromationConsoleMessage;
    browserWebview.addEventListener('console-message', handleChromationConsoleMessage);
    
    console.log('Recording event listeners injected into webview');
  } catch (error) {
    console.error('Failed to inject recording script:', error);
    statusText.textContent = 'Recording injection failed - try refreshing the page';
  }
}

function getActionIcon(type) {
  const paths = {
    navigate: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/>',
    input: '<path d="M4 7h16v10H4zM7 10h.01M10 10h.01M13 10h.01M16 10h.01M8 14h8"/>',
    click: '<path d="m8 3 8 15 2-6 3-2L8 3z"/>',
    assert: '<path d="M4 12 9 17 20 6"/>',
    upload: '<path d="M12 16V4m0 0L7 9m5-5 5 5M4 20h16"/>',
    wait: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  };
  const body = paths[type] || (type === 'waitForPageLoad' ? paths.wait : '<circle cx="12" cy="12" r="8"/><path d="M9 12h6"/>');
  return `<svg class="step-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">${body}</svg>`;
}

function updateReplayEngineGuidance(engine) {
  const target = document.getElementById('replay-engine-guidance');
  if (!target) return;
  target.innerHTML = engine === 'auto'
    ? '<strong>Auto selection</strong><span>Uses the current tab for smooth interactive flows and switches to Playwright only when a step needs its advanced capabilities.</span>'
    : engine === 'playwright'
    ? '<strong>Playwright Executor</strong><span>Best for CI, frames, evidence, APIs, visual checks, accessibility, and performance. Opens an executor-controlled browser context.</span>'
    : '<strong>In-Browser Replay</strong><span>Fastest for interactive debugging in the current tab. Advanced steps and some cross-origin/frame scenarios require Playwright.</span>';
}

function updateActionsDisplay() {
  if (!recorder) return;
  updatePhase1Badges();
  
  const actionsList = document.getElementById('actions-list');
  if (!actionsList) return;
  
  const actions = recorder.getActions();
  const statusForStep = (action, index) => {
    if (action.metadata?.disabled) return 'disabled';
    const failed = replayReport.failed.find((item) => item.index === index);
    const passed = replayReport.passed.find((item) => item.index === index);
    if ((failed || passed)?.healing) return 'healed';
    if (failed) return 'failed';
    if (passed) return 'passed';
    return 'skipped';
  };
  const visibleActions = actions.map((action, index) => ({ action, index, status: statusForStep(action, index) })).filter(({ action, status }) => {
    const haystack = `${action.type} ${action.selector || ''} ${action.value || ''}`.toLowerCase();
    return (!stepSearchQuery || haystack.includes(stepSearchQuery)) && (activeStepFilter === 'all' || status === activeStepFilter);
  });
  
  if (actions.length === 0) {
    actionsList.innerHTML = '<div class="workflow-empty"><strong>No steps recorded</strong><span>Start recording or add an assertion to build your test.</span></div>';
  } else if (visibleActions.length === 0) {
    actionsList.innerHTML = '<div class="workflow-empty"><strong>No matching steps</strong><span>Try another search or status filter.</span></div>';
  } else {
    actionsList.innerHTML = visibleActions.map(({ action, index, status }) => {
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
          displayText = `Type "${String(action.value || '').substring(0, 20)}${String(action.value || '').length > 20 ? '...' : ''}"`;
          break;
        case 'keypress':
          icon = '🔤';
          displayText = `Press ${action.value}${action.extra ? ' + ' + action.extra : ''}`;
          break;
        case 'select':
          icon = '📋';
          displayText = `Select "${action.extra || action.value}"`;
          break;
        case 'upload':
          icon = '📎';
          displayText = `Upload ${action.metadata?.files?.length || 1} file(s) to ${action.selector}`;
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
        case 'drag':
          icon = '🤏';
          displayText = `Drag ${action.selector} to ${action.value}`;
          break;
        case 'submit':
          icon = '📤';
          displayText = 'Submit form';
          break;
        case 'navigate':
          icon = '🧭';
          displayText = `Navigate to ${action.value}`;
          break;
        case 'waitForPageLoad':
          icon = '⏳';
          displayText = `Wait for page load: ${action.extra || 'Page ready'}`;
          break;
        default:
          icon = '•';
          displayText = `${action.type} on ${action.selector}`;
      }
      
      const locatorQuality = scoreRecordedLocator(action);
      return `
        <div class="action-item timeline-step status-${status}${action.metadata?.breakpoint ? ' has-breakpoint' : ''}${action.metadata?.disabled ? ' is-disabled' : ''}${selectedStepIndex === index ? ' selected' : ''}" data-action-index="${index}" draggable="${!isReplaying}">
          <span style="color: #666; font-size: 11px; min-width: 30px;">#${index + 1}</span>
          <span class="step-icon-wrap">${getActionIcon(action.type)}</span>
          <div style="flex: 1;">
            <div style="font-weight: 500; color: var(--text-primary);">${escapeReportText(displayText)}</div>
            <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">${escapeReportText(action.selector)}</div>
            ${locatorQuality ? `<div class="locator-quality-row"><span class="confidence-badge ${getConfidenceClass(locatorQuality.stability)}">${Math.round(locatorQuality.stability * 100)}% stable</span><span>${locatorQuality.unique ? 'Unique' : 'Check uniqueness'}</span></div>` : ''}
          </div>
          <div class="step-row-actions">
            <button class="action-icon-btn" data-step-command="replay-step" data-action-index="${index}" title="Run this step">▶</button>
            <button class="action-icon-btn" data-step-command="up" data-action-index="${index}" title="Move up" ${index === 0 ? 'disabled' : ''}>↑</button>
            <button class="action-icon-btn" data-step-command="down" data-action-index="${index}" title="Move down" ${index === actions.length - 1 ? 'disabled' : ''}>↓</button>
            <button class="action-icon-btn" data-step-command="duplicate" data-action-index="${index}" title="Duplicate">⧉</button>
            <button class="action-icon-btn${action.metadata?.breakpoint ? ' active-breakpoint' : ''}" data-step-command="breakpoint" data-action-index="${index}" title="Toggle breakpoint">●</button>
            <button class="action-icon-btn" data-step-command="disable" data-action-index="${index}" title="${action.metadata?.disabled ? 'Enable' : 'Disable'}">${action.metadata?.disabled ? '○' : '⊘'}</button>
            <button class="action-icon-btn delete-step" data-step-command="delete" data-action-index="${index}" title="Delete">×</button>
          </div>
        </div>
      `;
    }).join('');
    actionsList.querySelectorAll('.action-item').forEach((item) => {
      item.addEventListener('click', (event) => {
        if (event.target.closest('[data-step-command]')) return;
        openStepEditor(Number(item.dataset.actionIndex));
      });
    });
    actionsList.querySelectorAll('[data-step-command]').forEach((button) => {
      button.addEventListener('click', () => {
        handleStepCommand(button.dataset.stepCommand, Number(button.dataset.actionIndex));
      });
    });
    actionsList.querySelectorAll('.action-item[draggable="true"]').forEach((item) => {
      item.addEventListener('dragstart', (event) => event.dataTransfer.setData('text/step-index', item.dataset.actionIndex));
      item.addEventListener('dragover', (event) => { event.preventDefault(); item.classList.add('drag-over'); });
      item.addEventListener('dragleave', () => item.classList.remove('drag-over'));
      item.addEventListener('drop', (event) => {
        event.preventDefault();
        item.classList.remove('drag-over');
        const from = Number(event.dataTransfer.getData('text/step-index'));
        const to = Number(item.dataset.actionIndex);
        if (Number.isInteger(from) && from !== to) {
          recorder.moveAction(from, to);
          selectedStepIndex = to;
          updateActionsDisplay();
        }
      });
    });
  }
  
  // Update replay button state
  updateReplayButton();
  if (selectedStepIndex !== null) renderStepEditor(selectedStepIndex);
}

function scoreRecordedLocator(action) {
  if (!action?.selector || !action.locatorFingerprint) return null;
  const attributes = action.locatorFingerprint.attributes || {};
  let stability = 0.55;
  if (attributes['data-testid'] || attributes['data-test'] || attributes['data-qa']) stability = 0.98;
  else if (attributes.id && !/\d{4,}|react-aria|html5_/i.test(attributes.id)) stability = 0.9;
  else if (attributes.name) stability = 0.8;
  else if (attributes['aria-label']) stability = 0.76;
  return { stability, unique: !/:nth-|react-aria|html5_/i.test(action.selector) };
}

async function handleStepCommand(command, index) {
  if (!recorder || isReplaying) return;
  const actions = recorder.getActions();
  if (!actions[index]) return;
  if (command === 'replay-step') {
    statusText.textContent = `Running step #${index + 1}…`;
    try {
      highlightReplayingAction(index);
      await runReplayActionWithTimeout(actions[index], Number(actions[index].metadata?.timeoutMs) || 8000, new AbortController().signal);
      showToast(`Step #${index + 1} passed`, 'success');
    } catch (error) {
      showToast(`Step #${index + 1} failed: ${error.message}`, 'error');
    } finally {
      clearReplayHighlight();
    }
    return;
  } else if (command === 'up' && index > 0) {
    recorder.moveAction(index, index - 1);
    selectedStepIndex = index - 1;
  } else if (command === 'down' && index < actions.length - 1) {
    recorder.moveAction(index, index + 1);
    selectedStepIndex = index + 1;
  } else if (command === 'duplicate') {
    recorder.duplicateAction(index);
    selectedStepIndex = index + 1;
  } else if (command === 'breakpoint') {
    toggleActionBreakpoint(index);
    return;
  } else if (command === 'disable') {
    recorder.setActionDisabled(index, actions[index].metadata?.disabled !== true);
  } else if (command === 'delete') {
    recorder.deleteAction(index);
    selectedStepIndex = null;
    closeStepEditor();
  }
  updateActionsDisplay();
}

function addAssertionStep() {
  if (!recorder || isReplaying) return;
  const actions = recorder.getActions();
  actions.push({
    type: 'assert',
    selector: 'body',
    timestamp: Date.now(),
    metadata: { kind: 'visible' },
  });
  recorder.setActions(actions);
  selectedStepIndex = actions.length - 1;
  updateActionsDisplay();
}

function openStepEditor(index) {
  selectedStepIndex = index;
  updateActionsDisplay();
}

function closeStepEditor() {
  selectedStepIndex = null;
  const card = document.getElementById('step-properties-card');
  if (card) card.style.display = 'none';
  document.querySelectorAll('.action-item.selected').forEach((item) => item.classList.remove('selected'));
}

function renderStepEditor(index) {
  const card = document.getElementById('step-properties-card');
  const content = document.getElementById('step-properties-content');
  const title = document.getElementById('step-properties-title');
  const action = recorder?.getActions()[index];
  if (!card || !content || !action) return;
  card.style.display = 'block';
  title.textContent = `Step #${index + 1} Properties`;
  const metadata = action.metadata || {};
  const actionTypes = [
    'click', 'doubleclick', 'rightclick', 'input', 'select', 'checkbox', 'radio',
    'upload', 'hover', 'focus', 'submit', 'drag', 'scroll', 'keypress',
    'navigate', 'wait', 'waitForPageLoad', 'assert', 'visual', 'api',
    'mockNetwork', 'accessibility', 'performance',
    'plugin',
  ];
  const assertionKinds = [
    ['visible', 'Element is visible'],
    ['text-contains', 'Text contains'],
    ['value-equals', 'Value equals'],
    ['attribute-equals', 'Attribute equals'],
    ['count-equals', 'Element count equals'],
    ['url-equals', 'URL equals'],
    ['url-contains', 'URL contains'],
    ['title-equals', 'Page title equals'],
    ['response-status', 'Response status'],
  ];
  const fallbackLocators = buildFingerprintLocators(action);
  const healingResult = [...replayReport.failed, ...replayReport.passed].find((item) => item.index === index)?.healing;
  content.innerHTML = `
    <form id="step-properties-form">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Action</label>
          <select id="step-edit-type" class="form-select">${actionTypes.map((type) =>
            `<option value="${type}" ${type === action.type ? 'selected' : ''}>${type}</option>`
          ).join('')}</select>
        </div>
        <div class="form-group"><label class="form-label">Step timeout (ms)</label>
          <input id="step-edit-timeout" class="form-input" type="number" min="1" value="${escapeReportText(metadata.timeoutMs || '')}">
        </div>
      </div>
      <div class="form-group"><label class="form-label">Selector / target</label>
        <input id="step-edit-selector" class="form-input" list="step-locator-options" value="${escapeReportText(action.selector)}">
        <datalist id="step-locator-options">${fallbackLocators.map((locator) => `<option value="${escapeReportText(locator)}"></option>`).join('')}</datalist>
        <small class="panel-description">Choose the primary locator or enter a custom one. Fingerprint fallbacks remain available to healing.</small>
      </div>
      <div class="form-group"><label class="form-label">Value</label>
        <input id="step-edit-value" class="form-input" value="${escapeReportText(action.value || '')}">
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Retries</label>
          <input id="step-edit-retries" class="form-input" type="number" min="0" value="${escapeReportText(metadata.maxRetries ?? '')}">
        </div>
        <div class="form-group step-checks">
          <label><input id="step-edit-disabled" type="checkbox" ${metadata.disabled ? 'checked' : ''}> Disabled</label>
          <label><input id="step-edit-breakpoint" type="checkbox" ${metadata.breakpoint ? 'checked' : ''}> Breakpoint</label>
        </div>
      </div>
      <div id="assertion-editor-fields" class="${action.type === 'assert' ? '' : 'hidden'}">
        <div class="form-group"><label class="form-label">Assertion</label>
          <select id="step-edit-assertion-kind" class="form-select">${assertionKinds.map(([kind, label]) =>
            `<option value="${kind}" ${metadata.kind === kind ? 'selected' : ''}>${label}</option>`
          ).join('')}</select>
        </div>
        <div class="form-group"><label class="form-label">Expected value</label>
          <input id="step-edit-expected" class="form-input" value="${escapeReportText(metadata.expected || '')}">
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Attribute name</label>
            <input id="step-edit-attribute" class="form-input" value="${escapeReportText(metadata.attributeName || '')}">
          </div>
          <div class="form-group"><label class="form-label">Response URL contains</label>
            <input id="step-edit-response-url" class="form-input" value="${escapeReportText(metadata.responseUrl || '')}">
          </div>
        </div>
      </div>
      <div id="advanced-step-fields" class="${['visual', 'api', 'mockNetwork', 'accessibility', 'performance', 'plugin'].includes(action.type) ? '' : 'hidden'}">
        <div class="form-group"><label class="form-label">Advanced step configuration (JSON)</label>
          <textarea id="step-edit-advanced-json" class="form-input" rows="7">${escapeReportText(JSON.stringify(metadata, null, 2))}</textarea>
          <small class="panel-description">Visual: name, mode, threshold. API: method, url, expectedStatus. Mock: urlPattern, status, body. Performance: Web Vitals budget fields.</small>
        </div>
      </div>
      ${healingResult ? `<details class="healing-comparison" open><summary>Healing comparison <span>Review</span></summary>
        <label>Original locator<code>${escapeReportText(healingResult.originalSelector || action.selector)}</code></label>
        <label>Recovered locator<code>${escapeReportText(healingResult.healedSelector || healingResult.selector)}</code></label>
        <div class="healing-confidence">${Math.round(Number(healingResult.confidence || 0) * 100)}% confidence</div>
        <button type="button" class="secondary-btn full-width" id="accept-healed-locator">Use recovered locator</button>
      </details>` : ''}
      <div id="step-editor-error" class="step-editor-error"></div>
      <button type="submit" class="primary-btn full-width">Save Step</button>
    </form>`;
  document.getElementById('step-edit-type')?.addEventListener('change', (event) => {
    document.getElementById('assertion-editor-fields')?.classList.toggle('hidden', event.target.value !== 'assert');
    document.getElementById('advanced-step-fields')?.classList.toggle('hidden',
      !['visual', 'api', 'mockNetwork', 'accessibility', 'performance', 'plugin'].includes(event.target.value));
  });
  document.getElementById('step-properties-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    saveStepEditor(index);
  });
  document.getElementById('accept-healed-locator')?.addEventListener('click', () => {
    const selector = healingResult?.healedSelector || healingResult?.selector;
    if (!selector) return;
    recorder.persistHealedLocator(index, selector);
    document.getElementById('step-edit-selector').value = selector;
    showToast('Recovered locator promoted to primary', 'success');
    updateActionsDisplay();
  });
}

function buildFingerprintLocators(action) {
  const attributes = action?.locatorFingerprint?.attributes || {};
  const tag = action?.locatorFingerprint?.tagName || '*';
  return [...new Set([
    action.selector,
    attributes['data-testid'] ? `[data-testid="${attributes['data-testid']}"]` : '',
    attributes['data-test'] ? `[data-test="${attributes['data-test']}"]` : '',
    attributes.id ? `#${attributes.id}` : '',
    attributes.name ? `${tag}[name="${attributes.name}"]` : '',
    attributes['aria-label'] ? `${tag}[aria-label="${attributes['aria-label']}"]` : '',
  ].filter(Boolean))];
}

function saveStepEditor(index) {
  const action = recorder?.getActions()[index];
  if (!action) return;
  const type = document.getElementById('step-edit-type').value;
  const metadata = { ...(action.metadata || {}) };
  const timeout = document.getElementById('step-edit-timeout').value;
  const retries = document.getElementById('step-edit-retries').value;
  if (timeout) metadata.timeoutMs = Number(timeout); else delete metadata.timeoutMs;
  if (retries) metadata.maxRetries = Number(retries); else delete metadata.maxRetries;
  metadata.disabled = document.getElementById('step-edit-disabled').checked;
  metadata.breakpoint = document.getElementById('step-edit-breakpoint').checked;
  if (type === 'assert') {
    metadata.kind = document.getElementById('step-edit-assertion-kind').value;
    metadata.expected = document.getElementById('step-edit-expected').value;
    metadata.attributeName = document.getElementById('step-edit-attribute').value;
    metadata.responseUrl = document.getElementById('step-edit-response-url').value;
  } else {
    delete metadata.kind;
    delete metadata.expected;
    delete metadata.attributeName;
    delete metadata.responseUrl;
  }
  if (['visual', 'api', 'mockNetwork', 'accessibility', 'performance', 'plugin'].includes(type)) {
    try {
      Object.assign(metadata, JSON.parse(document.getElementById('step-edit-advanced-json')?.value || '{}'));
    } catch {
      document.getElementById('step-editor-error').textContent = 'Advanced configuration must be valid JSON';
      return;
    }
  }
  try {
    recorder.updateAction(index, {
      ...action,
      type,
      selector: document.getElementById('step-edit-selector').value,
      value: document.getElementById('step-edit-value').value || undefined,
      metadata,
      timestamp: Date.now(),
    });
    statusText.textContent = `Step #${index + 1} updated`;
    updateActionsDisplay();
  } catch (error) {
    document.getElementById('step-editor-error').textContent = error.message;
  }
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
let replayAbortController = null;
let currentReplayEngine = null;
let replayStatePoll = null;
let webviewReplayControl = createWebviewReplayControl();
let replayReport = { passed: [], failed: [], total: 0 };
let replayStartedAt = 0;
let replayEndedAt = 0;
let lastReplayExecutionReport = null;
let lastReplayExecution = null;
let latestReportViewModel = null;
let currentRecordingFilename = null;
let pendingRerunComparison = null;

function updateReplayButton() {
  const replayBtn = document.getElementById('replay-record-btn');
  if (!replayBtn || !recorder) return;
  
  const actions = recorder.getActions();
  replayBtn.disabled = actions.length === 0 || isRecording;
}

async function replayActions(speed = 1.0, engine = 'webview', policy = { timeoutMs: 8000, retries: 1, continueOnFailure: true }) {
  if (!recorder || isReplaying || isRecording) return;
  
  const actions = recorder.getActions();
  const requestedEngine = engine;
  engine = resolveReplayEngine(engine, actions);
  let replayTerminalState = 'passed';
  if (actions.length === 0) {
    statusText.textContent = 'No actions to replay';
    return;
  }
  
  isReplaying = true;
  currentReplayEngine = engine;
  webviewReplayControl = createWebviewReplayControl();
  replayAbortController = new AbortController();
  const replaySignal = replayAbortController.signal;
  replayReport = { passed: [], failed: [], total: actions.length };
  replayStartedAt = Date.now();
  lastReplayExecutionReport = null;
  lastReplayExecution = null;
  startReplayStateMonitor();
  updateExecutionControls({ state: 'starting', currentStep: -1, totalSteps: actions.length });
  
  const replayBtn = document.getElementById('replay-record-btn');
  if (replayBtn) {
    replayBtn.disabled = false;
    replayBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <rect x="6" y="6" width="12" height="12"></rect>
      </svg>
      Stop Replay
    `;
  }
  
  statusText.textContent = engine === 'playwright'
    ? `Running ${actions.length} actions with Playwright executor...`
    : `Replaying ${actions.length} actions at ${speed}x speed...`;
  if (requestedEngine === 'auto') {
    showToast(`Auto selected ${engine === 'playwright' ? 'Playwright' : 'In-Browser Replay'}`, 'info');
  }
  
  try {
    if (engine === 'playwright') {
      await replayActionsWithExecutor(actions, policy);
      throwIfReplayCancelled(replaySignal);
      replayEndedAt = Date.now();
      replayTerminalState = replayReport.failed.length > 0 ? 'failed' : 'passed';
      await persistRunHistory();
      statusText.textContent = `Execution completed: ${replayReport.passed.length} passed, ${replayReport.failed.length} failed`;
      showReplayReport();
      return;
    }

    for (let i = 0; i < actions.length; i++) {
      throwIfReplayCancelled(replaySignal);
      const action = actions[i];
      await waitForWebviewReplayPermission(i, action, replaySignal);
      if (action.metadata?.disabled === true) {
        if (webviewReplayControl.pauseAfterStep) {
          webviewReplayControl.pauseAfterStep = false;
          webviewReplayControl.pauseRequested = true;
        }
        continue;
      }
      
      // Highlight current action being replayed
      highlightReplayingAction(i);
      
      let stepResult = null;
      for (let attempt = 0; attempt <= policy.retries; attempt++) {
        const stepStartedAt = Date.now();

        try {
          const replayOutcome = await runReplayActionWithTimeout(action, policy.timeoutMs, replaySignal);
          const screenshot = await captureWebviewScreenshotBase64();
          stepResult = {
            index: i,
            action,
            error: null,
            duration: Date.now() - stepStartedAt,
            screenshot,
            healing: replayOutcome?.healing || null,
          };
          replayReport.passed.push(stepResult);
          break;
        } catch (error) {
          if (replaySignal.aborted) {
            throw error;
          }
          if (attempt < policy.retries) {
            await replayDelay(250, replaySignal);
            continue;
          }

          console.error(`Action ${i} failed:`, error);
          const screenshot = await captureWebviewScreenshotBase64();
          stepResult = {
            index: i,
            action,
            error: error.message,
            duration: Date.now() - stepStartedAt,
            screenshot,
          };
          replayReport.failed.push(stepResult);
        }
      }

      if (stepResult && stepResult.error && !policy.continueOnFailure) {
        break;
      }
      
      // Wait between actions (adjusted by speed)
      const delay = 500 / speed; // Base delay of 500ms
      await replayDelay(delay, replaySignal);
      if (webviewReplayControl.pauseAfterStep) {
        webviewReplayControl.pauseAfterStep = false;
        webviewReplayControl.pauseRequested = true;
      }
    }
    
    statusText.textContent = `Replay completed: ${replayReport.passed.length} passed, ${replayReport.failed.length} failed`;
    replayTerminalState = replayReport.failed.length > 0 ? 'failed' : 'passed';
    replayEndedAt = Date.now();
    reporter.recordReport(buildWebviewExecutionReport());
    await persistRunHistory();
    
    // Show report
    showReplayReport();
  } catch (error) {
    if (replaySignal.aborted) {
      replayTerminalState = 'cancelled';
      statusText.textContent = 'Replay stopped';
    } else {
      replayTerminalState = 'failed';
      console.error('Replay error:', error);
      statusText.textContent = 'Replay failed: ' + error.message;
    }
  } finally {
    isReplaying = false;
    currentReplayEngine = null;
    stopReplayStateMonitor();
    updateExecutionControls({
      state: replayTerminalState,
      currentStep: webviewReplayControl.currentStep,
      totalSteps: actions.length,
    });
    setTimeout(() => {
      if (!isReplaying) {
        updateExecutionControls({ state: 'idle', currentStep: -1, totalSteps: 0 });
      }
    }, 1500);
    replayAbortController = null;
    if (replayBtn) {
      replayBtn.disabled = false;
      replayBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
        Replay
      `;
    }
    clearReplayHighlight();
  }
}

async function replayActionsWithExecutor(actions, policy) {
  if (!chromationBrowser || typeof chromationBrowser.executeRecordedActionsWithReport !== 'function') {
    throw new Error('ScriptExecutor replay is not available in this build. Please restart the app.');
  }

  const initialPageState = await captureInteractivePageState();
  const { execution, report } = await chromationBrowser.executeRecordedActionsWithReport('Recorder Replay', {
    headless: false,
    reuseBrowser: true,
    initialPageState,
    continueOnFailure: policy.continueOnFailure,
    defaultStepTimeoutMs: policy.timeoutMs,
    globalTimeoutMs: Math.max(
      30_000,
      actions.length * (policy.timeoutMs * (policy.retries + 1) + 1000)
    ),
    retryPolicy: {
      maxRetries: policy.retries,
      retryDelayMs: 250,
    },
    evidence: {
      screenshotOnFailure: true,
      captureConsoleLogs: true,
      captureNetworkSummary: true,
      captureDomSnapshotOnFailure: true,
    },
  });
  report.sourceRecordingFilename = currentRecordingFilename;
  report.replayEngine = 'playwright';

  replayReport = {
    total: execution.summary.total,
    passed: execution.steps
      .filter((step) => step.status === 'passed')
      .map((step) => ({
        index: step.index,
        action: step.action,
        error: null,
        duration: step.durationMs,
        screenshot: step.evidence?.screenshotBase64 || null,
        healing: step.healing || null,
      })),
    failed: execution.steps
      .filter((step) => step.status === 'failed')
      .map((step) => ({
        index: step.index,
        action: step.action,
        error: step.error || 'Execution failed',
        duration: step.durationMs,
        screenshot: step.evidence?.screenshotBase64 || null,
        healing: step.healing || null,
      })),
  };

  lastReplayExecutionReport = report;
  lastReplayExecution = execution;

  if (execution.runError && /cancel|timed out/i.test(execution.runError)) {
    throw new Error(execution.runError);
  }
}

async function captureInteractivePageState() {
  try {
    const url = browserWebview?.getURL?.() || '';
    if (!/^https?:\/\//i.test(url)) return {};
    const state = await browserWebview.executeJavaScript(`({
      cookies: document.cookie,
      localStorage: Object.fromEntries(Object.entries(localStorage)),
      sessionStorage: Object.fromEntries(Object.entries(sessionStorage))
    })`);
    return { url, ...state };
  } catch (error) {
    console.warn('Could not mirror the active tab state into Playwright:', error);
    return { url: browserWebview?.getURL?.() || '' };
  }
}

function resolveReplayEngine(engine, actions) {
  if (engine !== 'auto') return engine;
  const playwrightOnly = new Set(['visual', 'api', 'mockNetwork', 'accessibility', 'performance', 'plugin']);
  return actions.some((action) =>
    playwrightOnly.has(action.type) ||
    action.locatorFingerprint?.frameContext?.length ||
    action.locatorFingerprint?.shadowHostChain?.length
  ) ? 'playwright' : 'webview';
}

function buildWebviewExecutionReport() {
  const results = [...replayReport.passed, ...replayReport.failed].sort((left, right) => left.index - right.index);
  return {
    runId: `webview_${replayStartedAt || Date.now()}`,
    testName: getSuggestedRecordingName(recorder?.getActions?.() || []),
    startTime: replayStartedAt || Date.now(),
    endTime: replayEndedAt || Date.now(),
    duration: Math.max(0, (replayEndedAt || Date.now()) - (replayStartedAt || Date.now())),
    status: replayReport.failed.length ? 'failed' : 'passed',
    steps: results.map((item) => ({
      index: item.index,
      name: `${item.index + 1}. ${item.action.type} ${item.action.selector || ''}`,
      actionType: item.action.type,
      selector: item.action.selector,
      status: item.error ? 'failed' : 'passed',
      duration: item.duration || 0,
      error: item.error || undefined,
      screenshot: item.screenshot || undefined,
      healing: item.healing || undefined,
      healedLocators: item.healing ? [`${item.healing.originalSelector} -> ${item.healing.healedSelector}`] : undefined,
    })),
    screenshots: results.map((item) => item.screenshot).filter(Boolean),
    healingEvents: results.filter((item) => item.healing).length,
    healingDetails: results.map((item) => item.healing).filter(Boolean),
    environment: { runtime: 'electron-webview', headless: false },
    sourceRecordingFilename: currentRecordingFilename,
    replayEngine: 'webview',
  };
}

async function persistRunHistory() {
  try {
    const serialized = reporter?.exportHistory?.();
    if (serialized) await ipcRenderer.invoke('save-run-history', serialized);
  } catch (error) {
    console.warn('Could not persist run history:', error);
  }
}

async function hydrateRunHistory() {
  if (runHistoryHydrated) return;
  try {
    const result = await ipcRenderer.invoke('load-run-history');
    if (result?.success && result.history && result.history !== '[]') reporter?.importHistory?.(result.history);
    runHistoryHydrated = true;
  } catch (error) {
    console.warn('Could not restore run history:', error);
  }
}

function cancelReplay() {
  if (!isReplaying) return false;
  updateExecutionControls({
    state: 'stopping',
    currentStep: webviewReplayControl.currentStep,
    totalSteps: recorder?.getActions().length || 0,
  });
  replayAbortController?.abort(new Error('Replay cancelled by user'));
  releaseWebviewReplayWaiters();
  if (chromationBrowser && typeof chromationBrowser.cancelExecution === 'function') {
    chromationBrowser.cancelExecution('Replay cancelled by user');
  }
  statusText.textContent = 'Stopping replay...';
  return true;
}

function createWebviewReplayControl() {
  return {
    pauseRequested: false,
    pauseAfterStep: false,
    paused: false,
    currentStep: -1,
    consumedBreakpoints: new Set(),
    waiters: [],
  };
}

function toggleActionBreakpoint(index) {
  if (!recorder || isReplaying) return;
  const actions = recorder.getActions();
  const action = actions[index];
  if (!action) return;
  action.metadata = {
    ...(action.metadata || {}),
    breakpoint: action.metadata?.breakpoint !== true,
  };
  recorder.setActions(actions);
  updateActionsDisplay();
}

function pauseReplay() {
  if (!isReplaying) return false;
  if (currentReplayEngine === 'playwright') {
    const accepted = chromationBrowser?.pauseExecution?.() === true;
    if (accepted) statusText.textContent = 'Pause requested...';
    return accepted;
  }
  webviewReplayControl.pauseRequested = true;
  statusText.textContent = 'Pause requested...';
  return true;
}

function resumeReplay() {
  if (!isReplaying) return false;
  if (currentReplayEngine === 'playwright') {
    return chromationBrowser?.resumeExecution?.() === true;
  }
  if (!webviewReplayControl.paused) return false;
  webviewReplayControl.pauseRequested = false;
  webviewReplayControl.pauseAfterStep = false;
  webviewReplayControl.paused = false;
  releaseWebviewReplayWaiters();
  updateExecutionControls({
    state: 'running',
    currentStep: webviewReplayControl.currentStep,
    totalSteps: recorder.getActions().length,
  });
  return true;
}

function stepReplay() {
  if (!isReplaying) return false;
  if (currentReplayEngine === 'playwright') {
    return chromationBrowser?.stepExecution?.() === true;
  }
  if (!webviewReplayControl.paused) return false;
  webviewReplayControl.pauseRequested = false;
  webviewReplayControl.pauseAfterStep = true;
  webviewReplayControl.paused = false;
  releaseWebviewReplayWaiters();
  return true;
}

async function waitForWebviewReplayPermission(index, action, signal) {
  webviewReplayControl.currentStep = index;
  const breakpoint = action.metadata?.breakpoint === true &&
    !webviewReplayControl.consumedBreakpoints.has(index);
  if (breakpoint) {
    webviewReplayControl.consumedBreakpoints.add(index);
    webviewReplayControl.pauseRequested = true;
  }
  if (!webviewReplayControl.pauseRequested) {
    updateExecutionControls({
      state: 'running',
      currentStep: index,
      totalSteps: recorder.getActions().length,
    });
    return;
  }
  webviewReplayControl.paused = true;
  updateExecutionControls({
    state: 'paused',
    currentStep: index,
    totalSteps: recorder.getActions().length,
  });
  statusText.textContent = breakpoint
    ? `Paused at breakpoint #${index + 1}`
    : `Paused before step #${index + 1}`;
  await new Promise((resolve, reject) => {
    const abort = () => reject(
      signal.reason instanceof Error ? signal.reason : new Error('Replay cancelled')
    );
    signal.addEventListener('abort', abort, { once: true });
    webviewReplayControl.waiters.push(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    });
  });
  throwIfReplayCancelled(signal);
}

function releaseWebviewReplayWaiters() {
  webviewReplayControl.waiters.splice(0).forEach((resolve) => resolve());
}

function startReplayStateMonitor() {
  stopReplayStateMonitor();
  if (currentReplayEngine !== 'playwright') return;
  replayStatePoll = setInterval(() => {
    const snapshot = chromationBrowser?.getExecutionState?.();
    if (snapshot) updateExecutionControls(snapshot);
  }, 100);
}

function stopReplayStateMonitor() {
  if (replayStatePoll) clearInterval(replayStatePoll);
  replayStatePoll = null;
}

function updateExecutionControls(snapshot) {
  const state = snapshot?.state || 'idle';
  const paused = state === 'paused';
  const running = ['starting', 'running'].includes(state);
  const pauseButton = document.getElementById('pause-replay-btn');
  const resumeButton = document.getElementById('resume-replay-btn');
  const stepButton = document.getElementById('step-replay-btn');
  const label = document.getElementById('execution-state-label');
  if (pauseButton) pauseButton.disabled = !running;
  if (resumeButton) resumeButton.disabled = !paused;
  if (stepButton) stepButton.disabled = !paused;
  if (label) {
    const progress = snapshot?.currentStep >= 0
      ? ` · Step ${snapshot.currentStep + 1}/${snapshot.totalSteps}`
      : '';
    label.textContent = `${state.charAt(0).toUpperCase()}${state.slice(1)}${progress}`;
    label.dataset.state = state;
  }
  const bar = document.getElementById('execution-bar');
  const active = ['starting', 'running', 'paused'].includes(state);
  bar?.classList.toggle('hidden', state === 'idle');
  bar?.classList.toggle('paused', paused);
  bar?.classList.toggle('terminal', !active && state !== 'idle');
  const currentStep = Number(snapshot?.currentStep ?? -1);
  const totalSteps = Number(snapshot?.totalSteps || 0);
  const progress = totalSteps ? Math.max(0, Math.min(100, ((currentStep + 1) / totalSteps) * 100)) : 0;
  const action = recorder?.getActions?.()[currentStep];
  setText('execution-bar-title', state === 'paused' ? 'Execution paused' : state === 'failed' ? 'Execution failed' : state === 'passed' ? 'Execution completed' : 'Running test');
  setText('execution-bar-step', currentStep >= 0 ? `Step ${currentStep + 1} of ${totalSteps} · ${action?.type || 'action'} ${action?.selector || ''}` : 'Preparing execution…');
  const progressBar = document.getElementById('execution-bar-progress');
  if (progressBar) progressBar.style.width = `${progress}%`;
  setText('execution-bar-failures', `${replayReport.failed.length} failure${replayReport.failed.length === 1 ? '' : 's'}`);
  document.getElementById('execution-pause')?.classList.toggle('hidden', !running);
  document.getElementById('execution-resume')?.classList.toggle('hidden', !paused);
  document.getElementById('execution-step')?.toggleAttribute('disabled', !paused);
  if (active && !executionElapsedTimer) {
    executionElapsedTimer = setInterval(updateExecutionElapsed, 500);
  } else if (!active && executionElapsedTimer) {
    clearInterval(executionElapsedTimer);
    executionElapsedTimer = null;
  }
  updateExecutionElapsed();
}

function updateExecutionElapsed() {
  const elapsed = Math.max(0, Date.now() - (replayStartedAt || Date.now()));
  const seconds = Math.floor(elapsed / 1000);
  setText('execution-bar-elapsed', `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`);
}

function throwIfReplayCancelled(signal) {
  if (signal?.aborted) {
    throw signal.reason instanceof Error ? signal.reason : new Error('Replay cancelled');
  }
}

async function replayDelay(ms, signal) {
  throwIfReplayCancelled(signal);
  return await new Promise((resolve, reject) => {
    const finish = () => {
      signal.removeEventListener('abort', abort);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      reject(signal.reason instanceof Error ? signal.reason : new Error('Replay cancelled'));
    };
    signal.addEventListener('abort', abort, { once: true });
  });
}

async function runReplayActionWithTimeout(action, timeoutMs, signal) {
  throwIfReplayCancelled(signal);
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Replay step timeout after ${timeoutMs}ms`)),
      timeoutMs
    );
    const abort = () => reject(
      signal.reason instanceof Error ? signal.reason : new Error('Replay cancelled')
    );
    signal.addEventListener('abort', abort, { once: true });
    replayAction(action).then(resolve, reject).finally(() => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
    });
  });
}

async function captureWebviewScreenshotBase64() {
  try {
    if (!browserWebview || typeof browserWebview.capturePage !== 'function') {
      return null;
    }

    const image = await browserWebview.capturePage();
    if (!image || typeof image.toPNG !== 'function') {
      return null;
    }

    return image.toPNG().toString('base64');
  } catch (error) {
    console.warn('Failed to capture webview screenshot:', error);
    return null;
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

async function resolveInBrowserSelector(action) {
  const locatorActions = new Set([
    'click', 'doubleclick', 'rightclick', 'input', 'select', 'checkbox', 'radio',
    'focus', 'hover', 'submit', 'upload', 'assert',
  ]);
  if (!locatorActions.has(action.type) || !action.selector) {
    return { selector: action.selector, healing: null };
  }

  const payload = JSON.stringify({
    selector: action.selector,
    fingerprint: action.locatorFingerprint || null,
  });
  const result = await browserWebview.executeJavaScript(`
    (function(payload) {
      function safeQuery(selector) {
        try { return document.querySelectorAll(selector); } catch (_) { return null; }
      }
      const direct = safeQuery(payload.selector);
      if (direct && direct.length === 1) {
        return { selector: payload.selector, confidence: 1, healed: false };
      }
      const expected = payload.fingerprint;
      if (!expected) {
        return { error: 'Recorded selector is invalid or missing and no locator fingerprint is available' };
      }
      function normalized(value) {
        return String(value || '').trim().toLowerCase().replace(/\\s+/g, ' ');
      }
      function textScore(left, right) {
        left = normalized(left);
        right = normalized(right);
        if (!left || !right) return 0;
        if (left === right) return 1;
        if (left.includes(right) || right.includes(left)) return 0.8;
        const a = new Set(left.split(' '));
        const b = new Set(right.split(' '));
        const overlap = Array.from(a).filter((token) => b.has(token)).length;
        return overlap / new Set([...a, ...b]).size;
      }
      function generatedId(id) {
        return /^(react-aria|html5_|ember|vue-|id_\\d+|\\d+$)/i.test(String(id || '')) ||
          /[a-f0-9]{12,}/i.test(String(id || ''));
      }
      function selectorFor(element, index) {
        for (const name of ['data-testid', 'data-test', 'data-qa']) {
          const value = element.getAttribute(name);
          if (value) return '[' + name + '="' + CSS.escape(value) + '"]';
        }
        if (element.id && !generatedId(element.id)) return '#' + CSS.escape(element.id);
        const token = 'replay-' + index + '-' + Date.now();
        element.setAttribute('data-chromation-replay-id', token);
        return '[data-chromation-replay-id="' + token + '"]';
      }
      const expectedAttributes = Object.entries(expected.attributes || {})
        .filter(([name, value]) => !(name === 'id' && generatedId(value)));
      const candidates = Array.from(document.querySelectorAll('body *'))
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
        })
        .slice(0, 250)
        .map((element, index) => {
          const attributeScore = expectedAttributes.length === 0 ? 0 :
            expectedAttributes.reduce((sum, [name, value]) =>
              sum + textScore(value, element.getAttribute(name)), 0) / expectedAttributes.length;
          const tagScore = normalized(expected.tagName) === normalized(element.tagName) ? 1 : 0;
          const visibleText = normalized(element.textContent).slice(0, 160);
          const semanticScore = Math.max(
            textScore(expected.accessibleName, element.getAttribute('aria-label')),
            textScore(expected.role, element.getAttribute('role'))
          );
          const confidence =
            attributeScore * 0.4 +
            textScore(expected.text, visibleText) * 0.3 +
            tagScore * 0.2 +
            semanticScore * 0.1;
          return { selector: selectorFor(element, index), confidence };
        })
        .sort((left, right) => right.confidence - left.confidence);
      const best = candidates[0];
      const second = candidates[1];
      if (!best || best.confidence < 0.62) {
        return { error: 'No fingerprint candidate met the 62% confidence threshold', bestConfidence: best?.confidence || 0 };
      }
      if (second && best.confidence - second.confidence < 0.08) {
        return { error: 'Fingerprint match is ambiguous', bestConfidence: best.confidence };
      }
      return {
        selector: best.selector,
        confidence: best.confidence,
        healed: true,
      };
    })(${payload});
  `);

  if (result.error) {
    const confidence = result.bestConfidence
      ? ` (best candidate ${Math.round(result.bestConfidence * 100)}%)`
      : '';
    throw new Error(`${result.error}${confidence}`);
  }
  return {
    selector: result.selector,
    healing: result.healed
      ? {
          originalSelector: action.selector,
          healedSelector: result.selector,
          confidence: result.confidence,
          strategy: 'in-browser-fingerprint-similarity',
          timestamp: Date.now(),
        }
      : null,
  };
}

async function replayAction(action) {
  const originalSelector = action.selector;
  try {
    const resolution = await resolveInBrowserSelector(action);
    action = { ...action, selector: resolution.selector };
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
      
      case 'waitForPageLoad':
        // Wait for page to be fully loaded and interactive
        await new Promise(resolve => setTimeout(resolve, 1000));
        const isReady = await browserWebview.executeJavaScript(`
          (function() {
            return document.readyState === 'complete';
          })();
        `);
        // Additional wait to ensure page is interactive
        if (isReady) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
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
            function findReplayElement(selector, xpath, expectedText) {
              if (xpath) {
                try {
                  const xpNode = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
                  if (xpNode) return xpNode;
                } catch (err) {
                  // ignore xpath parse issues and continue with css fallback
                }
              }

              const direct = document.querySelector(selector);
              if (direct) {
                const all = document.querySelectorAll(selector);
                if (all.length <= 1) return direct;

                if (expectedText) {
                  const match = Array.from(all).find((node) => (node.textContent || '').trim().includes(expectedText));
                  if (match) return match;
                }

                return direct;
              }

              // Fallbacks for dynamic search pages where aria-label selectors can disappear.
              if (selector.includes('[aria-label="Search"]')) {
                return document.querySelector('button[aria-label="Search"], button[type="submit"], input[type="submit"], [role="button"][aria-label*="Search"]');
              }

              return null;
            }

            const element = findReplayElement('${escapeSelector(action.selector)}', '${escapeValue(action.xpath || '')}', '${escapeValue(action.value || '')}');
            if (element) {
              if (element.scrollIntoView) {
                element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
              }
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
            let element = null;
            if ('${escapeValue(action.xpath || '')}') {
              try {
                element = document.evaluate('${escapeValue(action.xpath || '')}', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
              } catch (err) {
                // ignore and continue with css fallback
              }
            }

            if (!element) {
              element = document.querySelector('${escapeSelector(action.selector)}');
            }

            if (element) {
              if (element.tagName === 'FORM') {
                element.submit();
              } else {
                element.click();
              }
              return true;
            }

            // Fallback 1: submit active element's parent form.
            const active = document.activeElement;
            if (active && active.form) {
              if (active.form.requestSubmit) {
                active.form.requestSubmit();
              } else {
                active.form.submit();
              }
              return true;
            }

            // Fallback 2: submit the first available form (common on search pages).
            const form = document.querySelector('form[role="search"], form');
            if (form) {
              if (form.requestSubmit) {
                form.requestSubmit();
              } else {
                form.submit();
              }
              return true;
            }

            throw new Error('Element not found: ${action.selector}');
          })();
        `);
        break;
        
      case 'upload': {
        const recordedFiles = Array.isArray(action.metadata?.files) && action.metadata.files.length > 0
          ? action.metadata.files
          : action.value
            ? [action.value]
            : [];
        const result = await ipcRenderer.invoke('set-upload-files', {
          guestWebContentsId: browserWebview.getWebContentsId(),
          selector: action.selector,
          filePaths: recordedFiles,
        });
        if (!result.success) {
          throw new Error(result.error || 'Unable to set the recorded upload files');
        }
        break;
      }

      case 'drag':
        await browserWebview.executeJavaScript(`
          (function() {
            const source = document.querySelector('${escapeSelector(action.selector)}');
            const target = document.querySelector('${escapeSelector(action.value)}');
            if (!source || !target) {
              throw new Error('Drag source or target element not found');
            }
            const dataTransfer = new DataTransfer();
            source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer }));
            target.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer }));
            target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }));
            target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
            source.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer }));
            return true;
          })();
        `);
        break;

      default:
        throw new Error('Unsupported action type for in-browser replay: ' + action.type);
    }
    return { healing: resolution.healing };
  } catch (error) {
    console.error('Failed to replay action:', action, error);
    throw new Error(`Failed to replay ${action.type} on ${originalSelector}: ${error.message}`);
  }
}

function escapeSelector(selector) {
  return String(selector || '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
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
    await startScraping(scraperSelector.value, {
      fields: document.getElementById('scraper-fields')?.value || '',
      nextSelector: document.getElementById('scraper-next-selector')?.value || '',
      maxPages: Number(document.getElementById('scraper-max-pages')?.value || 1),
      infiniteScroll: document.getElementById('scraper-infinite-scroll')?.checked,
    });
  });
  
  exportCsvBtn.addEventListener('click', () => {
    exportScrapedData('csv');
  });
  
  exportJsonBtn.addEventListener('click', () => {
    exportScrapedData('json');
  });
  exportExcelBtn?.addEventListener('click', () => exportScrapedData('excel'));
  cancelScrapeBtn?.addEventListener('click', () => scraperStudio.cancel());
}

async function startScraping(selector, options = {}) {
  if (!scraperStudio || !selector) return;
  
  statusText.textContent = 'Scraping data...';
  
  const mappings = String(options.fields || '').split(/\r?\n/).map((line) => {
    const [name, fieldSelector] = line.split('=');
    return { name: name?.trim(), selector: fieldSelector?.trim() };
  }).filter((field) => field.name);
  const records = await browserWebview.executeJavaScript(`(() => {
    const rows = Array.from(document.querySelectorAll('${escapeSelector(selector)}'));
    const mappings = ${JSON.stringify(mappings)};
    return rows.map((row) => {
      if (!mappings.length) return { text: (row.textContent || '').trim() };
      return Object.fromEntries(mappings.map((field) => [
        field.name, ((field.selector ? row.querySelector(field.selector) : row)?.textContent || '').trim()
      ]));
    });
  })()`);
  const data = await scraperStudio.ingestData(records, selector);
  
  displayScrapedData(data.records);
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
  
  const mime = format === 'csv' ? 'text/csv' : format === 'excel' ? 'application/vnd.ms-excel' : 'application/json';
  const blob = new Blob([data], { type: mime });
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
  const menuHealing = document.getElementById('menu-healing');
  const statusSpan = menuHealing?.querySelector('.menu-status');
  
  if (isEnabled) {
    healingEngine.disable();
    if (statusSpan) statusSpan.textContent = 'OFF';
    if (statusSpan) statusSpan.style.color = '#ea4335';
    healingStatus.textContent = '🔧 Auto-heal: OFF';
  } else {
    healingEngine.enable();
    if (statusSpan) statusSpan.textContent = 'ON';
    if (statusSpan) statusSpan.style.color = '#34a853';
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

ipcRenderer.on('toggle-healing', (enabled) => {
  if (healingEngine) {
    const menuHealing = document.getElementById('menu-healing');
    const statusSpan = menuHealing?.querySelector('.menu-status');
    
    if (enabled) {
      healingEngine.enable();
      if (statusSpan) statusSpan.textContent = 'ON';
      if (statusSpan) statusSpan.style.color = '#34a853';
      healingStatus.textContent = '🔧 Auto-heal: ON';
    } else {
      healingEngine.disable();
      if (statusSpan) statusSpan.textContent = 'OFF';
      if (statusSpan) statusSpan.style.color = '#ea4335';
      healingStatus.textContent = '🔧 Auto-heal: OFF';
    }
  }
});

// ===== PHASE 1 WORKSPACE & COMMANDS =====
const homeWorkspace = document.getElementById('home-workspace');
let commandSelection = 0;

const phase1Commands = [
  { label: 'Open workspace', hint: 'Project health and recent activity', shortcut: 'Ctrl+Shift+B', run: () => showHomeWorkspace() },
  { label: 'Browse current page', hint: 'Return to browser', shortcut: '', run: () => showBrowseWorkspace() },
  { label: 'Open Inspector', hint: 'Discover resilient locators', shortcut: 'Ctrl+Shift+I', run: () => toggleTool('inspector') },
  { label: 'Open Recorder', hint: 'Capture a browser flow', shortcut: 'Ctrl+Shift+R', run: () => toggleTool('recorder') },
  { label: 'Open Suites', hint: 'Organize recordings and run browser matrices', shortcut: '', run: () => showSuitesWorkspace() },
  { label: 'Replay current recording', hint: 'Run captured actions', shortcut: 'Ctrl+Enter', run: () => replayActions() },
  { label: 'Open Scraper', hint: 'Extract structured page data', shortcut: 'Ctrl+Shift+S', run: () => toggleTool('scraper') },
  { label: 'Open Reports', hint: 'Review execution history', shortcut: 'Ctrl+Shift+P', run: () => showRunHistoryPanel() },
  { label: 'Saved Recordings', hint: 'Open and replay saved flows', shortcut: '', run: () => showSavedRecordings() },
  { label: 'Browsing History', hint: 'Search and manage visited pages', shortcut: 'Ctrl+H', run: () => showBrowsingHistory() },
  { label: 'Help & Shortcuts', hint: 'Search in-product guidance and commands', shortcut: 'F1', run: () => showHelp() },
  { label: 'System Diagnostics', hint: 'Versions, storage, permissions, and health', shortcut: '', run: () => showDiagnostics() },
  { label: 'Replay Onboarding', hint: 'Record, replay, and report walkthrough', shortcut: '', run: () => openOnboarding(true) },
  { label: 'Plugin Settings', hint: 'Manage automation extensions', shortcut: 'Ctrl+,', run: () => { showBrowseWorkspace(); sidePanel.classList.add('open'); showPluginsPanel(); } },
  { label: 'Toggle Theme', hint: 'Light, dark, or system', shortcut: '', run: () => toggleTheme() }
];

function showBrowseWorkspace() {
  homeWorkspace?.classList.add('hidden');
  hideReportWorkspace();
  setActiveRailAction('browse');
  const tab = tabs?.find?.((item) => item.id === activeTabId);
  if (tab) tab.uiState = { ...(tab.uiState || {}), workspace: 'browse' };
}

async function showHomeWorkspace() {
  reportWorkspace?.classList.add('hidden');
  browserView?.classList.add('hidden');
  homeWorkspace?.classList.remove('hidden');
  sidePanel.classList.remove('open');
  setActiveRailAction('browse');
  const tab = tabs?.find?.((item) => item.id === activeTabId);
  if (tab) tab.uiState = { ...(tab.uiState || {}), workspace: 'home', panelOpen: false };
  await refreshHomeWorkspace();
}

async function refreshHomeWorkspace() {
  await hydrateRunHistory();
  let recordings = [];
  let reports = [];
  let analytics = {};
  try {
    const loaded = await ipcRenderer.invoke('load-recordings');
    recordings = Array.isArray(loaded) ? loaded : (loaded?.recordings || []);
  } catch (_) {}
  try {
    reports = reporter?.searchHistory ? await reporter.searchHistory({}) : [];
    analytics = reporter?.getRunAnalytics ? await reporter.getRunAnalytics() : {};
  } catch (_) {}
  reports = Array.isArray(reports) ? reports : [];
  const failed = Number(analytics.failedRuns ?? reports.filter((run) => run.status === 'failed' || Number(run.failed) > 0).length);
  const healed = Number(analytics.healed ?? analytics.healedLocators ?? reports.reduce((sum, run) => sum + Number(run.healed || 0), 0));
  const passed = Number(analytics.passedRuns ?? reports.filter((run) => run.status === 'passed').length);
  const completed = Number(analytics.completedRuns ?? (passed + failed));
  const rate = completed ? Math.round((passed / completed) * 100) : 0;
  setText('home-health-score', `${rate}%`);
  setText('home-run-count', reports.length);
  setText('home-failure-count', failed);
  setText('home-healed-count', healed);
  setText('rail-failure-count', failed);
  setText('rail-healing-count', healed);
  renderHomeRecordings(recordings.slice(0, 5));
  renderRecentList('home-recent-runs', reports.slice(0, 6), (item) => ({
    title: item.title || item.name || item.runId || 'Test run',
    meta: item.duration ? `${item.duration} ms` : (item.startedAt || item.createdAt || ''),
    status: item.status || (Number(item.failed) > 0 ? 'failed' : 'passed')
  }));
  updatePhase1Badges();
}

function renderHomeRecordings(recordings) {
  const target = document.getElementById('home-recent-recordings');
  if (!target) return;
  if (!recordings.length) {
    target.innerHTML = '<div class="home-empty"><span>●</span><strong>No recordings yet</strong><p>Start recording a browser flow and it will be ready to reuse here.</p><button data-empty-record>Start recording</button></div>';
    target.querySelector('[data-empty-record]')?.addEventListener('click', () => { showBrowseWorkspace(); toggleTool('recorder'); });
    return;
  }
  target.innerHTML = recordings.map((recording) => {
    const name = recording.name || recording.title || getSuggestedRecordingName(recording.actions);
    const count = recording.actionCount ?? recording.actions?.length ?? 0;
    const date = new Date(recording.createdAt || recording.timestamp || Date.now()).toLocaleDateString();
    const filename = escapeReportText(recording.filename);
    return `<article class="recording-row" data-filename="${filename}">
      <button class="recording-main home-load-recording" data-filename="${filename}" title="Open ${escapeReportText(name)}">
        <span class="recording-avatar">${escapeReportText(getRecordingInitials(name))}</span>
        <span><strong>${escapeReportText(name)}</strong><small>${count} actions · Updated ${date}</small></span>
      </button>
      <div class="recording-row-actions">
        <button class="home-replay-recording" data-filename="${filename}" title="Replay recording" aria-label="Replay ${escapeReportText(name)}">▶</button>
        <button class="home-rename-recording" data-filename="${filename}" data-name="${escapeReportText(name)}" title="Rename recording" aria-label="Rename ${escapeReportText(name)}">✎</button>
        <button class="home-delete-recording danger-icon-btn" data-filename="${filename}" title="Delete recording" aria-label="Delete ${escapeReportText(name)}">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    </article>`;
  }).join('');
  target.querySelectorAll('.home-load-recording').forEach((button) => button.addEventListener('click', () => loadRecording(button.dataset.filename)));
  target.querySelectorAll('.home-replay-recording').forEach((button) => button.addEventListener('click', () => loadAndReplayRecording(button.dataset.filename)));
  target.querySelectorAll('.home-rename-recording').forEach((button) => button.addEventListener('click', async () => {
    const name = await requestRecordingName(button.dataset.name, 'Rename recording');
    if (!name || name === button.dataset.name) return;
    const result = await ipcRenderer.invoke('rename-recording', { filename: button.dataset.filename, name });
    if (result.success) { showToast(`Renamed to "${name}"`, 'success'); await refreshHomeWorkspace(); }
    else showToast(result.error || 'Could not rename recording', 'error');
  }));
  target.querySelectorAll('.home-delete-recording').forEach((button) => button.addEventListener('click', async () => {
    if (!await requestConfirmation('This recording and its saved steps will be permanently removed.', 'Delete recording?', 'Delete')) return;
    await deleteRecording(button.dataset.filename);
    await refreshHomeWorkspace();
  }));
}

function getRecordingInitials(name) {
  return String(name || 'Test').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function renderRecentList(id, items, mapper) {
  const target = document.getElementById(id);
  if (!target) return;
  if (!items.length) {
    target.innerHTML = '<p class="empty-state">Nothing here yet. Your next run will appear here.</p>';
    return;
  }
  target.innerHTML = items.map((raw) => {
    const item = mapper(raw);
    const statusClass = String(item.status).toLowerCase();
    return `<div class="recent-item"><strong>${escapeReportText(item.title)}</strong><span class="recent-status ${statusClass}">${escapeReportText(item.status)}</span><small>${escapeReportText(item.meta)}</small></div>`;
  }).join('');
}

function setText(id, value) {
  const target = document.getElementById(id);
  if (target) target.textContent = String(value);
}

function updatePhase1Badges() {
  const actionCount = recorder?.getActions ? recorder.getActions().length : (recordedActions?.length || 0);
  setText('rail-action-count', actionCount);
  document.getElementById('rail-recording-badge')?.classList.toggle('hidden', !isRecording);
}

function openCommandPalette() {
  const palette = document.getElementById('command-palette');
  const input = document.getElementById('command-input');
  palette?.classList.remove('hidden');
  if (input) { input.value = ''; input.focus(); }
  renderCommandResults('');
}

function closeCommandPalette() {
  document.getElementById('command-palette')?.classList.add('hidden');
}

function getFilteredCommands(query) {
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  return phase1Commands.filter((command) => words.every((word) => `${command.label} ${command.hint}`.toLowerCase().includes(word)));
}

function renderCommandResults(query) {
  const results = document.getElementById('command-results');
  if (!results) return;
  const commands = getFilteredCommands(query);
  commandSelection = Math.min(commandSelection, Math.max(0, commands.length - 1));
  results.innerHTML = commands.length ? commands.map((command, index) =>
    `<button class="command-item ${index === commandSelection ? 'active' : ''}" data-command-index="${phase1Commands.indexOf(command)}" role="option"><span><strong>${escapeReportText(command.label)}</strong><small>${escapeReportText(command.hint)}</small></span><kbd>${escapeReportText(command.shortcut)}</kbd></button>`
  ).join('') : '<p class="empty-state">No matching commands.</p>';
  results.querySelectorAll('.command-item').forEach((button) => button.addEventListener('click', () => runCommand(Number(button.dataset.commandIndex))));
}

function runCommand(index) {
  closeCommandPalette();
  phase1Commands[index]?.run();
}

function captureActiveTabUIState() {
  const tab = tabs.find((item) => item.id === activeTabId);
  if (!tab) return;
  tab.uiState = {
    ...(tab.uiState || {}),
    activeTool: sidePanel.dataset.currentTool || null,
    panelOpen: sidePanel.classList.contains('open'),
    panelScrollTop: panelContent.scrollTop
  };
}

function restoreTabUIState(tab) {
  sidePanel.classList.remove('open');
  if (!tab?.uiState?.panelOpen || !tab.uiState.activeTool) {
    setActiveRailAction('browse');
    return;
  }
  toggleTool(tab.uiState.activeTool);
  sidePanel.classList.add('open');
  requestAnimationFrame(() => { panelContent.scrollTop = tab.uiState.panelScrollTop || 0; });
}

// ===== TAB MANAGEMENT =====
let tabs = [];
let activeTabId = 1;
let nextTabId = 2;

// Initialize first tab
tabs.push({
  id: 1,
  title: 'Workspace',
  url: 'https://duckduckgo.com',
  uiState: { workspace: 'home', activeTool: null, panelOpen: false, panelScrollTop: 0 },
  favicon: '🦆'
});

// Tab management functions
function createNewTab() {
  const tabId = nextTabId++;
  const newTab = {
    id: tabId,
    title: 'New Tab',
    url: 'https://duckduckgo.com',
    uiState: { workspace: 'browse', activeTool: null, panelOpen: false, panelScrollTop: 0 },
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
    switchToTab(newActiveTab.id);
    return;
  }
  
  renderTabs();
  updateAddressBar();
}

function switchToTab(tabId) {
  captureActiveTabUIState();
  activeTabId = tabId;
  const tab = tabs.find(t => t.id === tabId);
  
  if (tab) {
    renderTabs();
    if (tab.type === 'report') {
      homeWorkspace?.classList.add('hidden');
      showReportWorkspace();
      urlInput.value = tab.url;
    } else {
      hideReportWorkspace();
      if (tab.uiState?.workspace === 'home') {
        showHomeWorkspace();
      } else {
        homeWorkspace?.classList.add('hidden');
        browserView?.classList.remove('hidden');
        navigateToUrl(tab.url);
        restoreTabUIState(tab);
      }
    }
  }
}

function updateActiveTabInfo(title, url, favicon) {
  const tab = tabs.find(t => t.id === activeTabId);
  if (tab && tab.type !== 'report') {
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

// ===== MENU FUNCTIONS =====

// Theme management
let currentTheme = 'system'; // 'light', 'dark', or 'system'

function initTheme() {
  // Load saved theme preference
  const savedTheme = localStorage.getItem('chromation-theme') || 'system';
  applyTheme(savedTheme);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    if (currentTheme === 'system') applyTheme('system');
  });
}

function applyVisualPreferences() {
  const density = localStorage.getItem('chromation-density') || 'comfortable';
  const reduceMotion = localStorage.getItem('chromation-reduce-motion') === 'true';
  const lowPerformance = localStorage.getItem('chromation-low-performance') === 'true';
  document.documentElement.dataset.density = density;
  document.documentElement.classList.toggle('reduce-motion', reduceMotion);
  document.documentElement.classList.toggle('low-performance', lowPerformance);
}

function bindVisualPreferenceControls() {
  const density = document.getElementById('ui-density-select');
  const reduceMotion = document.getElementById('ui-reduce-motion');
  const lowPerformance = document.getElementById('ui-low-performance');
  if (density) density.value = localStorage.getItem('chromation-density') || 'comfortable';
  if (reduceMotion) reduceMotion.checked = localStorage.getItem('chromation-reduce-motion') === 'true';
  if (lowPerformance) lowPerformance.checked = localStorage.getItem('chromation-low-performance') === 'true';
  density?.addEventListener('change', () => { localStorage.setItem('chromation-density', density.value); applyVisualPreferences(); });
  reduceMotion?.addEventListener('change', () => { localStorage.setItem('chromation-reduce-motion', String(reduceMotion.checked)); applyVisualPreferences(); });
  lowPerformance?.addEventListener('change', () => { localStorage.setItem('chromation-low-performance', String(lowPerformance.checked)); applyVisualPreferences(); });
}

const onboardingSteps = [
  { icon: '●', title: 'Record a real browser flow', copy: 'Open the site you want to test, choose Record, and interact normally. Chromation captures actions and resilient locator fingerprints.' },
  { icon: '▶', title: 'Replay with control', copy: 'Review and edit the timeline, choose the replay engine, then run. Pause, step, retry, and automatic locator healing stay visible throughout execution.' },
  { icon: '▤', title: 'Act on the report', copy: 'Every run produces an actionable report with failures, evidence, healing events, timing, exports, and persistent history.' },
];
let onboardingIndex = 0;

function openOnboarding(force = false) {
  if (!force && localStorage.getItem('chromation-onboarding-complete') === 'true') return;
  onboardingIndex = 0;
  document.getElementById('onboarding-dialog')?.classList.remove('hidden');
  renderOnboardingStep();
}

function renderOnboardingStep() {
  const step = onboardingSteps[onboardingIndex];
  setText('onboarding-eyebrow', `STEP ${onboardingIndex + 1} OF ${onboardingSteps.length}`);
  setText('onboarding-title', step.title);
  setText('onboarding-copy', step.copy);
  setText('onboarding-visual', step.icon);
  const dots = document.getElementById('onboarding-dots');
  if (dots) dots.innerHTML = onboardingSteps.map((_, index) => `<span class="${index === onboardingIndex ? 'active' : ''}"></span>`).join('');
  document.getElementById('onboarding-back')?.classList.toggle('hidden', onboardingIndex === 0);
  setText('onboarding-next', onboardingIndex === onboardingSteps.length - 1 ? 'Start testing' : 'Next');
}

function completeOnboarding() {
  localStorage.setItem('chromation-onboarding-complete', 'true');
  document.getElementById('onboarding-dialog')?.classList.add('hidden');
}

function bindOnboarding() {
  document.getElementById('onboarding-next')?.addEventListener('click', () => {
    if (onboardingIndex === onboardingSteps.length - 1) { completeOnboarding(); showHomeWorkspace(); return; }
    onboardingIndex++; renderOnboardingStep();
  });
  document.getElementById('onboarding-back')?.addEventListener('click', () => { onboardingIndex = Math.max(0, onboardingIndex - 1); renderOnboardingStep(); });
  document.getElementById('onboarding-skip')?.addEventListener('click', completeOnboarding);
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

async function showPluginsPanel() {
  panelTitle.textContent = 'Plugins';
  const template = document.getElementById('plugins-panel-template');
  panelContent.innerHTML = template.innerHTML;
  bindVisualPreferenceControls();
  const refresh = async () => {
    const plugins = await pluginManager.list();
    const list = document.getElementById('installed-plugin-list');
    const count = document.getElementById('plugin-count');
    if (count) count.textContent = String(plugins.length);
    if (!list) return;
    list.innerHTML = plugins.length ? plugins.map((plugin) => `
      <article class="plugin-card">
        <div><strong>${escapeReportText(plugin.manifest.name)}</strong><span>${escapeReportText(plugin.manifest.id)} · v${escapeReportText(plugin.manifest.version)}</span></div>
        <span class="step-status ${plugin.enabled ? 'passed' : 'skipped'}">${plugin.enabled ? 'Enabled' : 'Disabled'}</span>
        <p>${escapeReportText(plugin.manifest.description || 'No description')}</p>
        <p><b>Permissions:</b> ${plugin.manifest.permissions.map(escapeReportText).join(', ') || 'None'}</p>
        ${plugin.lastError ? `<div class="screenshot-capture-error">${escapeReportText(plugin.lastError)}</div>` : ''}
        <div class="button-group">
          <button class="secondary-btn" data-plugin-toggle="${escapeReportText(plugin.manifest.id)}" data-plugin-enabled="${plugin.enabled}">${plugin.enabled ? 'Disable' : 'Enable'}</button>
          <button class="secondary-btn" data-plugin-remove="${escapeReportText(plugin.manifest.id)}">Uninstall</button>
        </div>
      </article>`).join('') : '<p class="hint">No plugins installed.</p>';
    list.querySelectorAll('[data-plugin-toggle]').forEach((button) => button.addEventListener('click', async () => {
      try {
        if (button.dataset.pluginEnabled === 'true') await pluginManager.disable(button.dataset.pluginToggle);
        else await pluginManager.enable(button.dataset.pluginToggle);
        await refresh();
      } catch (error) { showToast(error.message, 'error'); }
    }));
    list.querySelectorAll('[data-plugin-remove]').forEach((button) => button.addEventListener('click', async () => {
      await pluginManager.uninstall(button.dataset.pluginRemove);
      await refresh();
    }));
  };
  document.getElementById('install-plugin-btn')?.addEventListener('click', async () => {
    const errorTarget = document.getElementById('plugin-install-error');
    try {
      const manifest = JSON.parse(document.getElementById('plugin-manifest-json')?.value || '{}');
      const source = document.getElementById('plugin-source-code')?.value || '';
      const approved = document.getElementById('approve-plugin-permissions')?.checked
        ? manifest.permissions || [] : [];
      await pluginManager.install({ manifest, source }, approved);
      if (errorTarget) errorTarget.textContent = '';
      await refresh();
      showToast('Plugin installed. Enable it when ready.', 'success');
    } catch (error) {
      if (errorTarget) errorTarget.textContent = error.message;
    }
  });
  refresh();
}

async function showLegacyRunHistoryPanel() {
  showBrowseWorkspace();
  if (!reporter?.searchHistory) return showToast('Run history is not available', 'error');
  panelTitle.textContent = 'Run History';
  const reports = await reporter.searchHistory({});
  const analytics = await reporter.getRunAnalytics();
  panelContent.innerHTML = `<div class="tool-panel">
    <div class="panel-section"><input id="run-history-search" class="form-input" placeholder="Search runs, steps, selectors, or errors"></div>
    <div class="panel-card"><div class="card-header"><h5>Analytics</h5><span class="badge">${analytics.runs} runs</span></div>
      <div class="card-content"><p>${Math.round(analytics.passRate * 100)}% pass rate · ${Math.round(analytics.averageDuration)}ms average · ${analytics.healingFrequency.toFixed(1)} heals/run</p>
      <p>${analytics.flakySteps.length} flaky steps detected</p></div></div>
    <div id="run-history-results">${renderRunHistoryItems(reports)}</div></div>`;
  sidePanel.dataset.currentTool = 'reports';
  sidePanel.classList.add('open');
  setActiveRailAction('reports');
  document.getElementById('run-history-search')?.addEventListener('input', async (event) => {
    const matches = await reporter.searchHistory({ text: event.target.value });
    document.getElementById('run-history-results').innerHTML = renderRunHistoryItems(matches);
  });
}

function renderRunHistoryItems(reports) {
  if (!reports.length) return '<div class="empty-state"><p>No execution reports yet</p></div>';
  return reports.map((report) => `<article class="panel-card"><div class="card-header"><h5>${escapeReportText(report.testName)}</h5><span class="step-status ${report.status}">${report.status}</span></div>
    <div class="card-content"><p>${new Date(report.startTime).toLocaleString()} · ${report.duration}ms · ${report.healingEvents} heals</p>
    <p>${report.steps.filter((step) => step.status === 'failed').length} failed · ${report.steps.filter((step) => step.status === 'cancelled').length} cancelled</p></div></article>`).join('');
}

async function showRunHistoryPanel() {
  showBrowseWorkspace();
  if (!reporter?.searchHistory) return showToast('Run history is not available', 'error');
  panelTitle.textContent = 'Reports';
  panelContent.innerHTML = '<div class="loading-state">Loading execution history…</div>';
  sidePanel.dataset.currentTool = 'reports';
  sidePanel.classList.add('open');
  setActiveRailAction('reports');
  try {
    await hydrateRunHistory();
    const reports = await reporter.searchHistory({});
    const analytics = await reporter.getRunAnalytics();
    panelContent.innerHTML = `<div class="tool-panel">
      <div class="report-center-header"><div><p class="eyebrow">EXECUTION INTELLIGENCE</p><h3>Run history</h3><p>Open a run to inspect failures, evidence, and healing activity.</p></div><button class="secondary-btn" id="refresh-run-history">Refresh</button></div>
      <div class="report-center-metrics"><article title="All runs, including cancelled runs"><span>Total runs</span><strong>${analytics.runs}</strong><small>${analytics.completedRuns} completed</small></article><article title="Passed runs divided by passed plus failed runs. Cancelled runs are excluded."><span>Run pass rate</span><strong>${formatPassRate(analytics.passRate)}</strong><small>${analytics.passedRuns} passed · ${analytics.failedRuns} failed</small></article><article title="Passed steps divided by passed plus failed steps"><span>Step pass rate</span><strong>${formatPassRate(analytics.stepPassRate)}</strong><small>Across completed steps</small></article><article><span>Avg. duration</span><strong>${formatRunDuration(analytics.averageDuration)}</strong><small>Per run</small></article><article><span>Heals / run</span><strong>${analytics.healingFrequency.toFixed(1)}</strong><small>Locator recoveries</small></article></div>
      <div class="panel-section report-search-row"><input id="run-history-search" class="form-input" placeholder="Search runs, steps, selectors, or errors"><select id="run-history-status" class="form-select"><option value="">All statuses</option><option value="passed">Passed</option><option value="failed">Failed</option><option value="cancelled">Cancelled</option></select></div>
      <div id="run-history-results">${renderReportsCenterItems(reports)}</div></div>`;
    bindRunHistoryInteractions();
  } catch (error) {
    panelContent.innerHTML = `<div class="report-load-error"><strong>Reports could not be loaded</strong><p>${escapeReportText(error.message)}</p><button class="secondary-btn" id="retry-run-history">Try again</button></div>`;
    document.getElementById('retry-run-history')?.addEventListener('click', showRunHistoryPanel);
  }
}

function formatRunDuration(value) {
  const duration = Number(value || 0);
  return duration >= 1000 ? `${(duration / 1000).toFixed(duration >= 10000 ? 0 : 1)}s` : `${Math.round(duration)}ms`;
}

function formatPassRate(value) {
  const percentage = Math.max(0, Math.min(100, Number(value || 0) * 100));
  return `${percentage.toFixed(percentage % 1 === 0 ? 0 : 1)}%`;
}

function renderReportsCenterItems(reports) {
  window.__chromationVisibleReports = reports;
  if (!reports.length) return '<div class="report-history-empty"><strong>No execution reports yet</strong><p>Replay a recording and its complete report will appear here automatically.</p><button class="primary-btn" data-open-tool="recorder">Open Recorder</button></div>';
  return reports.map((report, index) => {
    const failed = report.steps.filter((step) => step.status === 'failed').length;
    const passed = report.steps.filter((step) => step.status === 'passed').length;
    return `<button class="run-history-item" data-run-history-index="${index}"><span class="run-status-dot ${report.status}"></span><span class="run-summary"><strong>${escapeReportText(report.testName)}</strong><small>${new Date(report.startTime).toLocaleString()} · ${report.steps.length} steps · ${formatRunDuration(report.duration)}</small></span><span class="run-results"><b>${passed} passed</b><em>${failed} failed</em><small>${report.healingEvents || 0} healed</small></span><span class="run-chevron">›</span></button>`;
  }).join('');
}

function bindRunHistoryInteractions() {
  const refresh = async () => {
    const text = document.getElementById('run-history-search')?.value || '';
    const status = document.getElementById('run-history-status')?.value || undefined;
    const matches = await reporter.searchHistory({ text, status });
    const target = document.getElementById('run-history-results');
    if (target) target.innerHTML = renderReportsCenterItems(matches);
    bindRunHistoryItemClicks();
  };
  document.getElementById('run-history-search')?.addEventListener('input', refresh);
  document.getElementById('run-history-status')?.addEventListener('change', refresh);
  document.getElementById('refresh-run-history')?.addEventListener('click', showRunHistoryPanel);
  bindRunHistoryItemClicks();
}

function bindRunHistoryItemClicks() {
  document.querySelectorAll('[data-run-history-index]').forEach((button) => button.addEventListener('click', () => {
    const report = window.__chromationVisibleReports?.[Number(button.dataset.runHistoryIndex)];
    if (report) openHistoricalReport(report);
  }));
}

function openHistoricalReport(report) {
  const steps = report.steps.map((step, index) => ({
    index: step.index ?? index,
    action: { type: step.actionType || step.name, selector: step.selector || '' },
    status: step.status,
    durationMs: step.duration || 0,
    retries: step.retries || 0,
    error: step.error || null,
    healing: step.healing || null,
    evidence: step.screenshot ? { screenshotBase64: step.screenshot } : undefined,
  }));
  const passed = steps.filter((step) => step.status === 'passed').length;
  const failed = steps.filter((step) => step.status === 'failed').length;
  latestReportViewModel = {
    runId: report.runId || `${report.testName}_${report.startTime}`,
    status: report.status,
    startedAt: report.startTime,
    endedAt: report.endTime,
    durationMs: report.duration,
    total: steps.length,
    passed,
    failed,
    skipped: steps.filter((step) => ['skipped', 'cancelled'].includes(step.status)).length,
    healed: report.healingEvents || 0,
    passRate: steps.length ? Math.round((passed / steps.length) * 1000) / 10 : 0,
    steps,
    consoleLogs: report.consoleLogs || [],
    networkSummary: report.networkLogs || [],
    runError: null,
    sourceRecordingFilename: report.sourceRecordingFilename || null,
    replayEngine: report.replayEngine || 'webview',
  };
  lastReplayExecutionReport = report;
  const existing = tabs.find((tab) => tab.type === 'report' && tab.runId === latestReportViewModel.runId);
  const reportTab = existing || { id: nextTabId++, type: 'report', runId: latestReportViewModel.runId, title: `Report · ${report.status}`, url: `chromation://report/${encodeURIComponent(latestReportViewModel.runId)}`, favicon: failed ? '×' : '✓' };
  if (!existing) tabs.push(reportTab);
  activeTabId = reportTab.id;
  renderTabs();
  showReportWorkspace();
  urlInput.value = reportTab.url;
}

function showLegacyBrowsingHistory() {
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

async function showBrowsingHistory() {
  showBrowseWorkspace();
  panelTitle.textContent = 'Browsing History';
  panelContent.innerHTML = '<div class="loading-state">Loading browsing history…</div>';
  sidePanel.dataset.currentTool = 'history';
  sidePanel.classList.add('open');
  try {
    const result = await ipcRenderer.invoke('load-browsing-history');
    if (!result.success) throw new Error(result.error || 'History could not be loaded');
    renderBrowsingHistoryPanel(result.entries || []);
  } catch (error) {
    panelContent.innerHTML = `<div class="report-load-error"><strong>History could not be loaded</strong><p>${escapeReportText(error.message)}</p><button id="retry-browsing-history" class="secondary-btn">Try again</button></div>`;
    document.getElementById('retry-browsing-history')?.addEventListener('click', showBrowsingHistory);
  }
}

function renderBrowsingHistoryPanel(entries, query = '') {
  const normalized = query.toLowerCase().trim();
  const filtered = entries.filter((entry) => !normalized || `${entry.title} ${entry.url}`.toLowerCase().includes(normalized));
  window.__chromationBrowsingHistory = entries;
  panelContent.innerHTML = `<div class="tool-panel browsing-history-panel">
    <div class="history-heading"><div><p class="eyebrow">PRIVATE TO THIS DEVICE</p><h3>Browsing history</h3><p>${entries.length} saved visit${entries.length === 1 ? '' : 's'}</p></div>${entries.length ? '<button id="clear-browsing-history" class="secondary-btn danger-text">Clear all</button>' : ''}</div>
    <div class="history-search"><input id="browsing-history-search" class="form-input" type="search" value="${escapeReportText(query)}" placeholder="Search page titles or URLs"></div>
    <div id="browsing-history-results">${renderBrowsingHistoryGroups(filtered, entries)}</div>
  </div>`;
  document.getElementById('browsing-history-search')?.addEventListener('input', (event) => renderBrowsingHistoryPanel(entries, event.target.value));
  document.getElementById('clear-browsing-history')?.addEventListener('click', async () => {
    if (!await requestConfirmation('All saved browsing visits will be removed from this device.', 'Clear browsing history?', 'Clear history')) return;
    const result = await ipcRenderer.invoke('clear-browsing-history');
    if (result.success) { showToast('Browsing history cleared', 'success'); renderBrowsingHistoryPanel([]); }
    else showToast(result.error || 'History could not be cleared', 'error');
  });
  bindBrowsingHistoryItems(entries);
  requestAnimationFrame(() => {
    const search = document.getElementById('browsing-history-search');
    if (search && query) { search.focus(); search.setSelectionRange(query.length, query.length); }
  });
}

function renderBrowsingHistoryGroups(filtered, allEntries) {
  if (!allEntries.length) return '<div class="history-empty"><span>◷</span><strong>No browsing history yet</strong><p>Pages you visit in Chromation will appear here.</p></div>';
  if (!filtered.length) return '<div class="history-empty"><strong>No matching visits</strong><p>Try a different page title, domain, or URL.</p></div>';
  const groups = new Map();
  filtered.forEach((entry) => {
    const date = new Date(entry.timestamp);
    const today = new Date();
    const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
    const day = date.toDateString() === today.toDateString() ? 'Today' : date.toDateString() === yesterday.toDateString() ? 'Yesterday' : date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day).push(entry);
  });
  return [...groups.entries()].map(([day, visits]) => `<section class="history-day"><h4>${day}</h4>${visits.map((entry) => {
    const index = allEntries.findIndex((item) => item.id === entry.id);
    let host = entry.url;
    try { host = new URL(entry.url).hostname.replace(/^www\./, ''); } catch (_) {}
    return `<article class="history-entry"><button class="history-open" data-history-index="${index}"><span class="history-favicon">${escapeReportText(host.charAt(0).toUpperCase())}</span><span><strong>${escapeReportText(entry.title || host)}</strong><small>${escapeReportText(host)} · ${new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></span></button><button class="history-delete" data-history-id="${escapeReportText(entry.id)}" title="Remove from history" aria-label="Remove ${escapeReportText(entry.title)} from history">×</button></article>`;
  }).join('')}</section>`).join('');
}

function bindBrowsingHistoryItems(entries) {
  document.querySelectorAll('[data-history-index]').forEach((button) => button.addEventListener('click', () => {
    const entry = entries[Number(button.dataset.historyIndex)];
    if (entry) { showBrowseWorkspace(); closePanel(); navigateToUrl(entry.url); }
  }));
  document.querySelectorAll('[data-history-id]').forEach((button) => button.addEventListener('click', async () => {
    const result = await ipcRenderer.invoke('delete-browsing-history-entry', button.dataset.historyId);
    if (!result.success) return showToast(result.error || 'Visit could not be removed', 'error');
    renderBrowsingHistoryPanel(entries.filter((entry) => entry.id !== button.dataset.historyId));
  }));
}

function showLegacyHelp() {
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
        <button class="primary-btn" data-external-url="https://github.com/IamBlackShifu/Chromation-AutoHeal-Browser">
          View on GitHub
        </button>
      </div>
    </div>
  `;
  sidePanel.classList.add('open');
}

const inAppHelpTopics = [
  { title: 'Record a test', category: 'Workflow', keywords: 'capture actions fingerprint save', body: 'Open a website, select Record, then Start Recording. Stop, review the timeline, and save with a descriptive name.' },
  { title: 'Choose a replay engine', category: 'Replay', keywords: 'webview playwright difference frames ci evidence', body: 'Use In-Browser Replay for fast interactive debugging. Use Playwright for CI, frames, advanced steps, richer evidence, accessibility, API, visual, and performance tests.' },
  { title: 'Fix a failed locator', category: 'Healing', keywords: 'selector not found timeout heal confidence', body: 'Open the failed step, inspect its fingerprint fallbacks, review the healing comparison, and promote the recovered locator when it identifies the intended element.' },
  { title: 'Understand reports', category: 'Reports', keywords: 'failure screenshot export pass rate history', body: 'Reports separate run and step pass rates and include failure evidence, healing events, timing, console and network context, and export formats.' },
  { title: 'Keyboard shortcuts', category: 'Reference', keywords: 'keys commands ctrl', body: 'Ctrl+K Commands · Ctrl+Shift+R Recorder · Ctrl+Shift+I Inspector · Ctrl+Shift+S Scraper · Ctrl+Shift+P Reports · Ctrl+H History · Ctrl+Enter Replay · Escape Close.' },
  { title: 'File uploads', category: 'Actions', keywords: 'upload file chooser device', body: 'Recorded uploads store file metadata. At replay time Chromation validates that the local file still exists before assigning it to the file input.' },
  { title: 'Variables and environments', category: 'Authoring', keywords: 'test data binding secret base url', body: 'Use {{variableName}} in values, URLs, selectors, and assertions. Store secrets in the encrypted environment vault and non-secret values in environment profiles.' },
  { title: 'How suites work', category: 'Suites', keywords: 'suite organize tests group recording workflow', body: 'A suite groups named copies of recorded tests. Open Suites, create or select a suite, load a recording, name the test, and add the current recording.' },
  { title: 'Run a browser matrix', category: 'Suites', keywords: 'matrix browsers concurrency chrome edge jobs parallel', body: 'Enter comma-separated browsers and a safe concurrency limit. Each test and browser combination becomes a job; start with concurrency 1 or 2 for local diagnosis.' },
  { title: 'Suite naming and tags', category: 'Suites', keywords: 'tags smoke critical naming filter cli', body: 'Name suites by product area or purpose, tests by observable behavior, and tags by selection or policy such as smoke, critical, mobile, or slow.' },
  { title: 'Suite troubleshooting', category: 'Suites', keywords: 'no jobs select suite enabled source recording fail', body: 'If no jobs run, verify the suite is selected, contains enabled tests, and is not excluded by tags. Use Diagnostics when a browser worker cannot start.' },
];

function showHelp(initialQuery = '') {
  showBrowseWorkspace();
  panelTitle.textContent = 'Help & Guidance';
  panelContent.innerHTML = `<div class="tool-panel help-center">
    <div class="help-hero"><p class="eyebrow">CHROMATION GUIDE</p><h3>How can we help?</h3><p>Search workflows, capabilities, and shortcuts.</p><input id="help-search" class="form-input" type="search" value="${escapeReportText(initialQuery)}" placeholder="Search help…"></div>
    <div class="help-quick-actions"><button id="restart-onboarding">Replay onboarding</button><button id="open-diagnostics">Open diagnostics</button><button id="open-suites-help">Open Suites</button><button data-open-tool="recorder">Open Recorder</button></div>
    <div id="help-results">${renderHelpTopics(inAppHelpTopics)}</div>
  </div>`;
  sidePanel.dataset.currentTool = 'help';
  sidePanel.classList.add('open');
  document.getElementById('help-search')?.addEventListener('input', (event) => {
    const query = event.target.value.toLowerCase().trim();
    const matches = inAppHelpTopics.filter((topic) => `${topic.title} ${topic.category} ${topic.keywords} ${topic.body}`.toLowerCase().includes(query));
    document.getElementById('help-results').innerHTML = renderHelpTopics(matches);
  });
  document.getElementById('restart-onboarding')?.addEventListener('click', () => openOnboarding(true));
  document.getElementById('open-diagnostics')?.addEventListener('click', showDiagnostics);
  document.getElementById('open-suites-help')?.addEventListener('click', showSuitesWorkspace);
  if (initialQuery) document.getElementById('help-search')?.dispatchEvent(new Event('input'));
}

function renderHelpTopics(topics) {
  if (!topics.length) return '<div class="workflow-empty"><strong>No matching guidance</strong><span>Try a feature name, error, or shortcut.</span></div>';
  return topics.map((topic) => `<details class="help-topic"><summary><span>${escapeReportText(topic.category)}</span><strong>${escapeReportText(topic.title)}</strong><b>+</b></summary><p>${escapeReportText(topic.body)}</p></details>`).join('');
}

async function showDiagnostics() {
  panelTitle.textContent = 'Diagnostics';
  panelContent.innerHTML = '<div class="loading-state">Running health checks…</div>';
  sidePanel.classList.add('open');
  try {
    const diagnostics = await ipcRenderer.invoke('get-app-diagnostics');
    const healthyStores = diagnostics.stores.filter((store) => store.healthy).length;
    panelContent.innerHTML = `<div class="tool-panel diagnostics-panel">
      <div class="diagnostic-health ${healthyStores === diagnostics.stores.length ? 'healthy' : 'warning'}"><strong>${healthyStores === diagnostics.stores.length ? 'System healthy' : 'Attention required'}</strong><span>${healthyStores}/${diagnostics.stores.length} storage checks passed · Encryption ${diagnostics.safeStorageAvailable ? 'available' : 'unavailable'}</span></div>
      <div class="panel-card"><div class="card-header"><h5>Runtime versions</h5></div><div class="diagnostic-table">${Object.entries(diagnostics.versions).map(([name, value]) => `<div><span>${escapeReportText(name)}</span><code>${escapeReportText(value)}</code></div>`).join('')}<div><span>platform</span><code>${escapeReportText(diagnostics.platform.os)} · ${escapeReportText(diagnostics.platform.architecture)}</code></div></div></div>
      <div class="panel-card"><div class="card-header"><h5>Storage</h5></div><div class="diagnostic-table">${diagnostics.stores.map((store) => `<div><span>${escapeReportText(store.name)}<small>${formatDiagnosticBytes(store.bytes)}</small></span><code title="${escapeReportText(store.path)}">${escapeReportText(store.path)}</code><b class="${store.healthy ? 'passed' : 'failed'}">${store.healthy ? 'OK' : 'Error'}</b></div>`).join('')}</div></div>
      <div class="panel-card"><div class="card-header"><h5>Origin permissions</h5><span class="badge">${diagnostics.permissions.length}</span></div><div class="card-content">${diagnostics.permissions.length ? diagnostics.permissions.map((item) => `<div class="permission-row"><code>${escapeReportText(item.origin)}</code><span>${escapeReportText(typeof item.permission === 'string' ? item.permission : JSON.stringify(item.permission))}</span></div>`).join('') : '<p class="hint">No origin-specific permissions stored.</p>'}</div></div>
      <button class="secondary-btn full-width" id="refresh-diagnostics">Run checks again</button>
    </div>`;
    document.getElementById('refresh-diagnostics')?.addEventListener('click', showDiagnostics);
  } catch (error) {
    panelContent.innerHTML = `<div class="report-load-error"><strong>Diagnostics failed</strong><p>${escapeReportText(error.message)}</p><button class="secondary-btn" id="retry-diagnostics">Try again</button></div>`;
    document.getElementById('retry-diagnostics')?.addEventListener('click', showDiagnostics);
  }
}

function formatDiagnosticBytes(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
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
        
        <button class="secondary-btn" data-external-url="https://github.com/IamBlackShifu/Chromation-AutoHeal-Browser/releases">
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
  
  toggleTool('recorder');
  sidePanel.classList.add('open');
  
  // Create about panel
  panelTitle.textContent = 'About';
  panelContent.innerHTML = `
    <div class="panel-section">
      <div style="text-align: center; padding: 16px;">
        <div style="font-size: 64px; margin-bottom: 16px;">🧪</div>
        <h2 style="margin-bottom: 8px; color: #202124;">Chromation AutoHeal Browser</h2>
        <p style="font-size: 16px; color: #1a73e8; margin-bottom: 24px;">Version 0.2.0</p>
        
        <div style="background: var(--bg-secondary); padding: 16px; border-radius: 8px; text-align: left; margin-bottom: 16px;">
          <p style="font-size: 13px; color: var(--text-secondary); line-height: 1.8;">
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
          <button class="primary-btn" data-external-url="https://github.com/IamBlackShifu/Chromation-AutoHeal-Browser" style="margin-right: 8px;">
            GitHub Repository
          </button>
          <button class="secondary-btn" data-external-url="https://github.com/IamBlackShifu/Chromation-AutoHeal-Browser/issues">
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

// ===== RECORDING SAVE/LOAD/IMPORT FUNCTIONS =====

function getSuggestedRecordingName(actions = []) {
  const navigation = [...actions].reverse().find((action) => action.type === 'navigate' && action.value);
  const rawUrl = navigation?.value || browserWebview?.getURL?.() || urlInput?.value || '';
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.replace(/^www\./, '').split('.')[0];
    const site = host ? host.charAt(0).toUpperCase() + host.slice(1) : 'Website';
    const pathName = url.pathname.split('/').filter(Boolean).slice(0, 2).map((part) => part.replace(/[-_]+/g, ' ')).join(' – ');
    return pathName ? `${site} – ${pathName}` : `${site} test flow`;
  } catch (_) {
    const tab = tabs?.find?.((item) => item.id === activeTabId);
    return tab?.title && tab.title !== 'New Tab' ? `${tab.title} test flow` : 'New test flow';
  }
}

function requestRecordingName(suggestedName, heading = 'Name this recording') {
  const backdrop = document.getElementById('recording-name-dialog');
  const form = document.getElementById('recording-name-form');
  const input = document.getElementById('recording-name-input');
  const title = document.getElementById('recording-name-title');
  const context = document.getElementById('recording-name-context');
  const cancel = document.getElementById('recording-name-cancel');
  if (!backdrop || !form || !input) return Promise.resolve(suggestedName);
  title.textContent = heading;
  input.value = suggestedName;
  context.textContent = `Suggested from ${urlInput?.value || 'the current website'}`;
  backdrop.classList.remove('hidden');
  requestAnimationFrame(() => { input.focus(); input.select(); });
  return new Promise((resolve) => {
    const finish = (value) => {
      backdrop.classList.add('hidden');
      form.removeEventListener('submit', submit);
      cancel.removeEventListener('click', cancelDialog);
      backdrop.removeEventListener('click', clickOutside);
      resolve(value);
    };
    const submit = (event) => { event.preventDefault(); const value = input.value.trim(); if (value) finish(value); };
    const cancelDialog = () => finish(null);
    const clickOutside = (event) => { if (event.target === backdrop) finish(null); };
    form.addEventListener('submit', submit);
    cancel.addEventListener('click', cancelDialog);
    backdrop.addEventListener('click', clickOutside);
  });
}

function requestConfirmation(message, title = 'Confirm action', confirmLabel = 'Confirm') {
  const sheet = document.getElementById('confirmation-sheet');
  const accept = document.getElementById('confirmation-accept');
  const cancel = document.getElementById('confirmation-cancel');
  setText('confirmation-title', title);
  setText('confirmation-message', message);
  if (accept) accept.textContent = confirmLabel;
  sheet?.classList.remove('hidden');
  return new Promise((resolve) => {
    const finish = (value) => {
      sheet?.classList.add('hidden');
      accept?.removeEventListener('click', approve);
      cancel?.removeEventListener('click', reject);
      resolve(value);
    };
    const approve = () => finish(true);
    const reject = () => finish(false);
    accept?.addEventListener('click', approve);
    cancel?.addEventListener('click', reject);
  });
}

async function saveRecording() {
  if (!recorder) return;
  
  const actions = recorder.getActions();
  if (actions.length === 0) {
    statusText.textContent = 'No actions to save';
    return;
  }
  
  const name = await requestRecordingName(getSuggestedRecordingName(actions));
  if (!name) {
    statusText.textContent = 'Save cancelled';
    return;
  }
  
  try {
    const result = await ipcRenderer.invoke('save-recording', { name, actions });
    
    if (result.success) {
      currentRecordingFilename = result.filename;
      statusText.textContent = `Recording "${name}" saved successfully`;
      // Show notification
      showNotification('✅ Recording saved!', `${actions.length} actions saved to ${result.filename}`);
    } else {
      statusText.textContent = 'Failed to save recording';
      showToast('Failed to save recording: ' + result.error, 'error');
    }
  } catch (error) {
    console.error('Save error:', error);
    statusText.textContent = 'Failed to save recording';
    showToast('Failed to save recording: ' + error.message, 'error');
  }
}

async function importRecording() {
  try {
    const result = await ipcRenderer.invoke('import-recording');
    
    if (result.canceled) {
      return;
    }
    
    if (result.success && result.recording) {
      // Load the imported recording
      if (recorder && result.recording.actions) {
        const actions = normalizeRecordedActions(result.recording.actions);
        recorder.setActions(actions);
        recordedActions = actions;
        currentRecordingFilename = result.filename || null;
        updateActionsDisplay();
        statusText.textContent = `Imported recording: ${result.recording.name}`;
        showNotification('✅ Recording imported!', `${result.recording.actions.length} actions loaded`);
      }
    } else {
      statusText.textContent = 'Failed to import recording';
      showToast('Failed to import recording: ' + result.error, 'error');
    }
  } catch (error) {
    console.error('Import error:', error);
    statusText.textContent = 'Failed to import recording';
    showToast('Failed to import recording: ' + error.message, 'error');
  }
}

async function showSavedRecordings() {
  showBrowseWorkspace();
  try {
    const result = await ipcRenderer.invoke('load-recordings');
    
    if (!result.success) {
      statusText.textContent = 'Failed to load recordings';
      return;
    }
    
    const recordings = result.recordings;
    
    // Show recordings in side panel
    panelTitle.textContent = 'Saved Recordings';
    panelContent.innerHTML = `
      <div class="panel-section">
        <h4 class="panel-heading">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"></path>
          </svg>
          Saved Recordings
        </h4>
        <p class="panel-description">${recordings.length} recording(s) available</p>
      </div>
      
      <div class="panel-card">
        <div id="recordings-list" class="recordings-list">
          ${recordings.length === 0 ? `
            <div class="empty-state">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"></path>
              </svg>
              <p>No saved recordings yet</p>
              <span>Record some actions and save them</span>
            </div>
          ` : recordings.map(rec => `
            <div class="recording-item" data-filename="${rec.filename}">
              <div class="recording-info">
                <h5 class="recording-name">${rec.name}</h5>
                <p class="recording-meta">
                  ${rec.actionCount} actions • ${new Date(rec.createdAt || rec.timestamp).toLocaleString()}
                </p>
              </div>
              <div class="recording-actions">
                <button class="action-icon-btn load-recording" title="Load" data-filename="${rec.filename}">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                  </svg>
                </button>
                <button class="action-icon-btn replay-recording" title="Replay" data-filename="${rec.filename}">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                  </svg>
                </button>
                <button class="action-icon-btn delete-recording" title="Delete" data-filename="${rec.filename}">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    
    // Add event listeners
    document.querySelectorAll('.load-recording').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const filename = e.currentTarget.dataset.filename;
        await loadRecording(filename);
      });
    });
    
    document.querySelectorAll('.replay-recording').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const filename = e.currentTarget.dataset.filename;
        await loadAndReplayRecording(filename);
      });
    });
    
    document.querySelectorAll('.delete-recording').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const filename = e.currentTarget.dataset.filename;
        if (await requestConfirmation('This recording and its saved steps will be permanently removed.', 'Delete recording?', 'Delete')) {
          await deleteRecording(filename);
          showSavedRecordings(); // Refresh list
        }
      });
    });
    
    sidePanel.classList.add('open');
    statusText.textContent = `${recordings.length} saved recording(s) found`;
    
  } catch (error) {
    console.error('Failed to show recordings:', error);
    statusText.textContent = 'Failed to load recordings';
  }
}

async function loadRecording(filename) {
  showBrowseWorkspace();
  try {
    const result = await ipcRenderer.invoke('load-recording', filename);
    
    if (result.success && result.recording) {
      if (recorder && result.recording.actions) {
        const actions = normalizeRecordedActions(result.recording.actions);
        recorder.setActions(actions);
        recordedActions = actions;
        currentRecordingFilename = filename;
        
        // Switch to recorder panel
        sidePanel.classList.remove('open');
        toggleTool('recorder');
        updateActionsDisplay();
        
        statusText.textContent = `Loaded: ${result.recording.name}`;
        showNotification('✅ Recording loaded!', `${result.recording.actions.length} actions ready`);
        return true;
      }
    }
    return false;
  } catch (error) {
    console.error('Load error:', error);
    statusText.textContent = 'Failed to load recording';
    return false;
  }
}

async function loadAndReplayRecording(filename, engine = 'webview') {
  const loaded = await loadRecording(filename);
  if (!loaded) return;
  // Wait a bit for the UI to update
  setTimeout(() => {
    replayActions(1.0, engine);
  }, 500);
}

async function deleteRecording(filename) {
  try {
    const result = await ipcRenderer.invoke('delete-recording', filename);
    
    if (result.success) {
      statusText.textContent = 'Recording deleted';
      showNotification('🗑️ Deleted', 'Recording removed successfully');
    } else {
      showToast('Failed to delete recording: ' + result.error, 'error');
    }
  } catch (error) {
    console.error('Delete error:', error);
    showToast('Failed to delete recording: ' + error.message, 'error');
  }
}

function showLegacyReplayReport() {
  const totalActions = replayReport.total;
  const passed = replayReport.passed.length;
  const failed = replayReport.failed.length;
  const healingItems = [...replayReport.passed, ...replayReport.failed]
    .filter((item) => item.healing);
  const passRate = ((passed / totalActions) * 100).toFixed(1);
  
  panelTitle.textContent = 'Replay Report';
  panelContent.innerHTML = `
    <div class="panel-section">
      <h4 class="panel-heading">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
        </svg>
        Replay Report
      </h4>
      <p class="panel-description">Test execution summary</p>
    </div>
    
    <div class="panel-card">
      <div class="card-header">
        <h5>Summary</h5>
        <span class="badge" style="background: ${failed === 0 ? '#34a853' : '#ea4335'}">${passRate}%</span>
      </div>
      <div class="card-content">
        <div class="report-stats">
          <div class="stat-item" style="background: #e6f4ea; border-left: 4px solid #34a853;">
            <div class="stat-label">Passed</div>
            <div class="stat-value" style="color: #34a853;">${passed}</div>
          </div>
          <div class="stat-item" style="background: #fce8e6; border-left: 4px solid #ea4335;">
            <div class="stat-label">Failed</div>
            <div class="stat-value" style="color: #ea4335;">${failed}</div>
          </div>
          <div class="stat-item" style="background: #e8f0fe; border-left: 4px solid #1a73e8;">
            <div class="stat-label">Total</div>
            <div class="stat-value" style="color: #1a73e8;">${totalActions}</div>
          </div>
          <div class="stat-item" style="background: #fff8e1; border-left: 4px solid #f9ab00;">
            <div class="stat-label">Healed</div>
            <div class="stat-value" style="color: #b06000;">${healingItems.length}</div>
          </div>
          <button class="action-breakpoint-btn${action.metadata?.breakpoint ? ' active' : ''}"
            data-action-index="${index}"
            title="${action.metadata?.breakpoint ? 'Remove breakpoint' : 'Pause before this action'}"
            aria-label="${action.metadata?.breakpoint ? 'Remove breakpoint' : 'Add breakpoint'}">●</button>
        </div>
      </div>
    </div>

    ${healingItems.length > 0 ? `
    <div class="panel-card">
      <div class="card-header">
        <h5>Healing Events</h5>
        <span class="badge" style="background: #f9ab00;">${healingItems.length}</span>
      </div>
      <div class="card-content">
        ${healingItems.map((item) => `
          <div class="failed-action-item" style="border-left-color: #f9ab00;">
            <div class="failed-action-header">
              <span class="failed-action-number">#${item.index + 1}</span>
              <span class="failed-action-type">${escapeReportText(item.action.type)}</span>
              <span class="badge" style="background: #f9ab00;">${Math.round(item.healing.confidence * 100)}%</span>
            </div>
            <div class="failed-action-selector">
              ${escapeReportText(item.healing.originalSelector)} &rarr; ${escapeReportText(item.healing.healedSelector)}
            </div>
            <div class="panel-description">${escapeReportText(item.healing.strategy)}</div>
          </div>
        `).join('')}
      </div>
    </div>
    ` : ''}
    
    ${failed > 0 ? `
    <div class="panel-card">
      <div class="card-header">
        <h5>Failed Actions</h5>
        <span class="badge" style="background: #ea4335;">${failed}</span>
      </div>
      <div class="card-content">
        ${replayReport.failed.map(item => `
          <div class="failed-action-item">
            <div class="failed-action-header">
              <span class="failed-action-number">#${item.index + 1}</span>
              <span class="failed-action-type">${item.action.type}</span>
            </div>
            <div class="failed-action-selector">${item.action.selector}</div>
            <div class="failed-action-error">❌ ${item.error}</div>
          </div>
        `).join('')}
      </div>
    </div>
    ` : ''}

    <div class="panel-card">
      <div class="card-header">
        <h5>Export Report</h5>
      </div>
      <div class="card-content">
        <div class="button-group">
          <button class="secondary-btn full-width" data-report-format="html">Export HTML</button>
          <button class="secondary-btn full-width" data-report-format="json">Export JSON</button>
          <button class="secondary-btn full-width" data-report-format="junit">Export JUnit</button>
        </div>
      </div>
    </div>
    
    <div class="panel-section">
      <button class="secondary-btn full-width" data-open-tool="recorder">
        Back to Recorder
      </button>
    </div>
  `;
  
  sidePanel.classList.add('open');
}

function buildReplayReportViewModel() {
  const fallbackSteps = [...replayReport.passed, ...replayReport.failed].map((item) => ({
    index: item.index,
    action: item.action,
    status: item.error ? 'failed' : 'passed',
    durationMs: item.duration || 0,
    retries: item.retries || 0,
    error: item.error || null,
    healing: item.healing || null,
    evidence: item.screenshot ? { screenshotBase64: item.screenshot } : undefined,
  }));
  const steps = (lastReplayExecution?.steps || fallbackSteps)
    .slice()
    .sort((left, right) => left.index - right.index);
  const total = lastReplayExecution?.summary?.total ?? replayReport.total;
  const passed = steps.filter((step) => step.status === 'passed').length;
  const failed = steps.filter((step) => step.status === 'failed').length;
  const skipped = lastReplayExecution?.summary?.skipped ?? Math.max(0, total - passed - failed);
  const healed = steps.filter((step) => Boolean(step.healing)).length;
  const durationMs = lastReplayExecution?.durationMs ??
    Math.max(0, (replayEndedAt || Date.now()) - (replayStartedAt || Date.now()));
  const viewModel = {
    runId: lastReplayExecution?.runId || `replay_${replayStartedAt || Date.now()}`,
    status: lastReplayExecution?.finalState || (failed > 0 ? 'failed' : 'passed'),
    startedAt: lastReplayExecution?.startedAt || replayStartedAt,
    endedAt: lastReplayExecution?.endedAt || replayEndedAt,
    durationMs,
    total,
    passed,
    failed,
    skipped,
    healed,
    passRate: total > 0 ? Math.round((passed / total) * 1000) / 10 : 0,
    steps,
    consoleLogs: lastReplayExecution?.consoleLogs || [],
    networkSummary: lastReplayExecution?.networkSummary || [],
    runError: lastReplayExecution?.runError || null,
    sourceRecordingFilename: currentRecordingFilename,
    replayEngine: currentReplayEngine || lastReplayExecutionReport?.replayEngine || 'webview',
  };
  if (pendingRerunComparison) {
    viewModel.comparison = compareReplayReports(pendingRerunComparison, viewModel);
    pendingRerunComparison = null;
  }
  return viewModel;
}

function compareReplayReports(previous, current) {
  return {
    previousRunId: previous.runId,
    statusChanged: previous.status !== current.status,
    previousStatus: previous.status,
    currentStatus: current.status,
    passRateDelta: Number((current.passRate - previous.passRate).toFixed(1)),
    failedDelta: current.failed - previous.failed,
    healedDelta: current.healed - previous.healed,
    durationDeltaMs: current.durationMs - previous.durationMs,
  };
}

async function rerunReport(report) {
  if (isReplaying) {
    showToast('A replay is already running', 'warning');
    return;
  }
  pendingRerunComparison = {
    runId: report.runId,
    status: report.status,
    passRate: report.passRate,
    failed: report.failed,
    healed: report.healed,
    durationMs: report.durationMs,
  };
  if (report.sourceRecordingFilename) {
    const loaded = await loadRecording(report.sourceRecordingFilename);
    if (!loaded) {
      pendingRerunComparison = null;
      showToast('The source recording is no longer available', 'error');
      return;
    }
  } else if (!recorder?.getActions?.().length) {
    pendingRerunComparison = null;
    showToast('Load the source recording before rerunning this older report', 'warning');
    return;
  }
  showBrowseWorkspace();
  showToast('Rerun started', 'info');
  await replayActions(1, report.replayEngine || 'webview');
}

function showReplayReport() {
  latestReportViewModel = buildReplayReportViewModel();
  const existing = tabs.find((tab) =>
    tab.type === 'report' && tab.runId === latestReportViewModel.runId
  );
  const reportTab = existing || {
    id: nextTabId++,
    type: 'report',
    runId: latestReportViewModel.runId,
    title: `Report · ${latestReportViewModel.status}`,
    url: `chromation://report/${encodeURIComponent(latestReportViewModel.runId)}`,
    favicon: latestReportViewModel.failed > 0 ? '✕' : '✓',
  };
  if (!existing) tabs.push(reportTab);
  activeTabId = reportTab.id;
  renderTabs();
  showReportWorkspace();
  urlInput.value = reportTab.url;
}

function showReportWorkspace() {
  if (!latestReportViewModel || !window.ChromationReportWorkspace) return;
  browserView?.classList.add('hidden');
  reportWorkspace?.classList.remove('hidden');
  sidePanel.classList.remove('open');
  window.ChromationReportWorkspace.render(reportWorkspaceContent, latestReportViewModel);
}

function hideReportWorkspace() {
  reportWorkspace?.classList.add('hidden');
  browserView?.classList.remove('hidden');
}

async function exportReplayReport(format) {
  if (!reporter) {
    statusText.textContent = 'Reporter is not available';
    return;
  }

  if (!replayReport || replayReport.total === 0) {
    statusText.textContent = 'No replay report available yet. Run a replay first.';
    return;
  }

  if (lastReplayExecutionReport) {
    const richContent = await reporter.exportReport(lastReplayExecutionReport, format);
    downloadReplayReport(richContent, format);
    statusText.textContent = `Replay report exported as ${format.toUpperCase()}`;
    return;
  }

  const steps = [];
  for (const item of replayReport.passed) {
    steps.push({
      index: item.index,
      name: `${item.action.type} ${item.action.selector}`,
      status: 'passed',
      error: '',
      duration: item.duration || 0,
      screenshot: item.screenshot || null,
      healing: item.healing || null,
    });
  }
  for (const item of replayReport.failed) {
    steps.push({
      index: item.index,
      name: `${item.action.type} ${item.action.selector}`,
      status: 'failed',
      error: item.error || 'Replay failed',
      duration: item.duration || 0,
      screenshot: item.screenshot || null,
      healing: item.healing || null,
    });
  }
  steps.sort((a, b) => a.index - b.index);

  const reportData = {
    runId: `replay_${Date.now()}`,
    testName: 'Replay Session',
    startTime: replayStartedAt || Date.now(),
    endTime: replayEndedAt || Date.now(),
    duration: Math.max(0, (replayEndedAt || Date.now()) - (replayStartedAt || Date.now())),
    status: replayReport.failed.length > 0 ? 'failed' : 'passed',
    steps: steps.map((step) => ({
      name: step.name,
      status: step.status,
      duration: step.duration || 0,
      screenshot: step.screenshot || undefined,
      error: step.error || undefined,
      healing: step.healing || undefined,
      healedLocators: step.healing
        ? [`${step.healing.originalSelector} -> ${step.healing.healedSelector}`]
        : undefined,
    })),
    screenshots: steps
      .map((step) => step.screenshot)
      .filter((value) => Boolean(value)),
    healingEvents: steps.filter((step) => Boolean(step.healing)).length,
    healingDetails: steps.map((step) => step.healing).filter((healing) => Boolean(healing)),
    networkLogs: [],
    consoleLogs: [],
  };

  const content = await reporter.exportReport(reportData, format);
  downloadReplayReport(content, format);
  statusText.textContent = `Replay report exported as ${format.toUpperCase()}`;
}

async function exportAllReplayReports() {
  if (!replayReport || replayReport.total === 0) {
    statusText.textContent = 'No replay report available yet. Run a replay first.';
    return;
  }

  const formats = ['html', 'json', 'junit', 'har', 'allure'];
  for (const format of formats) {
    await exportReplayReport(format);
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  statusText.textContent = 'Exported all replay report formats';
}

function downloadReplayReport(content, format) {
  const extensionMap = {
    html: 'html',
    json: 'json',
    junit: 'xml',
    har: 'har',
    allure: 'json',
  };

  const ext = extensionMap[format] || 'txt';
  const mime = format === 'html'
    ? 'text/html'
    : format === 'json' || format === 'allure' || format === 'har'
      ? 'application/json'
      : 'application/xml';
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `replay-report-${Date.now()}.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
}

function showNotification(title, message) {
  // Simple notification using status text
  const prevText = statusText.textContent;
  statusText.textContent = `${title} - ${message}`;
  setTimeout(() => {
    if (statusText.textContent === `${title} - ${message}`) {
      statusText.textContent = prevText;
    }
  }, 3000);
}

function recordBrowsingVisit() {
  try {
    const url = browserWebview?.getURL?.();
    if (!/^https?:\/\//i.test(url || '')) return;
    const title = browserWebview?.getTitle?.() || tabs.find((tab) => tab.id === activeTabId)?.title || url;
    ipcRenderer.invoke('add-browsing-history', { url, title, timestamp: Date.now() }).catch((error) => {
      console.warn('Could not record browsing visit:', error);
    });
  } catch (error) {
    console.warn('Could not read current page for history:', error);
  }
}

// Update tab info when page loads
if (browserWebview) {
  browserWebview.addEventListener('page-title-updated', (e) => {
    updateActiveTabInfo(e.title, null, null);
    recordBrowsingVisit();
  });
  browserWebview.addEventListener('did-finish-load', recordBrowsingVisit);
  
  browserWebview.addEventListener('did-navigate', (e) => {
    updateActiveTabInfo(null, e.url, null);
    updateAddressBar();
  });
  
  browserWebview.addEventListener('did-navigate-in-page', (e) => {
    updateActiveTabInfo(null, e.url, null);
    updateAddressBar();
  });
}

// ===== INITIALIZE ON LOAD =====
document.addEventListener('DOMContentLoaded', () => {
  console.log('Chromation AutoHeal Browser UI loaded');
  
  // Initialize theme and Chromation modules
  initTheme();
  applyVisualPreferences();
  initChromation();
  bindOnboarding();
  showHomeWorkspace();
  setTimeout(() => openOnboarding(), 700);
  window.addEventListener('chromation-remediation', (event) => {
    const { action, stepIndex, query } = event.detail || {};
    if (action === 'inspect-target') { showBrowseWorkspace(); toggleTool('inspector'); return; }
    if (action === 'open-help') {
      showHelp();
      const search = document.getElementById('help-search');
      if (search) { search.value = query || ''; search.dispatchEvent(new Event('input')); search.focus(); }
      return;
    }
    showBrowseWorkspace();
    sidePanel.classList.remove('open');
    toggleTool('recorder');
    if (Number.isInteger(stepIndex) && recorder?.getActions?.()[stepIndex]) openStepEditor(stepIndex);
  });
  window.addEventListener('chromation-rerun-report', (event) => {
    if (event.detail?.report) rerunReport(event.detail.report);
  });
  updatePhase1Badges();
  document.getElementById('execution-pause')?.addEventListener('click', pauseReplay);
  document.getElementById('execution-resume')?.addEventListener('click', resumeReplay);
  document.getElementById('execution-step')?.addEventListener('click', stepReplay);
  document.getElementById('execution-stop')?.addEventListener('click', cancelReplay);

  const resizeHandle = document.getElementById('panel-resize-handle');
  const savedPanelWidth = Number(localStorage.getItem('chromation-panel-width'));
  if (savedPanelWidth) sidePanel.style.setProperty('--panel-width', `${savedPanelWidth}px`);
  resizeHandle?.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    resizeHandle.setPointerCapture(event.pointerId);
    const resize = (moveEvent) => {
      const width = Math.max(340, Math.min(760, window.innerWidth - moveEvent.clientX));
      sidePanel.style.setProperty('--panel-width', `${width}px`);
      localStorage.setItem('chromation-panel-width', String(width));
    };
    const stop = () => {
      resizeHandle.removeEventListener('pointermove', resize);
      resizeHandle.removeEventListener('pointerup', stop);
    };
    resizeHandle.addEventListener('pointermove', resize);
    resizeHandle.addEventListener('pointerup', stop);
  });

  document.querySelectorAll('.rail-action').forEach((button) => {
    button.addEventListener('click', () => {
      if (button.dataset.tool) toggleTool(button.dataset.tool);
      if (button.dataset.workspace === 'browse') showHomeWorkspace();
      if (button.dataset.action === 'suites') showSuitesWorkspace();
      if (button.dataset.action === 'replay') { showBrowseWorkspace(); replayActions(); }
      if (button.dataset.action === 'reports') showRunHistoryPanel();
      if (button.dataset.action === 'settings') {
        showBrowseWorkspace();
        sidePanel.classList.add('open');
        sidePanel.dataset.currentTool = 'settings';
        setActiveRailAction('settings');
        showPluginsPanel();
      }
    });
  });
  document.getElementById('home-start-recording')?.addEventListener('click', () => { showBrowseWorkspace(); toggleTool('recorder'); });
  document.getElementById('home-all-recordings')?.addEventListener('click', () => { showBrowseWorkspace(); showSavedRecordings(); });
  document.getElementById('home-all-runs')?.addEventListener('click', showRunHistoryPanel);
  document.querySelectorAll('[data-quick-action]').forEach((button) => button.addEventListener('click', () => {
    const action = button.dataset.quickAction;
    if (action === 'record') { showBrowseWorkspace(); toggleTool('recorder'); }
    if (action === 'inspect') { showBrowseWorkspace(); toggleTool('inspector'); }
    if (action === 'recordings') { showBrowseWorkspace(); showSavedRecordings(); }
    if (action === 'reports') showRunHistoryPanel();
  }));
  document.querySelectorAll('[data-workflow-destination]').forEach((button) => button.addEventListener('click', () => {
    const destination = button.dataset.workflowDestination;
    if (destination === 'record') { showBrowseWorkspace(); toggleTool('recorder'); }
    if (destination === 'suites') showSuitesWorkspace();
    if (destination === 'run') showSuitesWorkspace();
    if (destination === 'reports') showRunHistoryPanel();
  }));
  document.getElementById('command-input')?.addEventListener('input', (event) => { commandSelection = 0; renderCommandResults(event.target.value); });
  document.getElementById('command-palette')?.addEventListener('click', (event) => {
    if (event.target.id === 'command-palette') closeCommandPalette();
  });
  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.key.toLowerCase() === 'k') { event.preventDefault(); openCommandPalette(); return; }
    if (event.key === 'Escape') { closeCommandPalette(); return; }
    const palette = document.getElementById('command-palette');
    if (!palette?.classList.contains('hidden')) {
      const commands = getFilteredCommands(document.getElementById('command-input')?.value);
      if (commands.length && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
        event.preventDefault();
        commandSelection = (commandSelection + (event.key === 'ArrowDown' ? 1 : -1) + commands.length) % commands.length;
        renderCommandResults(document.getElementById('command-input')?.value);
      }
      if (event.key === 'Enter' && commands[commandSelection]) { event.preventDefault(); runCommand(phase1Commands.indexOf(commands[commandSelection])); }
      return;
    }
    if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'b') { event.preventDefault(); showHomeWorkspace(); }
    if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'i') { event.preventDefault(); toggleTool('inspector'); }
    if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'r') { event.preventDefault(); toggleTool('recorder'); }
    if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 's') { event.preventDefault(); toggleTool('scraper'); }
    if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'p') { event.preventDefault(); showRunHistoryPanel(); }
    if (event.ctrlKey && !event.shiftKey && event.key.toLowerCase() === 'h') { event.preventDefault(); showBrowsingHistory(); }
    if (event.key === 'F1') { event.preventDefault(); showHelp(); }
    if (event.ctrlKey && event.key === ',') { event.preventDefault(); sidePanel.classList.add('open'); showPluginsPanel(); }
  });

  const toolbarLabels = {
    'btn-new-tab': 'New tab (Ctrl+T)', 'btn-back': 'Back (Alt+Left)', 'btn-forward': 'Forward (Alt+Right)',
    'btn-refresh': 'Refresh (Ctrl+R)', 'btn-home': 'Workspace home', 'btn-bookmark': 'Bookmark this page',
    'btn-menu': 'Main menu', 'btn-close-panel': 'Close tool panel (Esc)'
  };
  Object.entries(toolbarLabels).forEach(([id, label]) => {
    const button = document.getElementById(id);
    if (button) { button.title = label; button.setAttribute('aria-label', label); }
  });
  document.querySelectorAll('.window-btn').forEach((button) => {
    const label = button.classList.contains('minimize-btn') ? 'Minimize window' : button.classList.contains('maximize-btn') ? 'Maximize window' : 'Close window';
    button.title = label; button.setAttribute('aria-label', label);
  });
  
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
    document.getElementById('menu-inspector')?.addEventListener('click', () => {
      menuDropdown.classList.add('hidden');
      toggleTool('inspector');
    });
    
    document.getElementById('menu-recorder')?.addEventListener('click', () => {
      menuDropdown.classList.add('hidden');
      toggleTool('recorder');
    });
    
    document.getElementById('menu-scraper')?.addEventListener('click', () => {
      menuDropdown.classList.add('hidden');
      toggleTool('scraper');
    });
    
    document.getElementById('menu-healing')?.addEventListener('click', () => {
      menuDropdown.classList.add('hidden');
      toggleHealing();
    });
    
    document.getElementById('menu-recordings')?.addEventListener('click', () => {
      menuDropdown.classList.add('hidden');
      showSavedRecordings();
    });
    
    document.getElementById('menu-history')?.addEventListener('click', () => {
      menuDropdown.classList.add('hidden');
      showBrowsingHistory();
    });
    document.getElementById('menu-plugins')?.addEventListener('click', () => {
      menuDropdown.classList.add('hidden');
      sidePanel.classList.add('open');
      showPluginsPanel();
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
  
  // Set default home page
  setTimeout(() => {
    if (browserWebview && browserWebview.src === '') {
      browserWebview.src = 'https://duckduckgo.com';
      urlInput.value = 'https://duckduckgo.com';
    }
  }, 1000);
});
