/* Datos, PIN y segunda revisión del módulo Investigadores sobre titulos-ec2fa/envios. */
(function () {
  'use strict';

  var config = window.TA_INVESTIGADORES_CONFIG;
  var firebaseService = window.TAInvestigadorFirebaseService;
  var seguro = window.TAInvestigadorSeguro;
  function modoSeguro(){return Boolean(seguro&&seguro.activo&&seguro.activo());}

  function buscarInvestigador(cedula) {
    if(modoSeguro())return seguro.perfil().then(normalizarInvestigador);
    var id=soloNumeros(cedula);
    if(id.length!==10)return Promise.reject(new Error('Ingresa una cédula válida de 10 dígitos.'));
    // Buscar exclusivamente por cédula, también en campos heredados, sin descargar
    // los hashes de todos los investigadores y sin usar caché local.
    return firebaseService.buscarInvestigadoresPorCedulaServidor(id).then(function(documentos){
      var perfiles=(documentos||[]).map(normalizarInvestigador);
      if(perfiles.length>1)
        throw new Error('Hay varios registros con tu cédula en Firebase. Administración debe resolver los duplicados.');
      if(!perfiles.length)
        throw new Error('Tu cédula no consta en el registro de investigadores. Comunícate con Administración.');
      var encontrado=perfiles[0];
      if(encontrado.cedula!==id)
        throw new Error('La cédula del registro de Firebase no coincide. Solicita revisión a Administración.');
      if(!encontrado.activo)throw new Error('Tu registro de investigador está inactivo.');
      return encontrado;
    });
  }

  function crearPin() {
    // Desactivar la asignación de PIN desde la página pública. Solo Administración
    // debe administrar esta credencial durante la migración a Firebase Auth.
    return Promise.reject(new Error('Por seguridad, el PIN únicamente puede asignarse desde Administración.'));
  }

  function validarAcceso(investigador,pin) {
    if(modoSeguro())return Promise.reject(new Error('La autorización se comprueba mediante Firebase Authentication.'));
    if(!investigador||!investigador.cedula)
      return Promise.reject(new Error('Vuelve a identificarte.'));
    // Evitar login con el snapshot utilizado durante la identificación.
    return buscarInvestigador(investigador.cedula).then(function(actual){
      if(!actual.pinCreado||!actual.pinHash)
        throw new Error('Tu acceso todavía no tiene un PIN asignado.');
      return hashPin(actual.cedula,pin).then(function(hash){
        if(!compararSeguro(hash,String(actual.pinHash || '').trim().toLowerCase()))
          throw new Error('PIN incorrecto para el registro de Firebase. Administración puede comprobar y restablecer el acceso desde Investigadores → Conciliar PINs.');
        if(!actual.pinActivo)
          throw new Error('Tu acceso está desactivado. Solicita activación a Administración.');
        return actual;
      });
    });
  }

  // Leer el control administrativo de períodos también en el modo heredado.
  function periodosHabilitados() {
    if(!firebaseService || typeof firebaseService.leerDocumento!=='function')
      return Promise.reject(new Error('No es posible verificar los períodos activos.'));
    return firebaseService.leerDocumento(config.collections.config,'general').then(function(c){
      if(!c)throw new Error('No se pudo consultar la configuración de períodos.');
      var lista=Array.isArray(c.periodosActivos)?c.periodosActivos:
        c.periodoActivoDesactivado===true?[]:
        [c.periodoActivoId||(c.periodoActivo&&c.periodoActivo.id)||c.periodoActivo||''];
      return new Set(lista.map(canonicoPeriodo).filter(Boolean));
    });
  }
  function canonicoPeriodo(id){
    if(id&&typeof id==='object')id=id.id||id.periodoId||'';
    var m=/^(\d{4})[-_](0?[1-9]|1[0-2])(?:__|[-_\s]+)(\d{4})[-_](0?[1-9]|1[0-2])$/.exec(String(id||'').trim());
    return m?m[1]+'-'+String(m[2]).padStart(2,'0')+'__'+m[3]+'-'+String(m[4]).padStart(2,'0'):'';
  }
  function periodoDocumento(t){
    var d=t&&t.raw||t||{};
    return canonicoPeriodo(d.periodoCanonicoId)||canonicoPeriodo(d.periodoId)||canonicoPeriodo(d.periodo&&d.periodo.id||d.periodo)||'';
  }
  function periodoHabilitado(t,activos){return activos.has(periodoDocumento(t));}

  function listarTitulosHabilitados(investigador) {
    if(modoSeguro())return seguro.cola().then(function(result){
      if(result.truncado)console.warn('[Investigadores][LIMIT] Cola truncada por límite del backend.');
      return (result.titulos||[]).map(normalizarTitulo);
    });
    // Consulta todas las carreras en los períodos activos, sin reabrir períodos desactivados.
    if (!investigador || investigador.activo === false || !investigador.pinActivo)
      return Promise.reject(new Error('El acceso del investigador no está activo.'));
    return periodosHabilitados().then(function(activos){
      return firebaseService.listarDocumentos(config.collections.titulos, { server: true })
      .then(function (docs) {
        return (docs || []).map(normalizarTitulo)
          .filter(function(t){return estaPendienteInvestigacion(t)&&periodoHabilitado(t,activos);})
          .sort(function (a, b) {
            var fechaA = Number(a.fechaColaMs || Number.MAX_SAFE_INTEGER);
            var fechaB = Number(b.fechaColaMs || Number.MAX_SAFE_INTEGER);
            if (fechaA !== fechaB) return fechaA - fechaB;
            return a.nombres.localeCompare(b.nombres);
          });
      });
    });
  }

  function listarRevisadosPorInvestigador(investigador) {
    if(modoSeguro())return seguro.revisados().then(function(data){
      var report=window.TARevisionReportService;
      if(!report||typeof report.normalizarLista!=='function')throw new Error('No se cargó el motor de reportes.');
      if(data.truncado)console.warn('[Investigadores][LIMIT] Historial truncado por límite del backend.');
      return report.normalizarLista(data.titulos||[]).filter(function(item){return report.coincideInvestigador(item,investigador);});
    });
    if (!investigador) return Promise.reject(new Error('No se identificó al investigador.'));

    var reportService = window.TARevisionReportService;
    if (!reportService || typeof reportService.normalizarLista !== 'function') {
      return Promise.reject(new Error('No se cargó el motor de reportes.'));
    }

    /*
      Historial propio: NO depende de las carreras asignadas actualmente.
      Se atribuye por revisionInvestigador para que una reasignación futura
      no borre del reporte lo que el investigador ya revisó.
    */
    return firebaseService.listarDocumentos(config.collections.titulos, { limit: 5000 })
      .then(function (docs) {
        var registros=docs||[];
        return reportService.normalizarLista(registros).filter(function (item) {
          return reportService.coincideInvestigador(item, investigador);
        });
      });
  }

  function revisarTitulo(titulo, accion, observacion, investigador, numeroElegido, textoEditado) {
    if(modoSeguro())return seguro.revisar({
      tituloId:titulo&&titulo.id,accion:accion,observacion:observacion,
      tituloSeleccionadoNumero:numeroElegido,tituloCorregidoTexto:textoEditado,
      revisionEsperada:titulo&&titulo.raw&&titulo.raw.actualizadoEnLocal||''
    }).then(normalizarTitulo);
    if (!titulo || !titulo.id) return Promise.reject(new Error('No se encontró el título.'));
    if (!estaPendienteInvestigacion(titulo)) return Promise.reject(new Error('Este título ya no está pendiente de Investigación.'));
    if (!investigador || investigador.activo === false || !investigador.pinActivo) return Promise.reject(new Error('El acceso del investigador no está activo.'));

    var estadoRevision = estadoDesdeAccion(accion);
    var comentario = limpiar(observacion);
    if ((estadoRevision === 'APROBADO_CON_OBSERVACION' || estadoRevision === 'DEVUELTO') && !comentario) {
      return Promise.reject(new Error('Debes escribir una observación para esta decisión.'));
    }

    var ahora = new Date().toISOString();
    var propuestas=(titulo.titulosEnviados||[]);
    var numero=Number(numeroElegido||0);
    var seleccion=propuestas.find(function(p){return Number(p.numero)===numero;})||null;
    if(numeroElegido!==undefined && numeroElegido!==null && (!Number.isInteger(numero)||numero<1||numero>3||!seleccion))
      return Promise.reject(new Error('Selecciona una de las propuestas registradas.'));
    var original=seleccion?limpiar(seleccion.tituloFinal||seleccion.titulo):'';
    var tituloFinal=seleccion?limpiar(textoEditado===undefined?original:textoEditado):
      limpiar(titulo.habilitadoInvestigacionPorAdmin&&titulo.tituloAdminSeleccionadoTexto||
      titulo.tituloCoordinador||titulo.tituloPreferidoTexto||titulo.tituloElegido||'');
    var corrigio=estadoRevision!=='DEVUELTO'&&Boolean(seleccion)&&tituloFinal!==original;
    if(estadoRevision!=='DEVUELTO'&&!tituloFinal)return Promise.reject(new Error('No hay un título válido seleccionado.'));
    if(corrigio&&(tituloFinal.length<20||tituloFinal.length>260))return Promise.reject(new Error('El título corregido debe tener entre 20 y 260 caracteres.'));
    if(corrigio&&comentario.length<8)return Promise.reject(new Error('Explica la corrección del título (mínimo 8 caracteres).'));
    var propuestasActualizadas=propuestas.map(function(p){
      if(!corrigio||Number(p.numero)!==numero)return p;
      return Object.assign({},p,{
        tituloOriginalInvestigacion:p.tituloOriginalInvestigacion||original,
        tituloCorregidoInvestigacion:tituloFinal,corregidoInvestigacion:true,
        tituloFinal:tituloFinal,titulo:tituloFinal
      });
    });
    var revision = {
      estado: estadoRevision,
      accion: accion,
      observacion: comentario,
      investigadorId: investigador.id,
      investigadorCedula: investigador.cedula,
      investigadorNombre: investigador.nombre,
      investigadorEmail: investigador.email,
      tituloSeleccionadoNumero:numero||Number(titulo.tituloCoordinadorNumero||0)||null,
      tituloSeleccionadoTextoOriginal:original||titulo.tituloCoordinador||'',
      tituloSeleccionadoTexto:estadoRevision==='DEVUELTO'?'':tituloFinal,
      corrigioTitulo:corrigio,
      seleccionDiferenteCoordinacion:Boolean(numero&&Number(titulo.tituloCoordinadorNumero||0)!==numero),
      fechaLocal: ahora
    };

    var payload = {
      estadoInvestigador: estadoRevision,
      revisionInvestigador: revision,
      investigacionRevisada: true,
      investigacionRevisadaEn: ahora,
      observacionInvestigacion: comentario,
      fechaResolucionInvestigacion: ahora,
      actualizadoPorModulo: 'investigadores'
    };

    if (estadoRevision === 'DEVUELTO') {
      Object.assign(payload, {
        estado: 'DEVUELTO',
        estadoProceso: 'DEVUELTO',
        resultadoInvestigacion: 'DEVUELTO',
        tituloFinalInvestigacion: null,
        tituloFinal: null,
        requiereAccionDe: 'ESTUDIANTE',
        requiereRevision: true,
        permitirReenvio: true,
        puedeReenviar: true,
        devueltoPor: 'INVESTIGACION',
        observacionDevolucion: comentario
      });
    } else {
      Object.assign(payload, {
        estado: 'APROBADO_FINAL',
        estadoProceso: 'APROBADO_FINAL',
        resultadoInvestigacion: corrigio?'APROBADO_CON_CORRECCION':estadoRevision === 'APROBADO_CON_OBSERVACION'?'APROBADO_CON_OBSERVACION':'APROBADO_SIN_CAMBIOS',
        tituloInvestigadorNumero:revision.tituloSeleccionadoNumero,
        tituloInvestigador:tituloFinal,
        tituloOriginalInvestigacion:revision.tituloSeleccionadoTextoOriginal,
        tituloCorregidoInvestigacion:corrigio?tituloFinal:'',
        titulosEnviados:propuestasActualizadas,
        propuestasDetalle:propuestasActualizadas,
        tituloFinalInvestigacion: tituloFinal,
        tituloFinal: tituloFinal,
        requiereAccionDe: '',
        requiereRevision: false,
        permitirReenvio: false,
        puedeReenviar: false,
        devueltoPor: '',
        fechaResolucion: ahora
      });
      [1,2,3].forEach(function(n){
        var item=propuestasActualizadas.find(function(p){return Number(p.numero)===n;});
        if(item)payload['titulo'+n]=item.tituloFinal||item.titulo||'';
      });
    }

    return periodosHabilitados().then(function(activos){
      if(!periodoHabilitado(titulo,activos))
        throw new Error('El período académico está desactivado.');
      // No sustituir la transacción por guardarDocumento/agregarDocumento: permitiría
      // sobrescribir una aprobación anterior desde una pestaña desactualizada.
      if(!firebaseService.guardarRevisionAtomica)
        throw new Error('Actualiza la aplicación de Investigación para guardar con seguridad.');
      var evento={
        tipo:'REVISION_TITULO_INVESTIGADOR',accion:'REVISION_TITULO_INVESTIGADOR',
        modulo:'investigadores',entidad:'envios',entidadId:titulo.id,tituloId:titulo.id,
        cedula:titulo.cedula,carrera:titulo.carrera,periodoId:titulo.periodoId,
        estado:payload.estado,revision:revision,
        tituloSeleccionadoNumero:revision.tituloSeleccionadoNumero,
        tituloSeleccionadoTexto:revision.tituloSeleccionadoTexto,
        tituloSeleccionadoTextoOriginal:revision.tituloSeleccionadoTextoOriginal,fechaLocal:ahora
      };
      return firebaseService.guardarRevisionAtomica(config.collections.titulos,titulo.id,
        payload,evento,titulo.raw||titulo,investigador);
    }).then(function(){
      return normalizarTitulo(Object.assign({},titulo.raw||titulo,payload));
    });
  }

  function estaHabilitadoPorCoordinador(titulo) {
    if (!titulo) return false;
    var t = titulo.raw || titulo;
    var estado = normalizarTexto(t.estado), proceso = normalizarTexto(t.estadoProceso);
    var coord = normalizarTexto(t.estadoCoordinador || (t.revisionCoordinador && t.revisionCoordinador.estado));
    return estado === 'PENDIENTE_INVESTIGADOR' || proceso === 'PENDIENTE_INVESTIGADOR' ||
      t.validadoCoordinador === true || t.validadoCoordinacion === true || t.coordinadorRevisado === true ||
      coord === 'VALIDADO' || coord === 'APROBADO' || coord === 'APROBADO_CON_OBSERVACION';
  }

  function estaPendienteInvestigacion(titulo) {
    if (!titulo || !estaHabilitadoPorCoordinador(titulo)) return false;
    var t = titulo.raw || titulo;
    var estado = normalizarTexto(t.estado), proceso = normalizarTexto(t.estadoProceso);
    var coord = normalizarTexto(t.estadoCoordinador || (t.revisionCoordinador && t.revisionCoordinador.estado));
    var inv = normalizarTexto(t.estadoInvestigador || (t.revisionInvestigador && t.revisionInvestigador.estado));
    var cerrado=function(v){return /^(APROBADO_FINAL|DEVUELTO(?:_.*)?|ARCHIVADO(?:_.*)?|BORRADOR_REINICIADO|SIN_ENVIO|SIN_ENVIAR)$/.test(v);};
    if(cerrado(estado)||cerrado(proceso)||coord==='DEVUELTO')return false;
    if(/^(PENDIENTE_COORDINADOR|COORDINACION_PENDIENTE)$/.test(proceso))return false;
    if(t.investigacionRevisada===true||/^(APROBADO(?:_CON_OBSERVACION)?|DEVUELTO)$/.test(inv))return false;
    return construirPropuestas(t).length>0;
  }

  function fechaIso(valor) {
    if (!valor) return '';
    try {
      if (typeof valor.toDate === 'function') return valor.toDate().toISOString();
      if (valor.seconds) return new Date(Number(valor.seconds) * 1000).toISOString();
      var fecha = valor instanceof Date ? valor : new Date(valor);
      return isNaN(fecha.getTime()) ? '' : fecha.toISOString();
    } catch (error) {
      return '';
    }
  }

  function fechaMs(valor) {
    var iso = fechaIso(valor);
    if (!iso) return Number.MAX_SAFE_INTEGER;
    var ms = new Date(iso).getTime();
    return isNaN(ms) ? Number.MAX_SAFE_INTEGER : ms;
  }

  function normalizarInvestigador(data) {
    var carreras = [];
    [data.carrerasNombres, data.carreras, data.carrerasAsignadas, data.carrerasIds].forEach(function (valor) {
      carreras = carreras.concat(normalizarCarreras(valor));
    });
    return {
      id: data.id || data._docId || soloNumeros(data.cedula || data.identificacion),
      cedula: soloNumeros(data.cedula || data.identificacion || data.numeroIdentificacion || data.id),
      nombre: limpiar(data.nombres || data.nombre || data.nombreCompleto || ''),
      email: limpiar(data.email || data.correo || '').toLowerCase(),
      carreras: unicos(carreras),
      activo: data.activo !== false && String(data.estado || 'ACTIVO').toUpperCase() !== 'INACTIVO',
      pinCreado: Boolean(data.pinCreado || data.pinHash),
      pinActivo: Boolean(data.pinActivo),
      pinHash: String(data.pinHash || '').trim(),
      raw: data
    };
  }

  function normalizarTitulo(data) {
    var propuestas = construirPropuestas(data);
    var preferido = Number(data.tituloPreferidoNumero || 1);
    var preferida = propuestas.filter(function (p) { return Number(p.numero) === preferido; })[0] || propuestas[0] || {};
    var estado = String(data.estado || 'PENDIENTE_REVISION').toUpperCase();
    var proceso = String(data.estadoProceso || '').toUpperCase();
    var estadoCoord = String(data.estadoCoordinador || '').toUpperCase();
    var revisionCoordinador = data.revisionCoordinador ||
      (data.revision && (
        data.revision.coordinadorId ||
        ['VALIDAR','VALIDAR_CORRECCION'].includes(String(data.revision.accion||'').toUpperCase())
      ) ? data.revision : null);
    if (!estadoCoord && data.habilitadoInvestigacionPorAdmin !== true &&
        (data.validadoCoordinador === true || estado === 'PENDIENTE_INVESTIGADOR' || proceso === 'PENDIENTE_INVESTIGADOR')) estadoCoord = 'VALIDADO';

    return {
      id: data.id || data._docId || '',
      cedula: soloNumeros(data.cedula || data.numeroIdentificacion),
      nombres: limpiar(data.nombres || data.nombreCompleto || ''),
      carrera: limpiar(data.carreraNombre || data.carrera || data.nombreCarrera || ''),
      codigoCarrera: limpiar(data.carreraCodigo || data.codigoCarrera || ''),
      periodoId: periodoDocumento(data),
      periodoLabel: limpiar(data.periodoNombre || data.periodoLabel || data.periodoId || data.periodoCanonicoId || ''),
      fechaEnvio: fechaIso(data.fechaEnvio || data.actualizadoEnLocal || data.creadoEn || data.actualizadoEn),
      fechaColaInvestigacion: fechaIso(
        data.fechaColaInvestigacion ||
        data.fechaValidacionCoordinador ||
        (data.revisionCoordinador && (data.revisionCoordinador.fechaLocal || data.revisionCoordinador.fechaValidacion || data.revisionCoordinador.fechaRevision)) ||
        data.revisadoEnLocal ||
        data.fechaResolucion ||
        data.fechaEnvio ||
        data.actualizadoEnLocal ||
        data.creadoEn ||
        data.actualizadoEn
      ),
      fechaColaMs: fechaMs(
        data.fechaValidacionCoordinador ||
        (data.revisionCoordinador && (data.revisionCoordinador.fechaLocal || data.revisionCoordinador.fechaValidacion || data.revisionCoordinador.fechaRevision)) ||
        data.revisadoEnLocal ||
        data.fechaResolucion ||
        data.fechaEnvio ||
        data.actualizadoEnLocal ||
        data.creadoEn ||
        data.actualizadoEn
      ),
      numeroEnvios: Number(data.numeroEnvios || data.intentosUsados || 1),
      numeroReenvios: Number(data.numeroReenvios || 0),
      estado: estado,
      estadoProceso: proceso,
      estadoCoordinador: estadoCoord,
      tituloPreferidoNumero: preferido,
      tituloCoordinadorNumero: Number(data.tituloCoordinadorNumero || (revisionCoordinador && revisionCoordinador.tituloSeleccionadoNumero) || 0),
      tituloAdminSeleccionadoNumero: Number(data.tituloAdminSeleccionadoNumero || 0),
      tituloAdminSeleccionadoTexto: limpiar(data.tituloAdminSeleccionadoTexto || ''),
      habilitadoInvestigacionPorAdmin: data.habilitadoInvestigacionPorAdmin === true,
      revisionAdministrativa: data.revisionAdministrativa || null,
      resultadoCoordinador: limpiar(data.resultadoCoordinador || (revisionCoordinador && revisionCoordinador.resultado) || ''),
      tituloPreferidoTexto: limpiar(data.tituloPreferidoTexto || data.tituloElegido || data.tituloCoordinador || preferida.tituloFinal || ''),
      tituloElegido: limpiar(data.tituloElegido || ''),
      tituloCoordinador: limpiar(data.tituloCoordinador || (revisionCoordinador&&revisionCoordinador.tituloSeleccionadoTexto) || ''),
      tituloCoordinadorAntes: limpiar(data.tituloCoordinadorAntes||(revisionCoordinador&&revisionCoordinador.tituloSeleccionadoTextoOriginal)||''),
      tituloCoordinadorCorregido: limpiar(data.tituloCoordinadorCorregido||''),

      titulosEnviados: propuestas,
      revisionCoordinador: revisionCoordinador || null,
      coordinadorRevisado: Boolean(data.coordinadorRevisado || data.validadoCoordinador),
      validadoCoordinador: Boolean(data.validadoCoordinador),
      estadoInvestigador: String(data.estadoInvestigador || '').toUpperCase(),
      revisionInvestigador: data.revisionInvestigador || null,
      raw: data
    };
  }

  function construirPropuestas(data) {
    data=data||{};
    function lista(src){
      if(!Array.isArray(src))return [];
      return src.map(function(p,i){
        if(!p)return null;
        var numero=Number(p.numero||i+1),titulo=limpiar(typeof p==='string'?p:p.tituloFinal||p.titulo||p.texto||'');
        if(![1,2,3].includes(numero)||!titulo)return null;
        return Object.assign({},typeof p==='object'?p:{},{numero:numero,tituloFinal:titulo});
      }).filter(Boolean);
    }
    var v=lista(data.titulosEnviados);if(v.length)return v;
    v=lista(data.propuestasDetalle);if(v.length)return v;
    v=lista(data.propuestas);if(v.length)return v;
    return [1,2,3].map(function(numero){
      var titulo=limpiar(data['titulo'+numero]);
      return titulo?{numero:numero,tituloFinal:titulo,preferido:Number(data.tituloPreferidoNumero)===numero}:null;
    }).filter(Boolean);
  }

  function estadoDesdeAccion(accion) {
    var value = String(accion || '').toUpperCase();
    if (value === 'APROBAR') return 'APROBADO';
    if (value === 'APROBAR_OBSERVACION') return 'APROBADO_CON_OBSERVACION';
    if (value === 'DEVOLVER') return 'DEVUELTO';
    throw new Error('Acción de revisión no válida.');
  }

  function validarPin(pin) {
    var value = String(pin || '');
    if (!new RegExp('^\\d{' + config.pin.min + ',' + config.pin.max + '}$').test(value)) {
      throw new Error('El PIN debe tener entre ' + config.pin.min + ' y ' + config.pin.max + ' dígitos.');
    }
  }

  function hashPin(cedula, pin) {
    validarPin(pin);
    if (!window.crypto || !window.crypto.subtle || !window.TextEncoder) return Promise.reject(new Error('Este navegador no permite proteger el PIN. Abre la aplicación mediante HTTPS.'));
    var texto = new TextEncoder().encode('titulos-investigador-v1|' + cedula + '|' + pin);
    return window.crypto.subtle.digest('SHA-256', texto).then(function (buffer) {
      return Array.prototype.map.call(new Uint8Array(buffer), function (byte) { return byte.toString(16).padStart(2, '0'); }).join('');
    });
  }

  function compararSeguro(a, b) {
    a = String(a || ''); b = String(b || '');
    if (a.length !== b.length) return false;
    var diff = 0;
    for (var i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  }

  function normalizarCarreras(value) {
    if (Array.isArray(value)) return value.map(function (item) {
      if (item && typeof item === 'object') return limpiar(item.nombreCarrera || item.carrera || item.nombre || item.codigo || item.id || '');
      return limpiar(item);
    }).filter(Boolean);
    return String(value || '').split(/[,;|]/).map(limpiar).filter(Boolean);
  }
  function unicos(lista) { var out=[]; (lista||[]).forEach(function(v){ v=limpiar(v); if(v && out.indexOf(v)===-1) out.push(v); }); return out; }
  function soloNumeros(value) { return String(value || '').replace(/\D/g, ''); }
  function limpiar(value) { return String(value === undefined || value === null ? '' : value).replace(/\s+/g, ' ').trim(); }
  function normalizarTexto(value) { return limpiar(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase(); }

  window.TAInvestigadorRepository = Object.freeze({
    buscarInvestigador: buscarInvestigador,
    crearPin: crearPin,
    validarAcceso: validarAcceso,
    listarTitulosHabilitados: listarTitulosHabilitados,
    listarRevisadosPorInvestigador: listarRevisadosPorInvestigador,
    revisarTitulo: revisarTitulo,
    estaHabilitadoPorCoordinador: estaHabilitadoPorCoordinador,
    estaPendienteInvestigacion: estaPendienteInvestigacion
  });
})();