/* Repositorio principal del panel administrador. */
(function () {
  'use strict';

  // BEGIN REGLAS_REVISION_COMUNES — mantener idénticas en ambos módulos.
  function resolverRevision(titulo) {
    var d = titulo && (titulo.raw || titulo) || {};
    function key(v) { return String(v || '').trim().toUpperCase(); }
    var estado = key(d.estado), proceso = key(d.estadoProceso);
    var coord = key(d.estadoCoordinador || (d.revisionCoordinador && d.revisionCoordinador.estado));
    var inv = key(d.estadoInvestigador || (d.revisionInvestigador && d.revisionInvestigador.estado));
    var global = [estado, proceso];
    if (global.some(function(v) { return /^(ARCHIVADO|ARCHIVADO_ADMIN|BORRADOR_REINICIADO|SIN_ENVIO|SIN_ENVIAR)$/.test(v); })) return 'SIN_ENVIO';
    if (global.indexOf('APROBADO_FINAL') !== -1 || d.procesoCerrado === true) return 'APROBADOS';
    var propuestas = [d.titulosEnviados, d.propuestas, d.propuestasDetalle].some(function(v) { return Array.isArray(v) && v.length; }) || d.titulo1 || d.titulo2 || d.titulo3;
    if (!propuestas) return 'SIN_ENVIO';
    // El reenvío explícito inicia una nueva revisión aunque conserve metadatos anteriores.
    if (/^(PENDIENTE_COORDINADOR|COORDINACION_PENDIENTE)$/.test(proceso)) return 'POR_REVISAR';
    if (/^APROBADO(?:_CON_OBSERVACION)?$/.test(inv)) return 'APROBADOS';
    if (global.some(function(v) { return /^DEVUELTO(?:_.*)?$/.test(v); }) || coord === 'DEVUELTO' || inv === 'DEVUELTO') return 'DEVUELTOS';
    if (d.investigacionRevisada === true) return 'REVISADOS';
    if (global.some(function(v) { return /^(PENDIENTE_INVESTIGADOR|INVESTIGACION_PENDIENTE|VALIDADO)$/.test(v); }) ||
        /^(VALIDADO|APROBADO|APROBADO_CON_OBSERVACION)$/.test(coord) || d.validadoCoordinador === true || d.validadoCoordinacion === true || d.coordinadorRevisado === true) return 'VALIDADOS';
    return propuestas ? 'POR_REVISAR' : 'SIN_ENVIO';
  }

  function asignacionesCoordinador(data) {
    data = data || {};
    var nombres = [], codigos = [];
    function add(v, codigo) {
      if (Array.isArray(v)) { v.forEach(function(x) { add(x, codigo); }); return; }
      if (v && typeof v === 'object') {
        add(v.nombreCarrera || v.carrera || v.nombre, false);
        add(v.codigoCarrera || v.carreraCodigo || v.codigo || v.id, true);
        return;
      }
      String(v || '').split(/[,;|]/).forEach(function(x) {
        x = x.replace(/\s+/g, ' ').trim();
        if (!x) return;
        var list = codigo || /^(carrera_|[0-9]+[a-z0-9]*_)/i.test(x) ? codigos : nombres;
        if (!list.some(function(y) { return claveCarrera(y) === claveCarrera(x); })) list.push(x);
      });
    }
    // Los campos editables por Administración son la fuente vigente, incluso vacíos.
    if (Array.isArray(data.carreras) || Array.isArray(data.carrerasAsignadas)) {
      add(data.carreras, false);
      add(data.carrerasAsignadas, false);
    } else {
      add(data.carrerasNombres, false); add(data.carrerasIds, true); add(data.carrera, false);
    }
    return { nombres: nombres, codigos: codigos };
  }

  function claveCarrera(v) {
    return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
  }
  // END REGLAS_REVISION_COMUNES

  var config = window.TA_ADMINISTRADORES_CONFIG;
  var firebaseService = window.TAAdminFirebaseService;
  var seguro = window.TAAdministradorSeguro;
  function modoSeguro(){return Boolean(seguro&&seguro.activo&&seguro.activo());}

  var estado = {
    firebaseListo: false
  };

  function iniciarFirebase() {
    if(modoSeguro())return seguro.sesion().then(function(){estado.firebaseListo=true;return true;});
    if (estado.firebaseListo) return Promise.resolve(true);

    if (!firebaseService || !firebaseService.iniciar) {
      var errorBackend = new Error('No se cargó el backend propio del Administrador.');
      errorBackend.codigo = 'BACKEND_ADMIN_NO_DISPONIBLE';
      return Promise.reject(errorBackend);
    }

    return firebaseService.iniciar(config.firebase).then(function (resultado) {
      estado.firebaseListo = Boolean(resultado && resultado.ok);

      if (!estado.firebaseListo) {
        var errorConexion = new Error(
          resultado && resultado.mensaje ? resultado.mensaje : config.textos.firebaseError
        );
        errorConexion.codigo = resultado && resultado.codigo || 'FIREBASE_ADMIN_ERROR';
        throw errorConexion;
      }

      return true;
    });
  }

  function cargarAppConfig() {
    if(modoSeguro())return seguro.config().then(prepararConfigPeriodos);
    return leerDocumento(config.collections.config, config.documents.appConfig)
      .then(function (data) {
        return prepararConfigPeriodos(data);
      });
  }

  function guardarAppConfig(data) {
    if(modoSeguro())return seguro.guardarConfig(data);
    var payload = Object.assign({}, data || {}, {
      actualizadoEn: ahoraIso()
    });

    return guardarDocumento(config.collections.config, config.documents.appConfig, payload, true);
  }

  function listarEstudiantes() {
    if(modoSeguro())return seguro.estudiantes().then(function(docs){return deduplicarEstudiantesBasico((docs||[]).map(normalizarEstudiante));});
    return listarColeccion(config.collections.estudiantes).then(function (docs) {
      return deduplicarEstudiantesBasico(docs.map(normalizarEstudiante));
    });
  }

  function listarTitulos() {
    if(modoSeguro())return seguro.envios().then(function(docs){return (docs||[]).map(normalizarTitulo);});
    return listarColeccion(config.collections.titulos).then(function (docs) {
      return docs.map(normalizarTitulo);
    });
  }

  function listarRevisionesInvestigacion() {
    if(modoSeguro())return seguro.envios().then(function(docs){
      var service=window.TARevisionReportService;
      if(!service||typeof service.normalizarLista!=='function')throw new Error('El motor de reportes no está disponible.');
      return service.normalizarLista(docs);
    });
    var reportService = window.TARevisionReportService;
    if (!reportService || typeof reportService.normalizarLista !== 'function') {
      return Promise.reject(new Error('No se cargó el motor de reportes de revisiones.'));
    }

    return listarColeccion(config.collections.titulos).then(function (docs) {
      return reportService.normalizarLista(docs || []);
    });
  }

  function listarCoordinadores() {
    if(modoSeguro())return seguro.coordinadores().then(function(docs){return docs.map(normalizarCoordinador);});
    return listarColeccion(config.collections.coordinadores).then(function (docs) {
      return docs.map(normalizarCoordinador).sort(function (a, b) {
        return a.nombre.localeCompare(b.nombre);
      });
    });
  }

  // Los IDs incompletos no son períodos. Se admiten solo rangos de dos fechas.
  function prepararConfigPeriodos(raw) {
    var datos = raw || {};
    var combinado = Object.assign({}, config.defaultAppConfig, datos);
    if (Array.isArray(datos.periodosActivos)) {
      combinado.periodosActivos = limpiarUnicos(datos.periodosActivos.map(normalizarPeriodoIdCanonico)).filter(Boolean);
    } else if (datos.periodoActivoDesactivado === true) {
      combinado.periodosActivos = [];
    } else {
      var principal = normalizarPeriodoIdCanonico(
        datos.periodoActivoId || datos.periodoActivo && datos.periodoActivo.id || datos.periodoActivo
      );
      combinado.periodosActivos = principal ? [principal] : [];
    }
    return combinado;
  }

  function listarPeriodos() {
    if(modoSeguro())return seguro.llamar('periodos').then(function(items){
      var mapa={};
      (items||[]).forEach(function(item){agregarPeriodoMapa(mapa,item.id,item.label,item.origen||'periodos');});
      var activos = construirSetCanonicamente((items||[]).filter(function(item){return item.activo;}).map(function(item){return item.id;}));
      return ordenarPeriodos(mapa,activos);
    });
    return Promise.all([
      cargarAppConfig(),
      listarEstudiantes(),
      listarTitulos(),
      listarColeccion(config.collections.periodos).catch(function () { return []; })
    ]).then(function (resultados) {
      var appConfig = resultados[0];
      var estudiantes = resultados[1];
      var titulos = resultados[2];
      var periodosColeccion = resultados[3];
      var mapa = {};

      agregarPeriodoMapa(mapa,appConfig.periodoActivoId || appConfig.periodoActivo,appConfig.periodoActivoLabel,'config');
      agregarPeriodoMapaDesdeObjeto(mapa,appConfig.periodoActivo,'config');
      (appConfig.periodosActivos||[]).forEach(function(id){
        agregarPeriodoMapa(mapa,id,'','config');
      });
      estudiantes.forEach(function(item){
        agregarPeriodoMapa(mapa,item.periodoId,item.periodoLabel,'estudiantes');
      });
      titulos.forEach(function(item){
        agregarPeriodoMapa(mapa,item.periodoId,item.periodoLabel,'titulos');
      });
      periodosColeccion.forEach(function(item){
        agregarPeriodoMapa(mapa,item.periodoId || item.id,item.label || item.nombre,'periodos');
      });
      return ordenarPeriodos(mapa,construirSetCanonicamente(appConfig.periodosActivos));
    });
  }

  function ordenarPeriodos(mapa,activos) {
    return Object.keys(mapa).map(function(id){
      var item=mapa[id];
      item.activo=Boolean(activos[id]);
      item.label=formatearPeriodoId(id);
      return item;
    }).sort(function(a,b){
      if(a.activo!==b.activo)return a.activo?-1:1;
      return a.id.localeCompare(b.id);
    });
  }

  function actualizarPeriodosActivos(periodosActivosIds) {
    var ids=limpiarUnicos((periodosActivosIds||[]).map(normalizarPeriodoIdCanonico)).filter(Boolean);
    // Operación de reemplazo explícito. Los cambios de estado individuales usan
    // transacciones por separado y NO esta función.
    var principal=ids[0]||'';
    return guardarAppConfig({
      periodoActivo:principal?{id:principal,label:formatearPeriodoId(principal)}:null,
      periodoActivoId:principal,
      periodoActivoLabel:principal?formatearPeriodoId(principal):'',
      periodoActivoIdNormalizado:principal?normalizarPeriodoId(principal):'',
      periodoActivoDesactivado:!principal,
      periodosActivos:ids,
      periodosActivosLabels:ids.map(formatearPeriodoId)
    });
  }

  function cambiarEstadoPeriodo(periodoId,activo) {
    var id=normalizarPeriodoIdCanonico(periodoId);
    if(!id)return Promise.reject(new Error('El período debe tener un ID completo: AAAA-MM__AAAA-MM.'));
    if(modoSeguro())return seguro.cambiarEstadoPeriodo(id,Boolean(activo));
    if(!firebaseService || !firebaseService.cambiarPeriodoActivoAtomico)
      return Promise.reject(new Error('No se cargó el servicio transaccional de períodos.'));
    return firebaseService.cambiarPeriodoActivoAtomico(id,Boolean(activo));
  }

  function obtenerCarreras() {
    // En modo seguro usar el mismo catálogo académico que las listas; no asumir
    // que la colección opcional de carreras de Títulos está poblada.
    if(modoSeguro())return listarEstudiantes().then(function(items){
      var mapa={};(items||[]).forEach(function(item){
        var n=item.carrera||item.nombreCarrera,k=normalizarTexto(n);
        if(k&&k!=='SIN CARRERA'&&!mapa[k])mapa[k]={nombreCarrera:n,codigoCarrera:item.codigoCarrera||''};
      });return Object.keys(mapa).map(function(k){return mapa[k];}).sort(function(a,b){return a.nombreCarrera.localeCompare(b.nombreCarrera);});
    });
    return listarEstudiantes().then(function (estudiantes) {
      var mapa = {};

      estudiantes.forEach(function (estudiante) {
        var nombre = estudiante.carrera || estudiante.nombreCarrera;
        var key = normalizarTexto(nombre);

        if (!key || key === 'SIN CARRERA') return;

        if (!mapa[key]) {
          mapa[key] = {
            nombreCarrera: nombre,
            codigoCarrera: estudiante.codigoCarrera || ''
          };
        }
      });

      return Object.keys(mapa).map(function (key) {
        return mapa[key];
      }).sort(function (a, b) {
        return a.nombreCarrera.localeCompare(b.nombreCarrera);
      });
    });
  }

  function crearCoordinador(nombre) {
    if(modoSeguro())return seguro.crearCoordinador({nombre:nombre,
      email:(document.getElementById('coordEmailSeguro')||{}).value||'',
      authUid:(document.getElementById('coordUidSeguro')||{}).value||''});
    var limpio = limpiarTexto(nombre);
    var id = generarIdDesdeNombre(limpio);

    if (!limpio) {
      return Promise.reject(new Error('Ingresa el nombre del coordinador.'));
    }

    if (!id) {
      return Promise.reject(new Error('No se pudo generar el ID del coordinador.'));
    }

    var payload = {
      id: id,
      _docId: id,
      nombre: limpio,
      activo: true,
      carreras: [],
      carrerasAsignadas: [],
      origen: 'admin',
      creadoEn: ahoraIso(),
      actualizadoEn: ahoraIso()
    };

    return guardarDocumento(config.collections.coordinadores, id, payload, true).then(function () {
      return payload;
    });
  }

  function eliminarCoordinador(coordinadorId) {
    if(modoSeguro())return seguro.coordinadorEstado({id:coordinadorId,activo:false});
    if (!coordinadorId) {
      return Promise.reject(new Error('Selecciona un coordinador.'));
    }

    return actualizarDocumento(config.collections.coordinadores, coordinadorId, {
      activo: false,
      carreras: [],
      carrerasAsignadas: [],
      carrerasNombres: [], carrerasIds: [], carrera: '',
      eliminadoEn: ahoraIso(),
      actualizadoEn: ahoraIso()
    });
  }

  function asignarCarreraACoordinador(nombreCarrera, coordinadorId) {
    if(modoSeguro())return seguro.coordinadorCarrera({id:coordinadorId,carrera:nombreCarrera,asignar:true});
    var nombre = limpiarTexto(nombreCarrera), key = claveCarrera(nombre);
    if (!key || key === 'SIN CARRERA') return Promise.reject(new Error('No se pudo identificar la carrera.'));
    return Promise.all([listarCoordinadores(), obtenerCarreras()]).then(function(resultados) {
      var coordinadores = resultados[0], catalogo = resultados[1];
      if (coordinadorId && !coordinadores.some(function(c) { return c.id === coordinadorId && c.activo; })) throw new Error('El coordinador seleccionado no está activo.');
      var codigosCarrera = [];
      catalogo.forEach(function(c) {
        if (claveCarrera(c.nombreCarrera) === key && c.codigoCarrera) codigosCarrera.push(claveCarrera(c.codigoCarrera));
      });
      coordinadores.forEach(function(c) {
        (c.raw.carrerasAsignadas || []).forEach(function(a) {
          if (a && claveCarrera(a.nombreCarrera) === key && a.codigoCarrera) codigosCarrera.push(claveCarrera(a.codigoCarrera));
        });
      });
      var cambios = coordinadores.map(function(c) {
        var actual = asignacionesCoordinador(c.raw);
        var nombres = actual.nombres.filter(function(n) { return claveCarrera(n) !== key; });
        var codigos = actual.codigos.filter(function(id) { return codigosCarrera.indexOf(claveCarrera(id)) === -1; });
        var esDestino = c.id === coordinadorId;
        if (!esDestino && nombres.length === actual.nombres.length && codigos.length === actual.codigos.length) return null;
        if (esDestino) {
          nombres.push(nombre);
          codigos = limpiarUnicos(codigos.concat(codigosCarrera));
        }
        var asignadas = nombres.map(function(n) { return {nombreCarrera:n,codigoCarrera:''}; });
        codigos.forEach(function(id) { asignadas.push({codigoCarrera:id}); });
        // Todos los formatos legados reflejan la misma asignación después de guardar.
        return {id:c.id, data:{
          carreras: nombres, carrerasNombres: nombres, carrerasAsignadas: asignadas,
          carrerasIds: codigos, carrera: nombres.join(', '), actualizadoEn: ahoraIso()
        }};
      }).filter(Boolean);
      if (!firebaseService.guardarAsignacionesCoordinadores) throw new Error('Actualiza la aplicación para guardar asignaciones de forma atómica.');
      return firebaseService.guardarAsignacionesCoordinadores(cambios);
    });
  }

  function listarEstudiantesConTitulos(periodoId) {
    return Promise.all([
      listarEstudiantes(),
      listarTitulos()
    ]).then(function (resultados) {
      var estudiantes = resultados[0];
      var titulos = resultados[1];
      var mapaTitulos = construirMapaTitulos(titulos);
      var periodoFiltro = normalizarPeriodoIdCanonico(periodoId);

      var fusionados = estudiantes.filter(function (estudiante) {
        if (!periodoFiltro) return true;
        return estudiante.periodoId === periodoFiltro;
      }).map(function (estudiante) {
        var titulo = buscarTituloParaEstudiante(mapaTitulos, estudiante.cedula, estudiante.periodoId);
        return fusionarEstudianteTitulo(estudiante, titulo);
      });

      return deduplicarEstudiantesFusionados(fusionados).sort(function (a, b) {
        return a.nombres.localeCompare(b.nombres);
      });
    });
  }

  function obtenerDetalleEstudiante(cedula, periodoId) {
    return listarEstudiantesConTitulos(periodoId).then(function (rows) {
      for (var i = 0; i < rows.length; i += 1) {
        if (rows[i].cedula === cedula) return rows[i];
      }

      return null;
    });
  }

  function archivarIntento(tituloId, motivo) {
    if(modoSeguro()) return seguro.archivar(tituloId,motivo);
    if(!tituloId) return Promise.reject(new Error('No se pudo identificar el intento.'));
    if(!firebaseService || typeof firebaseService.getDb!=='function')
      return Promise.reject(new Error('No está disponible la transacción para archivar.'));
    var db=firebaseService.getDb(),ref=db.collection(config.collections.titulos).doc(tituloId);
    return db.runTransaction(function(tx){
      return tx.get(ref).then(function(snapshot){
        if(!snapshot.exists)throw new Error('No se encontró el envío.');
        var original=Object.assign({id:tituloId},snapshot.data()||{});
        if(['ARCHIVADO','BORRADOR_REINICIADO'].indexOf(String(original.estado||'').toUpperCase())!==-1)
          throw new Error('Este intento ya está archivado.');
        var ahora=ahoraIso(),idArchivo=tituloId+'__'+Date.now();
        tx.set(db.collection(config.collections.titulosHistorial).doc(idArchivo),
          Object.assign({},original,{id:idArchivo,idOriginal:tituloId,envioId:tituloId,
            archivadoEn:ahora,motivoArchivo:motivo||'Reinicio de intento desde administración'}));
        tx.set(ref,{
          estado:'BORRADOR_REINICIADO',estadoProceso:'BORRADOR_REINICIADO',
          reiniciadoPorAdmin:true,reiniciadoEn:ahora,requiereAccionDe:'ESTUDIANTE',
          permitirReenvio:true,puedeReenviar:true,devueltoPor:'',intentosUsados:0,
          tituloPreferidoNumero:'',tituloPreferidoTexto:'',tituloElegido:'',tituloVisible:'',
          titulosEnviados:[],propuestasDetalle:[],titulo1:'',titulo2:'',titulo3:'',
          estadoCoordinador:'PENDIENTE',estadoInvestigador:'',revisionCoordinador:null,
          revisionInvestigador:null,coordinadorRevisado:false,validadoCoordinador:false,
          validadoCoordinacion:false,investigacionRevisada:false,procesoCerrado:false,
          tituloCoordinador:null,tituloFinal:null,tituloFinalInvestigacion:null,
          actualizadoEn:ahora,actualizadoEnLocal:ahora
        },{merge:true});
      });
    });
  }

  function intervenirTitulo(payload) {
    if(modoSeguro()) return window.TAAdminAccionesSeguras.decidir(payload);
    return iniciarFirebase().then(function(){
      var db=firebaseService.getDb();
      var ref=db.collection(config.collections.titulos).doc(payload.tituloId);
      var archivo=db.collection(config.collections.titulosHistorial).doc();
      return db.runTransaction(function(tx){
        return tx.get(ref).then(function(snap){
          if(!snap.exists)throw new Error('El expediente ya no existe.');
          var antes=snap.data(),ahora=ahoraIso();
          var cambios=window.TAAdminWorkflow.preparar(antes,payload,ahora);
          tx.set(archivo,Object.assign({},antes,{envioId:payload.tituloId,idOriginal:payload.tituloId,
            tipo:'INTERVENCION_ADMINISTRATIVA',archivadoEn:ahora,fechaArchivo:ahora,
            revisionAdministrativa:cambios.revisionAdministrativa}));
          tx.set(ref,cambios,{merge:true});
          return {id:payload.tituloId,estado:cambios.estado||antes.estado};
        });
      });
    }).catch(function(error){
      if(error.code==='permission-denied')throw new Error('Firebase rechazó el cambio por sus permisos. No se guardó ninguna modificación.');
      throw error;
    });
  }

  function normalizarDatosAutomaticamente() {
    if(modoSeguro())return seguro.noMigrado('normalización global de datos');
    var resultado = {
      ok: true,
      cambios: 0,
      estudiantes: 0,
      titulos: 0,
      normalizaciones: []
    };

    return cargarAppConfig()
      .then(function (appConfig) {
        return Promise.all([
          listarColeccion(config.collections.estudiantes),
          listarColeccion(config.collections.titulos)
        ]).then(function (resultados) {
          return {
            appConfig: appConfig,
            estudiantesRaw: resultados[0],
            titulosRaw: resultados[1]
          };
        });
      })
      .then(function (data) {
        var operaciones = [];

        (data.estudiantesRaw || []).forEach(function (doc) {
          var cambio = construirCambioNormalizacionEstudiante(doc);

          if (cambio) {
            resultado.cambios += 1;
            resultado.estudiantes += 1;
            resultado.normalizaciones.push(cambio.normalizacion);

            operaciones.push(
              actualizarDocumento(config.collections.estudiantes, doc._docId || doc.id, cambio.payload)
            );
          }
        });

        (data.titulosRaw || []).forEach(function (doc) {
          var cambio = construirCambioNormalizacionTitulo(doc);

          if (cambio) {
            resultado.cambios += 1;
            resultado.titulos += 1;
            resultado.normalizaciones.push(cambio.normalizacion);

            operaciones.push(
              actualizarDocumento(config.collections.titulos, doc._docId || doc.id, cambio.payload)
            );
          }
        });

        return Promise.all(operaciones).then(function () {
          return registrarNormalizacionesEnSheets(data.appConfig, resultado.normalizaciones);
        }).then(function () {
          return guardarAppConfig({
            normalizacionUltimaEjecucion: ahoraIso(),
            normalizacionUltimoResultado: 'Cambios aplicados: ' + resultado.cambios
          });
        }).then(function () {
          return resultado;
        });
      });
  }

  function construirCambioNormalizacionEstudiante(doc) {
    var source = normalizarObjeto(doc || {});
    var payload = {};
    var cambios = [];
    var periodoOriginal = valor(source, ['periodoid', 'ultimoperiodoid', 'periodo']);
    var periodoCanonico = normalizarPeriodoIdCanonico(periodoOriginal);
    var periodoLabel = periodoCanonico ? formatearPeriodoId(periodoCanonico) : '';

    var carreraOriginal = valor(source, ['nombrecarrera', 'carrera']);
    var carreraFirebase = normalizarCarreraFirebase(carreraOriginal);

    if (periodoOriginal && periodoCanonico && periodoOriginal !== periodoCanonico) {
      payload.periodoId = periodoCanonico;
      payload.periodoLabel = periodoLabel;
      cambios.push({
        campo: 'periodoId',
        original: periodoOriginal,
        normalizado: periodoCanonico
      });
    }

    if (carreraOriginal && carreraFirebase && carreraOriginal !== carreraFirebase) {
      if (doc.NombreCarrera !== undefined) payload.NombreCarrera = carreraFirebase;
      if (doc.nombreCarrera !== undefined) payload.nombreCarrera = carreraFirebase;
      if (doc.carrera !== undefined) payload.carrera = carreraFirebase;

      cambios.push({
        campo: 'carrera',
        original: carreraOriginal,
        normalizado: carreraFirebase
      });
    }

    if (!cambios.length) return null;

    payload.normalizadoEn = ahoraIso();
    payload.actualizadoEn = ahoraIso();

    return {
      payload: payload,
      normalizacion: {
        entidad: 'Estudiantes',
        campo: cambios.map(function (c) { return c.campo; }).join(', '),
        valorOriginal: cambios.map(function (c) { return c.original; }).join(' | '),
        valorNormalizado: cambios.map(function (c) { return c.normalizado; }).join(' | '),
        accion: 'NORMALIZAR_FIREBASE',
        estado: 'APLICADO',
        observacion: 'Normalización automática desde administrador',
        idRegistro: 'norm_est_' + (doc._docId || doc.id || Date.now()) + '_' + Date.now()
      }
    };
  }

  function construirCambioNormalizacionTitulo(doc) {
    var payload = {};
    var cambios = [];
    var periodoOriginal = limpiarTexto(doc.periodoId || '');
    var periodoCanonico = normalizarPeriodoIdCanonico(periodoOriginal);
    var periodoLabel = periodoCanonico ? formatearPeriodoId(periodoCanonico) : '';

    var carreraOriginal = limpiarTexto(doc.carrera || doc.nombreCarrera || '');
    var carreraFirebase = normalizarCarreraFirebase(carreraOriginal);

    if (periodoOriginal && periodoCanonico && periodoOriginal !== periodoCanonico) {
      payload.periodoId = periodoCanonico;
      payload.periodoLabel = periodoLabel;
      cambios.push({
        campo: 'periodoId',
        original: periodoOriginal,
        normalizado: periodoCanonico
      });
    }

    if (carreraOriginal && carreraFirebase && carreraOriginal !== carreraFirebase) {
      if (doc.carrera !== undefined) payload.carrera = carreraFirebase;
      if (doc.nombreCarrera !== undefined) payload.nombreCarrera = carreraFirebase;

      cambios.push({
        campo: 'carrera',
        original: carreraOriginal,
        normalizado: carreraFirebase
      });
    }

    if (!cambios.length) return null;

    payload.normalizadoEn = ahoraIso();
    payload.actualizadoEn = ahoraIso();

    return {
      payload: payload,
      normalizacion: {
        entidad: 'titulos',
        campo: cambios.map(function (c) { return c.campo; }).join(', '),
        valorOriginal: cambios.map(function (c) { return c.original; }).join(' | '),
        valorNormalizado: cambios.map(function (c) { return c.normalizado; }).join(' | '),
        accion: 'NORMALIZAR_FIREBASE',
        estado: 'APLICADO',
        observacion: 'Normalización automática desde administrador',
        idRegistro: 'norm_tit_' + (doc._docId || doc.id || Date.now()) + '_' + Date.now()
      }
    };
  }

  function registrarNormalizacionesEnSheets(appConfig, normalizaciones) {
    if (!appConfig || appConfig.sheetsActivo !== true || !appConfig.sheetsWebAppUrl || !normalizaciones.length) {
      return Promise.resolve(false);
    }

    var envios = normalizaciones.map(function (item) {
      return enviarAppsScript(appConfig.sheetsWebAppUrl, {
        token: appConfig.sheetsToken || '',
        tipo: config.respaldo.tipos.normalizacion,
        origen: appConfig.sheetsOrigen || 'titulos-app',
        fechaCliente: ahoraIso(),
        idRegistro: item.idRegistro,
        datos: Object.assign({}, item, {
          fecha: ahoraIso(),
          prueba: false
        })
      }).catch(function () {
        return null;
      });
    });

    return Promise.all(envios);
  }

  function enviarAppsScript(url, body) {
    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(body),
      redirect: 'follow'
    }).then(function (response) {
      return response.text().then(function (text) {
        try {
          return text ? JSON.parse(text) : {};
        } catch (error) {
          return {
            ok: false,
            error: 'Respuesta no válida de Apps Script'
          };
        }
      });
    });
  }

  function fusionarEstudianteTitulo(estudiante, titulo) {
    var tieneTitulo = tituloActivo(titulo);
    var estado = tieneTitulo ? clasificarEstadoTitulo(titulo) : config.estadosTitulo.sinEnviar;

    return Object.assign({}, estudiante, {
      titulo: tieneTitulo ? titulo : null,
      tituloId: tieneTitulo ? titulo.id : '',
      estado: estado,
      estadoRaw: titulo && titulo.estado ? titulo.estado : '',
      telegram: tieneTitulo ? (titulo.telegramUser || titulo.contacto && titulo.contacto.telegram || '') : '',
      telegramUser: tieneTitulo ? (titulo.telegramUser || titulo.contacto && titulo.contacto.telegram || '') : '',
      tituloPreferidoTexto: tieneTitulo ? titulo.tituloPreferidoTexto : '',
      tituloPreferidoNumero: tieneTitulo ? titulo.tituloPreferidoNumero : '',
      titulosEnviados: tieneTitulo ? titulo.titulosEnviados || [] : [],
      actualizadoEn: tieneTitulo ? titulo.actualizadoEn || titulo.actualizadoEnLocal || '' : ''
    });
  }

  function clasificarEstadoTitulo(titulo) {
    titulo = titulo || {};

    var estado = normalizarTexto(titulo.estado);
    var proceso = normalizarTexto(titulo.estadoProceso);
    var estadoCoord = normalizarTexto(titulo.estadoCoordinador || (titulo.revisionCoordinador && titulo.revisionCoordinador.estado));
    var estadoInv = normalizarTexto(titulo.estadoInvestigador || (titulo.revisionInvestigador && titulo.revisionInvestigador.estado));

    /*
      El estado global manda sobre estados parciales.
      Antes se priorizaba estadoCoordinador y un APROBADO_FINAL podía
      terminar visualizado como pendiente.
    */
    if (
      estado === 'APROBADO_FINAL' ||
      proceso === 'APROBADO_FINAL' ||
      (titulo.investigacionRevisada === true && (estadoInv === 'APROBADO' || estadoInv === 'APROBADO_CON_OBSERVACION'))
    ) {
      return config.estadosTitulo.aprobado;
    }

    if (estado === 'DEVUELTO' || proceso === 'DEVUELTO' || estadoCoord === 'DEVUELTO' || estadoInv === 'DEVUELTO') {
      return config.estadosTitulo.devuelto;
    }

    if (estado === 'BORRADOR_REINICIADO' || estado === 'ARCHIVADO' || proceso === 'ARCHIVADO') {
      return config.estadosTitulo.sinEnviar;
    }

    if (estadoInv === 'APROBADO' || estadoInv === 'APROBADO_CON_OBSERVACION') {
      return config.estadosTitulo.aprobado;
    }

    if (
      proceso === 'PENDIENTE_COORDINADOR' ||
      proceso === 'PENDIENTE_INVESTIGADOR' ||
      estado === 'PENDIENTE_REVISION' ||
      estado === 'PENDIENTE_COORDINADOR' ||
      estado === 'PENDIENTE_INVESTIGADOR'
    ) {
      return config.estadosTitulo.pendiente;
    }

    return tituloActivo(titulo) ? config.estadosTitulo.pendiente : config.estadosTitulo.sinEnviar;
  }

  function obtenerEtapaRevision(titulo) {
    var vista = resolverRevision(titulo);
    return vista === 'POR_REVISAR' ? 'COORDINACION' : vista === 'VALIDADOS' ? 'INVESTIGACION' : '';
  }

  function obtenerFaltantesRevision(periodoId) {
    var periodoFiltro = normalizarPeriodoIdCanonico(periodoId);

    return listarTitulos().then(function (titulos) {
      var coordinacion = {};
      var investigacion = {};

      (titulos || []).forEach(function (titulo) {
        if (periodoFiltro && normalizarPeriodoIdCanonico(titulo.periodoId) !== periodoFiltro) return;

        var etapa = obtenerEtapaRevision(titulo);
        if (!etapa) return;

        var carrera = normalizarCarreraVista(titulo.carrera || titulo.nombreCarrera || titulo.carreraNombre || 'Sin carrera');
        var mapa = etapa === 'INVESTIGACION' ? investigacion : coordinacion;
        var key = normalizarTexto(carrera) || 'SIN CARRERA';

        if (!mapa[key]) {
          mapa[key] = { carrera: carrera || 'Sin carrera', total: 0 };
        }

        mapa[key].total += 1;
      });

      function convertir(mapa) {
        return Object.keys(mapa).map(function (key) {
          return mapa[key];
        }).sort(function (a, b) {
          if (Number(b.total || 0) !== Number(a.total || 0)) return Number(b.total || 0) - Number(a.total || 0);
          return String(a.carrera || '').localeCompare(String(b.carrera || ''));
        });
      }

      var carrerasCoordinacion = convertir(coordinacion);
      var carrerasInvestigacion = convertir(investigacion);
      var totalCoordinacion = carrerasCoordinacion.reduce(function (suma, item) { return suma + Number(item.total || 0); }, 0);
      var totalInvestigacion = carrerasInvestigacion.reduce(function (suma, item) { return suma + Number(item.total || 0); }, 0);

      return {
        periodoId: periodoFiltro || '',
        coordinacion: {
          total: totalCoordinacion,
          carreras: carrerasCoordinacion
        },
        investigacion: {
          total: totalInvestigacion,
          carreras: carrerasInvestigacion
        },
        total: totalCoordinacion + totalInvestigacion
      };
    });
  }

  function tituloActivo(titulo) {
    if (!titulo) return false;

    var estado = normalizarTexto(titulo.estado);

    if (estado === 'ARCHIVADO' || estado === 'BORRADOR_REINICIADO') return false;

    return Array.isArray(titulo.titulosEnviados) && titulo.titulosEnviados.length > 0;
  }

  function construirMapaTitulos(titulos) {
    var mapa = {};

    titulos.forEach(function (titulo) {
      var claves = construirClavesTitulo(titulo.cedula || titulo.numeroIdentificacion, titulo.periodoId);

      claves.forEach(function (key) {
        if (!mapa[key] || compararTitulo(titulo, mapa[key]) > 0) {
          mapa[key] = titulo;
        }
      });
    });

    return mapa;
  }

  function compararTitulo(a, b) {
    var scoreA = scoreTitulo(a);
    var scoreB = scoreTitulo(b);

    if (scoreA !== scoreB) return scoreA - scoreB;

    return fechaNumero(a.actualizadoEn || a.createdAt) - fechaNumero(b.actualizadoEn || b.createdAt);
  }

  function scoreTitulo(titulo) {
    var score = 0;

    if (tituloActivo(titulo)) score += 1000;
    if (titulo && titulo.tituloPreferidoTexto) score += 50;
    if (titulo && titulo.estado) score += 10;

    return score;
  }

  function buscarTituloParaEstudiante(mapa, cedula, periodoId) {
    var claves = construirClavesTitulo(cedula, periodoId);

    for (var i = 0; i < claves.length; i += 1) {
      if (mapa[claves[i]]) return mapa[claves[i]];
    }

    return null;
  }

  function construirClavesTitulo(cedula, periodoId) {
    var variantes = construirVariantesCedula(cedula);
    var periodoCanonico = normalizarPeriodoIdCanonico(periodoId);
    var keys = [];

    variantes.forEach(function (item) {
      keys.push(String(periodoCanonico || 'SIN_PERIODO') + '__' + item);
    });

    return keys;
  }

  function normalizarEstudiante(data) {
    var source = normalizarObjeto(data || {});
    var cedula = normalizarCedula(valor(source, ['cedula', 'numeroidentificacion', 'id']) || data.id);
    var carreraOriginal = limpiarTexto(valor(source, ['nombrecarrera', 'carrera']));
    var carreraVista = normalizarCarreraVista(carreraOriginal);
    var periodoOriginal = valor(source, ['periodoid', 'ultimoperiodoid', 'periodo']);
    var periodoId = normalizarPeriodoIdCanonico(periodoOriginal);
    var periodoLabel = limpiarTexto(valor(source, ['periodolabel', 'periodonombre'])) || formatearPeriodoId(periodoId);

    return {
      id: data.id || data._docId || cedula,
      _docId: data._docId || data.id || cedula,
      cedula: cedula,
      numeroIdentificacion: cedula,
      nombres: limpiarTexto(valor(source, ['nombres', 'nombre', 'nombrecompleto'])) || 'Sin nombre',
      carrera: carreraVista,
      carreraOriginal: carreraOriginal || 'Sin carrera',
      nombreCarrera: carreraVista,
      codigoCarrera: limpiarTexto(valor(source, ['codigocarrera'])),
      periodoId: periodoId,
      periodoIdOriginal: limpiarTexto(periodoOriginal),
      periodoLabel: periodoLabel || 'Sin período',
      estadoMatricula: limpiarTexto(valor(source, ['estadomatricula', 'estado'])) || 'ACTIVO',
      sinCarrera: normalizarTexto(carreraVista) === 'SIN CARRERA',
      raw: data
    };
  }

  function normalizarTitulo(data) {
    var carreraOriginal = limpiarTexto(data.carreraNombre || data.carrera || data.nombreCarrera || '');
    var periodoId = normalizarPeriodoIdCanonico(data.periodoCanonicoId) || normalizarPeriodoIdCanonico(data.periodoId) || normalizarPeriodoIdCanonico(data.periodo);

    return Object.assign({}, data, {
      id: data.id || data._docId || '',
      _docId: data._docId || data.id || '',
      cedula: normalizarCedula(data.cedula || data.numeroIdentificacion || ''),
      periodoId: periodoId,
      periodoLabel: limpiarTexto(data.periodoLabel || '') || formatearPeriodoId(periodoId || ''),
      carrera: normalizarCarreraVista(carreraOriginal),
      carreraOriginal: carreraOriginal
    });
  }

  function normalizarCoordinador(data) {
    var asignadas = asignacionesCoordinador(data);
    var carreras = asignadas.nombres;
    var carrerasAsignadas = carreras.map(function(nombre) { return {nombreCarrera: nombre, codigoCarrera: ''}; });
    return {
      id: data.id || data._docId || '',
      _docId: data._docId || data.id || '',
      nombre: limpiarTexto(data.nombre || data.Nombres || data.id || ''),
      activo: data.activo !== false && String(data.estado || 'ACTIVO').toUpperCase() !== 'INACTIVO',
      telegram: limpiarTexto(data.telegram || data.Telegram || data.contactoTelegram || ''),
      contactoTelegram: limpiarTexto(data.contactoTelegram || data.telegram || data.Telegram || ''),
      carreras: limpiarUnicos(carreras),
      carrerasIds: asignadas.codigos,
      carrerasAsignadas: limpiarCarrerasAsignadas(carrerasAsignadas),
      raw: data
    };
  }

  function deduplicarEstudiantesBasico(estudiantes) {
    var mapa = {};
    var cedulasConPeriodo = {};

    estudiantes.forEach(function (item) {
      if (item.cedula && item.periodoId) {
        cedulasConPeriodo[item.cedula] = true;
      }
    });

    estudiantes.forEach(function (item) {
      if (item.cedula && !item.periodoId && cedulasConPeriodo[item.cedula]) return;

      var key = item.cedula + '__' + (item.periodoId || 'SIN_PERIODO');
      var actual = mapa[key];

      if (!actual || scoreEstudiante(item) > scoreEstudiante(actual)) {
        mapa[key] = item;
      }
    });

    return Object.keys(mapa).map(function (key) {
      return mapa[key];
    });
  }

  function deduplicarEstudiantesFusionados(estudiantes) {
    var mapa = {};
    var cedulasConPeriodo = {};

    estudiantes.forEach(function (item) {
      if (item.cedula && item.periodoId) {
        cedulasConPeriodo[item.cedula] = true;
      }
    });

    estudiantes.forEach(function (item) {
      if (item.cedula && !item.periodoId && cedulasConPeriodo[item.cedula]) return;

      var key = item.cedula + '__' + (item.periodoId || 'SIN_PERIODO');
      var actual = mapa[key];

      if (!actual || scoreEstudianteFusionado(item) > scoreEstudianteFusionado(actual)) {
        mapa[key] = item;
      }
    });

    return Object.keys(mapa).map(function (key) {
      return mapa[key];
    });
  }

  function scoreEstudiante(item) {
    var score = 0;

    if (item.periodoId) score += 100;
    if (item.carrera && item.carrera !== 'Sin carrera') score += 80;
    if (item.nombres && item.nombres !== 'Sin nombre') score += 40;
    if (item.cedula) score += 20;

    return score;
  }

  function scoreEstudianteFusionado(item) {
    var score = scoreEstudiante(item);

    if (item.titulo) score += 1000;
    if (item.estado === config.estadosTitulo.aprobado) score += 300;
    if (item.estado === config.estadosTitulo.devuelto) score += 200;
    if (item.estado === config.estadosTitulo.pendiente) score += 100;

    return score;
  }

  function listarColeccion(nombre) {
    if(modoSeguro())return seguro.noMigrado('lectura directa '+nombre);
    if (firebaseService && firebaseService.listarColeccion) {
      return firebaseService.listarColeccion(nombre).then(normalizarListaDocumentos);
    }

    if (firebaseService && firebaseService.obtenerColeccion) {
      return firebaseService.obtenerColeccion(nombre).then(normalizarListaDocumentos);
    }

    if (window.firebase && window.firebase.firestore) {
      return window.firebase.firestore().collection(nombre).get().then(function (snapshot) {
        return snapshot.docs.map(function (doc) {
          return Object.assign({ id: doc.id, _docId: doc.id }, doc.data() || {});
        });
      });
    }

    return Promise.reject(new Error('No se pudo listar la colección ' + nombre + '.'));
  }

  function leerDocumento(coleccion, id) {
    if(modoSeguro())return seguro.noMigrado('lectura directa '+coleccion);
    if (firebaseService && firebaseService.leerDocumento) {
      return firebaseService.leerDocumento(coleccion, id);
    }

    if (window.firebase && window.firebase.firestore) {
      return window.firebase.firestore().collection(coleccion).doc(id).get().then(function (doc) {
        if (!doc.exists) return null;
        return Object.assign({ id: doc.id, _docId: doc.id }, doc.data() || {});
      });
    }

    return Promise.reject(new Error('No se pudo leer el documento.'));
  }

  function guardarDocumento(coleccion, id, data, merge) {
    if(modoSeguro())return seguro.noMigrado('escritura directa '+coleccion);
    if (firebaseService && firebaseService.guardarDocumento) {
      return firebaseService.guardarDocumento(coleccion, id, data, merge);
    }

    if (window.firebase && window.firebase.firestore) {
      return window.firebase.firestore().collection(coleccion).doc(id).set(data, { merge: Boolean(merge) });
    }

    return Promise.reject(new Error('No se pudo guardar el documento.'));
  }

  function actualizarDocumento(coleccion, id, data) {
    if(modoSeguro())return seguro.noMigrado('actualización directa '+coleccion);
    if (!id) return Promise.resolve(false);

    if (firebaseService && firebaseService.actualizarDocumento) {
      return firebaseService.actualizarDocumento(coleccion, id, data);
    }

    if (window.firebase && window.firebase.firestore) {
      return window.firebase.firestore().collection(coleccion).doc(id).set(data, { merge: true });
    }

    return Promise.reject(new Error('No se pudo actualizar el documento.'));
  }

  function normalizarListaDocumentos(lista) {
    if (!Array.isArray(lista)) return [];

    return lista.map(function (item) {
      return Object.assign({}, item, {
        id: item.id || item._docId || '',
        _docId: item._docId || item.id || ''
      });
    });
  }

  function agregarPeriodoMapa(mapa, periodoId, label, origen) {
    var id=normalizarPeriodoIdCanonico(periodoId);
    if(!id)return; // No inventar rangos desde IDs como 2026-02.
    if(!mapa[id])mapa[id]={
      id:id,label:formatearPeriodoId(id),origen:origen||'detectado',activo:false
    };
    else if(origen && mapa[id].origen.indexOf(origen)===-1)mapa[id].origen+=', '+origen;
  }

  function agregarPeriodoMapaDesdeObjeto(mapa, periodo, origen) {
    if (!periodo || typeof periodo !== 'object') return;
    agregarPeriodoMapa(mapa, periodo.id || periodo.periodoId, periodo.label || periodo.periodoLabel, origen);
  }

  function normalizarPeriodoIdCanonico(periodoId) {
    if(periodoId && typeof periodoId==='object')periodoId=periodoId.id || periodoId.periodoId;
    var texto=limpiarTexto(periodoId);
    var match=/^(\d{4})[-_](0?[1-9]|1[0-2])(?:__|[-_\s]+)(\d{4})[-_](0?[1-9]|1[0-2])$/.exec(texto);
    if(!match)return '';
    return match[1]+'-'+completarMes(match[2])+'__'+match[3]+'-'+completarMes(match[4]);
  }

  function formatearPeriodoId(periodoId) {
    var texto = normalizarPeriodoIdCanonico(periodoId);

    if (!texto) return 'Sin período';

    var match = texto.match(/(\d{4})-(\d{2})__(\d{4})-(\d{2})/);

    if (!match) return texto;

    return nombreMes(match[2]) + ' ' + match[1] + ' a ' + nombreMes(match[4]) + ' ' + match[3];
  }

  function nombreMes(mes) {
    var mapa = {
      '01': 'Enero',
      '02': 'Febrero',
      '03': 'Marzo',
      '04': 'Abril',
      '05': 'Mayo',
      '06': 'Junio',
      '07': 'Julio',
      '08': 'Agosto',
      '09': 'Septiembre',
      '10': 'Octubre',
      '11': 'Noviembre',
      '12': 'Diciembre'
    };

    return mapa[String(mes)] || String(mes);
  }

  function completarMes(mes) {
    var numero = String(mes || '').replace(/\D/g, '');
    if (numero.length === 1) return '0' + numero;
    return numero;
  }

  function normalizarPeriodoId(periodoId) {
    return limpiarTexto(periodoId).replace(/[^0-9A-Za-z]+/g, '_').replace(/^_+|_+$/g, '');
  }

  function normalizarCarreraVista(value) {
    var original = limpiarTexto(value);

    if (!original) return 'Sin carrera';

    var upper = limpiarMojibake(original).toUpperCase();
    var key = normalizarTexto(upper);

    if (key === 'INDUS') return 'INDUSTRIAL';
    if (key === 'SIN CARRERA') return 'Sin carrera';

    if (key.indexOf('UNIVERSITARIA EN') === 0) {
      return corregirUniversitaria(upper);
    }

    if (config.normalizacion && config.normalizacion.agruparOnlineVista === true) {
      upper = upper.replace(/\s+ONLINE$/i, '');
      key = normalizarTexto(upper);
    }

    var alias = {
      'ADMINISTRACION': 'ADMINISTRACION',
      'CONTABILIDAD': 'CONTABILIDAD',
      'DESARROLLO DE SOFTWARE': 'DESARROLLO DE SOFTWARE',
      'DISENO MULTIMEDIA': 'DISEÑO MULTIMEDIA',
      'EDUCACION BASICA': 'EDUCACIÓN BÁSICA',
      'EDUCACION INICIAL': 'EDUCACION INICIAL',
      'ENFERMERIA': 'ENFERMERÍA',
      'ESTETICA INTEGRAL': 'ESTÉTICA INTEGRAL',
      'GASTRONOMIA': 'GASTRONOMIA',
      'GESTION DEL TALENTO HUMANO': 'GESTION DEL TALENTO HUMANO',
      'INDUSTRIAL': 'INDUSTRIAL',
      'MARKETING': 'MARKETING',
      'MARKETING DIGITAL Y COMERCIO ELECTRONICO': 'MARKETING DIGITAL Y COMERCIO ELECTRONICO',
      'MECANICA AUTOMOTRIZ': 'MECÁNICA AUTOMOTRIZ',
      'PROCESAMIENTO EN ALIMENTOS': 'PROCESAMIENTO EN ALIMENTOS',
      'REDES Y TELECOMUNICACIONES': 'REDES Y TELECOMUNICACIONES',
      'SEGURIDAD CIUDADANA Y ORDEN PUBLICO': 'SEGURIDAD CIUDADANA Y ORDEN PÚBLICO',
      'SEGURIDAD Y PREVENCION DE RIESGOS LABORALES': 'SEGURIDAD Y PREVENCIÓN DE RIESGOS LABORALES',
      'VENTAS': 'VENTAS'
    };

    return alias[key] || upper;
  }

  function normalizarCarreraFirebase(value) {
    var original = limpiarTexto(value);

    if (!original) return '';

    var limpio = limpiarMojibake(original);
    var key = normalizarTexto(limpio);

    if (key === 'INDUS') return 'INDUSTRIAL';
    if (key === 'EDUCACION BASICA') return 'EDUCACIÓN BÁSICA';
    if (key === 'ENFERMERIA') return 'ENFERMERÍA';
    if (key === 'SEGURIDAD CIUDADANA Y ORDEN PUBLICO ONLINE') return 'SEGURIDAD CIUDADANA Y ORDEN PÚBLICO ONLINE';

    return limpio.toUpperCase();
  }

  function corregirUniversitaria(value) {
    return limpiarMojibake(value)
      .replace(/EDUACIÓN/gi, 'EDUCACIÓN')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();
  }

  function limpiarMojibake(value) {
    return limpiarTexto(value)
      .replace(/ӎ/g, 'ON')
      .replace(/́/g, 'ÍA')
      .replace(/ڂ/g, 'Ú')
      .replace(/EDUCACION BSICA/gi, 'EDUCACION BASICA')
      .replace(/EDUCACI[OÓ]N BSICA/gi, 'EDUCACIÓN BÁSICA')
      .replace(/ENFERMERIA/g, 'ENFERMERÍA')
      .replace(/ENFERMERÍAÍA/g, 'ENFERMERÍA')
      .replace(/PÚLICO/gi, 'PÚBLICO')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function limpiarCarrerasAsignadas(lista) {
    var mapa = {};

    (lista || []).forEach(function (item) {
      var nombre = normalizarCarreraVista(item.nombreCarrera || item);
      var key = normalizarTexto(nombre);

      if (!key || key === 'SIN CARRERA') return;

      mapa[key] = {
        codigoCarrera: item.codigoCarrera || '',
        nombreCarrera: nombre
      };
    });

    return Object.keys(mapa).map(function (key) {
      return mapa[key];
    });
  }

  function normalizarObjeto(data) {
    var normalizado = {};

    Object.keys(data || {}).forEach(function (key) {
      normalizado[normalizarKey(key)] = data[key];
    });

    return normalizado;
  }

  function normalizarKey(key) {
    return String(key || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toLowerCase();
  }

  function valor(source, keys) {
    for (var i = 0; i < keys.length; i += 1) {
      if (source[keys[i]] !== undefined && source[keys[i]] !== null && String(source[keys[i]]).trim() !== '') {
        return String(source[keys[i]]).trim();
      }
    }

    return '';
  }

  function construirSetCanonicamente(lista) {
    var set = {};

    (lista || []).forEach(function (item) {
      var canonico = normalizarPeriodoIdCanonico(item);
      if (canonico) set[canonico] = true;
    });

    return set;
  }

  function buscarPorId(lista, id) {
    for (var i = 0; i < lista.length; i += 1) {
      if (lista[i].id === id) return lista[i];
    }

    return null;
  }

  function construirVariantesCedula(cedula) {
    var limpia = limpiarNumeros(cedula);
    var variantes = [];

    agregarUnico(variantes, limpia);

    if (limpia.length === 9) agregarUnico(variantes, '0' + limpia);
    if (limpia.length === 10 && limpia.charAt(0) === '0') agregarUnico(variantes, limpia.slice(1));

    return variantes;
  }

  function normalizarCedula(cedula) {
    var limpia = limpiarNumeros(cedula);
    if (limpia.length === 9) return '0' + limpia;
    return limpia;
  }

  function limpiarUnicos(lista) {
    var salida = [];

    (lista || []).forEach(function (item) {
      var limpio = limpiarTexto(item);
      if (limpio && salida.indexOf(limpio) === -1) salida.push(limpio);
    });

    return salida;
  }

  function agregarUnico(lista, valor) {
    if (!valor) return;
    if (lista.indexOf(valor) === -1) lista.push(valor);
  }

  function generarIdDesdeNombre(nombre) {
    return String(nombre || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  function limpiarTexto(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function limpiarNumeros(value) {
    return String(value || '').replace(/\D/g, '');
  }

  function normalizarTexto(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();
  }

  function fechaNumero(value) {
    var time = new Date(value || 0).getTime();
    return Number.isFinite(time) ? time : 0;
  }

  function ahoraIso() {
    return new Date().toISOString();
  }

  window.TAAdministradorRepository = Object.freeze({
    iniciarFirebase: iniciarFirebase,
    cargarAppConfig: cargarAppConfig,
    guardarAppConfig: guardarAppConfig,
    listarEstudiantes: listarEstudiantes,
    listarTitulos: listarTitulos,
    listarRevisionesInvestigacion: listarRevisionesInvestigacion,
    listarCoordinadores: listarCoordinadores,
    listarPeriodos: listarPeriodos,
    actualizarPeriodosActivos: actualizarPeriodosActivos,
    cambiarEstadoPeriodo: cambiarEstadoPeriodo,
    obtenerCarreras: obtenerCarreras,
    crearCoordinador: crearCoordinador,
    eliminarCoordinador: eliminarCoordinador,
    asignarCarreraACoordinador: asignarCarreraACoordinador,
    listarEstudiantesConTitulos: listarEstudiantesConTitulos,
    obtenerDetalleEstudiante: obtenerDetalleEstudiante,
    archivarIntento: archivarIntento,
    intervenirTitulo: intervenirTitulo,
    clasificarEstadoTitulo: clasificarEstadoTitulo,
    obtenerEtapaRevision: obtenerEtapaRevision,
    obtenerFaltantesRevision: obtenerFaltantesRevision,
    formatearPeriodoId: formatearPeriodoId,
    normalizarPeriodoIdCanonico: normalizarPeriodoIdCanonico,
    normalizarCarreraVista: normalizarCarreraVista,
    normalizarDatosAutomaticamente: normalizarDatosAutomaticamente,
    normalizarTexto: normalizarTexto
  });
})();