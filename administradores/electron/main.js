const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1020,
    minHeight: 700,
    title: 'Titulos Administradores',
    backgroundColor: '#f4f7fb',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'administrador.html'));
  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

function openLocalPage(relativePath) {
  if (!mainWindow) return;
  mainWindow.loadFile(path.join(__dirname, '..', relativePath));
}

function buildMenu() {
  return Menu.buildFromTemplate([
    {
      label: 'Administradores',
      submenu: [
        {
          label: 'Panel principal',
          click: function () { openLocalPage('administrador.html'); }
        },
        {
          label: 'Gestion de coordinadores',
          click: function () { openLocalPage('coordinadores.html'); }
        },
        {
          label: 'Reportes',
          click: function () { openLocalPage('reportes.html'); }
        },
        { type: 'separator' },
        { label: 'Salir', role: 'quit' }
      ]
    },
    {
      label: 'Vista',
      submenu: [
        { label: 'Recargar', role: 'reload' },
        { label: 'Herramientas de desarrollo', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: 'Tamaño normal', role: 'resetZoom' },
        { label: 'Acercar', role: 'zoomIn' },
        { label: 'Alejar', role: 'zoomOut' }
      ]
    }
  ]);
}

app.whenReady().then(function () {
  Menu.setApplicationMenu(buildMenu());
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
