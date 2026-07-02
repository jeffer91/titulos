/*
  Archivo: paginacion.service.js
  Ruta: estudiantes/js/paginacion.service.js
  Funciones principales del archivo:
  - Controlar la navegación por pasos del módulo estudiantes.
  - Habilitar progresivamente los pasos del formulario.
  - Evitar que el estudiante avance sin pasar validaciones.
  - Mostrar y ocultar secciones según el paso actual.
  - Controlar botones de avance, retroceso y botones de la barra de pasos.
  - Evitar eventos duplicados si el servicio se inicializa más de una vez.
*/
(function () {
  'use strict';

var pasos = [
  'consulta',
  'datos',
  'contacto',
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
    antesDeAvanzar: null,
    avanzando: false,
    iniciado: false
  };

  function iniciar(opciones) {
    opciones = opciones || {};

    if (Array.isArray(opciones.pasos) && opciones.pasos.length) {
      pasos = opciones.pasos.slice();
    }

    estado.alCambiar = typeof opciones.alCambiar === 'function' ? opciones.alCambiar : null;
    estado.antesDeAvanzar = typeof opciones.antesDeAvanzar === 'function' ? opciones.antesDeAvanzar : null;
    estado.pasoActual = pasos[0] || 'consulta';
    estado.pasoMaximoHabilitado = 0;
    estado.avanzando = false;
    estado.iniciado = true;

    conectarBotonesPaso();
    conectarBotonesAccion();

    irA(estado.pasoActual, true);
  }

  function conectarBotonesPaso() {
    buscarTodos('[data-step-target]').forEach(function (boton) {
      if (boton.dataset.paginacionStepBound === 'true') {
        return;
      }

      boton.dataset.paginacionStepBound = 'true';

      boton.addEventListener('click', function () {
        var destino = boton.getAttribute('data-step-target');

        if (puedeIrA(destino)) {
          irA(destino, true);
        }
      });
    });
  }

  function conectarBotonesAccion() {
    buscarTodos('[data-action="next"]').forEach(function (boton) {
      if (boton.dataset.paginacionNextBound === 'true') {
        return;
      }

      boton.dataset.paginacionNextBound = 'true';

      boton.addEventListener('click', function () {
        siguiente();
      });
    });

    buscarTodos('[data-action="prev"]').forEach(function (boton) {
      if (boton.dataset.paginacionPrevBound === 'true') {
        return;
      }

      boton.dataset.paginacionPrevBound = 'true';

      boton.addEventListener('click', function () {
        anterior();
      });
    });
  }

  function siguiente() {
    var actual = estado.pasoActual;
    var indiceActual = obtenerIndice(actual);
    var siguienteIndice = indiceActual + 1;
    var destino = '';

    if (estado.avanzando) {
      return Promise.resolve(false);
    }

    if (indiceActual < 0 || siguienteIndice >= pasos.length) {
      return Promise.resolve(false);
    }

    destino = pasos[siguienteIndice];
    estado.avanzando = true;
    actualizarBotonesAccion();

    return validarAntesDeAvanzar(actual, destino)
      .then(function (puedeAvanzar) {
        if (!puedeAvanzar) {
          return false;
        }

        habilitarHasta(destino);
        return irA(destino, true);
      })
      .catch(function () {
        return false;
      })
      .then(function (resultado) {
        estado.avanzando = false;
        actualizarBotonesAccion();
        return Boolean(resultado);
      });
  }

  function anterior() {
    var indiceActual = obtenerIndice(estado.pasoActual);
    var anteriorIndice = indiceActual - 1;

    if (estado.avanzando) {
      return false;
    }

    if (anteriorIndice < 0) {
      return false;
    }

    return irA(pasos[anteriorIndice], true);
  }

  function irA(paso, notificar, opciones) {
    var indice = obtenerIndice(paso);

    opciones = opciones || {};

    if (indice < 0) {
      return false;
    }

    if (!opciones.forzar && indice > estado.pasoMaximoHabilitado) {
      return false;
    }

    estado.pasoActual = paso;

    mostrarPaso(paso);
    actualizarBarra(paso);
    actualizarBotonesAccion();

    if (notificar && estado.alCambiar) {
      estado.alCambiar({
        paso: paso,
        indice: indice,
        pasoMaximoHabilitado: estado.pasoMaximoHabilitado,
        pasos: pasos.slice()
      });
    }

    return true;
  }

  function habilitarHasta(paso) {
    var indice = obtenerIndice(paso);

    if (indice < 0) {
      return false;
    }

    if (indice > estado.pasoMaximoHabilitado) {
      estado.pasoMaximoHabilitado = indice;
    }

    actualizarBarra(estado.pasoActual);
    actualizarBotonesAccion();

    return true;
  }

  function habilitarPaso(paso) {
    return habilitarHasta(paso);
  }

  function bloquearDesde(paso) {
    var indice = obtenerIndice(paso);
    var nuevoMaximo = 0;

    if (indice < 0) {
      return false;
    }

    nuevoMaximo = Math.max(0, indice - 1);
    estado.pasoMaximoHabilitado = nuevoMaximo;

    if (obtenerIndice(estado.pasoActual) >= indice) {
      irA(pasos[nuevoMaximo], true);
      return true;
    }

    actualizarBarra(estado.pasoActual);
    actualizarBotonesAccion();

    return true;
  }

  function reiniciar() {
    estado.pasoActual = pasos[0] || 'consulta';
    estado.pasoMaximoHabilitado = 0;
    estado.avanzando = false;

    irA(estado.pasoActual, true);

    return true;
  }

  function mostrarPaso(paso) {
    buscarTodos('[data-step]').forEach(function (seccion) {
      var esActiva = seccion.getAttribute('data-step') === paso;

      seccion.classList.toggle('is-active', esActiva);
      seccion.classList.toggle('is-hidden', !esActiva);
      seccion.setAttribute('aria-hidden', esActiva ? 'false' : 'true');
    });

    window.setTimeout(function () {
      var seccionActiva = buscar('[data-step="' + paso + '"]');

      if (seccionActiva && typeof seccionActiva.scrollIntoView === 'function') {
        seccionActiva.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }
    }, 40);
  }

  function actualizarBarra(paso) {
    var indiceActual = obtenerIndice(paso);

    buscarTodos('[data-step-target]').forEach(function (boton) {
      var destino = boton.getAttribute('data-step-target');
      var indiceDestino = obtenerIndice(destino);
      var activo = indiceDestino === indiceActual;
      var completo = indiceDestino >= 0 && indiceDestino < indiceActual;
      var habilitado = indiceDestino >= 0 && indiceDestino <= estado.pasoMaximoHabilitado;

      boton.classList.toggle('is-active', activo);
      boton.classList.toggle('is-complete', completo);
      boton.classList.toggle('is-disabled', !habilitado);
      boton.disabled = !habilitado;
      boton.setAttribute('aria-current', activo ? 'step' : 'false');
    });
  }

  function actualizarBotonesAccion() {
    var indiceActual = obtenerIndice(estado.pasoActual);
    var esPrimero = indiceActual <= 0;
    var esUltimo = indiceActual >= pasos.length - 1;

    buscarTodos('[data-action="prev"]').forEach(function (boton) {
      boton.disabled = estado.avanzando || esPrimero;
      boton.classList.toggle('is-disabled', boton.disabled);
    });

    buscarTodos('[data-action="next"]').forEach(function (boton) {
      boton.disabled = estado.avanzando || esUltimo;
      boton.classList.toggle('is-disabled', boton.disabled);
    });
  }

  function validarAntesDeAvanzar(actual, destino) {
    if (!estado.antesDeAvanzar) {
      return Promise.resolve(true);
    }

    try {
      var resultado = estado.antesDeAvanzar(actual, destino);

      if (resultado && typeof resultado.then === 'function') {
        return resultado
          .then(function (valor) {
            return Boolean(valor);
          })
          .catch(function () {
            return false;
          });
      }

      return Promise.resolve(Boolean(resultado));
    } catch (error) {
      return Promise.resolve(false);
    }
  }

  function puedeIrA(paso) {
    var indice = obtenerIndice(paso);

    return indice >= 0 && indice <= estado.pasoMaximoHabilitado;
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

  function obtenerEstado() {
    return {
      pasoActual: estado.pasoActual,
      pasoMaximoHabilitado: estado.pasoMaximoHabilitado,
      pasoMaximoNombre: pasos[estado.pasoMaximoHabilitado] || '',
      avanzando: estado.avanzando,
      iniciado: estado.iniciado,
      pasos: pasos.slice()
    };
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
    puedeIrA: puedeIrA,
    obtenerPasoActual: obtenerPasoActual,
    obtenerPasos: obtenerPasos,
    obtenerEstado: obtenerEstado
  });
})();