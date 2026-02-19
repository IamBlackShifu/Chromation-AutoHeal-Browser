"use strict";
/**
 * Chromation AutoHeal Browser - Main Entry Point
 *
 * Purpose-built automation browser for QA Engineers, SDETs, and Automation Developers
 * Tagline: Browse. Inspect. Automate. Heal.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChromationBrowser = void 0;
const BrowserCore_1 = require("./core/BrowserCore");
const Inspector_1 = require("./inspector/Inspector");
const Recorder_1 = require("./recorder/Recorder");
const HealingEngine_1 = require("./healing/HealingEngine");
const ScraperStudio_1 = require("./scraper/ScraperStudio");
const Reporter_1 = require("./reporter/Reporter");
class ChromationBrowser {
    constructor() {
        this.browserCore = new BrowserCore_1.BrowserCore();
        this.inspector = new Inspector_1.Inspector();
        this.recorder = new Recorder_1.Recorder();
        this.healingEngine = new HealingEngine_1.HealingEngine();
        this.scraperStudio = new ScraperStudio_1.ScraperStudio();
        this.reporter = new Reporter_1.Reporter();
    }
    async initialize() {
        console.log('Initializing Chromation AutoHeal Browser...');
        await this.browserCore.launch();
        console.log('Browser initialized successfully');
    }
    async shutdown() {
        console.log('Shutting down Chromation AutoHeal Browser...');
        await this.browserCore.close();
        console.log('Browser shutdown complete');
    }
    // Public API
    getInspector() {
        return this.inspector;
    }
    getRecorder() {
        return this.recorder;
    }
    getHealingEngine() {
        return this.healingEngine;
    }
    getScraperStudio() {
        return this.scraperStudio;
    }
    getReporter() {
        return this.reporter;
    }
}
exports.ChromationBrowser = ChromationBrowser;
// Export main entry point
exports.default = ChromationBrowser;
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
