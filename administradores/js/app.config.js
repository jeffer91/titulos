/* Configuración base del módulo administradores. */
(function () {
  'use strict';

  window.TA_ADMINISTRADORES_CONFIG = Object.freeze({
    modulo: 'administradores',
    version: '0.1.0-bloque-9',
    modo: 'base-visual',
    firebaseActivo: false,
    electronActivo: false,
    rutas: Object.freeze({
      htmlPrincipal: 'administradores/administrador.html',
      cssPrincipal: 'administradores/css/administrador.css',
      jsPrincipal: 'administradores/js/administrador.app.js',
      electron: 'administradores/electron/'
    }),
    funcionesFuturas: Object.freeze([
      'Gestión de períodos de titulación',
      'Carga y limpieza de estudiantes',
      'Asignación de coordinadores por carrera',
      'Configuración de proveedores IA',
      'Configuración de Google Sheets',
      'Diagnóstico general del sistema'
    ])
  });
})();
