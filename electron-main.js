/**
 * Chromation AutoHeal Browser - Electron Main Process
 * This creates the browser window and handles the main application lifecycle
 */

const { app, BrowserWindow, ipcMain, Menu, dialog, webContents } = require('electron');
const path = require('path');
const fs = require('fs');
const {
  createRecordingDocument,
  parseRecordingDocument,
} = require('./dist/recording/RecordingSchema');

let mainWindow;
let browserView;

function createWindow() {
  // Create the main application window
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    frame: false,
    title: 'Chromation AutoHeal Browser',
    icon: path.join(__dirname, 'assets', 'icon.png'),
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
    mainWindow = null;
  });

  console.log('Chromation AutoHeal Browser window created');
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
            require('electron').shell.openExternal('https://github.com/IamBlackShifu/Chromation-AutoHeal-Browser');
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
ipcMain.handle('save-recording', async (event, { name, actions }) => {
  try {
    const timestamp = Date.now();
    const filename = `${name.replace(/[^a-z0-9]/gi, '_')}_${timestamp}.json`;
    const filePath = path.join(recordingsDir, filename);
    
    const recording = createRecordingDocument(name, actions, timestamp);
    
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
          const content = fs.readFileSync(filePath, 'utf8');
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
      .sort((a, b) => b.timestamp - a.timestamp);
    
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
    const content = fs.readFileSync(filePath, 'utf8');
    const recording = parseRecordingDocument(JSON.parse(content));
    
    console.log('Recording loaded:', filename);
    return { success: true, recording };
  } catch (error) {
    console.error('Failed to load recording:', error);
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
    const content = fs.readFileSync(filePath, 'utf8');
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

console.log('Chromation AutoHeal Browser starting...');
