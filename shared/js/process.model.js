/* Modelo compartido del flujo de títulos. Sin dependencias externas. */
(function () {
  'use strict';

  var ESTADOS = Object.freeze({
    SIN_ENVIO: 'SIN_ENVIO',
    COORDINACION_PENDIENTE: 'COORDINACION_PENDIENTE',
    INVESTIGACION_PENDIENTE: 'INVESTIGACION_PENDIENTE',
    DEVUELTO_COORDINACION: 'DEVUELTO_COORDINACION',
    DEVUELTO_INVESTIGACION: 'DEVUELTO_INVESTIGACION',
    DEVUELTO_ADMIN: 'DEVUELTO_ADMIN',
    APROBADO_FINAL: 'APROBADO_FINAL',
    ARCHIVADO_ADMIN: 'ARCHIVADO_ADMIN'
  });

  var ALIASES_ESTADO = Object.freeze({
    PENDIENTE_COORDINADOR: ESTADOS.COORDINACION_PENDIENTE,
    COORDINACION_PENDIENTE: ESTADOS.COORDINACION_PENDIENTE,
    PENDIENTE_INVESTIGADOR: ESTADOS.INVESTIGACION_PENDIENTE,
    INVESTIGACION_PENDIENTE: ESTADOS.INVESTIGACION_PENDIENTE,
    DEVUELTO_COORDINADOR: ESTADOS.DEVUELTO_COORDINACION,
    DEVUELTO_COORDINACION: ESTADOS.DEVUELTO_COORDINACION,
    DEVUELTO_INVESTIGADOR: ESTADOS.DEVUELTO_INVESTIGACION,
    DEVUELTO_INVESTIGACION: ESTADOS.DEVUELTO_INVESTIGACION,
    APROBADO_FINAL: ESTADOS.APROBADO_FINAL,
    ARCHIVADO: ESTADOS.ARCHIVADO_ADMIN,
    ARCHIVADO_ADMIN: ESTADOS.ARCHIVADO_ADMIN
  });

  var LABELS = Object.freeze({
    SIN_ENVIO: 'Sin envío',
    COORDINACION_PENDIENTE: 'Por revisar en Coordinación',
    INVESTIGACION_PENDIENTE: 'Validado por Coordinación · Esperando Investigación',
    DEVUELTO_COORDINACION: 'Devuelto',
    DEVUELTO_INVESTIGACION: 'Devuelto',
    DEVUELTO_ADMIN: 'Devuelto',
    APROBADO_FINAL: 'Aprobado',
    ARCHIVADO_ADMIN: 'Archivado'
  });

  function limpiar(value) {
    return String(value === undefined || value === null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function soloNumeros(value) {
    return String(value || '').replace(/\D/g, '');
  }

  function normalizarTexto(value) {
    return limpiar(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  }

  function normalizarPeriodo(value) {
    var raw = limpiar(value && typeof value === 'object' ? (value.id || value.periodoId || value.label || '') : value);
    if (!raw) return '';
    return raw.replace(/\s+/g, '_').replace(/[^A-Za-z0-9_-]/g, '').toUpperCase();
  }

  function construirTituloId(periodoId, cedula) {
    return (normalizarPeriodo(periodoId) || 'SIN_PERIODO') + '__' + (soloNumeros(cedula) || 'SIN_CEDULA');
  }

  function estadoProceso(titulo) {
    if (!titulo) return ESTADOS.SIN_ENVIO;
    var explicito = normalizarTexto(titulo.estadoProceso);
    if (ALIASES_ESTADO[explicito]) return ALIASES_ESTADO[explicito];
    if (ESTADOS[explicito]) return ESTADOS[explicito];

    var inv = normalizarTexto(titulo.estadoInvestigador || (titulo.revisionInvestigador && titulo.revisionInvestigador.estado));
    var coord = normalizarTexto(titulo.estadoCoordinador || (titulo.revisionCoordinador && titulo.revisionCoordinador.estado));
    var general = normalizarTexto(titulo.estado);

    if (titulo.procesoCerrado === true || inv === 'APROBADO' || general === 'APROBADO_FINAL' || (general === 'APROBADO' && (titulo.investigacionRevisada === true || titulo.revisionInvestigador))) return ESTADOS.APROBADO_FINAL;
    if (inv === 'DEVUELTO') return ESTADOS.DEVUELTO_INVESTIGACION;
    if (coord === 'DEVUELTO' || general === 'DEVUELTO') return ESTADOS.DEVUELTO_COORDINACION;
    if (coord === 'VALIDADO' || coord === 'APROBADO' || coord === 'APROBADO_CON_OBSERVACION' || general === 'VALIDADO' || ((general === 'APROBADO' || general === 'APROBADO_CON_OBSERVACION') && !titulo.revisionInvestigador)) return ESTADOS.INVESTIGACION_PENDIENTE;
    if (general === 'ARCHIVADO' || general === 'ARCHIVADO_ADMIN') return ESTADOS.ARCHIVADO_ADMIN;
    if (Array.isArray(titulo.titulosEnviados) && titulo.titulosEnviados.length) return ESTADOS.COORDINACION_PENDIENTE;
    return ESTADOS.SIN_ENVIO;
  }

  function esDevuelto(estado) {
    var e = normalizarTexto(estado);
    return e === ESTADOS.DEVUELTO_COORDINACION || e === ESTADOS.DEVUELTO_INVESTIGACION || e === ESTADOS.DEVUELTO_ADMIN;
  }

  function esFinal(estado) {
    return normalizarTexto(estado) === ESTADOS.APROBADO_FINAL;
  }

  function labelEstado(estado) {
    return LABELS[normalizarTexto(estado)] || limpiar(estado) || 'Sin estado';
  }

  function normalizarTipo(value) {
    var t = normalizarTexto(value && typeof value === 'object' ? (value.id || value.label || '') : value);
    if (t.indexOf('ARTIC') !== -1) return { id: 'ARTICULO', label: 'Artículo académico' };
    if (t.indexOf('TRABAJO') !== -1 || t.indexOf('TITUL') !== -1) return { id: 'TRABAJO_TITULACION', label: 'Trabajo de Titulación' };
    return { id: t || 'SIN_TIPO', label: t ? limpiar(value) : 'Sin tipo' };
  }

  function copiarTitulos(items) {
    return (Array.isArray(items) ? items : []).map(function (item, index) {
      return {
        numero: Number(item.numero || index + 1),
        tituloFinal: limpiar(item.tituloFinal || item.titulo || ''),
        preferido: Boolean(item.preferido)
      };
    });
  }

  function fechaMs(value) {
    if (!value) return 0;
    if (value && typeof value.toDate === 'function') return value.toDate().getTime();
    if (value && typeof value.seconds === 'number') return Number(value.seconds) * 1000;
    var ms = new Date(value).getTime();
    return Number.isFinite(ms) ? ms : 0;
  }

  function fechaVisible(value) {
    var ms = fechaMs(value);
    if (!ms) return '—';
    try {
      return new Intl.DateTimeFormat('es-EC', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(ms));
    } catch (error) {
      return new Date(ms).toLocaleString();
    }
  }

  function tituloSeleccionado(titulo) {
    if (!titulo) return '';
    if (limpiar(titulo.tituloSeleccionadoTexto)) return limpiar(titulo.tituloSeleccionadoTexto);
    if (titulo.revisionCoordinador && limpiar(titulo.revisionCoordinador.tituloSeleccionadoTexto)) {
      return limpiar(titulo.revisionCoordinador.tituloSeleccionadoTexto);
    }
    var numero = Number(titulo.tituloSeleccionadoNumero || (titulo.revisionCoordinador && titulo.revisionCoordinador.tituloSeleccionadoNumero) || 0);
    var lista = copiarTitulos(titulo.titulosEnviados);
    var elegido = lista.filter(function (item) { return Number(item.numero) === numero; })[0];
    return elegido ? elegido.tituloFinal : '';
  }

  function motivoDevolucion(titulo) {
    if (!titulo) return '';
    var estado = estadoProceso(titulo);
    if (estado === ESTADOS.DEVUELTO_INVESTIGACION && titulo.revisionInvestigador) return limpiar(titulo.revisionInvestigador.observacion || titulo.revisionInvestigador.comentario);
    if (estado === ESTADOS.DEVUELTO_COORDINACION && titulo.revisionCoordinador) return limpiar(titulo.revisionCoordinador.observacion || titulo.revisionCoordinador.comentario);
    return limpiar(titulo.motivoDevolucion || titulo.ultimaObservacion || '');
  }

  function estadoClase(estado) {
    var e = normalizarTexto(estado);
    if (e === ESTADOS.APROBADO_FINAL) return 'success';
    if (esDevuelto(e)) return 'danger';
    if (e === ESTADOS.INVESTIGACION_PENDIENTE) return 'info';
    if (e === ESTADOS.COORDINACION_PENDIENTE) return 'warning';
    return 'muted';
  }

  window.TAProcessModel = Object.freeze({
    ESTADOS: ESTADOS,
    ALIASES_ESTADO: ALIASES_ESTADO,
    limpiar: limpiar,
    soloNumeros: soloNumeros,
    normalizarTexto: normalizarTexto,
    normalizarPeriodo: normalizarPeriodo,
    construirTituloId: construirTituloId,
    estadoProceso: estadoProceso,
    esDevuelto: esDevuelto,
    esFinal: esFinal,
    labelEstado: labelEstado,
    normalizarTipo: normalizarTipo,
    copiarTitulos: copiarTitulos,
    fechaMs: fechaMs,
    fechaVisible: fechaVisible,
    tituloSeleccionado: tituloSeleccionado,
    motivoDevolucion: motivoDevolucion,
    estadoClase: estadoClase
  });
})();
