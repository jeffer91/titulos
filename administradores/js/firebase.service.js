/*
  Servicio Firebase del módulo administradores.
  - titulos-ec2fa: base operativa y única base con escritura.
  - utet-4387a: fuente académica de solo lectura.
*/
(function () {
  'use strict';

  var appTitulos = null;
  var appAcademico = null;
  var dbTitulos = null;
  var dbAcademico = null;
  var initialized = false;
  var sdkLoaded = false;

  var FIREBASE_APP_CDN = 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js';
  var FIREBASE_FIRESTORE_CDN = 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore-compat.js';
  var BATCH_LIMIT = 450;
  var COLECCIONES_ACADEMICAS = { Estudiante: true, matriculas: true };

  function iniciar(firebaseConfig) {
    return cargarSdk().then(function () {
      var configTitulos = firebaseConfig || window.TA_ADMIN_FIREBASE_CONFIG;
      var configAcademico = window.TA_ADMIN_ACADEMICO_FIREBASE_CONFIG;

      if (!firebaseConfigValido(configTitulos)) {
        return { ok: false, codigo: 'FIREBASE_CONFIG_PENDIENTE', mensaje: 'Firebase de Títulos no está configurado.' };
      }

      try {
        appTitulos = obtenerOCrearApp('ta-admin-titulos', configTitulos);
        dbTitulos = window.firebase.firestore(appTitulos);

        if (firebaseConfigValido(configAcademico)) {
          appAcademico = obtenerOCrearApp('ta-admin-academico', configAcademico);
          dbAcademico = window.firebase.firestore(appAcademico);
        }

        initialized = true;
        return { ok: true, codigo: 'FIREBASE_DUAL_OK', mensaje: 'Firebase de Títulos conectada y fuente académica disponible en solo lectura.' };
      } catch (error) {
        initialized = false;
        return { ok: false, codigo: 'FIREBASE_INIT_ERROR', mensaje: 'No se pudo inicializar Firebase: ' + obtenerMensajeError(error) };
      }
    }).catch(function (error) {
      initialized = false;
      return { ok: false, codigo: 'FIREBASE_SDK_ERROR', mensaje: 'No se pudo cargar Firebase desde internet: ' + obtenerMensajeError(error) };
    });
  }

  function cargarSdk() {
    if (sdkLoaded && window.firebase && window.firebase.firestore) return Promise.resolve();
    return cargarScript(FIREBASE_APP_CDN, 'firebase-app-compat-admin')
      .then(function () { return cargarScript(FIREBASE_FIRESTORE_CDN, 'firebase-firestore-compat-admin'); })
      .then(function () { sdkLoaded = true; });
  }

  function cargarScript(src, id) {
    return new Promise(function (resolve, reject) {
      var existing = document.getElementById(id);
      if (window.firebase && ((id.indexOf('firestore') === -1 && window.firebase.initializeApp) || (id.indexOf('firestore') !== -1 && window.firebase.firestore))) {
        resolve(); return;
      }
      if (existing) {
        if (existing.dataset.loaded === 'true') { resolve(); return; }
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }
      var script = document.createElement('script');
      script.src = src; script.id = id; script.async = false;
      script.onload = function () { script.dataset.loaded = 'true'; resolve(); };
      script.onerror = function () { reject(new Error('No se pudo cargar ' + src)); };
      document.head.appendChild(script);
    });
  }

  function obtenerOCrearApp(nombre, config) {
    try { return window.firebase.app(nombre); }
    catch (error) { return window.firebase.initializeApp(config, nombre); }
  }

  function firebaseConfigValido(config) {
    return Boolean(config && config.apiKey && config.authDomain && config.projectId && config.appId);
  }

  function getDb() {
    if (!initialized || !dbTitulos) throw new Error('Firebase de Títulos no está inicializado.');
    return dbTitulos;
  }

  function getDbAcademico() {
    if (!initialized || !dbAcademico) throw new Error('Firebase académico no está inicializado.');
    return dbAcademico;
  }

  function estaListo() { return initialized && Boolean(dbTitulos); }

  function leerDocumento(collectionName, documentId) {
    var db = esAcademica(collectionName) ? getDbAcademico() : getDb();
    return db.collection(collectionName).doc(documentId).get().then(function (snapshot) {
      if (!snapshot.exists) return null;
      return adaptarDocumento(collectionName, normalizarDocumento(snapshot));
    });
  }

  function guardarDocumento(collectionName, documentId, data, options) {
    rechazarEscrituraAcademica(collectionName);
    var merge = typeof options === 'boolean' ? options : (!options || options.merge !== false);
    var payload = Object.assign({}, data || {}, { actualizadoEn: serverTimestamp() });
    if (!merge) payload.creadoEn = payload.creadoEn || serverTimestamp();
    return getDb().collection(collectionName).doc(documentId).set(payload, { merge: merge });
  }

  function actualizarDocumento(collectionName, documentId, data) {
    rechazarEscrituraAcademica(collectionName);
    return getDb().collection(collectionName).doc(documentId).set(Object.assign({}, data || {}, { actualizadoEn: serverTimestamp() }), { merge: true });
  }

  function eliminarDocumento(collectionName, documentId) {
    rechazarEscrituraAcademica(collectionName);
    return getDb().collection(collectionName).doc(documentId).delete();
  }

  function agregarDocumento(collectionName, data) {
    rechazarEscrituraAcademica(collectionName);
    var payload = Object.assign({}, data || {}, { creadoEn: serverTimestamp(), actualizadoEn: serverTimestamp() });
    return getDb().collection(collectionName).add(payload);
  }

  function guardarLote(collectionName, documents, options) {
    rechazarEscrituraAcademica(collectionName);
    var docs = Array.isArray(documents) ? documents : [];
    var merge = !options || options.merge !== false;
    var chunks = dividirEnBloques(docs, BATCH_LIMIT);
    var total = 0;
    return chunks.reduce(function (promise, chunk) {
      return promise.then(function () {
        var batch = getDb().batch();
        chunk.forEach(function (item) {
          batch.set(getDb().collection(collectionName).doc(item.id), Object.assign({}, item.data || {}, { actualizadoEn: serverTimestamp() }), { merge: merge });
          total += 1;
        });
        return batch.commit();
      });
    }, Promise.resolve()).then(function () { return { total: total }; });
  }

  function eliminarLote(collectionName, ids) {
    rechazarEscrituraAcademica(collectionName);
    var chunks = dividirEnBloques(Array.isArray(ids) ? ids : [], BATCH_LIMIT);
    var total = 0;
    return chunks.reduce(function (promise, chunk) {
      return promise.then(function () {
        var batch = getDb().batch();
        chunk.forEach(function (documentId) { batch.delete(getDb().collection(collectionName).doc(documentId)); total += 1; });
        return batch.commit();
      });
    }, Promise.resolve()).then(function () { return { total: total }; });
  }

  function listarDocumentos(collectionName, options) {
    if (collectionName === 'Estudiante') return listarEstudiantesAcademicos(options);
    var db = esAcademica(collectionName) ? getDbAcademico() : getDb();
    return ejecutarListado(db, collectionName, options);
  }

  function listarColeccion(collectionName) {
    return listarDocumentos(collectionName, { limit: 5000 });
  }

  function obtenerColeccion(collectionName) { return listarColeccion(collectionName); }

  function listarDocumentosAcademico(collectionName, options) {
    if (collectionName === 'Estudiante') return listarEstudiantesAcademicos(options);
    return ejecutarListado(getDbAcademico(), collectionName, options);
  }

  function leerDocumentoAcademico(collectionName, documentId) {
    return getDbAcademico().collection(collectionName).doc(documentId).get().then(function (snapshot) {
      return snapshot.exists ? normalizarDocumento(snapshot) : null;
    });
  }

  function listarEstudiantesAcademicos(options) {
    if (!dbAcademico) return Promise.resolve([]);
    return Promise.all([
      ejecutarListadoCrudo(getDbAcademico(), 'Estudiante', { limit: 5000 }),
      ejecutarListadoCrudo(getDbAcademico(), 'matriculas', { limit: 5000 })
    ]).then(function (resultados) {
      var estudiantes = resultados[0] || [];
      var matriculas = resultados[1] || [];
      var mapa = {};
      estudiantes.forEach(function (est) {
        var cedula = String(est.cedula || est.id || '').replace(/\D/g, '');
        if (cedula) mapa[cedula] = est;
      });

      var fusionados = matriculas.filter(function (mat) {
        return mat && mat.eliminado !== true;
      }).map(function (mat) {
        var cedula = String(mat.cedula || '').replace(/\D/g, '');
        var est = mapa[cedula] || {};
        return Object.assign({}, est, mat, {
          id: mat.id || mat._docId || (mat.periodoId + '__' + cedula),
          _docId: mat.id || mat._docId || (mat.periodoId + '__' + cedula),
          cedula: cedula,
          nombres: est.nombres || mat.nombres || '',
          nombreCarrera: mat.nombreCarrera || est.nombreCarreraActual || '',
          codigoCarrera: mat.codigoCarrera || est.codigoCarreraActual || '',
          sede: mat.sede || est.sede || ''
        });
      });

      estudiantes.forEach(function (est) {
        var cedula = String(est.cedula || est.id || '').replace(/\D/g, '');
        var tieneMatricula = fusionados.some(function (item) { return item.cedula === cedula; });
        if (!tieneMatricula && est.eliminado !== true) {
          fusionados.push(Object.assign({}, est, {
            cedula: cedula,
            nombreCarrera: est.nombreCarreraActual || est.nombreCarrera || '',
            codigoCarrera: est.codigoCarreraActual || est.codigoCarrera || ''
          }));
        }
      });

      var limit = options && options.limit ? Number(options.limit) : 0;
      return limit ? fusionados.slice(0, limit) : fusionados;
    });
  }

  function ejecutarListado(db, collectionName, options) {
    return ejecutarListadoCrudo(db, collectionName, options).then(function (docs) {
      return docs.map(function (doc) { return adaptarDocumento(collectionName, doc); });
    });
  }

  function ejecutarListadoCrudo(db, collectionName, options) {
    var query = db.collection(collectionName);
    var opts = options || {};
    if (opts.where && opts.where.length === 3) query = query.where(opts.where[0], opts.where[1], opts.where[2]);
    if (opts.orderBy) query = query.orderBy(opts.orderBy, opts.direction || 'asc');
    if (opts.limit) query = query.limit(Number(opts.limit));
    return query.get().then(function (snapshot) {
      var docs = [];
      snapshot.forEach(function (doc) { docs.push(normalizarDocumento(doc)); });
      return docs;
    });
  }

  function adaptarDocumento(collectionName, data) {
    if (!data) return data;

    if (collectionName === 'envios') {
      var propuestas = Array.isArray(data.titulosEnviados) && data.titulosEnviados.length
        ? data.titulosEnviados
        : [1, 2, 3].map(function (numero) {
            var titulo = String(data['titulo' + numero] || '').trim();
            if (!titulo) return null;
            var detalle = Array.isArray(data.propuestasDetalle)
              ? data.propuestasDetalle.filter(function (p) { return Number(p.numero) === numero; })[0]
              : null;
            return Object.assign({}, detalle || {}, { numero: numero, tituloFinal: titulo, preferido: Number(data.tituloPreferidoNumero) === numero });
          }).filter(Boolean);
      var preferido = Number(data.tituloPreferidoNumero || 1);
      var preferida = propuestas.filter(function (p) { return Number(p.numero) === preferido; })[0] || propuestas[0] || {};

      return Object.assign({}, data, {
        carrera: data.carrera || data.nombreCarrera || data.carreraNombre || '',
        nombreCarrera: data.nombreCarrera || data.carreraNombre || data.carrera || '',
        codigoCarrera: data.codigoCarrera || data.carreraCodigo || '',
        periodoLabel: data.periodoLabel || data.periodoNombre || '',
        titulosEnviados: propuestas,
        tituloPreferidoTexto: data.tituloPreferidoTexto || data.tituloElegido || data.tituloCoordinador || preferida.tituloFinal || '',
        telegramUser: data.telegramUser || data.telegram || '',
        estadoCoordinador: data.estadoCoordinador || (data.validadoCoordinador ? 'VALIDADO' : (data.estado === 'DEVUELTO' && data.devueltoPor === 'COORDINADOR' ? 'DEVUELTO' : '')),
        estadoInvestigador: data.estadoInvestigador || (data.estado === 'APROBADO_FINAL' ? 'APROBADO' : '')
      });
    }

    if (collectionName === 'coordinadores') {
      var carreras = data.carreras;
      if (!Array.isArray(carreras) || !carreras.length) carreras = data.carrerasNombres || data.carrerasIds || [];
      return Object.assign({}, data, {
        carreras: carreras,
        carrerasAsignadas: data.carrerasAsignadas || (Array.isArray(carreras) ? carreras.map(function (c) { return { nombreCarrera: c, codigoCarrera: '' }; }) : []),
        activo: data.activo !== false && String(data.estado || 'ACTIVO').toUpperCase() !== 'INACTIVO'
      });
    }

    return data;
  }

  function contarColeccion(collectionName, limit) {
    var db = esAcademica(collectionName) ? getDbAcademico() : getDb();
    return db.collection(collectionName).limit(limit || 5).get().then(function (snapshot) { return snapshot.size; });
  }

  function esAcademica(collectionName) { return Boolean(COLECCIONES_ACADEMICAS[collectionName]); }

  function rechazarEscrituraAcademica(collectionName) {
    if (esAcademica(collectionName)) throw new Error('La Firebase académica es de solo lectura desde esta aplicación.');
  }

  function dividirEnBloques(items, size) {
    var chunks = [];
    for (var i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
    return chunks;
  }

  function serverTimestamp() {
    if (!window.firebase || !window.firebase.firestore) return new Date().toISOString();
    return window.firebase.firestore.FieldValue.serverTimestamp();
  }

  function normalizarDocumento(snapshot) {
    return Object.assign({}, snapshot.data() || {}, { id: snapshot.id, _docId: snapshot.id });
  }

  function obtenerMensajeError(error) { return error && error.message ? error.message : String(error || 'Error desconocido'); }

  window.TAAdminFirebaseService = Object.freeze({
    iniciar: iniciar,
    estaListo: estaListo,
    getDb: getDb,
    getDbAcademico: getDbAcademico,
    leerDocumento: leerDocumento,
    guardarDocumento: guardarDocumento,
    actualizarDocumento: actualizarDocumento,
    eliminarDocumento: eliminarDocumento,
    agregarDocumento: agregarDocumento,
    guardarLote: guardarLote,
    eliminarLote: eliminarLote,
    listarDocumentos: listarDocumentos,
    listarColeccion: listarColeccion,
    obtenerColeccion: obtenerColeccion,
    listarDocumentosAcademico: listarDocumentosAcademico,
    leerDocumentoAcademico: leerDocumentoAcademico,
    contarColeccion: contarColeccion,
    serverTimestamp: serverTimestamp
  });
})();