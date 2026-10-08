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
        if(!compararSeguro(hash,actual.pinHash))
          throw new Error('PIN incorrecto para el registro guardado en Firebase. Solicita comprobarlo en Administración.');
        if(!actual.pinActivo)
          throw new Error('Tu acceso está desactivado. Solicita activación a Administración.');
        return actual;
      });
    });
  }

  function listarTitulosHabilitados(investigador) {
    if(modoSeguro())return seguro.cola().then(function(result){
      if(result.truncado)console.warn('[Investigadores][LIMIT] Cola truncada por límite del backend.');
      return (result.titulos||[]).map(normalizarTitulo);
    });
    /*
      Investigación trabaja por estado, no por el período activo global.
      Un expediente entra a esta cola cuando Coordinación lo habilita,
      aunque pertenezca a un período académico anterior o simultáneo.
    */
    return firebaseService.listarDocumentos(config.collections.titulos, { limit: 2500 })
      .then(function (docs) {
        return (docs || []).map(normalizarTitulo)
          .filter(estaHabilitadoPorCoordinador)
          .filter(function (titulo) { return perteneceAlInvestigador(titulo, investigador); })
          .sort(function (a, b) {
            var fechaA = Number(a.fechaColaMs || Number.MAX_SAFE_INTEGER);
            var fechaB = Number(b.fechaColaMs || Number.MAX_SAFE_INTEGER);
            if (fechaA !== fechaB) return fechaA - fechaB;
            return a.nombres.localeCompare(b.nombres);
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
        return reportService.normalizarLista(docs || []).filter(function (item) {
          return reportService.coincideInvestigador(item, investigador);
        });
      });
  }

  function revisarTitulo(titulo, accion, observacion, investigador) {
    if(modoSeguro())return seguro.revisar({tituloId:titulo&&titulo.id,accion:accion,observacion:observacion}).then(normalizarTitulo);
    if (!titulo || !titulo.id) return Promise.reject(new Error('No se encontró el título.'));
    if (!estaHabilitadoPorCoordinador(titulo)) return Promise.reject(new Error('Este título todavía no está habilitado por Coordinación.'));
    if (!investigador || !investigador.pinActivo) return Promise.reject(new Error('El acceso del investigador no está activo.'));
    if (!perteneceAlInvestigador(titulo, investigador)) return Promise.reject(new Error('El título no pertenece a tus carreras asignadas.'));

    var estadoRevision = estadoDesdeAccion(accion);
    var comentario = limpiar(observacion);
    if ((estadoRevision === 'APROBADO_CON_OBSERVACION' || estadoRevision === 'DEVUELTO') && !comentario) {
      return Promise.reject(new Error('Debes escribir una observación para esta decisión.'));
    }

    var ahora = new Date().toISOString();
    var tituloFinal = limpiar(titulo.tituloCoordinador || titulo.tituloPreferidoTexto || titulo.tituloElegido || '');
    var revision = {
      estado: estadoRevision,
      accion: accion,
      observacion: comentario,
      investigadorId: investigador.id,
      investigadorCedula: investigador.cedula,
      investigadorNombre: investigador.nombre,
      investigadorEmail: investigador.email,
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
        resultadoInvestigacion: estadoRevision === 'APROBADO_CON_OBSERVACION' ? 'APROBADO_CON_CORRECCION' : 'APROBADO_SIN_CAMBIOS',
        tituloFinalInvestigacion: tituloFinal,
        tituloFinal: tituloFinal,
        requiereAccionDe: '',
        requiereRevision: false,
        permitirReenvio: false,
        puedeReenviar: false,
        devueltoPor: '',
        fechaResolucion: ahora
      });
    }

    return firebaseService.guardarDocumento(config.collections.titulos, titulo.id, payload, { merge: true })
      .then(function () {
        return firebaseService.agregarDocumento(config.collections.logs, {
          tipo: 'REVISION_TITULO_INVESTIGADOR',
          accion: 'REVISION_TITULO_INVESTIGADOR',
          modulo: 'investigadores',
          entidad: 'envios',
          entidadId: titulo.id,
          tituloId: titulo.id,
          cedula: titulo.cedula,
          carrera: titulo.carrera,
          periodoId: titulo.periodoId,
          estado: payload.estado,
          revision: revision,
          fechaLocal: ahora
        }).catch(function () { return null; });
      })
      .then(function () { return Object.assign({}, titulo, payload); });
  }

  function estaHabilitadoPorCoordinador(titulo) {
    var estado = String(titulo.estado || '').toUpperCase();
    var proceso = String(titulo.estadoProceso || '').toUpperCase();
    var estadoCoord = String(titulo.estadoCoordinador || '').toUpperCase();
    var validado = Boolean(titulo.validadoCoordinador || titulo.coordinadorRevisado || titulo.revisionCoordinador);

    if (estado === 'APROBADO_FINAL' || proceso === 'APROBADO_FINAL') return true;
    if (estado === 'PENDIENTE_INVESTIGADOR' || proceso === 'PENDIENTE_INVESTIGADOR') return true;
    return validado && config.estadosCoordinadorHabilitados.indexOf(estadoCoord) !== -1;
  }

  function estaPendienteInvestigacion(titulo) {
    if (!titulo || !estaHabilitadoPorCoordinador(titulo)) return false;

    var estado = String(titulo.estado || '').toUpperCase();
    var proceso = String(titulo.estadoProceso || '').toUpperCase();
    var estadoInvestigador = String(titulo.estadoInvestigador || '').toUpperCase();
    var revision = titulo.revisionInvestigador || {};

    if (estado === 'APROBADO_FINAL' || proceso === 'APROBADO_FINAL') return false;
    if (estado === 'DEVUELTO' || proceso === 'DEVUELTO') return false;
    if (titulo.raw && titulo.raw.investigacionRevisada === true) return false;
    if (revision && revision.estado && String(revision.estado).toUpperCase() !== 'PENDIENTE') return false;
    if (estadoInvestigador && estadoInvestigador !== 'PENDIENTE') return false;

    return estado === 'PENDIENTE_INVESTIGADOR' ||
      proceso === 'PENDIENTE_INVESTIGADOR' ||
      titulo.estadoCoordinador === 'VALIDADO';
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

  function perteneceAlInvestigador(titulo, investigador) {
    var carreras = investigador && investigador.carreras || [];
    if (!carreras.length) return false;
    var carrera = normalizarTexto(titulo.carrera);
    var codigo = normalizarTexto(titulo.codigoCarrera);
    return carreras.some(function (item) {
      var valor = normalizarTexto(item);
      return valor === '*' || valor === 'TODAS' || valor === carrera || valor === codigo ||
        (carrera && carrera.indexOf(valor) !== -1) || (carrera && valor.indexOf(carrera) !== -1);
    });
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
      pinHash: String(data.pinHash || ''),
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
    if (!estadoCoord && (data.validadoCoordinador === true || estado === 'PENDIENTE_INVESTIGADOR' || proceso === 'PENDIENTE_INVESTIGADOR')) estadoCoord = 'VALIDADO';

    return {
      id: data.id || data._docId || '',
      cedula: soloNumeros(data.cedula || data.numeroIdentificacion),
      nombres: limpiar(data.nombres || data.nombreCompleto || ''),
      carrera: limpiar(data.carreraNombre || data.carrera || data.nombreCarrera || ''),
      codigoCarrera: limpiar(data.carreraCodigo || data.codigoCarrera || ''),
      periodoId: limpiar(data.periodoId || data.periodoCanonicoId || data.periodoNombre || data.periodoLabel || ''),
      periodoLabel: limpiar(data.periodoNombre || data.periodoLabel || data.periodoId || data.periodoCanonicoId || ''),
      fechaEnvio: fechaIso(data.fechaEnvio || data.actualizadoEnLocal || data.creadoEn || data.actualizadoEn),
      fechaColaInvestigacion: fechaIso(
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
      tituloCoordinadorNumero: Number(data.tituloCoordinadorNumero || (data.revisionCoordinador && data.revisionCoordinador.tituloSeleccionadoNumero) || 0),
      resultadoCoordinador: limpiar(data.resultadoCoordinador || (data.revisionCoordinador && data.revisionCoordinador.resultado) || ''),
      tituloPreferidoTexto: limpiar(data.tituloPreferidoTexto || data.tituloElegido || data.tituloCoordinador || preferida.tituloFinal || ''),
      tituloElegido: limpiar(data.tituloElegido || ''),
      tituloCoordinador: limpiar(data.tituloCoordinador || ''),
      titulosEnviados: propuestas,
      revisionCoordinador: data.revisionCoordinador || null,
      coordinadorRevisado: Boolean(data.coordinadorRevisado || data.validadoCoordinador),
      validadoCoordinador: Boolean(data.validadoCoordinador),
      estadoInvestigador: String(data.estadoInvestigador || '').toUpperCase(),
      revisionInvestigador: data.revisionInvestigador || null,
      raw: data
    };
  }

  function construirPropuestas(data) {
    if (Array.isArray(data.titulosEnviados) && data.titulosEnviados.length) return data.titulosEnviados;
    var detalles = Array.isArray(data.propuestasDetalle) ? data.propuestasDetalle : [];
    return [1, 2, 3].map(function (numero) {
      var titulo = limpiar(data['titulo' + numero]);
      if (!titulo) return null;
      var detalle = detalles.filter(function (item) { return Number(item.numero) === numero; })[0] || {};
      return Object.assign({}, detalle, { numero: numero, tituloFinal: titulo, preferido: Number(data.tituloPreferidoNumero) === numero });
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