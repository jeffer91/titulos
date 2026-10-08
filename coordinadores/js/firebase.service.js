/* Servicio Firebase para el módulo coordinadores. */
(function () {
  'use strict';

  var app = null;
  var db = null;
  var initialized = false;
  var sdkLoaded = false;
  var APP_NAME = 'ta-titulos-coordinadores';

  var COLECCIONES_LECTURA = Object.freeze({
    envios: true,
    versiones_envio: true,
    configuracion: true,
    workflow_events: true,
    coordinadores: true
  });

  var COLECCIONES_ESCRITURA = Object.freeze({
    envios: true,
    workflow_events: true
  });

  var FIREBASE_APP_CDN = 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js';
  var FIREBASE_FIRESTORE_CDN = 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore-compat.js';

  function iniciar(firebaseConfig) {
    return cargarSdk()
      .then(function () {
        if (!firebaseConfigValido(firebaseConfig)) {
          return {
            ok: false,
            codigo: 'FIREBASE_CONFIG_PENDIENTE',
            mensaje: 'Firebase todavía no está configurado en coordinadores/js/app.config.js.'
          };
        }

        try {
          try {
            app = window.firebase.app(APP_NAME);
          } catch (errorApp) {
            app = window.firebase.initializeApp(firebaseConfig, APP_NAME);
          }

          db = window.firebase.firestore(app);
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
    if (sdkLoaded && window.firebase && window.firebase.firestore) return Promise.resolve();

    return cargarScript(FIREBASE_APP_CDN, 'firebase-app-compat-coord')
      .then(function () {
        return cargarScript(FIREBASE_FIRESTORE_CDN, 'firebase-firestore-compat-coord');
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
      var error = new Error('Firebase de Coordinadores no está inicializado.');
      error.codigo = 'FIREBASE_COORDINADORES_NO_INICIALIZADO';
      throw error;
    }
    return db;
  }

  function asegurarLectura(collectionName) {
    var nombre = String(collectionName || '');
    if (!COLECCIONES_LECTURA[nombre]) {
      var error = new Error('Backend de Coordinadores: la colección ' + nombre + ' no está autorizada para lectura.');
      error.codigo = 'COLECCION_NO_AUTORIZADA_COORDINADORES';
      throw error;
    }
  }

  function asegurarEscritura(collectionName) {
    var nombre = String(collectionName || '');
    if (!COLECCIONES_ESCRITURA[nombre]) {
      var error = new Error('Backend de Coordinadores: la colección ' + nombre + ' no está autorizada para escritura.');
      error.codigo = 'ESCRITURA_NO_AUTORIZADA_COORDINADORES';
      throw error;
    }
  }

  function estaListo() {
    return initialized && Boolean(db);
  }

  function leerDocumento(collectionName, documentId) {
    asegurarLectura(collectionName);
    return getDb().collection(collectionName).doc(documentId).get()
      .then(function (snapshot) {
        if (!snapshot.exists) return null;
        return normalizarDocumento(snapshot);
      })
      .catch(function (error) {
        throw crearErrorOperacion('LEER_DOCUMENTO', collectionName, error);
      });
  }

  function guardarDocumento(collectionName, documentId, data, options) {
    asegurarEscritura(collectionName);
    var merge = !options || options.merge !== false;
    var payload = Object.assign({}, data || {}, {
      actualizadoEn: serverTimestamp()
    });

    if (!merge) payload.creadoEn = serverTimestamp();
    return getDb().collection(collectionName).doc(documentId).set(payload, { merge: merge })
      .catch(function (error) {
        throw crearErrorOperacion('GUARDAR_DOCUMENTO', collectionName, error);
      });
  }

  function agregarDocumento(collectionName, data) {
    asegurarEscritura(collectionName);
    var payload = Object.assign({}, data || {}, {
      creadoEn: serverTimestamp(),
      actualizadoEn: serverTimestamp()
    });

    return getDb().collection(collectionName).add(payload)
      .catch(function (error) {
        throw crearErrorOperacion('AGREGAR_DOCUMENTO', collectionName, error);
      });
  }

  function listarDocumentos(collectionName, options) {
    asegurarLectura(collectionName);
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
    }).catch(function (error) {
      throw crearErrorOperacion('LISTAR_DOCUMENTOS', collectionName, error);
    });
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

  function crearErrorOperacion(operacion, collectionName, original) {
    var codigoOriginal = original && (original.code || original.codigo || original.name) || 'ERROR_FIREBASE';
    var error = new Error(
      'Coordinadores · ' + operacion + ' · ' + String(collectionName || 'sin colección') +
      ': ' + obtenerMensajeError(original)
    );
    error.codigo = String(codigoOriginal);
    error.operacion = String(operacion || '');
    error.coleccion = String(collectionName || '');
    error.firebaseCode = original && original.code || '';
    error.original = original || null;
    return error;
  }

  function obtenerMensajeError(error) {
    return error && error.message ? error.message : String(error || 'Error desconocido');
  }

  window.TACoordinadorFirebaseService = Object.freeze({
    iniciar: iniciar,
    estaListo: estaListo,
    getDb: getDb,
    leerDocumento: leerDocumento,
    guardarDocumento: guardarDocumento,
    agregarDocumento: agregarDocumento,
    listarDocumentos: listarDocumentos,
    serverTimestamp: serverTimestamp
  });
})();
