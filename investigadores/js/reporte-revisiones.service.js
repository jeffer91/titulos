/* Motor compartido de reportes de revisiones de Investigación. */
(function () {
  'use strict';

  var ESTADOS_RESUELTOS = ['APROBADO', 'APROBADO_CON_OBSERVACION', 'DEVUELTO'];

  function normalizarLista(docs) {
    return (docs || []).map(normalizarRevision).filter(function (item) {
      return item && item.revisado;
    }).sort(function (a, b) {
      return fechaMs(b.fechaRevision) - fechaMs(a.fechaRevision);
    });
  }

  function normalizarRevision(data) {
    data = data || {};
    var revision = data.revisionInvestigador || {};
    var estadoRevision = normalizarEstado(
      revision.estado ||
      data.estadoInvestigador ||
      inferirEstadoLegacy(data)
    );
    var revisado = ESTADOS_RESUELTOS.indexOf(estadoRevision) !== -1 ||
      (
        data.investigacionRevisada === true &&
        estadoRevision &&
        estadoRevision !== 'PENDIENTE'
      );

    if (!revisado) return null;

    var fechaRevision = fechaIso(
      revision.fechaLocal ||
      data.fechaResolucionInvestigacion ||
      data.investigacionRevisadaEn ||
      data.fechaResolucion ||
      data.actualizadoEn ||
      data.actualizadoEnLocal
    );

    var resultado = resultadoRevision(estadoRevision, data.resultadoInvestigacion);

    return {
      id: limpiar(data.id || data._docId || ''),
      tituloId: limpiar(data.id || data._docId || ''),
      cedula: soloNumeros(data.cedula || data.numeroIdentificacion || ''),
      nombres: limpiar(data.nombres || data.nombreCompleto || data.nombre || ''),
      carrera: limpiar(data.carreraNombre || data.carrera || data.nombreCarrera || 'Sin carrera'),
      periodoId: limpiar(data.periodoId || data.periodoCanonicoId || ''),
      periodoLabel: limpiar(data.periodoNombre || data.periodoLabel || data.periodoId || data.periodoCanonicoId || ''),
      investigadorId: limpiar(revision.investigadorId || data.investigadorId || ''),
      investigadorCedula: soloNumeros(revision.investigadorCedula || data.investigadorCedula || ''),
      investigadorNombre: limpiar(revision.investigadorNombre || data.investigadorNombre || 'Sin investigador'),
      investigadorEmail: limpiar(revision.investigadorEmail || data.investigadorEmail || ''),
      estadoRevision: estadoRevision,
      resultado: resultado.codigo,
      resultadoLabel: resultado.label,
      observacion: limpiar(
        revision.observacion ||
        data.observacionInvestigacion ||
        data.observacionDevolucion ||
        ''
      ),
      fechaRevision: fechaRevision,
      fechaRevisionMs: fechaMs(fechaRevision),
      tituloFinal: limpiar(
        data.tituloFinal ||
        data.tituloFinalInvestigacion ||
        data.tituloCoordinador ||
        data.tituloPreferidoTexto ||
        data.tituloElegido ||
        ''
      ),
      estadoGlobal: normalizarEstado(data.estado || data.estadoProceso || ''),
      revisado: revisado,
      raw: data
    };
  }

  function filtrar(revisiones, filtros) {
    filtros = filtros || {};
    var periodo = normalizar(filtros.periodo);
    var investigador = normalizar(filtros.investigador);
    var carrera = normalizar(filtros.carrera);
    var resultado = normalizarEstado(filtros.resultado);
    var desde = inicioDiaMs(filtros.desde);
    var hasta = finDiaMs(filtros.hasta);

    return (revisiones || []).filter(function (item) {
      if (periodo && normalizar(item.periodoId || item.periodoLabel) !== periodo) return false;
      if (investigador) {
        var claves = [
          item.investigadorId,
          item.investigadorCedula,
          item.investigadorNombre
        ].map(normalizar);
        if (claves.indexOf(investigador) === -1) return false;
      }
      if (carrera && normalizar(item.carrera) !== carrera) return false;
      if (resultado && normalizarEstado(item.estadoRevision) !== resultado && normalizarEstado(item.resultado) !== resultado) return false;
      if (desde && Number(item.fechaRevisionMs || 0) < desde) return false;
      if (hasta && Number(item.fechaRevisionMs || 0) > hasta) return false;
      return true;
    });
  }

  function resumen(revisiones) {
    var result = {
      total: 0,
      aprobados: 0,
      aprobadosConObservacion: 0,
      devueltos: 0,
      carreras: 0,
      investigadores: 0
    };
    var carreras = {};
    var investigadores = {};

    (revisiones || []).forEach(function (item) {
      result.total += 1;
      if (item.estadoRevision === 'APROBADO') result.aprobados += 1;
      if (item.estadoRevision === 'APROBADO_CON_OBSERVACION') {
        result.aprobados += 1;
        result.aprobadosConObservacion += 1;
      }
      if (item.estadoRevision === 'DEVUELTO') result.devueltos += 1;
      if (item.carrera) carreras[normalizar(item.carrera)] = true;
      var invKey = normalizar(item.investigadorId || item.investigadorCedula || item.investigadorNombre);
      if (invKey) investigadores[invKey] = true;
    });

    result.carreras = Object.keys(carreras).length;
    result.investigadores = Object.keys(investigadores).length;
    return result;
  }

  function opciones(revisiones) {
    var periodos = {};
    var carreras = {};
    var investigadores = {};

    (revisiones || []).forEach(function (item) {
      var periodoId = limpiar(item.periodoId);
      if (periodoId) {
        periodos[normalizar(periodoId)] = {
          value: periodoId,
          label: limpiar(item.periodoLabel) || formatearPeriodo(periodoId)
        };
      }

      if (item.carrera) carreras[normalizar(item.carrera)] = item.carrera;

      var invKey = limpiar(item.investigadorId || item.investigadorCedula || item.investigadorNombre);
      if (invKey) {
        investigadores[normalizar(invKey)] = {
          value: invKey,
          label: item.investigadorNombre || item.investigadorCedula || item.investigadorId
        };
      }
    });

    return {
      periodos: valores(periodos).sort(compararLabel),
      carreras: valores(carreras).map(function (nombre) {
        return { value: nombre, label: nombre };
      }).sort(compararLabel),
      investigadores: valores(investigadores).sort(compararLabel),
      resultados: [
        { value: 'APROBADO', label: 'Aprobado' },
        { value: 'APROBADO_CON_OBSERVACION', label: 'Aprobado con observación' },
        { value: 'DEVUELTO', label: 'Devuelto' }
      ]
    };
  }

  function coincideInvestigador(item, investigador) {
    if (!item || !investigador) return false;
    var posibles = [
      item.investigadorId,
      item.investigadorCedula,
      item.investigadorNombre
    ].map(normalizar).filter(Boolean);
    var claves = [
      investigador.id,
      investigador.cedula,
      investigador.nombre
    ].map(normalizar).filter(Boolean);

    return claves.some(function (key) {
      return posibles.indexOf(key) !== -1;
    });
  }

  function inferirEstadoLegacy(data) {
    var estadoGlobal = normalizarEstado(data.estado || data.estadoProceso || '');
    if (data.investigacionRevisada !== true) return '';
    if (estadoGlobal === 'APROBADO_FINAL') return 'APROBADO';
    if (estadoGlobal === 'DEVUELTO') return 'DEVUELTO';
    return '';
  }

  function resultadoRevision(estado, resultadoRaw) {
    var raw = normalizarEstado(resultadoRaw);
    if (estado === 'DEVUELTO' || raw === 'DEVUELTO') {
      return { codigo: 'DEVUELTO', label: 'Devuelto' };
    }
    if (estado === 'APROBADO_CON_OBSERVACION' || raw === 'APROBADO_CON_CORRECCION') {
      return { codigo: 'APROBADO_CON_OBSERVACION', label: 'Aprobado con observación' };
    }
    return { codigo: 'APROBADO', label: 'Aprobado' };
  }

  function fechaIso(value) {
    if (!value) return '';
    try {
      if (typeof value.toDate === 'function') return value.toDate().toISOString();
      if (typeof value.seconds === 'number') return new Date(Number(value.seconds) * 1000).toISOString();
      var d = value instanceof Date ? value : new Date(value);
      return isNaN(d.getTime()) ? '' : d.toISOString();
    } catch (error) {
      return '';
    }
  }

  function fechaMs(value) {
    if (!value) return 0;
    if (typeof value === 'number') return value;
    var iso = fechaIso(value);
    return iso ? new Date(iso).getTime() : 0;
  }

  function inicioDiaMs(value) {
    if (!value) return 0;
    var d = new Date(String(value) + 'T00:00:00');
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }

  function finDiaMs(value) {
    if (!value) return 0;
    var d = new Date(String(value) + 'T23:59:59.999');
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }

  function formatearPeriodo(value) {
    var text = limpiar(value);
    var match = text.match(/(\d{4})[-_](\d{2}).*?(\d{4})[-_](\d{2})/);
    if (!match) return text;
    var meses = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return (meses[Number(match[2])] || match[2]) + ' ' + match[1] + ' a ' + (meses[Number(match[4])] || match[4]) + ' ' + match[3];
  }

  function valores(map) {
    return Object.keys(map || {}).map(function (key) { return map[key]; });
  }

  function compararLabel(a, b) {
    return String(a && a.label || '').localeCompare(String(b && b.label || ''));
  }

  function normalizarEstado(value) {
    return normalizar(value).replace(/\s+/g, '_');
  }

  function normalizar(value) {
    return limpiar(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase();
  }

  function soloNumeros(value) {
    return String(value || '').replace(/\D/g, '');
  }

  function limpiar(value) {
    return String(value === undefined || value === null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  window.TARevisionReportService = Object.freeze({
    normalizarLista: normalizarLista,
    normalizarRevision: normalizarRevision,
    filtrar: filtrar,
    resumen: resumen,
    opciones: opciones,
    coincideInvestigador: coincideInvestigador,
    formatearPeriodo: formatearPeriodo
  });
})();