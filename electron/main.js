const { app, BrowserWindow } = require('electron');
const { initDatabase } = require('./db/init');
const { registerIpcHandlers } = require('./ipc');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';
  if (isDev) {
    const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    win.loadURL(devUrl);
    win.webContents.openDevTools();
  } else {
    // In packaged app load the built files from dist
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

  // initialize database in packaged app or when explicitly enabled
  if (app.isPackaged || process.env.ELECTRON_ENABLE_DB === '1') {
    try {
      const dbPath = initDatabase(app);
      console.log('Database initialized at', dbPath);
    } catch (err) {
      console.error('Failed to initialize database', err);
    }
  } else {
    console.log('Database initialization skipped (dev mode)');
  }
  // register IPC handlers
  try {
    registerIpcHandlers();
    console.log('IPC handlers registered');
  } catch (err) {
    console.error('Failed to register IPC handlers', err);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
