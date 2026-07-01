/* Servicio Firebase para el módulo estudiantes. */
(function () {
  'use strict';

  var app = null;
  var db = null;
  var initialized = false;
  var sdkLoaded = false;

  var FIREBASE_APP_CDN = 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js';
  var FIREBASE_FIRESTORE_CDN = 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore-compat.js';

  function iniciar(firebaseConfig) {
    return cargarSdk()
      .then(function () {
        if (!firebaseConfigValido(firebaseConfig)) {
          return {
            ok: false,
            mensaje: 'Firebase todavía no está configurado en estudiantes/js/app.config.js.',
            codigo: 'FIREBASE_CONFIG_PENDIENTE'
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
            mensaje: 'Firebase conectado correctamente.',
            codigo: 'FIREBASE_OK'
          };
        } catch (error) {
          initialized = false;
          return {
            ok: false,
            mensaje: 'No se pudo inicializar Firebase: ' + obtenerMensajeError(error),
            codigo: 'FIREBASE_INIT_ERROR'
          };
        }
      })
      .catch(function (error) {
        initialized = false;
        return {
          ok: false,
          mensaje: 'No se pudo cargar Firebase desde internet: ' + obtenerMensajeError(error),
          codigo: 'FIREBASE_SDK_ERROR'
        };
      });
  }

  function cargarSdk() {
    if (sdkLoaded && window.firebase && window.firebase.firestore) {
      return Promise.resolve();
    }

    return cargarScript(FIREBASE_APP_CDN, 'firebase-app-compat')
      .then(function () {
        return cargarScript(FIREBASE_FIRESTORE_CDN, 'firebase-firestore-compat');
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
    if (!initialized || !db) {
      throw new Error('Firebase no está inicializado.');
    }
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

  function consultarPrimero(collectionName, fieldName, operator, value) {
    return getDb().collection(collectionName)
      .where(fieldName, operator, value)
      .limit(1)
      .get()
      .then(function (snapshot) {
        if (snapshot.empty) return null;
        return normalizarDocumento(snapshot.docs[0]);
      });
  }

  function guardarDocumento(collectionName, documentId, data, options) {
    var payload = agregarFechas(data || {}, options && options.merge);
    return getDb().collection(collectionName).doc(documentId).set(payload, { merge: Boolean(options && options.merge) });
  }

  function actualizarDocumento(collectionName, documentId, data) {
    var payload = Object.assign({}, data || {}, {
      actualizadoEn: window.firebase.firestore.FieldValue.serverTimestamp()
    });
    return getDb().collection(collectionName).doc(documentId).update(payload);
  }

  function agregarDocumento(collectionName, data) {
    var payload = agregarFechas(data || {}, false);
    return getDb().collection(collectionName).add(payload);
  }

  function serverTimestamp() {
    if (!window.firebase || !window.firebase.firestore) return new Date().toISOString();
    return window.firebase.firestore.FieldValue.serverTimestamp();
  }

  function agregarFechas(data, merge) {
    var payload = Object.assign({}, data, {
      actualizadoEn: serverTimestamp()
    });

    if (!merge) {
      payload.creadoEn = serverTimestamp();
    }

    return payload;
  }

  function normalizarDocumento(snapshot) {
    var data = snapshot.data() || {};
    data.id = snapshot.id;
    return data;
  }

  function obtenerMensajeError(error) {
    return error && error.message ? error.message : String(error || 'Error desconocido');
  }

  window.TAFirebaseService = Object.freeze({
    iniciar: iniciar,
    estaListo: estaListo,
    getDb: getDb,
    leerDocumento: leerDocumento,
    consultarPrimero: consultarPrimero,
    guardarDocumento: guardarDocumento,
    actualizarDocumento: actualizarDocumento,
    agregarDocumento: agregarDocumento,
    serverTimestamp: serverTimestamp
  });
})();
