/*
  Archivo: app.config.js
  Ruta: estudiantes/js/app.config.js
  Funciones principales del archivo:
  - Definir la configuración base del módulo estudiantes.
  - Centralizar nombres de colecciones Firebase usadas por estudiantes.
  - Definir configuración por defecto de proceso, IA, Sheets y borrador local.
  - Definir proveedores de IA disponibles para el orquestador.
  - Definir textos generales usados por la pantalla de estudiantes.
*/
(function () {
  'use strict';

  var firebaseConfig = window.TA_ESTUDIANTES_FIREBASE_CONFIG || Object.freeze({
    apiKey: '',
    authDomain: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: ''
  });

  window.TA_ESTUDIANTES_CONFIG = Object.freeze({
    modulo: 'estudiantes',
    version: '0.9.0-ia-orquestador',
    modo: 'firebase-envio-sugerencias-sheets-ia-multiple',
    propuestasObligatorias: 3,

    firebase: firebaseConfig,

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
      periodoActivoId: '',
      periodoActivoLabel: '',
      periodosActivos: [],
      periodosActivosLabels: [],
      maxIntentos: 1,
      propuestasObligatorias: 3,

      iaActiva: true,
      proveedorIA: 'gemini',
      proveedorIALabel: 'Google Gemini API',
      proveedoresIAOrden: ['gemini', 'groq', 'openrouter', 'cloudflare'],
      iaTimeoutMs: 30000,

      sheetsActivo: false,
      sheetsWebAppUrl: '',
      sheetsToken: '',
      sheetsOrigen: 'titulos-app',
      sheetsUltimaPrueba: '',
      sheetsUltimoResultado: ''
    }),

    proveedoresSugerencias: Object.freeze([
      Object.freeze({
        id: 'gemini',
        nombre: 'Google Gemini API',
        modeloDefault: 'gemini-1.5-flash-latest',
        endpointDefault: ''
      }),
      Object.freeze({
        id: 'groq',
        nombre: 'GroqCloud',
        modeloDefault: 'llama-3.1-8b-instant',
        endpointDefault: 'https://api.groq.com/openai/v1/chat/completions'
      }),
      Object.freeze({
        id: 'openrouter',
        nombre: 'OpenRouter Free Models',
        modeloDefault: 'meta-llama/llama-3.1-8b-instruct:free',
        endpointDefault: 'https://openrouter.ai/api/v1/chat/completions'
      }),
      Object.freeze({
        id: 'cloudflare',
        nombre: 'Cloudflare Workers AI',
        modeloDefault: '@cf/meta/llama-3.1-8b-instruct',
        endpointDefault: ''
      })
    ]),

    iaOrquestador: Object.freeze({
      proveedoresOrden: ['gemini', 'groq', 'openrouter', 'cloudflare'],
      timeoutMs: 30000,
      totalEnfoques: 3,
      permitirCambioAutomatico: true,
      mostrarErroresTecnicosAlEstudiante: false
    }),

    firebaseActivo: true,
    iaActiva: true,
    sheetsActivo: true,
    borradorLocalActivo: true,

    textos: Object.freeze({
      consultaPendiente: '',
      firebasePendiente: '',
      firebaseConectado: '',
      sugerenciasNoDisponibles: 'No se pudieron generar sugerencias en este momento. Puedes escribir el título manualmente o intentarlo más tarde.',
      sugerenciasGenerando: 'Generando sugerencias académicas...',
      sugerenciasLista: 'Selecciona una sugerencia o escribe tu propio título.',
      sugerenciasCambiandoIA: 'El proveedor actual está ocupado. Probando otra IA disponible...',
      sugerenciasGeneradas: 'Sugerencias generadas correctamente. Revisa las etiquetas antes de elegir.',
      envioPendiente: 'Completa las tres propuestas antes de enviar.',
      borradorGuardado: 'Borrador local guardado en este equipo.',
      borradorRestaurado: 'Se restauró un borrador local guardado en este equipo.'
    }),

    validaciones: Object.freeze({
      cedulaMin: 10,
      cedulaMax: 10,
      tituloMinCaracteres: 20,
      tituloMaxCaracteres: 260,
      textoMinCaracteres: 8
    }),

    telegram: Object.freeze({
      requerido: false,
      prefijo: '@',
      urlBase: 'https://t.me/'
    })
  });
})();