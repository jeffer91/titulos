/*
  Consulta de estudiantes por bloques secuenciales.

  BLOQUE 1: validar cédula.
  BLOQUE 2: consultar Firebase académica (estudiante + matrícula).
  BLOQUE 3: consultar Firebase de Títulos (envío actual).
  BLOQUE 4: mostrar seguimiento o continuar al formulario.

  Ningún bloque abre popup ni modifica el flujo de otro bloque.
*/
(function () {
  'use strict';

  var TIMEOUT_FIREBASE_MS = 4000;
  var TIMEOUT_CONFIG_MS = 1200;
  var TIMEOUT_ACADEMICO_MS = 5500;
  var TIMEOUT_HISTORIAL_MS = 4500;
  var TIMEOUT_TITULOS_MS = 8000;
  var consultaToken = 0;
  var diagnosticoRutasLive = [];
  var diagnosticoListenerConectado = false;
  var diagnosticoLentoTimer = null;
  var consultaInteractivaActiva = false;

  function manejarConsulta(event, opciones) {
    var ui = window.TAEstudianteUI;
    var validaciones = window.TAEstudianteValidaciones;
    var state = window.TAEstudianteState;
    var repository = window.TAEstudianteRepository;
    var inputCedula;
    var cedulaOriginal;
    var resultadoCedula;
    var button;
    var token;
    var contexto = {
      appConfig: null,
      estudiante: null,
      envio: null,
      diagnosticoTitulos: null,
      titulosConsultados: false
    };

    opciones = opciones || {};

    if (event && event.preventDefault) event.preventDefault();

    if (!ui || !validaciones || !state || !repository) {
      mostrarErrorDependencias();
      return Promise.resolve(null);
    }

    inputCedula = obtenerInputCedula();
    cedulaOriginal = inputCedula ? inputCedula.value : '';
    resultadoCedula = validaciones.validarCedulaBasica(cedulaOriginal);
    button = obtenerBotonConsulta(event);
    token = ++consultaToken;
    diagnosticoRutasLive = [];
    conectarDiagnosticoLive();

    if (window.TAEstudianteDiagnostico && typeof window.TAEstudianteDiagnostico.limpiar === 'function') {
      window.TAEstudianteDiagnostico.limpiar();
    }

    ui.clearFieldErrors();
    limpiarErrorCedula();

    if (!resultadoCedula.ok) {
      mostrarErrorCedula(resultadoCedula.mensaje || 'Revisa el número de identificación.');
      return Promise.resolve(null);
    }

    if (inputCedula) inputCedula.value = resultadoCedula.data;

    activarInterfazConsultaLibre();
    limpiarVistaAntesDeConsultar({ conservarCedula: resultadoCedula.data });
    prepararBloqueProceso();
    actualizarBloqueProceso(1, 'completado', 'Cédula validada', 'El número de identificación tiene un formato válido.');
    actualizarBloqueProceso(2, 'trabajando', 'Consultando datos académicos', 'Buscando estudiante y matrícula activa.');

    ui.setLoading(button, true, 'Consultando...');
    ui.showStatus('#consultaMensaje', '', 'info');

    return asegurarFirebase()
      .then(function () {
        if (token !== consultaToken) throw crearErrorCancelado();
        return cargarConfiguracionSegura(repository);
      })
      .then(function (appConfig) {
        if (token !== consultaToken) throw crearErrorCancelado();
        contexto.appConfig = appConfig;

        return conTimeout(
          repository.buscarEstudiantePorCedula(resultadoCedula.data, appConfig),
          TIMEOUT_ACADEMICO_MS,
          'La consulta académica está tardando demasiado. Intenta nuevamente.'
        );
      })
      .then(function (estudiante) {
        if (token !== consultaToken) throw crearErrorCancelado();

        if (!estudiante) {
          throw crearError('ESTUDIANTE_NO_ENCONTRADO', 'No se encontró un estudiante activo con esa cédula.');
        }

        contexto.estudiante = estudiante;
        actualizarBloqueProceso(2, 'completado', 'Datos académicos encontrados', resumenEstudiante(estudiante));
        actualizarBloqueProceso(3, 'trabajando', 'Consultando estado del título', 'Consultando tu envío en la base de Títulos para el período ' + (estudiante.periodoLabel || estudiante.periodoId || '') + '.');
        iniciarDiagnosticoPaso3(estudiante);

        /*
          Ruta normal: lectura exacta por periodo__cedula mediante Firestore SDK.
          El repository usa compatibilidad histórica únicamente si el documento
          canónico no existe o si hay un fallo transitorio del transporte.
        */
        return conTimeout(
          consultarEstadoTituloRapido(estudiante, repository),
          TIMEOUT_TITULOS_MS,
          'No pudimos completar la consulta del estado del título. Intenta nuevamente.'
        );
      })
      .then(function (resultadoTitulo) {
        var envio;

        if (token !== consultaToken) throw crearErrorCancelado();

        resultadoTitulo = resultadoTitulo || {};
        envio = resultadoTitulo.envio || null;
        contexto.envio = envio;
        contexto.diagnosticoTitulos = resultadoTitulo.diagnostico || null;
        contexto.titulosConsultados = true;

        actualizarBloqueProceso(
          3,
          'completado',
          envio ? 'Registro de título encontrado' : 'Sin envío previo',
          envio
            ? 'Se encontró el registro actualizado en titulos-ec2fa / envios.'
            : 'No se encontró un envío compatible para esta cédula y período.'
        );

        mostrarDiagnosticoTitulos(
          contexto.diagnosticoTitulos,
          contexto.estudiante,
          (contexto.estudiante && contexto.estudiante.cedula) || resultadoCedula.data,
          envio ? 'ENCONTRADO' : 'NO_ENCONTRADO'
        );

        actualizarBloqueProceso(
          4,
          'trabajando',
          'Preparando resultado',
          envio ? 'Mostrando seguimiento de titulación.' : 'Habilitando el siguiente bloque del proceso.'
        );

        return construirResultado(contexto);
      })
      .then(function (resultado) {
        if (token !== consultaToken) throw crearErrorCancelado();

        state.guardarResultadoConsulta(resultado);

        actualizarBloqueProceso(
          4,
          'completado',
          'Consulta completada',
          resultado.envioExistente ? 'Seguimiento disponible.' : 'Puedes continuar con el proceso de titulación.'
        );

        if (resultado.envioExistente) {
          /*
            Si ya existe un envío, no mostramos el Paso 2 como si fuera un registro nuevo.
            El destino correcto es siempre el seguimiento del título.
          */
          ui.hide('#seccionEstudiante');
          ui.hide('#formPropuestas');
          mostrarSeguimientoSinBloquear(resultado, token);
        } else {
          if (typeof ui.renderStudent === 'function') {
            ui.renderStudent(resultado.estudiante);
          }

          window.setTimeout(function () {
            /* Se mantiene visible el resumen de verificación para que el estudiante\n               pueda abrir el diagnóstico sin usar herramientas del navegador. */
            if (typeof opciones.onConsultaExitosa === 'function') opciones.onConsultaExitosa(resultado);
          }, 120);
        }

        return resultado;
      })
      .catch(function (error) {
        if (error && error.codigo === 'CONSULTA_CANCELADA') return null;

        enriquecerErrorConDiagnostico(error, contexto, resultadoCedula.data);
        console.error('[Estudiantes] Error en consulta por bloques:', error);
        state.reiniciarConsulta({ conservarFirebase: true });
        restaurarCedula(resultadoCedula.data);

        mostrarErrorProceso(
          obtenerMensajeError(error) || 'No se pudo completar la consulta.',
          determinarPasoError(contexto),
          error
        );

        if (determinarPasoError(contexto) === 3) {
          mostrarDiagnosticoTitulos(
            error && error.diagnostico || contexto.diagnosticoTitulos,
            contexto.estudiante,
            resultadoCedula.data,
            error && error.codigo || 'ERROR_CONSULTA',
            error
          );
        }

        return null;
      })
      .finally(function () {
        ui.setLoading(button, false);
        desactivarInterfazConsultaLibre();
      });
  }

  function consultarEstadoTituloRapido(estudiante, repository) {
    estudiante = estudiante || {};

    if (!repository || typeof repository.consultarEnvio !== 'function') {
      return Promise.reject(crearError(
        'REPOSITORY_TITULOS_NO_DISPONIBLE',
        'No se pudo iniciar la consulta del estado del título.'
      ));
    }

    return Promise.resolve(repository.consultarEnvio(
      estudiante.periodoId,
      estudiante.cedula || estudiante.numeroIdentificacion,
      estudiante
    ))
      .then(function (envio) {
        var diagnostico = envio && envio._consultaDiagnostico
          ? envio._consultaDiagnostico
          : (typeof repository.obtenerDiagnosticoEnvio === 'function'
            ? repository.obtenerDiagnosticoEnvio()
            : null);

        return {
          envio: envio || null,
          diagnostico: diagnostico || {
            motor: 'CONSULTA_CEDULA',
            estrategia: 'CEDULA_MAS_PERIODO',
            base: 'titulos-ec2fa',
            coleccion: 'envios',
            cedula: String(estudiante.cedula || ''),
            periodoCanonico: String(estudiante.periodoId || ''),
            ruta: 'TITULOS_CEDULA',
            status: envio ? 200 : 404,
            duracionMs: 0
          }
        };
      })
      .catch(function (error) {
        if (!error.codigo) error.codigo = 'CONSULTA_TITULOS_ERROR';

        error.diagnostico = Object.assign({
          motor: 'CONSULTA_CEDULA',
          estrategia: 'CEDULA_MAS_PERIODO',
          base: 'titulos-ec2fa',
          coleccion: 'envios',
          cedula: String(estudiante.cedula || ''),
          periodoCanonico: String(estudiante.periodoId || ''),
          ruta: 'TITULOS_CEDULA',
          duracionMs: 0
        }, error.diagnostico || {});

        throw error;
      });
  }

  function cargarConfiguracionSegura(repository) {
    var defaults = Object.assign({}, (window.TA_ESTUDIANTES_CONFIG && window.TA_ESTUDIANTES_CONFIG.defaultAppConfig) || {});

    if (!repository || typeof repository.cargarConfiguracionApp !== 'function') {
      return Promise.resolve(defaults);
    }

    return conTimeout(
      repository.cargarConfiguracionApp(),
      TIMEOUT_CONFIG_MS,
      'La configuración está tardando demasiado.'
    ).catch(function (error) {
      console.warn('[Estudiantes] Se usa configuración local para no bloquear la consulta:', error);
      defaults.origen = 'default-local-bloques';
      defaults.procesoActivo = defaults.procesoActivo !== false;
      return defaults;
    });
  }

  function construirResultado(contexto) {
    var estudiante = contexto.estudiante;
    var appConfig = contexto.appConfig || {};
    var envio = contexto.envio || null;

    if (!estudiante) throw crearError('ESTUDIANTE_INVALIDO', 'No se encontraron datos académicos válidos.');
    if (!estudiante.periodoId) throw crearError('PERIODO_NO_ENCONTRADO', 'No se encontró una matrícula activa para el período de titulación.');
    if (normalizar(estudiante.estadoMatricula || 'ACTIVO') !== 'ACTIVO') throw crearError('MATRICULA_INACTIVA', 'La matrícula no consta como ACTIVO.');

    if (envio) {
      return {
        estudiante: estudiante,
        appConfig: appConfig,
        envioExistente: envio,
        seguimiento: {
          envio: envio,
          estudiante: estudiante,
          versiones: [],
          eventos: [],
          historialProceso: Array.isArray(envio.historialProceso) ? envio.historialProceso.slice() : []
        },
        modoConsulta: 'SEGUIMIENTO'
      };
    }

    if (appConfig.procesoActivo === false) {
      throw crearError('PROCESO_INACTIVO', 'El proceso de registro de títulos no está activo.');
    }

    if (estudiante.puedeEnviarTitulo === false) {
      throw crearError('ENVIO_NO_HABILITADO', 'Tu registro no está habilitado para enviar títulos. Comunícate con coordinación.');
    }

    return {
      estudiante: estudiante,
      appConfig: appConfig,
      envioExistente: null,
      intentosUsados: 0,
      maxIntentos: Number(appConfig.maxIntentos || 1),
      intentosDisponibles: Number(appConfig.maxIntentos || 1),
      modoConsulta: 'NUEVO'
    };
  }

  function mostrarSeguimientoSinBloquear(resultado, token) {
    var seguimiento = window.TAEstudianteSeguimiento;

    if (!seguimiento || typeof seguimiento.mostrar !== 'function') {
      mostrarErrorProceso(
        'Se encontró tu registro, pero no se pudo abrir el seguimiento. Recarga la página.',
        4
      );
      return;
    }

    /*
      El seguimiento debe abrirse inmediatamente. Antes se esperaba con setTimeout,
      dejando visible el Paso 2 y permitiendo que el usuario quedara atrapado allí.
    */
    try {
      if (token !== consultaToken) return;
      ocultarBloqueProceso();
      seguimiento.mostrar(resultado);
    } catch (error) {
      console.error('[Estudiantes] No se pudo renderizar el seguimiento:', error);
      mostrarErrorProceso(
        'Se encontró tu registro, pero ocurrió un error al mostrar el seguimiento. Recarga la página.',
        4
      );
      return;
    }

    /* El historial se completa después y nunca bloquea la pantalla principal. */
    if (typeof seguimiento.cargar !== 'function') return;

    conTimeout(
      seguimiento.cargar(resultado.envioExistente, resultado.estudiante),
      TIMEOUT_HISTORIAL_MS,
      'El historial tardó demasiado.'
    ).then(function (data) {
      if (token !== consultaToken || !data) return;
      resultado.seguimiento = data;

      try {
        seguimiento.mostrar(resultado);
      } catch (error) {
        console.warn('[Estudiantes] El seguimiento ya está visible; se omitió el refresco del historial:', error);
      }
    }).catch(function (error) {
      console.warn('[Estudiantes] Historial omitido sin interrumpir el seguimiento:', error);
    });
  }

  function asegurarFirebase() {
    var config = window.TA_ESTUDIANTES_CONFIG;
    var firebaseService = window.TAEstudianteFirebaseService;
    var state = window.TAEstudianteState;

    if (!firebaseService || typeof firebaseService.iniciar !== 'function') {
      return Promise.reject(crearError('FIREBASE_NO_DISPONIBLE', 'El servicio Firebase no está cargado.'));
    }

    if (firebaseService.estaListo && firebaseService.estaListo()) {
      if (state && state.marcarFirebaseListo) state.marcarFirebaseListo(true);
      return Promise.resolve(true);
    }

    return conTimeout(
      firebaseService.iniciar(config && config.firebase),
      TIMEOUT_FIREBASE_MS,
      'La conexión con Firebase está tardando demasiado.'
    ).then(function (resultado) {
      if (resultado && resultado.ok === false) {
        throw crearError(resultado.codigo || 'FIREBASE_ERROR', resultado.mensaje || 'Firebase no pudo iniciar.');
      }
      if (state && state.marcarFirebaseListo) state.marcarFirebaseListo(true);
      return true;
    });
  }

  function limpiarCedulaMientrasEscribe() {
    var validaciones = window.TAEstudianteValidaciones;
    var input = obtenerInputCedula();

    if (!input || !validaciones || !validaciones.limpiarCedula) return;
    if (input.dataset.taCedulaLimpiaConectada === 'true') return;

    input.dataset.taCedulaLimpiaConectada = 'true';
    input.addEventListener('input', function () {
      var limpio = validaciones.limpiarCedula(input.value);
      if (input.value !== limpio) input.value = limpio;
      limpiarErrorCedula();
    });
  }

  function limpiarVistaAntesDeConsultar(opciones) {
    var ui = window.TAEstudianteUI;
    var state = window.TAEstudianteState;
    var paginacion = window.TAEstudiantePaginacion;
    var recomendacionesController = window.TAEstudianteRecomendacionesController;
    var panelSeguimiento = document.querySelector('#seguimientoTituloPanel');

    opciones = opciones || {};

    if (state) state.reiniciarConsulta({ conservarFirebase: true });
    if (recomendacionesController && recomendacionesController.reiniciar) recomendacionesController.reiniciar();

    if (panelSeguimiento) {
      panelSeguimiento.classList.add('is-hidden');
      panelSeguimiento.setAttribute('aria-hidden', 'true');
    }

    if (ui) {
      ui.hide('#comprobanteFinal');
      ui.hide('#seccionEstudiante');
      ui.hide('#formPropuestas');
      ui.show('#wizardSteps');
      ui.show('#consultaCard');
      ui.setFormDisabled('#formPropuestas', false);
      ui.clearFieldErrors();
      ui.showStatus('#envioMensaje', '', 'info');
      ui.showStatus('#consultaMensaje', '', 'info');
    }

    if (window.TAEstudianteFormularioController && window.TAEstudianteFormularioController.limpiarFormularioVisual) {
      window.TAEstudianteFormularioController.limpiarFormularioVisual();
    }

    if (paginacion && paginacion.reiniciar) paginacion.reiniciar();
    if (opciones.conservarCedula) restaurarCedula(opciones.conservarCedula);
  }

  function prepararBloqueProceso() {
    var bloque = obtenerBloqueProceso();
    inyectarEstilosBloque();
    bloque.classList.remove('is-hidden');
    bloque.setAttribute('aria-hidden', 'false');
    bloque.querySelector('[data-proceso-error]').classList.add('is-hidden');
    bloque.querySelector('[data-proceso-retry]').classList.add('is-hidden');
  }

  function actualizarBloqueProceso(paso, estado, titulo, detalle) {
    var bloque = obtenerBloqueProceso();
    var pasos = bloque.querySelectorAll('[data-proceso-paso]');
    var porcentaje = Math.max(8, Math.min(100, Number(paso || 1) * 25));

    prepararBloqueProceso();

    Array.prototype.forEach.call(pasos, function (item, index) {
      var numero = index + 1;
      var estadoItem = numero < paso ? 'completado' : (numero === paso ? estado : 'pendiente');
      if (estado === 'completado' && numero === paso) estadoItem = 'completado';
      item.className = 'consulta-bloque__paso is-' + estadoItem;
      var status = item.querySelector('[data-paso-status]');
      if (status) status.textContent = textoEstado(estadoItem);
    });

    bloque.querySelector('[data-proceso-barra]').style.width = porcentaje + '%';
    bloque.querySelector('[data-proceso-titulo]').textContent = titulo || 'Procesando consulta';
    bloque.querySelector('[data-proceso-detalle]').textContent = detalle || '';
  }

  function mostrarErrorProceso(mensaje, paso, errorOriginal) {
    var bloque = obtenerBloqueProceso();
    var error = bloque.querySelector('[data-proceso-error]');
    var retry = bloque.querySelector('[data-proceso-retry]');
    var item = bloque.querySelector('[data-proceso-paso="' + Number(paso || 1) + '"]');
    var diagnostico = errorOriginal && errorOriginal.diagnostico || {};

    prepararBloqueProceso();
    detenerDiagnosticoLento();
    bloque.querySelector('[data-proceso-titulo]').textContent = 'No se pudo completar este bloque';
    bloque.querySelector('[data-proceso-detalle]').textContent = mensaje;

    if (item) {
      item.className = 'consulta-bloque__paso is-error';
      var status = item.querySelector('[data-paso-status]');
      if (status) status.textContent = 'Error';
    }

    error.textContent = construirErrorVisible(mensaje, errorOriginal, diagnostico);
    error.classList.remove('is-hidden');
    retry.classList.remove('is-hidden');

    mostrarDiagnosticoTitulos(
      diagnostico,
      null,
      '',
      errorOriginal && (errorOriginal.codigo || errorOriginal.code) || 'ERROR',
      errorOriginal
    );

    var details = bloque.querySelector('[data-proceso-diagnostico]');
    if (details) details.open = true;
  }

  function ocultarBloqueProceso() {
    var bloque = document.querySelector('#consultaProcesoBloque');
    if (!bloque) return;
    bloque.classList.add('is-hidden');
    bloque.setAttribute('aria-hidden', 'true');
  }

  function obtenerBloqueProceso() {
    var bloque = document.querySelector('#consultaProcesoBloque');
    var form;
    var card;

    if (bloque) return bloque;

    card = document.querySelector('#consultaCard');
    form = document.querySelector('#formConsulta');

    bloque = document.createElement('section');
    bloque.id = 'consultaProcesoBloque';
    bloque.className = 'consulta-bloque is-hidden';
    bloque.setAttribute('aria-hidden', 'true');
    bloque.setAttribute('aria-live', 'polite');
    bloque.innerHTML = [
      '<div class="consulta-bloque__cabecera">',
        '<div><span class="consulta-bloque__kicker">Verificación por bloques</span><h3 data-proceso-titulo>Preparando consulta</h3><p data-proceso-detalle></p></div>',
        '<span class="consulta-bloque__spinner" aria-hidden="true"></span>',
      '</div>',
      '<div class="consulta-bloque__barra"><span data-proceso-barra></span></div>',
      '<div class="consulta-bloque__pasos">',
        pasoHtml(1, 'Cédula'),
        pasoHtml(2, 'Datos académicos'),
        pasoHtml(3, 'Estado del título'),
        pasoHtml(4, 'Resultado'),
      '</div>',
      '<details class="consulta-bloque__diagnostico is-hidden" data-proceso-diagnostico>',
        '<summary>Diagnóstico técnico de la consulta</summary>',
        '<div class="consulta-bloque__diagnostico-toolbar">',
          '<span data-diagnostico-build>Build: 20261008-51</span>',
          '<button type="button" class="consulta-bloque__copy" data-diagnostico-copy>Copiar diagnóstico</button>',
        '</div>',
        '<pre data-diagnostico-texto></pre>',
      '</details>',
      '<div class="consulta-bloque__error is-hidden" data-proceso-error></div>',
      '<button type="button" class="btn btn--secondary consulta-bloque__retry is-hidden" data-proceso-retry>Reintentar consulta</button>'
    ].join('');

    bloque.querySelector('[data-proceso-retry]').addEventListener('click', function () {
      var formConsulta = document.querySelector('#formConsulta');
      if (formConsulta && typeof formConsulta.requestSubmit === 'function') formConsulta.requestSubmit();
    });

    bloque.querySelector('[data-diagnostico-copy]').addEventListener('click', copiarDiagnosticoVisible);

    if (form && form.parentNode) form.parentNode.insertBefore(bloque, form.nextSibling);
    else if (card) card.appendChild(bloque);
    else document.body.appendChild(bloque);

    return bloque;
  }

  function pasoHtml(numero, label) {
    return '<div class="consulta-bloque__paso is-pendiente" data-proceso-paso="' + numero + '">' +
      '<span class="consulta-bloque__numero">' + numero + '</span>' +
      '<div><strong>' + escaparHtml(label) + '</strong><small data-paso-status>Pendiente</small></div>' +
    '</div>';
  }

  function inyectarEstilosBloque() {
    if (document.getElementById('consultaBloquesStyles')) return;

    var style = document.createElement('style');
    style.id = 'consultaBloquesStyles';
    style.textContent = [
      '.consulta-bloque{margin-top:16px;padding:18px;border:1px solid #c9dff3;border-radius:18px;background:linear-gradient(135deg,#f8fbff,#eef6ff);box-shadow:0 10px 24px rgba(7,27,52,.06)}',
      '.consulta-bloque.is-hidden{display:none}',
      '.consulta-bloque__cabecera{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}',
      '.consulta-bloque__kicker{display:block;font-size:.7rem;font-weight:900;letter-spacing:.1em;text-transform:uppercase;color:#426686;margin-bottom:4px}',
      '.consulta-bloque__cabecera h3{margin:0;color:#071b34;font-size:1.08rem}',
      '.consulta-bloque__cabecera p{margin:5px 0 0;color:#60758c;font-size:.88rem}',
      '.consulta-bloque__spinner{width:28px;height:28px;flex:0 0 28px;border:4px solid #dce8f5;border-top-color:#0b5da7;border-radius:50%;animation:taBloqueSpin .75s linear infinite}',
      '@keyframes taBloqueSpin{to{transform:rotate(360deg)}}',
      '.consulta-bloque__barra{height:7px;margin:14px 0;background:#dce8f5;border-radius:999px;overflow:hidden}',
      '.consulta-bloque__barra span{display:block;width:0;height:100%;background:linear-gradient(90deg,#0b5da7,#0f8f8a);border-radius:999px;transition:width .22s ease}',
      '.consulta-bloque__pasos{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}',
      '.consulta-bloque__paso{display:flex;align-items:center;gap:9px;padding:10px;border:1px solid #d8e4f0;border-radius:12px;background:#fff;min-width:0}',
      '.consulta-bloque__numero{width:27px;height:27px;display:grid;place-items:center;flex:0 0 27px;border-radius:50%;background:#edf2f7;color:#56708a;font-size:.78rem;font-weight:900}',
      '.consulta-bloque__paso strong{display:block;color:#17324d;font-size:.78rem;line-height:1.2}',
      '.consulta-bloque__paso small{display:block;margin-top:2px;color:#6a8097;font-size:.69rem}',
      '.consulta-bloque__paso.is-completado{border-color:#a9ddc3;background:#f1fbf6}',
      '.consulta-bloque__paso.is-completado .consulta-bloque__numero{background:#0c8a58;color:#fff}',
      '.consulta-bloque__paso.is-trabajando{border-color:#82b8ec;background:#eef6ff;box-shadow:inset 0 0 0 1px rgba(11,93,167,.05)}',
      '.consulta-bloque__paso.is-trabajando .consulta-bloque__numero{background:#0b5da7;color:#fff}',
      '.consulta-bloque__paso.is-error{border-color:#efb9b9;background:#fff4f4}',
      '.consulta-bloque__paso.is-error .consulta-bloque__numero{background:#b82c2c;color:#fff}',
      '.consulta-bloque__error{margin-top:12px;padding:10px 12px;border-radius:10px;background:#fff1f1;color:#9e2525;font-size:.84rem;font-weight:700}',
      '.consulta-bloque__error.is-hidden,.consulta-bloque__retry.is-hidden{display:none}',
      '.consulta-bloque__retry{margin-top:10px}',
      '.consulta-bloque__diagnostico{margin-top:12px;border:1px solid #c9dff3;border-radius:12px;background:#fff;overflow:hidden}',
      '.consulta-bloque__diagnostico.is-hidden{display:none}',
      '.consulta-bloque__diagnostico summary{cursor:pointer;padding:10px 12px;font-size:.8rem;font-weight:850;color:#17324d;background:#f5f9fd}',
      '.consulta-bloque__diagnostico-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 12px;border-top:1px solid #e1eaf3;border-bottom:1px solid #e1eaf3;background:#fbfdff;color:#60758c;font-size:.7rem;font-weight:800}',
      '.consulta-bloque__copy{border:1px solid #c9dff3;border-radius:8px;background:#fff;color:#0b5da7;padding:5px 8px;font-size:.7rem;font-weight:900;cursor:pointer}',
      '.consulta-bloque__diagnostico pre{margin:0;padding:11px 12px;white-space:pre-wrap;word-break:break-word;font:600 .74rem/1.45 ui-monospace,SFMono-Regular,Consolas,monospace;color:#425b73;background:#fff}',
      '.consulta-bloque__error{white-space:pre-wrap}',
      '@media(max-width:760px){.consulta-bloque__pasos{grid-template-columns:1fr 1fr}}',
      '@media(max-width:460px){.consulta-bloque{padding:14px}.consulta-bloque__pasos{grid-template-columns:1fr}}'
    ].join('');

    document.head.appendChild(style);
  }

  function mostrarDiagnosticoTitulos(diagnostico, estudiante, cedula, resultado, error) {
    var bloque = obtenerBloqueProceso();
    var details = bloque.querySelector('[data-proceso-diagnostico]');
    var pre = bloque.querySelector('[data-diagnostico-texto]');
    var build = bloque.querySelector('[data-diagnostico-build]');
    var info = diagnostico || {};
    var rutas = Array.isArray(info.rutasDetalle) && info.rutasDetalle.length
      ? info.rutasDetalle
      : diagnosticoRutasLive.slice();
    var lineas = [
      'Build: ' + obtenerBuildActual(),
      'Motor: ' + (info.motor || 'CONSULTA_CEDULA'),
      'Estrategia: ' + (info.estrategia || 'CEDULA_MAS_PERIODO'),
      'Base: ' + (info.base || 'titulos-ec2fa'),
      'Colección: ' + (info.coleccion || 'envios'),
      'Cédula: ' + String(cedula || (estudiante && estudiante.cedula) || ''),
      'Período: ' + String(info.periodoCanonico || (estudiante && estudiante.periodoId) || ''),
      'Resultado: ' + String(resultado || 'SIN_RESULTADO'),
      'Consulta: ' + String(info.ruta || 'TITULOS_CEDULA'),
      'Documento elegido: ' + String(info.documentoId || '—'),
      'Tiempo total: ' + String(info.duracionMs || 0) + ' ms'
    ];

    if (Array.isArray(info.periodosCandidatos) && info.periodosCandidatos.length) {
      lineas.push('Períodos candidatos: ' + info.periodosCandidatos.join(', '));
    }

    if (rutas.length) {
      lineas.push('', 'RUTAS:');
      rutas.forEach(function (ruta) {
        lineas.push(formatearRutaDiagnostico(ruta));
      });
    }

    if (error) {
      lineas.push('', 'ERROR FINAL:');
      lineas.push('Código: ' + String(error.codigo || error.code || error.name || 'ERROR'));
      if (error.httpStatus) lineas.push('HTTP: ' + String(error.httpStatus));
      if (error.firebaseStatus) lineas.push('Firebase status: ' + String(error.firebaseStatus));
      if (error.firebaseMessage) lineas.push('Firebase mensaje: ' + String(error.firebaseMessage));
      if (error.message) lineas.push('Mensaje: ' + String(error.message));
      if (error.stack) lineas.push('Stack: ' + String(error.stack));
    }

    if (pre) pre.textContent = lineas.join('\n');
    if (build) build.textContent = 'Build: ' + obtenerBuildActual();
    if (details) details.classList.remove('is-hidden');

    if (error || rutas.some(function (ruta) {
      return ruta && (ruta.estado === 'ERROR' || ruta.estado === 'TIMEOUT');
    })) {
      if (details) details.open = true;
    }
  }

  function activarInterfazConsultaLibre() {
    consultaInteractivaActiva = true;

    if (document.body) {
      document.body.classList.add('ta-query-active');
      document.body.classList.remove('has-open-modal');
      document.body.style.pointerEvents = '';
      document.body.style.overflow = '';
    }

    if (document.documentElement) {
      document.documentElement.style.pointerEvents = '';
      document.documentElement.style.overflowY = '';
    }

    /*
      El Paso 1 no utiliza el modal de IA. Si una versión vieja, un script
      cacheado o una capa complementaria intenta mostrarlo, se fuerza a oculto
      mientras dura la consulta académica.
    */
    Array.prototype.forEach.call(
      document.querySelectorAll('.ia-loading-modal, #modalLoadingIA, #iaLoadingModal'),
      function (modal) {
        modal.classList.add('is-hidden');
        modal.setAttribute('aria-hidden', 'true');
        modal.setAttribute('data-ta-query-disabled', 'true');
        modal.style.pointerEvents = 'none';
        modal.style.visibility = 'hidden';
      }
    );

    /*
      Quita bloqueos de accesibilidad/interacción que pudieran haber quedado
      de un modal anterior. Se limita a la zona de consulta.
    */
    [
      document.querySelector('main'),
      document.querySelector('#wizardSteps'),
      document.querySelector('#consultaCard'),
      document.querySelector('#consultaProcesoBloque')
    ].forEach(function (node) {
      if (!node) return;
      node.removeAttribute('inert');
      node.style.pointerEvents = '';
    });
  }

  function desactivarInterfazConsultaLibre() {
    consultaInteractivaActiva = false;

    if (document.body) {
      document.body.classList.remove('ta-query-active');
      document.body.style.pointerEvents = '';
    }

    Array.prototype.forEach.call(
      document.querySelectorAll('.ia-loading-modal[data-ta-query-disabled="true"], #modalLoadingIA[data-ta-query-disabled="true"], #iaLoadingModal[data-ta-query-disabled="true"]'),
      function (modal) {
        modal.removeAttribute('data-ta-query-disabled');
        modal.style.pointerEvents = '';
        modal.style.visibility = '';
      }
    );
  }

  function conectarDiagnosticoLive() {
    if (diagnosticoListenerConectado) return;
    diagnosticoListenerConectado = true;

    window.addEventListener('ta:consulta-titulo-ruta', function (event) {
      if (consultaInteractivaActiva) activarInterfazConsultaLibre();
      var detail = event && event.detail || {};
      actualizarRutaLive(detail);

      var bloque = document.querySelector('#consultaProcesoBloque');
      if (!bloque || bloque.classList.contains('is-hidden')) return;

      mostrarDiagnosticoTitulos({
        motor: 'RESOLVER_FLEXIBLE',
        estrategia: 'RUTAS_PARALELAS',
        rutasDetalle: diagnosticoRutasLive.slice()
      }, null, '', 'EN_PROCESO');

      if (detail.estado === 'ERROR' || detail.estado === 'TIMEOUT') {
        var details = bloque.querySelector('[data-proceso-diagnostico]');
        if (details) details.open = true;
      }
    });

    window.addEventListener('ta:runtime-diagnostico', function (event) {
      var item = event && event.detail || {};
      if (item.tipo !== 'ERROR' && item.tipo !== 'UNHANDLED_REJECTION') return;

      var bloque = document.querySelector('#consultaProcesoBloque');
      if (!bloque || bloque.classList.contains('is-hidden')) return;

      var detail = item.detalle || {};
      actualizarRutaLive({
        ruta: 'RUNTIME_JS',
        estado: 'ERROR',
        codigo: detail.codigo || detail.name || item.tipo,
        mensaje: detail.mensaje || 'Error JavaScript no controlado.',
        archivo: detail.archivo || '',
        linea: detail.linea || '',
        stack: detail.stack || ''
      });

      mostrarDiagnosticoTitulos({
        motor: 'RUNTIME',
        estrategia: 'ERROR_JAVASCRIPT',
        rutasDetalle: diagnosticoRutasLive.slice()
      }, null, '', item.tipo, detail.error || null);
    });
  }

  function iniciarDiagnosticoPaso3(estudiante) {
    detenerDiagnosticoLento();
    diagnosticoRutasLive = [];

    var bloque = obtenerBloqueProceso();
    var details = bloque.querySelector('[data-proceso-diagnostico]');
    if (details) {
      details.classList.remove('is-hidden');
      /*
        Durante la depuración el diagnóstico permanece abierto desde el inicio.
        Así el usuario puede ver la traza aunque una capa externa intentara
        interferir con el clic sobre <summary>.
      */
      details.open = true;
    }

    mostrarDiagnosticoTitulos({
      motor: 'CONSULTA_CEDULA',
      estrategia: 'CEDULA_MAS_PERIODO',
      base: 'titulos-ec2fa',
      coleccion: 'envios',
      cedula: estudiante && estudiante.cedula || '',
      periodoCanonico: estudiante && estudiante.periodoId || '',
      ruta: 'TITULOS_CEDULA',
      rutasDetalle: []
    }, estudiante, estudiante && estudiante.cedula || '', 'INICIANDO');

    diagnosticoLentoTimer = window.setTimeout(function () {
      var current = document.querySelector('#consultaProcesoBloque');
      if (!current || current.classList.contains('is-hidden')) return;
      var diag = current.querySelector('[data-proceso-diagnostico]');
      if (diag) diag.open = true;
    }, 2000);
  }

  function detenerDiagnosticoLento() {
    if (diagnosticoLentoTimer) {
      window.clearTimeout(diagnosticoLentoTimer);
      diagnosticoLentoTimer = null;
    }
  }

  function actualizarRutaLive(detail) {
    if (!detail || !detail.ruta || detail.ruta === 'RESOLVER') return;

    var existente = null;
    for (var i = diagnosticoRutasLive.length - 1; i >= 0; i -= 1) {
      if (diagnosticoRutasLive[i].ruta === detail.ruta) {
        existente = diagnosticoRutasLive[i];
        break;
      }
    }

    if (!existente) {
      existente = { ruta: detail.ruta };
      diagnosticoRutasLive.push(existente);
    }

    Object.keys(detail).forEach(function (key) {
      existente[key] = detail[key];
    });
  }

  function formatearRutaDiagnostico(ruta) {
    ruta = ruta || {};
    var partes = [
      '- ' + String(ruta.ruta || 'DESCONOCIDA'),
      '[' + String(ruta.estado || 'SIN_ESTADO') + ']'
    ];

    if (ruta.ms !== undefined && ruta.ms !== '') partes.push(String(ruta.ms) + ' ms');
    if (ruta.codigo) partes.push('código=' + String(ruta.codigo));
    if (ruta.httpStatus) partes.push('HTTP=' + String(ruta.httpStatus));
    if (ruta.firebaseStatus) partes.push('firebase=' + String(ruta.firebaseStatus));
    if (ruta.documentoId) partes.push('doc=' + String(ruta.documentoId));
    if (ruta.score !== undefined && ruta.score !== '') partes.push('score=' + String(ruta.score));
    if (ruta.mensaje) partes.push('mensaje=' + String(ruta.mensaje));
    if (ruta.firebaseMessage) partes.push('firebaseMensaje=' + String(ruta.firebaseMessage));

    return partes.join(' · ');
  }

  function construirErrorVisible(mensaje, error, diagnostico) {
    var lineas = [String(mensaje || 'No se pudo completar la consulta.')];
    error = error || {};
    diagnostico = diagnostico || {};

    lineas.push('');
    lineas.push('Código: ' + String(error.codigo || error.code || error.name || 'ERROR'));

    if (error.httpStatus) lineas.push('HTTP: ' + String(error.httpStatus));
    if (error.firebaseStatus) lineas.push('Firebase: ' + String(error.firebaseStatus));
    if (error.firebaseMessage) lineas.push('Firebase mensaje: ' + String(error.firebaseMessage));
    if (diagnostico.ruta) lineas.push('Ruta: ' + String(diagnostico.ruta));
    if (diagnostico.documentoId) lineas.push('Documento: ' + String(diagnostico.documentoId));
    lineas.push('Build: ' + obtenerBuildActual());

    return lineas.join('\n');
  }

  function enriquecerErrorConDiagnostico(error, contexto, cedula) {
    if (!error) return;

    var existente = error.diagnostico || {};
    error.diagnostico = Object.assign({}, existente, {
      motor: existente.motor || 'CONSULTA_CEDULA',
      estrategia: existente.estrategia || 'CEDULA_MAS_PERIODO',
      base: existente.base || 'titulos-ec2fa',
      coleccion: existente.coleccion || 'envios',
      cedula: cedula || (contexto.estudiante && contexto.estudiante.cedula) || '',
      periodoCanonico: existente.periodoCanonico || (contexto.estudiante && contexto.estudiante.periodoId) || '',
      cedula: existente.cedula || ((contexto.estudiante && contexto.estudiante.cedula) || cedula || ''),
      rutasDetalle: diagnosticoRutasLive.slice(),
      build: obtenerBuildActual()
    });
  }

  function copiarDiagnosticoVisible() {
    var bloque = obtenerBloqueProceso();
    var pre = bloque.querySelector('[data-diagnostico-texto]');
    var texto = pre ? pre.textContent : '';

    if (!texto) return;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(texto).then(function () {
        var button = bloque.querySelector('[data-diagnostico-copy]');
        if (!button) return;
        var anterior = button.textContent;
        button.textContent = 'Copiado';
        window.setTimeout(function () { button.textContent = anterior; }, 1200);
      }).catch(function () {
        copiarTextoFallback(texto);
      });
      return;
    }

    copiarTextoFallback(texto);
  }

  function copiarTextoFallback(texto) {
    var area = document.createElement('textarea');
    area.value = texto;
    area.setAttribute('readonly', 'readonly');
    area.style.position = 'fixed';
    area.style.left = '-9999px';
    document.body.appendChild(area);
    area.select();
    try { document.execCommand('copy'); } catch (error) {}
    document.body.removeChild(area);
  }

  function obtenerBuildActual() {
    return (window.TAEstudianteApp && window.TAEstudianteApp.build) ||
      (window.TAEstudianteDiagnostico && window.TAEstudianteDiagnostico.build) ||
      '20261008-51';
  }

  function limpiarDiagnosticoTitulos() {
    detenerDiagnosticoLento();
    diagnosticoRutasLive = [];
    var bloque = obtenerBloqueProceso();
    var details = bloque.querySelector('[data-proceso-diagnostico]');
    var pre = bloque.querySelector('[data-diagnostico-texto]');

    if (details) {
      details.classList.add('is-hidden');
      details.removeAttribute('open');
    }
    if (pre) pre.textContent = '';
  }

  function mostrarErrorCedula(mensaje) {
    var input = obtenerInputCedula();
    var ayuda = document.querySelector('#cedulaAyuda');
    if (input) {
      input.setAttribute('aria-invalid', 'true');
      input.classList.add('is-invalid');
    }
    if (ayuda) {
      ayuda.dataset.textoOriginal = ayuda.dataset.textoOriginal || ayuda.textContent;
      ayuda.textContent = mensaje;
      ayuda.style.color = '#a52323';
    }
  }

  function limpiarErrorCedula() {
    var input = obtenerInputCedula();
    var ayuda = document.querySelector('#cedulaAyuda');
    if (input) {
      input.removeAttribute('aria-invalid');
      input.classList.remove('is-invalid');
    }
    if (ayuda && ayuda.dataset.textoOriginal) {
      ayuda.textContent = ayuda.dataset.textoOriginal;
      ayuda.style.color = '';
    }
  }

  function determinarPasoError(contexto) {
    if (!contexto.estudiante) return 2;
    if (!contexto.titulosConsultados) return 3;
    return 4;
  }

  function resumenEstudiante(estudiante) {
    return [estudiante.nombres || '', estudiante.carrera || '', estudiante.periodoLabel || estudiante.periodoId || '']
      .filter(Boolean).join(' · ');
  }

  function textoEstado(estado) {
    if (estado === 'completado') return 'Listo';
    if (estado === 'trabajando') return 'Procesando';
    if (estado === 'error') return 'Error';
    return 'Pendiente';
  }

  function conTimeout(promesa, ms, mensaje) {
    var timer;
    return Promise.race([
      Promise.resolve(promesa),
      new Promise(function (_, reject) {
        timer = window.setTimeout(function () {
          reject(crearError('TIMEOUT', mensaje || 'La consulta tardó demasiado.'));
        }, Number(ms || 0));
      })
    ]).finally(function () {
      if (timer) window.clearTimeout(timer);
    });
  }

  function crearError(codigo, mensaje) {
    var error = new Error(mensaje || codigo || 'Error de consulta.');
    error.codigo = codigo || 'CONSULTA_ERROR';
    return error;
  }

  function crearErrorCancelado() {
    return crearError('CONSULTA_CANCELADA', 'Consulta cancelada por una nueva solicitud.');
  }

  function obtenerInputCedula() {
    return document.querySelector('#cedulaInput') || document.querySelector('#cedula') || document.querySelector('[name="cedula"]');
  }

  function obtenerBotonConsulta(event) {
    if (event && event.submitter) return event.submitter;
    return document.querySelector('#btnConsultar') || document.querySelector('#formConsulta button[type="submit"]');
  }

  function restaurarCedula(cedula) {
    var input = obtenerInputCedula();
    if (input) input.value = cedula || '';
  }

  function normalizar(valor) {
    return String(valor === undefined || valor === null ? '' : valor)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_').toUpperCase();
  }

  function escaparHtml(value) {
    return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function obtenerMensajeError(error) {
    return error && error.message ? String(error.message) : String(error || '');
  }

  function mostrarErrorDependencias() {
    console.error('[Estudiantes] Faltan dependencias para la consulta por bloques.');
  }

  /* Compatibilidad: ya no existen popups de consulta; estas funciones manejan el bloque inline. */
  function abrirPopupConsulta(info) {
    prepararBloqueProceso();
    actualizarBloqueProceso(Number(info && info.paso || 1), 'trabajando', info && info.titulo, info && info.detalle);
  }

  function actualizarPopupConsulta(info) {
    actualizarBloqueProceso(Number(info && info.paso || 1), 'trabajando', info && info.titulo, info && info.detalle);
  }

  function cerrarPopupConsulta() {
    ocultarBloqueProceso();
  }

  function fusionarAppConfig(appConfig) {
    return Object.assign({}, (window.TA_ESTUDIANTES_CONFIG && window.TA_ESTUDIANTES_CONFIG.defaultAppConfig) || {}, appConfig || {});
  }

  function normalizarRespuestaConsulta(respuesta) {
    if (!respuesta) return { ok: false, data: null, mensaje: 'No se encontró información.' };
    if (respuesta.ok === false) return respuesta;
    return { ok: true, data: respuesta.data || respuesta, mensaje: respuesta.mensaje || '' };
  }

  window.TAEstudianteConsultaController = Object.freeze({
    manejarConsulta: manejarConsulta,
    asegurarFirebase: asegurarFirebase,
    limpiarCedulaMientrasEscribe: limpiarCedulaMientrasEscribe,
    limpiarVistaAntesDeConsultar: limpiarVistaAntesDeConsultar,
    fusionarAppConfig: fusionarAppConfig,
    normalizarRespuestaConsulta: normalizarRespuestaConsulta,
    abrirPopupConsulta: abrirPopupConsulta,
    actualizarPopupConsulta: actualizarPopupConsulta,
    cerrarPopupConsulta: cerrarPopupConsulta
  });
})();
