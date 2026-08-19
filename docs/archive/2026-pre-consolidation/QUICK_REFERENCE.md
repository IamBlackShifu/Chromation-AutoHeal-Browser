# Quick Reference Guide

## Chromation AutoHeal Browser - Quick Start

### Installation & Setup

```bash
# Clone the repository
git clone https://github.com/IamBlackShifu/Chromation-AutoHeal-Browser.git
cd Chromation-AutoHeal-Browser

# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test
```

### Project Commands

| Command | Description |
|---------|-------------|
| `npm install` | Install all dependencies |
| `npm run build` | Compile TypeScript and bundle with Webpack |
| `npm test` | Run all unit tests with Jest |
| `npm run dev` | Start TypeScript in watch mode |
| `npm run lint` | Check code quality with ESLint |
| `npm start` | Run the compiled application |

### Module Quick Reference

#### 1. Inspector - Element Inspection
```typescript
const inspector = browser.getInspector();
inspector.startInspection();
const info = await inspector.inspectElement(element);
const locators = await inspector.generateLocators(element);
```

**Locator Types**: id, name, class, css, xpath, aria, data-test, text, relative

#### 2. Recorder - Action Recording
```typescript
const recorder = browser.getRecorder();
recorder.startRecording('manual'); // or 'auto', 'step'
recorder.recordAction({ type: 'click', selector: '#btn', timestamp: Date.now() });
recorder.stopRecording();
const script = await recorder.exportScript('playwright');
```

**Export Formats**: selenium-java, selenium-python, selenium-js, playwright, cypress, puppeteer, cdp

#### 3. HealingEngine - Auto-Healing
```typescript
const healing = browser.getHealingEngine();
const isBroken = await healing.detectBrokenLocator(selector);
const result = await healing.healLocator(selector, page);
console.log(`Healed: ${result.healedSelector}, Confidence: ${result.confidence}`);
```

**Strategies**: attribute-similarity, dom-hierarchy, visual-position, text-proximity, ai-pattern

#### 4. ScraperStudio - Data Extraction
```typescript
const scraper = browser.getScraperStudio();
const data = await scraper.scrapeTable({
  selector: 'table',
  fields: ['col1', 'col2'],
  pagination: true
});
const json = await scraper.exportData('json');
```

**Export Formats**: csv, json, excel

#### 5. Reporter - Test Reporting
```typescript
const reporter = browser.getReporter();
reporter.startReport('Test Name');
reporter.addStep({ name: 'Step 1', status: 'passed', duration: 100 });
const report = reporter.endReport();
const html = await reporter.exportReport(report, 'html');
```

**Report Formats**: html, pdf, json, junit

#### 6. UIManager - Animations
```typescript
const ui = browser.getUIManager();
ui.enableAnimations();
ui.setLowPerformanceMode(false);
ui.showElementHighlight(element);
```

### File Structure Quick Map

```
src/
├── core/BrowserCore.ts      → Browser lifecycle
├── inspector/Inspector.ts   → Element inspection
├── recorder/Recorder.ts     → Action recording
├── healing/HealingEngine.ts → Auto-healing
├── scraper/ScraperStudio.ts → Data extraction
├── reporter/Reporter.ts     → Test reporting
├── ui/UIManager.ts          → UI & animations
└── index.ts                 → Main entry

tests/
├── inspector.test.ts        → Inspector tests
├── recorder.test.ts         → Recorder tests
└── healing.test.ts          → Healing tests

docs/
├── API.md                   → Complete API docs
├── ARCHITECTURE.md          → System design
└── GETTING_STARTED.md       → Tutorial
```

### Common Workflows

#### Record and Export a Test
```typescript
const browser = new ChromationBrowser();
await browser.initialize();

const recorder = browser.getRecorder();
recorder.startRecording('auto');
// ... perform actions ...
recorder.stopRecording();

const script = await recorder.exportScript('playwright');
console.log(script);

await browser.shutdown();
```

#### Scrape Data from a Website
```typescript
const browser = new ChromationBrowser();
await browser.initialize();

const scraper = browser.getScraperStudio();
const data = await scraper.scrapeTable({
  selector: 'table.data',
  fields: ['name', 'email'],
  pagination: true,
  maxPages: 10
});

const csv = await scraper.exportData('csv');
// Save csv to file

await browser.shutdown();
```

#### Generate and Heal Locators
```typescript
const browser = new ChromationBrowser();
await browser.initialize();

const inspector = browser.getInspector();
const healing = browser.getHealingEngine();

// Generate multiple locators
const locators = await inspector.generateLocators(element);
const bestLocator = locators[0]; // Highest ranked

// If broken later, heal it
if (await healing.detectBrokenLocator(bestLocator.selector)) {
  const healed = await healing.healLocator(bestLocator.selector, page);
  console.log(`New selector: ${healed.healedSelector}`);
}

await browser.shutdown();
```

#### Generate Test Report
```typescript
const browser = new ChromationBrowser();
await browser.initialize();

const reporter = browser.getReporter();
reporter.startReport('Login Test');

reporter.addStep({ name: 'Open page', status: 'passed', duration: 1000 });
reporter.addStep({ name: 'Login', status: 'passed', duration: 2000 });
reporter.addHealingEvent();

const report = reporter.endReport();
const html = await reporter.exportReport(report, 'html');
const junit = await reporter.exportReport(report, 'junit');

await browser.shutdown();
```

### Troubleshooting

#### Build Issues
```bash
# Clear and reinstall
rm -rf node_modules package-lock.json
npm install
npm run build
```

#### Test Failures
```bash
# Run tests with verbose output
npm test -- --verbose

# Run specific test file
npm test inspector.test.ts
```

#### TypeScript Errors
```bash
# Check TypeScript configuration
npx tsc --noEmit

# Rebuild declarations
npm run build
```

### Next Steps

1. **Read the docs**: Start with `GETTING_STARTED.md`
2. **Run the example**: Execute `example.ts` to see features in action
3. **Explore the API**: Check `API.md` for detailed reference
4. **Understand architecture**: Read `ARCHITECTURE.md`
5. **Contribute**: See `CONTRIBUTING.md` for guidelines

### Resources

- **Repository**: https://github.com/IamBlackShifu/Chromation-AutoHeal-Browser
- **Documentation**: `README.md` in this folder
- **Examples**: `example.ts`
- **Tests**: `tests/` folder

### Key Concepts

- **Locator Stability**: Higher score = more reliable selector
- **Healing Confidence**: 0-1 score indicating match quality
- **Recording Modes**: 
  - Manual: Start/stop manually
  - Auto: Record entire session
  - Step: One action at a time
- **Export Formats**: Multiple frameworks supported (Selenium, Playwright, etc.)

### Performance Tips

- Use `ui.setLowPerformanceMode(true)` on slower machines
- Disable animations if not needed: `ui.disableAnimations()`
- Limit pagination: Set `maxPages` when scraping
- Use most stable locators: Check `stabilityScore`

---

**Chromation AutoHeal Browser** - *Browse. Inspect. Automate. Heal.* 🚀
