/*
  Archivo: estudiante.formulario.controller.js
  Ruta: estudiantes/js/estudiante.formulario.controller.js
  Funciones principales del archivo:
  - Preparar el formulario después de una consulta válida.
  - Limpiar visualmente propuestas, sugerencias y mensajes.
  - Restaurar envío existente si corresponde.
  - Restaurar borrador local si existe.
  - Validar Telegram obligatorio antes de entrar a propuestas.
  - Validar que cada propuesta tenga sugerencia elegida antes de continuar.
  - Construir payload final sin abrir modal.
  - Actualizar el resumen del título preferido.
  - Coordinar cambios de paso con paginacion.service.js.
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
    var datos = data || {};

    if (!ui) {
      return;
    }

    limpiarFormularioVisual();

    if (datos.estudiante && typeof ui.renderStudent === 'function') {
      ui.renderStudent(datos.estudiante);
    }

    if (datos.envioExistente && formularioService && typeof formularioService.formDataDesdeEnvio === 'function') {
      formDataExistente = formularioService.formDataDesdeEnvio(
        datos.envioExistente,
        obtenerTotalPropuestas()
      );

      ui.fillFormData(formDataExistente);
      marcarTitulosRestauradosComoSeleccionados(formDataExistente);
      ui.showStatus('#envioMensaje', 'Se cargó el último envío registrado para revisión.', 'info');
    }

    if (
      !formDataExistente &&
      formularioService &&
      typeof formularioService.leerBorrador === 'function' &&
      estado.estudiante &&
      config.borradorLocalActivo !== false
    ) {
      borrador = formularioService.leerBorrador(estado.estudiante, estado.appConfig);
    }

    if (borrador && borrador.formData) {
      ui.fillFormData(borrador.formData);
      marcarTitulosRestauradosComoSeleccionados(borrador.formData);
      ui.showStatus(
        '#envioMensaje',
        config.textos && config.textos.borradorRestaurado
          ? config.textos.borradorRestaurado
          : 'Se restauró un borrador local guardado en este equipo.',
        'success'
      );
    }

    prepararVistaDespuesDeConsulta();
    actualizarResumenPreferido();
  }

  function prepararVistaDespuesDeConsulta() {
    var ui = window.TAEstudianteUI;
    var paginacion = window.TAEstudiantePaginacion;

    if (ui) {
      ui.show('#wizardSteps');
      ui.show('#seccionEstudiante');
      ui.show('#formPropuestas');
      ui.hide('#comprobanteFinal');
      ui.showStatus('#consultaMensaje', '', 'success');
    }

    if (paginacion) {
      if (typeof paginacion.habilitarHasta === 'function') {
        paginacion.habilitarHasta('datos');
      }

      if (typeof paginacion.irA === 'function') {
        paginacion.irA('datos', true, { forzar: true });
      }
    }
  }

  function limpiarFormularioVisual() {
    var ui = window.TAEstudianteUI;
    var total = obtenerTotalPropuestas();
    var formDataVacio;

    if (!ui || typeof ui.fillFormData !== 'function') {
      return;
    }

    formDataVacio = {
      telegram: '',
      tituloPreferidoNumero: '',
      propuestas: crearPropuestasVacias(total)
    };

    ui.fillFormData(formDataVacio);
    limpiarSugerenciasVisuales();
    limpiarTitulosFinales();
    limpiarSeleccionPreferida();

    if (ui.showStatus) {
      ui.showStatus('#envioMensaje', '', 'info');
      ui.showStatus('#telegramEstado', '', 'info');
    }

    if (ui.clearFieldErrors) {
      ui.clearFieldErrors();
    }

    if (window.TAEstudianteTelegram && typeof window.TAEstudianteTelegram.marcarEstado === 'function') {
      window.TAEstudianteTelegram.marcarEstado(false, 'Telegram obligatorio pendiente de validación.');
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
      limpiarPayloadFinal();
      return null;
    }

    if (!ui || !validaciones || !formularioService || typeof formularioService.construirPayload !== 'function') {
      limpiarPayloadFinal();
      return null;
    }

    formData = ui.readFormData(obtenerTotalPropuestas());
    formData = normalizarFormulario(formData);

    resultado = validaciones.validarEnvio(formData, obtenerTotalPropuestas());

    if (!resultado.ok) {
      limpiarPayloadFinal();
      return null;
    }

    payload = formularioService.construirPayload(
      estado.estudiante,
      estado.appConfig,
      formData,
      estado.envioExistente
    );

    if (state && typeof state.guardarPayloadFinal === 'function') {
      state.guardarPayloadFinal(formData, payload);
    }

    if (typeof ui.renderSummary === 'function') {
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

    if (!ui || typeof ui.readFormData !== 'function') {
      return;
    }

    formData = normalizarFormulario(ui.readFormData(obtenerTotalPropuestas()));

    asegurarRadiosPreferidos(formData);

    if (typeof ui.renderResumenTitulos === 'function') {
      ui.renderResumenTitulos(formData);
    }
  }

  function obtenerFormularioActual() {
    var ui = window.TAEstudianteUI;

    if (!ui || typeof ui.readFormData !== 'function') {
      return null;
    }

    return normalizarFormulario(ui.readFormData(obtenerTotalPropuestas()));
  }

  function cargarFormulario(formData) {
    var ui = window.TAEstudianteUI;
    var data = formData || {
      telegram: '',
      tituloPreferidoNumero: '',
      propuestas: crearPropuestasVacias(obtenerTotalPropuestas())
    };

    if (!ui || typeof ui.fillFormData !== 'function') {
      return;
    }

    ui.fillFormData(data);
    marcarTitulosRestauradosComoSeleccionados(data);
    actualizarResumenPreferido();
  }

  function bloquearFormulario(valor) {
    var ui = window.TAEstudianteUI;

    if (!ui || typeof ui.setFormDisabled !== 'function') {
      return;
    }

    ui.setFormDisabled('#formPropuestas', valor !== false);
  }

  function validarTelegram() {
    var ui = window.TAEstudianteUI;
    var validaciones = window.TAEstudianteValidaciones;
    var telegramService = window.TAEstudianteTelegram;
    var resultado;

    if (!ui) {
      return false;
    }

    if (ui.clearFieldErrors) {
      ui.clearFieldErrors();
    }

    if (validaciones && typeof validaciones.validarDatosContacto === 'function') {
      resultado = validaciones.validarDatosContacto();

      if (!resultado.ok) {
        if (telegramService && typeof telegramService.marcarEstado === 'function') {
          telegramService.marcarEstado(false, 'Telegram pendiente de validación.');
        }

        ui.showAlert(resultado.mensaje, resultado.selector || '#telegramInput');
        return false;
      }

      if (resultado.data && resultado.data.telegram && ui.setValue) {
        ui.setValue('#telegramInput', resultado.data.telegram);
      }

      if (telegramService && typeof telegramService.marcarEstado === 'function') {
        telegramService.marcarEstado(true, 'Telegram validado correctamente: ' + resultado.data.telegram);
      }

      ui.showStatus('#envioMensaje', 'Telegram validado. Puedes continuar con las propuestas.', 'success');
      return true;
    }

    if (!telegramService || typeof telegramService.abrirPerfil !== 'function') {
      ui.showAlert('No se pudo validar Telegram porque el servicio no está disponible.', '#telegramInput');
      return false;
    }

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
      telegramService.marcarEstado(true, 'Telegram validado correctamente: ' + resultado.usuario);
    }

    return true;
  }

  function validarAntesDeAvanzar(pasoActual, pasoDestino) {
    var state = window.TAEstudianteState;
    var ui = window.TAEstudianteUI;
    var validaciones = window.TAEstudianteValidaciones;
    var estado = state ? state.obtener() : {};
    var resultado;
    var resumen;

    if (!ui) {
      return false;
    }

    if (ui.clearFieldErrors) {
      ui.clearFieldErrors();
    }

    if (pasoActual === 'consulta') {
      if (!estado.estudiante) {
        ui.showAlert('Primero consulta tu cédula para continuar.', '#cedulaInput');
        return false;
      }

      return true;
    }

    if (pasoActual === 'datos') {
      if (!estado.estudiante) {
        ui.showAlert('Primero consulta tu cédula para continuar.', '#cedulaInput');
        return false;
      }

      return true;
    }

    if (!validaciones || typeof validaciones.validarPaso !== 'function') {
      ui.showAlert('No se pudieron validar los datos del formulario.', '');
      return false;
    }

    resultado = validaciones.validarPaso(pasoActual);

    if (!resultado.ok) {
      ui.showAlert(resultado.mensaje, resultado.selector);
      return false;
    }

    if (pasoActual === 'propuesta1' || pasoActual === 'propuesta2' || pasoActual === 'propuesta3') {
      actualizarResumenPreferido();
    }

    if (pasoActual === 'resumen' || pasoDestino === 'envio') {
      resumen = prepararPayloadFinalSinModal();

      if (!resumen) {
        ui.showAlert(
          'Antes de confirmar, completa las tres propuestas y elige el título que más te gusta en el resumen.',
          '#resumenEnvio'
        );
        return false;
      }
    }

    return true;
  }

  function manejarCambioPaso(info) {
    var ui = window.TAEstudianteUI;
    var paso = info && info.paso ? info.paso : '';

    if (!paso) {
      return;
    }

    if (paso === 'contacto') {
      enfocarCampo('#telegramInput');
    }

    if (paso === 'resumen') {
      actualizarResumenPreferido();

      if (ui && ui.showStatus) {
        ui.showStatus('#envioMensaje', 'Revisa el resumen y elige el título que más te gusta.', 'info');
      }
    }

    if (paso === 'envio') {
      prepararPayloadFinalSinModal();

      if (ui && ui.showStatus) {
        ui.showStatus('#envioMensaje', 'Confirma el envío final cuando estés seguro.', 'info');
      }
    }
  }

  function normalizarFormulario(formData) {
    var total = obtenerTotalPropuestas();
    var propuestas = [];
    var i;
    var original;

    formData = formData || {};
    formData.telegram = limpiarTexto(formData.telegram);

    for (i = 1; i <= total; i += 1) {
      original = buscarPropuesta(formData.propuestas, i) || {};

      propuestas.push({
        numero: i,
        temaGeneral: limpiarTexto(original.temaGeneral),
        problemaNecesidad: limpiarTexto(original.problemaNecesidad),
        lugarContexto: limpiarTexto(original.lugarContexto),
        grupoEstudio: limpiarTexto(original.grupoEstudio),
        anioPeriodo: limpiarTexto(original.anioPeriodo),
        objetivo: limpiarTexto(original.objetivo),
        tituloFinal: limpiarTexto(original.tituloFinal)
      });
    }

    formData.propuestas = propuestas;
    formData.tituloPreferidoNumero = normalizarTituloPreferido(formData.tituloPreferidoNumero);

    return formData;
  }

  function normalizarTituloPreferido(value) {
    var numero = Number(value || 0);

    if (!numero || numero < 1 || numero > obtenerTotalPropuestas()) {
      return '';
    }

    return numero;
  }

  function buscarPropuesta(propuestas, numero) {
    propuestas = Array.isArray(propuestas) ? propuestas : [];

    for (var i = 0; i < propuestas.length; i += 1) {
      if (Number(propuestas[i].numero) === Number(numero)) {
        return propuestas[i];
      }
    }

    return null;
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

    if (sugerenciasService && typeof sugerenciasService.limpiarTodo === 'function') {
      sugerenciasService.limpiarTodo();
      return;
    }

    if (sugerenciasService && typeof sugerenciasService.limpiar === 'function') {
      sugerenciasService.limpiar();
      return;
    }

    if (ui && typeof ui.clearSuggestions === 'function') {
      ui.clearSuggestions();
    }
  }

  function limpiarTitulosFinales() {
    for (var i = 1; i <= obtenerTotalPropuestas(); i += 1) {
      limpiarTituloFinal(i);
    }
  }

  function limpiarTituloFinal(numero) {
    var campo = document.querySelector('#p' + numero + 'Titulo');

    if (!campo) {
      return;
    }

    campo.value = '';
    campo.setAttribute('readonly', 'readonly');
    campo.removeAttribute('data-sugerencia-seleccionada');
    campo.removeAttribute('data-sugerencia-index');
    campo.removeAttribute('data-sugerencia-enfoque');
    campo.removeAttribute('data-sugerencia-fecha');
    campo.classList.remove('title-final-selected', 'title-final-selected--stable');
  }

  function limpiarSeleccionPreferida() {
    Array.prototype.slice.call(document.querySelectorAll('input[name="tituloPreferido"]')).forEach(function (radio) {
      radio.checked = false;
    });
  }

  function marcarTitulosRestauradosComoSeleccionados(formData) {
    var propuestas = formData && Array.isArray(formData.propuestas) ? formData.propuestas : [];

    propuestas.forEach(function (propuesta) {
      var numero = Number(propuesta.numero || 0);
      var campo = document.querySelector('#p' + numero + 'Titulo');

      if (!campo) {
        return;
      }

      if (limpiarTexto(propuesta.tituloFinal)) {
        campo.setAttribute('data-sugerencia-seleccionada', 'true');
        campo.setAttribute('data-sugerencia-index', 'restaurado');
        campo.setAttribute('readonly', 'readonly');
        campo.classList.add('title-final-selected--stable');
      }
    });
  }

  function asegurarRadiosPreferidos(formData) {
    var resumen = document.querySelector('#resumenEnvio');
    var propuestas = formData && Array.isArray(formData.propuestas) ? formData.propuestas : [];
    var html = '';

    if (!resumen || !propuestas.length) {
      return;
    }

    propuestas.forEach(function (propuesta) {
      html += [
        '<label class="summary-option">',
        '<input type="radio" name="tituloPreferido" value="' + escapeHtml(propuesta.numero) + '"' + (Number(formData.tituloPreferidoNumero) === Number(propuesta.numero) ? ' checked' : '') + '>',
        '<span>',
        '<strong>Propuesta ' + escapeHtml(propuesta.numero) + '</strong>',
        '<em>' + escapeHtml(propuesta.tituloFinal || 'Título final pendiente') + '</em>',
        '</span>',
        '</label>'
      ].join('');
    });

    resumen.innerHTML = html;

    Array.prototype.slice.call(resumen.querySelectorAll('input[name="tituloPreferido"]')).forEach(function (radio) {
      radio.addEventListener('change', function () {
        actualizarResumenPreferido();
      });
    });
  }

  function limpiarPayloadFinal() {
    var state = window.TAEstudianteState;

    if (state && typeof state.guardarPayloadFinal === 'function') {
      state.guardarPayloadFinal(null, null);
    }
  }

  function enfocarCampo(selector) {
    var campo = document.querySelector(selector);

    if (!campo) {
      return;
    }

    window.setTimeout(function () {
      if (typeof campo.focus === 'function') {
        campo.focus();
      }
    }, 80);
  }

  function obtenerTotalPropuestas() {
    var config = window.TA_ESTUDIANTES_CONFIG || {};
    return Number(config.propuestasObligatorias || 3);
  }

  function limpiarTexto(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  window.TAEstudianteFormularioController = Object.freeze({
    inicializarFormularioTrasConsulta: inicializarFormularioTrasConsulta,
    prepararVistaDespuesDeConsulta: prepararVistaDespuesDeConsulta,
    limpiarFormularioVisual: limpiarFormularioVisual,
    prepararPayloadFinalSinModal: prepararPayloadFinalSinModal,
    actualizarResumenPreferido: actualizarResumenPreferido,
    obtenerFormularioActual: obtenerFormularioActual,
    cargarFormulario: cargarFormulario,
    bloquearFormulario: bloquearFormulario,
    validarTelegram: validarTelegram,
    validarAntesDeAvanzar: validarAntesDeAvanzar,
    manejarCambioPaso: manejarCambioPaso,
    normalizarFormulario: normalizarFormulario
  });
})();