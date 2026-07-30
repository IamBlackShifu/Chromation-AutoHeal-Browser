# Changelog

All notable changes to Chromation AutoHeal Browser will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0-beta.1] - 2026-07-30

### Added

- Workspace Home, labeled tool rail, command palette, and guided product workflow
- Reliable recorder actions, locator fingerprints, healing, and replay controls
- Auto, in-browser, and Playwright replay-engine choices
- Suites, matrix execution, CLI runs, schedules, remote execution primitives,
  advanced test steps, and plugin SDK
- Actionable report workspace, history, analytics, evidence, exports, and rerun comparison
- Searchable help, onboarding, diagnostics, browsing history, and suite guidance

### Improved

- Playwright state fidelity and warm-browser reuse for smoother interactive runs
- Electron-safe Playwright browser evaluation
- File upload, input recording, report screenshots, and dynamic locator handling
- UI navigation, responsive controls, themes, density, and accessibility

### Known limitations

- Replay-engine action parity and Electron end-to-end coverage remain incomplete.
- See [Beta Release Notes](docs/BETA_RELEASE_NOTES.md) and the
  [Robustness and UX Audit](docs/ROBUSTNESS_UX_AUDIT_CHECKLIST.md).

## [0.1.0] - 2026-02-16

### Added

#### Core Infrastructure
- Initial project setup with TypeScript, Webpack, Jest
- Project directory structure with modular architecture
- Build configuration and development tooling
- ESLint configuration for code quality
- Comprehensive .gitignore for Node.js projects

#### Modules (Foundational Implementation)
- **BrowserCore**: Chromium engine lifecycle management stub
  - Browser launch and shutdown methods
  - CDP connection preparation
  - Page management structure

- **Inspector**: Smart element inspection system
  - Element inspection mode activation/deactivation
  - Element information extraction interface
  - Multi-strategy locator generation framework
  - Support for 9 locator types: id, name, class, css, xpath, aria, data-test, text, relative
  - Locator scoring system (stability, uniqueness, healing rank)
  - Element highlighting interface

- **Recorder**: Action recording and script generation
  - Recording mode support (manual, auto, step)
  - Action recording for 10+ action types
  - Script export framework for multiple formats
  - Support for: Selenium (Java/Python/JS), Playwright, Cypress, Puppeteer, CDP

- **HealingEngine**: Locator auto-healing system
  - Enable/disable healing functionality
  - Broken locator detection
  - Multi-strategy healing approach (5 strategies)
  - Healing history tracking
  - Confidence scoring for healed locators

- **ScraperStudio**: Data extraction capabilities
  - Scraping mode activation
  - Table data extraction interface
  - Pagination handling structure
  - Infinite scroll handling structure
  - Multi-format export: CSV, JSON, Excel

- **Reporter**: Test execution reporting
  - Report lifecycle management
  - Step-by-step result tracking
  - Screenshot attachment support
  - Healing event logging
  - Multi-format export: HTML, PDF, JSON, JUnit XML
  - Rich HTML report generation with styling

- **UIManager**: Animation and visual feedback
  - Animation enable/disable controls
  - Low-performance mode support
  - Element highlight indicators
  - Healing glow effects
  - Recording status indicators
  - Locator flash animations

#### Testing
- Unit tests for Inspector module (4 tests)
- Unit tests for Recorder module (5 tests)
- Unit tests for HealingEngine module (7 tests)
- Jest configuration with TypeScript support
- Test coverage reporting setup

#### Documentation
- Comprehensive README with feature overview
- Architecture documentation (ARCHITECTURE.md)
- Complete API reference (API.md)
- Getting Started guide (GETTING_STARTED.md)
- Contributing guidelines (CONTRIBUTING.md)
- 5 example usage demonstrations

#### Configuration Files
- package.json with all dependencies
- TypeScript configuration (tsconfig.json)
- Webpack build configuration
- Jest test configuration
- ESLint rules
- MIT License

#### Dependencies
- puppeteer-core for Chromium control
- chrome-remote-interface for CDP
- playwright-core for automation APIs
- TypeScript for type safety
- Jest for testing
- Webpack for bundling

### Documentation

- Created comprehensive project documentation covering:
  - System architecture and module interactions
  - Complete API reference for all modules
  - Getting started tutorial with 5 detailed examples
  - Contributing guidelines
  - Performance considerations
  - Security and sandboxing approach
  - Future roadmap

### Technical Debt

- [ ] Chromium fork integration (planned for 0.2.0)
- [ ] CDP protocol implementation
- [ ] Actual element inspection logic
- [ ] Locator generation algorithms
- [ ] Healing strategy implementations
- [ ] Script export generators
- [ ] DevTools panel development
- [ ] GPU-accelerated animations
- [ ] Network logging
- [ ] Performance metrics collection

## [Unreleased]

### Planned for 0.2.0
- Chromium fork integration
- CDP protocol connection
- Basic element inspection implementation
- Simple locator generation (id, class, css)
- Manual recording functionality
- Selenium Python export

### Planned for 0.3.0
- Auto-healing v1 (rules-based)
- Playwright export
- HTML report generation
- Element highlighting UI

### Planned for 1.0.0 (MVP)
- Full locator generation (all 9 strategies)
- Complete healing engine with all strategies
- All export formats working
- OhScrapper integration
- Complete reporting with screenshots
- DevTools panel
- Animation system

### Future Versions
- AI-powered test generation
- Natural language to test conversion
- Self-healing test suites
- Visual regression detection
- Parallel replay execution
- Cloud integration
- Mobile app testing support

---

## Version History

- **0.1.0** - Initial foundational release with architecture and module stubs
- Future releases to be documented here

---

**Note**: This is a foundational release establishing the architecture and module interfaces. Many features are implemented as stubs with TODOs for future implementation. The project successfully builds, tests pass, and the API surface is defined.
