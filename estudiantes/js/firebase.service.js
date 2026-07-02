/*
  Archivo: firebase.service.js
  Ruta: estudiantes/js/firebase.service.js
  Funciones principales del archivo:
  - Cargar Firebase compat de forma segura para el módulo estudiantes.
  - Evitar carga duplicada del SDK si Firebase ya existe en window.firebase.
  - Inicializar Firebase y Firestore con la configuración del proyecto.
  - Exponer helpers para leer, consultar, guardar, actualizar y agregar documentos.
  - Manejar errores claros de configuración, conexión y SDK.
*/
(function () {
  'use strict';

  var app = null;
  var db = null;
  var initialized = false;
  var sdkLoaded = false;
  var loadingPromise = null;
  var initPromise = null;

  var FIREBASE_VERSION = '10.12.5';
  var FIREBASE_APP_CDN = 'https://www.gstatic.com/firebasejs/' + FIREBASE_VERSION + '/firebase-app-compat.js';
  var FIREBASE_FIRESTORE_CDN = 'https://www.gstatic.com/firebasejs/' + FIREBASE_VERSION + '/firebase-firestore-compat.js';

  function iniciar(firebaseConfig) {
    if (initialized && db) {
      return Promise.resolve({
        ok: true,
        mensaje: 'Firebase ya estaba conectado.',
        codigo: 'FIREBASE_YA_INICIADO'
      });
    }

    if (initPromise) {
      return initPromise;
    }

    initPromise = cargarSdk()
      .then(function () {
        if (!firebaseConfigValido(firebaseConfig)) {
          initialized = false;

          return {
            ok: false,
            mensaje: 'Firebase todavía no está configurado correctamente en estudiantes/js/firebase.config.js o estudiantes/js/app.config.js.',
            codigo: 'FIREBASE_CONFIG_PENDIENTE'
          };
        }

        if (!window.firebase || !window.firebase.firestore) {
          throw new Error('El SDK de Firebase no quedó disponible en el navegador.');
        }

        try {
          app = obtenerAppFirebase(firebaseConfig);
          db = window.firebase.firestore(app);

          configurarFirestore(db);

          initialized = true;

          return {
            ok: true,
            mensaje: 'Firebase conectado correctamente.',
            codigo: 'FIREBASE_OK'
          };
        } catch (error) {
          initialized = false;
          db = null;
          app = null;

          return {
            ok: false,
            mensaje: 'No se pudo inicializar Firebase: ' + obtenerMensajeError(error),
            codigo: 'FIREBASE_INIT_ERROR'
          };
        }
      })
      .catch(function (error) {
        initialized = false;
        db = null;
        app = null;

        return {
          ok: false,
          mensaje: 'No se pudo cargar Firebase desde internet: ' + obtenerMensajeError(error),
          codigo: 'FIREBASE_SDK_ERROR'
        };
      })
      .then(function (resultado) {
        initPromise = null;
        return resultado;
      });

    return initPromise;
  }

  function cargarSdk() {
    if (firebaseSdkDisponible()) {
      sdkLoaded = true;
      return Promise.resolve();
    }

    if (loadingPromise) {
      return loadingPromise;
    }

    loadingPromise = cargarScript(FIREBASE_APP_CDN, 'firebase-app-compat')
      .then(function () {
        if (!window.firebase) {
          throw new Error('Firebase App no se cargó correctamente.');
        }

        return cargarScript(FIREBASE_FIRESTORE_CDN, 'firebase-firestore-compat');
      })
      .then(function () {
        if (!firebaseSdkDisponible()) {
          throw new Error('Firebase Firestore no se cargó correctamente.');
        }

        sdkLoaded = true;
      })
      .finally(function () {
        loadingPromise = null;
      });

    return loadingPromise;
  }

  function cargarScript(src, id) {
    return new Promise(function (resolve, reject) {
      var existing = document.getElementById(id);
      var script;

      if (firebaseSdkYaSatisface(id)) {
        resolve();
        return;
      }

      if (existing) {
        if (existing.dataset && existing.dataset.loaded === 'true') {
          resolve();
          return;
        }

        if (existing.dataset && existing.dataset.error === 'true') {
          existing.parentNode.removeChild(existing);
        } else {
          existing.addEventListener('load', function () {
            if (existing.dataset) {
              existing.dataset.loaded = 'true';
            }
            resolve();
          }, { once: true });

          existing.addEventListener('error', function () {
            if (existing.dataset) {
              existing.dataset.error = 'true';
            }
            reject(new Error('No se pudo cargar ' + src));
          }, { once: true });

          esperarScriptExistente(existing, id, resolve, reject);
          return;
        }
      }

      script = document.createElement('script');
      script.src = src;
      script.id = id;
      script.async = false;

      script.onload = function () {
        script.dataset.loaded = 'true';
        resolve();
      };

      script.onerror = function () {
        script.dataset.error = 'true';
        reject(new Error('No se pudo cargar ' + src));
      };

      document.head.appendChild(script);
    });
  }

  function esperarScriptExistente(script, id, resolve, reject) {
    var intentos = 0;
    var maxIntentos = 80;

    var timer = window.setInterval(function () {
      intentos += 1;

      if (firebaseSdkYaSatisface(id)) {
        window.clearInterval(timer);
        if (script.dataset) {
          script.dataset.loaded = 'true';
        }
        resolve();
        return;
      }

      if (script.dataset && script.dataset.error === 'true') {
        window.clearInterval(timer);
        reject(new Error('No se pudo cargar ' + script.src));
        return;
      }

      if (intentos >= maxIntentos) {
        window.clearInterval(timer);
        reject(new Error('Tiempo agotado cargando ' + script.src));
      }
    }, 100);
  }

  function firebaseSdkDisponible() {
    return Boolean(
      window.firebase &&
      typeof window.firebase.initializeApp === 'function' &&
      typeof window.firebase.firestore === 'function'
    );
  }

  function firebaseSdkYaSatisface(id) {
    if (id === 'firebase-app-compat') {
      return Boolean(window.firebase && typeof window.firebase.initializeApp === 'function');
    }

    if (id === 'firebase-firestore-compat') {
      return Boolean(window.firebase && typeof window.firebase.firestore === 'function');
    }

    return false;
  }

  function obtenerAppFirebase(firebaseConfig) {
    if (!window.firebase.apps || !window.firebase.apps.length) {
      return window.firebase.initializeApp(firebaseConfig);
    }

    try {
      return window.firebase.app();
    } catch (error) {
      return window.firebase.initializeApp(firebaseConfig);
    }
  }

  function configurarFirestore(firestoreDb) {
    if (!firestoreDb || !firestoreDb.settings || firestoreDb.__taSettingsApplied) {
      return;
    }

    try {
      firestoreDb.settings({
        ignoreUndefinedProperties: true,
        experimentalAutoDetectLongPolling: true
      });

      firestoreDb.__taSettingsApplied = true;
    } catch (error) {
      /*
        Firestore solo permite aplicar settings antes de usar la instancia.
        Si ya fue usada, no detenemos la app por esto.
      */
    }
  }

  function firebaseConfigValido(firebaseConfig) {
    return Boolean(
      firebaseConfig &&
      firebaseConfig.apiKey &&
      firebaseConfig.authDomain &&
      firebaseConfig.projectId &&
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
    if (!collectionName || !documentId) {
      return Promise.resolve(null);
    }

    return getDb()
      .collection(collectionName)
      .doc(String(documentId))
      .get()
      .then(function (snapshot) {
        if (!snapshot.exists) {
          return null;
        }

        return normalizarDocumento(snapshot);
      });
  }

  function consultarPrimero(collectionName, fieldName, operator, value) {
    if (!collectionName || !fieldName || !operator) {
      return Promise.resolve(null);
    }

    return getDb()
      .collection(collectionName)
      .where(fieldName, operator, value)
      .limit(1)
      .get()
      .then(function (snapshot) {
        if (snapshot.empty) {
          return null;
        }

        return normalizarDocumento(snapshot.docs[0]);
      });
  }

  function listarColeccion(collectionName) {
    if (!collectionName) {
      return Promise.resolve([]);
    }

    return getDb()
      .collection(collectionName)
      .get()
      .then(function (snapshot) {
        return snapshot.docs.map(normalizarDocumento);
      });
  }

  function guardarDocumento(collectionName, documentId, data, options) {
    var merge = Boolean(options && options.merge);
    var payload;

    if (!collectionName || !documentId) {
      return Promise.reject(new Error('No se pudo guardar: colección o documento inválido.'));
    }

    payload = agregarFechas(data || {}, merge);

    return getDb()
      .collection(collectionName)
      .doc(String(documentId))
      .set(payload, { merge: merge });
  }

  function actualizarDocumento(collectionName, documentId, data) {
    var payload;

    if (!collectionName || !documentId) {
      return Promise.reject(new Error('No se pudo actualizar: colección o documento inválido.'));
    }

    payload = Object.assign({}, data || {}, {
      actualizadoEn: serverTimestamp()
    });

    return getDb()
      .collection(collectionName)
      .doc(String(documentId))
      .update(payload);
  }

  function agregarDocumento(collectionName, data) {
    var payload;

    if (!collectionName) {
      return Promise.reject(new Error('No se pudo agregar: colección inválida.'));
    }

    payload = agregarFechas(data || {}, false);

    return getDb()
      .collection(collectionName)
      .add(payload);
  }

  function serverTimestamp() {
    if (!window.firebase || !window.firebase.firestore || !window.firebase.firestore.FieldValue) {
      return new Date().toISOString();
    }

    return window.firebase.firestore.FieldValue.serverTimestamp();
  }

  function agregarFechas(data, merge) {
    var payload = Object.assign({}, data || {}, {
      actualizadoEn: serverTimestamp()
    });

    if (!merge && !payload.creadoEn) {
      payload.creadoEn = serverTimestamp();
    }

    return limpiarUndefined(payload);
  }

  function limpiarUndefined(data) {
    var limpio = {};

    Object.keys(data || {}).forEach(function (key) {
      if (data[key] !== undefined) {
        limpio[key] = data[key];
      }
    });

    return limpio;
  }

  function normalizarDocumento(snapshot) {
    var data = snapshot && snapshot.data ? snapshot.data() || {} : {};
    var normalizado = Object.assign({}, data);

    normalizado.id = snapshot.id;
    normalizado._docId = snapshot.id;

    return normalizado;
  }

  function obtenerMensajeError(error) {
    if (!error) {
      return 'Error desconocido';
    }

    if (error.message) {
      return error.message;
    }

    return String(error);
  }

  window.TAFirebaseService = Object.freeze({
    iniciar: iniciar,
    cargarSdk: cargarSdk,
    estaListo: estaListo,
    getDb: getDb,
    leerDocumento: leerDocumento,
    consultarPrimero: consultarPrimero,
    listarColeccion: listarColeccion,
    guardarDocumento: guardarDocumento,
    actualizarDocumento: actualizarDocumento,
    agregarDocumento: agregarDocumento,
    serverTimestamp: serverTimestamp
  });
})();