/**
 * Chromation AutoHeal Browser - Electron Main Process
 * This creates the browser window and handles the main application lifecycle
 */

const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');

let mainWindow;
let browserView;

function createWindow() {
  // Create the main application window
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
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
