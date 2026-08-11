# Chromation AutoHeal Browser

New to test organization? See [Suites and Automation Workflows](docs/SUITES_AND_WORKFLOWS.md)
for the complete record → organize → run → report workflow, matrix execution,
tagging guidance, CLI examples, and troubleshooting.

**Tagline:** *Browse. Inspect. Automate. Heal.*

## Overview

Chromation AutoHeal Browser is a Chromium-engine-based automation browser purpose-built for QA Engineers, SDETs, and Automation Developers. It combines traditional browsing with deeply embedded automation tooling.

> Development status: this is a beta. Verified behavior and remaining
> work are tracked in [docs/ROADMAP.md](docs/ROADMAP.md), with runtime
> support defined in [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md). Features
> marked pending in the checklist are not production-ready. The latest
> evidence-based reliability and product audit is in
> [docs/ROBUSTNESS_UX_AUDIT_CHECKLIST.md](docs/ROBUSTNESS_UX_AUDIT_CHECKLIST.md).

For the latest implementation audit and pending work, see
[docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md). The proposed Android/iOS path is
documented in [docs/MOBILE_AUTOMATION_PLAN.md](docs/MOBILE_AUTOMATION_PLAN.md).

## Features

### 🔍 Smart Element Inspection
- Enhanced DevTools inspector with automation context
- Hover to highlight elements with DOM path visualization
- Shadow DOM and iFrame traversal support
- Multi-strategy locator generation (id, class, CSS, XPath, ARIA, data-test, text, relative)
- Stability and uniqueness scoring for each locator

### 🎬 Script Recorder
- Record browser interactions automatically
- Capture clicks, inputs, navigation, assertions, and more
- Multiple recording modes: manual, auto, and step-by-step
- Export to multiple formats: Selenium (Java/Python/JS), Playwright, Cypress, Puppeteer, CDP

### 🔧 Auto-Healing Engine
- AI + rules-based locator repair system
- Automatic detection and repair of broken selectors
- Multiple healing strategies: attribute similarity, DOM hierarchy, visual position, text proximity
- Detailed healing event logging

### 📊 Reporting Engine
- Comprehensive execution reports with screenshots
- Multiple export formats: HTML, PDF, JSON, JUnit XML
- Performance metrics and network logs
- Healing frequency analytics

### 🕷️ Scraper Studio
- Visual data selection and table extraction
- Pagination and infinite scroll handling
- Export to CSV, JSON, Excel
- Integrated from OhScrapper project

### 🎨 Animation & UI
- GPU-accelerated animations for smooth experience
- Element highlighting and locator flash indicators
- Low-performance mode for resource-constrained environments

## Installation

```bash
npm install
```

## Usage

### Basic Example

```typescript
import ChromationBrowser from 'chromation-autoheal-browser';

const browser = new ChromationBrowser();
await browser.initialize();

// Get modules
const inspector = browser.getInspector();
const recorder = browser.getRecorder();
const healingEngine = browser.getHealingEngine();

// Start recording
recorder.startRecording('manual');

// ... perform actions ...

// Stop and export
recorder.stopRecording();
const script = await recorder.exportScript('playwright');

await browser.shutdown();
```

### Inspector Usage

```typescript
const inspector = browser.getInspector();

inspector.startInspection();
const elementInfo = await inspector.inspectElement(element);
const locators = await inspector.generateLocators(element);

// Locators are ranked by stability and uniqueness
console.log(locators[0]); // Best locator
```

### Recorder Usage

```typescript
const recorder = browser.getRecorder();

recorder.startRecording('auto');
// Actions are automatically recorded

recorder.stopRecording();
const actions = recorder.getActions();

// Export to different formats
const seleniumScript = await recorder.exportScript('selenium-python');
const playwrightScript = await recorder.exportScript('playwright');
```

### Healing Engine Usage

```typescript
const healingEngine = browser.getHealingEngine();

// Healing is enabled by default
if (await healingEngine.detectBrokenLocator(selector)) {
  const result = await healingEngine.healLocator(selector, page);
  console.log(`Healed: ${result.originalSelector} -> ${result.healedSelector}`);
  console.log(`Confidence: ${result.confidence}`);
}

// View healing history
const history = healingEngine.getHealingHistory();
```

### Scraper Studio Usage

```typescript
const scraper = browser.getScraperStudio();

scraper.startScraping();

const data = await scraper.scrapeTable({
  selector: 'table.data',
  fields: ['name', 'email', 'phone'],
  pagination: true,
  maxPages: 10
});

const json = await scraper.exportData('json');
const csv = await scraper.exportData('csv');
```

### Reporter Usage

```typescript
const reporter = browser.getReporter();

reporter.startReport('Login Test');

reporter.addStep({
  name: 'Navigate to login page',
  status: 'passed',
  duration: 1500
});

reporter.addStep({
  name: 'Enter credentials',
  status: 'passed',
  duration: 500
});

const report = reporter.endReport();
const html = await reporter.exportReport(report, 'html');
const junit = await reporter.exportReport(report, 'junit');
```

## Development

### Build

```bash
npm run build
```

### Test

```bash
npm test
```

### Lint

```bash
npm run lint
```

### Watch Mode

```bash
npm run dev
```

## Architecture

### Core Modules

- **BrowserCore**: Chromium engine management and CDP connections
- **Inspector**: Smart element inspection and locator generation
- **Recorder**: Action recording and script generation
- **HealingEngine**: Locator auto-healing system
- **ScraperStudio**: Data extraction and scraping
- **Reporter**: Test execution reporting
- **UIManager**: Animation and UI components

### Technology Stack

- **Base**: Chromium (latest stable fork)
- **Language**: TypeScript/Node.js
- **Build**: Webpack
- **Testing**: Jest
- **Automation APIs**: Puppeteer, Playwright integration

## Roadmap

For the prioritized, testable implementation backlog and UI modernization
phases, see [docs/ROADMAP.md](docs/ROADMAP.md).

### MVP (Current)
- ✅ Core architecture and module stubs
- ✅ TypeScript project setup
- ✅ Basic testing infrastructure
- 🔄 Chromium fork integration
- 🔄 CDP protocol implementation
- 🔄 DevTools panel development

### Future Enhancements
- AI-powered test generation from natural language
- Self-maintaining test suites
- Visual regression detection
- Test impact analysis
- Parallel replay execution
- Database connectors for scraped data

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

## License

MIT License - see LICENSE file for details

## Support

For issues, questions, or feature requests, please open an issue on GitHub.

---

**Chromation AutoHeal Browser** - The world's most automation-native browser where testing, inspection, scraping, and healing live inside the browsing experience itself.
