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
