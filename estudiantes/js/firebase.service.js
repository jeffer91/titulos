/*
  Servicio Firebase dual del módulo estudiantes.
  - Académico (utet-4387a): SOLO LECTURA.
  - Títulos (titulos-ec2fa): configuración, IA, envíos, historial y eventos.
*/
(function () {
  'use strict';

  var appAcademico = null;
  var appTitulos = null;
  var dbAcademico = null;
  var dbTitulos = null;
  var initialized = false;
  var loadingPromise = null;
  var initPromise = null;

  var FIREBASE_VERSION = '10.12.5';
  var FIREBASE_APP_CDN = 'https://www.gstatic.com/firebasejs/' + FIREBASE_VERSION + '/firebase-app-compat.js';
  var FIREBASE_FIRESTORE_CDN = 'https://www.gstatic.com/firebasejs/' + FIREBASE_VERSION + '/firebase-firestore-compat.js';

  function iniciar(config) {
    if (initialized && dbAcademico && dbTitulos) {
      return Promise.resolve({ ok: true, mensaje: 'Las dos Firebase ya estaban conectadas.', codigo: 'FIREBASE_YA_INICIADO' });
    }

    if (initPromise) return initPromise;

    initPromise = cargarSdk().then(function () {
      var configs = resolverConfigs(config);

      if (!firebaseConfigValido(configs.academico) || !firebaseConfigValido(configs.titulos)) {
        return { ok: false, mensaje: 'Falta la configuración de una de las dos Firebase.', codigo: 'FIREBASE_CONFIG_PENDIENTE' };
      }

      try {
        appAcademico = obtenerOCrearApp('ta-academico-estudiantes', configs.academico);
        appTitulos = obtenerOCrearApp('ta-titulos-estudiantes', configs.titulos);
        dbAcademico = window.firebase.firestore(appAcademico);
        dbTitulos = window.firebase.firestore(appTitulos);

        configurarFirestore(dbAcademico);
        configurarFirestore(dbTitulos);
        initialized = true;

        return {
          ok: true,
          mensaje: 'Firebase académico y Firebase de Títulos conectados correctamente.',
          codigo: 'FIREBASE_DUAL_OK'
        };
      } catch (error) {
        limpiarEstado();
        return { ok: false, mensaje: 'No se pudieron inicializar las Firebase: ' + obtenerMensajeError(error), codigo: 'FIREBASE_INIT_ERROR' };
      }
    }).catch(function (error) {
      limpiarEstado();
      return { ok: false, mensaje: 'No se pudo cargar Firebase desde internet: ' + obtenerMensajeError(error), codigo: 'FIREBASE_SDK_ERROR' };
    }).then(function (resultado) {
      initPromise = null;
      return resultado;
    });

    return initPromise;
  }

  function resolverConfigs(config) {
    var cfg = config || {};
    return {
      academico: cfg.academico || window.TA_ESTUDIANTES_FIREBASE_ACADEMICO_CONFIG || null,
      titulos: cfg.titulos || (cfg.projectId ? cfg : null) || window.TA_ESTUDIANTES_FIREBASE_TITULOS_CONFIG || null
    };
  }

  function cargarSdk() {
    if (firebaseSdkDisponible()) return Promise.resolve();
    if (loadingPromise) return loadingPromise;

    loadingPromise = cargarScript(FIREBASE_APP_CDN, 'firebase-app-compat')
      .then(function () { return cargarScript(FIREBASE_FIRESTORE_CDN, 'firebase-firestore-compat'); })
      .then(function () {
        if (!firebaseSdkDisponible()) throw new Error('Firebase Firestore no quedó disponible.');
      })
      .finally(function () { loadingPromise = null; });

    return loadingPromise;
  }

  function cargarScript(src, id) {
    return new Promise(function (resolve, reject) {
      var existing = document.getElementById(id);
      if (firebaseSdkYaSatisface(id)) return resolve();

      if (existing) {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', function () { reject(new Error('No se pudo cargar ' + src)); }, { once: true });
        return;
      }

      var script = document.createElement('script');
      script.src = src;
      script.id = id;
      script.async = false;
      script.onload = resolve;
      script.onerror = function () { reject(new Error('No se pudo cargar ' + src)); };
      document.head.appendChild(script);
    });
  }

  function firebaseSdkDisponible() {
    return Boolean(window.firebase && typeof window.firebase.initializeApp === 'function' && typeof window.firebase.firestore === 'function');
  }

  function firebaseSdkYaSatisface(id) {
    if (id === 'firebase-app-compat') return Boolean(window.firebase && typeof window.firebase.initializeApp === 'function');
    if (id === 'firebase-firestore-compat') return Boolean(window.firebase && typeof window.firebase.firestore === 'function');
    return false;
  }

  function obtenerOCrearApp(nombre, config) {
    try {
      return window.firebase.app(nombre);
    } catch (error) {
      return window.firebase.initializeApp(config, nombre);
    }
  }

  function configurarFirestore(db) {
    if (!db || !db.settings || db.__taSettingsApplied) return;
    try {
      db.settings({ ignoreUndefinedProperties: true, experimentalAutoDetectLongPolling: true });
      db.__taSettingsApplied = true;
    } catch (error) {
      /* La instancia pudo haberse usado antes; no bloqueamos el flujo. */
    }
  }

  function firebaseConfigValido(config) {
    return Boolean(config && config.apiKey && config.authDomain && config.projectId && config.appId);
  }

  function estaListo() { return initialized && Boolean(dbAcademico) && Boolean(dbTitulos); }

  function getDb() {
    if (!initialized || !dbTitulos) throw new Error('Firebase de Títulos no está inicializado.');
    return dbTitulos;
  }

  function getDbTitulos() { return getDb(); }

  function getDbAcademico() {
    if (!initialized || !dbAcademico) throw new Error('Firebase académico no está inicializado.');
    return dbAcademico;
  }

  /* Operaciones por defecto: SIEMPRE Firebase de Títulos. */
  function leerDocumento(collectionName, documentId) { return leerDocumentoEn(getDbTitulos(), collectionName, documentId); }
  function consultarPrimero(collectionName, fieldName, operator, value) { return consultarPrimeroEn(getDbTitulos(), collectionName, fieldName, operator, value); }
  function listarColeccion(collectionName) { return listarColeccionEn(getDbTitulos(), collectionName); }
  function consultarColeccion(collectionName, fieldName, operator, value, limit) { return consultarColeccionEn(getDbTitulos(), collectionName, fieldName, operator, value, limit); }

  /* Operaciones académicas: deliberadamente SOLO lectura. */
  function leerDocumentoAcademico(collectionName, documentId) { return leerDocumentoEn(getDbAcademico(), collectionName, documentId); }
  function consultarPrimeroAcademico(collectionName, fieldName, operator, value) { return consultarPrimeroEn(getDbAcademico(), collectionName, fieldName, operator, value); }
  function listarColeccionAcademico(collectionName) { return listarColeccionEn(getDbAcademico(), collectionName); }
  function consultarColeccionAcademico(collectionName, fieldName, operator, value, limit) { return consultarColeccionEn(getDbAcademico(), collectionName, fieldName, operator, value, limit); }

  function leerDocumentoEn(db, collectionName, documentId) {
    if (!collectionName || !documentId) return Promise.resolve(null);
    return db.collection(collectionName).doc(String(documentId)).get().then(function (snapshot) {
      return snapshot.exists ? normalizarDocumento(snapshot) : null;
    });
  }

  function consultarPrimeroEn(db, collectionName, fieldName, operator, value) {
    return consultarColeccionEn(db, collectionName, fieldName, operator, value, 1).then(function (docs) {
      return docs.length ? docs[0] : null;
    });
  }

  function consultarColeccionEn(db, collectionName, fieldName, operator, value, limit) {
    if (!collectionName || !fieldName || !operator) return Promise.resolve([]);
    var query = db.collection(collectionName).where(fieldName, operator, value);
    if (limit) query = query.limit(Number(limit));
    return query.get().then(function (snapshot) { return snapshot.docs.map(normalizarDocumento); });
  }

  function listarColeccionEn(db, collectionName) {
    if (!collectionName) return Promise.resolve([]);
    return db.collection(collectionName).get().then(function (snapshot) { return snapshot.docs.map(normalizarDocumento); });
  }

  function guardarDocumento(collectionName, documentId, data, options) {
    var merge = Boolean(options && options.merge);
    if (!collectionName || !documentId) return Promise.reject(new Error('No se pudo guardar: colección o documento inválido.'));
    return getDbTitulos().collection(collectionName).doc(String(documentId)).set(agregarFechas(data || {}, merge), { merge: merge });
  }

  function actualizarDocumento(collectionName, documentId, data) {
    if (!collectionName || !documentId) return Promise.reject(new Error('No se pudo actualizar: colección o documento inválido.'));
    return getDbTitulos().collection(collectionName).doc(String(documentId)).update(Object.assign({}, data || {}, { actualizadoEn: serverTimestamp() }));
  }

  function agregarDocumento(collectionName, data) {
    if (!collectionName) return Promise.reject(new Error('No se pudo agregar: colección inválida.'));
    return getDbTitulos().collection(collectionName).add(agregarFechas(data || {}, false));
  }

  function serverTimestamp() {
    if (!window.firebase || !window.firebase.firestore || !window.firebase.firestore.FieldValue) return new Date().toISOString();
    return window.firebase.firestore.FieldValue.serverTimestamp();
  }

  function agregarFechas(data, merge) {
    var payload = Object.assign({}, data || {}, { actualizadoEn: serverTimestamp() });
    if (!merge && !payload.creadoEn) payload.creadoEn = serverTimestamp();
    return limpiarUndefined(payload);
  }

  function limpiarUndefined(data) {
    var limpio = {};
    Object.keys(data || {}).forEach(function (key) { if (data[key] !== undefined) limpio[key] = data[key]; });
    return limpio;
  }

  function normalizarDocumento(snapshot) {
    var data = snapshot && snapshot.data ? snapshot.data() || {} : {};
    return Object.assign({}, data, { id: snapshot.id, _docId: snapshot.id });
  }

  function limpiarEstado() {
    initialized = false;
    appAcademico = null;
    appTitulos = null;
    dbAcademico = null;
    dbTitulos = null;
  }

  function obtenerMensajeError(error) { return error && error.message ? error.message : String(error || 'Error desconocido'); }

  window.TAFirebaseService = Object.freeze({
    iniciar: iniciar,
    cargarSdk: cargarSdk,
    estaListo: estaListo,
    getDb: getDb,
    getDbTitulos: getDbTitulos,
    getDbAcademico: getDbAcademico,
    leerDocumento: leerDocumento,
    consultarPrimero: consultarPrimero,
    consultarColeccion: consultarColeccion,
    listarColeccion: listarColeccion,
    leerDocumentoAcademico: leerDocumentoAcademico,
    consultarPrimeroAcademico: consultarPrimeroAcademico,
    consultarColeccionAcademico: consultarColeccionAcademico,
    listarColeccionAcademico: listarColeccionAcademico,
    guardarDocumento: guardarDocumento,
    actualizarDocumento: actualizarDocumento,
    agregarDocumento: agregarDocumento,
    serverTimestamp: serverTimestamp
  });
})();