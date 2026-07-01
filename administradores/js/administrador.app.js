/* Controlador base del módulo administradores. */
(function () {
  'use strict';

  var config = window.TA_ADMINISTRADORES_CONFIG;
  var firebaseService = window.TAAdminFirebaseService;
  var repository = window.TAAdminRepository;

  var estado = {
    firebaseListo: false,
    appConfig: null,
    iaConfig: null
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
    var formIA = qs('#formIA');
    var btnCargarConfig = qs('#btnCargarConfig');
    var btnCargarIA = qs('#btnCargarIA');
    var btnDiagnostico = qs('#btnDiagnostico');
    var proveedorIA = qs('#iaProveedorInput');

    if (formConfig) formConfig.addEventListener('submit', guardarConfigGeneral);
    if (formIA) formIA.addEventListener('submit', guardarConfigIA);
    if (btnCargarConfig) btnCargarConfig.addEventListener('click', cargarConfigGeneral);
    if (btnCargarIA) btnCargarIA.addEventListener('click', cargarConfigIA);
    if (btnDiagnostico) btnDiagnostico.addEventListener('click', ejecutarDiagnostico);
    if (proveedorIA) proveedorIA.addEventListener('change', cargarConfigIA);
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

  function validarConfigIA(data) {
    if (!data.proveedor) return { ok: false, mensaje: 'Selecciona un proveedor IA.' };
    if (data.activo === 'true' && !data.apiKey) return { ok: false, mensaje: 'Si el proveedor IA está activo, debes ingresar la API Key.' };
    if (data.activo === 'true' && !data.model) return { ok: false, mensaje: 'Si el proveedor IA está activo, debes ingresar el modelo.' };
    return { ok: true, mensaje: '' };
  }

  function renderDiagnosticoBase(estadoDiagnostico, detalle) {
    var items = [
      { titulo: 'HTML independiente', descripcion: 'Pantalla administrativa creada.', estado: 'ok' },
      { titulo: 'CSS propio', descripcion: 'El módulo usa estilos propios.', estado: 'ok' },
      { titulo: 'JS propio', descripcion: 'El módulo tiene configuración y controlador independientes.', estado: 'ok' },
      { titulo: 'Firebase', descripcion: detalle || 'Pendiente de conexión.', estado: estadoDiagnostico || 'pending' },
      { titulo: 'Configuración', descripcion: 'Pendiente de lectura desde Firestore.', estado: 'pending' },
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
    ['#formConfigGeneral', '#formIA'].forEach(function (selector) {
      var form = qs(selector);
      if (!form) return;
      Array.prototype.slice.call(form.querySelectorAll('input, select, button')).forEach(function (element) {
        element.disabled = Boolean(disabled);
      });
    });

    ['#btnCargarConfig', '#btnCargarIA', '#btnDiagnostico'].forEach(function (selector) {
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
