/* Pantalla Respaldo del administrador: Google Sheets como base paralela. */
(function () {
  'use strict';

  var config = window.TA_ADMINISTRADORES_CONFIG;
  var ui = window.TAAdminUI;
  var repository = window.TAAdministradorRepository;

  var estado = {
    appConfig: null,
    cargado: false
  };

  function iniciar() {
    conectarEventos();
  }

  function conectarEventos() {
    var btnCargar = ui.qs('#btnCargarRespaldo');
    var form = ui.qs('#formRespaldo');
    var btnProbar = ui.qs('#btnProbarRespaldo');

    if (btnCargar) {
      btnCargar.addEventListener('click', cargar);
    }

    if (form) {
      form.addEventListener('submit', function (event) {
        event.preventDefault();
        guardar();
      });
    }

    if (btnProbar) {
      btnProbar.addEventListener('click', probarConexion);
    }
  }

  function cargar() {
    ui.showStatus('#respaldoMensaje', 'Cargando configuración de respaldo...', 'info');

    return repository.cargarAppConfig()
      .then(function (appConfig) {
        estado.appConfig = Object.assign({}, config.defaultAppConfig, appConfig || {});
        estado.cargado = true;

        llenarFormulario(estado.appConfig);
        renderEstado(estado.appConfig);

        ui.showStatus('#respaldoMensaje', 'Configuración de respaldo cargada correctamente.', 'success');
      })
      .catch(function (error) {
        ui.showStatus('#respaldoMensaje', obtenerMensaje(error, 'No se pudo cargar la configuración de respaldo.'), 'error');
      });
  }

  function llenarFormulario(appConfig) {
    ui.setChecked('#sheetsActivo', appConfig.sheetsActivo === true);
    ui.setValue('#sheetsWebAppUrl', appConfig.sheetsWebAppUrl || '');
    ui.setValue('#sheetsToken', appConfig.sheetsToken || '');
    ui.setValue('#sheetsOrigen', appConfig.sheetsOrigen || 'titulos-app');
    ui.setValue('#sheetsNotas', appConfig.sheetsNotas || '');
  }

  function renderEstado(appConfig) {
    var activo = appConfig.sheetsActivo === true;
    var tieneUrl = Boolean(String(appConfig.sheetsWebAppUrl || '').trim());

    if (activo && tieneUrl) {
      ui.setText('#respaldoEstadoTexto', 'Activo');
    } else if (tieneUrl) {
      ui.setText('#respaldoEstadoTexto', 'Configurado, pero desactivado');
    } else {
      ui.setText('#respaldoEstadoTexto', 'Sin configurar');
    }

    ui.setText('#respaldoUltimaPrueba', appConfig.sheetsUltimaPrueba || '—');
    ui.setText('#respaldoUltimoResultado', appConfig.sheetsUltimoResultado || '—');
  }

  function leerFormulario() {
    return {
      sheetsActivo: ui.checked('#sheetsActivo'),
      sheetsWebAppUrl: limpiarTexto(ui.value('#sheetsWebAppUrl')),
      sheetsToken: limpiarTexto(ui.value('#sheetsToken')),
      sheetsOrigen: limpiarTexto(ui.value('#sheetsOrigen')) || 'titulos-app',
      sheetsNotas: limpiarTexto(ui.value('#sheetsNotas')),
      sheetsActualizadoEn: new Date().toISOString()
    };
  }

  function guardar() {
    var button = ui.qs('#btnGuardarRespaldo');
    var payload = leerFormulario();
    var validacion = validarConfiguracion(payload);

    if (!validacion.ok) {
      ui.showStatus('#respaldoMensaje', validacion.mensaje, 'error');
      return;
    }

    ui.setLoading(button, true, 'Guardando...');
    ui.showStatus('#respaldoMensaje', 'Guardando configuración de respaldo...', 'info');

    repository.guardarAppConfig(payload)
      .then(function () {
        estado.appConfig = Object.assign({}, estado.appConfig || {}, payload);
        renderEstado(estado.appConfig);
        ui.showStatus('#respaldoMensaje', 'Configuración de respaldo guardada correctamente.', 'success');
      })
      .catch(function (error) {
        ui.showStatus('#respaldoMensaje', obtenerMensaje(error, 'No se pudo guardar la configuración de respaldo.'), 'error');
      })
      .finally(function () {
        ui.setLoading(button, false);
      });
  }

  function validarConfiguracion(payload) {
    if (payload.sheetsActivo && !payload.sheetsWebAppUrl) {
      return {
        ok: false,
        mensaje: 'Para activar el respaldo debes ingresar la URL del Web App de Apps Script.'
      };
    }

    if (payload.sheetsWebAppUrl && payload.sheetsWebAppUrl.indexOf('script.google.com') === -1) {
      return {
        ok: false,
        mensaje: 'La URL del respaldo debe ser una URL válida de Apps Script.'
      };
    }

    if (payload.sheetsWebAppUrl && payload.sheetsWebAppUrl.indexOf('/exec') === -1) {
      return {
        ok: false,
        mensaje: 'La URL debe ser la URL publicada del Web App y normalmente termina en /exec.'
      };
    }

    return {
      ok: true,
      mensaje: ''
    };
  }

  function probarConexion() {
    var button = ui.qs('#btnProbarRespaldo');
    var payload = leerFormulario();
    var validacion = validarPrueba(payload);

    if (!validacion.ok) {
      ui.showStatus('#respaldoMensaje', validacion.mensaje, 'error');
      return;
    }

    ui.setLoading(button, true, 'Probando...');
    ui.showStatus('#respaldoMensaje', 'Probando conexión con Google Sheets...', 'info');

    enviarPing(payload)
      .then(function (respuesta) {
        if (!respuesta || respuesta.ok !== true) {
          throw new Error(respuesta && respuesta.error ? respuesta.error : 'Apps Script no confirmó la conexión.');
        }

        var fecha = new Date().toISOString();
        var resultado = 'Conexión correcta: ' + (respuesta.mensaje || 'PING guardado');

        return repository.guardarAppConfig({
          sheetsActivo: payload.sheetsActivo,
          sheetsWebAppUrl: payload.sheetsWebAppUrl,
          sheetsToken: payload.sheetsToken,
          sheetsOrigen: payload.sheetsOrigen,
          sheetsNotas: payload.sheetsNotas,
          sheetsUltimaPrueba: fecha,
          sheetsUltimoResultado: resultado,
          sheetsActualizadoEn: fecha
        }).then(function () {
          estado.appConfig = Object.assign({}, estado.appConfig || {}, payload, {
            sheetsUltimaPrueba: fecha,
            sheetsUltimoResultado: resultado
          });

          renderEstado(estado.appConfig);
          ui.showStatus('#respaldoMensaje', 'Conexión con Google Sheets correcta.', 'success');
        });
      })
      .catch(function (error) {
        var fechaError = new Date().toISOString();
        var mensaje = obtenerMensaje(error, 'No se pudo conectar con Google Sheets.');

        repository.guardarAppConfig({
          sheetsWebAppUrl: payload.sheetsWebAppUrl,
          sheetsToken: payload.sheetsToken,
          sheetsOrigen: payload.sheetsOrigen,
          sheetsUltimaPrueba: fechaError,
          sheetsUltimoResultado: 'Error: ' + mensaje,
          sheetsActualizadoEn: fechaError
        }).catch(function () {
          return null;
        });

        ui.showStatus('#respaldoMensaje', mensaje, 'error');
      })
      .finally(function () {
        ui.setLoading(button, false);
      });
  }

  function validarPrueba(payload) {
    if (!payload.sheetsWebAppUrl) {
      return {
        ok: false,
        mensaje: 'Ingresa la URL del Web App de Apps Script antes de probar.'
      };
    }

    if (payload.sheetsWebAppUrl.indexOf('script.google.com') === -1) {
      return {
        ok: false,
        mensaje: 'La URL no parece ser de Apps Script.'
      };
    }

    return {
      ok: true,
      mensaje: ''
    };
  }

  function enviarPing(payload) {
    var idRegistro = 'admin_ping_' + Date.now();

    return enviarAppsScript(payload.sheetsWebAppUrl, {
      token: payload.sheetsToken,
      tipo: config.respaldo.tipos.ping,
      origen: payload.sheetsOrigen || 'titulos-app',
      fechaCliente: new Date().toISOString(),
      idRegistro: idRegistro,
      datos: {
        mensaje: 'Prueba de conexión desde Administrador',
        prueba: true,
        fecha: new Date().toISOString()
      }
    });
  }

  function enviarAppsScript(url, body) {
    var controller = null;
    var timeoutId = null;

    if (typeof AbortController !== 'undefined') {
      controller = new AbortController();
      timeoutId = window.setTimeout(function () {
        controller.abort();
      }, config.respaldo.timeoutMs || 18000);
    }

    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(body),
      redirect: 'follow',
      signal: controller ? controller.signal : undefined
    })
      .then(function (response) {
        if (!response) {
          throw new Error('Apps Script no respondió.');
        }

        return response.text().then(function (text) {
          var data = null;

          try {
            data = text ? JSON.parse(text) : {};
          } catch (error) {
            throw new Error('Apps Script respondió, pero no devolvió JSON válido.');
          }

          if (!response.ok) {
            throw new Error(data.error || 'Apps Script respondió con error ' + response.status + '.');
          }

          return data;
        });
      })
      .finally(function () {
        if (timeoutId) {
          window.clearTimeout(timeoutId);
        }
      });
  }

  function limpiarTexto(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function obtenerMensaje(error, fallback) {
    if (!error) return fallback;

    if (error.name === 'AbortError') {
      return 'La prueba tardó demasiado. Revisa la URL del Apps Script o la conexión.';
    }

    return error.message || String(error) || fallback;
  }

  window.TAAdminRespaldo = Object.freeze({
    iniciar: iniciar,
    cargar: cargar,
    guardar: guardar,
    probarConexion: probarConexion
  });
})();