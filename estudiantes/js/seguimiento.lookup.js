/*
  Consulta estable del envío actual.
  Objetivo: una ruta determinista y rápida entre la matrícula académica y envios.
  - Primero lee envios/{periodoId}__{cedula} por ID exacto.
  - Solo si NO existe ejecuta fallbacks legacy secuenciales.
  - No silencia errores de Firestore.
  - Usa una instancia Firebase independiente para la lectura pública de Títulos,
    sin long-polling experimental ni búsquedas paralelas masivas.
*/
(function () {
  'use strict';

  var base = window.TAEstudianteRepository;
  var cfg = window.TA_ESTUDIANTES_CONFIG || {};
  var firebaseCfg = window.TA_ESTUDIANTES_FIREBASE_TITULOS_CONFIG || {};
  var APP_NAME = 'ta-titulos-consulta-estable';
  var TIMEOUT_DIRECTO_MS = 3500;
  var TIMEOUT_CONFIG_MS = 1800;
  var db = null;

  if (!base || base.__consultaEstable) return;

  instalarRepositorioEstable();
  acelerarModalConsulta();

  function instalarRepositorioEstable() {
    var copia = copiar(base);
    copia.consultarEnvio = consultarEnvioEstable;
    copia.cargarConfiguracionApp = cargarConfiguracionEstable;
    copia.__consultaEstable = true;
    copia.__lookupParalelo = false;
    window.TAEstudianteRepository = Object.freeze(copia);
  }

  function obtenerDb() {
    var app;

    if (db) return db;

    if (!window.firebase || typeof window.firebase.initializeApp !== 'function' || typeof window.firebase.firestore !== 'function') {
      throw new Error('Firebase todavía no está disponible para consultar el estado del título.');
    }

    if (!firebaseCfg.apiKey || !firebaseCfg.projectId || !firebaseCfg.appId) {
      throw new Error('Falta la configuración pública de Firebase de Títulos.');
    }

    try {
      app = window.firebase.app(APP_NAME);
    } catch (error) {
      app = window.firebase.initializeApp(firebaseCfg, APP_NAME);
    }

    /* Importante: no aplicar experimentalAutoDetectLongPolling aquí. */
    db = window.firebase.firestore(app);
    return db;
  }

  function consultarEnvioEstable(periodoId, cedulaIngresada) {
    var periodo = limpiar(periodoId);
    var cedula = normalizarCedula(cedulaIngresada);
    var collectionName = (cfg.collections && cfg.collections.titulos) || 'envios';
    var idExacto;
    var inicio = Date.now();

    if (!periodo || !cedula) return Promise.resolve(null);

    idExacto = periodo + '__' + cedula;
    console.info('[Títulos] Consulta directa:', collectionName + '/' + idExacto);

    return conTimeout(
      obtenerDb().collection(collectionName).doc(idExacto).get(),
      TIMEOUT_DIRECTO_MS,
      'La base de Títulos no respondió a la consulta directa.'
    )
      .then(function (snap) {
        if (snap.exists) {
          console.info('[Títulos] Envío encontrado por ID exacto en ' + (Date.now() - inicio) + ' ms.');
          return normalizarEnvio(aDoc(snap));
        }

        console.info('[Títulos] No existe el ID exacto. Probando compatibilidad histórica.');
        return buscarLegacySecuencial(collectionName, periodo, cedula);
      })
      .catch(function (error) {
        var normalizado = normalizarErrorFirestore(error);
        console.error('[Títulos] Falló la consulta del envío:', {
          codigo: normalizado.codigo,
          mensaje: normalizado.message,
          periodoId: periodo,
          cedula: cedula,
          documento: idExacto
        });
        throw normalizado;
      });
  }

  function buscarLegacySecuencial(collectionName, periodo, cedula) {
    var col = obtenerDb().collection(collectionName);

    /* 1. Documento antiguo cuya ID era solamente la cédula. */
    return conTimeout(col.doc(cedula).get(), TIMEOUT_DIRECTO_MS, 'La base de Títulos tardó demasiado en la compatibilidad histórica.')
      .then(function (snap) {
        if (snap.exists) return normalizarEnvio(aDoc(snap));

        /* 2. Campo cedula string. */
        return conTimeout(
          col.where('cedula', '==', cedula).limit(20).get(),
          TIMEOUT_DIRECTO_MS,
          'La búsqueda histórica por cédula tardó demasiado.'
        ).then(function (querySnap) {
          var match = seleccionarPorPeriodo(querySnap.docs || [], periodo);
          if (match) return normalizarEnvio(aDoc(match));

          /* 3. Último fallback: numeroIdentificacion string. */
          return conTimeout(
            col.where('numeroIdentificacion', '==', cedula).limit(20).get(),
            TIMEOUT_DIRECTO_MS,
            'La búsqueda histórica por identificación tardó demasiado.'
          ).then(function (querySnap2) {
            var match2 = seleccionarPorPeriodo(querySnap2.docs || [], periodo);
            return match2 ? normalizarEnvio(aDoc(match2)) : null;
          });
        });
      });
  }

  function seleccionarPorPeriodo(snaps, periodo) {
    var docs = snaps || [];
    var i;
    var data;

    for (i = 0; i < docs.length; i += 1) {
      data = docs[i].data() || {};
      if (periodosEquivalentes(periodoDe(data), periodo)) return docs[i];
    }

    /* Solo para documentos realmente antiguos sin período guardado. */
    for (i = 0; i < docs.length; i += 1) {
      data = docs[i].data() || {};
      if (!periodoDe(data)) return docs[i];
    }

    return null;
  }

  function cargarConfiguracionEstable() {
    var defaults = Object.assign({}, cfg.defaultAppConfig || {});
    var collectionName = (cfg.collections && cfg.collections.config) || 'configuracion';
    var documentId = (cfg.documents && cfg.documents.appConfig) || 'general';

    return conTimeout(
      obtenerDb().collection(collectionName).doc(documentId).get(),
      TIMEOUT_CONFIG_MS,
      'La configuración tardó demasiado.'
    )
      .then(function (snap) {
        if (!snap.exists) return normalizarConfig(defaults, null, 'default-local');
        return normalizarConfig(defaults, snap.data() || {}, 'firebase-titulos');
      })
      .catch(function (error) {
        /* La configuración visual no debe bloquear una consulta académica. */
        console.warn('[Títulos] Configuración no disponible; se usarán valores locales:', obtenerMensaje(error));
        return normalizarConfig(defaults, null, 'default-local-temporal');
      });
  }

  function normalizarConfig(defaults, doc, origen) {
    var data = Object.assign({}, defaults || {}, doc || {});
    data.origen = origen;
    data.procesoActivo = doc && doc.procesoActivo !== undefined
      ? doc.procesoActivo !== false
      : !(doc && doc.enviosHabilitados === false);
    data.periodoActivoId = limpiar(
      data.periodoActivoId ||
      (data.periodoActivo && data.periodoActivo.id) ||
      (typeof data.periodoActivo === 'string' ? data.periodoActivo : '')
    );
    return data;
  }

  function acelerarModalConsulta() {
    var loading = window.TAEstudianteLoading;
    var copiaLoading;

    if (!loading || loading.__consultaRapidaModal) return;

    copiaLoading = copiar(loading);

    if (typeof loading.abrir === 'function') {
      copiaLoading.abrir = function (opciones) {
        var opts = Object.assign({}, opciones || {});
        if (opts.minVisibleMs === undefined || opts.minVisibleMs === null) opts.minVisibleMs = 150;
        return loading.abrir(opts);
      };
    }

    if (typeof loading.cerrar === 'function') {
      copiaLoading.cerrar = function () {
        return loading.cerrar({ respetarMinimo: false });
      };
    }

    copiaLoading.__consultaRapidaModal = true;
    window.TAEstudianteLoading = Object.freeze(copiaLoading);
  }

  function normalizarEnvio(data) {
    var propuestas;
    var preferido;
    var elegido;

    if (!data) return null;

    propuestas = Array.isArray(data.titulosEnviados) && data.titulosEnviados.length
      ? data.titulosEnviados.slice()
      : [1, 2, 3].map(function (numero) {
          var titulo = limpiar(data['titulo' + numero]);
          return titulo ? {
            numero: numero,
            tituloFinal: titulo,
            preferido: Number(data.tituloPreferidoNumero) === numero
          } : null;
        }).filter(Boolean);

    preferido = limpiar(data.tituloPreferidoTexto || data.tituloElegido || '');
    if (!preferido) {
      elegido = propuestas.filter(function (p) {
        return Number(p.numero) === Number(data.tituloPreferidoNumero || 1);
      })[0];
      preferido = elegido ? limpiar(elegido.tituloFinal || elegido.titulo) : '';
    }

    return Object.assign({}, data, {
      id: data.id || data._docId || '',
      cedula: normalizarCedula(data.cedula || data.numeroIdentificacion || ''),
      titulosEnviados: propuestas,
      tituloPreferidoTexto: preferido,
      intentosUsados: Number(data.intentosUsados || data.numeroEnvios || 1),
      puedeReenviar: data.puedeReenviar === true || data.permitirReenvio === true
    });
  }

  function normalizarErrorFirestore(error) {
    var codigo = limpiar(error && error.code).toLowerCase();
    var mensaje = obtenerMensaje(error);
    var salida;

    if (codigo.indexOf('permission-denied') !== -1) {
      salida = new Error('Firebase de Títulos rechazó la lectura. Revisa las reglas de Firestore de titulos-ec2fa.');
    } else if (codigo.indexOf('unavailable') !== -1 || codigo.indexOf('network') !== -1) {
      salida = new Error('Firebase de Títulos no está disponible en este momento. Verifica la conexión e intenta nuevamente.');
    } else if (mensaje.indexOf('tardó') !== -1 || mensaje.indexOf('respondió') !== -1) {
      salida = new Error(mensaje);
    } else {
      salida = new Error(mensaje || 'No se pudo consultar Firebase de Títulos.');
    }

    salida.codigo = codigo || 'consulta-titulos-error';
    salida.original = error || null;
    return salida;
  }

  function periodosEquivalentes(a, b) {
    var p1 = limpiar(a);
    var p2 = limpiar(b);
    if (!p1 || !p2) return false;
    if (p1 === p2) return true;

    /* Compatibilidad: 2026-02 frente a 2026-02__2026-08. */
    if (p1.indexOf('__') === -1 && p2.indexOf(p1 + '__') === 0) return true;
    if (p2.indexOf('__') === -1 && p1.indexOf(p2 + '__') === 0) return true;
    return false;
  }

  function periodoDe(data) {
    return limpiar(data && (
      data.periodoId ||
      data.periodoCanonicoId ||
      data.periodoID ||
      (data.periodo && data.periodo.id) ||
      ''
    ));
  }

  function aDoc(snap) {
    return Object.assign({}, snap.data() || {}, { id: snap.id, _docId: snap.id });
  }

  function conTimeout(promesa, ms, mensaje) {
    var timer;
    return Promise.race([
      Promise.resolve(promesa),
      new Promise(function (_, reject) {
        timer = window.setTimeout(function () {
          reject(new Error(mensaje || 'La consulta tardó demasiado.'));
        }, Number(ms || 0));
      })
    ]).finally(function () {
      if (timer) window.clearTimeout(timer);
    });
  }

  function copiar(obj) {
    var out = {};
    Object.keys(obj || {}).forEach(function (key) { out[key] = obj[key]; });
    return out;
  }

  function normalizarCedula(value) {
    var cedula = String(value || '').replace(/\D/g, '');
    return cedula.length === 9 ? '0' + cedula : cedula;
  }

  function limpiar(value) {
    return String(value === undefined || value === null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function obtenerMensaje(error) {
    return error && error.message ? String(error.message) : String(error || '');
  }

  window.TAConsultaTitulosEstable = Object.freeze({
    consultarEnvio: consultarEnvioEstable,
    cargarConfiguracion: cargarConfiguracionEstable,
    getDb: obtenerDb,
    version: '20261006-estable-1'
  });
})();
