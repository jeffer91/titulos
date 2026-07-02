/* Utilidades de interfaz para el panel administrador. */
(function () {
  'use strict';

  var confirmCallback = null;

  function qs(selector, root) {
    return (root || document).querySelector(selector);
  }

  function qsa(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  function setText(selector, value) {
    var element = qs(selector);
    if (!element) return;
    element.textContent = value === undefined || value === null || value === '' ? '—' : String(value);
  }

  function setValue(selector, value) {
    var element = qs(selector);
    if (!element) return;
    element.value = value === undefined || value === null ? '' : String(value);
  }

  function value(selector) {
    var element = qs(selector);
    return element ? String(element.value || '').trim() : '';
  }

  function checked(selector) {
    var element = qs(selector);
    return Boolean(element && element.checked);
  }

  function setChecked(selector, state) {
    var element = qs(selector);
    if (element) element.checked = Boolean(state);
  }

  function show(selectorOrElement) {
    var element = typeof selectorOrElement === 'string' ? qs(selectorOrElement) : selectorOrElement;
    if (!element) return;

    element.classList.remove('is-hidden');
    element.setAttribute('aria-hidden', 'false');
  }

  function hide(selectorOrElement) {
    var element = typeof selectorOrElement === 'string' ? qs(selectorOrElement) : selectorOrElement;
    if (!element) return;

    element.classList.add('is-hidden');
    element.setAttribute('aria-hidden', 'true');
  }

  function showStatus(selector, message, type) {
    var element = qs(selector);

    if (type === 'error') {
      if (element) {
        element.textContent = '';
        element.classList.remove('is-info', 'is-success', 'is-warning', 'is-error');
      }

      if (typeof message === 'object' && message !== null) {
        abrirError(
          message.mensaje || message.message || 'Ocurrió un error inesperado en el administrador.',
          message.titulo || 'Error en administrador',
          message.detalle || message.detail || ''
        );
      } else {
        abrirError(message || 'Ocurrió un error inesperado en el administrador.');
      }

      return;
    }

    if (!element) return;

    element.textContent = message || '';
    element.classList.remove('is-info', 'is-success', 'is-warning', 'is-error');

    if (type) {
      element.classList.add('is-' + type);
    }
  }

  function setLoading(button, loading, text) {
    if (!button) return;

    if (loading) {
      button.dataset.originalText = button.textContent;
      button.textContent = text || 'Procesando...';
      button.disabled = true;
      return;
    }

    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
  }

  function activarTab(nombreTab) {
    qsa('[data-admin-tab]').forEach(function (button) {
      var active = button.getAttribute('data-admin-tab') === nombreTab;
      button.classList.toggle('is-active', active);
    });

    qsa('[data-admin-panel]').forEach(function (panel) {
      var active = panel.getAttribute('data-admin-panel') === nombreTab;
      panel.classList.toggle('is-active', active);
      panel.classList.toggle('is-hidden', !active);
    });
  }

  function llenarSelect(selector, items, options) {
    var select = qs(selector);
    options = options || {};

    if (!select) return;

    select.innerHTML = '';

    if (options.placeholder !== false) {
      var placeholder = document.createElement('option');
      placeholder.value = options.placeholderValue || '';
      placeholder.textContent = options.placeholderText || 'Selecciona una opción';
      select.appendChild(placeholder);
    }

    (items || []).forEach(function (item) {
      var option = document.createElement('option');

      if (typeof item === 'string') {
        option.value = item;
        option.textContent = item;
      } else {
        option.value = item.value;
        option.textContent = item.label;
      }

      if (options.selected !== undefined && String(options.selected) === String(option.value)) {
        option.selected = true;
      }

      select.appendChild(option);
    });
  }

  function limpiarTabla(selector, colspan, message) {
    var body = qs(selector);
    if (!body) return;

    body.innerHTML = '';

    var tr = document.createElement('tr');
    var td = document.createElement('td');

    td.className = 'empty-cell';
    td.colSpan = colspan || 1;
    td.textContent = message || 'Sin datos para mostrar.';

    tr.appendChild(td);
    body.appendChild(tr);
  }

  function crearBadge(text, type) {
    var span = document.createElement('span');
    span.className = 'badge badge--' + (type || 'muted');
    span.textContent = text || '—';
    return span;
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
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();
  }

  function generarIdDesdeNombre(nombre) {
    return String(nombre || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  function formatNumber(value) {
    var number = Number(value || 0);
    return String(number);
  }

  function renderInicioResumen(stats) {
    stats = stats || {};

    setText('#inicioTotalEstudiantes', formatNumber(stats.totalEstudiantes));
    setText('#inicioSinEnviar', formatNumber(stats.sinEnviar));
    setText('#inicioEnviados', formatNumber(stats.enviados));
    setText('#inicioPendientes', formatNumber(stats.pendientes));
    setText('#inicioDevueltos', formatNumber(stats.devueltos));
    setText('#inicioAprobados', formatNumber(stats.aprobados));
  }

  function renderPendientesPorCarrera(items) {
    var body = qs('#inicioPendientesCarreraBody');
    if (!body) return;

    body.innerHTML = '';

    if (!items || !items.length) {
      limpiarTabla('#inicioPendientesCarreraBody', 2, 'No hay pendientes por carrera.');
      return;
    }

    items.forEach(function (item) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td><strong>' + escapeHtml(item.carrera || 'Sin carrera') + '</strong></td>' +
        '<td class="text-right"><strong>' + formatNumber(item.total) + '</strong></td>';
      body.appendChild(tr);
    });
  }

  function renderPendientesPorPeriodo(items) {
    var body = qs('#inicioPendientesPeriodoBody');
    if (!body) return;

    body.innerHTML = '';

    if (!items || !items.length) {
      limpiarTabla('#inicioPendientesPeriodoBody', 2, 'No hay pendientes por período.');
      return;
    }

    items.forEach(function (item) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td><strong>' + escapeHtml(item.periodoLabel || item.periodoId || 'Sin período') + '</strong></td>' +
        '<td class="text-right"><strong>' + formatNumber(item.total) + '</strong></td>';
      body.appendChild(tr);
    });
  }

  function renderDetalleEstudiante(data) {
    var container = qs('#detalleEstudianteContenido');

    if (!container) return;

    data = data || {};
    container.innerHTML = '';

    container.appendChild(crearDetalleBox('Datos del estudiante', [
      ['Cédula', data.cedula],
      ['Nombre', data.nombres],
      ['Carrera', data.carrera],
      ['Carrera original', data.carreraOriginal],
      ['Período', data.periodoLabel || data.periodoId],
      ['Telegram', data.telegram || data.telegramUser]
    ]));

    container.appendChild(crearDetalleBox('Estado de revisión', [
      ['Estado', data.estado],
      ['Título preferido', data.tituloPreferidoTexto],
      ['Última actualización', data.actualizadoEn || data.updatedAt]
    ]));

    if (Array.isArray(data.titulosEnviados) && data.titulosEnviados.length) {
      data.titulosEnviados.forEach(function (titulo) {
        container.appendChild(crearDetalleBox('Propuesta ' + titulo.numero, [
          ['Título final', titulo.tituloFinal],
          ['Tema', titulo.temaGeneral],
          ['Problema', titulo.problemaNecesidad],
          ['Objetivo', titulo.objetivo]
        ]));
      });
    } else {
      container.appendChild(crearDetalleBox('Títulos enviados', [
        ['Estado', 'El estudiante todavía no registra títulos.']
      ]));
    }
  }

  function crearDetalleBox(title, rows) {
    var box = document.createElement('article');
    var h3 = document.createElement('h3');

    box.className = 'detail-box';
    h3.textContent = title || 'Detalle';
    box.appendChild(h3);

    (rows || []).forEach(function (row) {
      var p = document.createElement('p');
      p.innerHTML = '<strong>' + escapeHtml(row[0]) + ':</strong> ' + escapeHtml(row[1] || '—');
      box.appendChild(p);
    });

    return box;
  }

  function abrirDetalleEstudiante(data) {
    renderDetalleEstudiante(data);
    show('#modalDetalleEstudiante');
  }

  function cerrarDetalleEstudiante() {
    hide('#modalDetalleEstudiante');
  }

  function asegurarEventosError() {
    var btnCerrar = qs('#btnCerrarErrorAdmin');
    var btnAceptar = qs('#btnAceptarErrorAdmin');
    var backdrop = qs('#backdropErrorAdmin');

    if (btnCerrar && !btnCerrar.dataset.errorBound) {
      btnCerrar.dataset.errorBound = 'true';
      btnCerrar.addEventListener('click', cerrarError);
    }

    if (btnAceptar && !btnAceptar.dataset.errorBound) {
      btnAceptar.dataset.errorBound = 'true';
      btnAceptar.addEventListener('click', cerrarError);
    }

    if (backdrop && !backdrop.dataset.errorBound) {
      backdrop.dataset.errorBound = 'true';
      backdrop.addEventListener('click', cerrarError);
    }
  }

  function abrirError(mensaje, titulo, detalle) {
    var detalleWrap = qs('#modalErrorDetalleWrap');
    var detallePre = qs('#modalErrorDetalle');

    asegurarEventosError();

    setText('#modalErrorTitulo', titulo || 'Error en administrador');
    setText('#modalErrorMensaje', mensaje || 'Ocurrió un error inesperado.');

    if (detalleWrap && detallePre) {
      if (detalle) {
        detallePre.textContent = String(detalle);
        detalleWrap.classList.remove('is-hidden');
      } else {
        detallePre.textContent = 'Sin detalle técnico.';
        detalleWrap.classList.add('is-hidden');
      }
    }

    show('#modalErrorAdmin');
  }

  function cerrarError() {
    hide('#modalErrorAdmin');
  }

  function confirmar(options) {
    options = options || {};

    setText('#modalConfirmacionTitulo', options.titulo || 'Confirmar acción');
    setText('#modalConfirmacionMensaje', options.mensaje || '¿Deseas continuar?');

    confirmCallback = typeof options.onConfirm === 'function' ? options.onConfirm : null;
    show('#modalConfirmacion');
  }

  function cerrarConfirmacion() {
    hide('#modalConfirmacion');
    confirmCallback = null;
  }

  function aceptarConfirmacion() {
    var callback = confirmCallback;
    hide('#modalConfirmacion');
    confirmCallback = null;

    if (callback) callback();
  }

  function badgeEstadoTitulo(estado) {
    var normalized = normalizarTexto(estado);

    if (normalized === 'APROBADO') {
      return crearBadge('Aprobado', 'success');
    }

    if (normalized === 'DEVUELTO') {
      return crearBadge('Devuelto', 'danger');
    }

    if (normalized === 'ENVIADO' || normalized === 'PENDIENTE') {
      return crearBadge('Pendiente', 'warning');
    }

    if (normalized === 'SIN_ENVIAR') {
      return crearBadge('Sin enviar', 'muted');
    }

    return crearBadge(estado || 'Sin estado', 'primary');
  }

  function obtenerProviderForm(provider) {
    return {
      id: provider,
      activo: checked('#' + provider + 'Activo'),
      apiKey: value('#' + provider + 'ApiKey'),
      modelo: value('#' + provider + 'Modelo'),
      endpoint: value('#' + provider + 'Endpoint')
    };
  }

  function llenarProviderForm(provider, data) {
    data = data || {};

    setChecked('#' + provider + 'Activo', data.activo);
    setValue('#' + provider + 'ApiKey', data.apiKey || data.key || '');
    setValue('#' + provider + 'Modelo', data.modelo || data.model || '');
    setValue('#' + provider + 'Endpoint', data.endpoint || '');
  }

  function conectarModalesBase() {
    var btnCerrarDetalle = qs('#btnCerrarDetalleEstudiante');
    var btnCerrarConfirmacion = qs('#btnCerrarConfirmacion');
    var btnCancelarConfirmacion = qs('#btnCancelarConfirmacion');
    var btnAceptarConfirmacion = qs('#btnAceptarConfirmacion');

    if (btnCerrarDetalle && !btnCerrarDetalle.dataset.modalBound) {
      btnCerrarDetalle.dataset.modalBound = 'true';
      btnCerrarDetalle.addEventListener('click', cerrarDetalleEstudiante);
    }

    if (btnCerrarConfirmacion && !btnCerrarConfirmacion.dataset.modalBound) {
      btnCerrarConfirmacion.dataset.modalBound = 'true';
      btnCerrarConfirmacion.addEventListener('click', cerrarConfirmacion);
    }

    if (btnCancelarConfirmacion && !btnCancelarConfirmacion.dataset.modalBound) {
      btnCancelarConfirmacion.dataset.modalBound = 'true';
      btnCancelarConfirmacion.addEventListener('click', cerrarConfirmacion);
    }

    if (btnAceptarConfirmacion && !btnAceptarConfirmacion.dataset.modalBound) {
      btnAceptarConfirmacion.dataset.modalBound = 'true';
      btnAceptarConfirmacion.addEventListener('click', aceptarConfirmacion);
    }

    asegurarEventosError();
  }

  window.TAAdminUI = Object.freeze({
    qs: qs,
    qsa: qsa,
    setText: setText,
    setValue: setValue,
    value: value,
    checked: checked,
    setChecked: setChecked,
    show: show,
    hide: hide,
    showStatus: showStatus,
    setLoading: setLoading,
    activarTab: activarTab,
    llenarSelect: llenarSelect,
    limpiarTabla: limpiarTabla,
    crearBadge: crearBadge,
    escapeHtml: escapeHtml,
    normalizarTexto: normalizarTexto,
    generarIdDesdeNombre: generarIdDesdeNombre,
    renderInicioResumen: renderInicioResumen,
    renderPendientesPorCarrera: renderPendientesPorCarrera,
    renderPendientesPorPeriodo: renderPendientesPorPeriodo,
    abrirDetalleEstudiante: abrirDetalleEstudiante,
    cerrarDetalleEstudiante: cerrarDetalleEstudiante,
    abrirError: abrirError,
    cerrarError: cerrarError,
    confirmar: confirmar,
    cerrarConfirmacion: cerrarConfirmacion,
    aceptarConfirmacion: aceptarConfirmacion,
    badgeEstadoTitulo: badgeEstadoTitulo,
    obtenerProviderForm: obtenerProviderForm,
    llenarProviderForm: llenarProviderForm,
    conectarModalesBase: conectarModalesBase
  });
})();