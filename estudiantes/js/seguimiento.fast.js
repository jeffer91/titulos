/*
  Consulta rápida para el módulo estudiantes.
  Mantiene fuera del camino crítico las versiones y workflow_events:
  1) consulta estudiante + matrícula + envío actual;
  2) muestra la pantalla inmediatamente;
  3) carga historial en segundo plano y actualiza la vista sin bloquear.
*/
(function () {
  'use strict';

  var repositoryBase = window.TAEstudianteRepository;
  var recomendacionesBase = window.TAEstudianteRecomendacionesController;
  var seguimientoService = window.TAEstudianteSeguimiento;

  if (!repositoryBase || !recomendacionesBase || !seguimientoService || repositoryBase.__consultaRapida) {
    return;
  }

  var CACHE_TTL_MS = 120000;
  var TIMEOUT_ACADEMICO_MS = 6500;
  var TIMEOUT_TITULO_MS = 5000;
  var TIMEOUT_HISTORIAL_MS = 9000;
  var cache = Object.create(null);
  var ultimoResultado = null;
  var historialToken = 0;

  instalarRepositorioRapido();
  instalarRecomendacionesRapidas();

  function instalarRepositorioRapido() {
    var copia = copiarObjeto(repositoryBase);

    copia.consultarEstudianteCompleto = function (cedula) {
      var clave = soloNumeros(cedula);
      var cached = cache[clave];
      var appConfig = null;
      var estudiante = null;

      ultimoResultado = null;
      historialToken += 1;

      if (cached && (Date.now() - cached.guardadoEn) < CACHE_TTL_MS) {
        ultimoResultado = cached.resultado && cached.resultado.envioExistente ? cached.resultado : null;
        return Promise.resolve({ ok: true, data: clonarResultado(cached.resultado), mensaje: '' });
      }

      return conTimeout(
        repositoryBase.cargarConfiguracionApp(),
        4500,
        'La configuración de titulación está tardando demasiado.'
      )
        .then(function (config) {
          appConfig = config || {};
          return conTimeout(
            repositoryBase.buscarEstudiantePorCedula(cedula, appConfig),
            TIMEOUT_ACADEMICO_MS,
            'La consulta académica está tardando demasiado. Intenta nuevamente.'
          );
        })
        .then(function (dataEstudiante) {
          estudiante = dataEstudiante;

          if (!estudiante) {
            return null;
          }

          return conTimeout(
            repositoryBase.consultarEnvio(estudiante.periodoId, estudiante.cedula || cedula),
            TIMEOUT_TITULO_MS,
            'Se encontró al estudiante, pero el estado del título está tardando demasiado. Intenta nuevamente.'
          );
        })
        .then(function (envio) {
          var resultado;

          if (!estudiante) {
            return {
              ok: false,
              data: null,
              mensaje: 'No se encontró un estudiante con esa cédula.'
            };
          }

          if (envio) {
            normalizarEstadoHistorico(envio);
            resultado = construirResultadoSeguimiento(estudiante, appConfig, envio);
            ultimoResultado = resultado;
          } else {
            resultado = construirResultadoNuevo(estudiante, appConfig);
          }

          cache[clave] = {
            guardadoEn: Date.now(),
            resultado: clonarResultado(resultado)
          };

          return {
            ok: true,
            data: resultado,
            mensaje: ''
          };
        });
    };

    copia.invalidarCacheConsulta = function (cedula) {
      var clave = soloNumeros(cedula);
      if (clave) delete cache[clave];
      else cache = Object.create(null);
    };

    copia.__consultaRapida = true;
    window.TAEstudianteRepository = Object.freeze(copia);
  }

  function instalarRecomendacionesRapidas() {
    var copia = copiarObjeto(recomendacionesBase);

    copia.mostrarModalRecomendaciones = function (opciones) {
      if (ultimoResultado && ultimoResultado.envioExistente && !(opciones && opciones.forzarFormulario)) {
        mostrarSeguimientoInmediato(ultimoResultado);
        return true;
      }

      return recomendacionesBase.mostrarModalRecomendaciones(opciones);
    };

    copia.cerrarRecomendaciones = function (opciones) {
      if (ultimoResultado && ultimoResultado.envioExistente && !(opciones && opciones.forzarFormulario)) {
        mostrarSeguimientoInmediato(ultimoResultado);
        return true;
      }

      return recomendacionesBase.cerrarRecomendaciones(opciones);
    };

    copia.reiniciar = function () {
      ultimoResultado = null;
      historialToken += 1;
      if (typeof recomendacionesBase.reiniciar === 'function') {
        recomendacionesBase.reiniciar();
      }
    };

    window.TAEstudianteRecomendacionesController = Object.freeze(copia);
  }

  function construirResultadoSeguimiento(estudiante, appConfig, envio) {
    return {
      estudiante: estudiante,
      appConfig: appConfig || {},
      envioExistente: envio,
      seguimiento: {
        envio: envio,
        estudiante: estudiante,
        versiones: [],
        eventos: [],
        historialProceso: Array.isArray(envio.historialProceso) ? envio.historialProceso.slice() : []
      },
      modoConsulta: 'SEGUIMIENTO',
      historialCargando: true
    };
  }

  function construirResultadoNuevo(estudiante, appConfig) {
    var procesoActivo = !(appConfig && appConfig.procesoActivo === false);
    var matriculaActiva = normalizar(estudiante.estadoMatricula || 'ACTIVO') === 'ACTIVO';

    if (!procesoActivo) {
      throw new Error('El proceso de registro de títulos no está activo.');
    }

    if (!estudiante.periodoId) {
      throw new Error('No se encontró una matrícula activa para el período de titulación. Comunícate con coordinación.');
    }

    if (!matriculaActiva) {
      throw new Error('Tu matrícula no consta como ACTIVO. Comunícate con coordinación.');
    }

    if (estudiante.puedeEnviarTitulo === false) {
      throw new Error('Tu registro no está habilitado para enviar títulos. Comunícate con coordinación.');
    }

    return {
      estudiante: estudiante,
      appConfig: appConfig || {},
      envioExistente: null,
      intentosUsados: 0,
      maxIntentos: Number((appConfig && appConfig.maxIntentos) || 1),
      intentosDisponibles: Number((appConfig && appConfig.maxIntentos) || 1)
    };
  }

  function mostrarSeguimientoInmediato(resultado) {
    var token = ++historialToken;

    seguimientoService.mostrar(resultado);
    marcarHistorialCargando();

    window.setTimeout(function () {
      cargarHistorialEnSegundoPlano(resultado, token);
    }, 0);
  }

  function cargarHistorialEnSegundoPlano(resultado, token) {
    if (!resultado || !resultado.envioExistente || !seguimientoService || typeof seguimientoService.cargar !== 'function') {
      return;
    }

    conTimeout(
      seguimientoService.cargar(resultado.envioExistente, resultado.estudiante),
      TIMEOUT_HISTORIAL_MS,
      'El historial tardó demasiado.'
    )
      .then(function (seguimiento) {
        if (token !== historialToken || !seguimiento) return;

        resultado.seguimiento = seguimiento;
        resultado.historialCargando = false;
        ultimoResultado = resultado;

        refrescarSeguimientoSinSalto(resultado);
      })
      .catch(function (error) {
        if (token !== historialToken) return;
        console.warn('[Estudiantes] El historial no bloqueó la consulta principal:', error);
        marcarHistorialNoDisponible();
      });
  }

  function refrescarSeguimientoSinSalto(resultado) {
    var scrollY = window.scrollY || document.documentElement.scrollTop || 0;
    seguimientoService.mostrar(resultado);

    window.setTimeout(function () {
      try {
        window.scrollTo({ top: scrollY, behavior: 'auto' });
      } catch (error) {
        window.scrollTo(0, scrollY);
      }
    }, 140);
  }

  function marcarHistorialCargando() {
    var section = buscarSeccionHistorial();
    if (!section) return;

    var empty = section.querySelector('.seguimiento-empty');
    if (empty) {
      empty.innerHTML = '<span class="ta-history-spinner" aria-hidden="true"></span> Cargando historial en segundo plano…';
    }
  }

  function marcarHistorialNoDisponible() {
    var section = buscarSeccionHistorial();
    if (!section) return;

    var empty = section.querySelector('.seguimiento-empty');
    if (empty) {
      empty.textContent = 'El estado actual está disponible. El historial no respondió a tiempo; puedes continuar normalmente.';
    }
  }

  function buscarSeccionHistorial() {
    var panel = document.querySelector('#seguimientoTituloPanel');
    if (!panel) return null;

    var sections = panel.querySelectorAll('.seguimiento-section');
    for (var i = 0; i < sections.length; i += 1) {
      if (String(sections[i].textContent || '').indexOf('Versiones y movimientos anteriores') !== -1) {
        return sections[i];
      }
    }
    return null;
  }

  function normalizarEstadoHistorico(envio) {
    var estado = normalizar(envio.estado || envio.estadoProceso || '');
    var proceso = normalizar(envio.estadoProceso || '');
    var resultadoCoord = normalizar(envio.resultadoCoordinador || '');
    var resultadoInv = normalizar(envio.resultadoInvestigacion || '');
    var estadoCoord = normalizar(envio.estadoCoordinador || '');
    var estadoInv = normalizar(envio.estadoInvestigador || '');

    var coordinacionAprobada =
      estado === 'APROBADO' ||
      estado === 'PENDIENTE_INVESTIGADOR' ||
      proceso === 'PENDIENTE_INVESTIGADOR' ||
      estado === 'APROBADO_FINAL' ||
      proceso === 'APROBADO_FINAL' ||
      estadoCoord === 'VALIDADO' ||
      estadoCoord === 'APROBADO' ||
      resultadoCoord.indexOf('APROBADO') === 0 ||
      envio.validadoCoordinador === true ||
      envio.validadoCoordinacion === true;

    var investigacionAprobada =
      estado === 'APROBADO_FINAL' ||
      proceso === 'APROBADO_FINAL' ||
      estadoInv === 'APROBADO' ||
      estadoInv === 'APROBADO_CON_OBSERVACION' ||
      resultadoInv.indexOf('APROBADO') === 0 ||
      Boolean(limpiar(envio.tituloFinalInvestigacion || envio.tituloFinal));

    if (coordinacionAprobada) {
      envio.validadoCoordinador = true;
      envio.validadoCoordinacion = true;
      if (!estadoCoord) envio.estadoCoordinador = 'VALIDADO';
    }

    if (investigacionAprobada) {
      envio.investigacionRevisada = true;
      if (!estadoInv) {
        envio.estadoInvestigador = resultadoInv.indexOf('CORRECCION') !== -1 || resultadoInv.indexOf('OBSERV') !== -1
          ? 'APROBADO_CON_OBSERVACION'
          : 'APROBADO';
      }
      envio.estado = 'APROBADO_FINAL';
      envio.estadoProceso = 'APROBADO_FINAL';
    }

    if (resultadoCoord === 'DEVUELTO' && !estadoCoord) {
      envio.estadoCoordinador = 'DEVUELTO';
      if (!envio.devueltoPor) envio.devueltoPor = 'COORDINADOR';
    }

    if (resultadoInv === 'DEVUELTO' && !estadoInv) {
      envio.estadoInvestigador = 'DEVUELTO';
      if (!envio.devueltoPor) envio.devueltoPor = 'INVESTIGACION';
    }
  }

  function conTimeout(promesa, ms, mensaje) {
    var timer;

    return Promise.race([
      Promise.resolve(promesa),
      new Promise(function (_, reject) {
        timer = window.setTimeout(function () {
          reject(new Error(mensaje || 'La consulta tardó demasiado. Intenta nuevamente.'));
        }, ms);
      })
    ]).finally(function () {
      if (timer) window.clearTimeout(timer);
    });
  }

  function clonarResultado(resultado) {
    if (!resultado) return resultado;
    return Object.assign({}, resultado, {
      estudiante: resultado.estudiante ? Object.assign({}, resultado.estudiante) : resultado.estudiante,
      appConfig: resultado.appConfig ? Object.assign({}, resultado.appConfig) : resultado.appConfig,
      envioExistente: resultado.envioExistente ? Object.assign({}, resultado.envioExistente) : resultado.envioExistente,
      seguimiento: resultado.seguimiento ? Object.assign({}, resultado.seguimiento) : resultado.seguimiento
    });
  }

  function copiarObjeto(objeto) {
    var copia = {};
    Object.keys(objeto || {}).forEach(function (key) { copia[key] = objeto[key]; });
    return copia;
  }

  function soloNumeros(valor) {
    return String(valor || '').replace(/\D/g, '');
  }

  function limpiar(valor) {
    return String(valor === undefined || valor === null ? '' : valor).replace(/\s+/g, ' ').trim();
  }

  function normalizar(valor) {
    return limpiar(valor)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '_')
      .toUpperCase();
  }

  window.TAEstudianteConsultaRapida = Object.freeze({
    ultimo: function () { return ultimoResultado; },
    limpiarCache: function () { cache = Object.create(null); }
  });
})();
