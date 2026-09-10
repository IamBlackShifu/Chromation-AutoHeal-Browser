/**
 * OmniFlow QA - Electron Main Process
 * This creates the browser window and handles the main application lifecycle
 */

const { app, BrowserWindow, ipcMain, Menu, dialog, webContents, session, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const packageMetadata = require('./package.json');
const { execFileSync, spawn } = require('child_process');
const APP_ID = packageMetadata.build?.appId || 'com.infinitylinesofcode.omniflowqa';
const APP_ICON_PATH = path.join(__dirname, 'assets', 'omniflow-qa-icon.png');

app.setName(packageMetadata.productName || 'OmniFlow QA');
if (process.platform === 'win32') {
  app.setAppUserModelId(APP_ID);
}

if (process.env.CHROMATION_E2E_USER_DATA) {
  app.setPath('userData', path.resolve(process.env.CHROMATION_E2E_USER_DATA));
}
const {
  createRecordingDocument,
  parseRecordingDocument,
  validateRecordedAction,
} = require('./dist/recording/RecordingSchema');
const { AndroidAutomationDriver } = require('./dist/drivers/appium/AndroidAutomationDriver');
const { AppiumProcessManager } = require('./dist/drivers/appium/AppiumProcessManager');
const { ScrcpyProcessManager } = require('./dist/mobile/streaming/ScrcpyProcessManager');
const { ANDROID_ACTION_MATRIX, preflightAndroidActions, validateMobileProfile } = require('./dist/mobile/diagnostics/MobileReadiness');
const { AndroidDeviceDiscovery } = require('./dist/mobile/diagnostics/AndroidDeviceDiscovery');
const { AndroidInputEventParser } = require('./dist/mobile/recording/AndroidInputEventParser');

let mainWindow;
let browserView;
const MAX_RECORDING_FILE_BYTES = 10 * 1024 * 1024;
const originPermissions = new Map();
let mobileDriver = null;
let mobileReplayDriver = null;
let mobileTouchCapture = null;
let mobileTouchCaptureStatus = { state: 'idle', bytes: 0, chunks: 0, touches: 0, keys: 0, error: null };
const appiumProcessManager = new AppiumProcessManager();
const scrcpyProcessManager = new ScrcpyProcessManager();
const androidDeviceDiscovery = new AndroidDeviceDiscovery();

function assertTrustedRenderer(event) {
  if (!mainWindow || event.sender !== mainWindow.webContents) {
    throw new Error('Mobile request did not originate from this browser window');
  }
}

function validateMobileConnectionRequest(request) {
  if (!request || request.platform !== 'android') throw new Error('Only Android is available in this build');
  const serverUrl = String(request.serverUrl || '').trim();
  const parsed = new URL(serverUrl);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Appium server must use HTTP or HTTPS');
  if (!['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)) {
    throw new Error('Remote Appium servers are disabled until explicit host permissions are implemented');
  }
  const deviceName = String(request.deviceName || '').trim();
  if (!deviceName || deviceName.length > 200) throw new Error('Device name is required');
  const appId = String(request.appId || '').trim();
  if (appId.length > 500) throw new Error('App identifier is too long');
  const appActivity = String(request.appActivity || '').trim();
  if (appActivity.length > 500) throw new Error('Application activity is too long');
  const udid = String(request.udid || '').trim();
  if (udid.length > 200 || (udid && !/^[A-Za-z0-9._:-]+$/.test(udid))) throw new Error('Device serial is invalid');
  const advanced = request.capabilities && typeof request.capabilities === 'object' && !Array.isArray(request.capabilities)
    ? request.capabilities : {};
  const invalidCapability = Object.entries(advanced).find(([name, value]) =>
    (!name.startsWith('appium:') && name !== 'platformName') ||
    !['string', 'number', 'boolean'].includes(typeof value));
  if (invalidCapability) throw new Error(`Advanced capability is invalid: ${invalidCapability[0]}`);
  const capabilities = {
    'appium:deviceName': deviceName,
    'appium:noReset': false,
    'appium:fullReset': false,
    'appium:autoGrantPermissions': true,
    ...(udid ? { 'appium:udid': udid } : {}),
    ...(appId ? { 'appium:appPackage': appId } : {}),
    ...(appActivity ? { 'appium:appActivity': appActivity } : {}),
    ...advanced,
  };
  return { serverUrl: parsed.toString().replace(/\/$/, ''), capabilities };
}

function createWindow() {
  // Create the main application window
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    frame: false,
    title: `OmniFlow QA v${packageMetadata.version}`,
    icon: APP_ICON_PATH,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webviewTag: true
    }
  });

  // Load the UI
  mainWindow.loadFile('ui/browser.html');

  // Create application menu
  createMenu();

  // Open DevTools in development mode
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => {
    mobileDriver?.close().catch(() => undefined);
    mobileDriver = null;
    mainWindow = null;
  });

  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window-maximized', true);
  });

  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window-maximized', false);
  });

  console.log('OmniFlow QA window created');
}

function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Tools',
      submenu: [
        {
          label: 'Inspector',
          accelerator: 'CmdOrCtrl+Shift+I',
          click: () => {
            mainWindow.webContents.send('toggle-inspector');
          }
        },
        {
          label: 'Recorder',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => {
            mainWindow.webContents.send('toggle-recorder');
          }
        },
        {
          label: 'Scraper Studio',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => {
            mainWindow.webContents.send('toggle-scraper');
          }
        },
        { type: 'separator' },
        {
          label: 'Healing Engine',
          type: 'checkbox',
          checked: true,
          click: (menuItem) => {
            mainWindow.webContents.send('toggle-healing', menuItem.checked);
          }
        }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Documentation',
          click: () => {
            require('electron').shell.openExternal('https://github.com/Infinity-Lines-of-Code/omniflow-qa');
          }
        },
        {
          label: 'About',
          click: () => {
            mainWindow.webContents.send('show-about');
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// App lifecycle
app.whenReady().then(() => {
  configureGuestPermissions();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC handlers for communication between main and renderer processes
ipcMain.on('navigate-to', (event, url) => {
  console.log('Navigating to:', url);
  event.reply('navigation-started', url);
});

ipcMain.on('start-inspection', (event) => {
  console.log('Inspection mode started');
});

ipcMain.on('start-recording', (event, mode) => {
  console.log('Recording started in mode:', mode);
});

ipcMain.on('export-script', (event, format) => {
  console.log('Exporting script in format:', format);
});

app.on('before-quit', () => {
  mobileTouchCapture?.kill();
  void appiumProcessManager.stopAll();
  void scrcpyProcessManager.stopAll();
});

function configureGuestPermissions() {
  const guestSession = session.fromPartition('persist:chromation');
  const isAllowed = (origin, permission) =>
    originPermissions.get(origin)?.has(permission) === true;
  guestSession.setPermissionCheckHandler((_webContents, permission, requestingOrigin) =>
    isAllowed(requestingOrigin, permission)
  );
  guestSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    try {
      const origin = details.requestingUrl
        ? new URL(details.requestingUrl).origin
        : new URL(contents.getURL()).origin;
      callback(isAllowed(origin, permission));
    } catch {
      callback(false);
    }
  });
}

function readRecordingFile(filePath) {
  const stats = fs.statSync(filePath);
  if (!stats.isFile() || stats.size <= 0 || stats.size > MAX_RECORDING_FILE_BYTES) {
    throw new Error('Recording file must be a non-empty JSON file no larger than 10 MB');
  }
  return fs.readFileSync(filePath, 'utf8');
}

app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (_attachEvent, webPreferences) => {
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
  });
  if (contents.getType() === 'webview') {
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  }
});

function resolveUploadGuest(event, guestWebContentsId, selector) {
  if (
    !Number.isInteger(guestWebContentsId) ||
    typeof selector !== 'string' ||
    selector.length === 0 ||
    selector.length > 4096
  ) {
    throw new Error('Invalid file-input request');
  }
  const guest = webContents.fromId(guestWebContentsId);
  if (
    !guest ||
    event.sender !== mainWindow?.webContents ||
    guest.getOwnerBrowserWindow() !== mainWindow
  ) {
    throw new Error('File-input request did not originate from this browser window');
  }
  return guest;
}

async function applyFilesToGuestInput(event, { guestWebContentsId, selector, filePaths }) {
  const guest = resolveUploadGuest(event, guestWebContentsId, selector);
  if (
    !Array.isArray(filePaths) ||
    filePaths.length === 0 ||
    filePaths.length > 100 ||
    filePaths.some((file) => typeof file !== 'string' || !path.isAbsolute(file) || !fs.existsSync(file))
  ) {
    throw new Error('Upload files must be existing absolute paths');
  }

  const attachedHere = !guest.debugger.isAttached();
  if (attachedHere) guest.debugger.attach('1.3');
  try {
    await guest.debugger.sendCommand('DOM.enable');
    const { root } = await guest.debugger.sendCommand('DOM.getDocument', { depth: -1, pierce: true });
    const { nodeId } = await guest.debugger.sendCommand('DOM.querySelector', {
      nodeId: root.nodeId,
      selector,
    });
    if (!nodeId) throw new Error(`File input not found: ${selector}`);
    await guest.debugger.sendCommand('DOM.setFileInputFiles', { nodeId, files: filePaths });
    const { object } = await guest.debugger.sendCommand('DOM.resolveNode', { nodeId });
    if (object.objectId) {
      await guest.debugger.sendCommand('Runtime.callFunctionOn', {
        objectId: object.objectId,
        functionDeclaration: `function() {
          this.dispatchEvent(new Event('input', { bubbles: true }));
          this.dispatchEvent(new Event('change', { bubbles: true }));
        }`,
      });
    }
  } finally {
    if (attachedHere && guest.debugger.isAttached()) guest.debugger.detach();
  }
}

ipcMain.handle('choose-upload-files', async (event, request) => {
  try {
    resolveUploadGuest(event, request.guestWebContentsId, request.selector);
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select file to upload',
      properties: request.multiple ? ['openFile', 'multiSelections'] : ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true, filePaths: [] };
    }
    await applyFilesToGuestInput(event, { ...request, filePaths: result.filePaths });
    return { success: true, canceled: false, filePaths: result.filePaths };
  } catch (error) {
    console.error('Failed to select upload files:', error);
    return { success: false, canceled: false, error: error.message, filePaths: [] };
  }
});

ipcMain.handle('set-upload-files', async (event, request) => {
  try {
    await applyFilesToGuestInput(event, request);
    return { success: true };
  } catch (error) {
    console.error('Failed to replay upload:', error);
    return { success: false, error: error.message };
  }
});

// Recordings directory management
const recordingsDir = path.join(app.getPath('userData'), 'saved-recordings');
const runHistoryPath = path.join(app.getPath('userData'), 'run-history.json');
const mobileProfilesPath = path.join(app.getPath('userData'), 'mobile-profiles.json');
const browsingHistoryPath = path.join(app.getPath('userData'), 'browsing-history.json');

function readBrowsingHistory() {
  if (!fs.existsSync(browsingHistoryPath)) return [];
  const parsed = JSON.parse(fs.readFileSync(browsingHistoryPath, 'utf8'));
  return Array.isArray(parsed) ? parsed : [];
}

function writeBrowsingHistory(entries) {
  fs.writeFileSync(browsingHistoryPath, JSON.stringify(entries.slice(0, 5000), null, 2));
}
const environmentVaultPath = path.join(app.getPath('userData'), 'environment-vault.json');

function readEnvironmentVault() {
  if (!fs.existsSync(environmentVaultPath)) return {};
  const stored = JSON.parse(fs.readFileSync(environmentVaultPath, 'utf8'));
  return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
}

function validateEnvironmentName(name) {
  if (typeof name !== 'string' || !/^[A-Z][A-Z0-9_]{0,127}$/i.test(name)) {
    throw new Error('Environment variable name must contain only letters, numbers, and underscores');
  }
}

ipcMain.handle('set-environment-variable', async (_event, { name, value }) => {
  try {
    validateEnvironmentName(name);
    if (typeof value !== 'string' || value.length > 64 * 1024) {
      throw new Error('Environment variable value must be a string no larger than 64 KB');
    }
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Operating-system credential encryption is not available');
    }
    const vault = readEnvironmentVault();
    vault[name] = safeStorage.encryptString(value).toString('base64');
    fs.writeFileSync(environmentVaultPath, JSON.stringify(vault, null, 2), { mode: 0o600 });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-environment-variable', async (_event, name) => {
  try {
    validateEnvironmentName(name);
    const encrypted = readEnvironmentVault()[name];
    if (typeof encrypted !== 'string') return { success: true, value: null };
    return {
      success: true,
      value: safeStorage.decryptString(Buffer.from(encrypted, 'base64')),
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('list-environment-variables', async () => ({
  success: true,
  names: Object.keys(readEnvironmentVault()).sort(),
}));

ipcMain.handle('set-origin-permission', async (_event, { origin, permission, allowed }) => {
  try {
    const normalizedOrigin = new URL(origin).origin;
    if (typeof permission !== 'string' || permission.length > 100 || typeof allowed !== 'boolean') {
      throw new Error('Invalid permission request');
    }
    const permissions = originPermissions.get(normalizedOrigin) ?? new Set();
    if (allowed) permissions.add(permission);
    else permissions.delete(permission);
    originPermissions.set(normalizedOrigin, permissions);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

function resolveRecordingPath(filename) {
  if (typeof filename !== 'string' || path.basename(filename) !== filename || !filename.endsWith('.json')) {
    throw new Error('Invalid recording filename');
  }
  const resolved = path.resolve(recordingsDir, filename);
  const root = path.resolve(recordingsDir) + path.sep;
  if (!resolved.startsWith(root)) {
    throw new Error('Recording path is outside the recordings directory');
  }
  return resolved;
}

// Ensure recordings directory exists
if (!fs.existsSync(recordingsDir)) {
  fs.mkdirSync(recordingsDir, { recursive: true });
}

// Save recording
ipcMain.handle('save-recording', async (event, { name, actions, target }) => {
  try {
    const timestamp = Date.now();
    const workspacePrefix = target?.platform === 'android' || target?.platform === 'ios' ? 'mobile' : 'web';
    const cleanName = String(name || 'suite').replace(/^(web|mobile)_suite_/i, '').replace(/[^a-z0-9]/gi, '_');
    const filename = `${workspacePrefix}_suite_${cleanName}_${timestamp}.json`;
    const filePath = path.join(recordingsDir, filename);
    
    const recording = createRecordingDocument(name, actions, timestamp, target);
    
    fs.writeFileSync(filePath, JSON.stringify(recording, null, 2));
    console.log('Recording saved:', filePath);
    
    return { success: true, filename, path: filePath };
  } catch (error) {
    console.error('Failed to save recording:', error);
    return { success: false, error: error.message };
  }
});

// Load all saved recordings
ipcMain.handle('load-recordings', async () => {
  try {
    const files = fs.readdirSync(recordingsDir);
    const recordings = files
      .filter(file => file.endsWith('.json'))
      .map(file => {
        try {
          const filePath = path.join(recordingsDir, file);
          const content = readRecordingFile(filePath);
          const data = parseRecordingDocument(JSON.parse(content));
          return {
            filename: file,
            path: filePath,
            ...data
          };
        } catch (error) {
          console.error(`Failed to load recording ${file}:`, error);
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
    
    console.log(`Loaded ${recordings.length} recordings`);
    return { success: true, recordings };
  } catch (error) {
    console.error('Failed to load recordings:', error);
    return { success: false, error: error.message, recordings: [] };
  }
});

// Load specific recording
ipcMain.handle('load-recording', async (event, filename) => {
  try {
    const filePath = resolveRecordingPath(filename);
    const content = readRecordingFile(filePath);
    const recording = parseRecordingDocument(JSON.parse(content));
    
    console.log('Recording loaded:', filename);
    return { success: true, recording };
  } catch (error) {
    console.error('Failed to load recording:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('save-run-history', async (event, serializedHistory) => {
  try {
    const parsed = JSON.parse(String(serializedHistory || '[]'));
    if (!Array.isArray(parsed)) throw new Error('Run history must be an array');
    fs.writeFileSync(runHistoryPath, JSON.stringify(parsed, null, 2));
    return { success: true };
  } catch (error) {
    console.error('Failed to save run history:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('load-run-history', async () => {
  try {
    if (!fs.existsSync(runHistoryPath)) return { success: true, history: '[]' };
    const history = fs.readFileSync(runHistoryPath, 'utf8');
    JSON.parse(history);
    return { success: true, history };
  } catch (error) {
    console.error('Failed to load run history:', error);
    return { success: false, error: error.message, history: '[]' };
  }
});

ipcMain.handle('add-browsing-history', async (event, visit) => {
  try {
    const url = String(visit?.url || '').trim();
    if (!/^https?:\/\//i.test(url)) return { success: false, error: 'Only HTTP(S) visits can be stored' };
    const entries = readBrowsingHistory();
    const timestamp = Number(visit?.timestamp) || Date.now();
    const recent = entries[0];
    if (recent && recent.url === url && timestamp - recent.timestamp < 5000) {
      recent.title = String(visit?.title || recent.title || url).slice(0, 300);
      recent.timestamp = timestamp;
      writeBrowsingHistory(entries);
      return { success: true, entry: recent };
    }
    const entry = {
      id: `${timestamp}_${Math.random().toString(36).slice(2, 10)}`,
      url,
      title: String(visit?.title || url).slice(0, 300),
      timestamp,
    };
    entries.unshift(entry);
    writeBrowsingHistory(entries);
    return { success: true, entry };
  } catch (error) {
    console.error('Failed to add browsing history:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('load-browsing-history', async () => {
  try {
    return { success: true, entries: readBrowsingHistory() };
  } catch (error) {
    return { success: false, error: error.message, entries: [] };
  }
});

ipcMain.handle('delete-browsing-history-entry', async (event, id) => {
  try {
    const entries = readBrowsingHistory();
    writeBrowsingHistory(entries.filter((entry) => entry.id !== String(id)));
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('clear-browsing-history', async () => {
  try {
    writeBrowsingHistory([]);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-app-diagnostics', async () => {
  const paths = {
    userData: app.getPath('userData'),
    recordings: recordingsDir,
    runHistory: runHistoryPath,
    browsingHistory: browsingHistoryPath,
  };
  const stores = Object.entries(paths).map(([name, target]) => {
    try {
      const stat = fs.existsSync(target) ? fs.statSync(target) : null;
      return { name, path: target, exists: Boolean(stat), bytes: stat?.isFile() ? stat.size : 0, healthy: true };
    } catch (error) {
      return { name, path: target, exists: false, bytes: 0, healthy: false, error: error.message };
    }
  });
  return {
    success: true,
    versions: { app: app.getVersion(), electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node },
    platform: { os: process.platform, architecture: process.arch },
    stores,
    permissions: [...originPermissions.entries()].map(([origin, permission]) => ({ origin, permission })),
    safeStorageAvailable: safeStorage.isEncryptionAvailable(),
    timestamp: Date.now(),
  };
});

ipcMain.handle('mobile-connect', async (event, request) => {
  try {
    assertTrustedRenderer(event);
    const config = validateMobileConnectionRequest(request);
    mobileTouchCapture?.kill(); mobileTouchCapture = null;
    await mobileDriver?.close().catch(() => undefined);
    mobileDriver = new AndroidAutomationDriver(config);
    const sessionInfo = await mobileDriver.connect();
    return { success: true, sessionInfo };
  } catch (error) {
    await mobileDriver?.close().catch(() => undefined);
    mobileDriver = null;
    return { success: false, error: error.message };
  }
});

ipcMain.handle('mobile-appium-start', async (event, options) => {
  try {
    assertTrustedRenderer(event);
    const instance = await appiumProcessManager.start({
      startupTimeoutMs: Math.min(60_000, Math.max(1_000, Number(options?.startupTimeoutMs) || 20_000)),
    });
    return { success: true, instance };
  } catch (error) { return { success: false, error: error.message }; }
});

ipcMain.handle('mobile-appium-status', async (event) => {
  assertTrustedRenderer(event);
  return { success: true, instances: appiumProcessManager.list() };
});

ipcMain.handle('mobile-appium-stop', async (event, instanceId) => {
  try {
    assertTrustedRenderer(event);
    return { success: true, stopped: await appiumProcessManager.stop(String(instanceId || '')) };
  } catch (error) { return { success: false, error: error.message }; }
});

ipcMain.handle('mobile-scrcpy-start', async (event, options) => {
  try {
    assertTrustedRenderer(event);
    const mirror = await scrcpyProcessManager.start({ serial: String(options?.serial || ''), title: options?.title });
    return { success: true, mirror };
  } catch (error) { return { success: false, error: error.message }; }
});

ipcMain.handle('mobile-scrcpy-status', async (event) => {
  assertTrustedRenderer(event);
  return { success: true, mirrors: scrcpyProcessManager.list() };
});

ipcMain.handle('mobile-scrcpy-stop', async (event, mirrorId) => {
  try { assertTrustedRenderer(event); return { success: true, stopped: await scrcpyProcessManager.stop(String(mirrorId || '')) }; }
  catch (error) { return { success: false, error: error.message }; }
});

function runDoctorCommand(command, args, successPattern) {
  try {
    const output = execFileSync(command, args, { encoding: 'utf8', timeout: 8000, windowsHide: true });
    return { ok: successPattern ? successPattern.test(output) : true, output: output.trim().slice(0, 1200) };
  } catch (error) {
    return { ok: false, output: String(error.stderr || error.message || error).trim().slice(0, 1200) };
  }
}

ipcMain.handle('mobile-doctor', async (event) => {
  assertTrustedRenderer(event);
  const appium = runDoctorCommand(process.platform === 'win32' ? 'appium.cmd' : 'appium', ['--version']);
  const drivers = runDoctorCommand(process.platform === 'win32' ? 'appium.cmd' : 'appium', ['driver', 'list', '--installed'], /uiautomator2/i);
  const adb = runDoctorCommand('adb', ['version']);
  const devices = runDoctorCommand('adb', ['devices', '-l'], /\n[^\n]+\sdevice(?:\s|$)/);
  const scrcpy = runDoctorCommand(process.platform === 'win32' ? 'scrcpy.exe' : 'scrcpy', ['--version'], /scrcpy/i);
  const java = runDoctorCommand('java', ['-version']);
  const checks = [
    { id: 'appium', label: 'Appium server', status: appium.ok ? 'passed' : 'failed', detail: appium.output || 'The Appium command is not available on PATH.', remedy: 'Install Appium 3 globally, restart OmniFlow QA, then run Setup Doctor again.', command: 'npm install -g appium@3' },
    { id: 'uiautomator2', label: 'UiAutomator2 driver', status: drivers.ok ? 'passed' : 'failed', detail: appium.ok ? (drivers.output || 'UiAutomator2 is not installed.') : 'Cannot inspect drivers until Appium is installed and available on PATH.', remedy: appium.ok ? 'Install the Android UiAutomator2 driver, then run Setup Doctor again.' : 'Install Appium first; then install UiAutomator2.', command: 'appium driver install uiautomator2', dependsOn: appium.ok ? undefined : 'appium' },
    { id: 'adb', label: 'Android Debug Bridge', status: adb.ok ? 'passed' : 'failed', detail: adb.output || 'Not available', remedy: 'Install Android platform-tools and add adb to PATH.' },
    { id: 'java', label: 'Java runtime', status: java.ok ? 'passed' : 'failed', detail: java.output || 'Not available', remedy: 'Install a supported JDK and configure JAVA_HOME.' },
    { id: 'device', label: 'Authorized device', status: devices.ok ? 'passed' : 'warning', detail: devices.output || 'No device detected', remedy: 'Start an emulator or authorize USB debugging on a connected device.' },
    { id: 'scrcpy', label: 'Low-latency mirror', status: scrcpy.ok ? 'passed' : 'warning', detail: scrcpy.output || 'scrcpy is not installed', remedy: 'Install scrcpy to enable the native low-latency control window; the embedded inspector will continue using MJPEG or screenshots.' },
  ];
  return { success: true, ready: checks.filter((check) => check.id !== 'scrcpy').every((check) => check.status === 'passed'), checks, actionMatrix: ANDROID_ACTION_MATRIX };
});

ipcMain.handle('mobile-workspace-readiness', async (event, request) => {
  try {
    assertTrustedRenderer(event);
    const adb = runDoctorCommand('adb', ['version']);
    const serverUrl = new URL(String(request?.serverUrl || 'http://127.0.0.1:4723'));
    if (!['127.0.0.1', 'localhost', '::1'].includes(serverUrl.hostname)) throw new Error('Only local Appium readiness checks are allowed');
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 1600);
    let appium = false;
    try { const response = await fetch(`${serverUrl.toString().replace(/\/$/, '')}/status`, { signal: controller.signal }); appium = response.ok; }
    catch (_) { appium = false; }
    finally { clearTimeout(timer); }
    return { success: true, checks: { bridge: adb.ok, appium, appId: Boolean(String(request?.appId || '').trim()) }, checkedAt: Date.now() };
  } catch (error) { return { success: false, error: error.message, checks: { bridge: false, appium: false, appId: false } }; }
});

ipcMain.handle('mobile-list-devices', async (event) => {
  try {
    assertTrustedRenderer(event);
    return { success: true, devices: await androidDeviceDiscovery.list(), refreshedAt: Date.now() };
  } catch (error) { return { success: false, error: error.message, devices: [] }; }
});

ipcMain.handle('mobile-preflight', async (event, request) => {
  try {
    assertTrustedRenderer(event);
    const actions = Array.isArray(request?.actions) ? request.actions.map(validateRecordedAction) : [];
    validateMobileConnectionRequest(request?.connection);
    return { success: true, ...preflightAndroidActions(actions) };
  } catch (error) { return { success: false, supported: false, error: error.message, unsupported: [], warnings: [] }; }
});

ipcMain.handle('mobile-load-profiles', async (event) => {
  assertTrustedRenderer(event);
  try { return { success: true, profiles: fs.existsSync(mobileProfilesPath) ? JSON.parse(fs.readFileSync(mobileProfilesPath, 'utf8')) : [] }; }
  catch (error) { return { success: false, error: error.message, profiles: [] }; }
});

ipcMain.handle('mobile-save-profile', async (event, value) => {
  try {
    assertTrustedRenderer(event);
    const profile = validateMobileProfile(value);
    const profiles = fs.existsSync(mobileProfilesPath) ? JSON.parse(fs.readFileSync(mobileProfilesPath, 'utf8')) : [];
    const updated = [...profiles.filter((item) => item.id !== profile.id), profile].sort((a, b) => a.name.localeCompare(b.name));
    fs.writeFileSync(mobileProfilesPath, JSON.stringify(updated, null, 2));
    return { success: true, profile, profiles: updated };
  } catch (error) { return { success: false, error: error.message }; }
});

ipcMain.handle('mobile-delete-profile', async (event, profileId) => {
  try {
    assertTrustedRenderer(event);
    const profiles = fs.existsSync(mobileProfilesPath) ? JSON.parse(fs.readFileSync(mobileProfilesPath, 'utf8')) : [];
    const updated = profiles.filter((item) => item.id !== String(profileId));
    fs.writeFileSync(mobileProfilesPath, JSON.stringify(updated, null, 2));
    return { success: true, profiles: updated };
  } catch (error) { return { success: false, error: error.message }; }
});

ipcMain.handle('mobile-status', async (event) => {
  try {
    assertTrustedRenderer(event);
    return { success: true, status: mobileDriver ? await mobileDriver.getLiveStatus() : { connected: false, sessionId: null } };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('mobile-touch-capture-start', async (event, request) => {
  try {
    assertTrustedRenderer(event);
    const serial = String(request?.serial || '').trim();
    if (!/^[A-Za-z0-9._:-]+$/.test(serial)) throw new Error('A valid device serial is required for physical touch capture');
    const inputProfile = execFileSync('adb', ['-s', serial, 'shell', 'getevent', '-lp'], { encoding: 'utf8', timeout: 8000, windowsHide: true });
    const rawWidth = Number(inputProfile.match(/ABS_MT_POSITION_X\s*:.*?max\s+(\d+)/)?.[1]) + 1;
    const rawHeight = Number(inputProfile.match(/ABS_MT_POSITION_Y\s*:.*?max\s+(\d+)/)?.[1]) + 1;
    if (!rawWidth || !rawHeight) throw new Error('Could not determine the Android touch-controller coordinate range');
    const inputState = execFileSync('adb', ['-s', serial, 'shell', 'dumpsys', 'input'], { encoding: 'utf8', timeout: 8000, windowsHide: true });
    const rotation = Number(inputState.match(/Viewport INTERNAL:[\s\S]*?orientation=(\d)/)?.[1] || 0);
    mobileTouchCapture?.kill();
    const child = spawn('adb', ['-s', serial, 'shell', 'getevent', '-lt'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    mobileTouchCapture = child;
    mobileTouchCaptureStatus = { state: 'starting', serial, pid: child.pid, bytes: 0, chunks: 0, touches: 0, keys: 0, error: null };
    const parser = new AndroidInputEventParser();
    child.stdout.on('data', (chunk) => {
      mobileTouchCaptureStatus.bytes += chunk.length; mobileTouchCaptureStatus.chunks += 1;
      const parsed = parser.push(chunk.toString());
      mobileTouchCaptureStatus.touches += parsed.touches.length; mobileTouchCaptureStatus.keys += parsed.keys.length;
      parsed.touches.forEach((sample) => mainWindow?.webContents.send('mobile-native-touch', sample));
      parsed.keys.forEach((key) => mainWindow?.webContents.send('mobile-native-key', key));
    });
    child.stderr.on('data', (chunk) => { const error = chunk.toString().trim().slice(0, 500); mobileTouchCaptureStatus.error = error; mainWindow?.webContents.send('mobile-touch-capture-error', error); });
    child.once('exit', (code) => { mobileTouchCaptureStatus.state = 'stopped'; mobileTouchCaptureStatus.exitCode = code; if (mobileTouchCapture === child) mobileTouchCapture = null; });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, 300);
      child.once('error', (error) => { clearTimeout(timer); reject(error); });
      child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`ADB input stream exited during startup (${code ?? 'unknown'})`)); });
    });
    mobileTouchCaptureStatus.state = 'running';
    return { success: true, pid: child.pid, calibration: { rawWidth, rawHeight, rotation } };
  } catch (error) { return { success: false, error: error.message }; }
});

ipcMain.handle('mobile-touch-capture-stop', async (event) => {
  assertTrustedRenderer(event);
  mobileTouchCapture?.kill(); mobileTouchCapture = null;
  return { success: true };
});

ipcMain.handle('mobile-touch-capture-status', async (event) => {
  assertTrustedRenderer(event); return { success: true, status: { ...mobileTouchCaptureStatus } };
});

ipcMain.handle('mobile-inspect', async (event) => {
  try {
    assertTrustedRenderer(event);
    if (!mobileDriver?.isConnected()) throw new Error('No mobile device session is connected');
    const inspection = await mobileDriver.inspectHierarchy();
    const status = await mobileDriver.getLiveStatus();
    return { success: true, inspection, status };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('mobile-action', async (event, request) => {
  try {
    assertTrustedRenderer(event);
    if (!mobileDriver?.isConnected()) throw new Error('No mobile device session is connected');
    const action = validateRecordedAction(request?.action);
    if (!['tap', 'click', 'doubleclick', 'input', 'clear', 'back', 'hideKeyboard', 'rotate', 'switchContext',
      'longPress', 'swipe', 'scroll', 'launchApp', 'terminateApp', 'resetApp', 'deepLink',
      'acceptAlert', 'dismissAlert', 'grantPermission', 'revokePermission', 'installApp', 'upload',
      'clearAppData', 'mobileKey'].includes(action.type)) {
      throw new Error(`Live mobile action ${action.type} is not allowed`);
    }
    await mobileDriver.executeLiveAction(action);
    const inspection = await mobileDriver.inspectHierarchy();
    const status = await mobileDriver.getLiveStatus();
    return { success: true, inspection, status };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('mobile-replay', async (event, request) => {
  try {
    assertTrustedRenderer(event);
    const actions = request?.actions;
    if (!Array.isArray(actions)) throw new Error('Mobile replay actions must be an array');
    let validated = actions.map(validateRecordedAction);
    const appId = String(request?.connection?.appId || '').trim();
    const appActivity = String(request?.connection?.appActivity || '').trim();
    if (!appId) throw new Error('Mobile replay requires a package name or bundle identifier');
    const launchAction = { id: `mobile_${Date.now()}_bootstrap`, schemaVersion: 1, type: 'launchApp', selector: 'device', value: appId,
      timestamp: Date.now(), metadata: { mobileReplayBootstrap: true, appActivity, resetAppState: request?.options?.resetAppState === true } };
    validated = validated[0]?.type === 'launchApp'
      ? [{ ...validated[0], value: appId, metadata: { ...(validated[0].metadata || {}), ...launchAction.metadata } }, ...validated.slice(1)]
      : [validateRecordedAction(launchAction), ...validated];
    let driver = mobileDriver;
    if (!driver?.isConnected()) {
      const config = validateMobileConnectionRequest(request?.connection);
      driver = new AndroidAutomationDriver(config);
    }
    if (['automatic', 'ask', 'report-only'].includes(request?.healingPolicy)) driver.setHealingApprovalPolicy(request.healingPolicy);
    mobileReplayDriver = driver;
    const execution = await driver.execute(validated, request?.options);
    const healingHistory = driver.getHealingHistory();
    if (driver === mobileDriver) {
      return { success: true, execution, healingHistory, sessionReused: true, status: await driver.getLiveStatus() };
    }
    return { success: true, execution, healingHistory, sessionReused: false };
  } catch (error) {
    return { success: false, error: error.message };
  } finally {
    mobileReplayDriver = null;
  }
});

ipcMain.handle('mobile-cancel-replay', async (event) => {
  try {
    assertTrustedRenderer(event);
    return { success: true, cancelled: mobileReplayDriver?.cancel('Replay cancelled by user') ?? false };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('mobile-replay-status', async (event) => {
  try {
    assertTrustedRenderer(event);
    return { success: true, state: mobileReplayDriver?.getState() || { state: 'idle', currentStep: -1, totalSteps: 0 } };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('mobile-disconnect', async (event) => {
  try {
    assertTrustedRenderer(event);
    await mobileDriver?.disconnect();
    mobileDriver = null;
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('workspace-teardown', async (event, workspace) => {
  try {
    assertTrustedRenderer(event);
    const leaving = String(workspace || '');
    if (leaving === 'mobile') {
      mobileReplayDriver?.cancel('Workspace switched');
      mobileReplayDriver = null;
      mobileTouchCapture?.kill(); mobileTouchCapture = null;
      mobileTouchCaptureStatus = { state: 'idle', bytes: 0, chunks: 0, touches: 0, keys: 0, error: null };
      await mobileDriver?.disconnect().catch(() => undefined);
      mobileDriver = null;
      await Promise.all([appiumProcessManager.stopAll(), scrcpyProcessManager.stopAll()]);
    }
    return { success: true, workspace: leaving };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Rename a recording while keeping its actions and metadata intact.
ipcMain.handle('rename-recording', async (event, { filename, name }) => {
  try {
    const cleanName = String(name || '').trim();
    if (!cleanName || cleanName.length > 100) throw new Error('Recording name must be between 1 and 100 characters');
    const sourcePath = resolveRecordingPath(filename);
    const recording = parseRecordingDocument(JSON.parse(readRecordingFile(sourcePath)));
    const timestamp = Number(recording.timestamp) || Date.now();
    const workspacePrefix = recording.target?.platform === 'android' || recording.target?.platform === 'ios' ? 'mobile' : 'web';
    const targetFilename = `${workspacePrefix}_suite_${cleanName.replace(/^(web|mobile)_suite_/i, '').replace(/[^a-z0-9]/gi, '_')}_${timestamp}.json`;
    const targetPath = path.join(recordingsDir, targetFilename);
    if (targetPath !== sourcePath && fs.existsSync(targetPath)) throw new Error('A recording with that name already exists');
    const updated = { ...recording, name: cleanName, updatedAt: new Date().toISOString() };
    fs.writeFileSync(targetPath, JSON.stringify(updated, null, 2));
    if (targetPath !== sourcePath) fs.unlinkSync(sourcePath);
    return { success: true, filename: targetFilename, recording: updated };
  } catch (error) {
    console.error('Failed to rename recording:', error);
    return { success: false, error: error.message };
  }
});

// Delete recording
ipcMain.handle('delete-recording', async (event, filename) => {
  try {
    const filePath = resolveRecordingPath(filename);
    fs.unlinkSync(filePath);
    
    console.log('Recording deleted:', filename);
    return { success: true };
  } catch (error) {
    console.error('Failed to delete recording:', error);
    return { success: false, error: error.message };
  }
});

// Import recording from file
ipcMain.handle('import-recording', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Import Recording',
      filters: [
        { name: 'JSON Files', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    });
    
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true };
    }
    
    const filePath = result.filePaths[0];
    const content = readRecordingFile(filePath);
    const recording = parseRecordingDocument(JSON.parse(content));
    
    // Copy to recordings directory
    const timestamp = Date.now();
    const filename = `${recording.name.replace(/[^a-z0-9]/gi, '_')}_${timestamp}.json`;
    const destPath = resolveRecordingPath(filename);
    fs.writeFileSync(destPath, JSON.stringify(recording, null, 2));
    
    console.log('Recording imported:', filename);
    return { success: true, recording, filename };
  } catch (error) {
    console.error('Failed to import recording:', error);
    return { success: false, error: error.message };
  }
});

// Window controls
ipcMain.on('window-minimize', () => {
  if (mainWindow) {
    mainWindow.minimize();
  }
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) {
    mainWindow.close();
  }
});

console.log('Initializing OmniFlow QA Engine...');
