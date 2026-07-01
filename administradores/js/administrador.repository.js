/* Repositorio Firebase del módulo administradores. */
(function () {
  'use strict';

  var config = window.TA_ADMINISTRADORES_CONFIG;
  var firebaseService = window.TAAdminFirebaseService;

  function cargarConfigApp() {
    return firebaseService.leerDocumento(config.collections.config, config.documents.appConfig)
      .then(function (doc) {
        if (!doc) {
          return Object.assign({}, config.defaultAppConfig, {
            id: config.documents.appConfig,
            origen: 'default-local'
          });
        }

        return Object.assign({}, config.defaultAppConfig, doc, {
          origen: 'firebase'
        });
      });
  }

  function guardarConfigApp(data) {
    var payload = {
      procesoActivo: parseBoolean(data.procesoActivo),
      periodoActivo: String(data.periodoActivo || '').trim(),
      maxIntentos: Number(data.maxIntentos || 2),
      propuestasObligatorias: Number(data.propuestasObligatorias || 3),
      iaActiva: parseBoolean(data.iaActiva),
      proveedorIA: String(data.proveedorIA || 'gemini').trim().toLowerCase(),
      googleSheetsUrl: String(data.googleSheetsUrl || '').trim(),
      actualizadoPorModulo: 'administradores'
    };

    return firebaseService.guardarDocumento(config.collections.config, config.documents.appConfig, payload, { merge: true })
      .then(function () {
        return registrarLog('CONFIG_APP_GUARDADA', payload);
      })
      .then(function () {
        return Object.assign({}, payload, {
          id: config.documents.appConfig,
          origen: 'firebase'
        });
      });
  }

  function cargarConfigIA(proveedor) {
    var documentId = normalizarProveedor(proveedor);
    return firebaseService.leerDocumento(config.collections.ia, documentId)
      .then(function (doc) {
        if (!doc) {
          return {
            id: documentId,
            activo: false,
            apiKey: '',
            model: modeloDefault(documentId),
            temperature: 0.35,
            maxOutputTokens: 900,
            origen: 'default-local'
          };
        }

        return Object.assign({
          id: documentId,
          activo: false,
          apiKey: '',
          model: modeloDefault(documentId),
          temperature: 0.35,
          maxOutputTokens: 900
        }, doc, {
          origen: 'firebase'
        });
      });
  }

  function guardarConfigIA(proveedor, data) {
    var documentId = normalizarProveedor(proveedor);
    var payload = {
      activo: parseBoolean(data.activo),
      apiKey: String(data.apiKey || '').trim(),
      model: String(data.model || modeloDefault(documentId)).trim(),
      temperature: Number(data.temperature || 0.35),
      maxOutputTokens: Number(data.maxOutputTokens || 900),
      actualizadoPorModulo: 'administradores'
    };

    return firebaseService.guardarDocumento(config.collections.ia, documentId, payload, { merge: true })
      .then(function () {
        return registrarLog('CONFIG_IA_GUARDADA', Object.assign({ proveedor: documentId }, payload));
      })
      .then(function () {
        return Object.assign({ id: documentId }, payload, { origen: 'firebase' });
      });
  }

  function ejecutarDiagnostico() {
    var tareas = [
      diagnosticarDocumento('Configuración general', config.collections.config, config.documents.appConfig),
      diagnosticarDocumento('IA Gemini', config.collections.ia, 'gemini'),
      diagnosticarColeccion('Estudiantes', config.collections.estudiantes),
      diagnosticarColeccion('Títulos', config.collections.titulos),
      diagnosticarColeccion('Logs', config.collections.logs)
    ];

    return Promise.all(tareas);
  }

  function diagnosticarDocumento(titulo, collectionName, documentId) {
    return firebaseService.leerDocumento(collectionName, documentId)
      .then(function (doc) {
        return {
          titulo: titulo,
          estado: doc ? 'ok' : 'pending',
          descripcion: doc ? 'Documento encontrado en ' + collectionName + '/' + documentId + '.' : 'No existe todavía ' + collectionName + '/' + documentId + '.'
        };
      })
      .catch(function (error) {
        return {
          titulo: titulo,
          estado: 'error',
          descripcion: obtenerMensajeError(error)
        };
      });
  }

  function diagnosticarColeccion(titulo, collectionName) {
    return firebaseService.contarColeccion(collectionName, 5)
      .then(function (cantidad) {
        return {
          titulo: titulo,
          estado: 'ok',
          descripcion: 'Colección accesible. Muestra encontrada: ' + cantidad + '.'
        };
      })
      .catch(function (error) {
        return {
          titulo: titulo,
          estado: 'error',
          descripcion: obtenerMensajeError(error)
        };
      });
  }

  function registrarLog(accion, data) {
    return firebaseService.agregarDocumento(config.collections.logs, {
      accion: accion,
      modulo: 'administradores',
      data: limpiarDataParaLog(data)
    }).catch(function () {
      return null;
    });
  }

  function limpiarDataParaLog(data) {
    var copia = Object.assign({}, data || {});
    if (copia.apiKey) copia.apiKey = '***';
    return copia;
  }

  function modeloDefault(proveedor) {
    if (proveedor === 'gemini') return 'gemini-1.5-flash';
    if (proveedor === 'groq') return 'llama-3.1-8b-instant';
    if (proveedor === 'openrouter') return 'google/gemini-flash-1.5';
    if (proveedor === 'mistral') return 'mistral-small-latest';
    return '';
  }

  function normalizarProveedor(proveedor) {
    return String(proveedor || 'gemini').trim().toLowerCase();
  }

  function parseBoolean(value) {
    if (value === true || value === 'true' || value === 'SI' || value === '1') return true;
    return false;
  }

  function obtenerMensajeError(error) {
    return error && error.message ? error.message : String(error || 'Error desconocido');
  }

  window.TAAdminRepository = Object.freeze({
    cargarConfigApp: cargarConfigApp,
    guardarConfigApp: guardarConfigApp,
    cargarConfigIA: cargarConfigIA,
    guardarConfigIA: guardarConfigIA,
    ejecutarDiagnostico: ejecutarDiagnostico
  });
})();
