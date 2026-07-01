/*
  Configuración base del módulo estudiantes.
  Este archivo usa variables globales para funcionar con doble click, Live Server y publicación estática.
*/
(function () {
  'use strict';

  window.TA_ESTUDIANTES_CONFIG = Object.freeze({
    modulo: 'estudiantes',
    version: '0.6.0-bloque-24',
    modo: 'firebase-envio-ia-sheets',
    propuestasObligatorias: 3,

    /*
      Coloca aquí la configuración pública de Firebase Web App.
      Esta configuración NO es una clave privada. Es la configuración normal del proyecto Firebase.
      Las claves IA se leen desde Firebase según la configuración administrativa.
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
      iaActiva: true,
      proveedorIA: 'gemini',
      googleSheetsUrl: ''
    }),

    firebaseActivo: true,
    iaActiva: true,
    sheetsActivo: true,
    borradorLocalActivo: true,

    textos: Object.freeze({
      consultaPendiente: 'Ingresa tu cédula para consultar tus datos en Firebase.',
      firebasePendiente: 'Firebase está pendiente de configurar en estudiantes/js/app.config.js.',
      firebaseConectado: 'Firebase conectado. Ya puedes consultar por cédula.',
      iaPendiente: 'La IA está desactivada en la configuración administrativa.',
      iaGenerando: 'Generando sugerencias con IA...',
      iaLista: 'Sugerencias generadas correctamente.',
      envioPendiente: 'Completa las tres propuestas antes de enviar.',
      borradorGuardado: 'Borrador local guardado en este equipo.',
      borradorRestaurado: 'Se restauró un borrador local guardado en este equipo.'
    }),

    demo: Object.freeze({
      nombres: 'Estudiante pendiente de conexión Firebase',
      carrera: 'Carrera pendiente de conexión Firebase',
      codigoCarrera: '—',
      periodoId: 'Pendiente de Firebase'
    })
  });
})();
