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
  var TIMEOUT_TITULO_MS = 7000;
  var TIMEOUT_HISTORIAL_MS = 4500;
  var consultaToken = 0;

  function manejarConsulta(event, opciones) {
    var ui = window.TAEstudianteUI;
    var validaciones = window.TAEstudianteValidaciones;
    var state = window.TAEstudianteState;
    var repository = window.TAEstudianteRepository;\n    var bridgeTitulos = window.TAConsultaEstadoBridge;
    var inputCedula;
    var cedulaOriginal;
    var resultadoCedula;
    var button;
    var token;
    var contexto = {
      appConfig: null,
      estudiante: null,
      envio: null
    };

    opciones = opciones || {};

    if (event && event.preventDefault) event.preventDefault();

    if (!ui || !validaciones || !state || !repository || !bridgeTitulos) {
      mostrarErrorDependencias();
      return Promise.resolve(null);
    }

    inputCedula = obtenerInputCedula();
    cedulaOriginal = inputCedula ? inputCedula.value : '';
    resultadoCedula = validaciones.validarCedulaBasica(cedulaOriginal);
    button = obtenerBotonConsulta(event);
    token = ++consultaToken;

    ui.clearFieldErrors();
    limpiarErrorCedula();

    if (!resultadoCedula.ok) {
      mostrarErrorCedula(resultadoCedula.mensaje || 'Revisa el número de identificación.');
      return Promise.resolve(null);
    }

    if (inputCedula) inputCedula.value = resultadoCedula.data;

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

        return conTimeout(
          consultarEstadoTituloAislado(
            estudiante.periodoId,
            estudiante.cedula || resultadoCedula.data,
            bridgeTitulos
          ),
          TIMEOUT_TITULO_MS,
          'El motor independiente de Títulos no respondió a tiempo. Intenta nuevamente.'
        );
      })
      .then(function (resultadoTitulo) {
        var envio;

        if (token !== consultaToken) throw crearErrorCancelado();

        resultadoTitulo = resultadoTitulo || {};
        envio = resultadoTitulo.envio || null;
        contexto.envio = envio;
        contexto.diagnosticoTitulos = resultadoTitulo.diagnostico || null;

        actualizarBloqueProceso(
          3,
          'completado',
          envio ? 'Registro de título encontrado' : 'Sin envío previo',
          envio
            ? 'El motor independiente encontró el registro en titulos-ec2fa / envios.'
            : 'El motor independiente no encontró un envío compatible para esta cédula y período.'
        );

        mostrarDiagnosticoTitulos(
          contexto.diagnosticoTitulos,
          estudiante,
          estudiante.cedula || resultadoCedula.data,
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
            ocultarBloqueProceso();
            if (typeof opciones.onConsultaExitosa === 'function') opciones.onConsultaExitosa(resultado);
          }, 120);
        }

        return resultado;
      })
      .catch(function (error) {
        if (error && error.codigo === 'CONSULTA_CANCELADA') return null;

        console.error('[Estudiantes] Error en consulta por bloques:', error);
        state.reiniciarConsulta({ conservarFirebase: true });
        restaurarCedula(resultadoCedula.data);

        mostrarErrorProceso(
          obtenerMensajeError(error) || 'No se pudo completar la consulta.',
          determinarPasoError(contexto)
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
      });
  }

  function consultarEstadoTituloAislado(periodoId, cedula, bridge) {
    if (!bridge || typeof bridge.consultar !== 'function') {
      return Promise.reject(crearError(
        'MOTOR_TITULOS_NO_DISPONIBLE',
        'No se pudo iniciar el motor independiente de consulta de Títulos.'
      ));
    }

    return bridge.consultar({
      periodoId: periodoId,
      cedula: cedula
    }).then(function (respuesta) {
      if (!respuesta || respuesta.ok === false) {
        var error = crearError(
          respuesta && respuesta.error && respuesta.error.codigo || 'CONSULTA_TITULOS_ERROR',
          respuesta && respuesta.error && respuesta.error.mensaje || 'No se pudo consultar la base de Títulos.'
        );
        error.diagnostico = respuesta && respuesta.diagnostico || null;
        throw error;
      }

      return {
        envio: respuesta.encontrado ? (respuesta.envio || null) : null,
        diagnostico: respuesta.diagnostico || {
          base: 'titulos-ec2fa',
          coleccion: 'envios'
        }
      };
    }).catch(function (error) {
      if (error && !error.diagnostico) {
        error.diagnostico = {
          base: 'titulos-ec2fa',
          coleccion: 'envios',
          periodoCanonico: String(periodoId || ''),
          duracionMs: 0
        };
      }
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
    var firebaseService = window.TAFirebaseService;
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

  function mostrarErrorProceso(mensaje, paso) {
    var bloque = obtenerBloqueProceso();
    var error = bloque.querySelector('[data-proceso-error]');
    var retry = bloque.querySelector('[data-proceso-retry]');
    var item = bloque.querySelector('[data-proceso-paso="' + Number(paso || 1) + '"]');

    prepararBloqueProceso();
    bloque.querySelector('[data-proceso-titulo]').textContent = 'No se pudo completar este bloque';
    bloque.querySelector('[data-proceso-detalle]').textContent = mensaje;

    if (item) {
      item.className = 'consulta-bloque__paso is-error';
      var status = item.querySelector('[data-paso-status]');
      if (status) status.textContent = 'Reintentar';
    }

    error.textContent = mensaje;
    error.classList.remove('is-hidden');
    retry.classList.remove('is-hidden');
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
        '<summary>Detalles de la consulta de títulos</summary>',
        '<pre data-diagnostico-texto></pre>',
      '</details>',
      '<div class="consulta-bloque__error is-hidden" data-proceso-error></div>',
      '<button type="button" class="btn btn--secondary consulta-bloque__retry is-hidden" data-proceso-retry>Reintentar consulta</button>'
    ].join('');

    bloque.querySelector('[data-proceso-retry]').addEventListener('click', function () {
      var formConsulta = document.querySelector('#formConsulta');
      if (formConsulta && typeof formConsulta.requestSubmit === 'function') formConsulta.requestSubmit();
    });

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
      '.consulta-bloque__diagnostico pre{margin:0;padding:11px 12px;white-space:pre-wrap;word-break:break-word;font:600 .74rem/1.45 ui-monospace,SFMono-Regular,Consolas,monospace;color:#425b73;background:#fff}',
      '@media(max-width:760px){.consulta-bloque__pasos{grid-template-columns:1fr 1fr}}',
      '@media(max-width:460px){.consulta-bloque{padding:14px}.consulta-bloque__pasos{grid-template-columns:1fr}}'
    ].join('');

    document.head.appendChild(style);
  }

  function mostrarDiagnosticoTitulos(diagnostico, estudiante, cedula, resultado, error) {
    var bloque = obtenerBloqueProceso();
    var details = bloque.querySelector('[data-proceso-diagnostico]');
    var pre = bloque.querySelector('[data-diagnostico-texto]');
    var info = diagnostico || {};
    var lineas = [
      'Base: ' + (info.base || 'titulos-ec2fa'),
      'Colección: ' + (info.coleccion || 'envios'),
      'Cédula: ' + String(cedula || (estudiante && estudiante.cedula) || ''),
      'Período: ' + String(info.periodoCanonico || (estudiante && estudiante.periodoId) || ''),
      'Resultado: ' + String(resultado || 'SIN_RESULTADO'),
      'Ruta: ' + String(info.ruta || '—'),
      'Documento: ' + String(info.documentoId || '—'),
      'Tiempo: ' + String(info.duracionMs || 0) + ' ms'
    ];

    if (Array.isArray(info.rutasProbadas) && info.rutasProbadas.length) {
      lineas.push('Rutas probadas: ' + info.rutasProbadas.join(' → '));
    }

    if (error && error.message) {
      lineas.push('Mensaje: ' + String(error.message));
    }

    if (pre) pre.textContent = lineas.join('\n');
    if (details) details.classList.remove('is-hidden');
  }

  function limpiarDiagnosticoTitulos() {
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
    if (contexto.envio === null) return 3;
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
