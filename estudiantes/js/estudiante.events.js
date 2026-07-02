/*
  Archivo: estudiante.events.js
  Ruta: estudiantes/js/estudiante.events.js
  Funciones principales del archivo:
  - Conectar todos los eventos principales de la pantalla estudiantes.
  - Conectar consulta de cédula, formulario de propuestas, botones de resumen y envío.
  - Conectar botones de generar sugerencias con IA.
  - Conectar botones de borrador, Telegram, alerta y nueva consulta.
  - Preparar paginación y validación antes de avanzar.
  - Mantener estudiante.app.js como archivo de arranque limpio.
*/
(function () {
  'use strict';

  function iniciar() {
    conectarEventos();
    prepararTelegram();
    prepararPaginacion();

    if (window.TAEstudianteConsultaController && window.TAEstudianteConsultaController.limpiarCedulaMientrasEscribe) {
      window.TAEstudianteConsultaController.limpiarCedulaMientrasEscribe();
    }
  }

  function conectarEventos() {
    var formConsulta = obtenerFormConsulta();
    var formPropuestas = obtenerFormPropuestas();
    var btnVistaPrevia = qs('#btnVistaPrevia');
    var btnCerrarModal = qs('#btnCerrarModal');
    var btnCancelarResumen = qs('#btnCancelarResumen');
    var btnConfirmarEnvio = qs('#btnConfirmarEnvio');
    var btnConfirmarEnvioModal = qs('#btnConfirmarEnvioModal');
    var btnGuardarBorrador = qs('#btnGuardarBorrador');
    var btnLimpiarBorrador = qs('#btnLimpiarBorrador');
    var btnCopiarRegistro = qs('#btnCopiarRegistro');
    var btnNuevaConsulta = qs('#btnNuevaConsulta');
    var btnValidarTelegram = qs('#btnValidarTelegram');
    var btnCerrarAlerta = qs('#btnCerrarAlerta');
    var btnAceptarAlerta = qs('#btnAceptarAlerta');

    conectar(formConsulta, 'submit', manejarConsulta, 'taConsultaSubmit');
    conectar(formPropuestas, 'submit', manejarEnvio, 'taPropuestasSubmit');
    conectar(formPropuestas, 'input', programarAutoGuardado, 'taPropuestasInput');
    conectar(formPropuestas, 'change', programarAutoGuardado, 'taPropuestasChange');

    conectar(btnVistaPrevia, 'click', mostrarVistaPrevia, 'taVistaPreviaClick');
    conectar(btnCerrarModal, 'click', cerrarModalResumen, 'taCerrarModalClick');
    conectar(btnCancelarResumen, 'click', cerrarModalResumen, 'taCancelarResumenClick');
    conectar(btnConfirmarEnvio, 'click', confirmarEnvioFinal, 'taConfirmarEnvioClick');
    conectar(btnConfirmarEnvioModal, 'click', confirmarEnvioFinal, 'taConfirmarEnvioModalClick');
    conectar(btnGuardarBorrador, 'click', guardarBorradorManual, 'taGuardarBorradorClick');
    conectar(btnLimpiarBorrador, 'click', limpiarBorradorManual, 'taLimpiarBorradorClick');
    conectar(btnCopiarRegistro, 'click', copiarCodigoRegistro, 'taCopiarRegistroClick');
    conectar(btnNuevaConsulta, 'click', iniciarNuevaConsulta, 'taNuevaConsultaClick');
    conectar(btnValidarTelegram, 'click', validarTelegram, 'taValidarTelegramClick');
    conectar(btnCerrarAlerta, 'click', cerrarAlerta, 'taCerrarAlertaClick');
    conectar(btnAceptarAlerta, 'click', cerrarAlerta, 'taAceptarAlertaClick');

    conectarBotonesSugerencias();
  }

  function manejarConsulta(event) {
    var consultaController = window.TAEstudianteConsultaController;
    var recomendacionesController = window.TAEstudianteRecomendacionesController;

    if (!consultaController || !consultaController.manejarConsulta) {
      console.error('[Estudiantes] No está cargado estudiante.consulta.controller.js');
      return;
    }

    consultaController.manejarConsulta(event, {
      onConsultaExitosa: function () {
        if (recomendacionesController && recomendacionesController.mostrarModalRecomendaciones) {
          recomendacionesController.mostrarModalRecomendaciones();
        }
      }
    });
  }

  function manejarEnvio(event) {
    var envioController = window.TAEstudianteEnvioController;

    if (!envioController || !envioController.manejarEnvio) {
      console.error('[Estudiantes] No está cargado estudiante.envio.controller.js');
      return;
    }

    envioController.manejarEnvio(event);
  }

  function mostrarVistaPrevia(event) {
    var envioController = window.TAEstudianteEnvioController;

    if (!envioController || !envioController.mostrarVistaPrevia) {
      return;
    }

    envioController.mostrarVistaPrevia(event);
  }

  function confirmarEnvioFinal(event) {
    var envioController = window.TAEstudianteEnvioController;

    if (event && event.preventDefault) {
      event.preventDefault();
    }

    if (!envioController || !envioController.confirmarEnvioFinal) {
      return;
    }

    envioController.confirmarEnvioFinal();
  }

  function guardarBorradorManual(event) {
    var borradorController = window.TAEstudianteBorradorController;

    if (event && event.preventDefault) {
      event.preventDefault();
    }

    if (!borradorController || !borradorController.guardarBorradorManual) {
      return;
    }

    borradorController.guardarBorradorManual();
  }

  function limpiarBorradorManual(event) {
    var borradorController = window.TAEstudianteBorradorController;

    if (event && event.preventDefault) {
      event.preventDefault();
    }

    if (!borradorController || !borradorController.limpiarBorradorManual) {
      return;
    }

    borradorController.limpiarBorradorManual();
  }

  function programarAutoGuardado() {
    var borradorController = window.TAEstudianteBorradorController;

    if (!borradorController || !borradorController.programarAutoGuardado) {
      return;
    }

    borradorController.programarAutoGuardado();
  }

  function copiarCodigoRegistro(event) {
    var envioController = window.TAEstudianteEnvioController;

    if (event && event.preventDefault) {
      event.preventDefault();
    }

    if (!envioController || !envioController.copiarCodigoRegistro) {
      return;
    }

    envioController.copiarCodigoRegistro();
  }

  function validarTelegram(event) {
    var formularioController = window.TAEstudianteFormularioController;

    if (event && event.preventDefault) {
      event.preventDefault();
    }

    if (!formularioController || !formularioController.validarTelegram) {
      return;
    }

    formularioController.validarTelegram();
  }

  function iniciarNuevaConsulta(event) {
    var state = window.TAEstudianteState;
    var ui = window.TAEstudianteUI;
    var consultaController = window.TAEstudianteConsultaController;
    var recomendacionesController = window.TAEstudianteRecomendacionesController;
    var formularioController = window.TAEstudianteFormularioController;
    var paginacion = window.TAEstudiantePaginacion;

    if (event && event.preventDefault) {
      event.preventDefault();
    }

    if (state && state.reiniciarConsulta) {
      state.reiniciarConsulta({
        conservarFirebase: true
      });
    }

    if (consultaController && consultaController.limpiarVistaAntesDeConsultar) {
      consultaController.limpiarVistaAntesDeConsultar({
        conservarCedula: ''
      });
    }

    if (recomendacionesController && recomendacionesController.reiniciar) {
      recomendacionesController.reiniciar();
    }

    if (formularioController && formularioController.limpiarFormularioVisual) {
      formularioController.limpiarFormularioVisual();
    }

    if (ui) {
      ui.setValue('#cedulaInput', '');
      ui.showStatus('#consultaMensaje', '', 'info');
      ui.showStatus('#envioMensaje', '', 'info');
      ui.hide('#comprobanteFinal');
      ui.show('#wizardSteps');
    }

    if (paginacion && paginacion.reiniciar) {
      paginacion.reiniciar();
    }

    enfocarCedula();
  }

  function cerrarAlerta() {
    var ui = window.TAEstudianteUI;

    if (ui && ui.closeAlert) {
      ui.closeAlert();
    }
  }

  function cerrarModalResumen(event) {
    var ui = window.TAEstudianteUI;
    var modalService = window.TAEstudianteModal;

    if (event && event.preventDefault) {
      event.preventDefault();
    }

    if (ui && ui.closeModal) {
      ui.closeModal();
      return;
    }

    if (modalService && modalService.cerrar) {
      modalService.cerrar('#modalResumen');
    }
  }

  function conectarBotonesSugerencias() {
    qsa('.js-generar-sugerencias').forEach(function (button) {
      conectar(button, 'click', function () {
        var sugerenciasController = window.TAEstudianteSugerenciasController;
        var numero = Number(button.dataset.propuesta || button.getAttribute('data-propuesta') || 0);

        if (!sugerenciasController || !sugerenciasController.manejarSugerencias) {
          console.error('[Estudiantes] No está cargado estudiante.sugerencias.controller.js');
          return;
        }

        sugerenciasController.manejarSugerencias(numero, button);
      }, 'taGenerarSugerenciasClick');
    });
  }

  function prepararTelegram() {
    var telegramService = window.TAEstudianteTelegram;

    if (telegramService && telegramService.prepararInput) {
      telegramService.prepararInput('#telegramInput');
    }
  }

  function prepararPaginacion() {
    var paginacion = window.TAEstudiantePaginacion;
    var formularioController = window.TAEstudianteFormularioController;

    if (!paginacion || !paginacion.iniciar) {
      return;
    }

    paginacion.iniciar({
      antesDeAvanzar: function (pasoActual) {
        if (!formularioController || !formularioController.validarAntesDeAvanzar) {
          return true;
        }

        return formularioController.validarAntesDeAvanzar(pasoActual);
      },
      alCambiar: function (info) {
        if (formularioController && formularioController.manejarCambioPaso) {
          formularioController.manejarCambioPaso(info);
        }
      }
    });
  }

  function obtenerFormConsulta() {
    return qs('#consultaForm') ||
      qs('#formConsulta') ||
      qs('form[data-form="consulta"]');
  }

  function obtenerFormPropuestas() {
    return qs('#formPropuestas') ||
      qs('#formTitulos') ||
      qs('form[data-form="propuestas"]') ||
      qs('form[data-form="titulos"]');
  }

  function conectar(element, evento, handler, flag) {
    if (!element || !element.addEventListener || typeof handler !== 'function') {
      return;
    }

    flag = flag || 'taEventoConectado';

    if (element.dataset && element.dataset[flag] === 'true') {
      return;
    }

    if (element.dataset) {
      element.dataset[flag] = 'true';
    }

    element.addEventListener(evento, handler);
  }

  function enfocarCedula() {
    var input = qs('#cedulaInput');

    if (!input) {
      return;
    }

    window.setTimeout(function () {
      input.focus();
    }, 80);
  }

  function qs(selector) {
    return document.querySelector(selector);
  }

  function qsa(selector) {
    return Array.prototype.slice.call(document.querySelectorAll(selector));
  }

  window.TAEstudianteEvents = Object.freeze({
    iniciar: iniciar,
    conectarEventos: conectarEventos,
    manejarConsulta: manejarConsulta,
    manejarEnvio: manejarEnvio,
    mostrarVistaPrevia: mostrarVistaPrevia,
    confirmarEnvioFinal: confirmarEnvioFinal,
    guardarBorradorManual: guardarBorradorManual,
    limpiarBorradorManual: limpiarBorradorManual,
    programarAutoGuardado: programarAutoGuardado,
    copiarCodigoRegistro: copiarCodigoRegistro,
    validarTelegram: validarTelegram,
    iniciarNuevaConsulta: iniciarNuevaConsulta,
    prepararTelegram: prepararTelegram,
    prepararPaginacion: prepararPaginacion
  });
})();