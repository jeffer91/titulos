/*
  Archivo: ui.service.js
  Ruta: estudiantes/js/ui.service.js
  Funciones principales del archivo:
  - Proveer utilidades de interfaz para el módulo estudiantes.
  - Leer y escribir datos del formulario.
  - Mostrar y ocultar secciones.
  - Mostrar estados y alertas.
  - Marcar errores de campos.
  - Renderizar datos académicos del estudiante.
  - Renderizar resumen de títulos.
  - Renderizar resumen final antes de confirmar.
  - Renderizar comprobante final.
  - Mantener compatibilidad con modal.service.js si existe.
*/
(function () {
  'use strict';

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

    element.textContent = value === undefined || value === null || value === '' ? '—' : String(value);
  }

  function setValue(selector, value) {
    var element = qs(selector);

    if (!element) {
      return;
    }

    element.value = value === undefined || value === null ? '' : String(value);
  }

  function value(selector) {
    var element = qs(selector);
    return element ? normalizarTexto(element.value) : '';
  }

  function show(selectorOrElement) {
    var element = typeof selectorOrElement === 'string' ? qs(selectorOrElement) : selectorOrElement;

    if (!element) {
      return;
    }

    element.classList.remove('is-hidden');
    element.setAttribute('aria-hidden', 'false');
  }

  function hide(selectorOrElement) {
    var element = typeof selectorOrElement === 'string' ? qs(selectorOrElement) : selectorOrElement;

    if (!element) {
      return;
    }

    element.classList.add('is-hidden');
    element.setAttribute('aria-hidden', 'true');
  }

  function showStatus(selector, message, type) {
    var element = qs(selector);

    if (!element) {
      return;
    }

    element.textContent = message || '';
    element.classList.remove('is-info', 'is-success', 'is-warning', 'is-error');

    if (type) {
      element.classList.add('is-' + type);
    }
  }

  function setLoading(button, loading, text) {
    if (!button) {
      return;
    }

    if (loading) {
      if (!button.dataset.originalText) {
        button.dataset.originalText = button.textContent;
      }

      button.textContent = text || 'Procesando...';
      button.disabled = true;
      button.classList.add('is-loading');
      return;
    }

    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
    button.classList.remove('is-loading');
  }

  function clearFieldErrors() {
    qsa('.is-field-error').forEach(function (element) {
      element.classList.remove('is-field-error');
      element.removeAttribute('aria-invalid');
    });

    qsa('.field-error-message').forEach(function (element) {
      element.remove();
    });
  }

  function markFieldError(selector, message) {
    var element = selector ? qs(selector) : null;
    var field;
    var small;

    if (!element) {
      return;
    }

    element.classList.add('is-field-error');
    element.setAttribute('aria-invalid', 'true');

    field = element.closest ? element.closest('.field') : null;

    if (!field) {
      return;
    }

    qsa('.field-error-message', field).forEach(function (item) {
      item.remove();
    });

    small = document.createElement('small');
    small.className = 'field-error-message';
    small.textContent = message || 'Revisa este campo.';
    field.appendChild(small);
  }

  function focusField(selector) {
    var element = selector ? qs(selector) : null;

    if (!element) {
      return;
    }

    window.setTimeout(function () {
      if (typeof element.focus === 'function' && !element.disabled) {
        element.focus();
      }

      if (typeof element.scrollIntoView === 'function') {
        element.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
      }
    }, 80);
  }

  function showAlert(message, selector, title) {
    var modalService = window.TAEstudianteModal;

    if (selector) {
      markFieldError(selector, message);
      focusField(selector);
    }

    if (modalService && typeof modalService.mostrarAlerta === 'function') {
      modalService.mostrarAlerta(message || 'Revisa la información.', {
        titulo: title || 'Revisa la información'
      });
      return;
    }

    setText('#tituloModalAlerta', title || 'Revisa la información');
    setText('#mensajeModalAlerta', message || 'Completa los campos requeridos.');
    openModalBySelector('#modalAlerta');

    window.setTimeout(function () {
      var btn = qs('#btnAceptarAlerta');

      if (btn && typeof btn.focus === 'function') {
        btn.focus();
      }
    }, 80);
  }

  function closeAlert() {
    var modalService = window.TAEstudianteModal;

    if (modalService && typeof modalService.cerrar === 'function') {
      modalService.cerrar('#modalAlerta');
      return;
    }

    closeModalBySelector('#modalAlerta');
  }

  function openAdviceModal() {
    var modalService = window.TAEstudianteModal;

    if (modalService && typeof modalService.abrir === 'function') {
      modalService.abrir('#modalRecomendaciones');
      return;
    }

    openModalBySelector('#modalRecomendaciones');
  }

  function closeAdviceModal() {
    var modalService = window.TAEstudianteModal;

    if (modalService && typeof modalService.cerrar === 'function') {
      modalService.cerrar('#modalRecomendaciones');
      return;
    }

    closeModalBySelector('#modalRecomendaciones');
  }

  function openModal() {
    var modalService = window.TAEstudianteModal;

    if (modalService && typeof modalService.abrir === 'function') {
      modalService.abrir('#modalResumen');
      return;
    }

    openModalBySelector('#modalResumen');
  }

  function closeModal() {
    var modalService = window.TAEstudianteModal;

    if (modalService && typeof modalService.cerrar === 'function') {
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
    return qsa('.modal, .ia-loading-modal').some(function (modal) {
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
    var periodoTexto;

    student = student || {};

    periodoTexto = student.periodoLabel ||
      student.periodo ||
      student.periodoId ||
      student.ultimoPeriodoId ||
      '';

    if (window.TAEstudiantePeriodo && typeof window.TAEstudiantePeriodo.obtenerEtiquetaPeriodo === 'function') {
      periodoTexto = window.TAEstudiantePeriodo.obtenerEtiquetaPeriodo(student) || periodoTexto;
    }

    setText('#datoCedula', student.cedula || student.numeroIdentificacion || student.identificacion || '');
    setText('#datoNombres', student.nombres || student.estudiante || student.nombre || 'Datos académicos del estudiante');
    setText('#datoCarrera', student.carrera || student.nombreCarrera || '');
    setText('#datoPeriodo', periodoTexto || '—');

    show('#seccionEstudiante');
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
    var propuestas = [];
    var preferido;

    if (window.TAEstudianteTelegram && typeof window.TAEstudianteTelegram.normalizarUsuario === 'function') {
      telegram = window.TAEstudianteTelegram.normalizarUsuario(telegram);
    }

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

    preferido = qs('input[name="tituloPreferido"]:checked');

    return {
      telegram: telegram,
      tituloPreferidoNumero: preferido ? Number(preferido.value) : 0,
      propuestas: propuestas
    };
  }

  function renderSuggestions(numero, sugerencias) {
    if (window.TAEstudianteSugerencias && typeof window.TAEstudianteSugerencias.renderizar === 'function') {
      window.TAEstudianteSugerencias.renderizar(numero, sugerencias, {
        autoseleccionar: false
      });
      return;
    }

    renderSuggestionsFallback(numero, sugerencias);
  }

  function renderSuggestionsFallback(numero, sugerencias) {
    var container = qs('#p' + numero + 'Sugerencias');

    if (!container) {
      return;
    }

    container.innerHTML = '';

    if (!Array.isArray(sugerencias) || !sugerencias.length) {
      container.innerHTML = '<p class="muted">No se generaron sugerencias.</p>';
      return;
    }

    sugerencias.forEach(function (texto, index) {
      var button = document.createElement('button');

      button.type = 'button';
      button.className = 'suggestion-card';
      button.textContent = String(texto || '');

      button.addEventListener('click', function () {
        setValue('#p' + numero + 'Titulo', texto || '');
        var campo = qs('#p' + numero + 'Titulo');

        if (campo) {
          campo.setAttribute('data-sugerencia-seleccionada', 'true');
          campo.setAttribute('data-sugerencia-index', String(index));
          campo.setAttribute('readonly', 'readonly');
          campo.classList.add('title-final-selected--stable');
        }
      });

      container.appendChild(button);
    });
  }

  function clearSuggestions() {
    if (window.TAEstudianteSugerencias && typeof window.TAEstudianteSugerencias.limpiarTodo === 'function') {
      window.TAEstudianteSugerencias.limpiarTodo();
      return;
    }

    qsa('[id^="p"][id$="Sugerencias"]').forEach(function (container) {
      container.innerHTML = '';
    });
  }

  function renderResumenTitulos(formData) {
    var container = qs('#resumenEnvio');
    var propuestas;

    if (!container) {
      return;
    }

    formData = formData || {};
    propuestas = Array.isArray(formData.propuestas) ? formData.propuestas : [];

    if (!propuestas.length) {
      container.innerHTML = '<p class="muted">Completa las tres propuestas para ver el resumen.</p>';
      return;
    }

    container.innerHTML = [
      '<div class="summary-block">',
      '<h3>Elige el título que más te gusta</h3>',
      '<p class="muted">Selecciona una de las tres propuestas antes de confirmar el envío.</p>',
      '</div>',
      propuestas.map(function (propuesta) {
        return renderTituloPreferidoOption(propuesta, formData.tituloPreferidoNumero);
      }).join('')
    ].join('');
  }

  function renderTituloPreferidoOption(propuesta, preferidoNumero) {
    var numero = Number(propuesta.numero || 0);
    var checked = Number(preferidoNumero || 0) === numero;
    var titulo = propuesta.tituloFinal || 'Título final pendiente';

    return [
      '<label class="summary-title-option summary-option">',
      '<input type="radio" name="tituloPreferido" value="' + numero + '"' + (checked ? ' checked' : '') + ' />',
      '<span>',
      '<strong>Propuesta ' + numero + '</strong>',
      '<em>' + escapeHtml(titulo) + '</em>',
      '</span>',
      '</label>'
    ].join('');
  }

  function renderSummary(student, formData, payload) {
    var resumen = qs('#resumenTitulo');
    var modal = qs('#modalConsulta');
    var propuestas;
    var preferidoNumero;
    var preferida;
    var html;

    student = student || {};
    formData = formData || {};
    payload = payload || {};
    propuestas = Array.isArray(formData.propuestas) ? formData.propuestas : [];
    preferidoNumero = Number(formData.tituloPreferidoNumero || payload.tituloPreferidoNumero || 0);
    preferida = buscarPropuesta(propuestas, preferidoNumero);

    html = [
      '<div class="summary-block">',
      '<h3>Datos del estudiante</h3>',
      '<p><strong>Cédula:</strong> ' + escapeHtml(student.cedula || payload.cedula || '') + '</p>',
      '<p><strong>Estudiante:</strong> ' + escapeHtml(student.nombres || payload.nombres || payload.estudiante || '') + '</p>',
      '<p><strong>Carrera:</strong> ' + escapeHtml(student.carrera || student.nombreCarrera || payload.carrera || payload.nombreCarrera || '') + '</p>',
      '<p><strong>Telegram:</strong> ' + escapeHtml(formData.telegram || payload.telegram || '') + '</p>',
      '</div>',
      '<div class="summary-block summary-block--highlight">',
      '<h3>Título preferido</h3>',
      '<p>' + escapeHtml(preferida ? preferida.tituloFinal : 'No seleccionado') + '</p>',
      '</div>',
      '<div class="summary-block">',
      '<h3>Propuestas registradas</h3>',
      propuestas.map(function (propuesta) {
        return [
          '<article class="summary-proposal">',
          '<h4>Propuesta ' + escapeHtml(propuesta.numero) + '</h4>',
          '<p><strong>Título final:</strong> ' + escapeHtml(propuesta.tituloFinal || '') + '</p>',
          '<p><strong>Tema:</strong> ' + escapeHtml(propuesta.temaGeneral || '') + '</p>',
          '<p><strong>Problema:</strong> ' + escapeHtml(propuesta.problemaNecesidad || '') + '</p>',
          '<p><strong>Objetivo:</strong> ' + escapeHtml(propuesta.objetivo || '') + '</p>',
          '</article>'
        ].join('');
      }).join(''),
      '</div>'
    ].join('');

    if (resumen) {
      resumen.innerHTML = html;
    }

    if (modal) {
      modal.innerHTML = html;
      modal.classList.remove('is-hidden');
    }
  }

  function renderComprobante(resultadoFinal) {
    var firebase;
    var payload;
    var id;

    resultadoFinal = resultadoFinal || {};
    firebase = resultadoFinal.firebase || {};
    payload = resultadoFinal.payload || firebase.payload || firebase.data || resultadoFinal.data || {};
    id = resultadoFinal.id || firebase.id || payload.id || payload.idRegistro || payload.codigoRegistro || '—';

    setText('#codigoRegistroTexto', id);
    setText('#reciboEstudiante', payload.nombres || payload.estudiante || payload.nombre || '');
    setText('#reciboCedula', payload.cedula || payload.numeroIdentificacion || '');
    setText('#reciboCarrera', payload.carrera || payload.nombreCarrera || '');
    setText('#reciboTituloPreferido', payload.tituloPreferidoTexto || payload.tituloElegido || obtenerTituloPreferidoDesdePayload(payload));

    hide('#wizardSteps');
    hide('#formPropuestas');
    hide('#seccionEstudiante');
    hide('#consultaCard');
    hide('#pasoConsulta');
    hide('#pasoEnvio');
    show('#comprobanteFinal');

    focusField('#comprobanteFinal');
  }

  function obtenerTituloPreferidoDesdePayload(payload) {
    var numero = Number(payload && payload.tituloPreferidoNumero || 0);
    var titulos = payload && Array.isArray(payload.titulosEnviados) ? payload.titulosEnviados : [];
    var encontrado = buscarPropuesta(titulos, numero);

    return encontrado ? encontrado.tituloFinal : '';
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
    openModalBySelector: openModalBySelector,
    closeModalBySelector: closeModalBySelector,
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