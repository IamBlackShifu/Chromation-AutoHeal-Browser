/**
 * Chromation AutoHeal Browser - Example Usage
 * 
 * This file demonstrates the main features and usage patterns
 */

import ChromationBrowser from './src/index';

async function demonstrateFeatures() {
  console.log('='.repeat(60));
  console.log('Chromation AutoHeal Browser - Feature Demonstration');
  console.log('='.repeat(60));
  console.log();

  // Initialize the browser
  const browser = new ChromationBrowser();
  await browser.initialize();
  console.log('✓ Browser initialized\n');

  // ========================================
  // 1. INSPECTOR DEMO
  // ========================================
  console.log('1. INSPECTOR DEMO');
  console.log('-'.repeat(40));
  
  const inspector = browser.getInspector();
  inspector.startInspection();
  console.log('✓ Inspection mode activated');
  
  const mockElement = {};
  const elementInfo = await inspector.inspectElement(mockElement);
  console.log('✓ Element inspected:', elementInfo);
  
  const locators = await inspector.generateLocators(mockElement);
  console.log(`✓ Generated ${locators.length} locator strategies`);
  
  inspector.stopInspection();
  console.log();

  // ========================================
  // 2. RECORDER DEMO
  // ========================================
  console.log('2. RECORDER DEMO');
  console.log('-'.repeat(40));
  
  const recorder = browser.getRecorder();
  recorder.startRecording('manual');
  console.log('✓ Recording started');
  
  // Simulate recording some actions
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
  
  console.log(`✓ Recorded ${recorder.getActions().length} actions`);
  
  recorder.stopRecording();
  
  // Export to different formats
  const playwrightScript = await recorder.exportScript('playwright');
  console.log('✓ Exported to Playwright format');
  console.log('  Preview:', playwrightScript.substring(0, 50) + '...');
  console.log();

  // ========================================
  // 3. HEALING ENGINE DEMO
  // ========================================
  console.log('3. HEALING ENGINE DEMO');
  console.log('-'.repeat(40));
  
  const healingEngine = browser.getHealingEngine();
  console.log(`✓ Healing engine status: ${healingEngine.isEnabled() ? 'enabled' : 'disabled'}`);
  
  const brokenSelector = '#old-button-that-changed';
  const isBroken = await healingEngine.detectBrokenLocator(brokenSelector);
  console.log(`✓ Locator check: ${brokenSelector} is ${isBroken ? 'broken' : 'valid'}`);
  
  const healingResult = await healingEngine.healLocator(brokenSelector, {});
  if (healingResult) {
    console.log('✓ Healing attempted');
    console.log(`  Original: ${healingResult.originalSelector}`);
    console.log(`  Healed: ${healingResult.healedSelector}`);
    console.log(`  Confidence: ${(healingResult.confidence * 100).toFixed(1)}%`);
  }
  
  console.log(`✓ Total healing events: ${healingEngine.getHealingHistory().length}`);
  console.log();

  // ========================================
  // 4. SCRAPER STUDIO DEMO
  // ========================================
  console.log('4. SCRAPER STUDIO DEMO');
  console.log('-'.repeat(40));
  
  const scraper = browser.getScraperStudio();
  scraper.startScraping();
  console.log('✓ Scraper activated');
  
  const scrapedData = await scraper.scrapeTable({
    selector: 'table.data',
    fields: ['name', 'email', 'status'],
    pagination: false,
    infiniteScroll: false
  });
  
  console.log(`✓ Scraped ${scrapedData.records.length} records`);
  
  const jsonExport = await scraper.exportData('json');
  console.log('✓ Data exported as JSON');
  console.log(`  Size: ${jsonExport.length} characters`);
  console.log();

  // ========================================
  // 5. REPORTER DEMO
  // ========================================
  console.log('5. REPORTER DEMO');
  console.log('-'.repeat(40));
  
  const reporter = browser.getReporter();
  reporter.startReport('Example Test Suite');
  console.log('✓ Report started');
  
  // Add some test steps
  reporter.addStep({
    name: 'Navigate to homepage',
    status: 'passed',
    duration: 1200
  });
  
  reporter.addStep({
    name: 'Verify page title',
    status: 'passed',
    duration: 300
  });
  
  reporter.addStep({
    name: 'Click submit button',
    status: 'passed',
    duration: 800
  });
  
  reporter.addHealingEvent();
  
  const report = reporter.endReport();
  console.log('✓ Report completed');
  
  if (report) {
    console.log(`  Test: ${report.testName}`);
    console.log(`  Status: ${report.status}`);
    console.log(`  Duration: ${report.duration}ms`);
    console.log(`  Steps: ${report.steps.length}`);
    console.log(`  Healing events: ${report.healingEvents}`);
    
    const htmlReport = await reporter.exportReport(report, 'html');
    console.log(`✓ HTML report generated (${htmlReport.length} characters)`);
  }
  console.log();

  // ========================================
  // CLEANUP
  // ========================================
  await browser.shutdown();
  console.log('='.repeat(60));
  console.log('Demo completed successfully!');
  console.log('='.repeat(60));
}

// Run the demonstration
if (require.main === module) {
  demonstrateFeatures().catch(error => {
    console.error('Error during demonstration:', error);
    process.exit(1);
  });
}

export default demonstrateFeatures;
