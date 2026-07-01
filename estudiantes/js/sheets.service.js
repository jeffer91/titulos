/* Servicio de respaldo Google Sheets para el módulo estudiantes. */
(function () {
  'use strict';

  function respaldarEnvio(payload, appConfig) {
    var url = obtenerUrlSheets(appConfig);

    if (!url) {
      return Promise.resolve({
        ok: false,
        pendiente: true,
        omitido: true,
        mensaje: 'No hay URL de Google Sheets configurada en titulos_config/app.googleSheetsUrl.'
      });
    }

    var body = construirBody(payload);

    return fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(body)
    }).then(function () {
      return {
        ok: true,
        pendiente: false,
        omitido: false,
        mensaje: 'Respaldo enviado a Google Sheets.',
        enviadoEnLocal: new Date().toISOString()
      };
    }).catch(function (error) {
      return {
        ok: false,
        pendiente: true,
        omitido: false,
        mensaje: 'No se pudo respaldar en Google Sheets: ' + obtenerMensajeError(error),
        error: obtenerMensajeError(error),
        enviadoEnLocal: new Date().toISOString()
      };
    });
  }

  function obtenerUrlSheets(appConfig) {
    return String(
      appConfig && (
        appConfig.googleSheetsUrl ||
        appConfig.sheetsUrl ||
        appConfig.appsScriptUrl ||
        appConfig.googleAppsScriptUrl ||
        ''
      ) || ''
    ).trim();
  }

  function construirBody(payload) {
    return {
      tipo: 'TITULOS_ESTUDIANTE',
      version: '1.0',
      generadoEnLocal: new Date().toISOString(),
      registro: {
        id: payload.id || '',
        cedula: payload.cedula || '',
        numeroIdentificacion: payload.numeroIdentificacion || payload.cedula || '',
        nombres: payload.nombres || '',
        codigoCarrera: payload.codigoCarrera || '',
        carrera: payload.carrera || payload.nombreCarrera || '',
        periodoId: payload.periodoId || '',
        estado: payload.estado || 'ENVIADO',
        intentosUsados: payload.intentosUsados || 0,
        maxIntentos: payload.maxIntentos || 0,
        tituloPreferidoNumero: payload.tituloPreferidoNumero || 1,
        origenCaptura: payload.origenCaptura || '',
        telegram: payload.contacto && payload.contacto.telegram ? payload.contacto.telegram : '',
        celular: payload.contacto && payload.contacto.celular ? payload.contacto.celular : ''
      },
      propuestas: normalizarPropuestas(payload.titulosEnviados),
      filas: construirFilas(payload)
    };
  }

  function normalizarPropuestas(titulosEnviados) {
    if (!Array.isArray(titulosEnviados)) return [];

    return titulosEnviados.map(function (propuesta) {
      return {
        numero: propuesta.numero,
        temaGeneral: propuesta.temaGeneral || '',
        problemaNecesidad: propuesta.problemaNecesidad || '',
        lugarContexto: propuesta.lugarContexto || '',
        grupoEstudio: propuesta.grupoEstudio || '',
        anioPeriodo: propuesta.anioPeriodo || '',
        objetivo: propuesta.objetivo || '',
        tituloFinal: propuesta.tituloFinal || '',
        preferido: Boolean(propuesta.preferido)
      };
    });
  }

  function construirFilas(payload) {
    var propuestas = normalizarPropuestas(payload.titulosEnviados);

    return propuestas.map(function (propuesta) {
      return {
        fechaLocal: new Date().toISOString(),
        cedula: payload.cedula || '',
        nombres: payload.nombres || '',
        carrera: payload.carrera || payload.nombreCarrera || '',
        periodoId: payload.periodoId || '',
        numeroPropuesta: propuesta.numero,
        tituloFinal: propuesta.tituloFinal,
        preferido: propuesta.preferido ? 'SI' : 'NO',
        temaGeneral: propuesta.temaGeneral,
        problemaNecesidad: propuesta.problemaNecesidad,
        lugarContexto: propuesta.lugarContexto,
        grupoEstudio: propuesta.grupoEstudio,
        anioPeriodo: propuesta.anioPeriodo,
        objetivo: propuesta.objetivo,
        estado: payload.estado || 'ENVIADO',
        intentosUsados: payload.intentosUsados || 0,
        origenCaptura: payload.origenCaptura || ''
      };
    });
  }

  function obtenerMensajeError(error) {
    return error && error.message ? error.message : String(error || 'Error desconocido');
  }

  window.TAEstudianteSheets = Object.freeze({
    respaldarEnvio: respaldarEnvio,
    obtenerUrlSheets: obtenerUrlSheets,
    construirBody: construirBody,
    construirFilas: construirFilas
  });
})();
