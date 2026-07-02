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
    }).catch(function () {
      return Object.assign({}, config.defaultAppConfig, {
        id: config.documents.appConfig,
        origen: 'default-local-sin-config'
      });
    });
  }

  function buscarEstudiantePorCedula(cedulaIngresada) {
    var variantes = construirVariantesCedula(cedulaIngresada);

    return buscarDocumentoPorIds(variantes)
      .then(function (documentoDirecto) {
        if (documentoDirecto) {
          return normalizarEstudiante(documentoDirecto, cedulaIngresada);
        }

        return buscarDocumentoPorCampo('numeroIdentificacion', variantes);
      })
      .then(function (documentoPorNumero) {
        if (documentoPorNumero) {
          return normalizarEstudiante(documentoPorNumero, cedulaIngresada);
        }

        return buscarDocumentoPorCampo('cedula', variantes);
      })
      .then(function (documentoPorCedula) {
        if (!documentoPorCedula) return null;
        return normalizarEstudiante(documentoPorCedula, cedulaIngresada);
      });
  }

  function buscarDocumentoPorIds(variantes) {
    var cadena = Promise.resolve(null);

    variantes.forEach(function (cedula) {
      cadena = cadena.then(function (encontrado) {
        if (encontrado) return encontrado;
        return firebaseService.leerDocumento(config.collections.estudiantes, cedula);
      });
    });

    return cadena;
  }

  function buscarDocumentoPorCampo(campo, variantes) {
    var cadena = Promise.resolve(null);

    variantes.forEach(function (cedula) {
      cadena = cadena.then(function (encontrado) {
        if (encontrado) return encontrado;

        return firebaseService.consultarPrimero(
          config.collections.estudiantes,
          campo,
          '==',
          cedula
        );
      });
    });

    return cadena;
  }

  function consultarEnvio(periodoId, cedulaIngresada) {
    var variantes = construirVariantesCedula(cedulaIngresada);
    var cadena = Promise.resolve(null);

    variantes.forEach(function (cedula) {
      cadena = cadena.then(function (encontrado) {
        if (encontrado) return encontrado;

        return firebaseService.leerDocumento(
          config.collections.titulos,
          construirTituloId(periodoId, cedula)
        );
      });
    });

    return cadena;
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

    if (estudiante.puedeEnviarTitulo === false) {
      return error('Tu registro no está habilitado para enviar títulos. Comunícate con coordinación.');
    }

    var maxIntentos = Number(appConfig.maxIntentos || config.defaultAppConfig.maxIntentos || 1);
    var intentosUsados = Number(envioExistente && envioExistente.intentosUsados || 0);

    if (envioExistente && intentosUsados >= maxIntentos) {
      return error('Ya existe un envío registrado para esta cédula. Si necesitas cambios, comunícate con coordinación.');
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

        var periodoId = estudianteLocal.periodoId || appConfigLocal.periodoActivo || 'SIN_PERIODO';
        return consultarEnvio(periodoId, estudianteLocal.cedula || cedula);
      })
      .then(function (envioExistente) {
        return validarAccesoEstudiante(estudianteLocal, appConfigLocal, envioExistente);
      });
  }

  function guardarEnvioFinal(payload) {
    if (!payload || !payload.cedula) {
      return Promise.reject(new Error('No se puede guardar porque falta la cédula.'));
    }

    if (!payload.periodoId) {
      payload.periodoId = 'SIN_PERIODO';
    }

    var tituloId = construirTituloId(payload.periodoId, payload.cedula);
    var payloadFinal = Object.assign({}, payload, {
      id: tituloId,
      estado: 'ENVIADO',
      tituloPreferidoTexto: obtenerTituloPreferidoTexto(payload),
      origenCaptura: payload.origenCaptura || 'estudiantes-web',
      creadoEn: firebaseService.serverTimestamp(),
      actualizadoEn: firebaseService.serverTimestamp()
    });

    return firebaseService.guardarDocumento(
      config.collections.titulos,
      tituloId,
      payloadFinal,
      true
    ).then(function () {
      return registrarLogEnvio(tituloId, payloadFinal, 'ENVIO_ESTUDIANTE');
    }).then(function () {
      return {
        ok: true,
        id: tituloId,
        data: payloadFinal,
        mensaje: 'Envío registrado correctamente.'
      };
    });
  }

  function actualizarRespaldoSheets(periodoId, cedula, respaldo) {
    return firebaseService.actualizarDocumento(
      config.collections.titulos,
      construirTituloId(periodoId, cedula),
      {
        respaldoSheets: respaldo,
        respaldoSheetsEstado: respaldo && respaldo.ok ? 'OK' : 'PENDIENTE',
        respaldoSheetsActualizadoEn: firebaseService.serverTimestamp()
      }
    );
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
      telegramUser: payload.telegramUser || '',
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
    var source = normalizarObjeto(data || {});
    var cedulaOriginal = valor(source, ['numeroidentificacion', 'cedula', 'id']) || cedulaConsultada;
    var cedulaNormalizada = normalizarCedulaParaMostrar(cedulaOriginal || cedulaConsultada);
    var nombres = valor(source, ['nombres', 'nombrecompleto', 'estudiante', 'nombre']);
    var carrera = valor(source, ['nombrecarrera', 'carrera', 'nombre_carrera']);
    var periodoId = valor(source, ['periodoid', 'ultimoperiodoid', 'periodo', 'periodoactivo']);
    var periodoLabel = valor(source, ['periodolabel', 'periodonombre', 'periodoetiqueta']);
    var codigoCarrera = valor(source, ['codigocarrera', 'codigo_carrera']);
    var estadoMatricula = valor(source, ['estadomatricula', 'matricula', 'estado']) || 'ACTIVO';

    return {
      id: data.id || cedulaNormalizada,
      cedula: cedulaNormalizada,
      numeroIdentificacion: cedulaNormalizada,
      nombres: limpiarTexto(nombres) || 'Sin nombres registrados',
      codigoCarrera: limpiarTexto(codigoCarrera),
      carrera: limpiarTexto(carrera) || 'Carrera no registrada',
      nombreCarrera: limpiarTexto(carrera) || 'Carrera no registrada',
      periodoId: limpiarTexto(periodoId),
      periodoLabel: limpiarTexto(periodoLabel),
      estadoMatricula: limpiarTexto(estadoMatricula).toUpperCase(),
      puedeEnviarTitulo: data.puedeEnviarTitulo !== false,
      raw: data
    };
  }

  function construirVariantesCedula(cedula) {
    var limpia = limpiarSoloNumeros(cedula);
    var variantes = [];

    agregarUnico(variantes, limpia);

    if (limpia.length === 9) {
      agregarUnico(variantes, '0' + limpia);
    }

    if (limpia.length === 10 && limpia.charAt(0) === '0') {
      agregarUnico(variantes, limpia.slice(1));
    }

    return variantes;
  }

  function normalizarCedulaParaMostrar(cedula) {
    var limpia = limpiarSoloNumeros(cedula);
    if (limpia.length === 9) return '0' + limpia;
    return limpia;
  }

  function agregarUnico(lista, valor) {
    if (!valor) return;
    if (lista.indexOf(valor) === -1) lista.push(valor);
  }

  function normalizarObjeto(data) {
    var normalizado = {};

    Object.keys(data || {}).forEach(function (key) {
      normalizado[normalizarKey(key)] = data[key];
    });

    return normalizado;
  }

  function normalizarKey(key) {
    return String(key || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toLowerCase();
  }

  function valor(source, keys) {
    for (var i = 0; i < keys.length; i += 1) {
      var value = source[keys[i]];
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        return String(value).trim();
      }
    }

    return '';
  }

  function obtenerTituloPreferidoTexto(payload) {
    var numero = Number(payload.tituloPreferidoNumero || 1);
    var propuestas = Array.isArray(payload.titulosEnviados) ? payload.titulosEnviados : [];

    for (var i = 0; i < propuestas.length; i += 1) {
      if (Number(propuestas[i].numero) === numero) {
        return propuestas[i].tituloFinal || '';
      }
    }

    return propuestas[0] && propuestas[0].tituloFinal ? propuestas[0].tituloFinal : '';
  }

  function normalizarTexto(valorTexto) {
    return String(valorTexto || '').trim().toUpperCase();
  }

  function limpiarTexto(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function limpiarSoloNumeros(value) {
    return String(value || '').replace(/\D/g, '').trim();
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
    normalizarEstudiante: normalizarEstudiante,
    construirVariantesCedula: construirVariantesCedula
  });
})();