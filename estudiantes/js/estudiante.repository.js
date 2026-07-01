/* Repositorio de datos del módulo estudiantes. */
(function () {
  'use strict';

  var config = window.TA_ESTUDIANTES_CONFIG;
  var firebaseService = window.TAFirebaseService;

  function cargarConfiguracionApp() {
    return firebaseService.leerDocumento(
      config.collections.config,
      config.documents.appConfig
    ).then(function (appConfig) {
      if (!appConfig) {
        return Object.assign({}, config.defaultAppConfig, {
          id: config.documents.appConfig,
          origen: 'default-local'
        });
      }

      return Object.assign({}, config.defaultAppConfig, appConfig, {
        origen: 'firebase'
      });
    });
  }

  function buscarEstudiantePorCedula(cedula) {
    return firebaseService.leerDocumento(config.collections.estudiantes, cedula)
      .then(function (documentoDirecto) {
        if (documentoDirecto) return normalizarEstudiante(documentoDirecto, cedula);

        return firebaseService.consultarPrimero(
          config.collections.estudiantes,
          'numeroIdentificacion',
          '==',
          cedula
        ).then(function (documentoPorCampo) {
          if (!documentoPorCampo) return null;
          return normalizarEstudiante(documentoPorCampo, cedula);
        });
      });
  }

  function consultarEnvio(periodoId, cedula) {
    return firebaseService.leerDocumento(
      config.collections.titulos,
      construirTituloId(periodoId, cedula)
    );
  }

  function validarAccesoEstudiante(estudiante, appConfig, envioExistente) {
    if (!appConfig.procesoActivo) {
      return error('El proceso de registro de títulos no está activo.');
    }

    if (!estudiante) {
      return error('No se encontró un estudiante con esa cédula.');
    }

    if (normalizarTexto(estudiante.estadoMatricula) && normalizarTexto(estudiante.estadoMatricula) !== 'ACTIVO') {
      return error('Tu matrícula no consta como ACTIVO. Comunícate con coordinación.');
    }

    if (appConfig.periodoActivo && estudiante.periodoId && appConfig.periodoActivo !== estudiante.periodoId) {
      return error('Tu período no coincide con el período activo de titulación.');
    }

    if (estudiante.puedeEnviarTitulo === false) {
      return error('Tu registro no está habilitado para enviar títulos. Comunícate con coordinación.');
    }

    var maxIntentos = Number(appConfig.maxIntentos || config.defaultAppConfig.maxIntentos || 1);
    var intentosUsados = Number(envioExistente && envioExistente.intentosUsados || 0);

    if (envioExistente && intentosUsados >= maxIntentos) {
      return error('Ya utilizaste el máximo de intentos permitidos para enviar títulos.');
    }

    return ok({
      estudiante: estudiante,
      appConfig: appConfig,
      envioExistente: envioExistente || null,
      intentosUsados: intentosUsados,
      maxIntentos: maxIntentos,
      intentosDisponibles: Math.max(maxIntentos - intentosUsados, 0)
    });
  }

  function consultarEstudianteCompleto(cedula) {
    var appConfigLocal = null;
    var estudianteLocal = null;

    return cargarConfiguracionApp()
      .then(function (appConfig) {
        appConfigLocal = appConfig;
        return buscarEstudiantePorCedula(cedula);
      })
      .then(function (estudiante) {
        estudianteLocal = estudiante;
        if (!estudianteLocal) return null;

        var periodoId = estudianteLocal.periodoId || appConfigLocal.periodoActivo;
        return consultarEnvio(periodoId, cedula);
      })
      .then(function (envioExistente) {
        return validarAccesoEstudiante(estudianteLocal, appConfigLocal, envioExistente);
      });
  }

  function guardarEnvioFinal(payload) {
    if (!payload || !payload.cedula || !payload.periodoId) {
      return Promise.reject(new Error('No se puede guardar porque faltan cédula o período.'));
    }

    var docId = construirTituloId(payload.periodoId, payload.cedula);
    var data = Object.assign({}, payload, {
      id: docId,
      estado: 'ENVIADO',
      enviadoEn: firebaseService.serverTimestamp(),
      actualizadoEn: firebaseService.serverTimestamp(),
      respaldoSheets: payload.respaldoSheets || {
        ok: false,
        pendiente: true,
        mensaje: 'Pendiente de respaldo en Google Sheets.'
      }
    });

    return firebaseService.guardarDocumento(config.collections.titulos, docId, data, { merge: false })
      .then(function () {
        return registrarLogEnvio(docId, data, 'ENVIO_ESTUDIANTE');
      })
      .then(function () {
        return {
          ok: true,
          id: docId,
          data: data,
          mensaje: 'Propuestas enviadas correctamente.'
        };
      });
  }

  function actualizarRespaldoSheets(periodoId, cedula, resultadoSheets) {
    var docId = construirTituloId(periodoId, cedula);
    var respaldo = Object.assign({}, resultadoSheets || {}, {
      actualizadoEnLocal: new Date().toISOString()
    });

    return firebaseService.actualizarDocumento(config.collections.titulos, docId, {
      respaldoSheets: respaldo
    }).then(function () {
      return registrarLogEnvio(docId, {
        cedula: cedula,
        nombres: '',
        carrera: '',
        periodoId: periodoId,
        estado: respaldo.ok ? 'RESPALDO_SHEETS_OK' : 'RESPALDO_SHEETS_PENDIENTE',
        intentosUsados: 0,
        maxIntentos: 0,
        tituloPreferidoNumero: 0,
        origenCaptura: 'google-sheets'
      }, respaldo.ok ? 'RESPALDO_SHEETS_OK' : 'RESPALDO_SHEETS_PENDIENTE');
    }).then(function () {
      return respaldo;
    });
  }

  function registrarLogEnvio(tituloId, payload, accion) {
    var log = {
      tituloId: tituloId,
      accion: accion || 'ENVIO_ESTUDIANTE',
      cedula: payload.cedula,
      nombres: payload.nombres,
      carrera: payload.carrera,
      periodoId: payload.periodoId,
      estado: payload.estado,
      intentosUsados: payload.intentosUsados,
      maxIntentos: payload.maxIntentos,
      tituloPreferidoNumero: payload.tituloPreferidoNumero,
      origenCaptura: payload.origenCaptura || '',
      creadoEn: firebaseService.serverTimestamp()
    };

    return firebaseService.agregarDocumento(config.collections.logs, log);
  }

  function construirTituloId(periodoId, cedula) {
    return String(periodoId || 'SIN_PERIODO') + '__' + String(cedula || 'SIN_CEDULA');
  }

  function normalizarEstudiante(data, cedulaConsultada) {
    return {
      id: data.id || cedulaConsultada,
      cedula: data.numeroIdentificacion || data.cedula || cedulaConsultada,
      numeroIdentificacion: data.numeroIdentificacion || data.cedula || cedulaConsultada,
      nombres: data.nombres || data.nombreCompleto || data.estudiante || 'Sin nombres registrados',
      codigoCarrera: data.codigoCarrera || data.codigo_carrera || '',
      carrera: data.nombreCarrera || data.carrera || data.nombre_carrera || 'Carrera no registrada',
      nombreCarrera: data.nombreCarrera || data.carrera || data.nombre_carrera || 'Carrera no registrada',
      periodoId: data.periodoId || data.periodo || data.periodoActivo || '',
      estadoMatricula: data.estadoMatricula || data.matricula || data.estado || '',
      puedeEnviarTitulo: data.puedeEnviarTitulo !== false,
      correoPersonal: data.correoPersonal || data.correo || '',
      celular: data.celular || data.telefono || '',
      raw: data
    };
  }

  function normalizarTexto(valor) {
    return String(valor || '').trim().toUpperCase();
  }

  function ok(data) {
    return { ok: true, data: data, mensaje: '' };
  }

  function error(mensaje) {
    return { ok: false, data: null, mensaje: mensaje };
  }

  window.TAEstudianteRepository = Object.freeze({
    cargarConfiguracionApp: cargarConfiguracionApp,
    buscarEstudiantePorCedula: buscarEstudiantePorCedula,
    consultarEnvio: consultarEnvio,
    consultarEstudianteCompleto: consultarEstudianteCompleto,
    guardarEnvioFinal: guardarEnvioFinal,
    actualizarRespaldoSheets: actualizarRespaldoSheets,
    registrarLogEnvio: registrarLogEnvio,
    construirTituloId: construirTituloId,
    normalizarEstudiante: normalizarEstudiante
  });
})();
