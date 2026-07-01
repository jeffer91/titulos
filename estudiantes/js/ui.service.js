/* Servicio de interfaz para estudiantes. */
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
    if (element) element.textContent = value || '—';
  }

  function setValue(selector, value) {
    var element = qs(selector);
    if (element) element.value = value || '';
  }

  function show(elementOrSelector) {
    var element = typeof elementOrSelector === 'string' ? qs(elementOrSelector) : elementOrSelector;
    if (element) element.classList.remove('is-hidden');
  }

  function hide(elementOrSelector) {
    var element = typeof elementOrSelector === 'string' ? qs(elementOrSelector) : elementOrSelector;
    if (element) element.classList.add('is-hidden');
  }

  function showStatus(selector, message, type) {
    var element = qs(selector);
    if (!element) return;

    element.classList.remove('is-info', 'is-success', 'is-warning', 'is-error');
    if (type) element.classList.add('is-' + type);
    element.textContent = message || '';
  }

  function setLoading(button, isLoading, loadingText) {
    if (!button) return;

    if (isLoading) {
      if (!button.dataset.originalText) button.dataset.originalText = button.textContent;
      button.textContent = loadingText || 'Cargando...';
      button.disabled = true;
      return;
    }

    button.disabled = false;
    if (button.dataset.originalText) {
      button.textContent = button.dataset.originalText;
      delete button.dataset.originalText;
    }
  }

  function setButtonsDisabled(selectors, disabled) {
    selectors.forEach(function (selector) {
      var button = qs(selector);
      if (button) button.disabled = Boolean(disabled);
    });
  }

  function setFormDisabled(formSelector, disabled) {
    var form = qs(formSelector);
    if (!form) return;

    qsa('input, textarea, button, select', form).forEach(function (element) {
      element.disabled = Boolean(disabled);
    });

    form.classList.toggle('is-locked', Boolean(disabled));
  }

  function renderStudent(student) {
    setText('#datoCedula', student.cedula);
    setText('#datoNombres', student.nombres);
    setText('#datoCarrera', student.carrera || student.nombreCarrera);
    setText('#datoPeriodo', student.periodoId);
    show('#seccionEstudiante');
    show('#formPropuestas');
    hide('#comprobanteFinal');
  }

  function readProposal(numero) {
    return {
      numero: numero,
      temaGeneral: value('#p' + numero + 'Tema'),
      problemaNecesidad: value('#p' + numero + 'Problema'),
      lugarContexto: value('#p' + numero + 'Contexto'),
      grupoEstudio: value('#p' + numero + 'Grupo'),
      anioPeriodo: value('#p' + numero + 'Periodo'),
      objetivo: value('#p' + numero + 'Objetivo'),
      tituloFinal: value('#p' + numero + 'Titulo')
    };
  }

  function readFormData(totalPropuestas) {
    var propuestas = [];
    var total = totalPropuestas || 3;

    for (var i = 1; i <= total; i += 1) {
      propuestas.push(readProposal(i));
    }

    return {
      telegram: value('#telegramInput'),
      celular: value('#celularInput'),
      tituloPreferidoNumero: Number((qs('input[name="tituloPreferido"]:checked') || {}).value || 1),
      propuestas: propuestas
    };
  }

  function fillFormData(formData) {
    if (!formData) return;

    setValue('#telegramInput', formData.telegram || '');
    setValue('#celularInput', formData.celular || '');

    if (Array.isArray(formData.propuestas)) {
      formData.propuestas.forEach(function (propuesta) {
        var numero = Number(propuesta.numero);
        if (!numero) return;
        setValue('#p' + numero + 'Tema', propuesta.temaGeneral || '');
        setValue('#p' + numero + 'Problema', propuesta.problemaNecesidad || '');
        setValue('#p' + numero + 'Contexto', propuesta.lugarContexto || '');
        setValue('#p' + numero + 'Grupo', propuesta.grupoEstudio || '');
        setValue('#p' + numero + 'Periodo', propuesta.anioPeriodo || '');
        setValue('#p' + numero + 'Objetivo', propuesta.objetivo || '');
        setValue('#p' + numero + 'Titulo', propuesta.tituloFinal || '');
      });
    }

    marcarTituloPreferido(formData.tituloPreferidoNumero || 1);
  }

  function marcarTituloPreferido(numero) {
    var radio = qs('input[name="tituloPreferido"][value="' + Number(numero || 1) + '"]');
    if (radio) radio.checked = true;
  }

  function value(selector) {
    var element = qs(selector);
    return element ? String(element.value || '').trim() : '';
  }

  function renderSuggestions(numero, sugerencias) {
    var container = qs('#sugerencias' + numero);
    if (!container) return;

    container.innerHTML = '';
    sugerencias.forEach(function (titulo, index) {
      var item = document.createElement('div');
      item.className = 'suggestion-item';

      var label = document.createElement('strong');
      label.textContent = 'Sugerencia ' + (index + 1);

      var text = document.createElement('p');
      text.textContent = titulo;

      var button = document.createElement('button');
      button.className = 'btn btn--secondary';
      button.type = 'button';
      button.textContent = 'Usar este título';
      button.addEventListener('click', function () {
        setValue('#p' + numero + 'Titulo', titulo);
        showStatus('#envioMensaje', 'Título copiado en la propuesta ' + numero + '.', 'success');
      });

      item.appendChild(label);
      item.appendChild(text);
      item.appendChild(button);
      container.appendChild(item);
    });
  }

  function clearSuggestions() {
    qsa('.suggestions').forEach(function (container) {
      container.innerHTML = '';
    });
  }

  function renderSummary(estudiante, formData, payload) {
    var container = qs('#resumenContenido');
    if (!container) return;

    var html = '';
    html += '<div class="summary-alert">';
    html += '<strong>Revisa antes de confirmar.</strong> Al confirmar se registrará tu envío oficialmente.';
    html += '</div>';

    html += '<div class="summary-block">';
    html += '<h3>Estudiante</h3>';
    html += '<p><strong>Cédula:</strong> ' + escapeHtml(estudiante.cedula) + '</p>';
    html += '<p><strong>Nombres:</strong> ' + escapeHtml(estudiante.nombres) + '</p>';
    html += '<p><strong>Carrera:</strong> ' + escapeHtml(estudiante.carrera || estudiante.nombreCarrera) + '</p>';
    html += '<p><strong>Período:</strong> ' + escapeHtml(estudiante.periodoId) + '</p>';
    if (payload) {
      html += '<p><strong>Intento:</strong> ' + escapeHtml(payload.intentosUsados) + ' de ' + escapeHtml(payload.maxIntentos) + '</p>';
    }
    html += '</div>';

    formData.propuestas.forEach(function (propuesta) {
      var preferido = Number(propuesta.numero) === Number(formData.tituloPreferidoNumero) ? 'Sí' : 'No';
      html += '<div class="summary-block">';
      html += '<h3>Propuesta ' + propuesta.numero + '</h3>';
      html += '<p><strong>Título final:</strong> ' + escapeHtml(propuesta.tituloFinal) + '</p>';
      html += '<p><strong>Tema:</strong> ' + escapeHtml(propuesta.temaGeneral) + '</p>';
      html += '<p><strong>Problema:</strong> ' + escapeHtml(propuesta.problemaNecesidad) + '</p>';
      html += '<p><strong>Contexto:</strong> ' + escapeHtml(propuesta.lugarContexto) + '</p>';
      html += '<p><strong>Preferido:</strong> ' + preferido + '</p>';
      html += '</div>';
    });

    container.innerHTML = html;
  }

  function renderComprobante(resultadoFinal) {
    var section = qs('#comprobanteFinal');
    var container = qs('#comprobanteContenido');
    var code = qs('#codigoRegistroTexto');
    if (!section || !container || !resultadoFinal) return;

    var id = resultadoFinal.id || '—';
    var firebaseData = resultadoFinal.firebase && resultadoFinal.firebase.data ? resultadoFinal.firebase.data : {};
    var sheets = resultadoFinal.sheets || {};

    if (code) code.textContent = id;

    var sheetsText = sheets.ok
      ? 'Respaldado en Google Sheets'
      : sheets.omitido
        ? 'Respaldo Sheets no configurado'
        : 'Respaldo Sheets pendiente';

    container.innerHTML = '';
    container.appendChild(receiptItem('Código de registro', id));
    container.appendChild(receiptItem('Estudiante', firebaseData.nombres || '—'));
    container.appendChild(receiptItem('Cédula', firebaseData.cedula || '—'));
    container.appendChild(receiptItem('Carrera', firebaseData.carrera || firebaseData.nombreCarrera || '—'));
    container.appendChild(receiptItem('Período', firebaseData.periodoId || '—'));
    container.appendChild(receiptItem('Estado', firebaseData.estado || 'ENVIADO'));
    container.appendChild(receiptItem('Título preferido', 'Propuesta ' + (firebaseData.tituloPreferidoNumero || '—')));
    container.appendChild(receiptItem('Google Sheets', sheetsText));

    show(section);
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function receiptItem(label, valueToShow) {
    var item = document.createElement('div');
    item.className = 'receipt-item';

    var span = document.createElement('span');
    span.textContent = label;

    var strong = document.createElement('strong');
    strong.textContent = valueToShow || '—';

    item.appendChild(span);
    item.appendChild(strong);
    return item;
  }

  function openModal() {
    show('#modalResumen');
  }

  function closeModal() {
    hide('#modalResumen');
  }

  function clearFieldErrors() {
    qsa('.is-invalid').forEach(function (element) {
      element.classList.remove('is-invalid');
      element.removeAttribute('aria-invalid');
    });
  }

  function markFieldError(selector) {
    clearFieldErrors();
    var element = qs(selector);
    if (!element) return;

    element.classList.add('is-invalid');
    element.setAttribute('aria-invalid', 'true');
    element.focus();
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function escapeHtml(valueToEscape) {
    return String(valueToEscape || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  window.TAEstudianteUI = Object.freeze({
    qs: qs,
    qsa: qsa,
    show: show,
    hide: hide,
    value: value,
    setText: setText,
    setValue: setValue,
    showStatus: showStatus,
    setLoading: setLoading,
    setButtonsDisabled: setButtonsDisabled,
    setFormDisabled: setFormDisabled,
    renderStudent: renderStudent,
    readFormData: readFormData,
    fillFormData: fillFormData,
    marcarTituloPreferido: marcarTituloPreferido,
    renderSuggestions: renderSuggestions,
    clearSuggestions: clearSuggestions,
    renderSummary: renderSummary,
    renderComprobante: renderComprobante,
    openModal: openModal,
    closeModal: closeModal,
    clearFieldErrors: clearFieldErrors,
    markFieldError: markFieldError,
    escapeHtml: escapeHtml
  });
})();
