const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1180,
    minHeight: 760,
    title: 'Administrador - Sistema de Títulos Académicos',
    backgroundColor: '#f4f7fb',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'administradores', 'administrador.html'));

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

function openLocalPage(relativePath) {
  if (!mainWindow) return;
  mainWindow.loadFile(path.join(__dirname, relativePath));
}

function openAdminTab(tabName) {
  if (!mainWindow) return;

  mainWindow.loadFile(
    path.join(__dirname, 'administradores', 'administrador.html'),
    {
      hash: tabName || 'inicio'
    }
  );
}

function buildMenu() {
  return Menu.buildFromTemplate([
    {
      label: 'Sistema',
      submenu: [
        {
          label: 'Administrador',
          click: function () {
            openAdminTab('inicio');
          }
        },
        {
          label: 'Períodos',
          click: function () {
            openAdminTab('periodos');
          }
        },
        {
          label: 'Coordinadores admin',
          click: function () {
            openAdminTab('coordinadores');
          }
        },
        {
          label: 'Estudiantes admin',
          click: function () {
            openAdminTab('estudiantes');
          }
        },
        {
          label: 'Ajustes',
          click: function () {
            openAdminTab('ajustes');
          }
        },
        {
          label: 'Respaldo',
          click: function () {
            openAdminTab('respaldo');
          }
        },
        { type: 'separator' },
        {
          label: 'Estudiantes',
          click: function () {
            openLocalPage(path.join('estudiantes', 'estudiante.html'));
          }
        },
        {
          label: 'Coordinadores',
          click: function () {
            openLocalPage(path.join('coordinadores', 'coordinador.html'));
          }
        },
        {
          label: 'Revisión de títulos',
          click: function () {
            openLocalPage(path.join('coordinadores', 'revision.html'));
          }
        },
        { type: 'separator' },
        {
          label: 'Panel principal general',
          click: function () {
            openLocalPage('index.html');
          }
        },
        {
          label: 'Seguridad',
          click: function () {
            openLocalPage('seguridad.html');
          }
        },
        {
          label: 'Pruebas',
          click: function () {
            openLocalPage('pruebas.html');
          }
        },
        { type: 'separator' },
        {
          label: 'Salir',
          role: 'quit'
        }
      ]
    },
    {
      label: 'Vista',
      submenu: [
        {
          label: 'Recargar',
          role: 'reload'
        },
        {
          label: 'Forzar recarga',
          role: 'forceReload'
        },
        {
          label: 'Herramientas de desarrollo',
          role: 'toggleDevTools'
        },
        { type: 'separator' },
        {
          label: 'Tamaño normal',
          role: 'resetZoom'
        },
        {
          label: 'Acercar',
          role: 'zoomIn'
        },
        {
          label: 'Alejar',
          role: 'zoomOut'
        }
      ]
    }
  ]);
}

app.whenReady().then(function () {
  Menu.setApplicationMenu(buildMenu());
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});