(function () {
  'use strict';

  var cfg = window.TA_CONSULTA_ESTADO_CONFIG || {};

  function consultar(periodoId, cedulaIngresada) {
    var periodo = limpiar(periodoId);
    var cedula = normalizarCedula(cedulaIngresada);
    var documentoId;
    var inicio = Date.now();

    if (!periodo) return Promise.reject(crearError('PERIODO_INVALIDO', 'Falta el período académico.'));
    if (!cedula) return Promise.reject(crearError('CEDULA_INVALIDA', 'La cédula no es válida.'));

    documentoId = periodo + '__' + cedula;

    return leerDocumento(documentoId)
      .then(function (resultado) {
        if (resultado.encontrado) {
          return completarResultado(resultado, inicio, documentoId, 'ID_EXACTO');
        }

        return leerDocumento(cedula).then(function (legacy) {
          return completarResultado(legacy, inicio, legacy.encontrado ? cedula : documentoId, legacy.encontrado ? 'ID_LEGACY_CEDULA' : 'NO_ENCONTRADO');
        });
      });
  }

  function leerDocumento(documentoId) {
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timeoutMs = Number(cfg.timeoutMs || 4500);
    var timer = null;
    var url = construirUrl(documentoId);

    if (controller) {
      timer = window.setTimeout(function () { controller.abort(); }, timeoutMs);
    }

    return fetch(url, {
      method: 'GET',
      cache: 'no-store',
      mode: 'cors',
      credentials: 'omit',
      signal: controller ? controller.signal : undefined,
      headers: { 'Accept': 'application/json' }
    })
      .then(function (response) {
        return response.text().then(function (texto) {
          var body = parseJsonSeguro(texto);

          if (response.status === 404) {
            return { ok: true, encontrado: false, status: 404, envio: null, raw: body };
          }

          if (!response.ok) {
            throw errorHttp(response.status, body);
          }

          return {
            ok: true,
            encontrado: true,
            status: response.status,
            envio: normalizarDocumentoRest(body),
            raw: body
          };
        });
      })
      .catch(function (error) {
        if (error && error.name === 'AbortError') {
          throw crearError('TIMEOUT', 'La consulta aislada de Títulos superó el tiempo máximo de espera.');
        }
        if (error && error.codigo) throw error;
        throw crearError('NETWORK_ERROR', 'No se pudo conectar con Firebase de Títulos.', error);
      })
      .finally(function () {
        if (timer) window.clearTimeout(timer);
      });
  }

  function construirUrl(documentoId) {
    var base = String(cfg.firestoreRestBase || 'https://firestore.googleapis.com/v1').replace(/\/$/, '');
    var project = encodeURIComponent(cfg.projectId || '');
    var database = encodeURIComponent(cfg.databaseId || '(default)');
    var collection = encodeURIComponent(cfg.collection || 'envios');
    var docId = encodeURIComponent(documentoId);
    var apiKey = encodeURIComponent(cfg.apiKey || '');

    return base + '/projects/' + project + '/databases/' + database + '/documents/' + collection + '/' + docId + '?key=' + apiKey;
  }

  function normalizarDocumentoRest(doc) {
    var fields = doc && doc.fields ? doc.fields : {};
    var data = decodificarMapa(fields);
    var name = limpiar(doc && doc.name);
    var id = name ? name.split('/').pop() : '';

    data.id = data.id || id;
    data._docId = id;
    data.__rest = {
      createTime: doc && doc.createTime || '',
      updateTime: doc && doc.updateTime || ''
    };
    return data;
  }

  function decodificarMapa(map) {
    var salida = {};
    Object.keys(map || {}).forEach(function (key) {
      salida[key] = decodificarValor(map[key]);
    });
    return salida;
  }

  function decodificarValor(value) {
    if (!value || typeof value !== 'object') return value;
    if (Object.prototype.hasOwnProperty.call(value, 'nullValue')) return null;
    if (Object.prototype.hasOwnProperty.call(value, 'stringValue')) return value.stringValue;
    if (Object.prototype.hasOwnProperty.call(value, 'booleanValue')) return Boolean(value.booleanValue);
    if (Object.prototype.hasOwnProperty.call(value, 'integerValue')) return Number(value.integerValue);
    if (Object.prototype.hasOwnProperty.call(value, 'doubleValue')) return Number(value.doubleValue);
    if (Object.prototype.hasOwnProperty.call(value, 'timestampValue')) return value.timestampValue;
    if (Object.prototype.hasOwnProperty.call(value, 'referenceValue')) return value.referenceValue;
    if (Object.prototype.hasOwnProperty.call(value, 'bytesValue')) return value.bytesValue;
    if (Object.prototype.hasOwnProperty.call(value, 'geoPointValue')) return value.geoPointValue;
    if (Object.prototype.hasOwnProperty.call(value, 'mapValue')) return decodificarMapa(value.mapValue && value.mapValue.fields || {});
    if (Object.prototype.hasOwnProperty.call(value, 'arrayValue')) {
      return ((value.arrayValue && value.arrayValue.values) || []).map(decodificarValor);
    }
    return value;
  }

  function completarResultado(resultado, inicio, documentoId, ruta) {
    return Object.assign({}, resultado, {
      documentoId: documentoId,
      ruta: ruta,
      duracionMs: Date.now() - inicio
    });
  }

  function errorHttp(status, body) {
    var firebaseStatus = limpiar(body && body.error && body.error.status);
    var firebaseMessage = limpiar(body && body.error && body.error.message);
    var codigo = 'HTTP_' + status;
    var mensaje = firebaseMessage || ('Firebase respondió con HTTP ' + status + '.');

    if (status === 403) {
      codigo = 'PERMISSION_DENIED';
      mensaje = 'Firebase de Títulos rechazó la lectura pública. Revisa las reglas de Firestore de titulos-ec2fa.';
    } else if (status === 401) {
      codigo = 'UNAUTHENTICATED';
      mensaje = 'Firebase de Títulos exige autenticación para esta lectura.';
    } else if (status >= 500) {
      codigo = firebaseStatus || 'FIREBASE_UNAVAILABLE';
      mensaje = 'Firebase de Títulos no está disponible temporalmente.';
    }

    return crearError(codigo, mensaje, body);
  }

  function crearError(codigo, mensaje, original) {
    var error = new Error(mensaje || codigo || 'Error de consulta.');
    error.codigo = codigo || 'CONSULTA_ERROR';
    error.original = original || null;
    return error;
  }

  function parseJsonSeguro(texto) {
    if (!texto) return null;
    try { return JSON.parse(texto); } catch (error) { return { rawText: texto }; }
  }

  function normalizarCedula(value) {
    var cedula = String(value || '').replace(/\D/g, '');
    return cedula.length === 9 ? '0' + cedula : cedula;
  }

  function limpiar(value) {
    return String(value === undefined || value === null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  window.TAConsultaEstadoService = Object.freeze({
    consultar: consultar,
    leerDocumento: leerDocumento,
    normalizarDocumentoRest: normalizarDocumentoRest
  });
})();
