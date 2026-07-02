/* Servicio de formulario, payload y borradores del módulo estudiantes. */
(function () {
  'use strict';

  var config = window.TA_ESTUDIANTES_CONFIG;

  function construirClaveBorrador(estudiante, appConfig) {
    var cedula = estudiante && estudiante.cedula ? estudiante.cedula : 'sin-cedula';
    var periodo = obtenerPeriodo(estudiante, appConfig) || 'SIN_PERIODO';

    return 'ta_titulos_borrador__' + periodo + '__' + cedula;
  }

  function construirPayload(estudiante, appConfig, formData, envioExistente) {
    var periodoId = obtenerPeriodo(estudiante, appConfig) || 'SIN_PERIODO';
    var maxIntentos = Number(appConfig && appConfig.maxIntentos || config.defaultAppConfig.maxIntentos || 1);
    var intentosPrevios = Number(envioExistente && envioExistente.intentosUsados || 0);
    var tituloPreferidoNumero = Number(formData.tituloPreferidoNumero || 1);
    var titulosEnviados = construirTitulosEnviados(formData.propuestas, tituloPreferidoNumero);
    var tituloPreferidoTexto = obtenerTituloPreferidoTexto(titulosEnviados, tituloPreferidoNumero);

    return {
      cedula: estudiante.cedula,
      numeroIdentificacion: estudiante.numeroIdentificacion || estudiante.cedula,
      nombres: estudiante.nombres || '',
      codigoCarrera: estudiante.codigoCarrera || '',
      carrera: estudiante.carrera || estudiante.nombreCarrera || '',
      nombreCarrera: estudiante.nombreCarrera || estudiante.carrera || '',
      periodoId: periodoId,
      periodoLabel: estudiante.periodoLabel || '',
      estado: 'ENVIADO',
      contacto: {
        telegram: formData.telegram || ''
      },
      telegramUser: formData.telegram || '',
      tituloPreferidoNumero: tituloPreferidoNumero,
      tituloPreferidoTexto: tituloPreferidoTexto,
      titulosEnviados: titulosEnviados,
      intentosUsados: intentosPrevios + 1,
      maxIntentos: maxIntentos,
      origenCaptura: detectarOrigenCaptura(),
      actualizadoEnLocal: new Date().toISOString()
    };
  }

  function construirTitulosEnviados(propuestas, tituloPreferidoNumero) {
    if (!Array.isArray(propuestas)) return [];

    return propuestas.map(function (propuesta) {
      var numero = Number(propuesta.numero || 0);

      return {
        numero: numero,
        temaGeneral: limpiarTexto(propuesta.temaGeneral),
        problemaNecesidad: limpiarTexto(propuesta.problemaNecesidad),
        lugarContexto: limpiarTexto(propuesta.lugarContexto),
        grupoEstudio: limpiarTexto(propuesta.grupoEstudio),
        anioPeriodo: limpiarTexto(propuesta.anioPeriodo),
        objetivo: limpiarTexto(propuesta.objetivo),
        tituloFinal: limpiarTexto(propuesta.tituloFinal),
        preferido: numero === Number(tituloPreferidoNumero)
      };
    });
  }

  function obtenerTituloPreferidoTexto(propuestas, tituloPreferidoNumero) {
    for (var i = 0; i < propuestas.length; i += 1) {
      if (Number(propuestas[i].numero) === Number(tituloPreferidoNumero)) {
        return propuestas[i].tituloFinal || '';
      }
    }

    return propuestas[0] && propuestas[0].tituloFinal ? propuestas[0].tituloFinal : '';
  }

  function guardarBorrador(estudiante, appConfig, formData) {
    if (!config.borradorLocalActivo) {
      return { ok: false, mensaje: 'El guardado local no está activo.' };
    }

    if (!soportaLocalStorage()) {
      return { ok: false, mensaje: 'Este navegador no permite guardar borradores locales.' };
    }

    try {
      var key = construirClaveBorrador(estudiante, appConfig);
      var data = {
        guardadoEn: new Date().toISOString(),
        formData: formData
      };

      localStorage.setItem(key, JSON.stringify(data));

      return {
        ok: true,
        mensaje: config.textos.borradorGuardado || 'Borrador local guardado.'
      };
    } catch (error) {
      return {
        ok: false,
        mensaje: 'No se pudo guardar el borrador local.'
      };
    }
  }

  function leerBorrador(estudiante, appConfig) {
    if (!config.borradorLocalActivo || !soportaLocalStorage()) return null;

    try {
      var key = construirClaveBorrador(estudiante, appConfig);
      var raw = localStorage.getItem(key);

      if (!raw) return null;

      return JSON.parse(raw);
    } catch (error) {
      return null;
    }
  }

  function eliminarBorrador(estudiante, appConfig) {
    if (!soportaLocalStorage()) {
      return { ok: false, mensaje: 'Este navegador no permite limpiar borradores locales.' };
    }

    try {
      localStorage.removeItem(construirClaveBorrador(estudiante, appConfig));

      return {
        ok: true,
        mensaje: 'Borrador local eliminado.'
      };
    } catch (error) {
      return {
        ok: false,
        mensaje: 'No se pudo eliminar el borrador.'
      };
    }
  }

  function formDataDesdeEnvio(envioExistente, propuestasObligatorias) {
    var total = Number(propuestasObligatorias || 3);
    var lista = Array.isArray(envioExistente && envioExistente.titulosEnviados)
      ? envioExistente.titulosEnviados
      : [];
    var propuestas = [];

    for (var i = 1; i <= total; i += 1) {
      var original = buscarPorNumero(lista, i) || {};

      propuestas.push({
        numero: i,
        temaGeneral: original.temaGeneral || '',
        problemaNecesidad: original.problemaNecesidad || '',
        lugarContexto: original.lugarContexto || '',
        grupoEstudio: original.grupoEstudio || '',
        anioPeriodo: original.anioPeriodo || '',
        objetivo: original.objetivo || '',
        tituloFinal: original.tituloFinal || ''
      });
    }

    return {
      telegram: envioExistente && envioExistente.contacto ? envioExistente.contacto.telegram || '' : envioExistente && envioExistente.telegramUser || '',
      tituloPreferidoNumero: Number(envioExistente && envioExistente.tituloPreferidoNumero || 1),
      propuestas: propuestas
    };
  }

  function buscarPorNumero(lista, numero) {
    for (var i = 0; i < lista.length; i += 1) {
      if (Number(lista[i].numero) === Number(numero)) return lista[i];
    }

    return null;
  }

  function obtenerPeriodo(estudiante, appConfig) {
    if (estudiante && estudiante.periodoId) return estudiante.periodoId;
    if (estudiante && estudiante.ultimoPeriodoId) return estudiante.ultimoPeriodoId;
    if (appConfig && appConfig.periodoActivo) return appConfig.periodoActivo;
    return 'SIN_PERIODO';
  }

  function soportaLocalStorage() {
    try {
      var key = '__ta_test__';
      localStorage.setItem(key, '1');
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      return false;
    }
  }

  function detectarOrigenCaptura() {
    if (window.location.protocol === 'file:') return 'electron-o-html-local';
    if (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost') return 'live-server-local';
    return 'hosting-web';
  }

  function limpiarTexto(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  window.TAEstudianteFormulario = Object.freeze({
    construirClaveBorrador: construirClaveBorrador,
    construirPayload: construirPayload,
    construirTitulosEnviados: construirTitulosEnviados,
    guardarBorrador: guardarBorrador,
    leerBorrador: leerBorrador,
    eliminarBorrador: eliminarBorrador,
    formDataDesdeEnvio: formDataDesdeEnvio,
    obtenerPeriodo: obtenerPeriodo,
    detectarOrigenCaptura: detectarOrigenCaptura
  });
})();