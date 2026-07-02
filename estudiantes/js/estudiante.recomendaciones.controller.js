/*
  Archivo: estudiante.recomendaciones.controller.js
  Ruta: estudiantes/js/estudiante.recomendaciones.controller.js
  Funciones principales del archivo:
  - Mantener compatibilidad con estudiante.events.js, que llama a mostrarModalRecomendaciones().
  - Evitar que el flujo quede detenido en un modal de recomendaciones después de consultar.
  - Mostrar los datos académicos inmediatamente después de una consulta válida.
  - Inicializar el formulario después de encontrar al estudiante.
  - Habilitar correctamente el paso "datos" en la paginación.
  - Dejar listo el siguiente paso del flujo: Telegram obligatorio.
*/
(function () {
  'use strict';

  var cierreEnProceso = false;

  function mostrarModalRecomendaciones(opciones) {
    /*
      En el flujo nuevo ya no debe aparecer un modal de recomendaciones después de consultar.
      estudiante.events.js sigue llamando a esta función por compatibilidad.
      Por eso esta función ahora continúa directamente hacia "datos académicos".
    */
    return continuarDespuesDeConsulta(opciones);
  }

  function cerrarRecomendaciones(opciones) {
    return continuarDespuesDeConsulta(opciones);
  }

  function continuarDespuesDeConsulta(opciones) {
    var ui = window.TAEstudianteUI;
    var state = window.TAEstudianteState;
    var estado = state ? state.obtener() : {};

    opciones = opciones || {};

    if (cierreEnProceso) {
      return false;
    }

    if (!estado.estudiante) {
      if (ui && ui.showAlert) {
        ui.showAlert('Primero consulta la cédula del estudiante.', '#cedulaInput');
      }

      return false;
    }

    cierreEnProceso = true;

    if (state && state.marcarRecomendacionesCerradas) {
      state.marcarRecomendacionesCerradas(true);
    }

    cerrarModalRecomendacionesSiExiste();

    mostrarDatosSiCorresponde();

    if (typeof opciones.onCerrar === 'function') {
      opciones.onCerrar();
    }

    if (typeof opciones.onContinuar === 'function') {
      opciones.onContinuar();
    }

    cierreEnProceso = false;

    return true;
  }

  function mostrarDatosSiCorresponde() {
    var ui = window.TAEstudianteUI;
    var paginacion = window.TAEstudiantePaginacion;
    var state = window.TAEstudianteState;
    var estado = state ? state.obtener() : {};
    var pasoMostrado = false;

    if (!estado.consultaCompletada || !estado.estudiante) {
      return false;
    }

    if (state && state.marcarRecomendacionesCerradas) {
      state.marcarRecomendacionesCerradas(true);
    }

    if (
      window.TAEstudianteFormularioController &&
      typeof window.TAEstudianteFormularioController.inicializarFormularioTrasConsulta === 'function'
    ) {
      window.TAEstudianteFormularioController.inicializarFormularioTrasConsulta({
        estudiante: estado.estudiante,
        appConfig: estado.appConfig,
        envioExistente: estado.envioExistente
      });
    }

    if (paginacion) {
      if (typeof paginacion.habilitarHasta === 'function') {
        paginacion.habilitarHasta('datos');
      } else if (typeof paginacion.habilitarPaso === 'function') {
        paginacion.habilitarPaso('datos');
      }

      if (typeof paginacion.irA === 'function') {
        pasoMostrado = paginacion.irA('datos', true);
      }
    }

    if (ui) {
      if (typeof ui.show === 'function') {
        ui.show('#wizardSteps');
        ui.show('#seccionEstudiante');
        ui.show('#formPropuestas');
      }

      if (typeof ui.showStatus === 'function') {
        ui.showStatus('#consultaMensaje', '', 'success');
      }
    }

    enfocarDatosAcademicos();

    return pasoMostrado || true;
  }

  function reiniciar() {
    var state = window.TAEstudianteState;

    cierreEnProceso = false;

    if (state && state.marcarRecomendacionesCerradas) {
      state.marcarRecomendacionesCerradas(false);
    }

    cerrarModalRecomendacionesSiExiste();
  }

  function cerrarModalRecomendacionesSiExiste() {
    var modalService = window.TAEstudianteModal;
    var ui = window.TAEstudianteUI;

    if (modalService && typeof modalService.cerrar === 'function') {
      modalService.cerrar('#modalRecomendaciones');
    }

    if (ui && typeof ui.closeAdviceModal === 'function') {
      ui.closeAdviceModal();
    }

    cerrarModalFallback('#modalRecomendaciones');
  }

  function cerrarModalFallback(selector) {
    var modal = document.querySelector(selector);

    if (!modal) {
      return;
    }

    modal.classList.add('is-hidden');
    modal.setAttribute('aria-hidden', 'true');

    if (!hayModalAbierto()) {
      document.body.classList.remove('has-open-modal');
    }
  }

  function enfocarDatosAcademicos() {
    var titulo = document.querySelector('#datoNombres');
    var seccion = document.querySelector('#seccionEstudiante');

    window.setTimeout(function () {
      if (titulo && typeof titulo.focus === 'function') {
        if (!titulo.hasAttribute('tabindex')) {
          titulo.setAttribute('tabindex', '-1');
        }

        titulo.focus();
        return;
      }

      if (seccion && typeof seccion.scrollIntoView === 'function') {
        seccion.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }
    }, 80);
  }

  function hayModalAbierto() {
    return Array.prototype.slice.call(document.querySelectorAll('.modal, .ia-loading-modal'))
      .some(function (modal) {
        if (modal.id === 'modalRecomendaciones') {
          return false;
        }

        return !modal.classList.contains('is-hidden');
      });
  }

  window.TAEstudianteRecomendacionesController = Object.freeze({
    mostrarModalRecomendaciones: mostrarModalRecomendaciones,
    cerrarRecomendaciones: cerrarRecomendaciones,
    mostrarDatosSiCorresponde: mostrarDatosSiCorresponde,
    reiniciar: reiniciar
  });
})();