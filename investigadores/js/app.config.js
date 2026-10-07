/* Configuración del módulo Investigadores. */
(function () {
  'use strict';

  window.TA_INVESTIGADORES_CONFIG = Object.freeze({
    modulo: 'investigadores',
    version: '1.5.0-multiperiodo',
    firebase: window.TA_ADMIN_FIREBASE_CONFIG || Object.freeze({
      apiKey: '', authDomain: '', projectId: '', storageBucket: '', messagingSenderId: '', appId: ''
    }),
    collections: Object.freeze({
      investigadores: 'investigadores',
      titulos: 'envios',
      config: 'configuracion',
      logs: 'workflow_events'
    }),
    documents: Object.freeze({ appConfig: 'general' }),
    pin: Object.freeze({ min: 4, max: 8 }),
    estadosCoordinadorHabilitados: Object.freeze(['VALIDADO', 'APROBADO', 'APROBADO_CON_OBSERVACION', 'PENDIENTE_INVESTIGADOR'])
  });
})();