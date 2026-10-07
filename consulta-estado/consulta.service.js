(function () {
  'use strict';

  var cfg = window.TA_CONSULTA_ESTADO_CONFIG || {};

  function consultar(periodoId, cedulaIngresada) {
    var datos = validarEntrada(periodoId, cedulaIngresada);
    if (datos.error) return Promise.reject(datos.error);

    var inicio = Date.now();
    var rutasProbadas = [];
    var documentoId = datos.periodoCanonico + '__' + datos.cedula;

    /*
      Ruta normal del servicio independiente:
      1 GET directo al documento canónico periodo__cedula.
      Solo un 404 habilita la búsqueda histórica por campos/IDs.
    */
    return ejecutarConTimeoutGlobal(function (signal) {
      rutasProbadas.push('ID_EXACTO:' + documentoId);

      return leerDocumentoConSignal(documentoId, signal)
        .then(function (directo) {
          if (directo && directo.encontrado) {
            return completarResultado({
              ok: true,
              encontrado: true,
              status: directo.status || 200,
              envio: sanitizarEnvio(directo.envio)
            }, inicio, documentoId, 'ID_EXACTO', rutasProbadas, datos.periodoCanonico, 'ID_EXACTO_PRIMERO');
          }

          return buscarLegacyInterno(
            datos.periodoSolicitado,
            datos.periodoCanonico,
            datos.cedula,
            signal,
            rutasProbadas,
            inicio
          );
        });
    }).catch(function (error) {
      if (error && !error.diagnostico) {
        error.diagnostico = {
          estrategia: 'ID_EXACTO_PRIMERO',
          base: cfg.projectId || 'titulos-ec2fa',
          coleccion: cfg.collection || 'envios',
          periodo: datos.periodoSolicitado,
          periodoCanonico: datos.periodoCanonico,
          cedula: datos.cedula,
          rutasProbadas: rutasProbadas.slice(),
          duracionMs: Date.now() - inicio
        };
      }
      throw error;
    });
  }

  function consultarLegacy(periodoId, cedulaIngresada) {
    var datos = validarEntrada(periodoId, cedulaIngresada);
    if (datos.error) return Promise.reject(datos.error);

    var inicio = Date.now();
    var rutasProbadas = [];

    return ejecutarConTimeoutGlobal(function (signal) {
      return buscarLegacyInterno(
        datos.periodoSolicitado,
        datos.periodoCanonico,
        datos.cedula,
        signal,
        rutasProbadas,
        inicio
      );
    }).catch(function (error) {
      if (error && !error.diagnostico) {
        error.diagnostico = {
          estrategia: 'FALLBACK_LEGACY',
          base: cfg.projectId || 'titulos-ec2fa',
          coleccion: cfg.collection || 'envios',
          periodo: datos.periodoSolicitado,
          periodoCanonico: datos.periodoCanonico,
          cedula: datos.cedula,
          rutasProbadas: rutasProbadas.slice(),
          duracionMs: Date.now() - inicio
        };
      }
      throw error;
    });
  }

  function buscarLegacyInterno(periodoSolicitado, periodoCanonico, cedula, signal, rutasProbadas, inicio) {
    return buscarPorIdentidad(periodoSolicitado, cedula, signal, rutasProbadas)
      .then(function (porIdentidad) {
        if (porIdentidad) {
          return completarResultado({
            ok: true,
            encontrado: true,
            status: porIdentidad.status || 200,
            envio: sanitizarEnvio(porIdentidad.envio)
          }, inicio, porIdentidad.documentoId, porIdentidad.ruta, rutasProbadas, periodoCanonico, 'FALLBACK_IDENTIDAD');
        }

        return buscarPorIds(periodoSolicitado, periodoCanonico, cedula, signal, rutasProbadas)
          .then(function (porId) {
            if (porId) {
              return completarResultado({
                ok: true,
                encontrado: true,
                status: porId.status || 200,
                envio: sanitizarEnvio(porId.envio)
              }, inicio, porId.documentoId, porId.ruta, rutasProbadas, periodoCanonico, 'FALLBACK_ID_LEGACY');
            }

            return completarResultado({
              ok: true,
              encontrado: false,
              status: 404,
              envio: null
            }, inicio, periodoCanonico + '__' + cedula, 'NO_ENCONTRADO', rutasProbadas, periodoCanonico, 'SIN_COINCIDENCIA');
          });
      });
  }

  function validarEntrada(periodoId, cedulaIngresada) {
    var periodoSolicitado = limpiar(periodoId);
    var periodoCanonico = clavePeriodo(periodoSolicitado);
    var cedula = normalizarCedula(cedulaIngresada);

    if (!periodoSolicitado) {
      return { error: crearError('PERIODO_INVALIDO', 'Falta el período académico.') };
    }

    if (!cedula) {
      return { error: crearError('CEDULA_INVALIDA', 'La cédula no es válida.') };
    }

    return {
      periodoSolicitado: periodoSolicitado,
      periodoCanonico: periodoCanonico,
      cedula: cedula
    };
  }

  function buscarPorIds(periodoOriginal, periodoCanonico, cedula, signal, rutasProbadas) {
    var ids = construirIdsCandidatos(periodoOriginal, periodoCanonico, cedula);

    if (!ids.length) return Promise.resolve(null);

    var lecturas = ids.map(function (id) {
      rutasProbadas.push('FALLBACK_ID:' + id);

      return leerDocumentoConSignal(id, signal)
        .then(function (resultado) {
          if (!resultado || !resultado.encontrado) return null;
          if (!periodoCompatibleDocumento(resultado.envio, periodoOriginal, true)) return null;

          return {
            documentoId: id,
            ruta: id === cedula ? 'ID_LEGACY_CEDULA' : 'ID_DIRECTO',
            status: resultado.status,
            envio: resultado.envio
          };
        })
        .catch(function (error) {
          if (error && (error.codigo === 'PERMISSION_DENIED' || error.codigo === 'UNAUTHENTICATED')) {
            throw error;
          }
          return null;
        });
    });

    return Promise.all(lecturas).then(function (resultados) {
      var encontrados = resultados.filter(Boolean);
      if (!encontrados.length) return null;

      encontrados.sort(function (a, b) {
        return fechaPrioridadProceso(b.envio) - fechaPrioridadProceso(a.envio);
      });

      return encontrados[0];
    });
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
    var numeroCedula = Number(cedula);
    var faseTexto = [
      { campo: 'cedula', valor: { stringValue: cedula }, tipo: 'STRING' },
      { campo: 'numeroIdentificacion', valor: { stringValue: cedula }, tipo: 'STRING' }
    ];

    return ejecutarFaseIdentidad(faseTexto, periodoSolicitado, cedula, signal, rutasProbadas)
      .then(function (resultadoTexto) {
        if (resultadoTexto) return resultadoTexto;
        if (!Number.isSafeInteger(numeroCedula)) return null;

        return ejecutarFaseIdentidad([
          { campo: 'cedula', valor: { integerValue: String(numeroCedula) }, tipo: 'NUMBER' },
          { campo: 'numeroIdentificacion', valor: { integerValue: String(numeroCedula) }, tipo: 'NUMBER' }
        ], periodoSolicitado, cedula, signal, rutasProbadas);
      });
  }

  function ejecutarFaseIdentidad(especificaciones, periodoSolicitado, cedula, signal, rutasProbadas) {
    var consultas = especificaciones.map(function (spec) {
      var ruta = 'IDENTIDAD:' + spec.campo + ':' + spec.tipo;
      rutasProbadas.push(ruta);

      return ejecutarRunQuery(spec.campo, spec.valor, signal)
        .then(function (docs) {
          return { ok: true, ruta: ruta, docs: docs || [] };
        })
        .catch(function (error) {
          if (error && (error.codigo === 'PERMISSION_DENIED' || error.codigo === 'UNAUTHENTICATED')) {
            throw error;
          }
          return { ok: false, ruta: ruta, docs: [], error: error };
        });
    });

    return Promise.all(consultas).then(function (resultados) {
      var exitosas = resultados.filter(function (item) { return item.ok; });
      if (!exitosas.length) {
        throw crearError(
          'CONSULTA_IDENTIDAD_FALLIDA',
          'No se pudo consultar envios por cédula o número de identificación.'
        );
      }

      var docs = [];
      var vistos = {};

      exitosas.forEach(function (resultado) {
        (resultado.docs || []).forEach(function (doc) {
          var id = doc && (doc.id || doc._docId) || '';
          var key = id || [
            normalizarCedula(doc && (doc.cedula || doc.numeroIdentificacion)),
            clavePeriodo(periodoDocumento(doc)),
            fechaPrioridadProceso(doc)
          ].join('|');

          if (vistos[key]) return;
          vistos[key] = true;
          docs.push(doc);
        });
      });

      if (!docs.length) return null;

      var compatibles = docs.filter(function (doc) {
        return periodoCompatibleDocumento(doc, periodoSolicitado, false);
      });

      if (!compatibles.length) {
        var sinPeriodo = docs.filter(function (doc) {
          return !limpiar(periodoDocumento(doc));
        });

        if (docs.length === 1 && sinPeriodo.length === 1) {
          compatibles = sinPeriodo;
        }
      }

      if (!compatibles.length) return null;

      compatibles.sort(function (a, b) {
        return fechaPrioridadProceso(b) - fechaPrioridadProceso(a);
      });

      var elegido = compatibles[0];

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
      'tituloCoordinador', 'tituloCoordinadorNumero', 'tituloFinal', 'tituloFinalInvestigacion', 'tituloSeleccionadoNumero', 'tituloSeleccionadoTexto',
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
    salida.historialProceso = Array.isArray(data && data.historialProceso)
      ? data.historialProceso.slice(0, 60)
      : [];

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

  function completarResultado(resultado, inicio, documentoId, ruta, rutasProbadas, periodoCanonico, estrategia) {
    return Object.assign({}, resultado, {
      documentoId: documentoId || '',
      ruta: ruta || '',
      estrategia: estrategia || 'IDENTIDAD_PRIMERO',
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

  function fechaPrioridadProceso(doc) {
    doc = doc || {};
    return fechaMs(
      doc.actualizadoEn ||
      doc.fechaResolucionInvestigacion ||
      doc.fechaRevisionInvestigador ||
      doc.investigacionRevisadaEn ||
      doc.fechaResolucion ||
      doc.fechaValidacionCoordinador ||
      doc.fechaRevisionCoordinador ||
      doc.revisadoEnLocal ||
      doc.actualizadoEnLocal ||
      doc.fechaEnvio ||
      doc.creadoEn
    );
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
    consultarLegacy: consultarLegacy,
    leerDocumento: leerDocumento,
    normalizarDocumentoRest: normalizarDocumentoRest,
    sanitizarEnvio: sanitizarEnvio
  });
})();
