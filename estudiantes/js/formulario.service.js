/* Servicio de formulario del módulo estudiantes. */
(function () {
  'use strict';

  var STORAGE_PREFIX = 'TA_ESTUDIANTES_BORRADOR__';

  function construirClaveBorrador(estudiante, appConfig) {
    var cedula = estudiante && estudiante.cedula ? estudiante.cedula : 'SIN_CEDULA';
    var periodo = obtenerPeriodo(estudiante, appConfig) || 'SIN_PERIODO';
    return STORAGE_PREFIX + periodo + '__' + cedula;
  }

  function construirPayload(estudiante, appConfig, formData, envioExistente) {
    var periodoId = obtenerPeriodo(estudiante, appConfig);
    var maxIntentos = Number(appConfig && appConfig.maxIntentos || 1);
    var intentosUsadosPrevios = Number(envioExistente && envioExistente.intentosUsados || 0);
    var tituloPreferidoNumero = Number(formData.tituloPreferidoNumero || 1);

    return {
      cedula: estudiante.cedula,
      numeroIdentificacion: estudiante.numeroIdentificacion || estudiante.cedula,
      nombres: estudiante.nombres,
      codigoCarrera: estudiante.codigoCarrera || '',
      carrera: estudiante.carrera || estudiante.nombreCarrera || '',
      nombreCarrera: estudiante.nombreCarrera || estudiante.carrera || '',
      periodoId: periodoId,
      estado: 'PREPARADO',
      intentosUsados: intentosUsadosPrevios + 1,
      intentosPrevios: intentosUsadosPrevios,
      maxIntentos: maxIntentos,
      tituloPreferidoNumero: tituloPreferidoNumero,
      contacto: {
        telegram: formData.telegram || '',
        celular: formData.celular || ''
      },
      titulosEnviados: formData.propuestas.map(function (propuesta) {
        return {
          numero: propuesta.numero,
          temaGeneral: propuesta.temaGeneral,
          problemaNecesidad: propuesta.problemaNecesidad,
          lugarContexto: propuesta.lugarContexto,
          grupoEstudio: propuesta.grupoEstudio,
          anioPeriodo: propuesta.anioPeriodo,
          objetivo: propuesta.objetivo,
          tituloFinal: propuesta.tituloFinal,
          preferido: Number(propuesta.numero) === tituloPreferidoNumero
        };
      }),
      actualizadoLocalEn: new Date().toISOString(),
      origenCaptura: detectarOrigenCaptura()
    };
  }

  function guardarBorrador(estudiante, appConfig, formData) {
    if (!soportaLocalStorage()) {
      return { ok: false, mensaje: 'Este navegador no permite guardar borradores locales.' };
    }

    if (!estudiante) {
      return { ok: false, mensaje: 'Primero consulta la cédula del estudiante.' };
    }

    var key = construirClaveBorrador(estudiante, appConfig);
    var payload = {
      estudiante: {
        cedula: estudiante.cedula,
        nombres: estudiante.nombres,
        carrera: estudiante.carrera,
        periodoId: obtenerPeriodo(estudiante, appConfig)
      },
      formData: formData,
      guardadoEn: new Date().toISOString()
    };

    localStorage.setItem(key, JSON.stringify(payload));
    return { ok: true, mensaje: 'Borrador guardado en este equipo.', key: key, data: payload };
  }

  function leerBorrador(estudiante, appConfig) {
    if (!soportaLocalStorage() || !estudiante) return null;

    var key = construirClaveBorrador(estudiante, appConfig);
    var raw = localStorage.getItem(key);
    if (!raw) return null;

    try {
      var data = JSON.parse(raw);
      data.key = key;
      return data;
    } catch (error) {
      localStorage.removeItem(key);
      return null;
    }
  }

  function eliminarBorrador(estudiante, appConfig) {
    if (!soportaLocalStorage() || !estudiante) {
      return { ok: false, mensaje: 'No hay un estudiante consultado para limpiar borrador.' };
    }

    var key = construirClaveBorrador(estudiante, appConfig);
    localStorage.removeItem(key);
    return { ok: true, mensaje: 'Borrador local eliminado.' };
  }

  function formDataDesdeEnvio(envioExistente, totalPropuestas) {
    var total = totalPropuestas || 3;
    var titulos = envioExistente && Array.isArray(envioExistente.titulosEnviados)
      ? envioExistente.titulosEnviados
      : [];

    var propuestas = [];
    for (var i = 1; i <= total; i += 1) {
      var original = buscarPorNumero(titulos, i) || {};
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
      telegram: envioExistente && envioExistente.contacto ? envioExistente.contacto.telegram || '' : '',
      celular: envioExistente && envioExistente.contacto ? envioExistente.contacto.celular || '' : '',
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
    return estudiante && estudiante.periodoId
      ? estudiante.periodoId
      : appConfig && appConfig.periodoActivo
        ? appConfig.periodoActivo
        : '';
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
    if (window.location.protocol === 'file:') return 'doble-click-html';
    if (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost') return 'live-server-local';
    return 'hosting-web';
  }

  window.TAEstudianteFormulario = Object.freeze({
    construirClaveBorrador: construirClaveBorrador,
    construirPayload: construirPayload,
    guardarBorrador: guardarBorrador,
    leerBorrador: leerBorrador,
    eliminarBorrador: eliminarBorrador,
    formDataDesdeEnvio: formDataDesdeEnvio,
    obtenerPeriodo: obtenerPeriodo,
    detectarOrigenCaptura: detectarOrigenCaptura
  });
})();
