const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('TA_ADMINISTRADORES_ELECTRON', {
  modo: 'electron',
  modulo: 'administradores',
  version: '0.1.0-bloque-20'
});
