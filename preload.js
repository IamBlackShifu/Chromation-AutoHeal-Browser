const { contextBridge, ipcRenderer, shell } = require('electron');
const ChromationBrowser = require('./dist/index.js').default;
const { MobileRecordingSession, translatePointerInteraction, mapAndroidInputPoint } = require('./dist/mobile/recording/MobileInteractionRecorder');

const browser = new ChromationBrowser();
const inspector = browser.getInspector();
const recorder = browser.getRecorder();
const healing = browser.getHealingEngine();
const scraper = browser.getScraperStudio();
const reporter = browser.getReporter();
const project = browser.getTestProject();
const shortcuts = browser.getShortcutManager();
const suites = browser.getSuiteManager();
const visual = browser.getVisualRegressionService();
const generator = browser.getTestGenerator();
const scheduler = browser.getRunScheduler();
const plugins = browser.getPluginManager();
const mobileRecording = new MobileRecordingSession();

const invokeChannels = new Set([
  'choose-upload-files',
  'set-upload-files',
  'save-recording',
  'import-recording',
  'load-recordings',
  'load-recording',
  'rename-recording',
  'delete-recording',
  'save-run-history',
  'load-run-history',
  'add-browsing-history',
  'load-browsing-history',
  'delete-browsing-history-entry',
  'clear-browsing-history',
  'get-app-diagnostics',
  'set-environment-variable',
  'get-environment-variable',
  'list-environment-variables',
  'set-origin-permission',
  'mobile-connect',
  'mobile-appium-start',
  'mobile-appium-status',
  'mobile-appium-stop',
  'mobile-scrcpy-start',
  'mobile-scrcpy-status',
  'mobile-scrcpy-stop',
  'mobile-doctor',
  'mobile-list-devices',
  'mobile-preflight',
  'mobile-load-profiles',
  'mobile-save-profile',
  'mobile-delete-profile',
  'mobile-status',
  'mobile-touch-capture-start',
  'mobile-touch-capture-stop',
  'mobile-touch-capture-status',
  'mobile-inspect',
  'mobile-action',
  'mobile-replay',
  'mobile-cancel-replay',
  'mobile-replay-status',
  'mobile-disconnect',
  'workspace-teardown',
  'mobile-workspace-readiness',
]);
const sendChannels = new Set(['window-minimize', 'window-maximize', 'window-close']);
const receiveChannels = new Set([
  'toggle-inspector',
  'toggle-recorder',
  'toggle-scraper',
  'toggle-healing',
  'show-about',
  'window-maximized',
  'mobile-native-touch',
  'mobile-native-key',
  'mobile-touch-capture-error',
  'guest-popup-blocked',
  'guest-download-blocked',
  'guest-permission-result',
]);
const externalURLs = new Set([
  'https://github.com/Infinity-Lines-of-Code/omniflow-qa',
  'https://github.com/Infinity-Lines-of-Code/omniflow-qa/releases',
  'https://github.com/Infinity-Lines-of-Code/omniflow-qa/issues',
]);

contextBridge.exposeInMainWorld('chromationAPI', {
  initialize: () => browser.initialize(),
  shutdown: () => browser.shutdown(),
  executeRecordedActionsWithReport: (testName, options) =>
    browser.executeRecordedActionsWithReport(testName, options),
  cancelExecution: (reason) => browser.cancelExecution(reason),
  pauseExecution: () => browser.pauseExecution(),
  resumeExecution: () => browser.resumeExecution(),
  stepExecution: () => browser.stepExecution(),
  getExecutionState: () => browser.getExecutionState(),
  inspector: {
    start: () => inspector.startInspection(),
    stop: () => inspector.stopInspection(),
  },
  recorder: {
    start: (mode) => recorder.startRecording(mode),
    stop: () => recorder.stopRecording(),
    record: (action) => recorder.recordAction(action),
    getActions: () => recorder.getActions(),
    updateLastAction: (action) => recorder.updateLastAction(action),
    updateAction: (index, action) => recorder.updateAction(index, action),
    duplicateAction: (index) => recorder.duplicateAction(index),
    deleteAction: (index) => recorder.deleteAction(index),
    moveAction: (fromIndex, toIndex) => recorder.moveAction(fromIndex, toIndex),
    setActionDisabled: (index, disabled) => recorder.setActionDisabled(index, disabled),
    persistHealedLocator: (index, selector) => recorder.persistHealedLocator(index, selector),
    setActions: (actions) => recorder.setActions(actions),
    exportScript: (format) => recorder.exportScript(format),
    clear: () => recorder.clearActions(),
  },
  mobileRecording: {
    start: (appId) => mobileRecording.start(String(appId || '')),
    pause: () => mobileRecording.pause(),
    resume: () => mobileRecording.resume(),
    stop: () => mobileRecording.stop(),
    getState: () => mobileRecording.getState(),
    getElapsedMs: () => mobileRecording.getElapsedMs(),
    getActions: () => mobileRecording.getActions(),
    remove: (id) => mobileRecording.remove(String(id || '')),
    duplicate: (id) => mobileRecording.duplicate(String(id || '')),
    move: (id, toIndex) => mobileRecording.move(String(id || ''), Number(toIndex)),
    translate: (sample, context) => translatePointerInteraction(sample, context),
    mapAndroidInputPoint: (point, calibration, display) => mapAndroidInputPoint(point, calibration, display),
    append: (action) => mobileRecording.append(action),
    capture: (sample, context) => mobileRecording.capture(sample, context),
  },
  healing: {
    enable: () => healing.enable(),
    disable: () => healing.disable(),
    isEnabled: () => healing.isEnabled(),
    setApprovalPolicy: (policy) => healing.setApprovalPolicy(policy),
    getApprovalPolicy: () => healing.getApprovalPolicy(),
    approve: (result) => healing.approve(result),
    reject: (result) => healing.reject(result),
    getHistory: () => healing.getHealingHistory(),
    compareHistory: () => healing.compareHistory(),
    getApprovedLocators: () => healing.getApprovedLocators(),
  },
  scraper: {
    scrapeTable: (config) => scraper.scrapeTable(config),
    ingestData: (records, source) => scraper.ingestData(records, source),
    getProgress: () => scraper.getProgress(),
    cancel: () => scraper.cancel(),
    exportData: (format) => scraper.exportData(format),
  },
  reporter: {
    exportReport: (report, format) => reporter.exportReport(report, format),
    searchHistory: (query) => reporter.searchHistory(query),
    getRunAnalytics: () => reporter.getRunAnalytics(),
    exportHistory: () => reporter.exportHistory(),
    importHistory: (value) => reporter.importHistory(value),
    recordReport: (report) => reporter.recordReport(report),
    fromExecutionResult: (testName, execution) => reporter.fromExecutionResult(testName, execution),
  },
  project: {
    setVariable: (name, value) => project.setVariable(name, value),
    removeVariable: (name) => project.removeVariable(name),
    setEnvironment: (profile) => project.setEnvironment(profile),
    setFlow: (name, actions) => project.setFlow(name, actions),
    setHook: (name, actions) => project.setHook(name, actions),
    resolve: (plan) => project.resolve(plan),
    export: () => project.export(),
    import: (document) => project.import(document),
  },
  shortcuts: {
    set: (definition) => shortcuts.set(definition),
    remove: (command) => shortcuts.remove(command),
    reference: () => shortcuts.reference(),
  },
  suites: {
    create: (name, options) => suites.createSuite(name, options),
    addTest: (suiteId, test) => suites.addTest(suiteId, test),
    updateTest: (suiteId, testId, patch) => suites.updateTest(suiteId, testId, patch),
    removeTest: (suiteId, testId) => suites.removeTest(suiteId, testId),
    filter: (filter) => suites.filter(filter),
    list: () => suites.listSuites(),
    export: () => suites.export(),
    import: (value) => suites.import(value),
    runMatrix: (filter, matrix, maxConcurrency, options) =>
      browser.executeSuiteMatrix(filter, matrix, maxConcurrency, options),
  },
  visual: {
    setBaseline: (name, image) => visual.setBaseline(name, image),
    getBaseline: (name) => visual.getBaseline(name),
    compare: (name, image, threshold) => visual.compare(name, image, threshold),
    export: () => visual.export(),
    import: (value) => visual.import(value),
  },
  generation: {
    generate: (prompt) => generator.generate(prompt),
    update: (id, actions) => generator.update(id, actions),
    approve: (id, note) => generator.approve(id, note),
    reject: (id, note) => generator.reject(id, note),
    executableActions: (id) => generator.executableActions(id),
    list: () => generator.list(),
  },
  scheduler: {
    create: (name, intervalMinutes, payload, startAt) => scheduler.create(name, intervalMinutes, payload, startAt),
    due: (now) => scheduler.due(now),
    markRun: (id, completedAt) => scheduler.markRun(id, completedAt),
    setEnabled: (id, enabled) => scheduler.setEnabled(id, enabled),
    list: () => scheduler.list(),
    export: () => scheduler.export(),
    import: (value) => scheduler.import(value),
  },
  plugins: {
    install: (bundle, approvedPermissions) => plugins.install(bundle, approvedPermissions),
    approvePermissions: (pluginId, permissions) => plugins.approvePermissions(pluginId, permissions),
    enable: (pluginId) => plugins.enable(pluginId),
    disable: (pluginId) => plugins.disable(pluginId),
    uninstall: (pluginId) => plugins.uninstall(pluginId),
    list: () => plugins.list(),
    export: () => plugins.export(),
    import: (value) => plugins.import(value),
    configure: (pluginId, configuration) => plugins.configure(pluginId, configuration),
    listExtensions: (type) => plugins.listExtensions(type),
    execute: (type, id, payload, context) => plugins.execute(type, id, payload, context),
  },
  ipc: {
    invoke: (channel, payload) => {
      if (!invokeChannels.has(channel)) throw new Error(`IPC channel is not allowed: ${channel}`);
      return ipcRenderer.invoke(channel, payload);
    },
    send: (channel, payload) => {
      if (!sendChannels.has(channel)) throw new Error(`IPC channel is not allowed: ${channel}`);
      ipcRenderer.send(channel, payload);
    },
    on: (channel, callback) => {
      if (!receiveChannels.has(channel)) throw new Error(`IPC channel is not allowed: ${channel}`);
      const listener = (_event, ...args) => callback(...args);
      ipcRenderer.on(channel, listener);
      return () => ipcRenderer.removeListener(channel, listener);
    },
  },
  openExternal: (url) => {
    if (!externalURLs.has(url)) throw new Error('External URL is not allowed');
    return shell.openExternal(url);
  },
});
