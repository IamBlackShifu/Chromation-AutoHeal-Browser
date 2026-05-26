/**
 * Chromation AutoHeal Browser - Electron Main Process
 * This creates the browser window and handles the main application lifecycle
 */

const { app, BrowserWindow, ipcMain, Menu, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

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
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
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

// Recordings directory management
const recordingsDir = path.join(app.getPath('userData'), 'saved-recordings');

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
    
    const recording = {
      name,
      actions,
      timestamp,
      actionCount: actions.length
    };
    
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
          const data = JSON.parse(content);
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
    const filePath = path.join(recordingsDir, filename);
    const content = fs.readFileSync(filePath, 'utf8');
    const recording = JSON.parse(content);
    
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
    const filePath = path.join(recordingsDir, filename);
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
    const recording = JSON.parse(content);
    
    // Copy to recordings directory
    const filename = path.basename(filePath);
    const destPath = path.join(recordingsDir, filename);
    fs.copyFileSync(filePath, destPath);
    
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
