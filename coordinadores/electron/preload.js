const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('TA_COORDINADORES_ELECTRON', {
  modo: 'electron',
  modulo: 'coordinadores',
  version: '0.1.0-bloque-19'
});
