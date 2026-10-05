/* Configuración del módulo Investigadores. */
(function () {
  'use strict';

  window.TA_INVESTIGADORES_CONFIG = Object.freeze({
    modulo: 'investigadores',
    version: '1.0.0',
    firebase: window.TA_ADMIN_FIREBASE_CONFIG || Object.freeze({
      apiKey: '', authDomain: '', projectId: '', storageBucket: '', messagingSenderId: '', appId: ''
    }),
    collections: Object.freeze({
      investigadores: 'investigadores',
      titulos: 'titulos',
      config: 'titulos_config',
      logs: 'titulos_logs'
    }),
    documents: Object.freeze({ appConfig: 'app' }),
    pin: Object.freeze({ min: 4, max: 8 }),
    estadosCoordinadorHabilitados: Object.freeze(['APROBADO', 'APROBADO_CON_OBSERVACION'])
  });
})();
