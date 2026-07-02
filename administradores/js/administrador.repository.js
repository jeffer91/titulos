/* Repositorio principal del panel administrador. */
(function () {
  'use strict';

  var config = window.TA_ADMINISTRADORES_CONFIG;
  var firebaseService = window.TAFirebaseService || window.TAAdminFirebaseService;

  var estado = {
    firebaseListo: false
  };

  function iniciarFirebase() {
    if (estado.firebaseListo) return Promise.resolve(true);

    if (!firebaseService || !firebaseService.iniciar) {
      return Promise.reject(new Error('No se encontró el servicio de Firebase.'));
    }

    return firebaseService.iniciar(config.firebase).then(function (resultado) {
      estado.firebaseListo = Boolean(resultado && resultado.ok);

      if (!estado.firebaseListo) {
        throw new Error(resultado && resultado.mensaje ? resultado.mensaje : config.textos.firebaseError);
      }

      return true;
    });
  }

  function cargarAppConfig() {
    return leerDocumento(config.collections.config, config.documents.appConfig)
      .then(function (data) {
        return Object.assign({}, config.defaultAppConfig, data || {});
      })
      .catch(function () {
        return Object.assign({}, config.defaultAppConfig);
      });
  }

  function guardarAppConfig(data) {
    var payload = Object.assign({}, data || {}, {
      actualizadoEn: ahoraIso()
    });

    return guardarDocumento(config.collections.config, config.documents.appConfig, payload, true);
  }

  function listarEstudiantes() {
    return listarColeccion(config.collections.estudiantes).then(function (docs) {
      return deduplicarEstudiantesBasico(docs.map(normalizarEstudiante));
    });
  }

  function listarTitulos() {
    return listarColeccion(config.collections.titulos).then(function (docs) {
      return docs.map(normalizarTitulo);
    });
  }

  function listarCoordinadores() {
    return listarColeccion(config.collections.coordinadores).then(function (docs) {
      return docs.map(normalizarCoordinador).sort(function (a, b) {
        return a.nombre.localeCompare(b.nombre);
      });
    });
  }

  function listarPeriodos() {
    return Promise.all([
      cargarAppConfig(),
      listarEstudiantes(),
      listarTitulos(),
      listarColeccion(config.collections.periodos).catch(function () { return []; })
    ]).then(function (resultados) {
      var appConfig = resultados[0];
      var estudiantes = resultados[1];
      var titulos = resultados[2];
      var periodosColeccion = resultados[3];
      var mapa = {};

      agregarPeriodoMapa(mapa, appConfig.periodoActivoId || appConfig.periodoActivo, appConfig.periodoActivoLabel, 'config');
      agregarPeriodoMapaDesdeObjeto(mapa, appConfig.periodoActivo, 'config');

      (appConfig.periodosActivos || []).forEach(function (periodoId, index) {
        var label = appConfig.periodosActivosLabels && appConfig.periodosActivosLabels[index]
          ? appConfig.periodosActivosLabels[index]
          : '';

        agregarPeriodoMapa(mapa, periodoId, label, 'config');
      });

      estudiantes.forEach(function (estudiante) {
        agregarPeriodoMapa(mapa, estudiante.periodoId, estudiante.periodoLabel, 'estudiantes');
      });

      titulos.forEach(function (titulo) {
        agregarPeriodoMapa(mapa, titulo.periodoId, titulo.periodoLabel, 'titulos');
      });

      periodosColeccion.forEach(function (periodo) {
        agregarPeriodoMapa(mapa, periodo.id || periodo.periodoId, periodo.label || periodo.periodoLabel || periodo.nombre, 'periodos');
      });

      var activos = construirSetCanonicamente(appConfig.periodosActivos || []);
      if (appConfig.periodoActivoId) activos[normalizarPeriodoIdCanonico(appConfig.periodoActivoId)] = true;
      if (appConfig.periodoActivo && typeof appConfig.periodoActivo === 'string') {
        activos[normalizarPeriodoIdCanonico(appConfig.periodoActivo)] = true;
      }

      return Object.keys(mapa).map(function (id) {
        var item = mapa[id];
        item.activo = Boolean(activos[id]);
        item.label = item.label || formatearPeriodoId(id);
        return item;
      }).sort(function (a, b) {
        if (a.activo !== b.activo) return a.activo ? -1 : 1;
        return a.label.localeCompare(b.label);
      });
    });
  }

  function actualizarPeriodosActivos(periodosActivosIds) {
    periodosActivosIds = limpiarUnicos((periodosActivosIds || []).map(normalizarPeriodoIdCanonico)).filter(Boolean);

    return listarPeriodos().then(function (periodos) {
      var labels = periodosActivosIds.map(function (id) {
        var encontrado = buscarPorId(periodos, id);
        return encontrado ? encontrado.label : formatearPeriodoId(id);
      });

      var principalId = periodosActivosIds[0] || '';
      var principalLabel = labels[0] || '';

      return guardarAppConfig({
        periodoActivo: principalId ? { id: principalId, label: principalLabel } : null,
        periodoActivoId: principalId,
        periodoActivoLabel: principalLabel,
        periodoActivoIdNormalizado: principalId ? normalizarPeriodoId(principalId) : '',
        periodoActivoDesactivado: !principalId,
        periodosActivos: periodosActivosIds,
        periodosActivosLabels: labels
      });
    });
  }

  function cambiarEstadoPeriodo(periodoId, activo) {
    return cargarAppConfig().then(function (appConfig) {
      var activos = limpiarUnicos((appConfig.periodosActivos || []).map(normalizarPeriodoIdCanonico)).filter(Boolean);
      var canonico = normalizarPeriodoIdCanonico(periodoId);

      if (appConfig.periodoActivoId) {
        activos = limpiarUnicos(activos.concat([normalizarPeriodoIdCanonico(appConfig.periodoActivoId)]));
      }

      if (activo && activos.indexOf(canonico) === -1) {
        activos.push(canonico);
      }

      if (!activo) {
        activos = activos.filter(function (id) {
          return id !== canonico;
        });
      }

      return actualizarPeriodosActivos(activos);
    });
  }

  function obtenerCarreras() {
    return listarEstudiantes().then(function (estudiantes) {
      var mapa = {};

      estudiantes.forEach(function (estudiante) {
        var nombre = estudiante.carrera || estudiante.nombreCarrera;
        var key = normalizarTexto(nombre);

        if (!key || key === 'SIN CARRERA') return;

        if (!mapa[key]) {
          mapa[key] = {
            nombreCarrera: nombre,
            codigoCarrera: estudiante.codigoCarrera || ''
          };
        }
      });

      return Object.keys(mapa).map(function (key) {
        return mapa[key];
      }).sort(function (a, b) {
        return a.nombreCarrera.localeCompare(b.nombreCarrera);
      });
    });
  }

  function crearCoordinador(nombre) {
    var limpio = limpiarTexto(nombre);
    var id = generarIdDesdeNombre(limpio);

    if (!limpio) {
      return Promise.reject(new Error('Ingresa el nombre del coordinador.'));
    }

    if (!id) {
      return Promise.reject(new Error('No se pudo generar el ID del coordinador.'));
    }

    var payload = {
      id: id,
      _docId: id,
      nombre: limpio,
      activo: true,
      carreras: [],
      carrerasAsignadas: [],
      origen: 'admin',
      creadoEn: ahoraIso(),
      actualizadoEn: ahoraIso()
    };

    return guardarDocumento(config.collections.coordinadores, id, payload, true).then(function () {
      return payload;
    });
  }

  function eliminarCoordinador(coordinadorId) {
    if (!coordinadorId) {
      return Promise.reject(new Error('Selecciona un coordinador.'));
    }

    return actualizarDocumento(config.collections.coordinadores, coordinadorId, {
      activo: false,
      carreras: [],
      carrerasAsignadas: [],
      eliminadoEn: ahoraIso(),
      actualizadoEn: ahoraIso()
    });
  }

  function asignarCarreraACoordinador(nombreCarrera, coordinadorId) {
    var carreraLimpia = normalizarCarreraVista(nombreCarrera);
    var carreraKey = normalizarTexto(carreraLimpia);

    if (!carreraLimpia || carreraKey === 'SIN CARRERA') {
      return Promise.reject(new Error('No se pudo identificar la carrera.'));
    }

    return listarCoordinadores().then(function (coordinadores) {
      var operaciones = coordinadores.map(function (coordinador) {
        var carreras = (coordinador.carreras || []).filter(function (carrera) {
          return normalizarTexto(normalizarCarreraVista(carrera)) !== carreraKey;
        });

        var carrerasAsignadas = (coordinador.carrerasAsignadas || []).filter(function (item) {
          return normalizarTexto(normalizarCarreraVista(item.nombreCarrera || item)) !== carreraKey;
        });

        if (coordinador.id === coordinadorId) {
          carreras.push(carreraLimpia);
          carrerasAsignadas.push({
            codigoCarrera: '',
            nombreCarrera: carreraLimpia
          });
        }

        return actualizarDocumento(config.collections.coordinadores, coordinador.id, {
          carreras: limpiarUnicos(carreras.map(normalizarCarreraVista)),
          carrerasAsignadas: limpiarCarrerasAsignadas(carrerasAsignadas),
          actualizadoEn: ahoraIso()
        });
      });

      return Promise.all(operaciones);
    });
  }

  function listarEstudiantesConTitulos(periodoId) {
    return Promise.all([
      listarEstudiantes(),
      listarTitulos()
    ]).then(function (resultados) {
      var estudiantes = resultados[0];
      var titulos = resultados[1];
      var mapaTitulos = construirMapaTitulos(titulos);
      var periodoFiltro = normalizarPeriodoIdCanonico(periodoId);

      var fusionados = estudiantes.filter(function (estudiante) {
        if (!periodoFiltro) return true;
        return estudiante.periodoId === periodoFiltro;
      }).map(function (estudiante) {
        var titulo = buscarTituloParaEstudiante(mapaTitulos, estudiante.cedula, estudiante.periodoId);
        return fusionarEstudianteTitulo(estudiante, titulo);
      });

      return deduplicarEstudiantesFusionados(fusionados).sort(function (a, b) {
        return a.nombres.localeCompare(b.nombres);
      });
    });
  }

  function obtenerDetalleEstudiante(cedula, periodoId) {
    return listarEstudiantesConTitulos(periodoId).then(function (rows) {
      for (var i = 0; i < rows.length; i += 1) {
        if (rows[i].cedula === cedula) return rows[i];
      }

      return null;
    });
  }

  function archivarIntento(tituloId, motivo) {
    if (!tituloId) {
      return Promise.reject(new Error('No se pudo identificar el intento.'));
    }

    return leerDocumento(config.collections.titulos, tituloId).then(function (titulo) {
      if (!titulo) {
        throw new Error('No se encontró el título enviado.');
      }

      var historialId = tituloId + '__' + Date.now();
      var historial = Object.assign({}, titulo, {
        idOriginal: tituloId,
        id: historialId,
        archivadoEn: ahoraIso(),
        motivoArchivo: motivo || 'Reinicio de intento desde administración'
      });

      return guardarDocumento(config.collections.titulosHistorial, historialId, historial, false).then(function () {
        return actualizarDocumento(config.collections.titulos, tituloId, {
          estado: config.estadosTitulo.borradorReiniciado,
          intentosUsados: 0,
          tituloPreferidoNumero: '',
          tituloPreferidoTexto: '',
          titulosEnviados: [],
          reiniciadoPorAdmin: true,
          reiniciadoEn: ahoraIso(),
          actualizadoEn: ahoraIso()
        });
      });
    });
  }

  function normalizarDatosAutomaticamente() {
    var resultado = {
      ok: true,
      cambios: 0,
      estudiantes: 0,
      titulos: 0,
      normalizaciones: []
    };

    return cargarAppConfig()
      .then(function (appConfig) {
        return Promise.all([
          listarColeccion(config.collections.estudiantes),
          listarColeccion(config.collections.titulos)
        ]).then(function (resultados) {
          return {
            appConfig: appConfig,
            estudiantesRaw: resultados[0],
            titulosRaw: resultados[1]
          };
        });
      })
      .then(function (data) {
        var operaciones = [];

        (data.estudiantesRaw || []).forEach(function (doc) {
          var cambio = construirCambioNormalizacionEstudiante(doc);

          if (cambio) {
            resultado.cambios += 1;
            resultado.estudiantes += 1;
            resultado.normalizaciones.push(cambio.normalizacion);

            operaciones.push(
              actualizarDocumento(config.collections.estudiantes, doc._docId || doc.id, cambio.payload)
            );
          }
        });

        (data.titulosRaw || []).forEach(function (doc) {
          var cambio = construirCambioNormalizacionTitulo(doc);

          if (cambio) {
            resultado.cambios += 1;
            resultado.titulos += 1;
            resultado.normalizaciones.push(cambio.normalizacion);

            operaciones.push(
              actualizarDocumento(config.collections.titulos, doc._docId || doc.id, cambio.payload)
            );
          }
        });

        return Promise.all(operaciones).then(function () {
          return registrarNormalizacionesEnSheets(data.appConfig, resultado.normalizaciones);
        }).then(function () {
          return guardarAppConfig({
            normalizacionUltimaEjecucion: ahoraIso(),
            normalizacionUltimoResultado: 'Cambios aplicados: ' + resultado.cambios
          });
        }).then(function () {
          return resultado;
        });
      });
  }

  function construirCambioNormalizacionEstudiante(doc) {
    var source = normalizarObjeto(doc || {});
    var payload = {};
    var cambios = [];
    var periodoOriginal = valor(source, ['periodoid', 'ultimoperiodoid', 'periodo']);
    var periodoCanonico = normalizarPeriodoIdCanonico(periodoOriginal);
    var periodoLabel = periodoCanonico ? formatearPeriodoId(periodoCanonico) : '';

    var carreraOriginal = valor(source, ['nombrecarrera', 'carrera']);
    var carreraFirebase = normalizarCarreraFirebase(carreraOriginal);

    if (periodoOriginal && periodoCanonico && periodoOriginal !== periodoCanonico) {
      payload.periodoId = periodoCanonico;
      payload.periodoLabel = periodoLabel;
      cambios.push({
        campo: 'periodoId',
        original: periodoOriginal,
        normalizado: periodoCanonico
      });
    }

    if (carreraOriginal && carreraFirebase && carreraOriginal !== carreraFirebase) {
      if (doc.NombreCarrera !== undefined) payload.NombreCarrera = carreraFirebase;
      if (doc.nombreCarrera !== undefined) payload.nombreCarrera = carreraFirebase;
      if (doc.carrera !== undefined) payload.carrera = carreraFirebase;

      cambios.push({
        campo: 'carrera',
        original: carreraOriginal,
        normalizado: carreraFirebase
      });
    }

    if (!cambios.length) return null;

    payload.normalizadoEn = ahoraIso();
    payload.actualizadoEn = ahoraIso();

    return {
      payload: payload,
      normalizacion: {
        entidad: 'Estudiantes',
        campo: cambios.map(function (c) { return c.campo; }).join(', '),
        valorOriginal: cambios.map(function (c) { return c.original; }).join(' | '),
        valorNormalizado: cambios.map(function (c) { return c.normalizado; }).join(' | '),
        accion: 'NORMALIZAR_FIREBASE',
        estado: 'APLICADO',
        observacion: 'Normalización automática desde administrador',
        idRegistro: 'norm_est_' + (doc._docId || doc.id || Date.now()) + '_' + Date.now()
      }
    };
  }

  function construirCambioNormalizacionTitulo(doc) {
    var payload = {};
    var cambios = [];
    var periodoOriginal = limpiarTexto(doc.periodoId || '');
    var periodoCanonico = normalizarPeriodoIdCanonico(periodoOriginal);
    var periodoLabel = periodoCanonico ? formatearPeriodoId(periodoCanonico) : '';

    var carreraOriginal = limpiarTexto(doc.carrera || doc.nombreCarrera || '');
    var carreraFirebase = normalizarCarreraFirebase(carreraOriginal);

    if (periodoOriginal && periodoCanonico && periodoOriginal !== periodoCanonico) {
      payload.periodoId = periodoCanonico;
      payload.periodoLabel = periodoLabel;
      cambios.push({
        campo: 'periodoId',
        original: periodoOriginal,
        normalizado: periodoCanonico
      });
    }

    if (carreraOriginal && carreraFirebase && carreraOriginal !== carreraFirebase) {
      if (doc.carrera !== undefined) payload.carrera = carreraFirebase;
      if (doc.nombreCarrera !== undefined) payload.nombreCarrera = carreraFirebase;

      cambios.push({
        campo: 'carrera',
        original: carreraOriginal,
        normalizado: carreraFirebase
      });
    }

    if (!cambios.length) return null;

    payload.normalizadoEn = ahoraIso();
    payload.actualizadoEn = ahoraIso();

    return {
      payload: payload,
      normalizacion: {
        entidad: 'titulos',
        campo: cambios.map(function (c) { return c.campo; }).join(', '),
        valorOriginal: cambios.map(function (c) { return c.original; }).join(' | '),
        valorNormalizado: cambios.map(function (c) { return c.normalizado; }).join(' | '),
        accion: 'NORMALIZAR_FIREBASE',
        estado: 'APLICADO',
        observacion: 'Normalización automática desde administrador',
        idRegistro: 'norm_tit_' + (doc._docId || doc.id || Date.now()) + '_' + Date.now()
      }
    };
  }

  function registrarNormalizacionesEnSheets(appConfig, normalizaciones) {
    if (!appConfig || appConfig.sheetsActivo !== true || !appConfig.sheetsWebAppUrl || !normalizaciones.length) {
      return Promise.resolve(false);
    }

    var envios = normalizaciones.map(function (item) {
      return enviarAppsScript(appConfig.sheetsWebAppUrl, {
        token: appConfig.sheetsToken || '',
        tipo: config.respaldo.tipos.normalizacion,
        origen: appConfig.sheetsOrigen || 'titulos-app',
        fechaCliente: ahoraIso(),
        idRegistro: item.idRegistro,
        datos: Object.assign({}, item, {
          fecha: ahoraIso(),
          prueba: false
        })
      }).catch(function () {
        return null;
      });
    });

    return Promise.all(envios);
  }

  function enviarAppsScript(url, body) {
    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(body),
      redirect: 'follow'
    }).then(function (response) {
      return response.text().then(function (text) {
        try {
          return text ? JSON.parse(text) : {};
        } catch (error) {
          return {
            ok: false,
            error: 'Respuesta no válida de Apps Script'
          };
        }
      });
    });
  }

  function fusionarEstudianteTitulo(estudiante, titulo) {
    var tieneTitulo = tituloActivo(titulo);
    var estado = tieneTitulo ? clasificarEstadoTitulo(titulo) : config.estadosTitulo.sinEnviar;

    return Object.assign({}, estudiante, {
      titulo: tieneTitulo ? titulo : null,
      tituloId: tieneTitulo ? titulo.id : '',
      estado: estado,
      estadoRaw: titulo && titulo.estado ? titulo.estado : '',
      telegram: tieneTitulo ? (titulo.telegramUser || titulo.contacto && titulo.contacto.telegram || '') : '',
      telegramUser: tieneTitulo ? (titulo.telegramUser || titulo.contacto && titulo.contacto.telegram || '') : '',
      tituloPreferidoTexto: tieneTitulo ? titulo.tituloPreferidoTexto : '',
      tituloPreferidoNumero: tieneTitulo ? titulo.tituloPreferidoNumero : '',
      titulosEnviados: tieneTitulo ? titulo.titulosEnviados || [] : [],
      actualizadoEn: tieneTitulo ? titulo.actualizadoEn || titulo.actualizadoEnLocal || '' : ''
    });
  }

  function clasificarEstadoTitulo(titulo) {
    var estado = normalizarTexto(titulo && (titulo.estadoRevision || titulo.estadoCoordinador || titulo.estado));

    if (estado === 'APROBADO') return config.estadosTitulo.aprobado;
    if (estado === 'DEVUELTO') return config.estadosTitulo.devuelto;
    if (estado === 'BORRADOR_REINICIADO' || estado === 'ARCHIVADO') return config.estadosTitulo.sinEnviar;

    return config.estadosTitulo.pendiente;
  }

  function tituloActivo(titulo) {
    if (!titulo) return false;

    var estado = normalizarTexto(titulo.estado);

    if (estado === 'ARCHIVADO' || estado === 'BORRADOR_REINICIADO') return false;

    return Array.isArray(titulo.titulosEnviados) && titulo.titulosEnviados.length > 0;
  }

  function construirMapaTitulos(titulos) {
    var mapa = {};

    titulos.forEach(function (titulo) {
      var claves = construirClavesTitulo(titulo.cedula || titulo.numeroIdentificacion, titulo.periodoId);

      claves.forEach(function (key) {
        if (!mapa[key] || compararTitulo(titulo, mapa[key]) > 0) {
          mapa[key] = titulo;
        }
      });
    });

    return mapa;
  }

  function compararTitulo(a, b) {
    var scoreA = scoreTitulo(a);
    var scoreB = scoreTitulo(b);

    if (scoreA !== scoreB) return scoreA - scoreB;

    return fechaNumero(a.actualizadoEn || a.createdAt) - fechaNumero(b.actualizadoEn || b.createdAt);
  }

  function scoreTitulo(titulo) {
    var score = 0;

    if (tituloActivo(titulo)) score += 1000;
    if (titulo && titulo.tituloPreferidoTexto) score += 50;
    if (titulo && titulo.estado) score += 10;

    return score;
  }

  function buscarTituloParaEstudiante(mapa, cedula, periodoId) {
    var claves = construirClavesTitulo(cedula, periodoId);

    for (var i = 0; i < claves.length; i += 1) {
      if (mapa[claves[i]]) return mapa[claves[i]];
    }

    return null;
  }

  function construirClavesTitulo(cedula, periodoId) {
    var variantes = construirVariantesCedula(cedula);
    var periodoCanonico = normalizarPeriodoIdCanonico(periodoId);
    var keys = [];

    variantes.forEach(function (item) {
      keys.push(String(periodoCanonico || 'SIN_PERIODO') + '__' + item);
    });

    return keys;
  }

  function normalizarEstudiante(data) {
    var source = normalizarObjeto(data || {});
    var cedula = normalizarCedula(valor(source, ['cedula', 'numeroidentificacion', 'id']) || data.id);
    var carreraOriginal = limpiarTexto(valor(source, ['nombrecarrera', 'carrera']));
    var carreraVista = normalizarCarreraVista(carreraOriginal);
    var periodoOriginal = valor(source, ['periodoid', 'ultimoperiodoid', 'periodo']);
    var periodoId = normalizarPeriodoIdCanonico(periodoOriginal);
    var periodoLabel = limpiarTexto(valor(source, ['periodolabel', 'periodonombre'])) || formatearPeriodoId(periodoId);

    return {
      id: data.id || data._docId || cedula,
      _docId: data._docId || data.id || cedula,
      cedula: cedula,
      numeroIdentificacion: cedula,
      nombres: limpiarTexto(valor(source, ['nombres', 'nombre', 'nombrecompleto'])) || 'Sin nombre',
      carrera: carreraVista,
      carreraOriginal: carreraOriginal || 'Sin carrera',
      nombreCarrera: carreraVista,
      codigoCarrera: limpiarTexto(valor(source, ['codigocarrera'])),
      periodoId: periodoId,
      periodoIdOriginal: limpiarTexto(periodoOriginal),
      periodoLabel: periodoLabel || 'Sin período',
      estadoMatricula: limpiarTexto(valor(source, ['estadomatricula', 'estado'])) || 'ACTIVO',
      sinCarrera: normalizarTexto(carreraVista) === 'SIN CARRERA',
      raw: data
    };
  }

  function normalizarTitulo(data) {
    var carreraOriginal = limpiarTexto(data.carrera || data.nombreCarrera || '');
    var periodoId = normalizarPeriodoIdCanonico(data.periodoId || '');

    return Object.assign({}, data, {
      id: data.id || data._docId || '',
      _docId: data._docId || data.id || '',
      cedula: normalizarCedula(data.cedula || data.numeroIdentificacion || ''),
      periodoId: periodoId,
      periodoLabel: limpiarTexto(data.periodoLabel || '') || formatearPeriodoId(periodoId || ''),
      carrera: normalizarCarreraVista(carreraOriginal),
      carreraOriginal: carreraOriginal
    });
  }

  function normalizarCoordinador(data) {
    var carreras = Array.isArray(data.carreras) ? data.carreras.map(normalizarCarreraVista) : [];
    var carrerasAsignadas = Array.isArray(data.carrerasAsignadas) ? data.carrerasAsignadas.map(function (item) {
      return {
        codigoCarrera: item.codigoCarrera || '',
        nombreCarrera: normalizarCarreraVista(item.nombreCarrera || item)
      };
    }) : [];

    return {
      id: data.id || data._docId || '',
      _docId: data._docId || data.id || '',
      nombre: limpiarTexto(data.nombre || data.Nombres || data.id || ''),
      activo: data.activo !== false,
      telegram: limpiarTexto(data.telegram || data.Telegram || data.contactoTelegram || ''),
      contactoTelegram: limpiarTexto(data.contactoTelegram || data.telegram || data.Telegram || ''),
      carreras: limpiarUnicos(carreras),
      carrerasAsignadas: limpiarCarrerasAsignadas(carrerasAsignadas),
      raw: data
    };
  }

  function deduplicarEstudiantesBasico(estudiantes) {
    var mapa = {};
    var cedulasConPeriodo = {};

    estudiantes.forEach(function (item) {
      if (item.cedula && item.periodoId) {
        cedulasConPeriodo[item.cedula] = true;
      }
    });

    estudiantes.forEach(function (item) {
      if (item.cedula && !item.periodoId && cedulasConPeriodo[item.cedula]) return;

      var key = item.cedula + '__' + (item.periodoId || 'SIN_PERIODO');
      var actual = mapa[key];

      if (!actual || scoreEstudiante(item) > scoreEstudiante(actual)) {
        mapa[key] = item;
      }
    });

    return Object.keys(mapa).map(function (key) {
      return mapa[key];
    });
  }

  function deduplicarEstudiantesFusionados(estudiantes) {
    var mapa = {};
    var cedulasConPeriodo = {};

    estudiantes.forEach(function (item) {
      if (item.cedula && item.periodoId) {
        cedulasConPeriodo[item.cedula] = true;
      }
    });

    estudiantes.forEach(function (item) {
      if (item.cedula && !item.periodoId && cedulasConPeriodo[item.cedula]) return;

      var key = item.cedula + '__' + (item.periodoId || 'SIN_PERIODO');
      var actual = mapa[key];

      if (!actual || scoreEstudianteFusionado(item) > scoreEstudianteFusionado(actual)) {
        mapa[key] = item;
      }
    });

    return Object.keys(mapa).map(function (key) {
      return mapa[key];
    });
  }

  function scoreEstudiante(item) {
    var score = 0;

    if (item.periodoId) score += 100;
    if (item.carrera && item.carrera !== 'Sin carrera') score += 80;
    if (item.nombres && item.nombres !== 'Sin nombre') score += 40;
    if (item.cedula) score += 20;

    return score;
  }

  function scoreEstudianteFusionado(item) {
    var score = scoreEstudiante(item);

    if (item.titulo) score += 1000;
    if (item.estado === config.estadosTitulo.aprobado) score += 300;
    if (item.estado === config.estadosTitulo.devuelto) score += 200;
    if (item.estado === config.estadosTitulo.pendiente) score += 100;

    return score;
  }

  function listarColeccion(nombre) {
    if (firebaseService && firebaseService.listarColeccion) {
      return firebaseService.listarColeccion(nombre).then(normalizarListaDocumentos);
    }

    if (firebaseService && firebaseService.obtenerColeccion) {
      return firebaseService.obtenerColeccion(nombre).then(normalizarListaDocumentos);
    }

    if (window.firebase && window.firebase.firestore) {
      return window.firebase.firestore().collection(nombre).get().then(function (snapshot) {
        return snapshot.docs.map(function (doc) {
          return Object.assign({ id: doc.id, _docId: doc.id }, doc.data() || {});
        });
      });
    }

    return Promise.reject(new Error('No se pudo listar la colección ' + nombre + '.'));
  }

  function leerDocumento(coleccion, id) {
    if (firebaseService && firebaseService.leerDocumento) {
      return firebaseService.leerDocumento(coleccion, id);
    }

    if (window.firebase && window.firebase.firestore) {
      return window.firebase.firestore().collection(coleccion).doc(id).get().then(function (doc) {
        if (!doc.exists) return null;
        return Object.assign({ id: doc.id, _docId: doc.id }, doc.data() || {});
      });
    }

    return Promise.reject(new Error('No se pudo leer el documento.'));
  }

  function guardarDocumento(coleccion, id, data, merge) {
    if (firebaseService && firebaseService.guardarDocumento) {
      return firebaseService.guardarDocumento(coleccion, id, data, merge);
    }

    if (window.firebase && window.firebase.firestore) {
      return window.firebase.firestore().collection(coleccion).doc(id).set(data, { merge: Boolean(merge) });
    }

    return Promise.reject(new Error('No se pudo guardar el documento.'));
  }

  function actualizarDocumento(coleccion, id, data) {
    if (!id) return Promise.resolve(false);

    if (firebaseService && firebaseService.actualizarDocumento) {
      return firebaseService.actualizarDocumento(coleccion, id, data);
    }

    if (window.firebase && window.firebase.firestore) {
      return window.firebase.firestore().collection(coleccion).doc(id).set(data, { merge: true });
    }

    return Promise.reject(new Error('No se pudo actualizar el documento.'));
  }

  function normalizarListaDocumentos(lista) {
    if (!Array.isArray(lista)) return [];

    return lista.map(function (item) {
      return Object.assign({}, item, {
        id: item.id || item._docId || '',
        _docId: item._docId || item.id || ''
      });
    });
  }

  function agregarPeriodoMapa(mapa, periodoId, label, origen) {
    var id = normalizarPeriodoIdCanonico(periodoId);

    if (!id) return;

    if (!mapa[id]) {
      mapa[id] = {
        id: id,
        label: limpiarTexto(label) || formatearPeriodoId(id),
        origen: origen || 'detectado',
        activo: false
      };
      return;
    }

    if (!mapa[id].label && label) {
      mapa[id].label = limpiarTexto(label);
    }

    if (mapa[id].origen.indexOf(origen) === -1) {
      mapa[id].origen += ', ' + origen;
    }
  }

  function agregarPeriodoMapaDesdeObjeto(mapa, periodo, origen) {
    if (!periodo || typeof periodo !== 'object') return;
    agregarPeriodoMapa(mapa, periodo.id || periodo.periodoId, periodo.label || periodo.periodoLabel, origen);
  }

  function normalizarPeriodoIdCanonico(periodoId) {
    var texto = limpiarTexto(periodoId);

    if (!texto || texto === '[object Object]') return '';

    var match = texto.match(/(\d{4})[-_](\d{1,2})\D+(\d{4})[-_](\d{1,2})/);

    if (!match) return texto;

    return match[1] + '-' + completarMes(match[2]) + '__' + match[3] + '-' + completarMes(match[4]);
  }

  function formatearPeriodoId(periodoId) {
    var texto = normalizarPeriodoIdCanonico(periodoId);

    if (!texto) return 'Sin período';

    var match = texto.match(/(\d{4})-(\d{2})__(\d{4})-(\d{2})/);

    if (!match) return texto;

    return nombreMes(match[2]) + ' ' + match[1] + ' a ' + nombreMes(match[4]) + ' ' + match[3];
  }

  function nombreMes(mes) {
    var mapa = {
      '01': 'Enero',
      '02': 'Febrero',
      '03': 'Marzo',
      '04': 'Abril',
      '05': 'Mayo',
      '06': 'Junio',
      '07': 'Julio',
      '08': 'Agosto',
      '09': 'Septiembre',
      '10': 'Octubre',
      '11': 'Noviembre',
      '12': 'Diciembre'
    };

    return mapa[String(mes)] || String(mes);
  }

  function completarMes(mes) {
    var numero = String(mes || '').replace(/\D/g, '');
    if (numero.length === 1) return '0' + numero;
    return numero;
  }

  function normalizarPeriodoId(periodoId) {
    return limpiarTexto(periodoId).replace(/[^0-9A-Za-z]+/g, '_').replace(/^_+|_+$/g, '');
  }

  function normalizarCarreraVista(value) {
    var original = limpiarTexto(value);

    if (!original) return 'Sin carrera';

    var upper = limpiarMojibake(original).toUpperCase();
    var key = normalizarTexto(upper);

    if (key === 'INDUS') return 'INDUSTRIAL';
    if (key === 'SIN CARRERA') return 'Sin carrera';

    if (key.indexOf('UNIVERSITARIA EN') === 0) {
      return corregirUniversitaria(upper);
    }

    if (config.normalizacion && config.normalizacion.agruparOnlineVista === true) {
      upper = upper.replace(/\s+ONLINE$/i, '');
      key = normalizarTexto(upper);
    }

    var alias = {
      'ADMINISTRACION': 'ADMINISTRACION',
      'CONTABILIDAD': 'CONTABILIDAD',
      'DESARROLLO DE SOFTWARE': 'DESARROLLO DE SOFTWARE',
      'DISENO MULTIMEDIA': 'DISEÑO MULTIMEDIA',
      'EDUCACION BASICA': 'EDUCACIÓN BÁSICA',
      'EDUCACION INICIAL': 'EDUCACION INICIAL',
      'ENFERMERIA': 'ENFERMERÍA',
      'ESTETICA INTEGRAL': 'ESTÉTICA INTEGRAL',
      'GASTRONOMIA': 'GASTRONOMIA',
      'GESTION DEL TALENTO HUMANO': 'GESTION DEL TALENTO HUMANO',
      'INDUSTRIAL': 'INDUSTRIAL',
      'MARKETING': 'MARKETING',
      'MARKETING DIGITAL Y COMERCIO ELECTRONICO': 'MARKETING DIGITAL Y COMERCIO ELECTRONICO',
      'MECANICA AUTOMOTRIZ': 'MECÁNICA AUTOMOTRIZ',
      'PROCESAMIENTO EN ALIMENTOS': 'PROCESAMIENTO EN ALIMENTOS',
      'REDES Y TELECOMUNICACIONES': 'REDES Y TELECOMUNICACIONES',
      'SEGURIDAD CIUDADANA Y ORDEN PUBLICO': 'SEGURIDAD CIUDADANA Y ORDEN PÚBLICO',
      'SEGURIDAD Y PREVENCION DE RIESGOS LABORALES': 'SEGURIDAD Y PREVENCIÓN DE RIESGOS LABORALES',
      'VENTAS': 'VENTAS'
    };

    return alias[key] || upper;
  }

  function normalizarCarreraFirebase(value) {
    var original = limpiarTexto(value);

    if (!original) return '';

    var limpio = limpiarMojibake(original);
    var key = normalizarTexto(limpio);

    if (key === 'INDUS') return 'INDUSTRIAL';
    if (key === 'EDUCACION BASICA') return 'EDUCACIÓN BÁSICA';
    if (key === 'ENFERMERIA') return 'ENFERMERÍA';
    if (key === 'SEGURIDAD CIUDADANA Y ORDEN PUBLICO ONLINE') return 'SEGURIDAD CIUDADANA Y ORDEN PÚBLICO ONLINE';

    return limpio.toUpperCase();
  }

  function corregirUniversitaria(value) {
    return limpiarMojibake(value)
      .replace(/EDUACIÓN/gi, 'EDUCACIÓN')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();
  }

  function limpiarMojibake(value) {
    return limpiarTexto(value)
      .replace(/ӎ/g, 'ON')
      .replace(/́/g, 'ÍA')
      .replace(/ڂ/g, 'Ú')
      .replace(/EDUCACION BSICA/gi, 'EDUCACION BASICA')
      .replace(/EDUCACI[OÓ]N BSICA/gi, 'EDUCACIÓN BÁSICA')
      .replace(/ENFERMERIA/g, 'ENFERMERÍA')
      .replace(/ENFERMERÍAÍA/g, 'ENFERMERÍA')
      .replace(/PÚLICO/gi, 'PÚBLICO')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function limpiarCarrerasAsignadas(lista) {
    var mapa = {};

    (lista || []).forEach(function (item) {
      var nombre = normalizarCarreraVista(item.nombreCarrera || item);
      var key = normalizarTexto(nombre);

      if (!key || key === 'SIN CARRERA') return;

      mapa[key] = {
        codigoCarrera: item.codigoCarrera || '',
        nombreCarrera: nombre
      };
    });

    return Object.keys(mapa).map(function (key) {
      return mapa[key];
    });
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
      if (source[keys[i]] !== undefined && source[keys[i]] !== null && String(source[keys[i]]).trim() !== '') {
        return String(source[keys[i]]).trim();
      }
    }

    return '';
  }

  function construirSetCanonicamente(lista) {
    var set = {};

    (lista || []).forEach(function (item) {
      var canonico = normalizarPeriodoIdCanonico(item);
      if (canonico) set[canonico] = true;
    });

    return set;
  }

  function buscarPorId(lista, id) {
    for (var i = 0; i < lista.length; i += 1) {
      if (lista[i].id === id) return lista[i];
    }

    return null;
  }

  function construirVariantesCedula(cedula) {
    var limpia = limpiarNumeros(cedula);
    var variantes = [];

    agregarUnico(variantes, limpia);

    if (limpia.length === 9) agregarUnico(variantes, '0' + limpia);
    if (limpia.length === 10 && limpia.charAt(0) === '0') agregarUnico(variantes, limpia.slice(1));

    return variantes;
  }

  function normalizarCedula(cedula) {
    var limpia = limpiarNumeros(cedula);
    if (limpia.length === 9) return '0' + limpia;
    return limpia;
  }

  function limpiarUnicos(lista) {
    var salida = [];

    (lista || []).forEach(function (item) {
      var limpio = limpiarTexto(item);
      if (limpio && salida.indexOf(limpio) === -1) salida.push(limpio);
    });

    return salida;
  }

  function agregarUnico(lista, valor) {
    if (!valor) return;
    if (lista.indexOf(valor) === -1) lista.push(valor);
  }

  function generarIdDesdeNombre(nombre) {
    return String(nombre || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  function limpiarTexto(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function limpiarNumeros(value) {
    return String(value || '').replace(/\D/g, '');
  }

  function normalizarTexto(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();
  }

  function fechaNumero(value) {
    var time = new Date(value || 0).getTime();
    return Number.isFinite(time) ? time : 0;
  }

  function ahoraIso() {
    return new Date().toISOString();
  }

  window.TAAdministradorRepository = Object.freeze({
    iniciarFirebase: iniciarFirebase,
    cargarAppConfig: cargarAppConfig,
    guardarAppConfig: guardarAppConfig,
    listarEstudiantes: listarEstudiantes,
    listarTitulos: listarTitulos,
    listarCoordinadores: listarCoordinadores,
    listarPeriodos: listarPeriodos,
    actualizarPeriodosActivos: actualizarPeriodosActivos,
    cambiarEstadoPeriodo: cambiarEstadoPeriodo,
    obtenerCarreras: obtenerCarreras,
    crearCoordinador: crearCoordinador,
    eliminarCoordinador: eliminarCoordinador,
    asignarCarreraACoordinador: asignarCarreraACoordinador,
    listarEstudiantesConTitulos: listarEstudiantesConTitulos,
    obtenerDetalleEstudiante: obtenerDetalleEstudiante,
    archivarIntento: archivarIntento,
    clasificarEstadoTitulo: clasificarEstadoTitulo,
    formatearPeriodoId: formatearPeriodoId,
    normalizarPeriodoIdCanonico: normalizarPeriodoIdCanonico,
    normalizarCarreraVista: normalizarCarreraVista,
    normalizarDatosAutomaticamente: normalizarDatosAutomaticamente,
    normalizarTexto: normalizarTexto
  });
})();