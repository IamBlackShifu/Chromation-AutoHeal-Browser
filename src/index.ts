/**
 * Chromation AutoHeal Browser - Main Entry Point
 * 
 * Purpose-built automation browser for QA Engineers, SDETs, and Automation Developers
 * Tagline: Browse. Inspect. Automate. Heal.
 */

import { BrowserCore } from './core/BrowserCore';
import { Inspector } from './inspector/Inspector';
import { Recorder } from './recorder/Recorder';
import { HealingEngine } from './healing/HealingEngine';
import { ScraperStudio } from './scraper/ScraperStudio';
import { Reporter } from './reporter/Reporter';

export class ChromationBrowser {
  private browserCore: BrowserCore;
  private inspector: Inspector;
  private recorder: Recorder;
  private healingEngine: HealingEngine;
  private scraperStudio: ScraperStudio;
  private reporter: Reporter;

  constructor() {
    this.browserCore = new BrowserCore();
    this.inspector = new Inspector();
    this.recorder = new Recorder();
    this.healingEngine = new HealingEngine();
    this.scraperStudio = new ScraperStudio();
    this.reporter = new Reporter();
  }

  async initialize(): Promise<void> {
    console.log('Initializing Chromation AutoHeal Browser...');
    await this.browserCore.launch();
    console.log('Browser initialized successfully');
  }

  async shutdown(): Promise<void> {
    console.log('Shutting down Chromation AutoHeal Browser...');
    await this.browserCore.close();
    console.log('Browser shutdown complete');
  }

  // Public API
  getInspector(): Inspector {
    return this.inspector;
  }

  getRecorder(): Recorder {
    return this.recorder;
  }

  getHealingEngine(): HealingEngine {
    return this.healingEngine;
  }

  getScraperStudio(): ScraperStudio {
    return this.scraperStudio;
  }

  getReporter(): Reporter {
    return this.reporter;
  }
}

// Export main entry point
export default ChromationBrowser;

// Main execution block - runs when file is executed directly
async function main() {
  console.log('='.repeat(60));
  console.log('Chromation AutoHeal Browser');
  console.log('Browse. Inspect. Automate. Heal.');
  console.log('='.repeat(60));
  console.log();

  const browser = new ChromationBrowser();
  await browser.initialize();
  
  console.log();
  console.log('✓ Chromation AutoHeal Browser is ready!');
  console.log();
  console.log('Available modules:');
  console.log('  • Inspector - Element inspection and locator generation');
  console.log('  • Recorder - Action recording and script export');
  console.log('  • HealingEngine - Auto-healing for broken locators');
  console.log('  • ScraperStudio - Data extraction and scraping');
  console.log('  • Reporter - Test reporting and documentation');
  console.log();
  console.log('To see a full demo, run: node example.ts');
  console.log();
  
  await browser.shutdown();
}

// Run main if executed directly
if (require.main === module) {
  main().catch(console.error);
}
