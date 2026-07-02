/* Configuración base del módulo administradores. */
(function () {
  'use strict';

  var firebaseConfig = window.TA_ADMIN_FIREBASE_CONFIG || Object.freeze({
    apiKey: '',
    authDomain: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: ''
  });

  window.TA_ADMINISTRADORES_CONFIG = Object.freeze({
    modulo: 'administradores',
    version: '1.1.0-respaldo-normalizacion',
    modo: 'firebase-panel-admin',
    firebaseActivo: true,
    electronActivo: true,

    firebase: firebaseConfig,

    collections: Object.freeze({
      estudiantes: 'Estudiantes',
      titulos: 'titulos',
      titulosHistorial: 'titulos_historial',
      config: 'titulos_config',
      logs: 'titulos_logs',
      ia: 'IA',
      coordinadores: 'titulos_coordinadores',
      periodos: 'periodos'
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

      proveedorIA: 'gemini',
      proveedorIALabel: 'Google Gemini API',
      iaActiva: true,

      sheetsActivo: false,
      sheetsWebAppUrl: '',
      sheetsToken: '',
      sheetsOrigen: 'titulos-app',
      sheetsNotas: '',
      sheetsUltimaPrueba: '',
      sheetsUltimoResultado: '',
      sheetsActualizadoEn: ''
    }),

    estadosTitulo: Object.freeze({
      sinEnviar: 'SIN_ENVIAR',
      enviado: 'ENVIADO',
      pendiente: 'PENDIENTE',
      devuelto: 'DEVUELTO',
      aprobado: 'APROBADO',
      borradorReiniciado: 'BORRADOR_REINICIADO',
      archivado: 'ARCHIVADO'
    }),

    proveedoresSugerencias: Object.freeze([
      {
        id: 'gemini',
        nombre: 'Google Gemini API',
        modeloDefault: 'gemini-1.5-flash-latest',
        endpointDefault: ''
      },
      {
        id: 'groq',
        nombre: 'GroqCloud',
        modeloDefault: 'llama-3.1-8b-instant',
        endpointDefault: 'https://api.groq.com/openai/v1/chat/completions'
      },
      {
        id: 'openrouter',
        nombre: 'OpenRouter Free Models',
        modeloDefault: 'meta-llama/llama-3.1-8b-instruct:free',
        endpointDefault: 'https://openrouter.ai/api/v1/chat/completions'
      },
      {
        id: 'cloudflare',
        nombre: 'Cloudflare Workers AI',
        modeloDefault: '@cf/meta/llama-3.1-8b-instruct',
        endpointDefault: ''
      }
    ]),

    respaldo: Object.freeze({
      tipos: Object.freeze({
        ping: 'PING',
        envio: 'ENVIO',
        estudiante: 'ESTUDIANTE',
        coordinador: 'COORDINADOR',
        periodo: 'PERIODO',
        resolucion: 'RESOLUCION',
        normalizacion: 'NORMALIZACION',
        log: 'LOG'
      }),

      hojasEspejo: Object.freeze([
        'Envios',
        'Estudiantes',
        'Coordinadores',
        'Periodos',
        'Resoluciones'
      ]),

      hojasHistorial: Object.freeze([
        'Normalizaciones',
        'Logs',
        'PING'
      ]),

      timeoutMs: 18000
    }),

    normalizacion: Object.freeze({
      agruparOnlineVista: true,
      corregirFirebaseAutomatico: true,
      guardarOriginalOnline: false,
      idEstudiante: 'cedula_periodo'
    }),

    rutas: Object.freeze({
      estudiantes: '../estudiantes/estudiante.html',
      coordinadores: '../coordinadores/coordinador.html',
      administrador: 'administrador.html',
      electron: 'electron/'
    }),

    textos: Object.freeze({
      cargando: 'Cargando información...',
      firebaseOk: 'Conectado',
      firebaseError: 'No se pudo conectar con Firebase.',
      sinDatos: 'Sin datos para mostrar.',
      guardado: 'Información guardada correctamente.',
      errorGuardado: 'No se pudo guardar la información.',
      actualizado: 'Información actualizada correctamente.',
      respaldoOk: 'Respaldo conectado correctamente.',
      respaldoError: 'No se pudo conectar con Google Sheets.',
      normalizacionOk: 'Normalización completada correctamente.'
    })
  });
})();