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
  var COLECCIONES_ACADEMICAS = Object.freeze({
    Estudiante: true,
    matriculas: true
  });

  var COLECCIONES_TITULOS_LECTURA = Object.freeze({
    envios: true,
    versiones_envio: true,
    configuracion: true,
    workflow_events: true,
    ia: true,
    coordinadores: true,
    investigadores: true,
    periodos: true,
    carreras: true,
    resoluciones: true
  });

  var COLECCIONES_TITULOS_ESCRITURA = Object.freeze({
    envios: true,
    versiones_envio: true,
    configuracion: true,
    workflow_events: true,
    ia: true,
    coordinadores: true,
    investigadores: true,
    periodos: true,
    carreras: true,
    resoluciones: true
  });

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
    if (window.TA_ADMIN_SEGURIDAD && window.TA_ADMIN_SEGURIDAD.habilitado === true) {
      var blocked = new Error('El modo seguro prohíbe el acceso directo a Firestore.');
      blocked.codigo = 'ADMIN_FIRESTORE_DIRECTO_BLOQUEADO';
      throw blocked;
    }
    if (!initialized || !dbTitulos) {
      var error = new Error('Firebase de Títulos del Administrador no está inicializado.');
      error.codigo = 'FIREBASE_ADMIN_TITULOS_NO_INICIALIZADO';
      throw error;
    }
    return dbTitulos;
  }

  function getDbAcademico() {
    if (window.TA_ADMIN_SEGURIDAD && window.TA_ADMIN_SEGURIDAD.habilitado === true) {
      var blocked = new Error('La base académica solo puede consultarse desde el backend autorizado.');
      blocked.codigo = 'ADMIN_ACADEMICO_DIRECTO_BLOQUEADO';
      throw blocked;
    }
    if (!initialized || !dbAcademico) {
      var error = new Error('Firebase académico del Administrador no está inicializado.');
      error.codigo = 'FIREBASE_ADMIN_ACADEMICO_NO_INICIALIZADO';
      throw error;
    }
    return dbAcademico;
  }

  function estaListo() { return initialized && Boolean(dbTitulos); }

  function asegurarLectura(collectionName) {
    var nombre = String(collectionName || '');

    if (COLECCIONES_ACADEMICAS[nombre]) return;

    if (!COLECCIONES_TITULOS_LECTURA[nombre]) {
      var error = new Error('Backend de Administrador: la colección ' + nombre + ' no está autorizada para lectura.');
      error.codigo = 'COLECCION_NO_AUTORIZADA_ADMIN';
      error.coleccion = nombre;
      throw error;
    }
  }

  function asegurarEscritura(collectionName) {
    var nombre = String(collectionName || '');

    if (COLECCIONES_ACADEMICAS[nombre]) {
      var errorAcademico = new Error('La Firebase académica es de solo lectura desde Administrador.');
      errorAcademico.codigo = 'ESCRITURA_ACADEMICA_BLOQUEADA_ADMIN';
      errorAcademico.coleccion = nombre;
      throw errorAcademico;
    }

    if (!COLECCIONES_TITULOS_ESCRITURA[nombre]) {
      var error = new Error('Backend de Administrador: la colección ' + nombre + ' no está autorizada para escritura.');
      error.codigo = 'ESCRITURA_NO_AUTORIZADA_ADMIN';
      error.coleccion = nombre;
      throw error;
    }
  }

  function leerDocumento(collectionName, documentId) {
    asegurarLectura(collectionName);
    var db = esAcademica(collectionName) ? getDbAcademico() : getDb();
    return db.collection(collectionName).doc(documentId).get().then(function (snapshot) {
      if (!snapshot.exists) return null;
      return adaptarDocumento(collectionName, normalizarDocumento(snapshot));
    }).catch(function (error) {
      throw crearErrorOperacion('LEER_DOCUMENTO', collectionName, error);
    });
  }


  // Un PIN nunca se confirma con una copia local pendiente de sincronización.
  function leerDocumentoServidor(collectionName, documentId) {
    asegurarLectura(collectionName);
    var db = esAcademica(collectionName) ? getDbAcademico() : getDb();
    return db.collection(collectionName).doc(String(documentId)).get({ source: 'server' })
      .then(function(snapshot){
        return snapshot.exists ? adaptarDocumento(collectionName, normalizarDocumento(snapshot)) : null;
      }).catch(function(error){
        throw crearErrorOperacion('LEER_DOCUMENTO_SERVIDOR', collectionName, error);
      });
  }

  function listarDocumentosServidor(collectionName, options) {
    asegurarLectura(collectionName);
    var db = esAcademica(collectionName) ? getDbAcademico() : getDb();
    var query = db.collection(collectionName);
    var opts = options || {};
    if(opts.where && opts.where.length === 3) query=query.where(opts.where[0],opts.where[1],opts.where[2]);
    if(opts.limit) query=query.limit(Number(opts.limit));
    return query.get({ source: 'server' }).then(function(snapshot){
      var result=[];
      snapshot.forEach(function(item){
        result.push(adaptarDocumento(collectionName, normalizarDocumento(item)));
      });
      return result;
    }).catch(function(error){
      throw crearErrorOperacion('LISTAR_DOCUMENTOS_SERVIDOR', collectionName, error);
    });
  }

  // Única escritura autorizada en el modo PIN heredado: operación atómica con
  // comprobación de la cédula y auditoría sin secretos. El modo seguro debe usar Auth.
  function buscarInvestigadoresPorCedulaServidor(cedula) {
    var id=String(cedula||'').replace(/\D/g,'');
    if(!/^\d{10}$/.test(id))return Promise.reject(new Error('Cédula inválida.'));
    asegurarLectura('investigadores');
    var db=getDb(),coll=db.collection('investigadores');
    return Promise.all([
      coll.doc(id).get({source:'server'}),
      coll.where('cedula','==',id).limit(12).get({source:'server'}),
      coll.where('identificacion','==',id).limit(12).get({source:'server'}),
      coll.where('numeroIdentificacion','==',id).limit(12).get({source:'server'})
    ]).then(function(snapshots){
      var mapa=Object.create(null);
      if(snapshots[0].exists)mapa[snapshots[0].id]=adaptarDocumento('investigadores',normalizarDocumento(snapshots[0]));
      snapshots.slice(1).forEach(function(result){
        if(result.docs.length>=12)throw new Error('Se detectaron demasiados registros para la cédula. Requiere auditoría.');
        result.forEach(function(item){
          mapa[item.id]=adaptarDocumento('investigadores',normalizarDocumento(item));
        });
      });
      var docs=Object.keys(mapa).map(function(idDoc){return mapa[idDoc];});
      if(docs.some(function(doc){
        return String(doc.cedula||doc.identificacion||doc.numeroIdentificacion||doc.id).replace(/\D/g,'')!==id;
      }))throw new Error('Un documento con este ID pertenece a otra cédula. Contacta a Administración.');
      return docs;
    }).catch(function(error){
      throw crearErrorOperacion('BUSCAR_INVESTIGADOR_CEDULA','investigadores',error);
    });
  }

  function guardarPinInvestigador(data) {
    var docId=String(data && data.docId || '');
    var cedula=String(data && data.cedula || '');
    var hash=String(data && data.hash || '');
    var crear=Boolean(data && data.crear);
    var esperada=data && data.revisionEsperada;
    if(!/^\d{10}$/.test(cedula) || !docId || docId.indexOf('/')!==-1 ||
      !/^[a-f0-9]{64}$/i.test(hash)) {
      return Promise.reject(new Error('Datos de PIN inválidos. No se guardó ningún cambio.'));
    }
    asegurarEscritura('investigadores');
    asegurarEscritura('workflow_events');
    var firestore=getDb();
    var ref=firestore.collection('investigadores').doc(docId);
    var momento=new Date().toISOString();
    return firestore.runTransaction(function(tx){
      return tx.get(ref).then(function(snapshot){
        var actual=snapshot.exists?snapshot.data():null;
        if(crear&&actual)throw new Error('El investigador ya tiene un documento. No se reemplazó.');
        if(!crear&&!actual)throw new Error('El documento no existe. Actualiza la lista antes de cambiar el PIN.');
        if(actual){
          var guardada=String(actual.cedula||actual.identificacion||actual.numeroIdentificacion||snapshot.id||'').replace(/\D/g,'');
          if(guardada!==cedula)throw new Error('La cédula del documento ha cambiado. No se modificó el PIN.');
        }
        var vigente=Number(actual && actual.pinRevision || 0);
        if(!crear && esperada!==undefined && esperada!==null &&
           Number(esperada)!==vigente)
          throw new Error('El PIN fue modificado por otra sesión. Actualiza la lista antes de restablecerlo.');
        var revision=vigente+1;
        var habilitado=crear || (actual&&actual.activo!==false&&actual.pinActivo!==false);
        var fields={
          cedula:cedula,
          pinHash:hash.toLowerCase(),
          pinCreado:true,
          pinActivo:habilitado,
          activo:crear?true:actual.activo!==false,
          pinHashActualizadoEn:window.firebase.firestore.FieldValue.serverTimestamp(),
          pinRevision:revision,
          pinCreadoEn:actual&&actual.pinCreadoEn||momento,
          pinActivadoEn:habilitado?momento:(actual&&actual.pinActivadoEn||null),
          pinActivadoPor:habilitado?(crear?'administrador_alta':'administrador_pin'):(actual&&actual.pinActivadoPor||''),
          pinDesactivadoEn:habilitado?null:(actual&&actual.pinDesactivadoEn||momento),
          pinVerificadoEn:momento,
          pinVerificadoPor:crear?'administrador_alta':'administrador_pin'
        };
        if(crear){
          fields.nombres=String(data.nombre||'').trim();
          fields.email=String(data.email||'').trim().toLowerCase();
          fields.rol='investigador';
          fields.origen='administrador';
          fields.creadoEn=window.firebase.firestore.FieldValue.serverTimestamp();
        }
        tx.set(ref,fields,{merge:true});
        // No escribir el PIN, ni siquiera el hash, en logs o eventos.
        var log=firestore.collection('workflow_events').doc();
        tx.set(log,{
          modulo:'administradores',tipo:crear?'ADMIN_PIN_INVESTIGADOR_ALTA':'ADMIN_PIN_INVESTIGADOR_CAMBIO',
          entidad:'investigadores',entidadId:docId,
          pinRevision:revision,fechaLocal:momento,
          actor:'administrador_legacy',creadoEn:window.firebase.firestore.FieldValue.serverTimestamp()
        });
        return {docId:docId,revision:revision,activo:fields.activo,pinActivo:fields.pinActivo};
      });
    }).catch(function(error){
      throw crearErrorOperacion('GUARDAR_PIN_TRANSACCIONAL', 'investigadores', error);
    });
  }

  function protegerCredencialesInvestigadores(nombre,data,merge) {
    if(nombre!=='investigadores')return;
    // Las credenciales SOLO pueden modificarse mediante guardarPinInvestigador,
    // con comprobación de identidad, transacción y evento de auditoría.
    if(merge===false)throw new Error('No se permite reemplazar por completo los registros de investigadores.');
    // Ningún guardado genérico cambia perfiles ni credenciales de investigadores.
    // Usar guardarPinInvestigador o cambiarAccesoInvestigador.
    throw new Error('Los investigadores solo pueden modificarse mediante operaciones transaccionales autorizadas.');
  }



  function cambiarAccesoInvestigador(data){
    var id=String(data&&data.docId||'');
    var cedula=String(data&&data.cedula||'');
    var activar=data&&data.activo;
    if(!id || id.indexOf('/')!==-1 || !/^\d{10}$/.test(cedula) || typeof activar!=='boolean')
      return Promise.reject(new Error('Datos de activación de investigador incorrectos.'));
    asegurarEscritura('investigadores');
    asegurarEscritura('workflow_events');
    var db=getDb(),ref=db.collection('investigadores').doc(id);
    var ahora=new Date().toISOString();
    return db.runTransaction(function(tx){
      return tx.get(ref).then(function(snap){
        if(!snap.exists)throw new Error('El investigador no existe. Actualiza la lista.');
        var actual=snap.data();
        var enBase=String(actual.cedula||actual.identificacion||actual.numeroIdentificacion||snap.id||'').replace(/\D/g,'');
        if(enBase!==cedula)throw new Error('La cédula del documento cambió. Acceso no modificado.');
        if(activar && (!actual.pinCreado || !actual.pinHash))
          throw new Error('No puede activar un investigador sin PIN registrado.');
        var patch={activo:activar,pinActivo:activar,
          pinDesactivadoEn:activar?null:ahora,
          pinActivadoEn:activar?ahora:(actual.pinActivadoEn||null),
          pinActivadoPor:activar?'administrador':(actual.pinActivadoPor||''),
          actualizadoEn:window.firebase.firestore.FieldValue.serverTimestamp()};
        tx.set(ref,patch,{merge:true});
        tx.set(db.collection('workflow_events').doc(),{
          modulo:'administradores',tipo:'ADMIN_CAMBIO_ACCESO_INVESTIGADOR',
          entidad:'investigadores',entidadId:id,estado:activar?'ACTIVO':'INACTIVO',
          fechaLocal:ahora,actor:'administrador_legacy',
          creadoEn:window.firebase.firestore.FieldValue.serverTimestamp()
        });
        return {id:id,activo:activar,pinActivo:activar};
      });
    }).catch(function(error){throw crearErrorOperacion('CAMBIAR_ACCESO_INVESTIGADOR','investigadores',error);});
  }

  function periodoCanonico(id){
    var m=/^(\d{4})[-_](0?[1-9]|1[0-2])(?:__|[-_\s]+)(\d{4})[-_](0?[1-9]|1[0-2])$/.exec(String(id||'').trim());
    if(!m)return '';
    return m[1]+'-'+String(m[2]).padStart(2,'0')+'__'+m[3]+'-'+String(m[4]).padStart(2,'0');
  }
  function etiquetaPeriodo(id){
    var m=/^(\d{4})-(\d{2})__(\d{4})-(\d{2})$/.exec(id);
    var meses=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    return m?meses[Number(m[2])-1]+' '+m[1]+' a '+meses[Number(m[4])-1]+' '+m[3]:'';
  }
  function periodosConfigurados(data){
    if(Array.isArray(data&&data.periodosActivos))
      return Array.from(new Set(data.periodosActivos.map(periodoCanonico).filter(Boolean)));
    if(data&&data.periodoActivoDesactivado===true)return [];
    var principal=periodoCanonico(data&&(data.periodoActivoId||
      data.periodoActivo&&data.periodoActivo.id||data.periodoActivo));
    return principal?[principal]:[];
  }
  function cambiarPeriodoActivoAtomico(periodoId,activar){
    var id=periodoCanonico(periodoId);
    if(!id||typeof activar!=='boolean')
      return Promise.reject(new Error('Período inválido: se requiere AAAA-MM__AAAA-MM.'));
    asegurarEscritura('configuracion');
    asegurarEscritura('workflow_events');
    var db=getDb(),ref=db.collection('configuracion').doc('general');
    var ahora=new Date().toISOString();
    return db.runTransaction(function(tx){
      return tx.get(ref).then(function(snapshot){
        var actual=snapshot.exists?snapshot.data():{};
        var ids=periodosConfigurados(actual);
        if(activar&&ids.indexOf(id)===-1)ids.push(id);
        if(!activar)ids=ids.filter(function(item){return item!==id;});
        if(ids.length>30)throw new Error('La lista supera el límite de 30 períodos activos.');
        var principal=ids[0]||'',label=principal?etiquetaPeriodo(principal):'';
        var data={
          periodosActivos:ids,periodosActivosLabels:ids.map(etiquetaPeriodo),
          periodoActivo:principal?{id:principal,label:label}:null,
          periodoActivoId:principal,periodoActivoLabel:label,
          periodoActivoIdNormalizado:principal?principal.replace(/[^0-9A-Za-z]+/g,'_').replace(/^_+|_+$/g,''):'',
          periodoActivoDesactivado:!principal,actualizadoEn:ahora
        };
        tx.set(ref,data,{merge:true});
        tx.set(db.collection('workflow_events').doc(),{
          tipo:'ADMIN_CAMBIO_PERIODO',modulo:'administradores',
          entidad:'configuracion',entidadId:'general',periodoId:id,
          estado:activar?'ACTIVO':'DESACTIVADO',periodosActivos:ids,
          fechaLocal:ahora,actor:'administrador_legacy',
          creadoEn:window.firebase.firestore.FieldValue.serverTimestamp()
        });
        return {periodoId:id,activo:activar,periodosActivos:ids};
      });
    }).catch(function(error){
      throw crearErrorOperacion('CAMBIAR_PERIODO_TRANSACCIONAL','configuracion',error);
    });
  }

  function guardarDocumento(collectionName, documentId, data, options) {
    asegurarEscritura(collectionName);
    var merge = typeof options === 'boolean' ? options : (!options || options.merge !== false);
    protegerCredencialesInvestigadores(collectionName,data,merge);
    var payload = Object.assign({}, data || {}, { actualizadoEn: serverTimestamp() });
    if (!merge) payload.creadoEn = payload.creadoEn || serverTimestamp();
    return getDb().collection(collectionName).doc(documentId).set(payload, { merge: merge })
      .catch(function (error) {
        throw crearErrorOperacion('GUARDAR_DOCUMENTO', collectionName, error);
      });
  }

  function actualizarDocumento(collectionName, documentId, data) {
    asegurarEscritura(collectionName);
    protegerCredencialesInvestigadores(collectionName,data,true);
    return getDb().collection(collectionName).doc(documentId).set(Object.assign({}, data || {}, { actualizadoEn: serverTimestamp() }), { merge: true })
      .catch(function (error) {
        throw crearErrorOperacion('ACTUALIZAR_DOCUMENTO', collectionName, error);
      });
  }

  function eliminarDocumento(collectionName, documentId) {
    asegurarEscritura(collectionName);
    if(collectionName==='investigadores')return Promise.reject(new Error('Los investigadores no pueden eliminarse desde el servicio genérico.'));
    return getDb().collection(collectionName).doc(documentId).delete()
      .catch(function (error) {
        throw crearErrorOperacion('ELIMINAR_DOCUMENTO', collectionName, error);
      });
  }

  function agregarDocumento(collectionName, data) {
    asegurarEscritura(collectionName);
    if(collectionName==='investigadores')
      return Promise.reject(new Error('La creación de investigadores solo se permite con guardado transaccional.'));
    var payload = Object.assign({}, data || {}, { creadoEn: serverTimestamp(), actualizadoEn: serverTimestamp() });
    return getDb().collection(collectionName).add(payload)
      .catch(function (error) {
        throw crearErrorOperacion('AGREGAR_DOCUMENTO', collectionName, error);
      });
  }

  function guardarLote(collectionName, documents, options) {
    asegurarEscritura(collectionName);
    if(collectionName==='investigadores')return Promise.reject(new Error('No se permite sobrescribir investigadores por lote.'));
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
    asegurarEscritura(collectionName);
    if(collectionName==='investigadores')
      return Promise.reject(new Error('No se puede eliminar investigadores por lote.'));
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
    asegurarLectura(collectionName);
    if (collectionName === 'Estudiante') return listarEstudiantesAcademicos(options);
    var db = esAcademica(collectionName) ? getDbAcademico() : getDb();
    return ejecutarListado(db, collectionName, options).catch(function (error) {
      throw crearErrorOperacion('LISTAR_DOCUMENTOS', collectionName, error);
    });
  }

  function listarColeccion(collectionName) {
    return listarDocumentos(collectionName, { limit: 5000 });
  }

  function obtenerColeccion(collectionName) { return listarColeccion(collectionName); }

  function listarDocumentosAcademico(collectionName, options) {
    if (!COLECCIONES_ACADEMICAS[String(collectionName || '')]) {
      var error = new Error('Backend de Administrador: ' + collectionName + ' no es una colección académica autorizada.');
      error.codigo = 'COLECCION_ACADEMICA_NO_AUTORIZADA_ADMIN';
      error.coleccion = String(collectionName || '');
      return Promise.reject(error);
    }

    if (collectionName === 'Estudiante') return listarEstudiantesAcademicos(options);
    return ejecutarListado(getDbAcademico(), collectionName, options).catch(function (error) {
      throw crearErrorOperacion('LISTAR_ACADEMICO', collectionName, error);
    });
  }

  function leerDocumentoAcademico(collectionName, documentId) {
    if (!COLECCIONES_ACADEMICAS[String(collectionName || '')]) {
      var error = new Error('Backend de Administrador: ' + collectionName + ' no es una colección académica autorizada.');
      error.codigo = 'COLECCION_ACADEMICA_NO_AUTORIZADA_ADMIN';
      error.coleccion = String(collectionName || '');
      return Promise.reject(error);
    }

    return getDbAcademico().collection(collectionName).doc(documentId).get().then(function (snapshot) {
      return snapshot.exists ? normalizarDocumento(snapshot) : null;
    }).catch(function (error) {
      throw crearErrorOperacion('LEER_ACADEMICO', collectionName, error);
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
    asegurarLectura(collectionName);
    var db = esAcademica(collectionName) ? getDbAcademico() : getDb();
    return db.collection(collectionName).limit(limit || 5).get().then(function (snapshot) {
      return snapshot.size;
    }).catch(function (error) {
      throw crearErrorOperacion('CONTAR_COLECCION', collectionName, error);
    });
  }

  function esAcademica(collectionName) { return Boolean(COLECCIONES_ACADEMICAS[collectionName]); }



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

  function crearErrorOperacion(operacion, collectionName, original) {
    var codigo = original && (original.codigo || original.code || original.name) || 'ERROR_FIREBASE_ADMIN';
    var mensaje = original && original.message ? original.message : String(original || 'Error desconocido');
    var error = new Error(
      '[' + codigo + '] Administrador · ' + String(operacion || '') +
      ' · colección ' + String(collectionName || '') + ' · ' + mensaje
    );

    error.codigo = String(codigo);
    error.operacion = String(operacion || '');
    error.coleccion = String(collectionName || '');
    error.firebaseCode = original && original.code || '';
    error.original = original || null;
    return error;
  }

  function obtenerMensajeError(error) { return error && error.message ? error.message : String(error || 'Error desconocido'); }

  window.TAAdminFirebaseService = Object.freeze({
    iniciar: iniciar,
    estaListo: estaListo,
    getDb: getDb,
    getDbAcademico: getDbAcademico,
    leerDocumento: leerDocumento,
    leerDocumentoServidor: leerDocumentoServidor,
    listarDocumentosServidor: listarDocumentosServidor,
    buscarInvestigadoresPorCedulaServidor: buscarInvestigadoresPorCedulaServidor,
    guardarPinInvestigador: guardarPinInvestigador,
    cambiarAccesoInvestigador: cambiarAccesoInvestigador,
    cambiarPeriodoActivoAtomico: cambiarPeriodoActivoAtomico,
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