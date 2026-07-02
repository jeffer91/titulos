/*
  Archivo: estudiante.formulario.controller.js
  Ruta: estudiantes/js/estudiante.formulario.controller.js
  Funciones principales del archivo:
  - Preparar el formulario después de una consulta válida.
  - Limpiar visualmente propuestas, sugerencias y mensajes.
  - Restaurar envío existente si corresponde.
  - Restaurar borrador local si existe.
  - Construir payload final sin abrir modal.
  - Actualizar el resumen del título preferido.
*/
(function () {
  'use strict';

  function inicializarFormularioTrasConsulta(data) {
    var state = window.TAEstudianteState;
    var formularioService = window.TAEstudianteFormulario;
    var ui = window.TAEstudianteUI;
    var config = window.TA_ESTUDIANTES_CONFIG || {};
    var estado = state ? state.obtener() : {};
    var formDataExistente = null;
    var borrador = null;

    data = data || {};

    if (!ui) {
      return;
    }

    limpiarFormularioVisual();

    if (data.envioExistente && formularioService && formularioService.formDataDesdeEnvio) {
      formDataExistente = formularioService.formDataDesdeEnvio(
        data.envioExistente,
        obtenerTotalPropuestas()
      );

      ui.fillFormData(formDataExistente);
      ui.showStatus('#envioMensaje', 'Se cargó el último envío registrado para revisión.', 'info');
    }

    if (
      formularioService &&
      formularioService.leerBorrador &&
      estado.estudiante &&
      config.borradorLocalActivo !== false
    ) {
      borrador = formularioService.leerBorrador(estado.estudiante, estado.appConfig);
    }

    if (borrador && borrador.formData) {
      ui.fillFormData(borrador.formData);
      ui.showStatus(
        '#envioMensaje',
        config.textos && config.textos.borradorRestaurado
          ? config.textos.borradorRestaurado
          : 'Se restauró un borrador local guardado en este equipo.',
        'success'
      );
    }

    actualizarResumenPreferido();
  }

  function limpiarFormularioVisual() {
    var ui = window.TAEstudianteUI;
    var total = obtenerTotalPropuestas();
    var formDataVacio;

    if (!ui || !ui.fillFormData) {
      return;
    }

    formDataVacio = {
      telegram: '',
      tituloPreferidoNumero: 1,
      propuestas: crearPropuestasVacias(total)
    };

    ui.fillFormData(formDataVacio);
    limpiarSugerenciasVisuales();

    if (ui.showStatus) {
      ui.showStatus('#envioMensaje', '', 'info');
    }

    if (ui.clearFieldErrors) {
      ui.clearFieldErrors();
    }
  }

  function prepararPayloadFinalSinModal() {
    var state = window.TAEstudianteState;
    var ui = window.TAEstudianteUI;
    var validaciones = window.TAEstudianteValidaciones;
    var formularioService = window.TAEstudianteFormulario;
    var estado = state ? state.obtener() : {};
    var formData;
    var resultado;
    var payload;

    if (!estado.estudiante) {
      return null;
    }

    if (!ui || !validaciones || !formularioService || !formularioService.construirPayload) {
      return null;
    }

    formData = ui.readFormData(obtenerTotalPropuestas());
    resultado = validaciones.validarEnvio(formData, obtenerTotalPropuestas());

    if (!resultado.ok) {
      if (state) {
        state.guardarPayloadFinal(null, null);
      }

      return null;
    }

    payload = formularioService.construirPayload(
      estado.estudiante,
      estado.appConfig,
      formData,
      estado.envioExistente
    );

    if (state) {
      state.guardarPayloadFinal(formData, payload);
    }

    if (ui.renderSummary) {
      ui.renderSummary(estado.estudiante, formData, payload);
    }

    return {
      formData: formData,
      payload: payload
    };
  }

  function actualizarResumenPreferido() {
    var ui = window.TAEstudianteUI;
    var formData;

    if (!ui || !ui.renderResumenTitulos || !ui.readFormData) {
      return;
    }

    formData = ui.readFormData(obtenerTotalPropuestas());
    ui.renderResumenTitulos(formData);
  }

  function obtenerFormularioActual() {
    var ui = window.TAEstudianteUI;

    if (!ui || !ui.readFormData) {
      return null;
    }

    return ui.readFormData(obtenerTotalPropuestas());
  }

  function cargarFormulario(formData) {
    var ui = window.TAEstudianteUI;

    if (!ui || !ui.fillFormData) {
      return;
    }

    ui.fillFormData(formData || {
      telegram: '',
      tituloPreferidoNumero: 1,
      propuestas: crearPropuestasVacias(obtenerTotalPropuestas())
    });

    actualizarResumenPreferido();
  }

  function bloquearFormulario(valor) {
    var ui = window.TAEstudianteUI;

    if (!ui || !ui.setFormDisabled) {
      return;
    }

    ui.setFormDisabled('#formPropuestas', valor !== false);
  }

  function validarTelegram() {
    var ui = window.TAEstudianteUI;
    var telegramService = window.TAEstudianteTelegram;
    var resultado;

    if (!ui) {
      return false;
    }

    if (!telegramService || !telegramService.abrirPerfil) {
      ui.showAlert('No se pudo validar Telegram porque el servicio no está disponible.', '#telegramInput');
      return false;
    }

    ui.clearFieldErrors();

    resultado = telegramService.abrirPerfil(ui.value('#telegramInput'));

    if (!resultado.ok) {
      if (telegramService.marcarEstado) {
        telegramService.marcarEstado(false, 'Telegram pendiente de validación.');
      }

      ui.showAlert(resultado.mensaje, resultado.selector || '#telegramInput');
      return false;
    }

    ui.setValue('#telegramInput', resultado.usuario);

    if (telegramService.marcarEstado) {
      telegramService.marcarEstado(true, 'Telegram validado visualmente: ' + resultado.usuario);
    }

    return true;
  }

  function validarAntesDeAvanzar(pasoActual) {
    var state = window.TAEstudianteState;
    var ui = window.TAEstudianteUI;
    var validaciones = window.TAEstudianteValidaciones;
    var estado = state ? state.obtener() : {};
    var resultado;

    if (!ui || !validaciones) {
      return false;
    }

    if (pasoActual === 'consulta') {
      if (!estado.estudiante) {
        ui.showAlert('Primero consulta tu cédula para continuar.', '#cedulaInput');
        return false;
      }

      return true;
    }

    resultado = validaciones.validarPaso(pasoActual);

    if (!resultado.ok) {
      ui.showAlert(resultado.mensaje, resultado.selector);
      return false;
    }

    return true;
  }

  function manejarCambioPaso(info) {
    if (!info || !info.paso) {
      return;
    }

    if (info.paso === 'resumen') {
      actualizarResumenPreferido();
    }

    if (info.paso === 'envio') {
      prepararPayloadFinalSinModal();
    }
  }

  function crearPropuestasVacias(total) {
    var propuestas = [];
    var i;

    total = Number(total || 3);

    for (i = 1; i <= total; i += 1) {
      propuestas.push({
        numero: i,
        temaGeneral: '',
        problemaNecesidad: '',
        lugarContexto: '',
        grupoEstudio: '',
        anioPeriodo: '',
        objetivo: '',
        tituloFinal: ''
      });
    }

    return propuestas;
  }

  function limpiarSugerenciasVisuales() {
    var sugerenciasService = window.TAEstudianteSugerencias;
    var ui = window.TAEstudianteUI;

    if (sugerenciasService && sugerenciasService.limpiarTodo) {
      sugerenciasService.limpiarTodo();
      return;
    }

    if (sugerenciasService && sugerenciasService.limpiar) {
      sugerenciasService.limpiar();
      return;
    }

    if (ui && ui.clearSuggestions) {
      ui.clearSuggestions();
    }
  }

  function obtenerTotalPropuestas() {
    var config = window.TA_ESTUDIANTES_CONFIG || {};
    return Number(config.propuestasObligatorias || 3);
  }

  window.TAEstudianteFormularioController = Object.freeze({
    inicializarFormularioTrasConsulta: inicializarFormularioTrasConsulta,
    limpiarFormularioVisual: limpiarFormularioVisual,
    prepararPayloadFinalSinModal: prepararPayloadFinalSinModal,
    actualizarResumenPreferido: actualizarResumenPreferido,
    obtenerFormularioActual: obtenerFormularioActual,
    cargarFormulario: cargarFormulario,
    bloquearFormulario: bloquearFormulario,
    validarTelegram: validarTelegram,
    validarAntesDeAvanzar: validarAntesDeAvanzar,
    manejarCambioPaso: manejarCambioPaso
  });
})();