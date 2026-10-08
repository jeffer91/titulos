/*
  Diagnóstico runtime para Estudiantes.
  - Registra errores JavaScript y promesas rechazadas.
  - No bloquea F12, Ctrl+Shift+I/J/C ni el menú contextual.
  - Expone la traza en window.TAEstudianteDiagnostico.
*/
(function () {
  'use strict';

  var BUILD = '20261008-50';
  var eventos = [];
  var MAX_EVENTOS = 80;

  function registrar(tipo, detalle) {
    var item = {
      fecha: new Date().toISOString(),
      tipo: String(tipo || 'INFO'),
      build: BUILD,
      detalle: limpiarDetalle(detalle)
    };

    eventos.push(item);
    if (eventos.length > MAX_EVENTOS) eventos.splice(0, eventos.length - MAX_EVENTOS);

    if (item.tipo === 'ERROR' || item.tipo === 'UNHANDLED_REJECTION') {
      console.error('[Estudiantes diagnóstico]', item);
    } else {
      console.info('[Estudiantes diagnóstico]', item);
    }

    emitir('ta:runtime-diagnostico', item);
    return item;
  }

  function limpiarDetalle(detalle) {
    if (!detalle) return {};
    if (detalle instanceof Error) return serializarError(detalle);
    if (typeof detalle !== 'object') return { mensaje: String(detalle) };

    var salida = {};
    Object.keys(detalle).forEach(function (key) {
      var value = detalle[key];
      if (value instanceof Error) salida[key] = serializarError(value);
      else if (typeof value === 'function') salida[key] = '[function]';
      else salida[key] = value;
    });
    return salida;
  }

  function serializarError(error) {
    if (!error) return {};
    return {
      name: error.name || 'Error',
      codigo: error.codigo || error.code || '',
      mensaje: error.message || String(error),
      stack: error.stack || '',
      httpStatus: error.httpStatus || '',
      firebaseStatus: error.firebaseStatus || '',
      firebaseMessage: error.firebaseMessage || ''
    };
  }

  function obtener() {
    return eventos.slice();
  }

  function limpiar() {
    eventos = [];
  }

  function emitir(nombre, detail) {
    try {
      if (typeof window.CustomEvent === 'function') {
        window.dispatchEvent(new CustomEvent(nombre, { detail: detail }));
      }
    } catch (error) {
      console.warn('[Estudiantes diagnóstico] No se pudo emitir evento:', error);
    }
  }

  /*
    IMPORTANTE:
    Esta capa de diagnóstico NO registra listeners de keydown ni contextmenu.
    F12, Ctrl+Shift+I/J/C y el clic derecho quedan completamente en manos
    del navegador. No se usa preventDefault(), stopPropagation() ni
    stopImmediatePropagation() para esos eventos.
  */

  window.addEventListener('error', function (event) {
    registrar('ERROR', {
      mensaje: event && event.message || 'Error JavaScript no identificado.',
      archivo: event && event.filename || '',
      linea: event && event.lineno || 0,
      columna: event && event.colno || 0,
      error: event && event.error || null
    });
  });

  window.addEventListener('unhandledrejection', function (event) {
    registrar('UNHANDLED_REJECTION', {
      error: event && event.reason || null,
      mensaje: event && event.reason && event.reason.message
        ? event.reason.message
        : String(event && event.reason || 'Promesa rechazada sin manejar.')
    });
  });

  document.addEventListener('DOMContentLoaded', function () {
    /*
      Limpia únicamente handlers directos heredados. No instalamos un handler
      sustituto: el menú contextual y DevTools quedan nativos.
    */
    document.oncontextmenu = null;
    window.oncontextmenu = null;
    document.onkeydown = null;
    window.onkeydown = null;
    registrar('INICIO', {
      mensaje: 'Diagnóstico runtime activo.',
      userAgent: navigator.userAgent || ''
    });
  }, { once: true });

  window.TAEstudianteDiagnostico = Object.freeze({
    build: BUILD,
    registrar: registrar,
    obtener: obtener,
    limpiar: limpiar,
    serializarError: serializarError
  });
})();