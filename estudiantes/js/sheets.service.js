/* Servicio de respaldo Google Sheets para el módulo estudiantes. */
(function () {
  'use strict';

  var config = window.TA_ESTUDIANTES_CONFIG;

  function respaldarEnvio(envio, appConfig) {
    appConfig = Object.assign({}, config.defaultAppConfig || {}, appConfig || {});

    if (!envio) {
      return Promise.resolve({
        ok: false,
        omitido: true,
        mensaje: 'No hay datos de envío para respaldar.'
      });
    }

    if (appConfig.sheetsActivo !== true) {
      return Promise.resolve({
        ok: false,
        omitido: true,
        mensaje: 'El respaldo en Google Sheets no está activo.'
      });
    }

    if (!limpiarTexto(appConfig.sheetsWebAppUrl)) {
      return Promise.resolve({
        ok: false,
        omitido: true,
        mensaje: 'No existe URL de respaldo configurada.'
      });
    }

    var payload = construirPayloadEnvio(envio, appConfig);

    return enviarAppsScript(appConfig.sheetsWebAppUrl, payload)
      .then(function (respuesta) {
        if (!respuesta || respuesta.ok !== true) {
          return {
            ok: false,
            mensaje: respuesta && respuesta.error ? respuesta.error : 'Apps Script no confirmó el respaldo.',
            idRegistro: payload.idRegistro,
            respuesta: respuesta || null
          };
        }

        return {
          ok: true,
          mensaje: respuesta.mensaje || 'Envío respaldado correctamente.',
          idRegistro: respuesta.idRegistro || payload.idRegistro,
          respuesta: respuesta
        };
      })
      .catch(function (error) {
        return {
          ok: false,
          mensaje: obtenerMensajeError(error),
          idRegistro: payload.idRegistro,
          error: error
        };
      });
  }

  function construirPayloadEnvio(envio, appConfig) {
    var propuestas = Array.isArray(envio.titulosEnviados) ? envio.titulosEnviados : [];
    var p1 = propuestas[0] || {};
    var p2 = propuestas[1] || {};
    var p3 = propuestas[2] || {};
    var idRegistro = limpiarTexto(envio.id || envio._docId || envio.idRegistro);

    if (!idRegistro) {
      idRegistro = [
        limpiarTexto(envio.periodoId || 'SIN_PERIODO'),
        limpiarTexto(envio.cedula || envio.numeroIdentificacion || 'SIN_CEDULA')
      ].join('__');
    }

    return {
      token: appConfig.sheetsToken || '',
      tipo: 'ENVIO',
      origen: appConfig.sheetsOrigen || 'titulos-app',
      fechaCliente: new Date().toISOString(),
      idRegistro: idRegistro,
      datos: {
        fechaEnvio: envio.fechaEnvio || envio.enviadoEn || envio.creadoEn || envio.actualizadoEn || new Date().toISOString(),
        cedula: envio.cedula || envio.numeroIdentificacion || '',
        estudiante: envio.estudiante || envio.nombres || envio.nombreEstudiante || '',
        carrera: envio.carrera || envio.nombreCarrera || '',
        periodo: envio.periodoLabel || envio.periodo || envio.periodoId || '',
        telegram: envio.telegramUser || envio.telegram || envio.contacto && envio.contacto.telegram || '',
        titulo1: p1.tituloFinal || p1.titulo || '',
        titulo2: p2.tituloFinal || p2.titulo || '',
        titulo3: p3.tituloFinal || p3.titulo || '',
        preferido: envio.tituloPreferidoNumero || envio.preferido || '',
        estadoFirebase: envio.estado || 'ENVIADO',
        estadoGoogleSheets: 'RESPALDADO',
        observacion: '',
        idRegistro: idRegistro,
        prueba: false
      }
    };
  }

  function enviarAppsScript(url, body) {
    var controller = null;
    var timeoutId = null;

    if (typeof AbortController !== 'undefined') {
      controller = new AbortController();
      timeoutId = window.setTimeout(function () {
        controller.abort();
      }, 18000);
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
          throw new Error('Google Sheets no respondió.');
        }

        return response.text().then(function (text) {
          var data = null;

          try {
            data = text ? JSON.parse(text) : {};
          } catch (error) {
            throw new Error('Google Sheets respondió, pero no devolvió JSON válido.');
          }

          if (!response.ok) {
            throw new Error(data.error || 'Google Sheets respondió con error ' + response.status + '.');
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

  function obtenerMensajeError(error) {
    if (!error) return 'No se pudo respaldar en Google Sheets.';

    if (error.name === 'AbortError') {
      return 'El respaldo tardó demasiado. Revisa la conexión o la URL de Apps Script.';
    }

    return error.message || String(error) || 'No se pudo respaldar en Google Sheets.';
  }

  window.TAEstudianteSheets = Object.freeze({
    respaldarEnvio: respaldarEnvio
  });
})();