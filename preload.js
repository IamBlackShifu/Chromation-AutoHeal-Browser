const { contextBridge, ipcRenderer, shell } = require('electron');
const ChromationBrowser = require('./dist/index.js').default;

const browser = new ChromationBrowser();
const inspector = browser.getInspector();
const recorder = browser.getRecorder();
const healing = browser.getHealingEngine();
const scraper = browser.getScraperStudio();
const reporter = browser.getReporter();

const invokeChannels = new Set([
  'choose-upload-files',
  'set-upload-files',
  'save-recording',
  'import-recording',
  'load-recordings',
  'load-recording',
  'delete-recording',
]);
const sendChannels = new Set(['window-minimize', 'window-maximize', 'window-close']);
const receiveChannels = new Set([
  'toggle-inspector',
  'toggle-recorder',
  'toggle-scraper',
  'toggle-healing',
  'show-about',
]);
const externalURLs = new Set([
  'https://github.com/IamBlackShifu/Chromation-AutoHeal-Browser',
  'https://github.com/IamBlackShifu/Chromation-AutoHeal-Browser/releases',
  'https://github.com/IamBlackShifu/Chromation-AutoHeal-Browser/issues',
]);

contextBridge.exposeInMainWorld('chromationAPI', {
  initialize: () => browser.initialize(),
  shutdown: () => browser.shutdown(),
  executeRecordedActionsWithReport: (testName, options) =>
    browser.executeRecordedActionsWithReport(testName, options),
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
    setActions: (actions) => recorder.setActions(actions),
    exportScript: (format) => recorder.exportScript(format),
    clear: () => recorder.clearActions(),
  },
  healing: {
    enable: () => healing.enable(),
    disable: () => healing.disable(),
    isEnabled: () => healing.isEnabled(),
  },
  scraper: {
    scrapeTable: (config) => scraper.scrapeTable(config),
    exportData: (format) => scraper.exportData(format),
  },
  reporter: {
    exportReport: (report, format) => reporter.exportReport(report, format),
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
