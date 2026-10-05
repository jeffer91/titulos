/* Configuración del módulo coordinadores. */
(function () {
  'use strict';

  window.TA_COORDINADORES_CONFIG = Object.freeze({
    modulo: 'coordinadores',
    version: '4.0.0',
    firebase: window.TA_COORDINADORES_FIREBASE_CONFIG || Object.freeze({}),
    collections: Object.freeze({
      estudiantes: 'Estudiantes',
      titulos: 'titulos',
      titulosHistorial: 'titulos_historial',
      config: 'titulos_config',
      logs: 'titulos_logs',
      coordinadores: 'titulos_coordinadores'
    }),
    documents: Object.freeze({ appConfig: 'app' }),
    tabs: Object.freeze(['POR_REVISAR', 'DEVUELTOS', 'VALIDADOS', 'APROBADOS']),
    tipos: Object.freeze({
      todos: 'TODOS',
      articulo: 'ARTICULO',
      trabajo: 'TRABAJO_TITULACION'
    }),
    accionesRevision: Object.freeze({
      validar: 'VALIDAR',
      devolver: 'DEVOLVER'
    })
  });
})();
