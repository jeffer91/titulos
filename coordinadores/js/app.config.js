/* Configuración del módulo coordinadores. */
(function () {
  'use strict';

  window.TA_COORDINADORES_CONFIG = Object.freeze({
    modulo: 'coordinadores',
    version: '4.3.0-backend-coordinadores-aislado',
    firebase: window.TA_COORDINADORES_FIREBASE_CONFIG || Object.freeze({}),
    collections: Object.freeze({
      titulos: 'envios',
      titulosHistorial: 'versiones_envio',
      config: 'configuracion',
      logs: 'workflow_events',
      coordinadores: 'coordinadores'
    }),
    documents: Object.freeze({ appConfig: 'general' }),
    tabs: Object.freeze(['POR_REVISAR', 'DEVUELTOS', 'VALIDADOS', 'APROBADOS']),
    tipos: Object.freeze({
      todos: 'TODOS',
      articulo: 'ARTICULO',
      trabajo: 'TRABAJO_TITULACION'
    }),
    accionesRevision: Object.freeze({
      validar: 'VALIDAR',
      validarCorreccion: 'VALIDAR_CORRECCION',
      devolver: 'DEVOLVER'
    })
  });
})();