(function () {
  'use strict';

  var cfg = window.TA_CONSULTA_ESTADO_CONFIG || {};

  function consultar(periodoId, cedulaIngresada) {
    var periodoSolicitado = limpiar(periodoId);
    var periodoCanonico = clavePeriodo(periodoSolicitado);
    var cedula = normalizarCedula(cedulaIngresada);
    var inicio = Date.now();
    var rutasProbadas = [];

    if (!periodoSolicitado) return Promise.reject(crearError('PERIODO_INVALIDO', 'Falta el período académico.'));
    if (!cedula) return Promise.reject(crearError('CEDULA_INVALIDA', 'La cédula no es válida.'));

    return ejecutarConTimeoutGlobal(function (signal) {
      return buscarPorIds(periodoSolicitado, periodoCanonico, cedula, signal, rutasProbadas)
        .then(function (directo) {
          if (directo) {
            return completarResultado({
              ok: true,
              encontrado: true,
              status: directo.status || 200,
              envio: sanitizarEnvio(directo.envio)
            }, inicio, directo.documentoId, directo.ruta, rutasProbadas, periodoCanonico);
          }

          return buscarPorIdentidad(periodoSolicitado, cedula, signal, rutasProbadas)
            .then(function (encontrado) {
              if (encontrado) {
                return completarResultado({
                  ok: true,
                  encontrado: true,
                  status: encontrado.status || 200,
                  envio: sanitizarEnvio(encontrado.envio)
                }, inicio, encontrado.documentoId, encontrado.ruta, rutasProbadas, periodoCanonico);
              }

              return completarResultado({
                ok: true,
                encontrado: false,
                status: 404,
                envio: null
              }, inicio, periodoCanonico + '__' + cedula, 'NO_ENCONTRADO', rutasProbadas, periodoCanonico);
            });
        });
    }).catch(function (error) {
      if (error && !error.diagnostico) {
        error.diagnostico = {
          base: cfg.projectId || 'titulos-ec2fa',
          coleccion: cfg.collection || 'envios',
          periodo: periodoSolicitado,
          periodoCanonico: periodoCanonico,
          cedula: cedula,
          rutasProbadas: rutasProbadas.slice(),
          duracionMs: Date.now() - inicio
        };
      }
      throw error;
    });
  }

  function buscarPorIds(periodoOriginal, periodoCanonico, cedula, signal, rutasProbadas) {
    var ids = construirIdsCandidatos(periodoOriginal, periodoCanonico, cedula);
    var cadena = Promise.resolve(null);

    ids.forEach(function (id) {
      cadena = cadena.then(function (encontrado) {
        if (encontrado) return encontrado;
        rutasProbadas.push('ID:' + id);

        return leerDocumentoConSignal(id, signal).then(function (resultado) {
          if (!resultado.encontrado) return null;
          if (!periodoCompatibleDocumento(resultado.envio, periodoOriginal, true)) return null;

          return {
            documentoId: id,
            ruta: id === cedula ? 'ID_LEGACY_CEDULA' : 'ID_DIRECTO',
            status: resultado.status,
            envio: resultado.envio
          };
        });
      });
    });

    return cadena;
  }

  function construirIdsCandidatos(periodoOriginal, periodoCanonico, cedula) {
    var ids = [];
    var variantes = construirVariantesPeriodo(periodoOriginal);
    agregarUnico(variantes, periodoCanonico);

    variantes.forEach(function (periodo) {
      if (periodo) agregarUnico(ids, periodo + '__' + cedula);
    });

    agregarUnico(ids, cedula);
    return ids;
  }

  function buscarPorIdentidad(periodoSolicitado, cedula, signal, rutasProbadas) {
    var especificaciones = [];
    var vistos = {};
    var numeroCedula = Number(cedula);

    ['cedula', 'numeroIdentificacion'].forEach(function (campo) {
      agregarSpec(campo, { stringValue: cedula }, 'STRING');

      if (Number.isSafeInteger(numeroCedula)) {
        agregarSpec(campo, { integerValue: String(numeroCedula) }, 'NUMBER');
      }
    });

    function agregarSpec(campo, value, tipo) {
      var key = campo + '|' + tipo;
      if (vistos[key]) return;
      vistos[key] = true;
      especificaciones.push({ campo: campo, value: value, tipo: tipo });
    }

    var consultas = especificaciones.map(function (spec) {
      rutasProbadas.push('QUERY:' + spec.campo + ':' + spec.tipo);

      return ejecutarRunQuery(spec.campo, spec.value, signal)
        .then(function (docs) {
          return { ok: true, docs: docs || [] };
        })
        .catch(function (error) {
          if (error && (error.codigo === 'PERMISSION_DENIED' || error.codigo === 'UNAUTHENTICATED')) throw error;
          return { ok: false, docs: [], error: error };
        });
    });

    return Promise.all(consultas).then(function (resultados) {
      var exitosas = resultados.filter(function (item) { return item.ok; });
      var docs = [];
      var ids = {};

      if (!exitosas.length) {
        throw crearError('CONSULTA_IDENTIDAD_FALLIDA', 'No se pudo consultar envios por cédula o número de identificación.');
      }

      exitosas.forEach(function (resultado) {
        (resultado.docs || []).forEach(function (doc) {
          var id = doc.id || doc._docId || '';
          var key = id || JSON.stringify(doc);
          if (ids[key]) return;
          ids[key] = true;
          docs.push(doc);
        });
      });

      var exactos = docs.filter(function (doc) {
        return periodoCompatibleDocumento(doc, periodoSolicitado, false);
      });

      if (!exactos.length) {
        var sinPeriodo = docs.filter(function (doc) {
          return !limpiar(periodoDocumento(doc));
        });
        if (docs.length === 1 && sinPeriodo.length === 1) exactos = sinPeriodo;
      }

      if (!exactos.length) return null;

      exactos.sort(function (a, b) {
        return fechaMs(b.fechaEnvio || b.actualizadoEn || b.actualizadoEnLocal || b.creadoEn) -
          fechaMs(a.fechaEnvio || a.actualizadoEn || a.actualizadoEnLocal || a.creadoEn);
      });

      var elegido = exactos[0];
      return {
        documentoId: elegido.id || elegido._docId || '',
        ruta: 'QUERY_IDENTIDAD',
        status: 200,
        envio: elegido
      };
    });
  }

  function ejecutarRunQuery(campo, firestoreValue, signal) {
    var url = construirRunQueryUrl();

    return fetch(url, {
      method: 'POST',
      cache: 'no-store',
      mode: 'cors',
      credentials: 'omit',
      signal: signal,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: cfg.collection || 'envios' }],
          where: {
            fieldFilter: {
              field: { fieldPath: campo },
              op: 'EQUAL',
              value: firestoreValue
            }
          },
          limit: 30
        }
      })
    }).then(function (response) {
      return response.text().then(function (texto) {
        var body = parseJsonSeguro(texto);
        if (!response.ok) throw errorHttp(response.status, body);

        return (Array.isArray(body) ? body : []).map(function (item) {
          var doc = item && item.document;
          if (!doc || !doc.fields) return null;
          return normalizarDocumentoRest(doc);
        }).filter(Boolean);
      });
    });
  }

  function leerDocumento(documentoId) {
    return ejecutarConTimeoutGlobal(function (signal) {
      return leerDocumentoConSignal(documentoId, signal);
    });
  }

  function ejecutarConTimeoutGlobal(ejecutor) {
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timeoutMs = Number(cfg.timeoutMs || 7000);
    var timer = null;

    if (controller) {
      timer = window.setTimeout(function () {
        controller.abort();
      }, timeoutMs);
    }

    return Promise.resolve()
      .then(function () {
        return ejecutor(controller ? controller.signal : undefined);
      })
      .catch(function (error) {
        if (error && error.name === 'AbortError') {
          throw crearError('TIMEOUT', 'La consulta de Títulos superó el tiempo máximo de espera.');
        }
        if (error && error.codigo) throw error;
        throw crearError('NETWORK_ERROR', 'No se pudo conectar con Firebase de Títulos.', error);
      })
      .finally(function () {
        if (timer) window.clearTimeout(timer);
      });
  }

  function leerDocumentoConSignal(documentoId, signal) {
    var url = construirUrl(documentoId);

    return fetch(url, {
      method: 'GET',
      cache: 'no-store',
      mode: 'cors',
      credentials: 'omit',
      signal: signal,
      headers: {
        'Accept': 'application/json',
        'Cache-Control': 'no-cache'
      }
    })
      .then(function (response) {
        return response.text().then(function (texto) {
          var body = parseJsonSeguro(texto);

          if (response.status === 404) {
            return { ok: true, encontrado: false, status: 404, envio: null };
          }

          if (!response.ok) {
            throw errorHttp(response.status, body);
          }

          return {
            ok: true,
            encontrado: true,
            status: response.status,
            envio: sanitizarEnvio(normalizarDocumentoRest(body))
          };
        });
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

  function construirRunQueryUrl() {
    var base = String(cfg.firestoreRestBase || 'https://firestore.googleapis.com/v1').replace(/\/$/, '');
    var project = encodeURIComponent(cfg.projectId || '');
    var database = encodeURIComponent(cfg.databaseId || '(default)');
    var apiKey = encodeURIComponent(cfg.apiKey || '');

    return base + '/projects/' + project + '/databases/' + database + '/documents:runQuery?key=' + apiKey;
  }

  function normalizarDocumentoRest(doc) {
    var fields = doc && doc.fields ? doc.fields : {};
    var data = decodificarMapa(fields);
    var name = limpiar(doc && doc.name);
    var id = name ? decodeURIComponent(name.split('/').pop() || '') : '';

    data.id = data.id || id;
    data._docId = id;
    return data;
  }

  function sanitizarEnvio(data) {
    var salida = {};
    var permitidos = [
      'id', '_docId', 'cedula', 'numeroIdentificacion', 'nombres', 'nombreCompleto',
      'carrera', 'nombreCarrera', 'carreraNombre', 'carreraCodigo', 'periodoId', 'periodoCanonicoId', 'periodoNombre', 'periodoLabel',
      'estado', 'estadoProceso', 'estadoCoordinador', 'estadoInvestigador',
      'resultadoCoordinador', 'resultadoInvestigacion', 'requiereAccionDe', 'requiereRevision',
      'validadoCoordinador', 'validadoCoordinacion', 'coordinadorRevisado', 'investigacionRevisada',
      'titulo1', 'titulo2', 'titulo3', 'tituloElegido', 'tituloPreferidoTexto', 'tituloPreferidoNumero',
      'tituloCoordinador', 'tituloFinal', 'tituloFinalInvestigacion', 'tituloSeleccionadoNumero', 'tituloSeleccionadoTexto',
      'comentarioCoordinador', 'comentarioInvestigador', 'observacionDevolucion', 'observacionInvestigacion',
      'devueltoPor', 'permitirReenvio', 'puedeReenviar', 'intentosUsados', 'numeroEnvios', 'numeroReenvios',
      'versionActual', 'fechaEnvio', 'fechaValidacionCoordinador', 'fechaResolucionInvestigacion',
      'fechaRevisionCoordinador', 'fechaRevisionInvestigador', 'actualizadoEn', 'actualizadoEnLocal', 'creadoEn',
      'tipoTrabajo', 'tipoTrabajoId', 'tipoTrabajoLabel', 'modalidadTitulacion'
    ];

    permitidos.forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(data || {}, key)) salida[key] = data[key];
    });

    salida.titulosEnviados = sanitizarPropuestas(data && data.titulosEnviados);
    salida.propuestasDetalle = sanitizarPropuestas(data && data.propuestasDetalle);
    salida.revisionCoordinador = sanitizarRevision(data && data.revisionCoordinador);
    salida.revisionInvestigador = sanitizarRevision(data && data.revisionInvestigador);

    return salida;
  }

  function sanitizarPropuestas(lista) {
    if (!Array.isArray(lista)) return [];
    return lista.slice(0, 6).map(function (item) {
      if (!item || typeof item !== 'object') return item;
      var salida = {};
      [
        'numero', 'titulo', 'tituloFinal', 'preferido', 'enfoque',
        'temaGeneral', 'grupoEstudio', 'lugarContexto', 'anioPeriodo',
        'problemaNecesidad', 'objetivo'
      ].forEach(function (key) {
        if (Object.prototype.hasOwnProperty.call(item, key)) salida[key] = item[key];
      });
      return salida;
    });
  }

  function sanitizarRevision(revision) {
    if (!revision || typeof revision !== 'object') return {};
    var salida = {};
    [
      'estado', 'resultado', 'responsable', 'nombre', 'nombres', 'coordinador', 'investigador',
      'coordinadorNombre', 'coordinadorEmail', 'investigadorNombre', 'investigadorEmail',
      'comentario', 'observacion', 'tituloSeleccionadoTexto', 'tituloSeleccionadoNumero',
      'tituloFinal', 'fecha', 'fechaLocal', 'fechaRevision', 'fechaValidacion', 'fechaResolucion'
    ].forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(revision, key)) salida[key] = revision[key];
    });
    return salida;
  }

  function periodoCompatibleDocumento(doc, periodoSolicitado, permitirSinPeriodo) {
    var delDocumento = periodoDocumento(doc);
    if (!limpiar(delDocumento)) return Boolean(permitirSinPeriodo);
    return periodosEquivalentes(delDocumento, periodoSolicitado);
  }

  function periodoDocumento(doc) {
    doc = doc || {};
    return doc.periodoId || doc.periodoCanonicoId || doc.periodoNombre || doc.periodoLabel ||
      (doc.periodo && typeof doc.periodo === 'object' && (doc.periodo.id || doc.periodo.label)) ||
      doc.periodo || '';
  }

  function construirVariantesPeriodo(value) {
    var raw = limpiar(value);
    var canon = clavePeriodo(raw);
    var salida = [];

    agregarUnico(salida, raw);
    agregarUnico(salida, canon);

    var fechas = raw.match(/\d{4}-\d{2}/g) || [];
    if (fechas.length >= 2) {
      agregarUnico(salida, fechas[0] + '__' + fechas[1]);
      agregarUnico(salida, fechas[0] + '_' + fechas[1]);
      agregarUnico(salida, fechas[0] + '-' + fechas[1]);
      agregarUnico(salida, fechas[0] + ' ' + fechas[1]);
    }

    return salida.filter(Boolean);
  }

  function periodosEquivalentes(a, b) {
    var claveA = clavePeriodo(a);
    var claveB = clavePeriodo(b);

    if (!claveA || !claveB) return false;
    if (claveA === claveB) return true;
    if (/^\d{4}-\d{2}$/.test(claveA) && claveB.indexOf(claveA + '__') === 0) return true;
    if (/^\d{4}-\d{2}$/.test(claveB) && claveA.indexOf(claveB + '__') === 0) return true;

    return false;
  }

  function clavePeriodo(value) {
    var raw = value && typeof value === 'object'
      ? (value.id || value.periodoId || value.label || value.periodoLabel || '')
      : value;
    var texto = limpiar(raw);
    var fechas = texto.match(/\d{4}-\d{2}/g) || [];

    if (fechas.length >= 2) return fechas[0] + '__' + fechas[1];
    if (fechas.length === 1 && /^\s*\d{4}-\d{2}\s*$/.test(texto)) return fechas[0];

    var normal = texto
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9]+/g, ' ')
      .trim()
      .toUpperCase();

    var meses = {
      ENERO: '01', FEBRERO: '02', MARZO: '03', ABRIL: '04',
      MAYO: '05', JUNIO: '06', JULIO: '07', AGOSTO: '08',
      SEPTIEMBRE: '09', SETIEMBRE: '09', OCTUBRE: '10',
      NOVIEMBRE: '11', DICIEMBRE: '12'
    };
    var patron = /(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|SETIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)\s+(\d{4})/g;
    var partes = [];
    var match;

    while ((match = patron.exec(normal)) !== null) {
      partes.push(match[2] + '-' + meses[match[1]]);
      if (partes.length === 2) break;
    }

    if (partes.length === 2) return partes[0] + '__' + partes[1];
    return normal;
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

  function completarResultado(resultado, inicio, documentoId, ruta, rutasProbadas, periodoCanonico) {
    return Object.assign({}, resultado, {
      documentoId: documentoId || '',
      ruta: ruta || '',
      rutasProbadas: (rutasProbadas || []).slice(),
      periodoCanonico: periodoCanonico || '',
      base: cfg.projectId || 'titulos-ec2fa',
      coleccion: cfg.collection || 'envios',
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

  function fechaMs(value) {
    if (!value) return 0;
    if (value && typeof value.seconds === 'number') return Number(value.seconds) * 1000;
    var ms = new Date(value).getTime();
    return Number.isFinite(ms) ? ms : 0;
  }

  function agregarUnico(lista, value) {
    var texto = limpiar(value);
    if (texto && lista.indexOf(texto) === -1) lista.push(texto);
  }

  function limpiar(value) {
    return String(value === undefined || value === null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  window.TAConsultaEstadoService = Object.freeze({
    consultar: consultar,
    leerDocumento: leerDocumento,
    normalizarDocumentoRest: normalizarDocumentoRest,
    sanitizarEnvio: sanitizarEnvio
  });
})();
