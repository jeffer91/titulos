/*
  Archivo: estudiante.app.js
  Ruta: estudiantes/js/estudiante.app.js
  Funciones principales del archivo:
  - Controlar el flujo principal del módulo estudiantes.
  - Consultar datos del estudiante en Firebase.
  - Mostrar modal inicial obligatorio de recomendaciones después de una consulta válida.
  - Coordinar paginación, Telegram, propuestas, IA, sugerencias y respaldo.
  - Abrir animación de generación mientras el orquestador prueba varias IA.
  - Abrir modal de sugerencias al presionar Generar sugerencias.
  - Conservar metadatos de IA para mostrar proveedor, modelo, enfoque, calidad y advertencias.
  - Preparar resumen, vista previa, envío final y comprobante.
*/
(function () {
  'use strict';

  var config = window.TA_ESTUDIANTES_CONFIG;
  var ui = window.TAEstudianteUI;
  var validaciones = window.TAEstudianteValidaciones;
  var firebaseService = window.TAFirebaseService;
  var repository = window.TAEstudianteRepository;
  var formularioService = window.TAEstudianteFormulario;
  var iaService = window.TAEstudianteIA;
  var sugerenciasService = window.TAEstudianteSugerencias;
  var sheetsService = window.TAEstudianteSheets;
  var paginacion = window.TAEstudiantePaginacion;
  var telegramService = window.TAEstudianteTelegram;
  var modalService = window.TAEstudianteModal;
  var loadingService = window.TAEstudianteLoading;

  var estado = {
    estudiante: null,
    appConfig: null,
    envioExistente: null,
    firebaseListo: false,
    ultimoFormulario: null,
    ultimoPayload: null,
    ultimoResultadoFinal: null,
    autoGuardadoTimer: null,
    enviadoFinal: false,
    consultaCompletada: false,
    recomendacionesCerradas: false,
    ultimasRespuestasIA: {}
  };

  document.addEventListener('DOMContentLoaded', iniciar);

  function iniciar() {
    conectarEventos();
    limpiarCedulaMientrasEscribe();
    prepararTelegram();
    prepararPaginacion();
  }

  function prepararPaginacion() {
    if (!paginacion || !paginacion.iniciar) {
      return;
    }

    paginacion.iniciar({
      pasos: ['consulta', 'datos', 'propuesta1', 'propuesta2', 'propuesta3', 'resumen', 'envio'],
      antesDeAvanzar: validarAntesDeAvanzar,
      alCambiar: manejarCambioPaso
    });
  }

  function conectarEventos() {
    var formConsulta = ui.qs('#formConsulta');
    var formPropuestas = ui.qs('#formPropuestas');
    var btnVistaPrevia = ui.qs('#btnVistaPrevia');
    var btnCerrarModal = ui.qs('#btnCerrarModal');
    var btnCancelarResumen = ui.qs('#btnCancelarResumen');
    var btnConfirmarEnvio = ui.qs('#btnConfirmarEnvio');
    var btnConfirmarEnvioModal = ui.qs('#btnConfirmarEnvioModal');
    var btnGuardarBorrador = ui.qs('#btnGuardarBorrador');
    var btnLimpiarBorrador = ui.qs('#btnLimpiarBorrador');
    var btnCopiarRegistro = ui.qs('#btnCopiarRegistro');
    var btnNuevaConsulta = ui.qs('#btnNuevaConsulta');
    var btnValidarTelegram = ui.qs('#btnValidarTelegram');
    var btnCerrarAlerta = ui.qs('#btnCerrarAlerta');
    var btnAceptarAlerta = ui.qs('#btnAceptarAlerta');

    if (formConsulta) {
      formConsulta.addEventListener('submit', manejarConsulta);
    }

    if (formPropuestas) {
      formPropuestas.addEventListener('submit', manejarEnvio);
      formPropuestas.addEventListener('input', programarAutoGuardado);
      formPropuestas.addEventListener('change', programarAutoGuardado);
    }

    if (btnVistaPrevia) {
      btnVistaPrevia.addEventListener('click', mostrarVistaPrevia);
    }

    if (btnCerrarModal) {
      btnCerrarModal.addEventListener('click', ui.closeModal);
    }

    if (btnCancelarResumen) {
      btnCancelarResumen.addEventListener('click', ui.closeModal);
    }

    if (btnConfirmarEnvio) {
      btnConfirmarEnvio.addEventListener('click', confirmarEnvioFinal);
    }

    if (btnConfirmarEnvioModal) {
      btnConfirmarEnvioModal.addEventListener('click', confirmarEnvioFinal);
    }

    if (btnGuardarBorrador) {
      btnGuardarBorrador.addEventListener('click', guardarBorradorManual);
    }

    if (btnLimpiarBorrador) {
      btnLimpiarBorrador.addEventListener('click', limpiarBorradorManual);
    }

    if (btnCopiarRegistro) {
      btnCopiarRegistro.addEventListener('click', copiarCodigoRegistro);
    }

    if (btnNuevaConsulta) {
      btnNuevaConsulta.addEventListener('click', iniciarNuevaConsulta);
    }

    if (btnValidarTelegram) {
      btnValidarTelegram.addEventListener('click', validarTelegram);
    }

    if (btnCerrarAlerta) {
      btnCerrarAlerta.addEventListener('click', ui.closeAlert);
    }

    if (btnAceptarAlerta) {
      btnAceptarAlerta.addEventListener('click', ui.closeAlert);
    }

    ui.qsa('.js-generar-sugerencias').forEach(function (button) {
      button.addEventListener('click', function () {
        manejarSugerencias(Number(button.dataset.propuesta), button);
      });
    });
  }

  function prepararTelegram() {
    if (telegramService && telegramService.prepararInput) {
      telegramService.prepararInput('#telegramInput');
    }
  }

  function limpiarCedulaMientrasEscribe() {
    var input = ui.qs('#cedulaInput');

    if (!input) {
      return;
    }

    input.addEventListener('input', function () {
      input.value = validaciones.limpiarCedula(input.value);
    });
  }

  function asegurarFirebase() {
    if (estado.firebaseListo) {
      return Promise.resolve(true);
    }

    if (!config || !firebaseService || !repository || !formularioService) {
      return Promise.reject(new Error('No se cargaron todos los servicios necesarios del módulo estudiantes.'));
    }

    return firebaseService.iniciar(config.firebase).then(function (resultado) {
      estado.firebaseListo = Boolean(resultado && resultado.ok);

      if (!estado.firebaseListo) {
        throw new Error(resultado && resultado.mensaje ? resultado.mensaje : 'Firebase no está listo.');
      }

      return true;
    });
  }

  function manejarConsulta(event) {
    event.preventDefault();

    var btnConsultar = ui.qs('#btnConsultar');
    var cedula = ui.value('#cedulaInput');
    var resultado = validaciones.validarCedulaBasica(cedula);

    ui.clearFieldErrors();

    if (!resultado.ok) {
      ui.showAlert(resultado.mensaje, resultado.selector);
      return;
    }

    estado.consultaCompletada = false;
    estado.recomendacionesCerradas = false;

    ui.setLoading(btnConsultar, true, 'Consultando...');
    limpiarEstadoConsulta(false);
    ui.showStatus('#consultaMensaje', '', 'info');

    asegurarFirebase()
      .then(function () {
        return repository.consultarEstudianteCompleto(resultado.data);
      })
      .then(function (respuesta) {
        if (!respuesta || !respuesta.ok) {
          limpiarEstadoConsulta(false);
          ui.showStatus(
            '#consultaMensaje',
            respuesta && respuesta.mensaje ? respuesta.mensaje : 'No se encontró información del estudiante.',
            'error'
          );
          return;
        }

        estado.estudiante = respuesta.data.estudiante;
        estado.appConfig = fusionarAppConfig(respuesta.data.appConfig);
        estado.envioExistente = respuesta.data.envioExistente;
        estado.consultaCompletada = true;

        ui.renderStudent(estado.estudiante);
        inicializarFormularioTrasConsulta(respuesta.data);

        if (paginacion && paginacion.habilitarHasta) {
          paginacion.habilitarHasta('datos');
        }

        mostrarModalRecomendaciones();
      })
      .catch(function (error) {
        estado.firebaseListo = false;
        limpiarEstadoConsulta(false);

        console.error('[Estudiantes] Error consulta:', error);

        ui.showStatus(
          '#consultaMensaje',
          'No se pudo consultar la información. Revisa la conexión, la configuración de Firebase o la consola del navegador.',
          'error'
        );
      })
      .finally(function () {
        ui.setLoading(btnConsultar, false);
      });
  }

  function fusionarAppConfig(appConfigFirebase) {
    var base = config && config.defaultAppConfig ? config.defaultAppConfig : {};

    return Object.assign({}, base, appConfigFirebase || {});
  }

  function mostrarModalRecomendaciones() {
    if (modalService && modalService.abrirRecomendaciones) {
      modalService.abrirRecomendaciones(function () {
        cerrarRecomendaciones();
      });
      return;
    }

    ui.openAdviceModal(function () {
      cerrarRecomendaciones();
    });
  }

  function cerrarRecomendaciones() {
    estado.recomendacionesCerradas = true;

    if (ui.closeAdviceModal) {
      ui.closeAdviceModal();
    }

    mostrarDatosSiCorresponde();
  }

  function mostrarDatosSiCorresponde() {
    if (!estado.consultaCompletada || !estado.recomendacionesCerradas) {
      return;
    }

    if (paginacion && paginacion.irA) {
      paginacion.irA('datos', true);
    }

    ui.showStatus('#consultaMensaje', '', 'success');
  }

  function limpiarEstadoConsulta(reiniciarPaginacion) {
    estado.estudiante = null;
    estado.appConfig = null;
    estado.envioExistente = null;
    estado.ultimoFormulario = null;
    estado.ultimoPayload = null;
    estado.ultimoResultadoFinal = null;
    estado.enviadoFinal = false;
    estado.consultaCompletada = false;
    estado.recomendacionesCerradas = false;
    estado.ultimasRespuestasIA = {};

    ui.hide('#comprobanteFinal');
    ui.show('#wizardSteps');
    ui.setFormDisabled('#formPropuestas', false);
    limpiarSugerenciasVisuales();
    ui.clearFieldErrors();
    ui.showStatus('#envioMensaje', '', 'info');

    if (telegramService && telegramService.marcarEstado) {
      telegramService.marcarEstado(false, 'Telegram pendiente de validación.');
    }

    if (reiniciarPaginacion !== false && paginacion && paginacion.reiniciar) {
      paginacion.reiniciar();
    }
  }

  function inicializarFormularioTrasConsulta(data) {
    var formDataExistente = null;
    var borrador = null;

    limpiarFormularioVisual();

    if (data && data.envioExistente && formularioService.formDataDesdeEnvio) {
      formDataExistente = formularioService.formDataDesdeEnvio(
        data.envioExistente,
        config.propuestasObligatorias
      );

      ui.fillFormData(formDataExistente);
      ui.showStatus('#envioMensaje', 'Se cargó el último envío registrado para revisión.', 'info');
    }

    if (formularioService.leerBorrador) {
      borrador = formularioService.leerBorrador(estado.estudiante, estado.appConfig);
    }

    if (borrador && borrador.formData) {
      ui.fillFormData(borrador.formData);
      ui.showStatus(
        '#envioMensaje',
        config.textos && config.textos.borradorRestaurado
          ? config.textos.borradorRestaurado
          : 'Se restauró un borrador guardado.',
        'success'
      );
    }
  }

  function limpiarFormularioVisual() {
    var formDataVacio = {
      telegram: '',
      tituloPreferidoNumero: 1,
      propuestas: [1, 2, 3].map(function (numero) {
        return {
          numero: numero,
          temaGeneral: '',
          problemaNecesidad: '',
          lugarContexto: '',
          grupoEstudio: '',
          anioPeriodo: '',
          objetivo: '',
          tituloFinal: ''
        };
      })
    };

    ui.fillFormData(formDataVacio);
    limpiarSugerenciasVisuales();
  }

  function validarTelegram() {
    if (!telegramService || !telegramService.abrirPerfil) {
      ui.showAlert('No se pudo validar Telegram porque el servicio no está disponible.', '#telegramInput');
      return;
    }

    ui.clearFieldErrors();

    var resultado = telegramService.abrirPerfil(ui.value('#telegramInput'));

    if (!resultado.ok) {
      if (telegramService.marcarEstado) {
        telegramService.marcarEstado(false, 'Telegram pendiente de validación.');
      }

      ui.showAlert(resultado.mensaje, resultado.selector || '#telegramInput');
      return;
    }

    ui.setValue('#telegramInput', resultado.usuario);

    if (telegramService.marcarEstado) {
      telegramService.marcarEstado(true, 'Telegram validado visualmente: ' + resultado.usuario);
    }
  }

  function validarAntesDeAvanzar(actual) {
    var resultado;

    if (actual === 'consulta') {
      if (!estado.estudiante) {
        ui.showAlert('Primero consulta tu cédula para continuar.', '#cedulaInput');
        return false;
      }

      return true;
    }

    resultado = validaciones.validarPaso(actual);

    if (!resultado.ok) {
      ui.showAlert(resultado.mensaje, resultado.selector);
      return false;
    }

    return true;
  }

  function manejarCambioPaso(info) {
    if (!info || !info.paso) {
      return;
    }

    if (info.paso === 'resumen') {
      ui.renderResumenTitulos(ui.readFormData(config.propuestasObligatorias));
    }

    if (info.paso === 'envio') {
      prepararPayloadFinalSinModal();
    }
  }

  function prepararPayloadFinalSinModal() {
    var formData;
    var resultado;

    if (!estado.estudiante) {
      return;
    }

    formData = ui.readFormData(config.propuestasObligatorias);
    resultado = validaciones.validarEnvio(formData, config.propuestasObligatorias);

    if (!resultado.ok) {
      estado.ultimoFormulario = null;
      estado.ultimoPayload = null;
      return;
    }

    estado.ultimoFormulario = formData;
    estado.ultimoPayload = formularioService.construirPayload(
      estado.estudiante,
      estado.appConfig,
      formData,
      estado.envioExistente
    );

    ui.renderSummary(estado.estudiante, formData, estado.ultimoPayload);
  }

  function manejarSugerencias(numero, button) {
    var formData = ui.readFormData(config.propuestasObligatorias);
    var propuesta = formData.propuestas[numero - 1];
    var resultado = validarBaseParaSugerencias(propuesta);

    ui.clearFieldErrors();

    if (estado.enviadoFinal) {
      ui.showAlert('El envío ya fue registrado. No se pueden hacer nuevos cambios.', '');
      return;
    }

    if (!estado.estudiante) {
      ui.showAlert('Primero consulta la cédula del estudiante.', '#cedulaInput');
      return;
    }

    if (!resultado.ok) {
      ui.showAlert(resultado.mensaje, resultado.selector);
      return;
    }

    if (!iaService || !iaService.generarSugerencias) {
      mostrarSugerenciasNoDisponibles();
      return;
    }

    if (estado.appConfig && estado.appConfig.iaActiva === false) {
      mostrarSugerenciasNoDisponibles();
      return;
    }

    ui.setLoading(button, true, 'Generando...');
    ui.showStatus('#envioMensaje', 'Generando sugerencias académicas con varias IA disponibles...', 'info');

    abrirLoadingIA();

    iaService.generarSugerencias({
      estudiante: estado.estudiante,
      appConfig: estado.appConfig,
      propuesta: propuesta,
      onProgress: manejarProgresoIA
    })
      .then(function (respuesta) {
        var sugerencias = respuesta && Array.isArray(respuesta.sugerencias)
          ? respuesta.sugerencias
          : [];

        if (!sugerencias.length) {
          mostrarSugerenciasNoDisponibles();
          return;
        }

        estado.ultimasRespuestasIA[numero] = respuesta;

        ui.showStatus(
          '#envioMensaje',
          'Sugerencias generadas correctamente. Revisa las etiquetas antes de elegir.',
          'success'
        );

        renderizarSugerencias(numero, sugerencias, respuesta);
      })
      .catch(function (error) {
        console.error('[Estudiantes] Error IA:', error);
        mostrarSugerenciasNoDisponibles(error);
      })
      .finally(function () {
        cerrarLoadingIA();
        ui.setLoading(button, false);
      });
  }

  function abrirLoadingIA() {
    if (!loadingService || !loadingService.abrir) {
      return;
    }

    loadingService.abrir({
      titulo: 'Generando títulos académicos',
      detalle: 'La app probará automáticamente las IA disponibles.'
    });
  }

  function manejarProgresoIA(evento) {
    if (!loadingService || !loadingService.progreso) {
      return;
    }

    loadingService.progreso(evento || {});
  }

  function cerrarLoadingIA() {
    if (!loadingService || !loadingService.cerrar) {
      return;
    }

    window.setTimeout(function () {
      loadingService.cerrar();
    }, 350);
  }

  function renderizarSugerencias(numero, sugerencias, respuestaIA) {
    var formData = ui.readFormData(config.propuestasObligatorias);
    var propuesta = formData.propuestas[numero - 1];

    if (sugerenciasService && sugerenciasService.renderizar) {
      sugerenciasService.renderizar(numero, sugerencias, {
        estudiante: estado.estudiante,
        propuesta: propuesta,
        respuestaIA: respuestaIA || estado.ultimasRespuestasIA[numero] || null,
        onSeleccionar: function () {
          programarAutoGuardado();
          actualizarResumenPreferido();
        }
      });

      return;
    }

    ui.renderSuggestions(numero, sugerencias.map(function (item) {
      return typeof item === 'string' ? item : item.texto;
    }));
  }

  function limpiarSugerenciasVisuales() {
    if (sugerenciasService && sugerenciasService.limpiarTodo) {
      sugerenciasService.limpiarTodo();
      return;
    }

    if (sugerenciasService && sugerenciasService.limpiar) {
      sugerenciasService.limpiar();
      return;
    }

    ui.clearSuggestions();
  }

  function mostrarSugerenciasNoDisponibles(error) {
    var mensaje = config.textos && config.textos.sugerenciasNoDisponibles
      ? config.textos.sugerenciasNoDisponibles
      : 'No se pudieron generar sugerencias en este momento. Puedes escribir el título manualmente o intentarlo más tarde.';

    var mostrarTecnico = config &&
      config.iaOrquestador &&
      config.iaOrquestador.mostrarErroresTecnicosAlEstudiante === true;

    if (error && error.message && mostrarTecnico) {
      mensaje += ' Detalle técnico: ' + limpiarMensajeTecnico(error.message);
    }

    if (modalService && modalService.mostrarAlerta) {
      modalService.mostrarAlerta(mensaje, {
        titulo: 'Sugerencias no disponibles'
      });
      return;
    }

    ui.showAlert(mensaje, '', 'Sugerencias no disponibles');
  }

  function validarBaseParaSugerencias(propuesta) {
    if (!propuesta) {
      return {
        ok: false,
        mensaje: 'Completa la información de la propuesta antes de generar sugerencias.',
        selector: ''
      };
    }

    if (!propuesta.temaGeneral) {
      return {
        ok: false,
        mensaje: 'Para generar sugerencias, primero escribe el tema general de la propuesta ' + propuesta.numero + '.',
        selector: '#p' + propuesta.numero + 'Tema'
      };
    }

    if (!propuesta.problemaNecesidad) {
      return {
        ok: false,
        mensaje: 'Para generar sugerencias, primero escribe el problema o necesidad de la propuesta ' + propuesta.numero + '.',
        selector: '#p' + propuesta.numero + 'Problema'
      };
    }

    if (!propuesta.objetivo) {
      return {
        ok: false,
        mensaje: 'Para generar sugerencias, primero escribe el objetivo simple de la propuesta ' + propuesta.numero + '.',
        selector: '#p' + propuesta.numero + 'Objetivo'
      };
    }

    return {
      ok: true,
      mensaje: '',
      selector: ''
    };
  }

  function guardarBorradorManual() {
    var formData;
    var resultado;
    var guardado;

    if (!estado.estudiante) {
      ui.showAlert('Primero consulta la cédula del estudiante.', '#cedulaInput');
      return;
    }

    if (estado.enviadoFinal) {
      ui.showAlert('El envío ya fue registrado. No es necesario guardar borrador.', '');
      return;
    }

    formData = ui.readFormData(config.propuestasObligatorias);
    resultado = validaciones.validarFormularioParaBorrador(formData);

    if (!resultado.ok) {
      ui.showAlert(resultado.mensaje, '');
      return;
    }

    guardado = formularioService.guardarBorrador(estado.estudiante, estado.appConfig, formData);

    ui.showStatus('#envioMensaje', guardado.mensaje, guardado.ok ? 'success' : 'warning');
  }

  function programarAutoGuardado() {
    if (!estado.estudiante || !config.borradorLocalActivo || estado.enviadoFinal) {
      return;
    }

    window.clearTimeout(estado.autoGuardadoTimer);

    estado.autoGuardadoTimer = window.setTimeout(function () {
      var formData = ui.readFormData(config.propuestasObligatorias);
      var resultado = validaciones.validarFormularioParaBorrador(formData);

      if (resultado.ok && formularioService.guardarBorrador) {
        formularioService.guardarBorrador(estado.estudiante, estado.appConfig, formData);
      }
    }, 800);
  }

  function limpiarBorradorManual() {
    var resultado;

    if (!estado.estudiante) {
      ui.showAlert('Primero consulta la cédula del estudiante.', '#cedulaInput');
      return;
    }

    if (!formularioService.eliminarBorrador) {
      ui.showAlert('No se pudo limpiar el borrador.', '');
      return;
    }

    resultado = formularioService.eliminarBorrador(estado.estudiante, estado.appConfig);

    ui.showStatus('#envioMensaje', resultado.mensaje, resultado.ok ? 'success' : 'warning');
  }

  function mostrarVistaPrevia() {
    prepararResumen(false);
  }

  function manejarEnvio(event) {
    event.preventDefault();
    prepararResumen(true);
  }

  function prepararResumen(abrirComoEnvio) {
    var formData;
    var resultado;

    if (!estado.estudiante) {
      ui.showAlert('Primero consulta la cédula del estudiante.', '#cedulaInput');
      return;
    }

    if (estado.enviadoFinal) {
      ui.showAlert('Este formulario ya fue enviado y registrado.', '');
      return;
    }

    formData = ui.readFormData(config.propuestasObligatorias);
    resultado = validaciones.validarEnvio(formData, config.propuestasObligatorias);

    ui.clearFieldErrors();

    if (!resultado.ok) {
      ui.showAlert(resultado.mensaje, resultado.selector);
      return;
    }

    estado.ultimoFormulario = formData;
    estado.ultimoPayload = formularioService.construirPayload(
      estado.estudiante,
      estado.appConfig,
      formData,
      estado.envioExistente
    );

    ui.renderSummary(estado.estudiante, formData, estado.ultimoPayload);
    ui.openModal();

    if (!abrirComoEnvio) {
      ui.showStatus('#envioMensaje', 'Vista previa generada correctamente.', 'success');
    }
  }

  function confirmarEnvioFinal() {
    var btnConfirmar = ui.qs('#btnConfirmarEnvio');
    var btnConfirmarModal = ui.qs('#btnConfirmarEnvioModal');

    if (estado.enviadoFinal) {
      ui.closeModal();
      ui.showAlert('El envío ya fue registrado.', '');
      return;
    }

    if (!estado.firebaseListo) {
      ui.closeModal();
      ui.showAlert('No se pudo guardar el envío. Revisa tu conexión e intenta nuevamente.', '');
      return;
    }

    if (!estado.estudiante || !estado.ultimoFormulario || !estado.ultimoPayload) {
      prepararPayloadFinalSinModal();

      if (!estado.ultimoPayload) {
        ui.closeModal();
        ui.showAlert('No hay información lista para enviar.', '');
        return;
      }
    }

    ui.setLoading(btnConfirmar, true, 'Enviando...');
    ui.setLoading(btnConfirmarModal, true, 'Enviando...');
    ui.showStatus('#envioMensaje', 'Registrando propuestas...', 'info');

    repository.guardarEnvioFinal(estado.ultimoPayload)
      .then(function (respuesta) {
        estado.envioExistente = respuesta.data || respuesta;
        estado.ultimoPayload = respuesta.data || respuesta;

        if (formularioService.eliminarBorrador) {
          formularioService.eliminarBorrador(estado.estudiante, estado.appConfig);
        }

        ui.closeModal();
        ui.showStatus('#envioMensaje', 'Propuestas registradas. Generando respaldo...', 'info');

        return respaldarEnSheets(respuesta);
      })
      .then(function (resultadoFinal) {
        estado.ultimoResultadoFinal = resultadoFinal;
        estado.enviadoFinal = true;

        ui.setFormDisabled('#formPropuestas', true);
        ui.renderComprobante(resultadoFinal);

        if (resultadoFinal.sheets && resultadoFinal.sheets.ok) {
          ui.showStatus(
            '#envioMensaje',
            'Propuestas enviadas correctamente y respaldadas. Código de registro: ' + resultadoFinal.id + '.',
            'success'
          );
          return;
        }

        ui.showStatus(
          '#envioMensaje',
          'Propuestas enviadas correctamente. Código de registro: ' + resultadoFinal.id + '.',
          'success'
        );
      })
      .catch(function (error) {
        console.error('[Estudiantes] Error envío:', error);
        ui.showAlert('No se pudo guardar el envío. Revisa tu conexión e intenta nuevamente.', '');
      })
      .finally(function () {
        ui.setLoading(btnConfirmar, false);
        ui.setLoading(btnConfirmarModal, false);
      });
  }

  function respaldarEnSheets(respuestaFirebase) {
    if (!sheetsService || !sheetsService.respaldarEnvio) {
      return Promise.resolve({
        id: respuestaFirebase.id || '',
        firebase: respuestaFirebase,
        sheets: {
          ok: false,
          mensaje: 'Servicio de respaldo no disponible.'
        }
      });
    }

    return sheetsService.respaldarEnvio(respuestaFirebase.data || respuestaFirebase, estado.appConfig)
      .then(function (resultadoSheets) {
        if (!repository.actualizarRespaldoSheets) {
          return resultadoSheets;
        }

        return repository.actualizarRespaldoSheets(
          (respuestaFirebase.data || respuestaFirebase).periodoId,
          (respuestaFirebase.data || respuestaFirebase).cedula,
          resultadoSheets
        ).catch(function () {
          return resultadoSheets;
        });
      })
      .then(function (resultadoSheetsFinal) {
        return {
          id: respuestaFirebase.id || (respuestaFirebase.data && respuestaFirebase.data.id) || '',
          firebase: respuestaFirebase,
          sheets: resultadoSheetsFinal
        };
      })
      .catch(function (error) {
        console.warn('[Estudiantes] Respaldo Sheets no completado:', error);

        return {
          id: respuestaFirebase.id || (respuestaFirebase.data && respuestaFirebase.data.id) || '',
          firebase: respuestaFirebase,
          sheets: {
            ok: false,
            mensaje: error && error.message ? error.message : 'No se pudo generar respaldo.'
          }
        };
      });
  }

  function copiarCodigoRegistro() {
    var codeElement = ui.qs('#codigoRegistroTexto');
    var codigo = codeElement ? String(codeElement.textContent || '').trim() : '';

    if (!codigo || codigo === '—') {
      ui.showAlert('No hay código de registro para copiar.', '');
      return;
    }

    copiarTexto(codigo)
      .then(function () {
        ui.showStatus('#envioMensaje', 'Código de registro copiado.', 'success');
      })
      .catch(function () {
        ui.showAlert('No se pudo copiar automáticamente. Selecciona el código y cópialo manualmente.', '');
      });
  }

  function copiarTexto(texto) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(texto);
    }

    return new Promise(function (resolve, reject) {
      try {
        var textarea = document.createElement('textarea');
        textarea.value = texto;
        textarea.setAttribute('readonly', 'readonly');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';

        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);

        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  function actualizarResumenPreferido() {
    if (!ui || !ui.renderResumenTitulos) {
      return;
    }

    ui.renderResumenTitulos(ui.readFormData(config.propuestasObligatorias));
  }

  function iniciarNuevaConsulta() {
    window.location.reload();
  }

  function limpiarMensajeTecnico(mensaje) {
    return limpiarTexto(mensaje)
      .replace(/key=[^\s&]+/ig, 'key=***')
      .replace(/api[_-]?key[^\s]+/ig, 'apiKey=***')
      .replace(/Bearer\s+[^\s]+/ig, 'Bearer ***')
      .slice(0, 180);
  }

  function limpiarTexto(valor) {
    return String(valor || '').replace(/\s+/g, ' ').trim();
  }
})();