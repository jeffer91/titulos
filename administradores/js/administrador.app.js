/* Controlador base del módulo administradores. */
(function () {
  'use strict';

  var config = window.TA_ADMINISTRADORES_CONFIG;
  var firebaseService = window.TAAdminFirebaseService;
  var repository = window.TAAdminRepository;

  var estado = {
    firebaseListo: false,
    appConfig: null,
    iaConfig: null,
    periodos: []
  };

  document.addEventListener('DOMContentLoaded', iniciar);

  function iniciar() {
    actualizarModoEjecucion();
    conectarEventos();
    bloquearPanel(true);
    renderDiagnosticoBase();
    iniciarFirebase();
  }

  function conectarEventos() {
    var formConfig = qs('#formConfigGeneral');
    var formPeriodo = qs('#formPeriodo');
    var formIA = qs('#formIA');
    var btnCargarConfig = qs('#btnCargarConfig');
    var btnCargarPeriodos = qs('#btnCargarPeriodos');
    var btnLimpiarPeriodo = qs('#btnLimpiarPeriodo');
    var btnCargarIA = qs('#btnCargarIA');
    var btnDiagnostico = qs('#btnDiagnostico');
    var proveedorIA = qs('#iaProveedorInput');
    var periodosLista = qs('#periodosLista');

    if (formConfig) formConfig.addEventListener('submit', guardarConfigGeneral);
    if (formPeriodo) formPeriodo.addEventListener('submit', guardarPeriodo);
    if (formIA) formIA.addEventListener('submit', guardarConfigIA);
    if (btnCargarConfig) btnCargarConfig.addEventListener('click', cargarConfigGeneral);
    if (btnCargarPeriodos) btnCargarPeriodos.addEventListener('click', cargarPeriodos);
    if (btnLimpiarPeriodo) btnLimpiarPeriodo.addEventListener('click', limpiarPeriodoForm);
    if (btnCargarIA) btnCargarIA.addEventListener('click', cargarConfigIA);
    if (btnDiagnostico) btnDiagnostico.addEventListener('click', ejecutarDiagnostico);
    if (proveedorIA) proveedorIA.addEventListener('change', cargarConfigIA);
    if (periodosLista) periodosLista.addEventListener('click', manejarAccionPeriodo);
  }

  function iniciarFirebase() {
    setText('#estadoGeneral', 'Conectando Firebase');
    setText('#projectIdTexto', config.firebase.projectId || '—');
    setText('#firebaseMensaje', 'Inicializando conexión con Firebase...');

    if (!firebaseService || !repository) {
      estado.firebaseListo = false;
      setText('#estadoGeneral', 'Archivos incompletos');
      setText('#firebaseMensaje', 'No se cargaron los servicios Firebase del módulo administradores.');
      renderDiagnosticoBase('error');
      bloquearPanel(true);
      return;
    }

    firebaseService.iniciar(config.firebase).then(function (resultado) {
      estado.firebaseListo = resultado.ok;

      if (!resultado.ok) {
        setText('#estadoGeneral', 'Firebase pendiente');
        setText('#firebaseMensaje', resultado.mensaje);
        setText('#configOrigenTexto', 'Sin conexión');
        renderDiagnosticoBase('pending', resultado.mensaje);
        bloquearPanel(true);
        return;
      }

      setText('#estadoGeneral', 'Firebase conectado');
      setText('#firebaseMensaje', resultado.mensaje);
      bloquearPanel(false);
      cargarConfigGeneral();
      cargarPeriodos();
      cargarConfigIA();
      ejecutarDiagnostico();
    });
  }

  function cargarConfigGeneral() {
    if (!estado.firebaseListo) {
      showStatus('#configMensaje', 'Firebase no está conectado.', 'warning');
      return;
    }

    setLoading('#btnCargarConfig', true, 'Cargando...');
    showStatus('#configMensaje', 'Cargando configuración general...', 'info');

    repository.cargarConfigApp()
      .then(function (appConfig) {
        estado.appConfig = appConfig;
        pintarConfigGeneral(appConfig);
        setText('#configOrigenTexto', appConfig.origen === 'firebase' ? 'Firebase' : 'Local por defecto');
        showStatus('#configMensaje', 'Configuración general cargada.', 'success');
      })
      .catch(function (error) {
        showStatus('#configMensaje', 'No se pudo cargar configuración: ' + obtenerMensajeError(error), 'error');
      })
      .finally(function () {
        setLoading('#btnCargarConfig', false);
      });
  }

  function guardarConfigGeneral(event) {
    event.preventDefault();

    if (!estado.firebaseListo) {
      showStatus('#configMensaje', 'Firebase no está conectado.', 'warning');
      return;
    }

    var data = leerConfigGeneral();
    var validacion = validarConfigGeneral(data);
    if (!validacion.ok) {
      showStatus('#configMensaje', validacion.mensaje, 'error');
      return;
    }

    setLoading('#btnGuardarConfig', true, 'Guardando...');
    showStatus('#configMensaje', 'Guardando configuración general...', 'info');

    repository.guardarConfigApp(data)
      .then(function (appConfig) {
        estado.appConfig = appConfig;
        pintarConfigGeneral(appConfig);
        setText('#configOrigenTexto', 'Firebase');
        showStatus('#configMensaje', 'Configuración general guardada correctamente.', 'success');
        ejecutarDiagnostico();
      })
      .catch(function (error) {
        showStatus('#configMensaje', 'No se pudo guardar configuración: ' + obtenerMensajeError(error), 'error');
      })
      .finally(function () {
        setLoading('#btnGuardarConfig', false);
      });
  }

  function cargarPeriodos() {
    if (!estado.firebaseListo) {
      showStatus('#periodosMensaje', 'Firebase no está conectado.', 'warning');
      return;
    }

    setLoading('#btnCargarPeriodos', true, 'Cargando...');
    showStatus('#periodosMensaje', 'Cargando períodos...', 'info');

    repository.listarPeriodos()
      .then(function (periodos) {
        estado.periodos = periodos;
        renderPeriodos(periodos);
        showStatus('#periodosMensaje', 'Períodos cargados: ' + periodos.length + '.', 'success');
      })
      .catch(function (error) {
        showStatus('#periodosMensaje', 'No se pudieron cargar períodos: ' + obtenerMensajeError(error), 'error');
      })
      .finally(function () {
        setLoading('#btnCargarPeriodos', false);
      });
  }

  function guardarPeriodo(event) {
    event.preventDefault();

    if (!estado.firebaseListo) {
      showStatus('#periodosMensaje', 'Firebase no está conectado.', 'warning');
      return;
    }

    var data = leerPeriodoForm();
    var validacion = validarPeriodo(data);
    if (!validacion.ok) {
      showStatus('#periodosMensaje', validacion.mensaje, 'error');
      return;
    }

    setLoading('#btnGuardarPeriodo', true, 'Guardando...');
    showStatus('#periodosMensaje', 'Guardando período...', 'info');

    repository.guardarPeriodo(data)
      .then(function () {
        if (data.estado === 'ACTIVO') return repository.activarPeriodo(data.id);
        if (data.estado === 'CERRADO') return repository.cerrarPeriodo(data.id);
        return null;
      })
      .then(function () {
        showStatus('#periodosMensaje', 'Período guardado correctamente.', 'success');
        limpiarPeriodoForm();
        cargarConfigGeneral();
        cargarPeriodos();
        ejecutarDiagnostico();
      })
      .catch(function (error) {
        showStatus('#periodosMensaje', 'No se pudo guardar período: ' + obtenerMensajeError(error), 'error');
      })
      .finally(function () {
        setLoading('#btnGuardarPeriodo', false);
      });
  }

  function manejarAccionPeriodo(event) {
    var button = event.target.closest('button[data-action]');
    if (!button) return;

    var action = button.dataset.action;
    var periodoId = button.dataset.id;

    if (action === 'editar') editarPeriodo(periodoId);
    if (action === 'activar') activarPeriodo(periodoId, button);
    if (action === 'cerrar') cerrarPeriodo(periodoId, button);
    if (action === 'eliminar') eliminarPeriodo(periodoId, button);
  }

  function editarPeriodo(periodoId) {
    var periodo = buscarPeriodo(periodoId);
    if (!periodo) {
      showStatus('#periodosMensaje', 'No se encontró el período seleccionado.', 'error');
      return;
    }

    pintarPeriodoForm(periodo);
    showStatus('#periodosMensaje', 'Período cargado para edición.', 'info');
    qs('#periodoIdInput').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function activarPeriodo(periodoId, button) {
    if (!confirm('¿Activar este período? Se actualizará el período activo del proceso.')) return;

    setLoadingElement(button, true, 'Activando...');
    showStatus('#periodosMensaje', 'Activando período...', 'info');

    repository.activarPeriodo(periodoId)
      .then(function () {
        showStatus('#periodosMensaje', 'Período activado correctamente.', 'success');
        cargarConfigGeneral();
        cargarPeriodos();
      })
      .catch(function (error) {
        showStatus('#periodosMensaje', 'No se pudo activar período: ' + obtenerMensajeError(error), 'error');
      })
      .finally(function () {
        setLoadingElement(button, false);
      });
  }

  function cerrarPeriodo(periodoId, button) {
    if (!confirm('¿Cerrar este período? Si es el período activo, el proceso quedará sin período activo.')) return;

    setLoadingElement(button, true, 'Cerrando...');
    showStatus('#periodosMensaje', 'Cerrando período...', 'info');

    repository.cerrarPeriodo(periodoId)
      .then(function () {
        showStatus('#periodosMensaje', 'Período cerrado correctamente.', 'success');
        cargarConfigGeneral();
        cargarPeriodos();
      })
      .catch(function (error) {
        showStatus('#periodosMensaje', 'No se pudo cerrar período: ' + obtenerMensajeError(error), 'error');
      })
      .finally(function () {
        setLoadingElement(button, false);
      });
  }

  function eliminarPeriodo(periodoId, button) {
    if (!confirm('¿Eliminar definitivamente este período? Esta acción no borra estudiantes ni títulos, solo el documento del período.')) return;

    setLoadingElement(button, true, 'Eliminando...');
    showStatus('#periodosMensaje', 'Eliminando período...', 'info');

    repository.eliminarPeriodo(periodoId)
      .then(function () {
        showStatus('#periodosMensaje', 'Período eliminado correctamente.', 'success');
        limpiarPeriodoForm();
        cargarConfigGeneral();
        cargarPeriodos();
        ejecutarDiagnostico();
      })
      .catch(function (error) {
        showStatus('#periodosMensaje', 'No se pudo eliminar período: ' + obtenerMensajeError(error), 'error');
      })
      .finally(function () {
        setLoadingElement(button, false);
      });
  }

  function cargarConfigIA() {
    if (!estado.firebaseListo) {
      showStatus('#iaMensaje', 'Firebase no está conectado.', 'warning');
      return;
    }

    var proveedor = value('#iaProveedorInput') || 'gemini';
    setLoading('#btnCargarIA', true, 'Cargando...');
    showStatus('#iaMensaje', 'Cargando configuración IA/' + proveedor + '...', 'info');

    repository.cargarConfigIA(proveedor)
      .then(function (iaConfig) {
        estado.iaConfig = iaConfig;
        pintarConfigIA(iaConfig);
        showStatus('#iaMensaje', 'Configuración IA cargada. Origen: ' + iaConfig.origen + '.', 'success');
      })
      .catch(function (error) {
        showStatus('#iaMensaje', 'No se pudo cargar IA: ' + obtenerMensajeError(error), 'error');
      })
      .finally(function () {
        setLoading('#btnCargarIA', false);
      });
  }

  function guardarConfigIA(event) {
    event.preventDefault();

    if (!estado.firebaseListo) {
      showStatus('#iaMensaje', 'Firebase no está conectado.', 'warning');
      return;
    }

    var data = leerConfigIA();
    var validacion = validarConfigIA(data);
    if (!validacion.ok) {
      showStatus('#iaMensaje', validacion.mensaje, 'error');
      return;
    }

    setLoading('#btnGuardarIA', true, 'Guardando...');
    showStatus('#iaMensaje', 'Guardando configuración IA...', 'info');

    repository.guardarConfigIA(data.proveedor, data)
      .then(function (iaConfig) {
        estado.iaConfig = iaConfig;
        pintarConfigIA(iaConfig);
        showStatus('#iaMensaje', 'Configuración IA/' + data.proveedor + ' guardada correctamente.', 'success');
        ejecutarDiagnostico();
      })
      .catch(function (error) {
        showStatus('#iaMensaje', 'No se pudo guardar IA: ' + obtenerMensajeError(error), 'error');
      })
      .finally(function () {
        setLoading('#btnGuardarIA', false);
      });
  }

  function ejecutarDiagnostico() {
    if (!estado.firebaseListo) {
      renderDiagnosticoBase('pending', 'Firebase no está conectado.');
      return;
    }

    setLoading('#btnDiagnostico', true, 'Revisando...');

    repository.ejecutarDiagnostico()
      .then(function (items) {
        renderDiagnostico(items);
      })
      .catch(function (error) {
        renderDiagnosticoBase('error', obtenerMensajeError(error));
      })
      .finally(function () {
        setLoading('#btnDiagnostico', false);
      });
  }

  function pintarConfigGeneral(appConfig) {
    setValue('#procesoActivoInput', String(Boolean(appConfig.procesoActivo)));
    setValue('#periodoActivoInput', appConfig.periodoActivo || '');
    setValue('#maxIntentosInput', appConfig.maxIntentos || 2);
    setValue('#propuestasObligatoriasInput', appConfig.propuestasObligatorias || 3);
    setValue('#iaActivaInput', String(Boolean(appConfig.iaActiva)));
    setValue('#proveedorIAInput', appConfig.proveedorIA || 'gemini');
    setValue('#googleSheetsUrlInput', appConfig.googleSheetsUrl || '');
    setValue('#iaProveedorInput', appConfig.proveedorIA || 'gemini');
  }

  function pintarConfigIA(iaConfig) {
    setValue('#iaProveedorInput', iaConfig.id || 'gemini');
    setValue('#iaActivoInput', String(Boolean(iaConfig.activo)));
    setValue('#iaApiKeyInput', iaConfig.apiKey || '');
    setValue('#iaModelInput', iaConfig.model || iaConfig.modelo || '');
    setValue('#iaTemperatureInput', iaConfig.temperature || 0.35);
    setValue('#iaMaxTokensInput', iaConfig.maxOutputTokens || iaConfig.maxTokens || 900);
  }

  function pintarPeriodoForm(periodo) {
    setValue('#periodoIdInput', periodo.id || '');
    setValue('#periodoNombreInput', periodo.nombre || '');
    setValue('#periodoFechaInicioInput', periodo.fechaInicio || '');
    setValue('#periodoFechaFinInput', periodo.fechaFin || '');
    setValue('#periodoEstadoInput', periodo.estado || 'INACTIVO');
    setValue('#periodoObservacionInput', periodo.observacion || '');
  }

  function limpiarPeriodoForm() {
    pintarPeriodoForm({
      id: '',
      nombre: '',
      fechaInicio: '',
      fechaFin: '',
      estado: 'INACTIVO',
      observacion: ''
    });
  }

  function renderPeriodos(periodos) {
    var container = qs('#periodosLista');
    if (!container) return;

    container.innerHTML = '';

    if (!periodos.length) {
      var empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'Todavía no hay períodos creados.';
      container.appendChild(empty);
      return;
    }

    periodos.forEach(function (periodo) {
      container.appendChild(crearPeriodoCard(periodo));
    });
  }

  function crearPeriodoCard(periodo) {
    var card = document.createElement('article');
    card.className = 'period-item';

    var content = document.createElement('div');
    var title = document.createElement('h3');
    title.textContent = periodo.nombre || periodo.id;

    var desc = document.createElement('p');
    desc.className = 'muted';
    desc.textContent = periodo.observacion || 'Sin observación.';

    var meta = document.createElement('div');
    meta.className = 'period-meta';
    meta.appendChild(crearBadge(periodo.id));
    meta.appendChild(crearBadge(periodo.estado, periodo.estado === 'ACTIVO' ? 'is-active' : periodo.estado === 'CERRADO' ? 'is-closed' : ''));
    meta.appendChild(crearBadge('Inicio: ' + (periodo.fechaInicio || '—')));
    meta.appendChild(crearBadge('Fin: ' + (periodo.fechaFin || '—')));

    content.appendChild(title);
    content.appendChild(desc);
    content.appendChild(meta);

    var actions = document.createElement('div');
    actions.className = 'period-actions';
    actions.appendChild(crearBotonPeriodo('Editar', 'editar', periodo.id, 'btn--ghost'));
    actions.appendChild(crearBotonPeriodo('Activar', 'activar', periodo.id, 'btn--secondary'));
    actions.appendChild(crearBotonPeriodo('Cerrar', 'cerrar', periodo.id, 'btn--ghost'));
    actions.appendChild(crearBotonPeriodo('Eliminar', 'eliminar', periodo.id, 'btn--danger'));

    card.appendChild(content);
    card.appendChild(actions);
    return card;
  }

  function crearBadge(text, extraClass) {
    var badge = document.createElement('span');
    badge.className = 'period-badge' + (extraClass ? ' ' + extraClass : '');
    badge.textContent = text || '—';
    return badge;
  }

  function crearBotonPeriodo(text, action, id, className) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn ' + (className || 'btn--secondary');
    button.textContent = text;
    button.dataset.action = action;
    button.dataset.id = id;
    return button;
  }

  function buscarPeriodo(periodoId) {
    return estado.periodos.filter(function (periodo) {
      return periodo.id === periodoId;
    })[0] || null;
  }

  function leerConfigGeneral() {
    return {
      procesoActivo: value('#procesoActivoInput'),
      periodoActivo: value('#periodoActivoInput'),
      maxIntentos: value('#maxIntentosInput'),
      propuestasObligatorias: value('#propuestasObligatoriasInput'),
      iaActiva: value('#iaActivaInput'),
      proveedorIA: value('#proveedorIAInput'),
      googleSheetsUrl: value('#googleSheetsUrlInput')
    };
  }

  function leerPeriodoForm() {
    return {
      id: normalizarPeriodoId(value('#periodoIdInput')),
      nombre: value('#periodoNombreInput'),
      fechaInicio: value('#periodoFechaInicioInput'),
      fechaFin: value('#periodoFechaFinInput'),
      estado: value('#periodoEstadoInput') || 'INACTIVO',
      activo: value('#periodoEstadoInput') === 'ACTIVO',
      observacion: value('#periodoObservacionInput')
    };
  }

  function leerConfigIA() {
    return {
      proveedor: value('#iaProveedorInput'),
      activo: value('#iaActivoInput'),
      apiKey: value('#iaApiKeyInput'),
      model: value('#iaModelInput'),
      temperature: value('#iaTemperatureInput'),
      maxOutputTokens: value('#iaMaxTokensInput')
    };
  }

  function validarConfigGeneral(data) {
    if (!data.periodoActivo) return { ok: false, mensaje: 'Ingresa el período activo.' };
    if (Number(data.maxIntentos) < 1) return { ok: false, mensaje: 'El máximo de intentos debe ser al menos 1.' };
    if (Number(data.propuestasObligatorias) < 1) return { ok: false, mensaje: 'Las propuestas obligatorias deben ser al menos 1.' };
    return { ok: true, mensaje: '' };
  }

  function validarPeriodo(data) {
    if (!data.id) return { ok: false, mensaje: 'Ingresa el ID del período.' };
    if (data.id.indexOf('/') !== -1) return { ok: false, mensaje: 'El ID del período no puede contener /.' };
    if (!data.nombre) return { ok: false, mensaje: 'Ingresa el nombre visible del período.' };
    if (data.fechaInicio && data.fechaFin && data.fechaInicio > data.fechaFin) return { ok: false, mensaje: 'La fecha de inicio no puede ser posterior a la fecha fin.' };
    return { ok: true, mensaje: '' };
  }

  function validarConfigIA(data) {
    if (!data.proveedor) return { ok: false, mensaje: 'Selecciona un proveedor IA.' };
    if (data.activo === 'true' && !data.apiKey) return { ok: false, mensaje: 'Si el proveedor IA está activo, debes ingresar la API Key.' };
    if (data.activo === 'true' && !data.model) return { ok: false, mensaje: 'Si el proveedor IA está activo, debes ingresar el modelo.' };
    return { ok: true, mensaje: '' };
  }

  function normalizarPeriodoId(periodoId) {
    return String(periodoId || '')
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[^A-Za-z0-9_\-.]/g, '');
  }

  function renderDiagnosticoBase(estadoDiagnostico, detalle) {
    var items = [
      { titulo: 'HTML independiente', descripcion: 'Pantalla administrativa creada.', estado: 'ok' },
      { titulo: 'CSS propio', descripcion: 'El módulo usa estilos propios.', estado: 'ok' },
      { titulo: 'JS propio', descripcion: 'El módulo tiene configuración y controlador independientes.', estado: 'ok' },
      { titulo: 'Firebase', descripcion: detalle || 'Pendiente de conexión.', estado: estadoDiagnostico || 'pending' },
      { titulo: 'Períodos', descripcion: 'Pendiente de lectura desde Firestore.', estado: 'pending' },
      { titulo: 'IA', descripcion: 'Pendiente de lectura desde Firestore.', estado: 'pending' }
    ];
    renderDiagnostico(items);
  }

  function renderDiagnostico(items) {
    var container = qs('#diagnosticoModulo');
    if (!container) return;

    container.innerHTML = '';
    items.forEach(function (item) {
      var card = document.createElement('div');
      card.className = 'diagnostic-item ' + claseDiagnostico(item.estado);

      var title = document.createElement('strong');
      title.textContent = item.titulo;

      var description = document.createElement('p');
      description.textContent = item.descripcion;

      card.appendChild(title);
      card.appendChild(description);
      container.appendChild(card);
    });
  }

  function claseDiagnostico(estadoItem) {
    if (estadoItem === 'ok') return 'is-ok';
    if (estadoItem === 'error') return 'is-error';
    return 'is-pending';
  }

  function bloquearPanel(disabled) {
    ['#formConfigGeneral', '#formPeriodo', '#formIA'].forEach(function (selector) {
      var form = qs(selector);
      if (!form) return;
      Array.prototype.slice.call(form.querySelectorAll('input, select, textarea, button')).forEach(function (element) {
        element.disabled = Boolean(disabled);
      });
    });

    ['#btnCargarConfig', '#btnCargarPeriodos', '#btnCargarIA', '#btnDiagnostico'].forEach(function (selector) {
      var button = qs(selector);
      if (button) button.disabled = Boolean(disabled);
    });
  }

  function actualizarModoEjecucion() {
    setText('#modoEjecucionTexto', detectarModoEjecucion());
  }

  function detectarModoEjecucion() {
    if (window.location.protocol === 'file:') return 'Doble click';
    if (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost') return 'Live Server';
    if (window.navigator && /Electron/i.test(window.navigator.userAgent)) return 'Electron';
    return 'Web';
  }

  function qs(selector) {
    return document.querySelector(selector);
  }

  function value(selector) {
    var element = qs(selector);
    return element ? String(element.value || '').trim() : '';
  }

  function setValue(selector, valueToSet) {
    var element = qs(selector);
    if (element) element.value = valueToSet == null ? '' : String(valueToSet);
  }

  function setText(selector, text) {
    var element = qs(selector);
    if (element) element.textContent = text || '—';
  }

  function showStatus(selector, message, type) {
    var element = qs(selector);
    if (!element) return;
    element.classList.remove('is-info', 'is-success', 'is-warning', 'is-error');
    if (type) element.classList.add('is-' + type);
    element.textContent = message || '';
  }

  function setLoading(selector, loading, text) {
    var button = qs(selector);
    setLoadingElement(button, loading, text);
  }

  function setLoadingElement(button, loading, text) {
    if (!button) return;

    if (loading) {
      if (!button.dataset.originalText) button.dataset.originalText = button.textContent;
      button.textContent = text || 'Cargando...';
      button.disabled = true;
      return;
    }

    button.disabled = false;
    if (button.dataset.originalText) {
      button.textContent = button.dataset.originalText;
      delete button.dataset.originalText;
    }
  }

  function obtenerMensajeError(error) {
    return error && error.message ? error.message : String(error || 'Error desconocido');
  }
})();
