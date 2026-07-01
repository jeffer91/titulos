/* Configuración base del módulo coordinadores. */
(function () {
  'use strict';

  window.TA_COORDINADORES_CONFIG = Object.freeze({
    modulo: 'coordinadores',
    version: '0.3.0-bloque-15',
    modo: 'firebase-revision-titulos',
    firebaseActivo: true,
    electronActivo: false,

    /*
      Coloca aquí la misma configuración pública Firebase Web App usada por estudiantes y administradores.
    */
    firebase: Object.freeze({
      apiKey: 'COLOCA_AQUI_TU_API_KEY',
      authDomain: 'COLOCA_AQUI_TU_AUTH_DOMAIN',
      projectId: 'COLOCA_AQUI_TU_PROJECT_ID',
      storageBucket: 'COLOCA_AQUI_TU_STORAGE_BUCKET',
      messagingSenderId: 'COLOCA_AQUI_TU_MESSAGING_SENDER_ID',
      appId: 'COLOCA_AQUI_TU_APP_ID'
    }),

    collections: Object.freeze({
      estudiantes: 'Estudiantes',
      titulos: 'titulos',
      config: 'titulos_config',
      logs: 'titulos_logs',
      coordinadores: 'coordinadores'
    }),

    documents: Object.freeze({
      appConfig: 'app'
    }),

    defaultAppConfig: Object.freeze({
      procesoActivo: true,
      periodoActivo: '',
      maxIntentos: 2,
      propuestasObligatorias: 3,
      iaActiva: true,
      proveedorIA: 'gemini',
      googleSheetsUrl: ''
    }),

    estadosTitulo: Object.freeze(['TODOS', 'ENVIADO', 'APROBADO', 'APROBADO_CON_OBSERVACION', 'DEVUELTO']),

    accionesRevision: Object.freeze({
      aprobar: 'APROBAR',
      aprobarObservacion: 'APROBAR_OBSERVACION',
      devolver: 'DEVOLVER'
    }),

    rutas: Object.freeze({
      htmlPrincipal: 'coordinadores/coordinador.html',
      cssPrincipal: 'coordinadores/css/coordinador.css',
      jsPrincipal: 'coordinadores/js/coordinador.app.js',
      electron: 'coordinadores/electron/'
    }),

    funcionesFuturas: Object.freeze([
      'Consulta de títulos por carrera y período',
      'Revisión de propuestas enviadas por estudiantes',
      'Aprobación, aprobación con observación o devolución',
      'Historial de decisiones de coordinación'
    ])
  });
})();
