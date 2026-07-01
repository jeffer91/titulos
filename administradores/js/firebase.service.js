/* Servicio Firebase para el módulo administradores. */
(function () {
  'use strict';

  var app = null;
  var db = null;
  var initialized = false;
  var sdkLoaded = false;

  var FIREBASE_APP_CDN = 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js';
  var FIREBASE_FIRESTORE_CDN = 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore-compat.js';
  var BATCH_LIMIT = 450;

  function iniciar(firebaseConfig) {
    return cargarSdk()
      .then(function () {
        if (!firebaseConfigValido(firebaseConfig)) {
          return {
            ok: false,
            codigo: 'FIREBASE_CONFIG_PENDIENTE',
            mensaje: 'Firebase todavía no está configurado en administradores/js/app.config.js.'
          };
        }

        try {
          if (!window.firebase.apps.length) {
            app = window.firebase.initializeApp(firebaseConfig);
          } else {
            app = window.firebase.app();
          }

          db = window.firebase.firestore();
          initialized = true;

          return {
            ok: true,
            codigo: 'FIREBASE_OK',
            mensaje: 'Firebase conectado correctamente.'
          };
        } catch (error) {
          initialized = false;
          return {
            ok: false,
            codigo: 'FIREBASE_INIT_ERROR',
            mensaje: 'No se pudo inicializar Firebase: ' + obtenerMensajeError(error)
          };
        }
      })
      .catch(function (error) {
        initialized = false;
        return {
          ok: false,
          codigo: 'FIREBASE_SDK_ERROR',
          mensaje: 'No se pudo cargar Firebase desde internet: ' + obtenerMensajeError(error)
        };
      });
  }

  function cargarSdk() {
    if (sdkLoaded && window.firebase && window.firebase.firestore) {
      return Promise.resolve();
    }

    return cargarScript(FIREBASE_APP_CDN, 'firebase-app-compat-admin')
      .then(function () {
        return cargarScript(FIREBASE_FIRESTORE_CDN, 'firebase-firestore-compat-admin');
      })
      .then(function () {
        sdkLoaded = true;
      });
  }

  function cargarScript(src, id) {
    return new Promise(function (resolve, reject) {
      var existing = document.getElementById(id);
      if (existing) {
        if (existing.dataset.loaded === 'true') {
          resolve();
          return;
        }
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }

      var script = document.createElement('script');
      script.src = src;
      script.id = id;
      script.async = false;
      script.onload = function () {
        script.dataset.loaded = 'true';
        resolve();
      };
      script.onerror = function () {
        reject(new Error('No se pudo cargar ' + src));
      };
      document.head.appendChild(script);
    });
  }

  function firebaseConfigValido(firebaseConfig) {
    return Boolean(
      firebaseConfig &&
      firebaseConfig.apiKey &&
      firebaseConfig.authDomain &&
      firebaseConfig.projectId &&
      firebaseConfig.storageBucket &&
      firebaseConfig.messagingSenderId &&
      firebaseConfig.appId &&
      firebaseConfig.apiKey !== 'COLOCA_AQUI_TU_API_KEY' &&
      firebaseConfig.projectId !== 'COLOCA_AQUI_TU_PROJECT_ID'
    );
  }

  function getDb() {
    if (!initialized || !db) throw new Error('Firebase no está inicializado.');
    return db;
  }

  function estaListo() {
    return initialized && Boolean(db);
  }

  function leerDocumento(collectionName, documentId) {
    return getDb().collection(collectionName).doc(documentId).get()
      .then(function (snapshot) {
        if (!snapshot.exists) return null;
        return normalizarDocumento(snapshot);
      });
  }

  function guardarDocumento(collectionName, documentId, data, options) {
    var merge = options && options.merge !== false;
    var payload = Object.assign({}, data || {}, {
      actualizadoEn: serverTimestamp()
    });

    if (!merge) payload.creadoEn = serverTimestamp();

    return getDb().collection(collectionName).doc(documentId).set(payload, { merge: merge });
  }

  function eliminarDocumento(collectionName, documentId) {
    return getDb().collection(collectionName).doc(documentId).delete();
  }

  function agregarDocumento(collectionName, data) {
    var payload = Object.assign({}, data || {}, {
      creadoEn: serverTimestamp(),
      actualizadoEn: serverTimestamp()
    });

    return getDb().collection(collectionName).add(payload);
  }

  function guardarLote(collectionName, documents, options) {
    var docs = Array.isArray(documents) ? documents : [];
    var merge = !options || options.merge !== false;
    var chunks = dividirEnBloques(docs, BATCH_LIMIT);
    var total = 0;

    return chunks.reduce(function (promise, chunk) {
      return promise.then(function () {
        var batch = getDb().batch();
        chunk.forEach(function (item) {
          var ref = getDb().collection(collectionName).doc(item.id);
          var payload = Object.assign({}, item.data || {}, {
            actualizadoEn: serverTimestamp()
          });
          batch.set(ref, payload, { merge: merge });
          total += 1;
        });
        return batch.commit();
      });
    }, Promise.resolve()).then(function () {
      return { total: total };
    });
  }

  function eliminarLote(collectionName, ids) {
    var docsIds = Array.isArray(ids) ? ids : [];
    var chunks = dividirEnBloques(docsIds, BATCH_LIMIT);
    var total = 0;

    return chunks.reduce(function (promise, chunk) {
      return promise.then(function () {
        var batch = getDb().batch();
        chunk.forEach(function (documentId) {
          batch.delete(getDb().collection(collectionName).doc(documentId));
          total += 1;
        });
        return batch.commit();
      });
    }, Promise.resolve()).then(function () {
      return { total: total };
    });
  }

  function listarDocumentos(collectionName, options) {
    var query = getDb().collection(collectionName);
    var opts = options || {};

    if (opts.where && opts.where.length === 3) {
      query = query.where(opts.where[0], opts.where[1], opts.where[2]);
    }

    if (opts.orderBy) {
      query = query.orderBy(opts.orderBy, opts.direction || 'asc');
    }

    if (opts.limit) {
      query = query.limit(Number(opts.limit));
    }

    return query.get().then(function (snapshot) {
      var docs = [];
      snapshot.forEach(function (doc) {
        docs.push(normalizarDocumento(doc));
      });
      return docs;
    });
  }

  function contarColeccion(collectionName, limit) {
    return getDb().collection(collectionName).limit(limit || 5).get()
      .then(function (snapshot) {
        return snapshot.size;
      });
  }

  function dividirEnBloques(items, size) {
    var chunks = [];
    for (var i = 0; i < items.length; i += size) {
      chunks.push(items.slice(i, i + size));
    }
    return chunks;
  }

  function serverTimestamp() {
    if (!window.firebase || !window.firebase.firestore) return new Date().toISOString();
    return window.firebase.firestore.FieldValue.serverTimestamp();
  }

  function normalizarDocumento(snapshot) {
    var data = snapshot.data() || {};
    data.id = snapshot.id;
    return data;
  }

  function obtenerMensajeError(error) {
    return error && error.message ? error.message : String(error || 'Error desconocido');
  }

  window.TAAdminFirebaseService = Object.freeze({
    iniciar: iniciar,
    estaListo: estaListo,
    getDb: getDb,
    leerDocumento: leerDocumento,
    guardarDocumento: guardarDocumento,
    eliminarDocumento: eliminarDocumento,
    agregarDocumento: agregarDocumento,
    guardarLote: guardarLote,
    eliminarLote: eliminarLote,
    listarDocumentos: listarDocumentos,
    contarColeccion: contarColeccion,
    serverTimestamp: serverTimestamp
  });
})();
