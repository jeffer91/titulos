/* Servicio de paginación para el módulo estudiantes. */
(function () {
  'use strict';

  var pasos = [
    'consulta',
    'datos',
    'propuesta1',
    'propuesta2',
    'propuesta3',
    'resumen',
    'envio'
  ];

  var estado = {
    pasoActual: 'consulta',
    pasoMaximoHabilitado: 0,
    alCambiar: null,
    antesDeAvanzar: null
  };

  function iniciar(opciones) {
    opciones = opciones || {};

    if (Array.isArray(opciones.pasos) && opciones.pasos.length) {
      pasos = opciones.pasos.slice();
    }

    estado.alCambiar = typeof opciones.alCambiar === 'function' ? opciones.alCambiar : null;
    estado.antesDeAvanzar = typeof opciones.antesDeAvanzar === 'function' ? opciones.antesDeAvanzar : null;

    conectarBotonesPaso();
    conectarBotonesAccion();
    irA(pasos[0], true);
  }

  function conectarBotonesPaso() {
    buscarTodos('[data-step-target]').forEach(function (boton) {
      boton.addEventListener('click', function () {
        var destino = boton.getAttribute('data-step-target');
        var indiceDestino = obtenerIndice(destino);

        if (indiceDestino <= estado.pasoMaximoHabilitado) {
          irA(destino, true);
        }
      });
    });
  }

  function conectarBotonesAccion() {
    buscarTodos('[data-action="next"]').forEach(function (boton) {
      boton.addEventListener('click', function () {
        siguiente();
      });
    });

    buscarTodos('[data-action="prev"]').forEach(function (boton) {
      boton.addEventListener('click', function () {
        anterior();
      });
    });
  }

  function siguiente() {
    var actual = estado.pasoActual;
    var indiceActual = obtenerIndice(actual);
    var siguienteIndice = indiceActual + 1;

    if (siguienteIndice >= pasos.length) return;

    var destino = pasos[siguienteIndice];

    validarAntesDeAvanzar(actual, destino).then(function (puedeAvanzar) {
      if (!puedeAvanzar) return;
      habilitarHasta(destino);
      irA(destino, true);
    });
  }

  function anterior() {
    var indiceActual = obtenerIndice(estado.pasoActual);
    var anteriorIndice = indiceActual - 1;

    if (anteriorIndice < 0) return;

    irA(pasos[anteriorIndice], true);
  }

  function irA(paso, notificar) {
    var indice = obtenerIndice(paso);

    if (indice < 0) return false;
    if (indice > estado.pasoMaximoHabilitado) return false;

    estado.pasoActual = paso;
    mostrarPaso(paso);
    actualizarBarra(paso);

    if (notificar && estado.alCambiar) {
      estado.alCambiar({
        paso: paso,
        indice: indice,
        pasos: pasos.slice()
      });
    }

    return true;
  }

  function habilitarHasta(paso) {
    var indice = obtenerIndice(paso);

    if (indice > estado.pasoMaximoHabilitado) {
      estado.pasoMaximoHabilitado = indice;
    }

    actualizarBarra(estado.pasoActual);
  }

  function habilitarPaso(paso) {
    habilitarHasta(paso);
  }

  function bloquearDesde(paso) {
    var indice = obtenerIndice(paso);

    if (indice < 0) return;

    estado.pasoMaximoHabilitado = Math.max(0, indice - 1);

    if (obtenerIndice(estado.pasoActual) >= indice) {
      irA(pasos[estado.pasoMaximoHabilitado], true);
      return;
    }

    actualizarBarra(estado.pasoActual);
  }

  function reiniciar() {
    estado.pasoActual = pasos[0];
    estado.pasoMaximoHabilitado = 0;
    irA(pasos[0], true);
  }

  function mostrarPaso(paso) {
    buscarTodos('[data-step]').forEach(function (seccion) {
      var esActiva = seccion.getAttribute('data-step') === paso;
      seccion.classList.toggle('is-active', esActiva);
      seccion.classList.toggle('is-hidden', !esActiva);
    });

    window.setTimeout(function () {
      var seccionActiva = buscar('[data-step="' + paso + '"]');
      if (seccionActiva && seccionActiva.scrollIntoView) {
        seccionActiva.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 40);
  }

  function actualizarBarra(paso) {
    var indiceActual = obtenerIndice(paso);

    buscarTodos('[data-step-target]').forEach(function (boton) {
      var destino = boton.getAttribute('data-step-target');
      var indiceDestino = obtenerIndice(destino);
      var activo = indiceDestino === indiceActual;
      var completo = indiceDestino < indiceActual;
      var habilitado = indiceDestino <= estado.pasoMaximoHabilitado;

      boton.classList.toggle('is-active', activo);
      boton.classList.toggle('is-complete', completo);
      boton.disabled = !habilitado;
    });
  }

  function validarAntesDeAvanzar(actual, destino) {
    if (!estado.antesDeAvanzar) {
      return Promise.resolve(true);
    }

    try {
      var resultado = estado.antesDeAvanzar(actual, destino);

      if (resultado && typeof resultado.then === 'function') {
        return resultado.then(Boolean).catch(function () {
          return false;
        });
      }

      return Promise.resolve(Boolean(resultado));
    } catch (error) {
      return Promise.resolve(false);
    }
  }

  function obtenerIndice(paso) {
    return pasos.indexOf(paso);
  }

  function obtenerPasoActual() {
    return estado.pasoActual;
  }

  function obtenerPasos() {
    return pasos.slice();
  }

  function buscar(selector) {
    return document.querySelector(selector);
  }

  function buscarTodos(selector) {
    return Array.prototype.slice.call(document.querySelectorAll(selector));
  }

  window.TAEstudiantePaginacion = Object.freeze({
    iniciar: iniciar,
    siguiente: siguiente,
    anterior: anterior,
    irA: irA,
    habilitarHasta: habilitarHasta,
    habilitarPaso: habilitarPaso,
    bloquearDesde: bloquearDesde,
    reiniciar: reiniciar,
    obtenerPasoActual: obtenerPasoActual,
    obtenerPasos: obtenerPasos
  });
})();