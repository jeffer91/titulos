/* Configuración base del módulo administradores. */
(function () {
  'use strict';

  window.TA_ADMINISTRADORES_CONFIG = Object.freeze({
    modulo: 'administradores',
    version: '0.2.0-bloque-10',
    modo: 'firebase-base',
    firebaseActivo: true,
    electronActivo: false,

    /*
      Coloca aquí la configuración pública de Firebase Web App.
      Esta configuración permite conectar el panel administrativo con Firestore.
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
      ia: 'IA',
      coordinadores: 'coordinadores',
      periodos: 'periodos'
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

    proveedoresIA: Object.freeze(['gemini', 'groq', 'openrouter', 'mistral']),

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
