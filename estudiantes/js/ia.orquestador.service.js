/*
  Archivo: ia.orquestador.service.js
  Ruta: estudiantes/js/ia.orquestador.service.js
  Funciones principales del archivo:
  - Orquestar la generación de tres títulos académicos con varios proveedores IA.
  - Cargar proveedores activos desde Firebase respetando el orden fijo definido para la app.
  - Delegar generación, corrección y validación al pipeline académico de IA.
  - Emitir eventos de progreso para mostrar la animación de IA de Titulación trabajando.
  - Devolver sugerencias enriquecidas sin mostrar errores técnicos al estudiante.
*/
(function () {
  'use strict';

  var config = window.TA_ESTUDIANTES_CONFIG;
  var firebaseService = window.TAFirebaseService;
  var providersService = window.TAIAProviders;
  var pipelineService = window.TAIAPipeline;

  var ENFOQUES = Object.freeze(['diagnostico', 'propuesta', 'evaluacion']);
  var ORDEN_FIJO = Object.freeze(['gemini', 'groq', 'cloudflare', 'openrouter']);

  function generarSugerencias(params) {
    params = params || {};

    var estudiante = params.estudiante || {};
    var appConfig = params.appConfig || {};
    var propuesta = params.propuesta || {};
    var onProgress = typeof params.onProgress === 'function' ? params.onProgress : noop;
    var opciones = obtenerOpciones(appConfig);

    if (!pipelineService || !pipelineService.generarTresTitulos) {
      return Promise.reject(new Error('El pipeline académico de IA no está cargado. Revisa el orden de scripts.'));
    }

    emitir(onProgress, {
      tipo: 'inicio',
      titulo: 'IA de Titulación trabajando',
      detalle: 'Preparando generación académica.',
      pasoActual: 0,
      totalPasos: ENFOQUES.length
    });

    return cargarProveedoresDisponibles(appConfig, opciones)
      .then(function (proveedores) {
        if (!proveedores.length) {
          throw new Error('No hay proveedores de IA activos o configurados.');
        }

        emitir(onProgress, {
          tipo: 'proveedores',
          titulo: 'IA de Titulación trabajando',
          detalle: 'Verificando proveedores disponibles.',
          totalProveedores: proveedores.length
        });

        return pipelineService.generarTresTitulos({
          estudiante: estudiante,
          propuesta: propuesta,
          proveedores: proveedores,
          opciones: opciones,
          onProgress: onProgress
        });
      })
      .then(function (resultado) {
        if (!resultado || !Array.isArray(resultado.sugerencias) || resultado.sugerencias.length !== 3) {
          throw new Error('No se generaron las tres sugerencias académicas obligatorias.');
        }

        emitir(onProgress, {
          tipo: 'finalizado',
          titulo: 'Títulos generados',
          detalle: 'Las sugerencias fueron generadas correctamente.',
          pasoActual: ENFOQUES.length,
          totalPasos: ENFOQUES.length
        });

        return construirRespuestaFinal(resultado);
      })
      .catch(function (error) {
        registrarErrorConsola(error);

        emitir(onProgress, {
          tipo: 'error',
          titulo: 'Sugerencias no disponibles',
          detalle: 'No se pudieron generar sugerencias en este momento.',
          error: error
        });

        return Promise.reject(new Error(obtenerMensajeFalloFinal()));
      });
  }

  function construirRespuestaFinal(resultado) {
    var sugerencias = resultado.sugerencias || [];
    var primera = sugerencias[0] || {};

    return {
      ok: true,
      proveedor: primera.proveedorIA || '',
      proveedorLabel: primera.proveedorIALabel || '',
      model: primera.modeloIA || '',
      sugerencias: sugerencias,
      prompts: resultado.prompts || [],
      prompt: resultado.prompt || '',
      textosOriginales: resultado.textosOriginales || [],
      textoOriginal: resultado.textoOriginal || '',
      intentos: resultado.intentos || [],
      pipeline: true
    };
  }

  function cargarProveedoresDisponibles(appConfig, opciones) {
    var orden = construirOrdenProveedores(appConfig, opciones);
    var promesas = orden.map(function (providerId) {
      return leerProveedor(providerId, appConfig)
        .then(function (data) {
          return construirProveedor(providerId, data);
        })
        .catch(function (error) {
          console.warn('[IA Orquestador] No se pudo cargar proveedor ' + providerId + ':', limpiarMensajeError(error));
          return null;
        });
    });

    return Promise.all(promesas).then(function (proveedores) {
      return proveedores.filter(Boolean);
    });
  }

  function leerProveedor(providerId, appConfig) {
    var local = obtenerProveedorDesdeAppConfig(providerId, appConfig);

    if (local) {
      return Promise.resolve(local);
    }

    if (!firebaseService || !firebaseService.leerDocumento) {
      return Promise.reject(new Error('Firebase no está listo para leer proveedores IA.'));
    }

    if (!config || !config.collections || !config.collections.ia) {
      return Promise.reject(new Error('No existe la colección IA en la configuración.'));
    }

    return firebaseService.leerDocumento(config.collections.ia, providerId);
  }

  function obtenerProveedorDesdeAppConfig(providerId, appConfig) {
    appConfig = appConfig || {};

    if (appConfig.proveedoresIA && appConfig.proveedoresIA[providerId]) {
      return appConfig.proveedoresIA[providerId];
    }

    if (appConfig.iaProveedores && appConfig.iaProveedores[providerId]) {
      return appConfig.iaProveedores[providerId];
    }

    if (appConfig[providerId] && typeof appConfig[providerId] === 'object') {
      return appConfig[providerId];
    }

    return null;
  }

  function construirProveedor(providerId, data) {
    data = data || {};

    var base = buscarProveedorBase(providerId);
    var finalData = Object.assign({
      id: providerId,
      proveedor: providerId,
      nombre: base ? base.nombre : providerId,
      activo: false,
      apiKey: '',
      key: '',
      token: '',
      modelo: base ? base.modeloDefault : '',
      model: base ? base.modeloDefault : '',
      endpoint: base ? base.endpointDefault : ''
    }, data);

    if (!finalData.modelo && finalData.model) {
      finalData.modelo = finalData.model;
    }

    if (!finalData.model && finalData.modelo) {
      finalData.model = finalData.modelo;
    }

    if (!finalData.endpoint && base && base.endpointDefault) {
      finalData.endpoint = base.endpointDefault;
    }

    if (finalData.activo === false) {
      return null;
    }

    if (!providersService || !providersService.validarConfig) {
      return null;
    }

    var validacion = providersService.validarConfig(providerId, finalData);

    if (!validacion.ok) {
      console.warn('[IA Orquestador] Proveedor omitido:', providerId, validacion.mensaje);
      return null;
    }

    return {
      id: providerId,
      nombre: providersService.obtenerNombre(providerId, finalData),
      modelo: providersService.obtenerModelo(providerId, finalData),
      config: finalData
    };
  }

  function construirOrdenProveedores(appConfig, opciones) {
    appConfig = appConfig || {};
    opciones = opciones || {};

    var orden = Array.isArray(opciones.proveedoresOrden) && opciones.proveedoresOrden.length
      ? opciones.proveedoresOrden
      : ORDEN_FIJO;
    var resultado = [];
    var vistos = {};

    orden.forEach(function (providerId) {
      agregarProveedorOrden(resultado, vistos, providerId);
    });

    ORDEN_FIJO.forEach(function (providerId) {
      agregarProveedorOrden(resultado, vistos, providerId);
    });

    return resultado;
  }

  function agregarProveedorOrden(resultado, vistos, providerId) {
    providerId = limpiarTexto(providerId).toLowerCase();

    if (!providerId || vistos[providerId]) {
      return;
    }

    if (!buscarProveedorBase(providerId)) {
      return;
    }

    vistos[providerId] = true;
    resultado.push(providerId);
  }

  function obtenerOpciones(appConfig) {
    appConfig = appConfig || {};

    var conf = config && config.iaOrquestador ? config.iaOrquestador : {};
    var orden = ORDEN_FIJO.slice();
    var timeout = Number(appConfig.iaTimeoutMs || conf.timeoutMs || 30000);
    var maxPasos = Number(appConfig.iaMaxPasosPorEnfoque || conf.maxPasosPorEnfoque || 8);

    return {
      proveedoresOrden: orden,
      timeoutMs: Number.isFinite(timeout) && timeout >= 5000 ? timeout : 30000,
      maxPasosPorEnfoque: Number.isFinite(maxPasos) && maxPasos >= 4 ? maxPasos : 8,
      maxCorreccionesPorProveedor: 1
    };
  }

  function buscarProveedorBase(providerId) {
    providerId = limpiarTexto(providerId).toLowerCase();

    if (config && Array.isArray(config.proveedoresSugerencias)) {
      for (var i = 0; i < config.proveedoresSugerencias.length; i += 1) {
        if (config.proveedoresSugerencias[i].id === providerId) {
          return config.proveedoresSugerencias[i];
        }
      }
    }

    if (providersService && providersService.obtenerProveedorBase) {
      return providersService.obtenerProveedorBase(providerId);
    }

    return null;
  }

  function obtenerMensajeFalloFinal() {
    if (config && config.iaOrquestador && config.iaOrquestador.mensajeFalloFinal) {
      return config.iaOrquestador.mensajeFalloFinal;
    }

    if (config && config.textos && config.textos.sugerenciasNoDisponibles) {
      return config.textos.sugerenciasNoDisponibles;
    }

    return 'Sugerencias no disponibles. Inténtelo más tarde.';
  }

  function registrarErrorConsola(error) {
    var mostrar = !config || !config.iaOrquestador || config.iaOrquestador.mostrarErroresTecnicosEnConsola !== false;

    if (!mostrar || !window.console || !console.warn) {
      return;
    }

    console.warn('[IA Orquestador] Generación no disponible:', {
      mensaje: limpiarMensajeError(error),
      detalles: error && error.detalles ? error.detalles : null,
      intentos: error && error.intentos ? error.intentos : null
    });
  }

  function emitir(callback, data) {
    try {
      callback(data || {});
    } catch (error) {
      console.warn('[IA Orquestador] Error en callback de progreso:', error);
    }
  }

  function limpiarMensajeError(error) {
    var mensaje = error && error.message ? error.message : String(error || 'Error desconocido.');

    return limpiarTexto(mensaje)
      .replace(/key=[^\s&]+/ig, 'key=***')
      .replace(/api[_-]?key[^\s]+/ig, 'apiKey=***')
      .replace(/Bearer\s+[^\s]+/ig, 'Bearer ***');
  }

  function limpiarTexto(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function noop() {}

  window.TAIAOrquestador = Object.freeze({
    generarSugerencias: generarSugerencias,
    cargarProveedoresDisponibles: cargarProveedoresDisponibles,
    construirOrdenProveedores: construirOrdenProveedores
  });
})();