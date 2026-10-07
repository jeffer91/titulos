/* Datos y flujo de primera revisión del módulo Coordinadores sobre titulos-ec2fa/envios. */
(function () {
  'use strict';

  var config = window.TA_COORDINADORES_CONFIG;
  var firebaseService = window.TACoordFirebaseService;

  function listarCoordinadores() {
    return firebaseService.listarDocumentos(config.collections.coordinadores, { limit: 500 })
      .then(function (docs) {
        return (docs || []).map(normalizarCoordinador).filter(function (item) {
          return item.activo && item.nombre;
        }).sort(function (a, b) { return a.nombre.localeCompare(b.nombre); });
      });
  }

  function listarTitulosParaCoordinador(coordinador) {
    if (!coordinador || !coordinador.carreras.length) return Promise.resolve([]);
    return firebaseService.listarDocumentos(config.collections.titulos, { limit: 2500 })
      .then(function (docs) {
        return (docs || []).map(normalizarTitulo).filter(function (titulo) {
          return perteneceACoordinador(titulo, coordinador);
        }).sort(function (a, b) { return fechaMs(b.fechaEnvio) - fechaMs(a.fechaEnvio); });
      });
  }

  function cargarHistorialTitulo(titulo) {
    if (!titulo || !titulo.id) return Promise.resolve({ proceso: [], archivos: [], logs: [] });
    return Promise.all([
      firebaseService.listarDocumentos(config.collections.titulosHistorial, { where: ['envioId', '==', titulo.id], limit: 100 }).catch(function () {
        return firebaseService.listarDocumentos(config.collections.titulosHistorial, { where: ['idOriginal', '==', titulo.id], limit: 100 }).catch(function () { return []; });
      }),
      firebaseService.listarDocumentos(config.collections.logs, { where: ['tituloId', '==', titulo.id], limit: 300 }).catch(function () { return []; })
    ]).then(function (resultados) {
      return {
        proceso: Array.isArray(titulo.historialProceso) ? titulo.historialProceso.slice() : [],
        archivos: resultados[0] || [],
        logs: (resultados[1] || []).sort(function (a, b) { return fechaMs(a.creadoEn || a.fechaLocal) - fechaMs(b.creadoEn || b.fechaLocal); })
      };
    });
  }

  function revisarTitulo(titulo, accion, observacion, coordinador, tituloSeleccionadoNumero, tituloCorregidoTexto) {
    if (!titulo || !titulo.id) return Promise.reject(new Error('No se encontró el título seleccionado.'));
    if (!coordinador || !coordinador.id) return Promise.reject(new Error('No se encontró el coordinador activo.'));
    if (!perteneceACoordinador(titulo, coordinador)) return Promise.reject(new Error('El título no pertenece a las carreras del coordinador.'));

    var accionNormalizada = String(accion || '').trim().toUpperCase();
    var esAprobacion = accionNormalizada === 'VALIDAR' || accionNormalizada === 'VALIDAR_CORRECCION';
    var esCorreccion = accionNormalizada === 'VALIDAR_CORRECCION';

    if (!esAprobacion && accionNormalizada !== 'DEVOLVER') {
      return Promise.reject(new Error('Acción de revisión no válida.'));
    }

    var comentario = limpiar(observacion);
    if ((accionNormalizada === 'DEVOLVER' || esCorreccion) && !comentario) {
      return Promise.reject(new Error(esCorreccion
        ? 'Escribe una observación breve que explique la corrección realizada.'
        : 'Escribe un comentario para devolver el título.'));
    }

    var propuestasOriginales = (titulo.titulosEnviados || []).map(function (item) {
      return Object.assign({}, item || {});
    });
    var numeroElegido = Number(tituloSeleccionadoNumero || 0);
    var elegida = propuestasOriginales.filter(function (item) {
      return Number(item.numero) === numeroElegido;
    })[0] || null;

    if (esAprobacion && (!numeroElegido || !elegida)) {
      return Promise.reject(new Error('Selecciona uno de los tres títulos antes de aprobar.'));
    }

    var textoOriginal = elegida ? limpiar(elegida.tituloFinal || elegida.titulo || '') : '';
    var textoCorregido = esCorreccion ? limpiar(tituloCorregidoTexto) : textoOriginal;

    if (esCorreccion && !textoCorregido) {
      return Promise.reject(new Error('Escribe el título corregido antes de continuar.'));
    }

    if (esCorreccion && textoCorregido === textoOriginal) {
      return Promise.reject(new Error('Modifica el título seleccionado o usa Aprobar si no requiere cambios.'));
    }

    var ahora = new Date().toISOString();
    var propuestasActualizadas = propuestasOriginales.map(function (item) {
      var copia = Object.assign({}, item || {});
      if (esCorreccion && Number(copia.numero) === numeroElegido) {
        copia.tituloOriginalCoordinacion = textoOriginal;
        copia.tituloCorregidoCoordinacion = textoCorregido;
        copia.corregidoCoordinacion = true;
        copia.tituloFinal = textoCorregido;
        copia.titulo = textoCorregido;
      }
      return copia;
    });

    var revision = {
      estado: esAprobacion ? 'VALIDADO' : 'DEVUELTO',
      accion: accionNormalizada,
      resultado: esCorreccion ? 'APROBADO_CON_CORRECCION' : (esAprobacion ? 'APROBADO_SIN_CAMBIOS' : 'DEVUELTO'),
      observacion: comentario,
      coordinadorId: coordinador.id,
      coordinadorEmail: coordinador.email || '',
      coordinadorNombre: coordinador.nombre,
      tituloSeleccionadoNumero: esAprobacion ? numeroElegido : null,
      tituloSeleccionadoTextoOriginal: esAprobacion ? textoOriginal : '',
      tituloSeleccionadoTexto: esAprobacion ? textoCorregido : '',
      corrigioTitulo: esCorreccion,
      fechaLocal: ahora
    };

    var payload = {
      revisionCoordinador: revision,
      revision: revision,
      coordinadorRevisado: true,
      revisadoPor: coordinador.email || coordinador.id,
      revisadoPorNombre: coordinador.nombre,
      coordinador: coordinador.nombre,
      ultimoCoordinador: coordinador.nombre,
      revisadoEnLocal: ahora,
      actualizadoPorModulo: 'coordinadores'
    };

    if (esAprobacion) {
      Object.assign(payload, {
        estado: 'PENDIENTE_INVESTIGADOR',
        estadoProceso: 'PENDIENTE_INVESTIGADOR',
        estadoCoordinador: 'VALIDADO',
        validadoCoordinacion: true,
        validadoCoordinador: true,
        resultadoCoordinador: esCorreccion ? 'APROBADO_CON_CORRECCION' : 'APROBADO_SIN_CAMBIOS',

        /*
          La preferencia del estudiante se conserva intacta.
          La decisión de Coordinación vive en revisionCoordinador/tituloCoordinador.
        */
        tituloCoordinadorNumero: numeroElegido,
        tituloCoordinador: textoCorregido,
        tituloCoordinadorAntes: textoOriginal,
        tituloCoordinadorCorregido: esCorreccion ? textoCorregido : '',
        comentarioCoordinador: comentario,
        fechaValidacionCoordinador: ahora,
        fechaResolucion: ahora,

        /*
          Siempre viajan las tres propuestas a Investigación.
          Solo cambia el texto de la propuesta seleccionada cuando hubo corrección.
        */
        titulosEnviados: propuestasActualizadas,
        propuestasDetalle: propuestasActualizadas,
        titulo1: tituloPorNumero(propuestasActualizadas, 1),
        titulo2: tituloPorNumero(propuestasActualizadas, 2),
        titulo3: tituloPorNumero(propuestasActualizadas, 3),

        requiereAccionDe: 'INVESTIGACION',
        requiereRevision: false,
        permitirReenvio: false,
        puedeReenviar: false,
        devueltoPor: '',
        estadoInvestigador: 'PENDIENTE'
      });
    } else {
      Object.assign(payload, {
        estado: 'DEVUELTO',
        estadoProceso: 'DEVUELTO',
        estadoCoordinador: 'DEVUELTO',
        validadoCoordinacion: false,
        validadoCoordinador: false,
        resultadoCoordinador: 'DEVUELTO',
        comentarioCoordinador: comentario,
        observacion: comentario,
        observacionDevolucion: comentario,
        fechaResolucion: ahora,
        requiereAccionDe: 'ESTUDIANTE',
        requiereRevision: true,
        permitirReenvio: true,
        puedeReenviar: true,
        devueltoPor: 'COORDINADOR',
        intentosUsados: 0
      });
    }

    var historial = Array.isArray(titulo.historialProceso) ? titulo.historialProceso.slice() : [];
    historial.push({
      version: historial.length + 1,
      fechaEnvio: fechaIso(titulo.fechaEnvio) || ahora,
      tituloPreferidoNumero: titulo.tituloPreferidoNumero,
      titulosEnviados: propuestasOriginales,
      revisionCoordinador: revision
    });
    payload.historialProceso = historial;

    return firebaseService.guardarDocumento(config.collections.titulos, titulo.id, payload, { merge: true })
      .then(function () {
        return firebaseService.agregarDocumento(config.collections.logs, {
          tipo: 'REVISION_TITULO_COORDINADOR',
          accion: accionNormalizada,
          modulo: 'coordinadores',
          entidad: 'envios',
          entidadId: titulo.id,
          tituloId: titulo.id,
          cedula: titulo.cedula,
          nombres: titulo.nombres,
          carrera: titulo.carrera,
          periodoId: titulo.periodoId,
          estado: payload.estado,
          revision: revision,
          titulosEnviados: esAprobacion ? propuestasActualizadas : propuestasOriginales,
          fechaLocal: ahora
        }).catch(function () { return null; });
      })
      .then(function () {
        return Object.assign({}, titulo, payload, { raw: Object.assign({}, titulo.raw || {}, payload) });
      });
  }

  function tituloPorNumero(propuestas, numero) {
    var item = (propuestas || []).filter(function (p) {
      return Number(p.numero) === Number(numero);
    })[0];
    return item ? limpiar(item.tituloFinal || item.titulo || '') : '';
  }

  function perteneceACoordinador(titulo, coordinador) {
    var carreraTitulo = normalizarComparacion(titulo.carrera);
    var codigoTitulo = normalizarComparacion(titulo.codigoCarrera);
    if (!carreraTitulo && !codigoTitulo) return false;
    return (coordinador.carreras || []).some(function (carrera) {
      var valor = normalizarComparacion(carrera);
      if (!valor) return false;
      if (valor === '*' || valor === 'TODAS' || valor === 'TODOS' || valor === 'ALL') return true;
      return valor === carreraTitulo || valor === codigoTitulo ||
        (carreraTitulo && carreraTitulo.indexOf(valor) !== -1) ||
        (carreraTitulo && valor.indexOf(carreraTitulo) !== -1);
    });
  }

  function normalizarCoordinador(data) {
    var carreras = [];
    [data.carrerasNombres, data.carreras, data.carrerasAsignadas, data.carrerasIds, data.carrera].forEach(function (valor) {
      carreras = carreras.concat(normalizarCarreras(valor));
    });
    return {
      id: data.id || data._docId || limpiar(data.email || data.correo || data.nombre || data.nombres),
      nombre: limpiar(data.nombre || data.nombres || data.nombreCompleto || data.email || data.correo),
      email: limpiar(data.email || data.correo || '').toLowerCase(),
      carreras: limpiarUnicos(carreras),
      activo: data.activo !== false && String(data.estado || 'ACTIVO').toUpperCase() !== 'INACTIVO',
      raw: data
    };
  }

  function normalizarTitulo(data) {
    var propuestas = construirPropuestas(data);
    var preferido = Number(data.tituloPreferidoNumero || 1);
    var propuestaPreferida = propuestas.filter(function (item) { return Number(item.numero) === preferido; })[0] || propuestas[0] || {};
    var revisionCoord = data.revisionCoordinador || null;
    var estadoGeneral = String(data.estado || 'PENDIENTE_REVISION').toUpperCase();
    var estadoProceso = String(data.estadoProceso || '').toUpperCase();
    var estadoCoord = String(data.estadoCoordinador || (revisionCoord && revisionCoord.estado) || '').toUpperCase();
    var estadoInv = String(data.estadoInvestigador || (data.revisionInvestigador && data.revisionInvestigador.estado) || '').toUpperCase();

    if (!estadoCoord && (data.validadoCoordinador === true || estadoGeneral === 'PENDIENTE_INVESTIGADOR' || estadoProceso === 'PENDIENTE_INVESTIGADOR')) estadoCoord = 'VALIDADO';
    if (!estadoCoord && estadoGeneral === 'DEVUELTO' && String(data.devueltoPor || '').toUpperCase() === 'COORDINADOR') estadoCoord = 'DEVUELTO';
    if ((estadoGeneral === 'APROBADO_FINAL' || estadoProceso === 'APROBADO_FINAL') && !estadoInv) estadoInv = 'APROBADO';

    return {
      id: data.id || data._docId || '',
      cedula: soloNumeros(data.cedula || data.numeroIdentificacion),
      nombres: limpiar(data.nombres || data.nombreCompleto || data.nombre || 'Sin nombre'),
      carrera: limpiar(data.carreraNombre || data.carrera || data.nombreCarrera || ''),
      codigoCarrera: limpiar(data.carreraCodigo || data.codigoCarrera || ''),
      periodoId: limpiar(data.periodoId || data.periodoCanonicoId || data.periodo || ''),
      periodoLabel: limpiar(data.periodoNombre || data.periodoLabel || data.periodoId || ''),
      tipoTrabajo: normalizarTipoTrabajo(data.tipoTrabajo || data.tipoTrabajoLabel || data.modalidadTitulacion || data.modalidad || data.tipo || ''),
      estado: estadoGeneral,
      estadoProceso: estadoProceso,
      estadoCoordinador: estadoCoord,
      estadoInvestigador: estadoInv,
      revisionCoordinador: revisionCoord,
      revisionInvestigador: data.revisionInvestigador || null,
      tituloCoordinadorNumero: Number(data.tituloCoordinadorNumero || (revisionCoord && revisionCoord.tituloSeleccionadoNumero) || 0),
      tituloCoordinador: limpiar(data.tituloCoordinador || (revisionCoord && revisionCoord.tituloSeleccionadoTexto) || ''),
      resultadoCoordinador: limpiar(data.resultadoCoordinador || (revisionCoord && revisionCoord.resultado) || ''),
      tituloPreferidoNumero: preferido,
      tituloPreferidoTexto: limpiar(data.tituloPreferidoTexto || data.tituloElegido || data.tituloCoordinador || propuestaPreferida.tituloFinal || ''),
      titulosEnviados: propuestas,
      fechaEnvio: data.fechaEnvio || data.enviadoEn || data.creadoEn || data.actualizadoEnLocal || data.actualizadoEn || null,
      intentosUsados: Number(data.intentosUsados || data.numeroEnvios || 1),
      historialProceso: Array.isArray(data.historialProceso) ? data.historialProceso : [],
      raw: data
    };
  }

  function construirPropuestas(data) {
    if (Array.isArray(data.titulosEnviados) && data.titulosEnviados.length) return data.titulosEnviados;
    if (Array.isArray(data.propuestas) && data.propuestas.length) return data.propuestas;
    var detalles = Array.isArray(data.propuestasDetalle) ? data.propuestasDetalle : [];
    return [1, 2, 3].map(function (numero) {
      var titulo = limpiar(data['titulo' + numero]);
      if (!titulo) return null;
      var detalle = detalles.filter(function (item) { return Number(item.numero) === numero; })[0] || {};
      return Object.assign({}, detalle, { numero: numero, tituloFinal: titulo, preferido: Number(data.tituloPreferidoNumero) === numero });
    }).filter(Boolean);
  }

  function clasificarTitulo(titulo) {
    if (titulo.estado === 'APROBADO_FINAL' || titulo.estadoProceso === 'APROBADO_FINAL' || titulo.estadoInvestigador === 'APROBADO' || titulo.estadoInvestigador === 'APROBADO_CON_OBSERVACION') return 'APROBADOS';
    if (titulo.estadoCoordinador === 'DEVUELTO' || (titulo.estado === 'DEVUELTO' && String(titulo.raw && titulo.raw.devueltoPor || '').toUpperCase() === 'COORDINADOR')) return 'DEVUELTOS';
    if (titulo.estadoCoordinador === 'VALIDADO' || titulo.estado === 'PENDIENTE_INVESTIGADOR' || titulo.estadoProceso === 'PENDIENTE_INVESTIGADOR') return 'VALIDADOS';
    return 'POR_REVISAR';
  }

  function normalizarTipoTrabajo(value) {
    var texto = normalizarComparacion(value);
    if (!texto) return { id: 'SIN_TIPO', label: 'No registrado' };
    if (texto.indexOf('ARTIC') !== -1) return { id: 'ARTICULO', label: 'Artículo académico' };
    if (texto.indexOf('TRABAJO') !== -1 || texto.indexOf('TITULACION') !== -1) return { id: 'TRABAJO_TITULACION', label: 'Trabajo de Titulación' };
    return { id: texto.replace(/\s+/g, '_'), label: limpiar(value) };
  }

  function normalizarCarreras(value) {
    if (Array.isArray(value)) return value.map(function (item) {
      if (item && typeof item === 'object') return limpiar(item.nombreCarrera || item.carrera || item.nombre || item.codigo || item.id || '');
      return limpiar(item);
    }).filter(Boolean);
    return String(value || '').split(/[,;|]/).map(limpiar).filter(Boolean);
  }

  function limpiarUnicos(lista) {
    var out = [];
    (lista || []).forEach(function (item) { var v = limpiar(item); if (v && out.indexOf(v) === -1) out.push(v); });
    return out;
  }

  function fechaMs(value) {
    if (!value) return 0;
    if (value && typeof value.toDate === 'function') return value.toDate().getTime();
    if (value && typeof value.seconds === 'number') return value.seconds * 1000;
    var ms = new Date(value).getTime();
    return isNaN(ms) ? 0 : ms;
  }
  function fechaIso(value) { var ms = fechaMs(value); return ms ? new Date(ms).toISOString() : ''; }
  function soloNumeros(value) { return String(value || '').replace(/\D/g, ''); }
  function limpiar(value) { return String(value === undefined || value === null ? '' : value).replace(/\s+/g, ' ').trim(); }
  function normalizarComparacion(value) { return limpiar(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase(); }

  window.TACoordRepository = Object.freeze({
    listarCoordinadores: listarCoordinadores,
    listarTitulosParaCoordinador: listarTitulosParaCoordinador,
    cargarHistorialTitulo: cargarHistorialTitulo,
    revisarTitulo: revisarTitulo,
    perteneceACoordinador: perteneceACoordinador,
    normalizarTitulo: normalizarTitulo,
    clasificarTitulo: clasificarTitulo,
    normalizarTipoTrabajo: normalizarTipoTrabajo
  });
})();