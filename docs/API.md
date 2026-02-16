# API Documentation

## ChromationBrowser

Main entry point for the Chromation AutoHeal Browser.

### Constructor

```typescript
new ChromationBrowser()
```

### Methods

#### `initialize(): Promise<void>`
Initializes the browser and all core modules.

```typescript
const browser = new ChromationBrowser();
await browser.initialize();
```

#### `shutdown(): Promise<void>`
Shuts down the browser and cleans up resources.

```typescript
await browser.shutdown();
```

#### `getInspector(): Inspector`
Returns the Inspector module instance.

#### `getRecorder(): Recorder`
Returns the Recorder module instance.

#### `getHealingEngine(): HealingEngine`
Returns the HealingEngine module instance.

#### `getScraperStudio(): ScraperStudio`
Returns the ScraperStudio module instance.

#### `getReporter(): Reporter`
Returns the Reporter module instance.

---

## Inspector

Smart element inspection and locator generation module.

### Methods

#### `startInspection(): void`
Activates element inspection mode.

#### `stopInspection(): void`
Deactivates element inspection mode.

#### `inspectElement(element: any): Promise<ElementInfo>`
Inspects an element and returns detailed information.

**Returns**: `ElementInfo` object containing:
- `tag`: Element tag name
- `attributes`: Key-value pairs of attributes
- `text`: Element text content
- `visible`: Visibility status
- `interactable`: Whether element can be interacted with
- `domPath`: Array of parent elements
- `shadowRoot`: Whether element is in shadow DOM
- `inIframe`: Whether element is in an iframe

#### `generateLocators(element: any): Promise<LocatorStrategy[]>`
Generates multiple locator strategies for an element.

**Returns**: Array of `LocatorStrategy` objects, each containing:
- `type`: Locator type (id, class, css, xpath, etc.)
- `selector`: The actual selector string
- `stabilityScore`: Score indicating selector stability (0-1)
- `uniquenessScore`: Score indicating selector uniqueness (0-1)
- `healingRank`: Priority rank for healing (lower is better)

#### `highlightElement(selector: string): void`
Visually highlights an element on the page.

#### `isInspecting(): boolean`
Returns whether inspection mode is active.

---

## Recorder

Action recording and script generation module.

### Methods

#### `startRecording(mode?: 'manual' | 'auto' | 'step'): void`
Starts recording user actions.

**Parameters**:
- `mode`: Recording mode (default: 'manual')
  - `manual`: Start/stop manually
  - `auto`: Auto-record entire session
  - `step`: Record one step at a time

#### `stopRecording(): void`
Stops the current recording session.

#### `recordAction(action: RecordedAction): void`
Manually records an action.

**Parameters**:
- `action`: `RecordedAction` object containing:
  - `type`: Action type (click, input, select, etc.)
  - `selector`: Element selector
  - `value`: Optional value for input actions
  - `timestamp`: Action timestamp
  - `metadata`: Optional additional data

#### `getActions(): RecordedAction[]`
Returns array of all recorded actions.

#### `exportScript(format: ExportFormat): Promise<string>`
Exports recorded actions as a script.

**Parameters**:
- `format`: Export format
  - `'selenium-java'`: Selenium WebDriver (Java)
  - `'selenium-python'`: Selenium WebDriver (Python)
  - `'selenium-js'`: Selenium WebDriver (JavaScript)
  - `'playwright'`: Playwright
  - `'cypress'`: Cypress
  - `'puppeteer'`: Puppeteer
  - `'cdp'`: Raw CDP commands

**Returns**: Generated script as string

#### `clearActions(): void`
Clears all recorded actions.

#### `isActive(): boolean`
Returns whether recording is active.

---

## HealingEngine

Locator auto-healing and repair module.

### Methods

#### `enable(): void`
Enables auto-healing functionality.

#### `disable(): void`
Disables auto-healing functionality.

#### `detectBrokenLocator(selector: string): Promise<boolean>`
Checks if a locator is broken (element not found).

**Parameters**:
- `selector`: The locator to check

**Returns**: `true` if locator is broken, `false` otherwise

#### `healLocator(brokenSelector: string, page: any): Promise<HealingResult | null>`
Attempts to heal a broken locator.

**Parameters**:
- `brokenSelector`: The broken selector to heal
- `page`: Page context for DOM access

**Returns**: `HealingResult` object or `null` if healing disabled, containing:
- `originalSelector`: The broken selector
- `healedSelector`: The new working selector
- `confidence`: Confidence score (0-1)
- `strategy`: Healing strategy used
- `timestamp`: When healing occurred

#### `getHealingHistory(): HealingResult[]`
Returns array of all healing events.

#### `clearHistory(): void`
Clears healing history.

#### `isEnabled(): boolean`
Returns whether auto-healing is enabled.

---

## ScraperStudio

Data extraction and scraping module.

### Methods

#### `startScraping(): void`
Activates scraping mode.

#### `stopScraping(): void`
Deactivates scraping mode.

#### `scrapeTable(config: ScrapingConfig): Promise<ScrapedData>`
Scrapes data from a table.

**Parameters**:
- `config`: `ScrapingConfig` object containing:
  - `selector`: Table selector
  - `fields`: Array of field names to extract
  - `pagination`: Whether to handle pagination
  - `infiniteScroll`: Whether to handle infinite scroll
  - `maxPages`: Maximum pages to scrape (optional)

**Returns**: `ScrapedData` object containing:
- `records`: Array of scraped records
- `timestamp`: When scraping occurred
- `source`: Source selector

#### `handlePagination(config: ScrapingConfig): Promise<void>`
Handles pagination during scraping.

#### `handleInfiniteScroll(): Promise<void>`
Handles infinite scroll during scraping.

#### `exportData(format: 'csv' | 'json' | 'excel'): Promise<string>`
Exports scraped data in specified format.

**Parameters**:
- `format`: Export format (csv, json, or excel)

**Returns**: Exported data as string

#### `clearData(): void`
Clears scraped data.

#### `isScraperActive(): boolean`
Returns whether scraping mode is active.

---

## Reporter

Test execution reporting module.

### Methods

#### `startReport(testName: string): void`
Starts a new test report.

**Parameters**:
- `testName`: Name of the test being reported

#### `addStep(step: TestStep): void`
Adds a test step to the current report.

**Parameters**:
- `step`: `TestStep` object containing:
  - `name`: Step name
  - `status`: 'passed', 'failed', or 'skipped'
  - `duration`: Step duration in milliseconds
  - `screenshot`: Optional screenshot data
  - `error`: Optional error message
  - `healedLocators`: Optional array of healed locators

#### `addScreenshot(screenshot: string): void`
Adds a screenshot to the current report.

#### `addHealingEvent(): void`
Increments the healing event counter.

#### `endReport(): ExecutionReport | null`
Ends the current report and returns it.

**Returns**: `ExecutionReport` object containing:
- `testName`: Test name
- `startTime`: Start timestamp
- `endTime`: End timestamp
- `duration`: Total duration in milliseconds
- `status`: Overall status ('passed' or 'failed')
- `steps`: Array of test steps
- `screenshots`: Array of screenshots
- `healingEvents`: Number of healing events
- `networkLogs`: Optional network logs
- `performanceMetrics`: Optional performance data

#### `exportReport(report: ExecutionReport, format: ReportFormat): Promise<string>`
Exports a report in specified format.

**Parameters**:
- `report`: The report to export
- `format`: Export format ('html', 'pdf', 'json', or 'junit')

**Returns**: Exported report as string

#### `getReportHistory(): ExecutionReport[]`
Returns array of all completed reports.

#### `clearHistory(): void`
Clears report history.

---

## UIManager

Animation and user interface module.

### Methods

#### `enableAnimations(): void`
Enables UI animations.

#### `disableAnimations(): void`
Disables UI animations.

#### `setLowPerformanceMode(enabled: boolean): void`
Toggles low-performance mode.

**Parameters**:
- `enabled`: Whether to enable low-performance mode

#### `showElementHighlight(element: any): void`
Shows visual highlight for an element.

#### `showHealingIndicator(element: any): void`
Shows healing glow effect for an element.

#### `showRecordingIndicator(active: boolean): void`
Shows/hides recording status indicator.

#### `flashLocator(selector: string): void`
Flashes a locator on the page.

#### `areAnimationsEnabled(): boolean`
Returns whether animations are enabled.

#### `isLowPerformanceMode(): boolean`
Returns whether low-performance mode is active.

---

## Type Definitions

### LocatorStrategy
```typescript
interface LocatorStrategy {
  type: 'id' | 'name' | 'class' | 'css' | 'xpath' | 'aria' | 'data-test' | 'text' | 'relative';
  selector: string;
  stabilityScore: number;
  uniquenessScore: number;
  healingRank: number;
}
```

### RecordedAction
```typescript
interface RecordedAction {
  type: ActionType;
  selector: string;
  value?: string;
  timestamp: number;
  metadata?: Record<string, any>;
}
```

### HealingResult
```typescript
interface HealingResult {
  originalSelector: string;
  healedSelector: string;
  confidence: number;
  strategy: string;
  timestamp: number;
}
```

### ExecutionReport
```typescript
interface ExecutionReport {
  testName: string;
  startTime: number;
  endTime: number;
  duration: number;
  status: 'passed' | 'failed';
  steps: TestStep[];
  screenshots: string[];
  healingEvents: number;
  networkLogs?: any[];
  performanceMetrics?: Record<string, number>;
}
```
