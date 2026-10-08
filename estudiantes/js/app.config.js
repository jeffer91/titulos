/*
  Archivo: app.config.js
  Ruta: estudiantes/js/app.config.js
  Configuración base del módulo estudiantes con dos Firebase independientes.
*/
(function () {
  'use strict';

  var firebaseAcademico = window.TA_ESTUDIANTES_FIREBASE_ACADEMICO_CONFIG || Object.freeze({});
  var firebaseTitulos = window.TA_ESTUDIANTES_FIREBASE_TITULOS_CONFIG || Object.freeze({});
  var ORDEN_PROVEEDORES_IA = Object.freeze(['gemini', 'groq', 'cloudflare', 'openrouter']);

  window.TA_ESTUDIANTES_CONFIG = Object.freeze({
    modulo: 'estudiantes',
    version: '1.1.0-backend-estudiantes-aislado',
    modo: 'backend-estudiantes-independiente-dual-firebase',
    propuestasObligatorias: 3,

    firebase: Object.freeze({
      academico: firebaseAcademico,
      titulos: firebaseTitulos
    }),

    collections: Object.freeze({
      estudiantes: 'Estudiante',
      matriculas: 'matriculas',
      titulos: 'envios',
      config: 'configuracion',
      logs: 'workflow_events',
      ia: 'ia'
    }),

    documents: Object.freeze({
      appConfig: 'general'
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
      proveedoresIAOrden: ORDEN_PROVEEDORES_IA.slice(),
      iaTimeoutMs: 30000,
      iaMaxPasosPorEnfoque: 8,
      iaMaxCorreccionesPorProveedor: 1,

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
        id: 'cloudflare',
        nombre: 'Cloudflare Workers AI',
        modeloDefault: '@cf/meta/llama-3.1-8b-instruct',
        endpointDefault: ''
      }),
      Object.freeze({
        id: 'openrouter',
        nombre: 'OpenRouter Free Models',
        modeloDefault: 'meta-llama/llama-3.1-8b-instruct:free',
        endpointDefault: 'https://openrouter.ai/api/v1/chat/completions'
      })
    ]),

    iaOrquestador: Object.freeze({
      proveedoresOrden: ORDEN_PROVEEDORES_IA.slice(),
      timeoutMs: 30000,
      totalEnfoques: 3,
      permitirCambioAutomatico: true,
      mostrarErroresTecnicosAlEstudiante: false,
      mostrarErroresTecnicosEnConsola: true,
      maxPasosPorEnfoque: 8,
      maxCorreccionesPorProveedor: 1,
      mensajeFalloFinal: 'Sugerencias no disponibles. Inténtelo más tarde.'
    }),

    firebaseActivo: true,
    iaActiva: true,
    sheetsActivo: true,
    borradorLocalActivo: true,

    textos: Object.freeze({
      consultaPendiente: '',
      firebasePendiente: '',
      firebaseConectado: '',
      sugerenciasNoDisponibles: 'Sugerencias no disponibles. Inténtelo más tarde.',
      sugerenciasGenerando: 'IA de Titulación trabajando...',
      sugerenciasLista: 'Selecciona una sugerencia completa para usarla como título final.',
      sugerenciasCambiandoIA: 'La IA de Titulación está reforzando el formato académico...',
      sugerenciasGeneradas: 'Sugerencias generadas correctamente. Revisa el título antes de elegir.',
      envioPendiente: 'Completa las tres propuestas antes de enviar.',
      borradorGuardado: 'Borrador local guardado en este equipo.',
      borradorRestaurado: 'Se restauró un borrador local guardado en este equipo.'
    }),

    validaciones: Object.freeze({
      cedulaMin: 10,
      cedulaMax: 10,
      tituloMinCaracteres: 20,
      tituloMaxCaracteres: 260,
      tituloMinPalabras: 10,
      tituloMaxPalabras: 25,
      tituloAdvertenciaMaxPalabras: 29,
      tituloBloqueoPalabras: 30,
      textoMinCaracteres: 8
    }),

    telegram: Object.freeze({
      requerido: false,
      prefijo: '@',
      urlBase: 'https://t.me/'
    })
  });
})();