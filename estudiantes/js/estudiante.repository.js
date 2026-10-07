/*
  Repositorio del módulo estudiantes con separación estricta de bases:
  - utet-4387a: Estudiante + matriculas, solo lectura.
  - titulos-ec2fa: configuracion + envios + workflow_events, lectura/escritura.
*/
(function () {
  'use strict';

  var config = window.TA_ESTUDIANTES_CONFIG;
  var firebaseService = window.TAFirebaseService;
  var appConfigCache = null;
  var appConfigCacheAt = 0;
  var envioCache = {};

  function cargarConfiguracionApp() {
    var ahora = Date.now();

    if (appConfigCache && (ahora - appConfigCacheAt) < 120000) {
      return Promise.resolve(appConfigCache);
    }

    if (!firebaseService || typeof firebaseService.leerDocumento !== 'function') {
      appConfigCache = normalizarAppConfig(null, 'default-local-sin-firebase');
      appConfigCacheAt = ahora;
      return Promise.resolve(appConfigCache);
    }

    return conTimeoutRepo(
      firebaseService.leerDocumento(config.collections.config, config.documents.appConfig),
      900,
      'configuracion'
    ).then(function (doc) {
      appConfigCache = normalizarAppConfig(doc, doc ? 'firebase-titulos' : 'default-local');
      appConfigCacheAt = Date.now();
      return appConfigCache;
    }).catch(function () {
      appConfigCache = normalizarAppConfig(null, 'default-local-rapido');
      appConfigCacheAt = Date.now();
      return appConfigCache;
    });
  }

  function normalizarAppConfig(doc, origen) {
    var data = Object.assign({}, config.defaultAppConfig, doc || {});
    data.origen = origen || 'firebase-titulos';
    data.procesoActivo = doc && doc.procesoActivo !== undefined
      ? doc.procesoActivo !== false
      : !(doc && doc.enviosHabilitados === false);
    data.periodoActivoId = limpiarTexto(
      data.periodoActivoId ||
      (data.periodoActivo && data.periodoActivo.id) ||
      (typeof data.periodoActivo === 'string' ? data.periodoActivo : '')
    );
    if (!data.periodoActivoLabel && data.periodoActivoId) data.periodoActivoLabel = formatearPeriodoId(data.periodoActivoId);
    return data;
  }

  function buscarEstudiantePorCedula(cedulaIngresada, appConfig) {
    var variantes = construirVariantesCedula(cedulaIngresada);
    if (!variantes.length) return Promise.resolve(null);

    return buscarDocumentoAcademicoPorIds(variantes)
      .then(function (estudiante) {
        if (estudiante) return estudiante;
        return buscarDocumentoAcademicoPorCampo('cedula', variantes);
      })
      .then(function (estudiante) {
        if (!estudiante || estudiante.eliminado === true) return null;
        return buscarMatriculas(variantes).then(function (matriculas) {
          var matricula = seleccionarMatricula(matriculas, appConfig);
          return normalizarEstudiante(estudiante, cedulaIngresada, matricula);
        });
      });
  }

  function buscarDocumentoAcademicoPorIds(variantes) {
    var cadena = Promise.resolve(null);
    variantes.forEach(function (cedula) {
      cadena = cadena.then(function (encontrado) {
        if (encontrado) return encontrado;
        return firebaseService.leerDocumentoAcademico(config.collections.estudiantes, cedula).catch(function () { return null; });
      });
    });
    return cadena;
  }

  function buscarDocumentoAcademicoPorCampo(campo, variantes) {
    var cadena = Promise.resolve(null);
    variantes.forEach(function (cedula) {
      cadena = cadena.then(function (encontrado) {
        if (encontrado) return encontrado;
        return firebaseService.consultarPrimeroAcademico(config.collections.estudiantes, campo, '==', cedula).catch(function () { return null; });
      });
    });
    return cadena;
  }

  function buscarMatriculas(variantes) {
    var promesas = variantes.map(function (cedula) {
      return firebaseService.consultarColeccionAcademico(config.collections.matriculas, 'cedula', '==', cedula, 50)
        .catch(function () { return []; });
    });

    return Promise.all(promesas).then(function (listas) {
      var mapa = {};
      var salida = [];
      listas.forEach(function (lista) {
        (lista || []).forEach(function (item) {
          var id = item.id || item._docId || [item.periodoId, item.cedula].join('__');
          if (!mapa[id]) {
            mapa[id] = true;
            salida.push(item);
          }
        });
      });
      return salida;
    });
  }

  function seleccionarMatricula(matriculas, appConfig) {
    var lista = (matriculas || []).filter(function (m) {
      return m && m.eliminado !== true && m.retirado !== true && normalizarTexto(m.estadoMatricula || 'ACTIVO') === 'ACTIVO';
    });
    if (!lista.length) return null;

    var periodoActivo = obtenerPeriodoActivoDesdeConfig(appConfig);
    if (periodoActivo) {
      var coincidencia = lista.filter(function (m) { return limpiarTexto(m.periodoId) === periodoActivo; })[0];
      if (coincidencia) return coincidencia;
    }

    lista.sort(function (a, b) {
      var fechaA = fechaNumero(a.updatedAt || a.createdAt);
      var fechaB = fechaNumero(b.updatedAt || b.createdAt);
      if (fechaA !== fechaB) return fechaB - fechaA;
      return limpiarTexto(b.periodoId).localeCompare(limpiarTexto(a.periodoId));
    });
    return lista[0];
  }

  function consultarEnvio(periodoId, cedulaIngresada) {
    var variantesCedula = construirVariantesCedula(cedulaIngresada);
    var variantesPeriodo = construirVariantesPeriodo(periodoId);
    var periodoPrincipal = variantesPeriodo[0] || obtenerPeriodoIdDesdeValor(periodoId);
    var cedulaPrincipal = normalizarCedulaParaMostrar(cedulaIngresada);
    var cacheKey = periodoPrincipal + '__' + cedulaPrincipal;
    var cache = envioCache[cacheKey];

    if (cache && (Date.now() - cache.at) < 60000) {
      return Promise.resolve(cache.value);
    }

    /*
      Ruta rápida:
      1. Lee por REST el documento exacto de envios.
      2. En paralelo intenta la lectura directa con el SDK.
      3. Solo si ambas rutas no encuentran el documento, consulta por cédula.
      Esto evita encadenar varias lecturas Firestore una detrás de otra.
    */
    var restQueryPromise = buscarEnvioRestPorCedula(periodoPrincipal, variantesCedula)
      .then(function (value) { return { ok: true, value: value, origen: 'rest-query' }; })
      .catch(function (error) { return { ok: false, error: error, origen: 'rest-query' }; });

    var sdkQueryPromise = buscarEnvioPorCedulaRapido(periodoPrincipal, variantesCedula)
      .then(function (value) { return { ok: true, value: value, origen: 'sdk-query' }; })
      .catch(function (error) { return { ok: false, error: error, origen: 'sdk-query' }; });

    return buscarEnvioDirectoRapido(variantesPeriodo, variantesCedula)
      .then(function (encontrado) {
        if (encontrado) {
          var normalizado = normalizarEnvioExistente(encontrado);
          envioCache[cacheKey] = { at: Date.now(), value: normalizado };
          return normalizado;
        }

        return Promise.all([restQueryPromise, sdkQueryPromise]).then(function (resultados) {
          var conRegistro = resultados.filter(function (item) {
            return item.ok && item.value;
          })[0];

          if (conRegistro) {
            envioCache[cacheKey] = { at: Date.now(), value: conRegistro.value };
            return conRegistro.value;
          }

          var exitosas = resultados.filter(function (item) { return item.ok; });
          if (exitosas.length) return null;

          throw new Error('No se pudo consultar el estado del título. Intenta nuevamente.');
        });
      });
  }

  function buscarEnvioDirectoRapido(periodos, cedulas) {
    var ids = [];

    (periodos || []).forEach(function (periodo) {
      (cedulas || []).forEach(function (cedula) {
        agregarUnico(ids, construirTituloId(periodo, cedula));
      });
    });

    if (!ids.length) return Promise.resolve(null);

    var lecturas = ids.map(function (id) {
      return Promise.all([
        leerEnvioRest(id).catch(function () { return null; }),
        conTimeoutRepo(
          firebaseService.leerDocumento(config.collections.titulos, id),
          1200,
          'envio-directo'
        ).catch(function () { return null; })
      ]).then(function (resultados) {
        return resultados[0] || resultados[1] || null;
      });
    });

    return Promise.all(lecturas).then(function (resultados) {
      return resultados.filter(Boolean)[0] || null;
    });
  }

  function buscarEnvioRestPorCedula(periodo, variantes) {
    var firebaseCfg = window.TA_ESTUDIANTES_FIREBASE_TITULOS_CONFIG || {};
    var projectId = firebaseCfg.projectId;
    var apiKey = firebaseCfg.apiKey;

    if (!window.fetch || !projectId || !apiKey) {
      return Promise.reject(new Error('REST_NO_DISPONIBLE'));
    }

    var cedulas = [];
    (variantes || []).forEach(function (cedula) {
      agregarUnico(cedulas, normalizarCedulaParaMostrar(cedula));
    });

    if (!cedulas.length) return Promise.resolve(null);

    var url =
      'https://firestore.googleapis.com/v1/projects/' +
      encodeURIComponent(projectId) +
      '/databases/(default)/documents:runQuery?key=' +
      encodeURIComponent(apiKey);

    var consultas = cedulas.map(function (cedula) {
      return fetchJsonRepo(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId: config.collections.titulos }],
            where: {
              fieldFilter: {
                field: { fieldPath: 'cedula' },
                op: 'EQUAL',
                value: { stringValue: cedula }
              }
            },
            limit: 12
          }
        })
      }, 1700).then(function (respuesta) {
        return {
          ok: true,
          docs: (Array.isArray(respuesta) ? respuesta : []).map(function (item) {
            var doc = item && item.document;
            if (!doc || !doc.fields) return null;
            var nombre = String(doc.name || '');
            var id = decodeURIComponent(nombre.split('/').pop() || '');
            return Object.assign(
              decodificarFirestoreFields(doc.fields),
              { id: id, _docId: id }
            );
          }).filter(Boolean)
        };
      }).catch(function (error) {
        return { ok: false, docs: [], error: error };
      });
    });

    return Promise.all(consultas).then(function (resultados) {
      var exitosas = resultados.filter(function (item) { return item.ok; });
      if (!exitosas.length) throw new Error('REST_QUERY_FALLO');

      var docs = [];
      var vistos = {};

      exitosas.forEach(function (resultado) {
        (resultado.docs || []).forEach(function (doc) {
          var id = doc.id || doc._docId || '';
          if (id && vistos[id]) return;
          if (id) vistos[id] = true;
          docs.push(doc);
        });
      });

      var exactos = docs.filter(function (doc) {
        return periodosEquivalentes(
          doc.periodoId || doc.periodoCanonicoId || doc.periodoNombre || '',
          periodo
        );
      });

      if (!exactos.length) return null;

      exactos.sort(function (a, b) {
        return fechaNumero(b.fechaEnvio || b.actualizadoEnLocal || b.actualizadoEn || b.creadoEn) -
          fechaNumero(a.fechaEnvio || a.actualizadoEnLocal || a.actualizadoEn || a.creadoEn);
      });

      return normalizarEnvioExistente(exactos[0]);
    });
  }

  function fetchJsonRepo(url, options, timeoutMs) {
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = window.setTimeout(function () {
      if (controller) controller.abort();
    }, Number(timeoutMs || 1700));

    var opts = Object.assign({}, options || {});
    if (controller) opts.signal = controller.signal;

    return fetch(url, opts)
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP_' + response.status);
        return response.json();
      })
      .finally(function () {
        window.clearTimeout(timer);
      });
  }

  function buscarEnvioPorCedulaRapido(periodo, variantes) {
    var consultas = (variantes || []).map(function (cedula) {
      return conTimeoutRepo(
        firebaseService.consultarColeccion(config.collections.titulos, 'cedula', '==', cedula, 12),
        1400,
        'envio-cedula'
      ).then(function (docs) {
        return { ok: true, docs: docs || [] };
      }).catch(function (error) {
        return { ok: false, docs: [], error: error };
      });
    });

    if (!consultas.length) return Promise.resolve(null);

    return Promise.all(consultas).then(function (resultados) {
      var exitosas = resultados.filter(function (item) { return item.ok; });
      var docs = [];
      var vistos = {};

      if (!exitosas.length) {
        throw new Error('No se pudo confirmar el estado del título. Intenta nuevamente.');
      }

      exitosas.forEach(function (resultado) {
        (resultado.docs || []).forEach(function (doc) {
          var id = doc.id || doc._docId || '';
          if (id && vistos[id]) return;
          if (id) vistos[id] = true;
          docs.push(doc);
        });
      });

      var exactos = docs.filter(function (doc) {
        return periodosEquivalentes(
          doc.periodoId || doc.periodoCanonicoId || doc.periodoNombre || '',
          periodo
        );
      });

      if (!exactos.length) return null;

      exactos.sort(function (a, b) {
        return fechaNumero(b.fechaEnvio || b.actualizadoEnLocal || b.actualizadoEn || b.creadoEn) -
          fechaNumero(a.fechaEnvio || a.actualizadoEnLocal || a.actualizadoEn || a.creadoEn);
      });

      return normalizarEnvioExistente(exactos[0]);
    });
  }

  function leerEnvioRest(documentId) {
    var firebaseCfg = window.TA_ESTUDIANTES_FIREBASE_TITULOS_CONFIG || {};
    var projectId = firebaseCfg.projectId;
    var apiKey = firebaseCfg.apiKey;

    if (!window.fetch || !projectId || !apiKey || !documentId) {
      return Promise.resolve(null);
    }

    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = window.setTimeout(function () {
      if (controller) controller.abort();
    }, 1500);

    var url =
      'https://firestore.googleapis.com/v1/projects/' +
      encodeURIComponent(projectId) +
      '/databases/(default)/documents/' +
      encodeURIComponent(config.collections.titulos) +
      '/' +
      encodeURIComponent(documentId) +
      '?key=' +
      encodeURIComponent(apiKey);

    return fetch(url, {
      method: 'GET',
      cache: 'no-store',
      signal: controller ? controller.signal : undefined
    }).then(function (response) {
      if (response.status === 404) return null;
      if (!response.ok) throw new Error('REST ' + response.status);
      return response.json();
    }).then(function (doc) {
      if (!doc || !doc.fields) return null;
      return Object.assign(
        decodificarFirestoreFields(doc.fields),
        { id: documentId, _docId: documentId }
      );
    }).finally(function () {
      window.clearTimeout(timer);
    });
  }

  function decodificarFirestoreFields(fields) {
    var salida = {};
    Object.keys(fields || {}).forEach(function (key) {
      salida[key] = decodificarFirestoreValue(fields[key]);
    });
    return salida;
  }

  function decodificarFirestoreValue(value) {
    if (!value || typeof value !== 'object') return value;
    if (Object.prototype.hasOwnProperty.call(value, 'nullValue')) return null;
    if (Object.prototype.hasOwnProperty.call(value, 'stringValue')) return value.stringValue;
    if (Object.prototype.hasOwnProperty.call(value, 'booleanValue')) return value.booleanValue;
    if (Object.prototype.hasOwnProperty.call(value, 'integerValue')) return Number(value.integerValue);
    if (Object.prototype.hasOwnProperty.call(value, 'doubleValue')) return Number(value.doubleValue);
    if (Object.prototype.hasOwnProperty.call(value, 'timestampValue')) return value.timestampValue;
    if (Object.prototype.hasOwnProperty.call(value, 'referenceValue')) return value.referenceValue;
    if (value.arrayValue) {
      return (value.arrayValue.values || []).map(decodificarFirestoreValue);
    }
    if (value.mapValue) {
      return decodificarFirestoreFields(value.mapValue.fields || {});
    }
    if (value.geoPointValue) return value.geoPointValue;
    return null;
  }

  function construirVariantesPeriodo(periodoId) {
    var raw = obtenerPeriodoIdDesdeValor(periodoId);
    var variantes = [];
    agregarUnico(variantes, raw);

    var fechas = raw.match(/\d{4}-\d{2}/g) || [];
    if (fechas.length >= 2) {
      agregarUnico(variantes, fechas[0] + '__' + fechas[1]);
      agregarUnico(variantes, fechas[0] + '_' + fechas[1]);
      agregarUnico(variantes, fechas[0] + ' ' + fechas[1]);
    }

    return variantes;
  }

  function periodosEquivalentes(a, b) {
    var claveA = clavePeriodo(a);
    var claveB = clavePeriodo(b);
    return Boolean(claveA && claveB && claveA === claveB);
  }

  function clavePeriodo(value) {
    var texto = limpiarTexto(value);
    var fechas = texto.match(/\d{4}-\d{2}/g) || [];
    if (fechas.length >= 2) return fechas[0] + '__' + fechas[1];

    return texto
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, ' ')
      .trim()
      .toUpperCase();
  }

  function conTimeoutRepo(promesa, ms, etiqueta) {
    var timer;

    return Promise.race([
      Promise.resolve(promesa),
      new Promise(function (_, reject) {
        timer = window.setTimeout(function () {
          reject(new Error('TIMEOUT_' + String(etiqueta || 'REPO').toUpperCase()));
        }, Number(ms || 1500));
      })
    ]).finally(function () {
      if (timer) window.clearTimeout(timer);
    });
  }


  function normalizarEnvioExistente(data) {
    if (!data) return null;
    var propuestas = Array.isArray(data.titulosEnviados) && data.titulosEnviados.length
      ? data.titulosEnviados
      : [1, 2, 3].map(function (numero) {
          var titulo = limpiarTexto(data['titulo' + numero]);
          if (!titulo) return null;
          var detalle = Array.isArray(data.propuestasDetalle)
            ? data.propuestasDetalle.filter(function (p) { return Number(p.numero) === numero; })[0]
            : null;
          return Object.assign({ numero: numero, tituloFinal: titulo, preferido: Number(data.tituloPreferidoNumero) === numero }, detalle || {});
        }).filter(Boolean);

    return Object.assign({}, data, {
      id: data.id || data._docId || construirTituloId(data.periodoId, data.cedula || data.numeroIdentificacion),
      cedula: normalizarCedulaParaMostrar(data.cedula || data.numeroIdentificacion),
      titulosEnviados: propuestas,
      tituloPreferidoTexto: limpiarTexto(data.tituloPreferidoTexto || data.tituloElegido || obtenerTituloPreferidoTexto({
        tituloPreferidoNumero: data.tituloPreferidoNumero,
        titulosEnviados: propuestas
      })),
      intentosUsados: Number(data.intentosUsados || data.numeroEnvios || 1),
      puedeReenviar: data.puedeReenviar === true || data.permitirReenvio === true
    });
  }

  function validarAccesoEstudiante(estudiante, appConfig, envioExistente) {
    if (!appConfig.procesoActivo) return error('El proceso de registro de títulos no está activo.');
    if (!estudiante) return error('No se encontró un estudiante con esa cédula.');
    if (!estudiante.periodoId) return error('No se encontró una matrícula activa para el período de titulación. Comunícate con coordinación.');
    if (normalizarTexto(estudiante.estadoMatricula) !== 'ACTIVO') return error('Tu matrícula no consta como ACTIVO. Comunícate con coordinación.');
    if (estudiante.puedeEnviarTitulo === false) return error('Tu registro no está habilitado para enviar títulos. Comunícate con coordinación.');

    var maxIntentos = Number(appConfig.maxIntentos || config.defaultAppConfig.maxIntentos || 1);
    var intentosUsados = Number(envioExistente && (envioExistente.numeroEnvios || envioExistente.intentosUsados) || 0);
    var reenvioPermitido = Boolean(envioExistente && (envioExistente.permitirReenvio === true || envioExistente.puedeReenviar === true));

    if (envioExistente && !reenvioPermitido) {
      return error('Ya existe un envío registrado para esta cédula. Si necesitas cambios, comunícate con coordinación.');
    }

    return ok({
      estudiante: estudiante,
      appConfig: appConfig,
      envioExistente: envioExistente || null,
      intentosUsados: intentosUsados,
      maxIntentos: maxIntentos,
      intentosDisponibles: reenvioPermitido ? 1 : Math.max(maxIntentos - intentosUsados, 0)
    });
  }

  function consultarEstudianteCompleto(cedula) {
    var appConfigLocal = null;
    var estudianteLocal = null;

    return cargarConfiguracionApp()
      .then(function (appConfig) {
        appConfigLocal = appConfig;
        return buscarEstudiantePorCedula(cedula, appConfigLocal);
      })
      .then(function (estudiante) {
        estudianteLocal = estudiante;
        if (!estudianteLocal) return null;
        return consultarEnvio(estudianteLocal.periodoId, estudianteLocal.cedula || cedula);
      })
      .then(function (envioExistente) {
        return validarAccesoEstudiante(estudianteLocal, appConfigLocal, envioExistente);
      });
  }

  function guardarEnvioFinal(payload) {
    if (!payload || !payload.cedula) return Promise.reject(new Error('No se puede guardar porque falta la cédula.'));
    payload.periodoId = obtenerPeriodoIdDesdeValor(payload.periodoId || 'SIN_PERIODO');
    var tituloId = construirTituloId(payload.periodoId, payload.cedula);

    return consultarEnvio(payload.periodoId, payload.cedula).then(function (existente) {
      var propuestas = Array.isArray(payload.titulosEnviados) ? payload.titulosEnviados : [];
      var numeroEnvios = Number(existente && (existente.numeroEnvios || existente.intentosUsados) || 0) + 1;
      var numeroReenvios = Number(existente && existente.numeroReenvios || 0) + (existente ? 1 : 0);
      var versionActual = Number(existente && existente.versionActual || 0) + 1;
      var ahora = new Date().toISOString();
      var preferido = obtenerTituloPreferidoTexto(payload);

      var payloadFinal = Object.assign({}, payload, {
        id: tituloId,
        numeroIdentificacion: payload.numeroIdentificacion || payload.cedula,
        carreraNombre: payload.carrera || payload.nombreCarrera || '',
        carreraCodigo: payload.codigoCarrera || '',
        periodoNombre: payload.periodoLabel || formatearPeriodoId(payload.periodoId),
        periodoCanonicoId: payload.periodoId,
        telegram: payload.telegramUser || (payload.contacto && payload.contacto.telegram) || '',
        titulo1: tituloPorNumero(propuestas, 1),
        titulo2: tituloPorNumero(propuestas, 2),
        titulo3: tituloPorNumero(propuestas, 3),
        propuestasDetalle: propuestas,
        tituloElegido: preferido,
        tituloPreferidoTexto: preferido,
        estado: 'PENDIENTE_REVISION',
        estadoProceso: 'PENDIENTE_COORDINADOR',
        requiereAccionDe: 'COORDINACION',
        requiereRevision: true,
        permitirReenvio: false,
        puedeReenviar: false,
        devueltoPor: '',
        observacionDevolucion: '',
        validadoCoordinador: false,
        resultadoCoordinador: null,
        tituloCoordinador: null,
        comentarioCoordinador: null,
        fechaValidacionCoordinador: null,
        resultadoInvestigacion: null,
        tituloFinalInvestigacion: null,
        fechaResolucionInvestigacion: null,
        tituloFinal: null,
        estadoCoordinador: 'PENDIENTE',
        coordinadorRevisado: false,
        revisionCoordinador: null,
        estadoInvestigador: '',
        revisionInvestigador: null,
        investigacionRevisada: false,
        numeroEnvios: numeroEnvios,
        numeroReenvios: numeroReenvios,
        intentosUsados: numeroEnvios,
        versionActual: versionActual,
        versionActualId: tituloId + '__v' + completarNumero(versionActual, 3) + '__' + Date.now(),
        fechaEnvio: ahora,
        actualizadoEnLocal: ahora,
        origenCaptura: payload.origenCaptura || 'estudiantes-web'
      });

      return firebaseService.guardarDocumento(config.collections.titulos, tituloId, payloadFinal, { merge: true })
        .then(function () {
          envioCache[payloadFinal.periodoId + '__' + normalizarCedulaParaMostrar(payloadFinal.cedula)] = {
            at: Date.now(),
            value: normalizarEnvioExistente(payloadFinal)
          };
          return registrarLogEnvio(tituloId, payloadFinal, existente ? 'REENVIO_ESTUDIANTE' : 'ENVIO_ESTUDIANTE');
        })
        .then(function () {
          return { ok: true, id: tituloId, data: payloadFinal, mensaje: 'Envío registrado correctamente.' };
        });
    });
  }

  function actualizarRespaldoSheets(periodoId, cedula, respaldo) {
    return firebaseService.actualizarDocumento(config.collections.titulos, construirTituloId(obtenerPeriodoIdDesdeValor(periodoId), cedula), {
      respaldoSheets: respaldo,
      respaldoSheetsEstado: respaldo && respaldo.ok ? 'OK' : 'PENDIENTE',
      respaldoSheetsActualizadoEn: firebaseService.serverTimestamp()
    });
  }

  function registrarLogEnvio(tituloId, payload, accion) {
    return firebaseService.agregarDocumento(config.collections.logs, {
      tipo: accion || 'ENVIO_ESTUDIANTE',
      accion: accion || 'ENVIO_ESTUDIANTE',
      modulo: 'estudiantes',
      entidad: 'envios',
      entidadId: tituloId,
      tituloId: tituloId,
      cedula: payload.cedula,
      nombres: payload.nombres,
      carrera: payload.carreraNombre || payload.carrera,
      periodoId: payload.periodoId,
      estado: payload.estado,
      estadoProceso: payload.estadoProceso,
      numeroEnvios: payload.numeroEnvios,
      tituloPreferidoNumero: payload.tituloPreferidoNumero,
      origenCaptura: payload.origenCaptura || '',
      fechaLocal: new Date().toISOString()
    });
  }

  function construirTituloId(periodoId, cedula) {
    return String(obtenerPeriodoIdDesdeValor(periodoId) || 'SIN_PERIODO') + '__' + String(normalizarCedulaParaMostrar(cedula) || 'SIN_CEDULA');
  }

  function normalizarEstudiante(data, cedulaConsultada, matricula) {
    var source = normalizarObjeto(data || {});
    var mat = normalizarObjeto(matricula || {});
    var cedulaOriginal = valor(source, ['cedula', 'numeroidentificacion', 'identificacion', 'documento', 'dni', 'id']) || data.id || data._docId || cedulaConsultada;
    var cedulaNormalizada = normalizarCedulaParaMostrar(cedulaOriginal || cedulaConsultada);
    var nombres = valor(source, ['nombres', 'nombrecompleto', 'estudiante', 'nombre']);
    var carrera = valor(mat, ['nombrecarrera']) || valor(source, ['nombrecarreraactual', 'nombrecarrera', 'carrera']);
    var codigoCarrera = valor(mat, ['codigocarrera']) || valor(source, ['codigocarreraactual', 'codigocarrera']);
    var sede = valor(mat, ['sede']) || valor(source, ['sede']);
    var periodoId = valor(mat, ['periodoid']);
    var estadoMatricula = valor(mat, ['estadomatricula']) || (matricula ? '' : 'SIN_MATRICULA');
    var modalidad = valor(mat, ['modalidadtitulacion', 'modalidad', 'jornada']);

    return {
      id: data.id || data._docId || cedulaNormalizada,
      cedula: cedulaNormalizada,
      numeroIdentificacion: cedulaNormalizada,
      nombres: limpiarTexto(nombres) || 'Sin nombres registrados',
      codigoCarrera: limpiarTexto(codigoCarrera),
      carrera: limpiarTexto(carrera) || 'Carrera no registrada',
      nombreCarrera: limpiarTexto(carrera) || 'Carrera no registrada',
      sede: limpiarTexto(sede),
      modalidad: limpiarTexto(modalidad),
      horarioComplexivo: limpiarTexto(modalidad),
      periodoId: limpiarTexto(periodoId),
      periodoLabel: periodoId ? formatearPeriodoId(periodoId) : '',
      periodo: periodoId ? formatearPeriodoId(periodoId) : '',
      estadoMatricula: normalizarTexto(estadoMatricula),
      estado: normalizarTexto(estadoMatricula),
      correoInstitucional: limpiarTexto(data.correoInstitucional || ''),
      correoPersonal: limpiarTexto(data.correoPersonal || ''),
      celular: limpiarTexto(data.celular || ''),
      puedeEnviarTitulo: Boolean(matricula) && data.eliminado !== true,
      raw: data,
      matriculaRaw: matricula || null
    };
  }

  function construirVariantesCedula(cedula) {
    var limpia = limpiarSoloNumeros(cedula);
    var variantes = [];
    agregarUnico(variantes, limpia);
    if (limpia.length === 9) agregarUnico(variantes, '0' + limpia);
    if (limpia.length === 10 && limpia.charAt(0) === '0') agregarUnico(variantes, limpia.slice(1));
    agregarUnico(variantes, normalizarCedulaComparacion(limpia));
    return variantes;
  }

  function normalizarCedulaParaMostrar(cedula) {
    var limpia = limpiarSoloNumeros(cedula);
    return limpia.length === 9 ? '0' + limpia : limpia;
  }

  function normalizarCedulaComparacion(cedula) {
    var texto = limpiarSoloNumeros(cedula).replace(/^0+/, '');
    return texto || '0';
  }

  function obtenerPeriodoActivoDesdeConfig(appConfig) {
    if (!appConfig) return '';
    return limpiarTexto(appConfig.periodoActivoId || (appConfig.periodoActivo && appConfig.periodoActivo.id) || (typeof appConfig.periodoActivo === 'string' ? appConfig.periodoActivo : ''));
  }

  function obtenerPeriodoIdDesdeValor(value) {
    if (!value) return '';
    if (typeof value === 'object') return limpiarTexto(value.id || value.periodoId || value.value || '');
    return limpiarTexto(value);
  }

  function tituloPorNumero(propuestas, numero) {
    var item = (propuestas || []).filter(function (p) { return Number(p.numero) === Number(numero); })[0];
    return item ? limpiarTexto(item.tituloFinal || item.titulo || '') : '';
  }

  function obtenerTituloPreferidoTexto(payload) {
    var numero = Number(payload && payload.tituloPreferidoNumero || 1);
    var propuestas = Array.isArray(payload && payload.titulosEnviados) ? payload.titulosEnviados : [];
    return tituloPorNumero(propuestas, numero) || tituloPorNumero(propuestas, 1);
  }

  function normalizarObjeto(data) {
    var normalizado = {};
    Object.keys(data || {}).forEach(function (key) { normalizado[normalizarKey(key)] = data[key]; });
    return normalizado;
  }

  function normalizarKey(key) {
    return String(key || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  }

  function valor(source, keys) {
    for (var i = 0; i < keys.length; i += 1) {
      var value = source[keys[i]];
      if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim();
    }
    return '';
  }

  function formatearPeriodoId(periodoId) {
    var match = limpiarTexto(periodoId).match(/(\d{4})-(\d{2})__(\d{4})-(\d{2})/);
    if (!match) return limpiarTexto(periodoId);
    var meses = { '01':'Enero','02':'Febrero','03':'Marzo','04':'Abril','05':'Mayo','06':'Junio','07':'Julio','08':'Agosto','09':'Septiembre','10':'Octubre','11':'Noviembre','12':'Diciembre' };
    return (meses[match[2]] || match[2]) + ' ' + match[1] + ' a ' + (meses[match[4]] || match[4]) + ' ' + match[3];
  }

  function completarNumero(numero, longitud) {
    var texto = String(Number(numero || 0));
    while (texto.length < longitud) texto = '0' + texto;
    return texto;
  }

  function fechaNumero(value) {
    var ms = new Date(value || 0).getTime();
    return isNaN(ms) ? 0 : ms;
  }

  function agregarUnico(lista, valor) {
    var limpio = limpiarTexto(valor);
    if (limpio && lista.indexOf(limpio) === -1) lista.push(limpio);
  }

  function normalizarTexto(value) { return limpiarTexto(value).toUpperCase(); }
  function limpiarTexto(value) { return String(value === undefined || value === null ? '' : value).replace(/\s+/g, ' ').trim(); }
  function limpiarSoloNumeros(value) { return String(value || '').replace(/\D/g, '').trim(); }
  function ok(data) { return { ok: true, data: data, mensaje: '' }; }
  function error(mensaje) { return { ok: false, data: null, mensaje: mensaje }; }

  window.TAEstudianteRepository = Object.freeze({
    cargarConfiguracionApp: cargarConfiguracionApp,
    buscarEstudiantePorCedula: buscarEstudiantePorCedula,
    consultarEnvio: consultarEnvio,
    consultarEstudianteCompleto: consultarEstudianteCompleto,
    guardarEnvioFinal: guardarEnvioFinal,
    actualizarRespaldoSheets: actualizarRespaldoSheets,
    registrarLogEnvio: registrarLogEnvio,
    construirTituloId: construirTituloId,
    normalizarEstudiante: normalizarEstudiante,
    construirVariantesCedula: construirVariantesCedula
  });
})();