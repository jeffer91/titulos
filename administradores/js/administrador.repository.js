/* Repositorio Firebase del módulo administradores. */
(function () {
  'use strict';

  var config = window.TA_ADMINISTRADORES_CONFIG;
  var firebaseService = window.TAAdminFirebaseService;

  function cargarConfigApp() {
    return firebaseService.leerDocumento(config.collections.config, config.documents.appConfig)
      .then(function (doc) {
        if (!doc) {
          return Object.assign({}, config.defaultAppConfig, {
            id: config.documents.appConfig,
            origen: 'default-local'
          });
        }

        return Object.assign({}, config.defaultAppConfig, doc, {
          origen: 'firebase'
        });
      });
  }

  function guardarConfigApp(data) {
    var payload = {
      procesoActivo: parseBoolean(data.procesoActivo),
      periodoActivo: String(data.periodoActivo || '').trim(),
      maxIntentos: Number(data.maxIntentos || 2),
      propuestasObligatorias: Number(data.propuestasObligatorias || 3),
      iaActiva: parseBoolean(data.iaActiva),
      proveedorIA: String(data.proveedorIA || 'gemini').trim().toLowerCase(),
      googleSheetsUrl: String(data.googleSheetsUrl || '').trim(),
      actualizadoPorModulo: 'administradores'
    };

    return firebaseService.guardarDocumento(config.collections.config, config.documents.appConfig, payload, { merge: true })
      .then(function () {
        return registrarLog('CONFIG_APP_GUARDADA', payload);
      })
      .then(function () {
        return Object.assign({}, payload, {
          id: config.documents.appConfig,
          origen: 'firebase'
        });
      });
  }

  function listarPeriodos() {
    return firebaseService.listarDocumentos(config.collections.periodos)
      .then(function (periodos) {
        return periodos.map(normalizarPeriodo).sort(function (a, b) {
          return String(b.id).localeCompare(String(a.id));
        });
      });
  }

  function guardarPeriodo(data) {
    var periodo = normalizarPeriodo(data);
    var docId = normalizarPeriodoId(periodo.id);

    if (!docId) return Promise.reject(new Error('El ID del período es obligatorio.'));
    if (docId.indexOf('/') !== -1) return Promise.reject(new Error('El ID del período no puede contener /.'));
    if (!periodo.nombre) return Promise.reject(new Error('El nombre del período es obligatorio.'));

    periodo.id = docId;
    periodo.actualizadoPorModulo = 'administradores';

    return firebaseService.guardarDocumento(config.collections.periodos, docId, periodo, { merge: true })
      .then(function () { return registrarLog('PERIODO_GUARDADO', periodo); })
      .then(function () { return periodo; });
  }

  function activarPeriodo(periodoId) {
    var docId = normalizarPeriodoId(periodoId);
    if (!docId) return Promise.reject(new Error('Selecciona un período para activar.'));

    return listarPeriodos()
      .then(function (periodos) {
        var tareas = periodos.map(function (periodo) {
          if (periodo.id === docId) {
            return firebaseService.guardarDocumento(config.collections.periodos, periodo.id, {
              activo: true,
              estado: 'ACTIVO',
              actualizadoPorModulo: 'administradores'
            }, { merge: true });
          }

          if (periodo.activo || periodo.estado === 'ACTIVO') {
            return firebaseService.guardarDocumento(config.collections.periodos, periodo.id, {
              activo: false,
              estado: 'INACTIVO',
              actualizadoPorModulo: 'administradores'
            }, { merge: true });
          }

          return Promise.resolve();
        });

        return Promise.all(tareas);
      })
      .then(function () { return cargarConfigApp(); })
      .then(function (appConfig) {
        return guardarConfigApp(Object.assign({}, appConfig, {
          periodoActivo: docId,
          procesoActivo: true
        }));
      })
      .then(function () { return registrarLog('PERIODO_ACTIVADO', { periodoId: docId }); })
      .then(function () { return docId; });
  }

  function cerrarPeriodo(periodoId) {
    var docId = normalizarPeriodoId(periodoId);
    if (!docId) return Promise.reject(new Error('Selecciona un período para cerrar.'));

    return firebaseService.guardarDocumento(config.collections.periodos, docId, {
      activo: false,
      estado: 'CERRADO',
      actualizadoPorModulo: 'administradores'
    }, { merge: true })
      .then(function () { return cargarConfigApp(); })
      .then(function (appConfig) {
        if (appConfig.periodoActivo !== docId) return appConfig;
        return guardarConfigApp(Object.assign({}, appConfig, {
          periodoActivo: '',
          procesoActivo: false
        }));
      })
      .then(function () { return registrarLog('PERIODO_CERRADO', { periodoId: docId }); })
      .then(function () { return docId; });
  }

  function eliminarPeriodo(periodoId) {
    var docId = normalizarPeriodoId(periodoId);
    if (!docId) return Promise.reject(new Error('Selecciona un período para eliminar.'));

    return firebaseService.eliminarDocumento(config.collections.periodos, docId)
      .then(function () { return cargarConfigApp(); })
      .then(function (appConfig) {
        if (appConfig.periodoActivo !== docId) return appConfig;
        return guardarConfigApp(Object.assign({}, appConfig, {
          periodoActivo: '',
          procesoActivo: false
        }));
      })
      .then(function () { return registrarLog('PERIODO_ELIMINADO', { periodoId: docId }); })
      .then(function () { return docId; });
  }

  function listarEstudiantesPorPeriodo(periodoId) {
    var periodo = normalizarPeriodoId(periodoId);
    if (!periodo) return Promise.reject(new Error('Ingresa el período para consultar estudiantes.'));

    return firebaseService.listarDocumentos(config.collections.estudiantes, {
      where: ['periodoId', '==', periodo],
      limit: 2000
    }).then(function (estudiantes) {
      return estudiantes.map(normalizarEstudiante).sort(function (a, b) {
        return String(a.nombres || '').localeCompare(String(b.nombres || ''));
      });
    });
  }

  function guardarEstudiantes(estudiantes, periodoId) {
    var periodo = normalizarPeriodoId(periodoId);
    var lista = Array.isArray(estudiantes) ? estudiantes : [];

    if (!periodo) return Promise.reject(new Error('Ingresa el período antes de guardar estudiantes.'));
    if (!lista.length) return Promise.reject(new Error('No hay estudiantes para guardar.'));

    var documentos = lista.map(function (estudiante) {
      var normalizado = normalizarEstudiante(Object.assign({}, estudiante, { periodoId: periodo }));
      return {
        id: normalizado.numeroIdentificacion,
        data: normalizado
      };
    });

    return firebaseService.guardarLote(config.collections.estudiantes, documentos, { merge: true })
      .then(function (respuesta) {
        return registrarLog('ESTUDIANTES_CARGADOS', { periodoId: periodo, total: respuesta.total })
          .then(function () { return respuesta; });
      });
  }

  function limpiarEstudiantesPorPeriodo(periodoId) {
    var periodo = normalizarPeriodoId(periodoId);
    if (!periodo) return Promise.reject(new Error('Ingresa el período que deseas limpiar.'));

    return listarEstudiantesPorPeriodo(periodo)
      .then(function (estudiantes) {
        var ids = estudiantes.map(function (estudiante) {
          return estudiante.numeroIdentificacion || estudiante.id;
        }).filter(Boolean);

        if (!ids.length) return { total: 0 };
        return firebaseService.eliminarLote(config.collections.estudiantes, ids);
      })
      .then(function (respuesta) {
        return registrarLog('ESTUDIANTES_LIMPIADOS', { periodoId: periodo, total: respuesta.total })
          .then(function () { return respuesta; });
      });
  }

  function listarCoordinadores() {
    return firebaseService.listarDocumentos(config.collections.coordinadores)
      .then(function (coordinadores) {
        return coordinadores.map(normalizarCoordinador).sort(function (a, b) {
          return String(a.nombres || '').localeCompare(String(b.nombres || ''));
        });
      });
  }

  function guardarCoordinador(data) {
    var coordinador = normalizarCoordinador(data);
    if (!coordinador.email) return Promise.reject(new Error('El correo del coordinador es obligatorio.'));
    if (!coordinador.nombres) return Promise.reject(new Error('Los nombres del coordinador son obligatorios.'));
    if (!coordinador.carreras.length) return Promise.reject(new Error('Asigna al menos una carrera al coordinador.'));

    return firebaseService.guardarDocumento(config.collections.coordinadores, coordinador.id, coordinador, { merge: true })
      .then(function () {
        return registrarLog('COORDINADOR_GUARDADO', {
          id: coordinador.id,
          email: coordinador.email,
          carreras: coordinador.carreras,
          activo: coordinador.activo
        });
      })
      .then(function () {
        return coordinador;
      });
  }

  function eliminarCoordinador(id) {
    var docId = normalizarCoordinadorId(id);
    if (!docId) return Promise.reject(new Error('Selecciona un coordinador para eliminar.'));

    return firebaseService.eliminarDocumento(config.collections.coordinadores, docId)
      .then(function () {
        return registrarLog('COORDINADOR_ELIMINADO', { id: docId });
      })
      .then(function () {
        return docId;
      });
  }

  function cargarConfigIA(proveedor) {
    var documentId = normalizarProveedor(proveedor);
    return firebaseService.leerDocumento(config.collections.ia, documentId)
      .then(function (doc) {
        if (!doc) {
          return {
            id: documentId,
            activo: false,
            apiKey: '',
            model: modeloDefault(documentId),
            temperature: 0.35,
            maxOutputTokens: 900,
            origen: 'default-local'
          };
        }

        return Object.assign({
          id: documentId,
          activo: false,
          apiKey: '',
          model: modeloDefault(documentId),
          temperature: 0.35,
          maxOutputTokens: 900
        }, doc, { origen: 'firebase' });
      });
  }

  function guardarConfigIA(proveedor, data) {
    var documentId = normalizarProveedor(proveedor);
    var payload = {
      activo: parseBoolean(data.activo),
      apiKey: String(data.apiKey || '').trim(),
      model: String(data.model || modeloDefault(documentId)).trim(),
      temperature: Number(data.temperature || 0.35),
      maxOutputTokens: Number(data.maxOutputTokens || 900),
      actualizadoPorModulo: 'administradores'
    };

    return firebaseService.guardarDocumento(config.collections.ia, documentId, payload, { merge: true })
      .then(function () { return registrarLog('CONFIG_IA_GUARDADA', Object.assign({ proveedor: documentId }, payload)); })
      .then(function () { return Object.assign({ id: documentId }, payload, { origen: 'firebase' }); });
  }

  function ejecutarDiagnostico() {
    var tareas = [
      diagnosticarDocumento('Configuración general', config.collections.config, config.documents.appConfig),
      diagnosticarDocumento('IA Gemini', config.collections.ia, 'gemini'),
      diagnosticarColeccion('Períodos', config.collections.periodos),
      diagnosticarColeccion('Estudiantes', config.collections.estudiantes),
      diagnosticarColeccion('Coordinadores', config.collections.coordinadores),
      diagnosticarColeccion('Títulos', config.collections.titulos),
      diagnosticarColeccion('Logs', config.collections.logs)
    ];

    return Promise.all(tareas);
  }

  function diagnosticarDocumento(titulo, collectionName, documentId) {
    return firebaseService.leerDocumento(collectionName, documentId)
      .then(function (doc) {
        return {
          titulo: titulo,
          estado: doc ? 'ok' : 'pending',
          descripcion: doc ? 'Documento encontrado en ' + collectionName + '/' + documentId + '.' : 'No existe todavía ' + collectionName + '/' + documentId + '.'
        };
      })
      .catch(function (error) {
        return { titulo: titulo, estado: 'error', descripcion: obtenerMensajeError(error) };
      });
  }

  function diagnosticarColeccion(titulo, collectionName) {
    return firebaseService.contarColeccion(collectionName, 5)
      .then(function (cantidad) {
        return { titulo: titulo, estado: 'ok', descripcion: 'Colección accesible. Muestra encontrada: ' + cantidad + '.' };
      })
      .catch(function (error) {
        return { titulo: titulo, estado: 'error', descripcion: obtenerMensajeError(error) };
      });
  }

  function registrarLog(accion, data) {
    return firebaseService.agregarDocumento(config.collections.logs, {
      accion: accion,
      modulo: 'administradores',
      data: limpiarDataParaLog(data)
    }).catch(function () { return null; });
  }

  function normalizarPeriodo(data) {
    var original = data || {};
    return {
      id: normalizarPeriodoId(original.id || original.periodoId || original.codigo || ''),
      periodoId: normalizarPeriodoId(original.id || original.periodoId || original.codigo || ''),
      nombre: String(original.nombre || original.descripcionCorta || original.id || '').trim(),
      fechaInicio: String(original.fechaInicio || '').trim(),
      fechaFin: String(original.fechaFin || '').trim(),
      estado: String(original.estado || (original.activo ? 'ACTIVO' : 'INACTIVO')).trim().toUpperCase(),
      activo: parseBoolean(original.activo) || String(original.estado || '').toUpperCase() === 'ACTIVO',
      observacion: String(original.observacion || original.descripcion || '').trim()
    };
  }

  function normalizarEstudiante(data) {
    var original = data || {};
    var cedula = soloNumeros(original.numeroIdentificacion || original.cedula || original.id || '');
    return {
      id: cedula,
      numeroIdentificacion: cedula,
      cedula: cedula,
      nombres: limpiarTexto(original.nombres || original.nombreCompleto || original.estudiante || ''),
      nombreCompleto: limpiarTexto(original.nombreCompleto || original.nombres || original.estudiante || ''),
      codigoCarrera: limpiarTexto(original.codigoCarrera || original.codigo_carrera || ''),
      carrera: limpiarTexto(original.carrera || original.nombreCarrera || original.nombre_carrera || ''),
      nombreCarrera: limpiarTexto(original.nombreCarrera || original.carrera || original.nombre_carrera || ''),
      periodoId: normalizarPeriodoId(original.periodoId || original.periodo || ''),
      estadoMatricula: limpiarTexto(original.estadoMatricula || original.matricula || original.estado || 'ACTIVO').toUpperCase(),
      puedeEnviarTitulo: original.puedeEnviarTitulo !== false,
      correoPersonal: limpiarTexto(original.correoPersonal || original.correo || ''),
      celular: soloNumeros(original.celular || original.telefono || ''),
      actualizadoPorModulo: 'administradores'
    };
  }

  function normalizarCoordinador(data) {
    var original = data || {};
    var email = limpiarTexto(original.email || original.correo || original.id || '').toLowerCase();
    var id = normalizarCoordinadorId(email);
    return {
      id: id,
      email: email,
      correo: email,
      nombres: limpiarTexto(original.nombres || original.nombre || original.nombreCompleto || ''),
      carreras: normalizarCarreras(original.carreras || original.carrerasAsignadas || original.carrera || ''),
      activo: parseBoolean(original.activo) || original.activo === undefined,
      rol: 'coordinador',
      observacion: limpiarTexto(original.observacion || ''),
      actualizadoPorModulo: 'administradores'
    };
  }

  function normalizarCarreras(value) {
    if (Array.isArray(value)) {
      return value.map(limpiarTexto).filter(Boolean);
    }

    return String(value || '')
      .split(',')
      .map(limpiarTexto)
      .filter(Boolean);
  }

  function normalizarPeriodoId(periodoId) {
    return String(periodoId || '').trim().replace(/\s+/g, '_').replace(/[^A-Za-z0-9_\-.]/g, '');
  }

  function normalizarCoordinadorId(value) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9@._-]/g, '_');
  }

  function limpiarDataParaLog(data) {
    var copia = Object.assign({}, data || {});
    if (copia.apiKey) copia.apiKey = '***';
    return copia;
  }

  function modeloDefault(proveedor) {
    if (proveedor === 'gemini') return 'gemini-1.5-flash';
    if (proveedor === 'groq') return 'llama-3.1-8b-instant';
    if (proveedor === 'openrouter') return 'google/gemini-flash-1.5';
    if (proveedor === 'mistral') return 'mistral-small-latest';
    return '';
  }

  function normalizarProveedor(proveedor) {
    return String(proveedor || 'gemini').trim().toLowerCase();
  }

  function parseBoolean(value) {
    if (value === true || value === 'true' || value === 'SI' || value === '1') return true;
    return false;
  }

  function limpiarTexto(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function soloNumeros(value) {
    return String(value || '').replace(/\D/g, '').trim();
  }

  function obtenerMensajeError(error) {
    return error && error.message ? error.message : String(error || 'Error desconocido');
  }

  window.TAAdminRepository = Object.freeze({
    cargarConfigApp: cargarConfigApp,
    guardarConfigApp: guardarConfigApp,
    listarPeriodos: listarPeriodos,
    guardarPeriodo: guardarPeriodo,
    activarPeriodo: activarPeriodo,
    cerrarPeriodo: cerrarPeriodo,
    eliminarPeriodo: eliminarPeriodo,
    listarEstudiantesPorPeriodo: listarEstudiantesPorPeriodo,
    guardarEstudiantes: guardarEstudiantes,
    limpiarEstudiantesPorPeriodo: limpiarEstudiantesPorPeriodo,
    listarCoordinadores: listarCoordinadores,
    guardarCoordinador: guardarCoordinador,
    eliminarCoordinador: eliminarCoordinador,
    cargarConfigIA: cargarConfigIA,
    guardarConfigIA: guardarConfigIA,
    ejecutarDiagnostico: ejecutarDiagnostico
  });
})();
