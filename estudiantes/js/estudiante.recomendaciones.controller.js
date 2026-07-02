/*
  Archivo: estudiante.recomendaciones.controller.js
  Ruta: estudiantes/js/estudiante.recomendaciones.controller.js
  Funciones principales del archivo:
  - Controlar el modal inicial obligatorio de recomendaciones.
  - Marcar cuándo el estudiante ya cerró o aceptó las recomendaciones.
  - Mostrar los datos y permitir avance solo después de consulta válida y modal cerrado.
  - Coordinar el inicio del formulario después de aceptar las recomendaciones.
  - Mantener separada la lógica del modal inicial respecto a estudiante.app.js.
*/
(function () {
  'use strict';

  function mostrarModalRecomendaciones(opciones) {
    var modalService = window.TAEstudianteModal;
    var ui = window.TAEstudianteUI;
    var state = window.TAEstudianteState;
    var estado = state ? state.obtener() : {};

    opciones = opciones || {};

    if (!estado.estudiante) {
      if (ui && ui.showAlert) {
        ui.showAlert('Primero consulta la cédula del estudiante.', '#cedulaInput');
      }

      return;
    }

    if (state) {
      state.marcarRecomendacionesCerradas(false);
    }

    if (modalService && modalService.abrirRecomendaciones) {
      modalService.abrirRecomendaciones(function () {
        cerrarRecomendaciones(opciones);
      });
      return;
    }

    if (ui && ui.openAdviceModal) {
      ui.openAdviceModal(function () {
        cerrarRecomendaciones(opciones);
      });
      return;
    }

    abrirModalFallback('#modalRecomendaciones');
    conectarFallbackUnaVez('#btnEntendidoRecomendaciones', function () {
      cerrarModalFallback('#modalRecomendaciones');
      cerrarRecomendaciones(opciones);
    });
    conectarFallbackUnaVez('#btnCerrarRecomendaciones', function () {
      cerrarModalFallback('#modalRecomendaciones');
      cerrarRecomendaciones(opciones);
    });
  }

  function cerrarRecomendaciones(opciones) {
    var state = window.TAEstudianteState;

    opciones = opciones || {};

    if (state) {
      state.marcarRecomendacionesCerradas(true);
    }

    mostrarDatosSiCorresponde();

    if (typeof opciones.onCerrar === 'function') {
      opciones.onCerrar();
    }

    if (typeof opciones.onContinuar === 'function') {
      opciones.onContinuar();
    }
  }

  function mostrarDatosSiCorresponde() {
    var ui = window.TAEstudianteUI;
    var paginacion = window.TAEstudiantePaginacion;
    var state = window.TAEstudianteState;
    var estado = state ? state.obtener() : {};

    if (!estado.consultaCompletada || !estado.recomendacionesCerradas) {
      return false;
    }

    if (!estado.estudiante) {
      return false;
    }

    if (window.TAEstudianteFormularioController && window.TAEstudianteFormularioController.inicializarFormularioTrasConsulta) {
      window.TAEstudianteFormularioController.inicializarFormularioTrasConsulta({
        estudiante: estado.estudiante,
        appConfig: estado.appConfig,
        envioExistente: estado.envioExistente
      });
    }

    if (paginacion && paginacion.irA) {
      paginacion.irA('datos', true);
    }

    if (ui) {
      ui.show('#wizardSteps');
      ui.show('#seccionEstudiante');
      ui.show('#formPropuestas');
      ui.showStatus('#consultaMensaje', '', 'success');
    }

    return true;
  }

  function reiniciar() {
    var state = window.TAEstudianteState;

    if (state) {
      state.marcarRecomendacionesCerradas(false);
    }
  }

  function abrirModalFallback(selector) {
    var modal = document.querySelector(selector);

    if (!modal) {
      return;
    }

    modal.classList.remove('is-hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('has-open-modal');
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

  function conectarFallbackUnaVez(selector, callback) {
    var boton = document.querySelector(selector);

    if (!boton || boton.dataset.recomendacionesFallbackConectado === 'true') {
      return;
    }

    boton.dataset.recomendacionesFallbackConectado = 'true';

    boton.addEventListener('click', function () {
      if (typeof callback === 'function') {
        callback();
      }
    });
  }

  function hayModalAbierto() {
    return Array.prototype.slice.call(document.querySelectorAll('.modal'))
      .some(function (modal) {
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