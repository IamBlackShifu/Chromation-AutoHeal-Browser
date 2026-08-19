# Architecture Documentation

## System Overview

Chromation AutoHeal Browser is built on a modular architecture with clear separation of concerns.

## Core Components

### 1. BrowserCore
**Responsibility**: Chromium engine lifecycle management

**Key Functions**:
- Launch and manage Chromium instances
- Establish CDP (Chrome DevTools Protocol) connections
- Handle browser-level events
- Manage page creation and navigation

**Dependencies**:
- puppeteer-core / chrome-remote-interface
- Chromium binary

### 2. Inspector
**Responsibility**: Element inspection and locator generation

**Key Functions**:
- Visual element highlighting
- DOM tree traversal (including Shadow DOM and iFrames)
- Multi-strategy locator generation
- Stability and uniqueness scoring

**Locator Strategies**:
1. ID selector (highest priority)
2. Name attribute
3. Class names
4. CSS selectors
5. XPath expressions
6. ARIA labels
7. Data-test attributes
8. Custom attributes
9. Text content
10. Relative locators

### 3. Recorder
**Responsibility**: Action recording and script generation

**Recordable Actions**:
- Click events (left, right, double)
- Text input and keyboard events
- Dropdown selections
- Drag and drop operations
- File uploads
- Navigation events
- Wait conditions
- Assertions
- Hover events

**Export Formats**:
- Selenium WebDriver (Java, Python, JavaScript)
- Playwright
- Cypress
- Puppeteer
- Raw CDP commands

### 4. HealingEngine
**Responsibility**: Automated locator repair

**Healing Process**:
1. Detect broken locator during replay
2. Re-scan DOM for candidate elements
3. Apply similarity scoring algorithms
4. Rank candidates by confidence
5. Replace locator with best match
6. Log healing event

**Healing Strategies**:
- **Attribute Similarity** (30%): Compare element attributes
- **DOM Hierarchy** (25%): Match structural patterns
- **Visual Position** (20%): Compare screen coordinates
- **Text Proximity** (15%): Analyze nearby text content
- **AI Pattern Learning** (10%): Machine learning-based matching

### 5. ScraperStudio
**Responsibility**: Data extraction and scraping

**Capabilities**:
- Visual element selection for scraping
- Table data extraction
- Multi-page pagination handling
- Infinite scroll automation
- API endpoint detection
- AJAX request capture

**Export Formats**:
- CSV files
- JSON documents
- Excel spreadsheets
- Database connectors (planned)

### 6. Reporter
**Responsibility**: Test execution reporting

**Report Contents**:
- Execution summary (pass/fail/skip)
- Step-by-step results
- Screenshots per step
- Video recordings
- Healed locator logs
- Performance timings
- Network activity logs

**Export Formats**:
- HTML with interactive dashboard
- PDF documents
- JSON for API integration
- JUnit XML for CI/CD

### 7. UIManager
**Responsibility**: Visual feedback and animations

**Features**:
- GPU-accelerated element highlighting
- Locator flash indicators
- Healing event glow effects
- Recording status indicators
- Low-performance mode toggle

## Data Flow

```
User Action → Recorder → BrowserCore (CDP) → Page Interaction
                ↓
            Action Storage
                ↓
          Script Generator
                ↓
         Exported Script


Replay Script → HealingEngine (check locators) → BrowserCore → Execute
                     ↓
              (if broken)
                     ↓
             Find & Heal → Reporter (log event)
```

## Module Interactions

```
ChromationBrowser (Main Entry Point)
    ├── BrowserCore
    │   └── CDP Connection → Chromium
    ├── Inspector
    │   └── uses BrowserCore for DOM access
    ├── Recorder
    │   ├── uses Inspector for locators
    │   └── uses BrowserCore for event capture
    ├── HealingEngine
    │   ├── uses Inspector for element discovery
    │   └── uses Reporter for logging
    ├── ScraperStudio
    │   ├── uses Inspector for element selection
    │   └── independent of Recorder
    ├── Reporter
    │   └── aggregates data from all modules
    └── UIManager
        └── renders overlays via BrowserCore
```

## Performance Considerations

### Inspector
- Lazy loading of DOM data
- Efficient selector caching
- Throttled hover events

### Recorder
- Maximum 5% performance overhead
- Asynchronous action logging
- Memory-efficient action storage

### HealingEngine
- Maximum 200ms per healing attempt
- Cached similarity computations
- Early termination on high-confidence match

### UIManager
- GPU-accelerated animations only
- Optional low-performance mode
- Minimal DOM manipulation

## Security

### Sandboxing
- Isolated script execution contexts
- Permission-based scraping access
- Secure credential vault for stored passwords

### Privacy
- Automatic credential masking in recordings
- PII detection in scraped data
- Secure storage of sensitive data

## Extension Points

### Custom Locator Strategies
Developers can add custom locator generators:

```typescript
inspector.registerLocatorStrategy({
  name: 'custom-strategy',
  generate: (element) => {
    // Custom logic
    return { selector: '...', score: 0.9 };
  }
});
```

### Custom Healing Strategies
Add domain-specific healing logic:

```typescript
healingEngine.registerStrategy({
  name: 'custom-healing',
  weight: 0.15,
  match: (original, candidate) => {
    // Custom matching logic
    return confidence;
  }
});
```

### Custom Export Formats
Support additional script formats:

```typescript
recorder.registerExporter({
  format: 'custom-framework',
  generate: (actions) => {
    // Custom script generation
    return generatedCode;
  }
});
```

## Future Architecture Plans

### Phase 2: AI Integration
- Natural language to test conversion
- Self-healing test maintenance
- Intelligent test generation

### Phase 3: Cloud Integration
- Remote execution grid
- Centralized reporting dashboard
- Test result analytics

### Phase 4: Advanced Features
- Parallel execution support
- Visual regression testing
- API testing integration
- Mobile app testing support
