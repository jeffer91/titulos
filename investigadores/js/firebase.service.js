/* Backend Firebase exclusivo del módulo Investigadores. */
(function () {
  'use strict';

  var app = null;
  var db = null;
  var initialized = false;
  var sdkLoaded = false;
  var initPromise = null;
  var APP_NAME = 'ta-titulos-investigadores';

  var FIREBASE_APP_CDN = 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js';
  var FIREBASE_FIRESTORE_CDN = 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore-compat.js';

  var COLECCIONES_LECTURA = Object.freeze({
    investigadores: true,
    envios: true,
    configuracion: true,
    workflow_events: true
  });

  var COLECCIONES_ESCRITURA = Object.freeze({
    investigadores: true,
    envios: true,
    workflow_events: true
  });

  function iniciar(firebaseConfig) {
    if (initialized && db) {
      return Promise.resolve({
        ok: true,
        codigo: 'FIREBASE_INVESTIGADORES_YA_INICIADO',
        mensaje: 'Firebase de Investigadores ya estaba conectada.'
      });
    }

    if (initPromise) return initPromise;

    initPromise = cargarSdk()
      .then(function () {
        var config = firebaseConfig || window.TA_INVESTIGADORES_FIREBASE_CONFIG;

        if (!firebaseConfigValido(config)) {
          return {
            ok: false,
            codigo: 'FIREBASE_INVESTIGADORES_CONFIG_PENDIENTE',
            mensaje: 'Firebase de Investigadores no está configurada.'
          };
        }

        try {
          try {
            app = window.firebase.app(APP_NAME);
          } catch (errorApp) {
            app = window.firebase.initializeApp(config, APP_NAME);
          }

          db = window.firebase.firestore(app);
          initialized = true;

          return {
            ok: true,
            codigo: 'FIREBASE_INVESTIGADORES_OK',
            mensaje: 'Firebase de Investigadores conectada correctamente.'
          };
        } catch (error) {
          limpiarEstado();
          return {
            ok: false,
            codigo: 'FIREBASE_INVESTIGADORES_INIT_ERROR',
            mensaje: 'No se pudo inicializar Firebase de Investigadores: ' + obtenerMensajeError(error)
          };
        }
      })
      .catch(function (error) {
        limpiarEstado();
        return {
          ok: false,
          codigo: 'FIREBASE_INVESTIGADORES_SDK_ERROR',
          mensaje: 'No se pudo cargar Firebase desde internet: ' + obtenerMensajeError(error)
        };
      })
      .then(function (resultado) {
        initPromise = null;
        return resultado;
      });

    return initPromise;
  }

  function cargarSdk() {
    if (sdkLoaded && window.firebase && window.firebase.firestore) return Promise.resolve();

    return cargarScript(FIREBASE_APP_CDN, 'firebase-app-compat-investigadores')
      .then(function () {
        return cargarScript(FIREBASE_FIRESTORE_CDN, 'firebase-firestore-compat-investigadores');
      })
      .then(function () {
        sdkLoaded = true;
      });
  }

  function cargarScript(src, id) {
    return new Promise(function (resolve, reject) {
      if (window.firebase && (
        (id.indexOf('firestore') === -1 && window.firebase.initializeApp) ||
        (id.indexOf('firestore') !== -1 && window.firebase.firestore)
      )) {
        resolve();
        return;
      }

      var existing = document.getElementById(id);
      if (existing) {
        if (existing.dataset.loaded === 'true') {
          resolve();
          return;
        }
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', function () {
          reject(new Error('No se pudo cargar ' + src));
        }, { once: true });
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

  function firebaseConfigValido(config) {
    return Boolean(
      config &&
      config.apiKey &&
      config.authDomain &&
      config.projectId &&
      config.appId
    );
  }

  function estaListo() {
    return initialized && Boolean(db);
  }

  function getDb() {
    if (!initialized || !db) {
      var error = new Error('Firebase de Investigadores no está inicializada.');
      error.codigo = 'FIREBASE_INVESTIGADORES_NO_INICIALIZADO';
      throw error;
    }
    return db;
  }

  function asegurarLectura(collectionName) {
    var nombre = String(collectionName || '');

    if (!COLECCIONES_LECTURA[nombre]) {
      var error = new Error('Backend de Investigadores: la colección ' + nombre + ' no está autorizada para lectura.');
      error.codigo = 'COLECCION_NO_AUTORIZADA_INVESTIGADORES';
      error.coleccion = nombre;
      throw error;
    }
  }

  function asegurarEscritura(collectionName) {
    var nombre = String(collectionName || '');
    if(nombre==='investigadores'){
      var errorPin=new Error('Solo Administración puede modificar el registro y el PIN de un investigador.');
      errorPin.codigo='PIN_SOLO_ADMINISTRACION';
      throw errorPin;
    }

    if (!COLECCIONES_ESCRITURA[nombre]) {
      var error = new Error('Backend de Investigadores: la colección ' + nombre + ' no está autorizada para escritura.');
      error.codigo = 'ESCRITURA_NO_AUTORIZADA_INVESTIGADORES';
      error.coleccion = nombre;
      throw error;
    }
  }

  function leerDocumento(collectionName, documentId) {
    asegurarLectura(collectionName);

    return getDb().collection(collectionName).doc(String(documentId)).get()
      .then(function (snapshot) {
        return snapshot.exists ? normalizarDocumento(snapshot) : null;
      })
      .catch(function (error) {
        throw crearErrorOperacion('LEER_DOCUMENTO', collectionName, error);
      });
  }


  // Los accesos se verifican SIEMPRE con documentos confirmados por el servidor.
  // Si no hay red, no se toma una copia local como prueba de identidad.
  function leerDocumentoServidor(collectionName, documentId) {
    asegurarLectura(collectionName);
    return getDb().collection(collectionName).doc(String(documentId)).get({source:'server'})
      .then(function(snapshot){
        return snapshot.exists ? normalizarDocumento(snapshot) : null;
      }).catch(function(error){
        throw crearErrorOperacion('LEER_DOCUMENTO_SERVIDOR',collectionName,error);
      });
  }

  function buscarInvestigadoresPorCedulaServidor(cedula){
    var id=String(cedula||'').replace(/\D/g,'');
    if(!/^\d{10}$/.test(id))return Promise.reject(new Error('Cédula inválida.'));
    asegurarLectura('investigadores');
    var col=getDb().collection('investigadores');
    return Promise.all([
      col.doc(id).get({source:'server'}),
      col.where('cedula','==',id).limit(12).get({source:'server'}),
      col.where('identificacion','==',id).limit(12).get({source:'server'}),
      col.where('numeroIdentificacion','==',id).limit(12).get({source:'server'})
    ]).then(function(result){
      var mapa=Object.create(null),directo=result[0];
      if(directo.exists)mapa[directo.id]=normalizarDocumento(directo);
      result.slice(1).forEach(function(snap){
        if(snap.docs.length>=12)throw new Error('Se detectaron demasiados registros asociados a la cédula.');
        snap.forEach(function(row){mapa[row.id]=normalizarDocumento(row);});
      });
      var docs=Object.keys(mapa).map(function(k){return mapa[k];});
      if(docs.some(function(d){
        return String(d.cedula||d.identificacion||d.numeroIdentificacion||d.id).replace(/\D/g,'')!==id;
      }))throw new Error('La cédula no coincide con el registro recuperado. Solicita revisión a Administración.');
      return docs;
    }).catch(function(error){
      throw crearErrorOperacion('BUSCAR_INVESTIGADOR_CEDULA','investigadores',error);
    });
  }

  function listarDocumentosServidor(collectionName,options) {
    asegurarLectura(collectionName);
    var opts=options||{},query=getDb().collection(collectionName);
    if(opts.where&&opts.where.length===3)query=query.where(opts.where[0],opts.where[1],opts.where[2]);
    if(opts.limit)query=query.limit(Number(opts.limit));
    return query.get({source:'server'}).then(function(snapshot){
      var result=[];snapshot.forEach(function(doc){result.push(normalizarDocumento(doc));});
      return result;
    }).catch(function(error){
      throw crearErrorOperacion('LISTAR_DOCUMENTOS_SERVIDOR',collectionName,error);
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

    return query.get(opts.server ? { source: 'server' } : undefined)
      .then(function (snapshot) {
        var docs = [];
        snapshot.forEach(function (doc) {
          docs.push(normalizarDocumento(doc));
        });
        return docs;
      })
      .catch(function (error) {
        throw crearErrorOperacion('LISTAR_DOCUMENTOS', collectionName, error);
      });
  }

  function guardarDocumento(collectionName, documentId, data, options) {
    asegurarEscritura(collectionName);

    var merge = !options || options.merge !== false;
    var payload = Object.assign({}, data || {}, {
      actualizadoEn: serverTimestamp()
    });

    if (!merge && !payload.creadoEn) {
      payload.creadoEn = serverTimestamp();
    }

    return getDb().collection(collectionName).doc(String(documentId)).set(payload, { merge: merge })
      .catch(function (error) {
        throw crearErrorOperacion('GUARDAR_DOCUMENTO', collectionName, error);
      });
  }

  // Los títulos son resoluciones definitivas: lectura, validación y dos escrituras
  // en una sola transacción. Nunca volver a una escritura directa al fallar.
  function guardarRevisionAtomica(collectionName, id, cambios, evento, anterior, investigador) {
    asegurarEscritura(collectionName);
    asegurarEscritura('workflow_events');
    asegurarLectura('configuracion');
    asegurarLectura('investigadores');
    var db=getDb(), ref=db.collection(collectionName).doc(String(id));
    var registro=db.collection('workflow_events').doc();
    var perfilRef=db.collection('investigadores').doc(String(investigador&&investigador.id||''));
    var campos=['estado','estadoProceso','estadoCoordinador','estadoInvestigador','procesoCerrado',
      'investigacionRevisada','revisionCoordinador','revisionInvestigador',
      'tituloCoordinador','tituloCoordinadorNumero','tituloAdminSeleccionadoNumero',
      'tituloAdminSeleccionadoTexto','habilitadoInvestigacionPorAdmin','titulosEnviados',
      'propuestasDetalle','propuestas','titulo1','titulo2','titulo3','numeroEnvios',
      'fechaEnvio','actualizadoEnLocal','ultimaAccionAdministrativa'];
    function huella(d){return JSON.stringify(campos.map(function(c){return d&&d[c]===undefined?null:d&&d[c];}));}
    function periodo(id){
      if(id&&typeof id==='object')id=id.id||id.periodoId||'';
      var m=/^(\d{4})[-_](0?[1-9]|1[0-2])(?:__|[-_\s]+)(\d{4})[-_](0?[1-9]|1[0-2])$/.exec(String(id||'').trim());
      return m?m[1]+'-'+String(m[2]).padStart(2,'0')+'__'+m[3]+'-'+String(m[4]).padStart(2,'0'):'';
    }
    return db.runTransaction(function(tx){
      // Todas las lecturas se realizan ANTES de cualquier escritura.
      return Promise.all([tx.get(ref),tx.get(perfilRef),tx.get(db.collection('configuracion').doc('general'))])
      .then(function(snapshots){
        var snap=snapshots[0], perfil=snapshots[1], config=snapshots[2];
        if(!snap.exists)throw new Error('El expediente ya no está disponible. Actualiza la cola.');
        if(!perfil.exists||perfil.data().activo===false||perfil.data().pinActivo!==true)
          throw new Error('Tu acceso de Investigación ya no está habilitado.');
        if(!config.exists)throw new Error('No se pudo verificar el período académico.');
        var actual=snap.data()||{},previo=anterior||{};
        var estado=String(actual.estado||'').toUpperCase(),proceso=String(actual.estadoProceso||'').toUpperCase();
        var inv=String(actual.estadoInvestigador||'').toUpperCase();
        // Una ronda nueva pendiente puede tener marcas legadas de la devolucion previa.
        var coord=String(actual.estadoCoordinador||
          (actual.revisionCoordinador&&actual.revisionCoordinador.estado)||'').toUpperCase();
        var rondaVigente=/^(PENDIENTE_INVESTIGADOR|INVESTIGACION_PENDIENTE)$/.test(proceso)&&
          inv==='PENDIENTE'&&
          (['VALIDADO','APROBADO','APROBADO_CON_OBSERVACION'].includes(coord)||
           actual.validadoCoordinador===true||actual.validadoCoordinacion===true);
        if(actual.procesoCerrado===true||(actual.investigacionRevisada===true&&!rondaVigente)||
          ['APROBADO_FINAL','DEVUELTO','ARCHIVADO','BORRADOR_REINICIADO'].includes(estado)||
          ['APROBADO_FINAL','DEVUELTO','ARCHIVADO','BORRADOR_REINICIADO','PENDIENTE_COORDINADOR'].includes(proceso)||
          ['APROBADO','APROBADO_CON_OBSERVACION','DEVUELTO'].includes(inv))
          throw new Error('Este expediente ya fue resuelto o dejó de estar pendiente. Actualiza la cola.');
        if(huella(actual)!==huella(previo))
          throw new Error('El expediente cambió desde que lo abriste. Actualiza la cola antes de decidir.');
        var c=config.data()||{};
        var ids=Array.isArray(c.periodosActivos)?c.periodosActivos:
          c.periodoActivoDesactivado===true?[]:
          [c.periodoActivoId||(c.periodoActivo&&c.periodoActivo.id)||c.periodoActivo||''];
        var idPeriodo=periodo(actual.periodoCanonicoId)||periodo(actual.periodoId)||
          periodo(actual.periodo&&actual.periodo.id||actual.periodo);
        if(!idPeriodo||!ids.some(function(x){return periodo(x)===idPeriodo;}))
          throw new Error('El período académico está desactivado.');
        tx.set(ref,Object.assign({},cambios,{actualizadoEn:serverTimestamp()}),{merge:true});
        tx.set(registro,Object.assign({},evento,{creadoEn:serverTimestamp(),actualizadoEn:serverTimestamp()}));
        return true;
      });
    }).catch(function(error){
      throw crearErrorOperacion('GUARDAR_REVISION_ATOMICA',collectionName,error);
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

  function serverTimestamp() {
    if (!window.firebase || !window.firebase.firestore || !window.firebase.firestore.FieldValue) {
      return new Date().toISOString();
    }
    return window.firebase.firestore.FieldValue.serverTimestamp();
  }

  function crearErrorOperacion(operacion, collectionName, original) {
    var codigoOriginal = original && (original.code || original.codigo || original.name) || 'ERROR_FIREBASE';
    var error = new Error(
      'Investigadores · ' + operacion + ' · ' + String(collectionName || 'sin colección') +
      ': ' + obtenerMensajeError(original)
    );

    error.codigo = String(codigoOriginal);
    error.operacion = String(operacion || '');
    error.coleccion = String(collectionName || '');
    error.firebaseCode = original && original.code || '';
    error.original = original || null;
    return error;
  }

  function normalizarDocumento(snapshot) {
    return Object.assign({}, snapshot.data() || {}, {
      id: snapshot.id,
      _docId: snapshot.id
    });
  }

  function limpiarEstado() {
    initialized = false;
    app = null;
    db = null;
  }

  function obtenerMensajeError(error) {
    return error && error.message ? error.message : String(error || 'Error desconocido');
  }

  window.TAInvestigadorFirebaseService = Object.freeze({
    iniciar: iniciar,
    estaListo: estaListo,
    getDb: getDb,
    leerDocumento: leerDocumento,
    leerDocumentoServidor: leerDocumentoServidor,
    buscarInvestigadoresPorCedulaServidor: buscarInvestigadoresPorCedulaServidor,
    listarDocumentos: listarDocumentos,
    listarDocumentosServidor: listarDocumentosServidor,
    guardarDocumento: guardarDocumento,
    guardarRevisionAtomica: guardarRevisionAtomica,
    agregarDocumento: agregarDocumento,
    serverTimestamp: serverTimestamp
  });
})();