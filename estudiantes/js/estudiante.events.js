/*
  Archivo: estudiante.events.js
  Ruta: estudiantes/js/estudiante.events.js
  Funciones principales del archivo:
  - Conectar todos los eventos principales de la pantalla estudiantes.
  - Conectar consulta de cédula.
  - Conectar formulario de propuestas.
  - Conectar botones de resumen y confirmación.
  - Conectar botones de generar sugerencias con IA.
  - Conectar validación de Telegram obligatorio.
  - Conectar guardado y limpieza de borrador.
  - Conectar copia de código y nueva consulta.
  - Preparar paginación y validación antes de avanzar.
  - Evitar listeners duplicados.
  - Mantener estudiante.app.js como archivo de arranque limpio.
*/
(function () {
  'use strict';

  function iniciar() {
    conectarEventos();
    prepararTelegram();
    prepararPaginacion();

    if (
      window.TAEstudianteConsultaController &&
      typeof window.TAEstudianteConsultaController.limpiarCedulaMientrasEscribe === 'function'
    ) {
      window.TAEstudianteConsultaController.limpiarCedulaMientrasEscribe();
    }

    enfocarCedula();
  }

  function conectarEventos() {
    var formConsulta = obtenerFormConsulta();
    var formPropuestas = obtenerFormPropuestas();

    conectar(formConsulta, 'submit', manejarConsulta, 'taConsultaSubmit');
    conectar(formPropuestas, 'submit', manejarEnvio, 'taPropuestasSubmit');
    conectar(formPropuestas, 'input', programarAutoGuardado, 'taPropuestasInput');
    conectar(formPropuestas, 'change', manejarCambioFormulario, 'taPropuestasChange');

    conectar(qs('#btnVistaPrevia'), 'click', mostrarVistaPrevia, 'taVistaPreviaClick');
    conectar(qs('#btnCerrarModal'), 'click', cerrarModalResumen, 'taCerrarModalClick');
    conectar(qs('#btnCancelarResumen'), 'click', cerrarModalResumen, 'taCancelarResumenClick');
    conectar(qs('#btnConfirmarEnvioModal'), 'click', confirmarEnvioFinal, 'taConfirmarEnvioModalClick');
    conectar(qs('#btnEnviarTitulos'), 'click', confirmarEnvioFinal, 'taConfirmarEnvioClick');
    conectar(qs('#btnConfirmarEnvio'), 'click', confirmarEnvioFinal, 'taConfirmarEnvioLegacyClick');

    conectar(qs('#btnGuardarBorrador'), 'click', guardarBorradorManual, 'taGuardarBorradorClick');
    conectar(qs('#btnLimpiarBorrador'), 'click', limpiarBorradorManual, 'taLimpiarBorradorClick');

    conectar(qs('#btnCopiarRegistro'), 'click', copiarCodigoRegistro, 'taCopiarRegistroClick');
    conectar(qs('#btnNuevaConsulta'), 'click', iniciarNuevaConsulta, 'taNuevaConsultaClick');

    conectar(qs('#btnValidarTelegram'), 'click', validarTelegram, 'taValidarTelegramClick');

    conectar(qs('#btnCerrarAlerta'), 'click', cerrarAlerta, 'taCerrarAlertaClick');
    conectar(qs('#btnAceptarAlerta'), 'click', cerrarAlerta, 'taAceptarAlertaClick');
    conectar(qs('#modalAlerta .modal__backdrop'), 'click', cerrarAlerta, 'taBackdropAlertaClick');

    conectar(qs('#btnCerrarSugerencias'), 'click', cerrarModalSugerencias, 'taCerrarSugerenciasClick');
    conectar(qs('#btnCancelarSugerencias'), 'click', cerrarModalSugerencias, 'taCancelarSugerenciasClick');
    conectar(qs('#modalSugerencias .modal__backdrop'), 'click', cerrarModalSugerencias, 'taBackdropSugerenciasClick');

    conectar(qs('#btnCerrarRecomendaciones'), 'click', cerrarRecomendaciones, 'taCerrarRecomendacionesClick');
    conectar(qs('#btnEntendidoRecomendaciones'), 'click', cerrarRecomendaciones, 'taEntendidoRecomendacionesClick');
    conectar(qs('#modalRecomendaciones .modal__backdrop'), 'click', cerrarRecomendaciones, 'taBackdropRecomendacionesClick');

    conectarBotonesSugerencias();
    conectarBotonesPaginacionDirectos();
  }

  function manejarConsulta(event) {
    var consultaController = window.TAEstudianteConsultaController;
    var recomendacionesController = window.TAEstudianteRecomendacionesController;

    if (!consultaController || typeof consultaController.manejarConsulta !== 'function') {
      console.error('[Estudiantes] No está cargado estudiante.consulta.controller.js');
      mostrarAlerta('No se pudo iniciar la consulta porque falta el controlador de consulta.');
      return;
    }

    consultaController.manejarConsulta(event, {
      onConsultaExitosa: function () {
        if (
          recomendacionesController &&
          typeof recomendacionesController.mostrarModalRecomendaciones === 'function'
        ) {
          recomendacionesController.mostrarModalRecomendaciones();
        }
      }
    });
  }

  function manejarEnvio(event) {
    var envioController = window.TAEstudianteEnvioController;

    if (event && event.preventDefault) {
      event.preventDefault();
    }

    if (!envioController || typeof envioController.confirmarEnvioFinal !== 'function') {
      console.error('[Estudiantes] No está cargado estudiante.envio.controller.js');
      mostrarAlerta('No se pudo confirmar el envío porque falta el controlador de envío.');
      return;
    }

    envioController.confirmarEnvioFinal();
  }

  function mostrarVistaPrevia(event) {
    var envioController = window.TAEstudianteEnvioController;

    if (event && event.preventDefault) {
      event.preventDefault();
    }

    if (!envioController || typeof envioController.mostrarVistaPrevia !== 'function') {
      mostrarAlerta('No se pudo mostrar el resumen porque falta el controlador de envío.');
      return;
    }

    envioController.mostrarVistaPrevia(event);
  }

  function confirmarEnvioFinal(event) {
    var envioController = window.TAEstudianteEnvioController;

    if (event && event.preventDefault) {
      event.preventDefault();
    }

    if (!envioController || typeof envioController.confirmarEnvioFinal !== 'function') {
      mostrarAlerta('No se pudo confirmar el envío porque falta el controlador de envío.');
      return;
    }

    envioController.confirmarEnvioFinal();
  }

  function cerrarModalResumen(event) {
    var envioController = window.TAEstudianteEnvioController;
    var ui = window.TAEstudianteUI;

    if (event && event.preventDefault) {
      event.preventDefault();
    }

    if (envioController && typeof envioController.cerrarModalResumen === 'function') {
      envioController.cerrarModalResumen();
      return;
    }

    if (ui && typeof ui.closeModal === 'function') {
      ui.closeModal();
      return;
    }

    cerrarModalFallback('#modalResumen');
  }

  function guardarBorradorManual(event) {
    var borradorController = window.TAEstudianteBorradorController;

    if (event && event.preventDefault) {
      event.preventDefault();
    }

    if (!borradorController || typeof borradorController.guardarBorradorManual !== 'function') {
      mostrarAlerta('No se pudo guardar el borrador porque el servicio no está disponible.');
      return;
    }

    borradorController.guardarBorradorManual();
  }

  function limpiarBorradorManual(event) {
    var borradorController = window.TAEstudianteBorradorController;

    if (event && event.preventDefault) {
      event.preventDefault();
    }

    if (!borradorController || typeof borradorController.limpiarBorradorManual !== 'function') {
      mostrarAlerta('No se pudo limpiar el borrador porque el servicio no está disponible.');
      return;
    }

    borradorController.limpiarBorradorManual();
  }

  function programarAutoGuardado(event) {
    var borradorController = window.TAEstudianteBorradorController;
    var target = event && event.target ? event.target : null;

    if (target && target.name === 'tituloPreferido') {
      actualizarResumenPreferido();
    }

    if (
      target &&
      target.closest &&
      (
        target.closest('#modalResumen') ||
        target.closest('#modalSugerencias') ||
        target.closest('#modalAlerta')
      )
    ) {
      return;
    }

    if (!borradorController || typeof borradorController.programarAutoGuardado !== 'function') {
      return;
    }

    borradorController.programarAutoGuardado();
  }

  function manejarCambioFormulario(event) {
    var target = event && event.target ? event.target : null;

    if (target && target.name === 'tituloPreferido') {
      actualizarResumenPreferido();
      return;
    }

    programarAutoGuardado(event);
  }

  function copiarCodigoRegistro(event) {
    var envioController = window.TAEstudianteEnvioController;

    if (event && event.preventDefault) {
      event.preventDefault();
    }

    if (!envioController || typeof envioController.copiarCodigoRegistro !== 'function') {
      mostrarAlerta('No se pudo copiar el código porque el servicio no está disponible.');
      return;
    }

    envioController.copiarCodigoRegistro();
  }

  function validarTelegram(event) {
    var formularioController = window.TAEstudianteFormularioController;

    if (event && event.preventDefault) {
      event.preventDefault();
    }

    if (!formularioController || typeof formularioController.validarTelegram !== 'function') {
      mostrarAlerta('No se pudo validar Telegram porque falta el controlador del formulario.', '#telegramInput');
      return false;
    }

    return formularioController.validarTelegram();
  }

  function iniciarNuevaConsulta(event) {
    var state = window.TAEstudianteState;
    var ui = window.TAEstudianteUI;
    var formularioController = window.TAEstudianteFormularioController;
    var recomendacionesController = window.TAEstudianteRecomendacionesController;
    var paginacion = window.TAEstudiantePaginacion;

    if (event && event.preventDefault) {
      event.preventDefault();
    }

    if (state && typeof state.reiniciarConsulta === 'function') {
      state.reiniciarConsulta({
        conservarFirebase: true
      });
    }

    if (formularioController && typeof formularioController.limpiarFormularioVisual === 'function') {
      formularioController.limpiarFormularioVisual();
    }

    if (recomendacionesController && typeof recomendacionesController.reiniciar === 'function') {
      recomendacionesController.reiniciar();
    }

    if (ui) {
      ui.setValue('#cedulaInput', '');
      ui.setText('#datoCedula', '—');
      ui.setText('#datoNombres', 'Datos académicos del estudiante');
      ui.setText('#datoCarrera', '—');
      ui.setText('#datoPeriodo', '—');

      ui.show('#wizardSteps');
      ui.show('#consultaCard');
      ui.hide('#seccionEstudiante');
      ui.hide('#formPropuestas');
      ui.hide('#comprobanteFinal');

      ui.showStatus('#consultaMensaje', '', 'info');
      ui.showStatus('#envioMensaje', '', 'info');
      ui.showStatus('#telegramEstado', '', 'info');

      if (typeof ui.setFormDisabled === 'function') {
        ui.setFormDisabled('#formPropuestas', false);
      }

      if (typeof ui.clearFieldErrors === 'function') {
        ui.clearFieldErrors();
      }
    }

    if (paginacion && typeof paginacion.irA === 'function') {
      paginacion.irA('consulta', true, { forzar: true });
    }

    enfocarCedula();
  }

  function conectarBotonesSugerencias() {
    qsa('.js-generar-sugerencias, [data-action="generar-sugerencias"]').forEach(function (button) {
      conectar(button, 'click', function (event) {
        var sugerenciasController = window.TAEstudianteSugerenciasController;
        var numero = Number(button.getAttribute('data-propuesta') || button.dataset.propuesta || 0);

        if (event && event.preventDefault) {
          event.preventDefault();
        }

        if (!numero) {
          numero = obtenerNumeroPropuestaDesdeBoton(button);
        }

        if (!sugerenciasController || typeof sugerenciasController.manejarSugerencias !== 'function') {
          console.error('[Estudiantes] No está cargado estudiante.sugerencias.controller.js');
          mostrarAlerta('No se pudieron generar sugerencias porque falta el controlador de IA.');
          return;
        }

        sugerenciasController.manejarSugerencias(numero, button);
      }, 'taGenerarSugerenciasClick');
    });
  }

  function conectarBotonesPaginacionDirectos() {
    qsa('[data-action="next"], [data-action="prev"]').forEach(function (button) {
      conectar(button, 'click', function (event) {
        var paginacion = window.TAEstudiantePaginacion;
        var action = button.getAttribute('data-action');

        if (event && event.preventDefault) {
          event.preventDefault();
        }

        if (!paginacion) {
          return;
        }

        if (action === 'next' && typeof paginacion.siguiente === 'function') {
          paginacion.siguiente();
          return;
        }

        if (action === 'prev' && typeof paginacion.anterior === 'function') {
          paginacion.anterior();
        }
      }, 'taPaginacionDirectaClick');
    });
  }

  function prepararTelegram() {
    var telegramService = window.TAEstudianteTelegram;

    if (telegramService && typeof telegramService.prepararInput === 'function') {
      telegramService.prepararInput('#telegramInput');
    }
  }

  function prepararPaginacion() {
    var paginacion = window.TAEstudiantePaginacion;
    var formularioController = window.TAEstudianteFormularioController;

    if (!paginacion || typeof paginacion.iniciar !== 'function') {
      return;
    }

    paginacion.iniciar({
      pasos: obtenerPasosFlujo(),
      pasoInicial: 'consulta',
      antesDeAvanzar: function (pasoActual, pasoDestino) {
        if (!formularioController || typeof formularioController.validarAntesDeAvanzar !== 'function') {
          return true;
        }

        return formularioController.validarAntesDeAvanzar(pasoActual, pasoDestino);
      },
      alCambiar: function (info) {
        if (formularioController && typeof formularioController.manejarCambioPaso === 'function') {
          formularioController.manejarCambioPaso(info);
        }
      }
    });
  }

  function cerrarAlerta(event) {
    var ui = window.TAEstudianteUI;

    if (event && event.preventDefault) {
      event.preventDefault();
    }

    if (ui && typeof ui.closeAlert === 'function') {
      ui.closeAlert();
      return;
    }

    cerrarModalFallback('#modalAlerta');
  }

  function cerrarModalSugerencias(event) {
    if (event && event.preventDefault) {
      event.preventDefault();
    }

    cerrarModalFallback('#modalSugerencias');
  }

  function cerrarRecomendaciones(event) {
    var recomendacionesController = window.TAEstudianteRecomendacionesController;

    if (event && event.preventDefault) {
      event.preventDefault();
    }

    if (recomendacionesController && typeof recomendacionesController.cerrarRecomendaciones === 'function') {
      recomendacionesController.cerrarRecomendaciones();
      return;
    }

    cerrarModalFallback('#modalRecomendaciones');
  }

  function actualizarResumenPreferido() {
    var formularioController = window.TAEstudianteFormularioController;

    if (formularioController && typeof formularioController.actualizarResumenPreferido === 'function') {
      formularioController.actualizarResumenPreferido();
    }
  }

  function obtenerNumeroPropuestaDesdeBoton(button) {
    var card = button && button.closest ? button.closest('[data-propuesta]') : null;

    if (!card) {
      return 0;
    }

    return Number(card.getAttribute('data-propuesta') || 0);
  }

  function obtenerPasosFlujo() {
    return [
      'consulta',
      'datos',
      'contacto',
      'propuesta1',
      'propuesta2',
      'propuesta3',
      'resumen',
      'envio'
    ];
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

  function mostrarAlerta(mensaje, selector) {
    var ui = window.TAEstudianteUI;

    if (ui && typeof ui.showAlert === 'function') {
      ui.showAlert(mensaje, selector || '');
      return;
    }

    window.alert(mensaje || 'Revisa la información.');
  }

  function cerrarModalFallback(selector) {
    var modal = qs(selector);

    if (!modal) {
      return;
    }

    modal.classList.add('is-hidden');
    modal.setAttribute('aria-hidden', 'true');

    if (!hayModalAbierto()) {
      document.body.classList.remove('has-open-modal');
    }
  }

  function hayModalAbierto() {
    return qsa('.modal, .ia-loading-modal').some(function (modal) {
      return !modal.classList.contains('is-hidden');
    });
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
    cerrarModalResumen: cerrarModalResumen,
    guardarBorradorManual: guardarBorradorManual,
    limpiarBorradorManual: limpiarBorradorManual,
    programarAutoGuardado: programarAutoGuardado,
    manejarCambioFormulario: manejarCambioFormulario,
    copiarCodigoRegistro: copiarCodigoRegistro,
    validarTelegram: validarTelegram,
    iniciarNuevaConsulta: iniciarNuevaConsulta,
    conectarBotonesSugerencias: conectarBotonesSugerencias,
    prepararTelegram: prepararTelegram,
    prepararPaginacion: prepararPaginacion
  });
})();