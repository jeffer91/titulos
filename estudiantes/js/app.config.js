/*
  Configuración base del módulo estudiantes.
  Este archivo usa variables globales para funcionar con doble click y Live Server.
*/
(function () {
  'use strict';

  window.TA_ESTUDIANTES_CONFIG = Object.freeze({
    modulo: 'estudiantes',
    version: '0.2.0-bloque-2',
    modo: 'firebase-directo',
    propuestasObligatorias: 3,

    /*
      Coloca aquí la configuración pública de Firebase Web App.
      Esta configuración NO es la clave de IA. Es la configuración normal del proyecto Firebase.
      La clave de IA se leerá después desde la colección IA, en otro bloque.
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
      ia: 'IA'
    }),

    documents: Object.freeze({
      appConfig: 'app'
    }),

    defaultAppConfig: Object.freeze({
      procesoActivo: true,
      periodoActivo: '',
      maxIntentos: 2,
      propuestasObligatorias: 3,
      iaActiva: false,
      proveedorIA: 'gemini',
      googleSheetsUrl: ''
    }),

    firebaseActivo: true,
    iaActiva: false,
    sheetsActivo: false,

    textos: Object.freeze({
      consultaPendiente: 'Ingresa tu cédula para consultar tus datos en Firebase.',
      firebasePendiente: 'Firebase está pendiente de configurar en estudiantes/js/app.config.js.',
      firebaseConectado: 'Firebase conectado. Ya puedes consultar por cédula.',
      iaPendiente: 'La generación real con IA se agregará en el Bloque 4.',
      envioPendiente: 'El envío real a Firebase se agregará en el Bloque 5.'
    }),

    demo: Object.freeze({
      nombres: 'Estudiante pendiente de conexión Firebase',
      carrera: 'Carrera pendiente de conexión Firebase',
      codigoCarrera: '—',
      periodoId: 'Pendiente de Firebase'
    })
  });
})();
