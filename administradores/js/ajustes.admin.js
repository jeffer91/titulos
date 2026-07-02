/* Pantalla Ajustes del administrador: proveedores de generación de sugerencias. */
(function () {
  'use strict';

  var config = window.TA_ADMINISTRADORES_CONFIG;
  var ui = window.TAAdminUI;
  var repository = window.TAAdministradorRepository;
  var firebaseService = window.TAFirebaseService || window.TAAdminFirebaseService;

  var estado = {
    cargado: false,
    proveedores: {}
  };

  function iniciar() {
    conectarEventos();
  }

  function conectarEventos() {
    var btnCargar = ui.qs('#btnCargarAjustes');

    if (btnCargar) {
      btnCargar.addEventListener('click', cargar);
    }

    ui.qsa('[data-save-provider]').forEach(function (button) {
      button.addEventListener('click', function () {
        guardarProveedor(button.getAttribute('data-save-provider'), button);
      });
    });

    ui.qsa('[data-test-provider]').forEach(function (button) {
      button.addEventListener('click', function () {
        probarProveedor(button.getAttribute('data-test-provider'), button);
      });
    });
  }

  function cargar() {
    ui.showStatus('#ajustesMensaje', 'Cargando ajustes...', 'info');

    return Promise.all([
      cargarAppConfig(),
      cargarProveedores()
    ]).then(function () {
      estado.cargado = true;
      ui.showStatus('#ajustesMensaje', 'Ajustes cargados correctamente.', 'success');
    }).catch(function (error) {
      ui.showStatus('#ajustesMensaje', obtenerMensaje(error, 'No se pudieron cargar los ajustes.'), 'error');
    });
  }

  function cargarAppConfig() {
    return repository.cargarAppConfig().then(function (appConfig) {
      estado.appConfig = appConfig || {};
      return estado.appConfig;
    });
  }

  function cargarProveedores() {
    var proveedores = config.proveedoresSugerencias || [];

    return Promise.all(proveedores.map(function (proveedor) {
      return leerProveedor(proveedor.id).then(function (data) {
        var finalData = Object.assign({
          id: proveedor.id,
          nombre: proveedor.nombre,
          activo: false,
          apiKey: '',
          key: '',
          modelo: proveedor.modeloDefault || '',
          model: proveedor.modeloDefault || '',
          endpoint: proveedor.endpointDefault || ''
        }, data || {});

        if (!finalData.modelo && finalData.model) finalData.modelo = finalData.model;
        if (!finalData.model && finalData.modelo) finalData.model = finalData.modelo;
        if (!finalData.endpoint && proveedor.endpointDefault) finalData.endpoint = proveedor.endpointDefault;

        estado.proveedores[proveedor.id] = finalData;
        ui.llenarProviderForm(proveedor.id, finalData);

        return finalData;
      });
    }));
  }

  function leerProveedor(providerId) {
    if (!firebaseService || !firebaseService.leerDocumento) {
      return Promise.reject(new Error('No se pudo leer la configuración del proveedor.'));
    }

    return firebaseService.leerDocumento(config.collections.ia, providerId).then(function (data) {
      return data || null;
    });
  }

  function guardarProveedor(providerId, button) {
    var proveedorBase = buscarProveedorBase(providerId);
    var form = ui.obtenerProviderForm(providerId);
    var validacion = validarFormularioProveedor(form, proveedorBase);

    if (!validacion.ok) {
      ui.showStatus('#ajustesMensaje', validacion.mensaje, 'error');
      return;
    }

    var payload = construirPayloadProveedor(form, proveedorBase);

    ui.setLoading(button, true, 'Guardando...');
    ui.showStatus('#ajustesMensaje', 'Guardando configuración...', 'info');

    guardarDocumentoProveedor(providerId, payload)
      .then(function () {
        estado.proveedores[providerId] = payload;
        return actualizarConfiguracionGeneral(providerId);
      })
      .then(function () {
        ui.showStatus('#ajustesMensaje', 'Proveedor guardado correctamente.', 'success');
      })
      .catch(function (error) {
        ui.showStatus('#ajustesMensaje', obtenerMensaje(error, 'No se pudo guardar el proveedor.'), 'error');
      })
      .finally(function () {
        ui.setLoading(button, false);
      });
  }

  function construirPayloadProveedor(form, proveedorBase) {
    var ahora = new Date().toISOString();
    var modelo = limpiarTexto(form.modelo || proveedorBase.modeloDefault || '');
    var endpoint = limpiarTexto(form.endpoint || proveedorBase.endpointDefault || '');
    var key = limpiarTexto(form.apiKey);

    return {
      id: form.id,
      proveedor: form.id,
      nombre: proveedorBase.nombre,
      activo: Boolean(form.activo),
      apiKey: key,
      key: key,
      modelo: modelo,
      model: modelo,
      endpoint: endpoint,
      actualizadoEn: ahora,
      updatedAt: ahora,
      origen: 'admin-local'
    };
  }

  function guardarDocumentoProveedor(providerId, payload) {
    if (!firebaseService || !firebaseService.guardarDocumento) {
      return Promise.reject(new Error('No se pudo guardar la configuración del proveedor.'));
    }

    return firebaseService.guardarDocumento(config.collections.ia, providerId, payload, true);
  }

  function actualizarConfiguracionGeneral(providerIdGuardado) {
    var proveedorActivo = obtenerPrimerProveedorActivo() || providerIdGuardado;
    var proveedorGuardado = estado.proveedores[proveedorActivo] || {};
    var iaActiva = Boolean(proveedorActivo && proveedorGuardado.activo);

    return repository.guardarAppConfig({
      iaActiva: iaActiva,
      proveedorIA: proveedorActivo || '',
      proveedorIALabel: proveedorActivo ? obtenerNombreProveedor(proveedorActivo) : '',
      iaActualizadoEn: new Date().toISOString()
    });
  }

  function obtenerPrimerProveedorActivo() {
    var proveedores = config.proveedoresSugerencias || [];

    for (var i = 0; i < proveedores.length; i += 1) {
      var id = proveedores[i].id;
      var formActivo = ui.checked('#' + id + 'Activo');

      if (formActivo) return id;
    }

    return '';
  }

  function validarFormularioProveedor(form, proveedorBase) {
    if (!form || !form.id) {
      return {
        ok: false,
        mensaje: 'No se pudo identificar el proveedor.'
      };
    }

    if (!proveedorBase) {
      return {
        ok: false,
        mensaje: 'Proveedor no reconocido.'
      };
    }

    if (form.activo && !limpiarTexto(form.apiKey)) {
      return {
        ok: false,
        mensaje: 'Ingresa la clave del proveedor antes de activarlo.'
      };
    }

    if (form.activo && !limpiarTexto(form.modelo || proveedorBase.modeloDefault)) {
      return {
        ok: false,
        mensaje: 'Ingresa el modelo del proveedor antes de activarlo.'
      };
    }

    return {
      ok: true,
      mensaje: ''
    };
  }

  function probarProveedor(providerId, button) {
    var proveedorBase = buscarProveedorBase(providerId);
    var form = ui.obtenerProviderForm(providerId);
    var validacion = validarFormularioPrueba(form, proveedorBase);

    if (!validacion.ok) {
      ui.showStatus('#ajustesMensaje', validacion.mensaje, 'error');
      return;
    }

    ui.setLoading(button, true, 'Probando...');
    ui.showStatus('#ajustesMensaje', 'Probando conexión con ' + proveedorBase.nombre + '...', 'info');

    ejecutarPruebaProveedor(providerId, form, proveedorBase)
      .then(function () {
        ui.showStatus('#ajustesMensaje', proveedorBase.nombre + ' respondió correctamente.', 'success');
      })
      .catch(function (error) {
        ui.showStatus('#ajustesMensaje', obtenerMensaje(error, 'No se pudo probar el proveedor.'), 'error');
      })
      .finally(function () {
        ui.setLoading(button, false);
      });
  }

  function validarFormularioPrueba(form, proveedorBase) {
    if (!proveedorBase) {
      return {
        ok: false,
        mensaje: 'Proveedor no reconocido.'
      };
    }

    if (!limpiarTexto(form.apiKey)) {
      return {
        ok: false,
        mensaje: 'Ingresa la clave antes de probar la conexión.'
      };
    }

    if (!limpiarTexto(form.modelo || proveedorBase.modeloDefault)) {
      return {
        ok: false,
        mensaje: 'Ingresa el modelo antes de probar la conexión.'
      };
    }

    return {
      ok: true,
      mensaje: ''
    };
  }

  function ejecutarPruebaProveedor(providerId, form, proveedorBase) {
    if (providerId === 'gemini') {
      return probarGemini(form, proveedorBase);
    }

    if (providerId === 'groq') {
      return probarOpenAICompatible(form, proveedorBase, 'https://api.groq.com/openai/v1/chat/completions');
    }

    if (providerId === 'openrouter') {
      return probarOpenAICompatible(
        form,
        proveedorBase,
        form.endpoint || proveedorBase.endpointDefault || 'https://openrouter.ai/api/v1/chat/completions',
        {
          'HTTP-Referer': window.location.origin || 'http://localhost',
          'X-Title': 'Sistema de títulos académicos'
        }
      );
    }

    if (providerId === 'cloudflare') {
      return probarCloudflare(form, proveedorBase);
    }

    return Promise.reject(new Error('Proveedor no implementado para prueba.'));
  }

  function probarGemini(form, proveedorBase) {
    var model = encodeURIComponent(form.modelo || proveedorBase.modeloDefault);
    var key = encodeURIComponent(form.apiKey);
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + key;

    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: 'Responde únicamente con la palabra OK.'
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 10
        }
      })
    }).then(validarRespuestaFetch);
  }

  function probarOpenAICompatible(form, proveedorBase, endpoint, extraHeaders) {
    var headers = Object.assign({
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + form.apiKey
    }, extraHeaders || {});

    return fetch(endpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        model: form.modelo || proveedorBase.modeloDefault,
        messages: [
          {
            role: 'user',
            content: 'Responde únicamente con la palabra OK.'
          }
        ],
        temperature: 0.1,
        max_tokens: 10
      })
    }).then(validarRespuestaFetch);
  }

  function probarCloudflare(form, proveedorBase) {
    var endpoint = limpiarTexto(form.endpoint || proveedorBase.endpointDefault || '');
    var model = limpiarTexto(form.modelo || proveedorBase.modeloDefault || '');

    if (!endpoint) {
      return Promise.reject(new Error('En Cloudflare debes ingresar el Account ID o endpoint.'));
    }

    var url = endpoint.indexOf('http') === 0
      ? endpoint
      : 'https://api.cloudflare.com/client/v4/accounts/' + encodeURIComponent(endpoint) + '/ai/run/' + encodeURIComponent(model);

    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + form.apiKey
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'user',
            content: 'Responde únicamente con la palabra OK.'
          }
        ]
      })
    }).then(validarRespuestaFetch);
  }

  function validarRespuestaFetch(response) {
    if (!response) {
      throw new Error('No hubo respuesta del proveedor.');
    }

    if (!response.ok) {
      return response.text().then(function (text) {
        throw new Error('El proveedor respondió con error ' + response.status + '. ' + resumirTexto(text));
      });
    }

    return response.json().catch(function () {
      return {};
    });
  }

  function buscarProveedorBase(providerId) {
    var proveedores = config.proveedoresSugerencias || [];

    for (var i = 0; i < proveedores.length; i += 1) {
      if (proveedores[i].id === providerId) return proveedores[i];
    }

    return null;
  }

  function obtenerNombreProveedor(providerId) {
    var proveedor = buscarProveedorBase(providerId);
    return proveedor ? proveedor.nombre : providerId;
  }

  function resumirTexto(text) {
    var value = limpiarTexto(text);

    if (!value) return '';

    if (value.length > 180) {
      return value.slice(0, 180) + '...';
    }

    return value;
  }

  function limpiarTexto(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function obtenerMensaje(error, fallback) {
    return error && error.message ? error.message : fallback;
  }

  window.TAAdminAjustes = Object.freeze({
    iniciar: iniciar,
    cargar: cargar,
    guardarProveedor: guardarProveedor,
    probarProveedor: probarProveedor
  });
})();