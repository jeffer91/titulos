/*
  Archivo: ui.service.js
  Ruta: estudiantes/js/ui.service.js
  Funciones del archivo:
  - Centralizar utilidades visuales simples del módulo estudiantes.
  - Leer y escribir valores de campos.
  - Mostrar/ocultar pasos, mensajes y secciones.
  - Renderizar datos del estudiante, resumen y comprobante.
  - Delegar alertas y modales al modal.service.js cuando esté disponible.
*/
(function () {
  'use strict';

  var alertaCallback = null;

  function qs(selector, root) {
    return (root || document).querySelector(selector);
  }

  function qsa(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  function setText(selector, value) {
    var element = qs(selector);

    if (!element) {
      return;
    }

    element.textContent = normalizarTexto(value) || '—';
  }

  function setValue(selector, value) {
    var element = qs(selector);

    if (!element) {
      return;
    }

    element.value = value || '';
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function value(selector) {
    var element = qs(selector);
    return element ? normalizarTexto(element.value) : '';
  }

  function show(elementOrSelector) {
    var element = resolverElemento(elementOrSelector);

    if (!element) {
      return;
    }

    element.classList.remove('is-hidden');
    element.removeAttribute('aria-hidden');
  }

  function hide(elementOrSelector) {
    var element = resolverElemento(elementOrSelector);

    if (!element) {
      return;
    }

    element.classList.add('is-hidden');
    element.setAttribute('aria-hidden', 'true');
  }

  function resolverElemento(elementOrSelector) {
    if (!elementOrSelector) {
      return null;
    }

    if (typeof elementOrSelector === 'string') {
      return qs(elementOrSelector);
    }

    return elementOrSelector;
  }

  function showStatus(selector, message, type) {
    var element = qs(selector);

    if (!element) {
      return;
    }

    element.textContent = message || '';
    element.className = 'status-message';

    if (type) {
      element.classList.add('status-message--' + type);
    }
  }

  function setLoading(button, loading, text) {
    if (!button) {
      return;
    }

    if (loading) {
      button.dataset.originalText = button.dataset.originalText || button.textContent;
      button.textContent = text || 'Procesando...';
      button.disabled = true;
      button.classList.add('is-loading');
      return;
    }

    button.textContent = button.dataset.originalText || text || button.textContent;
    button.disabled = false;
    button.classList.remove('is-loading');
  }

  function clearFieldErrors() {
    qsa('.field.has-error').forEach(function (field) {
      field.classList.remove('has-error');
    });
  }

  function markFieldError(selector) {
    var element = qs(selector);

    if (!element) {
      return;
    }

    var field = element.closest ? element.closest('.field') : null;

    if (field) {
      field.classList.add('has-error');
    }
  }

  function focusField(selector) {
    var element = qs(selector);

    if (!element) {
      return;
    }

    window.setTimeout(function () {
      if (element.scrollIntoView) {
        element.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
      }

      element.focus();
    }, 80);
  }

  function showAlert(message, selector, title) {
    var modalService = window.TAEstudianteModal;

    alertaCallback = function () {
      if (!selector) {
        return;
      }

      clearFieldErrors();
      markFieldError(selector);
      focusField(selector);
    };

    if (modalService && modalService.mostrarAlerta) {
      modalService.mostrarAlerta(message || 'Revisa la información ingresada.', {
        titulo: title || 'Revisa la información',
        onCerrar: function () {
          ejecutarAlertaCallback();
        }
      });

      return;
    }

    mostrarAlertaLocal(message, selector, title);
  }

  function mostrarAlertaLocal(message, selector, title) {
    var modal = qs('#modalAlerta');
    var titleElement = qs('#tituloModalAlerta');
    var messageElement = qs('#mensajeModalAlerta');

    if (!modal || !messageElement) {
      window.alert(message || 'Revisa la información.');

      if (selector) {
        focusField(selector);
      }

      return;
    }

    if (titleElement) {
      titleElement.textContent = title || 'Revisa la información';
    }

    messageElement.textContent = message || 'Revisa la información ingresada.';
    openModalBySelector('#modalAlerta');
  }

  function closeAlert() {
    closeModalBySelector('#modalAlerta');
    ejecutarAlertaCallback();
  }

  function ejecutarAlertaCallback() {
    var callback = alertaCallback;
    alertaCallback = null;

    if (typeof callback === 'function') {
      callback();
    }
  }

  function openAdviceModal(onEntendido) {
    var modalService = window.TAEstudianteModal;

    if (modalService && modalService.abrirRecomendaciones) {
      modalService.abrirRecomendaciones(onEntendido);
      return;
    }

    openModalBySelector('#modalRecomendaciones');
  }

  function closeAdviceModal() {
    var modalService = window.TAEstudianteModal;

    if (modalService && modalService.cerrar) {
      modalService.cerrar('#modalRecomendaciones');
      return;
    }

    closeModalBySelector('#modalRecomendaciones');
  }

  function openModal() {
    var modalService = window.TAEstudianteModal;

    if (modalService && modalService.abrir) {
      modalService.abrir('#modalResumen');
      return;
    }

    openModalBySelector('#modalResumen');
  }

  function closeModal() {
    var modalService = window.TAEstudianteModal;

    if (modalService && modalService.cerrar) {
      modalService.cerrar('#modalResumen');
      return;
    }

    closeModalBySelector('#modalResumen');
  }

  function openModalBySelector(selector) {
    var modal = qs(selector);

    if (!modal) {
      return;
    }

    modal.classList.remove('is-hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('has-open-modal');
  }

  function closeModalBySelector(selector) {
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
    return qsa('.modal').some(function (modal) {
      return !modal.classList.contains('is-hidden');
    });
  }

  function setFormDisabled(selector, disabled) {
    var container = qs(selector);

    if (!container) {
      return;
    }

    qsa('input, textarea, select, button', container).forEach(function (element) {
      element.disabled = Boolean(disabled);
    });
  }

  function renderStudent(student) {
    student = student || {};

    var periodoTexto = student.periodoLabel ||
      student.periodo ||
      student.periodoId ||
      student.ultimoPeriodoId ||
      '';

    if (window.TAEstudiantePeriodo && window.TAEstudiantePeriodo.obtenerEtiquetaPeriodo) {
      periodoTexto = window.TAEstudiantePeriodo.obtenerEtiquetaPeriodo(student) || periodoTexto;
    }

    setText('#datoCedula', student.cedula || student.numeroIdentificacion || student.identificacion || '');
    setText('#datoNombres', student.nombres || student.estudiante || student.nombre || '');
    setText('#datoCarrera', student.carrera || student.nombreCarrera || '');
    setText('#datoPeriodo', periodoTexto || '—');
  }

  function fillFormData(formData) {
    formData = formData || {};

    if (typeof formData.telegram !== 'undefined') {
      setValue('#telegramInput', formData.telegram || '');
    }

    if (Array.isArray(formData.propuestas)) {
      formData.propuestas.forEach(function (propuesta) {
        var numero = Number(propuesta.numero || 0);

        if (!numero) {
          return;
        }

        setValue('#p' + numero + 'Tema', propuesta.temaGeneral || '');
        setValue('#p' + numero + 'Problema', propuesta.problemaNecesidad || '');
        setValue('#p' + numero + 'Contexto', propuesta.lugarContexto || '');
        setValue('#p' + numero + 'Grupo', propuesta.grupoEstudio || '');
        setValue('#p' + numero + 'Periodo', propuesta.anioPeriodo || '');
        setValue('#p' + numero + 'Objetivo', propuesta.objetivo || '');
        setValue('#p' + numero + 'Titulo', propuesta.tituloFinal || '');
      });
    }

    if (formData.tituloPreferidoNumero) {
      var radio = qs('input[name="tituloPreferido"][value="' + formData.tituloPreferidoNumero + '"]');

      if (radio) {
        radio.checked = true;
      }
    }
  }

  function readFormData(totalPropuestas) {
    var total = Number(totalPropuestas || 3);
    var telegram = value('#telegramInput');

    if (window.TAEstudianteTelegram && window.TAEstudianteTelegram.normalizarUsuario) {
      telegram = window.TAEstudianteTelegram.normalizarUsuario(telegram);
    }

    var propuestas = [];

    for (var i = 1; i <= total; i += 1) {
      propuestas.push({
        numero: i,
        temaGeneral: value('#p' + i + 'Tema'),
        problemaNecesidad: value('#p' + i + 'Problema'),
        lugarContexto: value('#p' + i + 'Contexto'),
        grupoEstudio: value('#p' + i + 'Grupo'),
        anioPeriodo: value('#p' + i + 'Periodo'),
        objetivo: value('#p' + i + 'Objetivo'),
        tituloFinal: value('#p' + i + 'Titulo')
      });
    }

    var preferido = qs('input[name="tituloPreferido"]:checked');

    return {
      telegram: telegram,
      tituloPreferidoNumero: preferido ? Number(preferido.value) : 0,
      propuestas: propuestas
    };
  }

  function renderSuggestions(numero, sugerencias) {
    if (window.TAEstudianteSugerencias && window.TAEstudianteSugerencias.renderizar) {
      window.TAEstudianteSugerencias.renderizar(numero, sugerencias, {
        autoseleccionar: false
      });
    }
  }

  function clearSuggestions() {
    if (window.TAEstudianteSugerencias && window.TAEstudianteSugerencias.limpiarTodo) {
      window.TAEstudianteSugerencias.limpiarTodo();
      return;
    }

    if (window.TAEstudianteSugerencias && window.TAEstudianteSugerencias.limpiar) {
      window.TAEstudianteSugerencias.limpiar();
    }
  }

  function renderResumenTitulos(formData) {
    var container = qs('#resumenEnvio');

    if (!container) {
      return;
    }

    formData = formData || {};

    var propuestas = Array.isArray(formData.propuestas) ? formData.propuestas : [];
    var preferidoActual = Number(formData.tituloPreferidoNumero || 1);

    container.innerHTML = propuestas.map(function (propuesta) {
      var numero = Number(propuesta.numero || 0);
      var checked = numero === preferidoActual || (!preferidoActual && numero === 1);

      return [
        '<label class="summary-title-option">',
        '<input type="radio" name="tituloPreferido" value="' + numero + '"' + (checked ? ' checked' : '') + ' />',
        '<span>',
        '<strong>Propuesta ' + numero + '</strong>',
        '<em>' + escapeHtml(propuesta.tituloFinal || 'Sin título final') + '</em>',
        '</span>',
        '</label>'
      ].join('');
    }).join('');
  }

  function renderSummary(student, formData, payload) {
    var resumen = qs('#resumenTitulo');
    var modal = qs('#modalConsulta');

    student = student || {};
    formData = formData || {};
    payload = payload || {};

    var propuestas = Array.isArray(formData.propuestas) ? formData.propuestas : [];
    var preferidoNumero = Number(formData.tituloPreferidoNumero || payload.tituloPreferidoNumero || 0);
    var preferida = buscarPropuesta(propuestas, preferidoNumero);

    var html = [
      '<div class="summary-block">',
      '<h3>Datos del estudiante</h3>',
      '<p><strong>Cédula:</strong> ' + escapeHtml(student.cedula || payload.cedula || '') + '</p>',
      '<p><strong>Estudiante:</strong> ' + escapeHtml(student.nombres || payload.nombres || payload.estudiante || '') + '</p>',
      '<p><strong>Carrera:</strong> ' + escapeHtml(student.carrera || payload.carrera || '') + '</p>',
      '</div>',
      '<div class="summary-block summary-block--highlight">',
      '<h3>Título preferido</h3>',
      '<p>' + escapeHtml(preferida ? preferida.tituloFinal : '') + '</p>',
      '</div>',
      '<div class="summary-block">',
      '<h3>Propuestas registradas</h3>',
      propuestas.map(function (propuesta) {
        return '<p><strong>Propuesta ' + propuesta.numero + ':</strong> ' + escapeHtml(propuesta.tituloFinal || '') + '</p>';
      }).join(''),
      '</div>'
    ].join('');

    if (resumen) {
      resumen.innerHTML = html;
    }

    if (modal) {
      modal.innerHTML = html;
    }
  }

  function renderComprobante(resultadoFinal) {
    resultadoFinal = resultadoFinal || {};

    var firebase = resultadoFinal.firebase || {};
    var payload = firebase.payload || firebase.data || resultadoFinal.payload || {};
    var id = resultadoFinal.id || firebase.id || payload.id || payload.idRegistro || '—';

    setText('#codigoRegistroTexto', id);
    setText('#reciboEstudiante', payload.nombres || payload.estudiante || '');
    setText('#reciboCedula', payload.cedula || '');
    setText('#reciboCarrera', payload.carrera || payload.nombreCarrera || '');
    setText('#reciboTituloPreferido', payload.tituloPreferidoTexto || payload.tituloElegido || '');

    hide('#wizardSteps');
    hide('#formPropuestas');
    hide('#seccionEstudiante');
    hide('#pasoConsulta');
    hide('#pasoEnvio');
    show('#comprobanteFinal');
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

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function normalizarTexto(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  window.TAEstudianteUI = Object.freeze({
    qs: qs,
    qsa: qsa,
    setText: setText,
    setValue: setValue,
    value: value,
    show: show,
    hide: hide,
    showStatus: showStatus,
    setLoading: setLoading,
    clearFieldErrors: clearFieldErrors,
    markFieldError: markFieldError,
    focusField: focusField,
    showAlert: showAlert,
    closeAlert: closeAlert,
    openAdviceModal: openAdviceModal,
    closeAdviceModal: closeAdviceModal,
    openModal: openModal,
    closeModal: closeModal,
    setFormDisabled: setFormDisabled,
    renderStudent: renderStudent,
    fillFormData: fillFormData,
    readFormData: readFormData,
    renderSuggestions: renderSuggestions,
    clearSuggestions: clearSuggestions,
    renderResumenTitulos: renderResumenTitulos,
    renderSummary: renderSummary,
    renderComprobante: renderComprobante,
    escapeHtml: escapeHtml,
    normalizarTexto: normalizarTexto
  });
})();