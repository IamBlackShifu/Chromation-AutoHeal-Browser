# Getting Started with Chromation AutoHeal Browser

This guide will help you get started with Chromation AutoHeal Browser.

## Prerequisites

- Node.js 16+ installed
- npm or yarn package manager
- Basic understanding of TypeScript (optional but recommended)

## Installation

### Step 1: Clone or Install

```bash
# If installing from npm (future)
npm install chromation-autoheal-browser

# Or clone the repository
git clone https://github.com/IamBlackShifu/Chromation-AutoHeal-Browser.git
cd Chromation-AutoHeal-Browser
npm install
```

### Step 2: Build the Project

```bash
npm run build
```

## Your First Script

Let's create a simple automation script that demonstrates the key features.

### Example 1: Basic Recording

```typescript
import ChromationBrowser from 'chromation-autoheal-browser';

async function main() {
  // Initialize browser
  const browser = new ChromationBrowser();
  await browser.initialize();

  // Get the recorder
  const recorder = browser.getRecorder();
  
  // Start recording
  recorder.startRecording('manual');
  
  // Simulate some actions (in practice, these would be user interactions)
  recorder.recordAction({
    type: 'navigate',
    selector: 'window',
    value: 'https://example.com',
    timestamp: Date.now()
  });
  
  recorder.recordAction({
    type: 'click',
    selector: '#login-button',
    timestamp: Date.now()
  });
  
  recorder.recordAction({
    type: 'input',
    selector: '#username',
    value: 'testuser',
    timestamp: Date.now()
  });
  
  // Stop recording
  recorder.stopRecording();
  
  // Export to Playwright
  const script = await recorder.exportScript('playwright');
  console.log('Generated Script:');
  console.log(script);
  
  // Cleanup
  await browser.shutdown();
}

main().catch(console.error);
```

### Example 2: Element Inspection

```typescript
import ChromationBrowser from 'chromation-autoheal-browser';

async function inspectElements() {
  const browser = new ChromationBrowser();
  await browser.initialize();

  const inspector = browser.getInspector();
  
  // Start inspection mode
  inspector.startInspection();
  
  // In practice, this would be triggered by user hovering/clicking
  // For demo, we'll simulate inspection
  const mockElement = {}; // This would be a real DOM element
  
  const info = await inspector.inspectElement(mockElement);
  console.log('Element Info:', info);
  
  const locators = await inspector.generateLocators(mockElement);
  console.log('Generated Locators:');
  locators.forEach((loc, i) => {
    console.log(`${i + 1}. ${loc.type}: ${loc.selector}`);
    console.log(`   Stability: ${loc.stabilityScore}, Uniqueness: ${loc.uniquenessScore}`);
  });
  
  await browser.shutdown();
}

inspectElements().catch(console.error);
```

### Example 3: Auto-Healing

```typescript
import ChromationBrowser from 'chromation-autoheal-browser';

async function demoHealing() {
  const browser = new ChromationBrowser();
  await browser.initialize();

  const healingEngine = browser.getHealingEngine();
  
  // Simulate a broken locator
  const brokenSelector = '#old-button-id';
  
  // Check if it's broken
  const isBroken = await healingEngine.detectBrokenLocator(brokenSelector);
  
  if (isBroken) {
    console.log('Locator is broken, attempting to heal...');
    
    const result = await healingEngine.healLocator(brokenSelector, {});
    
    if (result) {
      console.log(`Successfully healed!`);
      console.log(`Original: ${result.originalSelector}`);
      console.log(`Healed: ${result.healedSelector}`);
      console.log(`Confidence: ${result.confidence * 100}%`);
      console.log(`Strategy: ${result.strategy}`);
    }
  }
  
  // View healing history
  const history = healingEngine.getHealingHistory();
  console.log(`Total healing events: ${history.length}`);
  
  await browser.shutdown();
}

demoHealing().catch(console.error);
```

### Example 4: Data Scraping

```typescript
import ChromationBrowser from 'chromation-autoheal-browser';

async function scrapeData() {
  const browser = new ChromationBrowser();
  await browser.initialize();

  const scraper = browser.getScraperStudio();
  
  scraper.startScraping();
  
  // Configure scraping
  const config = {
    selector: 'table.product-list',
    fields: ['name', 'price', 'availability'],
    pagination: true,
    infiniteScroll: false,
    maxPages: 5
  };
  
  const data = await scraper.scrapeTable(config);
  console.log(`Scraped ${data.records.length} records`);
  
  // Export as JSON
  const json = await scraper.exportData('json');
  console.log('Data (JSON):');
  console.log(json);
  
  // Export as CSV
  const csv = await scraper.exportData('csv');
  console.log('Data (CSV):');
  console.log(csv);
  
  await browser.shutdown();
}

scrapeData().catch(console.error);
```

### Example 5: Comprehensive Testing with Reporting

```typescript
import ChromationBrowser from 'chromation-autoheal-browser';

async function runTest() {
  const browser = new ChromationBrowser();
  await browser.initialize();

  const reporter = browser.getReporter();
  const recorder = browser.getRecorder();
  
  // Start test report
  reporter.startReport('User Login Test');
  
  // Start recording
  recorder.startRecording('auto');
  
  // Step 1: Navigate
  reporter.addStep({
    name: 'Navigate to login page',
    status: 'passed',
    duration: 1500
  });
  
  recorder.recordAction({
    type: 'navigate',
    selector: 'window',
    value: 'https://example.com/login',
    timestamp: Date.now()
  });
  
  // Step 2: Enter username
  reporter.addStep({
    name: 'Enter username',
    status: 'passed',
    duration: 500
  });
  
  recorder.recordAction({
    type: 'input',
    selector: '#username',
    value: 'testuser',
    timestamp: Date.now()
  });
  
  // Step 3: Enter password
  reporter.addStep({
    name: 'Enter password',
    status: 'passed',
    duration: 500
  });
  
  recorder.recordAction({
    type: 'input',
    selector: '#password',
    value: 'password123',
    timestamp: Date.now()
  });
  
  // Step 4: Click login
  reporter.addStep({
    name: 'Click login button',
    status: 'passed',
    duration: 2000
  });
  
  recorder.recordAction({
    type: 'click',
    selector: '#login-button',
    timestamp: Date.now()
  });
  
  // End recording
  recorder.stopRecording();
  
  // End report
  const report = reporter.endReport();
  
  if (report) {
    // Export report as HTML
    const html = await reporter.exportReport(report, 'html');
    console.log('HTML Report Generated');
    
    // Export report as JSON
    const json = await reporter.exportReport(report, 'json');
    console.log('JSON Report:', json);
    
    // Export recorded script
    const script = await recorder.exportScript('playwright');
    console.log('Generated Script:', script);
  }
  
  await browser.shutdown();
}

runTest().catch(console.error);
```

## Running Tests

The project includes unit tests for all modules:

```bash
npm test
```

Run tests in watch mode:

```bash
npm test -- --watch
```

Run tests with coverage:

```bash
npm test -- --coverage
```

## Development Workflow

### 1. Start Development Mode

```bash
npm run dev
```

This starts TypeScript in watch mode, automatically recompiling on changes.

### 2. Run Linter

```bash
npm run lint
```

Fix linting issues automatically:

```bash
npm run lint -- --fix
```

### 3. Build for Production

```bash
npm run build
```

## Next Steps

- Read the [Architecture Documentation](./ARCHITECTURE.md) to understand the system design
- Check the [API Documentation](./API.md) for detailed API reference
- Explore the source code in the `src/` directory
- Look at the test files in `tests/` for more examples

## Common Issues

### Issue: Module not found errors
**Solution**: Make sure you've run `npm install` to install all dependencies.

### Issue: Build fails
**Solution**: Check that you have the correct Node.js version (16+) and TypeScript is installed.

### Issue: Tests fail
**Solution**: This is a foundational build with placeholder implementations. Some tests may need updates as features are implemented.

## Getting Help

- Open an issue on GitHub
- Check the documentation in the `docs/` folder
- Review the source code comments

## Contributing

Contributions are welcome! The project is in early stages, so there's plenty of opportunity to contribute to core features.

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

---

Happy automating with Chromation AutoHeal Browser! 🚀
