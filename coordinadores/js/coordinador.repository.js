/* Datos y flujo de primera revisión del módulo Coordinadores. */
(function () {
  'use strict';

  var config = window.TA_COORDINADORES_CONFIG;
  var firebaseService = window.TACoordFirebaseService;

  function listarCoordinadores() {
    return firebaseService.listarDocumentos(config.collections.coordinadores, { limit: 500 })
      .then(function (docs) {
        return (docs || []).map(normalizarCoordinador).filter(function (item) {
          return item.activo && item.nombre;
        }).sort(function (a, b) {
          return a.nombre.localeCompare(b.nombre);
        });
      });
  }

  function listarTitulosParaCoordinador(coordinador) {
    if (!coordinador || !coordinador.carreras.length) return Promise.resolve([]);
    return firebaseService.listarDocumentos(config.collections.titulos, { limit: 2000 })
      .then(function (docs) {
        return (docs || []).map(normalizarTitulo).filter(function (titulo) {
          return perteneceACoordinador(titulo, coordinador);
        }).sort(function (a, b) {
          return fechaMs(b.fechaEnvio) - fechaMs(a.fechaEnvio);
        });
      });
  }

  function cargarHistorialTitulo(titulo) {
    if (!titulo || !titulo.id) return Promise.resolve({ proceso: [], archivos: [], logs: [] });
    return Promise.all([
      firebaseService.listarDocumentos(config.collections.titulosHistorial, {
        where: ['idOriginal', '==', titulo.id],
        limit: 100
      }).catch(function () { return []; }),
      firebaseService.listarDocumentos(config.collections.logs, {
        where: ['tituloId', '==', titulo.id],
        limit: 300
      }).catch(function () { return []; })
    ]).then(function (resultados) {
      return {
        proceso: Array.isArray(titulo.historialProceso) ? titulo.historialProceso.slice() : [],
        archivos: resultados[0] || [],
        logs: (resultados[1] || []).sort(function (a, b) {
          return fechaMs(a.creadoEn || a.fechaLocal) - fechaMs(b.creadoEn || b.fechaLocal);
        })
      };
    });
  }

  function revisarTitulo(titulo, accion, observacion, coordinador, tituloSeleccionadoNumero) {
    if (!titulo || !titulo.id) return Promise.reject(new Error('No se encontró el título seleccionado.'));
    if (!coordinador || !coordinador.id) return Promise.reject(new Error('No se encontró el coordinador activo.'));
    if (!perteneceACoordinador(titulo, coordinador)) return Promise.reject(new Error('El título no pertenece a las carreras del coordinador.'));

    var accionNormalizada = String(accion || '').trim().toUpperCase();
    if (accionNormalizada !== 'VALIDAR' && accionNormalizada !== 'DEVOLVER') {
      return Promise.reject(new Error('Acción de revisión no válida.'));
    }

    var comentario = limpiar(observacion);
    if (accionNormalizada === 'DEVOLVER' && !comentario) {
      return Promise.reject(new Error('Escribe un comentario para devolver el título.'));
    }

    var propuestas = Array.isArray(titulo.titulosEnviados) ? titulo.titulosEnviados : [];
    var numeroElegido = Number(tituloSeleccionadoNumero || 0);
    var elegida = propuestas.filter(function (item) {
      return Number(item.numero) === numeroElegido;
    })[0] || null;

    if (accionNormalizada === 'VALIDAR' && (!numeroElegido || !elegida)) {
      return Promise.reject(new Error('Selecciona el título que será validado por Coordinación.'));
    }

    var ahora = new Date().toISOString();
    var revision = {
      estado: accionNormalizada === 'VALIDAR' ? 'VALIDADO' : 'DEVUELTO',
      accion: accionNormalizada,
      observacion: comentario,
      coordinadorId: coordinador.id,
      coordinadorEmail: coordinador.email || '',
      coordinadorNombre: coordinador.nombre,
      tituloSeleccionadoNumero: accionNormalizada === 'VALIDAR' ? numeroElegido : null,
      tituloSeleccionadoTexto: accionNormalizada === 'VALIDAR' && elegida ? limpiar(elegida.tituloFinal) : '',
      fechaLocal: ahora
    };

    var historial = Array.isArray(titulo.historialProceso) ? titulo.historialProceso.slice() : [];
    historial.push({
      version: historial.length + 1,
      envioNumero: Number(titulo.intentosUsados || historial.length + 1),
      fechaEnvio: fechaIso(titulo.fechaEnvio) || ahora,
      tituloPreferidoNumero: titulo.tituloPreferidoNumero,
      titulosEnviados: copiarPropuestas(propuestas),
      revisionCoordinador: revision
    });

    var payload = {
      estado: revision.estado,
      estadoCoordinador: revision.estado,
      revisionCoordinador: revision,
      revision: revision,
      coordinadorRevisado: true,
      validadoCoordinacion: accionNormalizada === 'VALIDAR',
      historialProceso: historial,
      revisadoPor: coordinador.email || coordinador.id,
      revisadoPorNombre: coordinador.nombre,
      revisadoEnLocal: ahora,
      actualizadoPorModulo: 'coordinadores'
    };

    if (accionNormalizada === 'VALIDAR') {
      payload.tituloPreferidoNumero = numeroElegido;
      payload.tituloPreferidoTexto = revision.tituloSeleccionadoTexto;
      payload.estadoInvestigador = titulo.estadoInvestigador && titulo.estadoInvestigador !== 'DEVUELTO' ? titulo.estadoInvestigador : 'PENDIENTE';
    } else {
      payload.intentosUsados = 0;
      payload.puedeReenviar = true;
    }

    return firebaseService.guardarDocumento(config.collections.titulos, titulo.id, payload, { merge: true })
      .then(function () {
        return firebaseService.agregarDocumento(config.collections.logs, {
          accion: 'REVISION_TITULO_COORDINADOR',
          modulo: 'coordinadores',
          tituloId: titulo.id,
          cedula: titulo.cedula,
          nombres: titulo.nombres,
          carrera: titulo.carrera,
          periodoId: titulo.periodoId,
          estado: revision.estado,
          revision: revision
        }).catch(function () { return null; });
      })
      .then(function () {
        return Object.assign({}, titulo, payload, { raw: Object.assign({}, titulo.raw || {}, payload) });
      });
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
    return {
      id: data.id || limpiar(data.email || data.correo || data.nombre || data.nombres),
      nombre: limpiar(data.nombre || data.nombres || data.nombreCompleto || data.email || data.correo),
      email: limpiar(data.email || data.correo || '').toLowerCase(),
      carreras: normalizarCarreras(data.carreras || data.carrerasAsignadas || data.carrera || []),
      activo: data.activo !== false,
      raw: data
    };
  }

  function normalizarTitulo(data) {
    var propuestas = Array.isArray(data.titulosEnviados) ? data.titulosEnviados : (Array.isArray(data.propuestas) ? data.propuestas : []);
    var preferido = Number(data.tituloPreferidoNumero || 1);
    var propuestaPreferida = propuestas.filter(function (item) { return Number(item.numero) === preferido; })[0] || propuestas[0] || {};
    var revisionCoord = data.revisionCoordinador || (data.revision && (data.revision.coordinadorId || data.revision.coordinadorEmail) ? data.revision : null);
    var estadoCoord = String(data.estadoCoordinador || (revisionCoord && revisionCoord.estado) || '').toUpperCase();
    var estadoGeneral = String(data.estado || 'ENVIADO').toUpperCase();
    var revisionInv = data.revisionInvestigador || null;
    var estadoInv = String(data.estadoInvestigador || (revisionInv && revisionInv.estado) || '').toUpperCase();
    var tipo = normalizarTipoTrabajo(data.tipoTrabajo || data.tipo || data.tipoTitulacion || data.modalidadTitulacion || data.opcionTitulacion || '');

    if (!estadoCoord && (estadoGeneral === 'APROBADO' || estadoGeneral === 'APROBADO_CON_OBSERVACION') && (data.revisadoPor || revisionCoord)) {
      estadoCoord = 'VALIDADO';
    }
    if (!estadoCoord && estadoGeneral === 'DEVUELTO') estadoCoord = 'DEVUELTO';

    return {
      id: data.id || data._docId || '',
      cedula: soloNumeros(data.cedula || data.numeroIdentificacion),
      nombres: limpiar(data.nombres || data.nombreCompleto || data.nombre || 'Sin nombre'),
      carrera: limpiar(data.carrera || data.nombreCarrera || ''),
      codigoCarrera: limpiar(data.codigoCarrera || ''),
      periodoId: limpiar(data.periodoId || data.periodo || ''),
      periodoLabel: limpiar(data.periodoLabel || data.periodoNombre || data.periodoId || data.periodo || ''),
      tipoTrabajo: tipo,
      estado: estadoGeneral,
      estadoCoordinador: estadoCoord,
      estadoInvestigador: estadoInv,
      revisionCoordinador: revisionCoord,
      revisionInvestigador: revisionInv,
      tituloPreferidoNumero: preferido,
      tituloPreferidoTexto: limpiar(data.tituloPreferidoTexto || propuestaPreferida.tituloFinal || ''),
      titulosEnviados: propuestas,
      fechaEnvio: data.enviadoEn || data.creadoEn || data.actualizadoEnLocal || data.actualizadoEn || null,
      intentosUsados: Number(data.intentosUsados || 1),
      historialProceso: Array.isArray(data.historialProceso) ? data.historialProceso : [],
      raw: data
    };
  }

  function clasificarTitulo(titulo) {
    if (titulo.estadoInvestigador === 'APROBADO' || titulo.estadoInvestigador === 'APROBADO_CON_OBSERVACION') return 'APROBADOS';
    if (titulo.estadoCoordinador === 'DEVUELTO' || titulo.estado === 'DEVUELTO') return 'DEVUELTOS';
    if (titulo.estadoCoordinador === 'VALIDADO' || titulo.estado === 'VALIDADO' ||
      ((titulo.estado === 'APROBADO' || titulo.estado === 'APROBADO_CON_OBSERVACION') && !titulo.estadoInvestigador)) return 'VALIDADOS';
    return 'POR_REVISAR';
  }

  function normalizarTipoTrabajo(value) {
    var texto = normalizarComparacion(value);
    if (!texto) return { id: 'SIN_TIPO', label: 'Sin tipo' };
    if (texto.indexOf('ARTIC') !== -1) return { id: 'ARTICULO', label: 'Artículo académico' };
    if (texto.indexOf('TRABAJO') !== -1 || texto.indexOf('TITULACION') !== -1) return { id: 'TRABAJO_TITULACION', label: 'Trabajo de Titulación' };
    return { id: texto.replace(/\s+/g, '_'), label: limpiar(value) };
  }

  function normalizarCarreras(value) {
    if (Array.isArray(value)) {
      return value.map(function (item) {
        return limpiar(item && typeof item === 'object' ? (item.nombreCarrera || item.carrera || item.nombre || item.codigo || '') : item);
      }).filter(Boolean);
    }
    return String(value || '').split(/[,;|]/).map(limpiar).filter(Boolean);
  }

  function copiarPropuestas(propuestas) {
    return (propuestas || []).map(function (item) {
      return {
        numero: Number(item.numero || 0),
        tituloFinal: limpiar(item.tituloFinal || item.titulo || ''),
        temaGeneral: limpiar(item.temaGeneral || ''),
        problemaNecesidad: limpiar(item.problemaNecesidad || ''),
        preferido: Boolean(item.preferido)
      };
    });
  }

  function fechaMs(value) {
    if (!value) return 0;
    if (value && typeof value.toDate === 'function') return value.toDate().getTime();
    if (value && typeof value.seconds === 'number') return value.seconds * 1000;
    var ms = new Date(value).getTime();
    return isNaN(ms) ? 0 : ms;
  }

  function fechaIso(value) {
    var ms = fechaMs(value);
    return ms ? new Date(ms).toISOString() : '';
  }

  function soloNumeros(value) { return String(value || '').replace(/\D/g, ''); }
  function limpiar(value) { return String(value === undefined || value === null ? '' : value).replace(/\s+/g, ' ').trim(); }
  function normalizarComparacion(value) {
    return limpiar(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  }

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
