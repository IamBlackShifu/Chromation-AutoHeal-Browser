/**
 * OmniFlow QA - Main Entry Point
 * 
 * Purpose-built automation browser for QA Engineers, SDETs, and Automation Developers
 * Tagline: Browse. Inspect. Automate. Heal.
 */

import { BrowserCore } from './core/BrowserCore';
import { Inspector } from './inspector/Inspector';
import { Recorder } from './recorder/Recorder';
import { HealingEngine } from './healing/HealingEngine';
import { ScraperStudio } from './scraper/ScraperStudio';
import { ExecutionReport, Reporter } from './reporter/Reporter';
import { ScriptExecutor } from './executor/ScriptExecutor';
import { TestProject } from './project/TestProject';
import { ShortcutManager } from './ui/ShortcutManager';
import { SuiteFilter, SuiteManager } from './suite/SuiteManager';
import { MatrixRunner, MatrixRunResult, MatrixValue } from './executor/MatrixRunner';
import { AdvancedPageTesting, VisualRegressionService } from './advanced/AdvancedTesting';
import { ReviewedTestGenerator } from './advanced/TestGeneration';
import { APP_NAME } from './config/app';
import { RunScheduler } from './advanced/Scheduling';
import { PluginManager } from './plugins/PluginSDK';
import type { ExecutionOptions, ExecutionResult, ExecutionStateSnapshot } from './executor/types';

export class ChromationBrowser {
  private browserCore: BrowserCore;
  private inspector: Inspector;
  private recorder: Recorder;
  private healingEngine: HealingEngine;
  private scraperStudio: ScraperStudio;
  private reporter: Reporter;
  private scriptExecutor: ScriptExecutor;
  private testProject: TestProject;
  private shortcutManager: ShortcutManager;
  private suiteManager: SuiteManager;
  private visualRegression: VisualRegressionService;
  private testGenerator: ReviewedTestGenerator;
  private runScheduler: RunScheduler;
  private pluginManager: PluginManager;

  constructor() {
    this.browserCore = new BrowserCore();
    this.inspector = new Inspector();
    this.recorder = new Recorder();
    this.healingEngine = new HealingEngine();
    this.scraperStudio = new ScraperStudio();
    this.reporter = new Reporter();
    this.pluginManager = new PluginManager();
    this.visualRegression = new VisualRegressionService();
    this.scriptExecutor = new ScriptExecutor(
      undefined, undefined, new AdvancedPageTesting(), this.visualRegression, this.pluginManager
    );
    this.testProject = new TestProject();
    this.shortcutManager = new ShortcutManager();
    this.suiteManager = new SuiteManager();
    this.testGenerator = new ReviewedTestGenerator();
    this.runScheduler = new RunScheduler();
  }

  async initialize(): Promise<void> {
    console.log(`Initializing ${APP_NAME}...`);
    await this.browserCore.launch();
    console.log('Browser initialized successfully');
  }

  async shutdown(): Promise<void> {
    console.log(`Shutting down ${APP_NAME}...`);
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

  getScriptExecutor(): ScriptExecutor {
    return this.scriptExecutor;
  }

  getTestProject(): TestProject {
    return this.testProject;
  }

  getShortcutManager(): ShortcutManager { return this.shortcutManager; }
  getSuiteManager(): SuiteManager { return this.suiteManager; }
  getVisualRegressionService(): VisualRegressionService { return this.visualRegression; }
  getTestGenerator(): ReviewedTestGenerator { return this.testGenerator; }
  getRunScheduler(): RunScheduler { return this.runScheduler; }
  getPluginManager(): PluginManager { return this.pluginManager; }

  cancelExecution(reason?: string): boolean {
    return this.scriptExecutor.cancel(reason);
  }

  pauseExecution(): boolean {
    return this.scriptExecutor.pause();
  }

  resumeExecution(): boolean {
    return this.scriptExecutor.resume();
  }

  stepExecution(): boolean {
    return this.scriptExecutor.step();
  }

  getExecutionState(): ExecutionStateSnapshot {
    return this.scriptExecutor.getState();
  }

  async executeRecordedActions(options?: ExecutionOptions): Promise<ExecutionResult> {
    return this.scriptExecutor.execute(this.recorder.getActions(), options);
  }

  async executeRecordedActionsWithReport(
    testName: string,
    options?: ExecutionOptions
  ): Promise<{ execution: ExecutionResult; report: ExecutionReport }> {
    const execution = await this.executeRecordedActions(options);
    const report = this.reporter.fromExecutionResult(testName, execution);
    await this.pluginManager.emit('report:complete', report);
    return { execution, report };
  }

  async executeSuiteMatrix(
    filter: SuiteFilter,
    matrix: Record<string, MatrixValue[]>,
    maxConcurrency = 2,
    options?: ExecutionOptions
  ): Promise<MatrixRunResult> {
    const selected = this.suiteManager.filter({ ...filter, enabledOnly: true });
    const runner = new MatrixRunner(async (job) => {
      const executor = new ScriptExecutor(undefined, undefined, undefined, undefined, this.pluginManager);
      return executor.execute(job.actions, { ...options, ...job.options });
    });
    const jobs = runner.expand(selected.map(({ test }) => ({
      id: test.id, name: test.name, actions: test.actions,
      options: { ...options, baseUrl: options?.baseUrl },
    })), matrix);
    return runner.run(jobs, maxConcurrency);
  }
}

export { ScriptExecutor } from './executor/ScriptExecutor';
export { WebAutomationDriver } from './drivers/web/WebAutomationDriver';
export { AppiumClient, AppiumProtocolError } from './drivers/appium/AppiumClient';
export { AppiumProcessManager } from './drivers/appium/AppiumProcessManager';
export { PortAllocator, PortLease, PortBundleLease } from './drivers/appium/PortAllocator';
export { AndroidDeviceCommands } from './drivers/appium/AndroidDeviceCommands';
export { FallbackDeviceStream, ScreenshotPollingStream, MjpegDeviceStream } from './mobile/streaming/DeviceStream';
export { HierarchyRefreshPolicy } from './mobile/streaming/HierarchyRefreshPolicy';
export { ScrcpyProcessManager } from './mobile/streaming/ScrcpyProcessManager';
export { AndroidDeviceDiscovery, parseAdbDevices } from './mobile/diagnostics/AndroidDeviceDiscovery';
export type { ConnectedAndroidDevice, AndroidDeviceState } from './mobile/diagnostics/AndroidDeviceDiscovery';
export type { ScrcpyMirrorInfo, ScrcpyState, StartScrcpyOptions } from './mobile/streaming/ScrcpyProcessManager';
export { generateAppiumJava, generateAppiumPython } from './drivers/appium/AppiumExporters';
export type { ManagedAppiumInstance, ManagedAppiumStatus, StartAppiumOptions } from './drivers/appium/AppiumProcessManager';
export type { AndroidPortBundle } from './drivers/appium/PortAllocator';
export type { DeviceStream, DeviceFrame, DeviceStreamStatus, DeviceStreamTransport } from './mobile/streaming/DeviceStream';
export { AndroidAutomationDriver } from './drivers/appium/AndroidAutomationDriver';
export type { AndroidDriverConfig } from './drivers/appium/AndroidAutomationDriver';
export { MobileHierarchyParser, MobileInspector } from './mobile/inspector/MobileHierarchy';
export type { MobileHierarchy, MobileHierarchyNode } from './mobile/inspector/MobileHierarchy';
export { mapScreenshotPointer, resolveElementAtPoint, stableLocators } from './mobile/inspector/ScreenshotAuthoring';
export type { AuthoringElement, MobileOrientation, Point, Rect, ScreenshotPoint, Size } from './mobile/inspector/ScreenshotAuthoring';
export { ANDROID_ACTION_MATRIX, preflightAndroidActions, validateMobileProfile } from './mobile/diagnostics/MobileReadiness';
export type { DoctorCheck, MobileProfile } from './mobile/diagnostics/MobileReadiness';
export { MobileHealingEngine } from './mobile/healing/MobileHealingEngine';
export type {
  MobileAutomationContext, MobileHealingOptions, MobileLocatorFingerprint,
} from './mobile/healing/MobileHealingEngine';
export { DEFAULT_WEB_TARGET } from './automation/types';
export type {
  ApplicationMode, AutomationDriver, AutomationPlatform, AutomationSessionInfo,
  AutomationTarget, CapabilityDescriptor, DriverCapabilities, InspectedElement,
  LocatorCandidate,
} from './automation/types';
export { TestProject } from './project/TestProject';
export { RunHistoryStore } from './reporter/RunHistoryStore';
export { ShortcutManager } from './ui/ShortcutManager';
export { SuiteManager } from './suite/SuiteManager';
export { MatrixRunner } from './executor/MatrixRunner';
export { AdvancedPageTesting, VisualRegressionService, ResultArtifactStore } from './advanced/AdvancedTesting';
export { ReviewedTestGenerator } from './advanced/TestGeneration';
export { RunScheduler } from './advanced/Scheduling';
export { RemoteWorkerCoordinator, CIResultSynchronizer } from './advanced/RemoteExecution';
export {
  PluginManager, validatePluginManifest, validatePluginConfiguration,
  CHROMATION_PLUGIN_API_VERSION,
} from './plugins/PluginSDK';
export type {
  PluginManifest, PluginPermission, PluginBundle, PluginRecord, PluginExtension,
} from './plugins/PluginSDK';
export type {
  ExecutionOptions,
  ExecutionResult,
  ExecutionState,
  ExecutionStateSnapshot,
} from './executor/types';
export * from './mobile/recording/MobileInteractionRecorder';

// Export main entry point
export default ChromationBrowser;

// Main execution block - runs when file is executed directly
async function main() {
  console.log('='.repeat(60));
  console.log('OmniFlow QA');
  console.log('Browse. Inspect. Automate. Heal.');
  console.log('='.repeat(60));
  console.log();

  const browser = new ChromationBrowser();
  await browser.initialize();
  
  console.log();
  console.log('✓ OmniFlow QA is ready!');
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
