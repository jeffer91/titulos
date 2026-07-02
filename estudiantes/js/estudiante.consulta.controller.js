/*
  Archivo: estudiante.consulta.controller.js
  Ruta: estudiantes/js/estudiante.consulta.controller.js
  Funciones principales del archivo:
  - Controlar la consulta de cédula del módulo estudiantes.
  - Inicializar Firebase antes de buscar datos.
  - Validar la cédula sin borrar el campo ingresado por el estudiante.
  - Consultar estudiante, configuración y envío existente mediante el repositorio.
  - Guardar el resultado de consulta en estudiante.state.js.
  - Preparar el flujo para que después se abra el modal de recomendaciones.
*/
(function () {
  'use strict';

  function manejarConsulta(event, opciones) {
    var ui = window.TAEstudianteUI;
    var validaciones = window.TAEstudianteValidaciones;
    var state = window.TAEstudianteState;
    var repository = window.TAEstudianteRepository;

    var inputCedula;
    var cedulaOriginal;
    var resultadoCedula;
    var button;

    opciones = opciones || {};

    if (event && event.preventDefault) {
      event.preventDefault();
    }

    if (!ui || !validaciones || !state || !repository) {
      mostrarErrorDependencias();
      return Promise.resolve(null);
    }

    inputCedula = obtenerInputCedula();
    cedulaOriginal = inputCedula ? inputCedula.value : '';
    resultadoCedula = validaciones.validarCedulaBasica(cedulaOriginal);
    button = obtenerBotonConsulta(event);

    ui.clearFieldErrors();

    if (!resultadoCedula.ok) {
      ui.showAlert(resultadoCedula.mensaje, resultadoCedula.selector || '#cedulaInput');
      return Promise.resolve(null);
    }

    if (inputCedula) {
      inputCedula.value = resultadoCedula.data;
    }

    limpiarVistaAntesDeConsultar({
      conservarCedula: resultadoCedula.data
    });

    ui.setLoading(button, true, 'Consultando...');
    ui.showStatus('#consultaMensaje', 'Consultando información del estudiante...', 'info');

    return asegurarFirebase()
      .then(function () {
        return repository.consultarEstudianteCompleto(resultadoCedula.data);
      })
      .then(function (respuesta) {
        var data = normalizarRespuestaConsulta(respuesta);

        if (!data.ok) {
          state.reiniciarConsulta({
            conservarFirebase: true
          });

          restaurarCedula(resultadoCedula.data);
          ui.showStatus('#consultaMensaje', data.mensaje || 'No se pudo completar la consulta.', 'warning');
          ui.showAlert(data.mensaje || 'No se encontró información para la cédula ingresada.', '#cedulaInput');
          return null;
        }

        state.guardarResultadoConsulta(data.data);
        ui.renderStudent(data.data.estudiante);
        ui.showStatus('#consultaMensaje', '', 'success');

        if (typeof opciones.onConsultaExitosa === 'function') {
          opciones.onConsultaExitosa(data.data);
        }

        return data.data;
      })
      .catch(function (error) {
        console.error('[Estudiantes] Error en consulta:', error);

        state.reiniciarConsulta({
          conservarFirebase: true
        });

        restaurarCedula(resultadoCedula.data);

        ui.showStatus('#consultaMensaje', 'No se pudo consultar la información. Revisa la conexión o Firebase.', 'danger');
        ui.showAlert(
          obtenerMensajeError(error) || 'No se pudo consultar la información del estudiante.',
          '#cedulaInput',
          'Error de consulta'
        );

        return null;
      })
      .finally(function () {
        ui.setLoading(button, false);
      });
  }

  function asegurarFirebase() {
    var config = window.TA_ESTUDIANTES_CONFIG;
    var firebaseService = window.TAFirebaseService;
    var state = window.TAEstudianteState;
    var estado = state ? state.obtener() : {};

    if (!firebaseService || !firebaseService.iniciar) {
      return Promise.reject(new Error('El servicio Firebase no está cargado.'));
    }

    if (estado.firebaseListo && firebaseService.estaListo && firebaseService.estaListo()) {
      return Promise.resolve(true);
    }

    return firebaseService.iniciar(config && config.firebase)
      .then(function (resultado) {
        if (resultado && resultado.ok === false) {
          throw new Error(resultado.mensaje || 'Firebase no pudo iniciar.');
        }

        if (state) {
          state.marcarFirebaseListo(true);
        }

        return true;
      });
  }

  function limpiarCedulaMientrasEscribe() {
    var validaciones = window.TAEstudianteValidaciones;
    var input = obtenerInputCedula();

    if (!input || !validaciones || !validaciones.limpiarCedula) {
      return;
    }

    input.addEventListener('input', function () {
      var limpio = validaciones.limpiarCedula(input.value);

      if (input.value !== limpio) {
        input.value = limpio;
      }
    });
  }

  function limpiarVistaAntesDeConsultar(opciones) {
    var ui = window.TAEstudianteUI;
    var state = window.TAEstudianteState;
    var telegramService = window.TAEstudianteTelegram;
    var paginacion = window.TAEstudiantePaginacion;

    opciones = opciones || {};

    if (state) {
      state.reiniciarConsulta({
        conservarFirebase: true
      });
    }

    if (ui) {
      ui.hide('#comprobanteFinal');
      ui.show('#wizardSteps');
      ui.setFormDisabled('#formPropuestas', false);
      ui.clearFieldErrors();
      ui.showStatus('#envioMensaje', '', 'info');
      ui.showStatus('#consultaMensaje', '', 'info');
    }

    if (window.TAEstudianteFormularioController && window.TAEstudianteFormularioController.limpiarFormularioVisual) {
      window.TAEstudianteFormularioController.limpiarFormularioVisual();
    } else {
      limpiarSugerenciasVisuales();
    }

    if (telegramService && telegramService.marcarEstado) {
      telegramService.marcarEstado(false, 'Telegram pendiente de validación.');
    }

    if (paginacion && paginacion.reiniciar) {
      paginacion.reiniciar();
    }

    if (opciones.conservarCedula) {
      restaurarCedula(opciones.conservarCedula);
    }
  }

  function fusionarAppConfig(appConfig) {
    var config = window.TA_ESTUDIANTES_CONFIG || {};
    var base = config.defaultAppConfig || {};

    return Object.assign({}, base, appConfig || {});
  }

  function normalizarRespuestaConsulta(respuesta) {
    var data;

    if (!respuesta) {
      return {
        ok: false,
        data: null,
        mensaje: 'No se encontró un estudiante con esa cédula.'
      };
    }

    if (respuesta.ok === false) {
      return {
        ok: false,
        data: null,
        mensaje: respuesta.mensaje || 'No se pudo validar el acceso del estudiante.'
      };
    }

    data = respuesta.data || respuesta;

    if (!data || !data.estudiante) {
      return {
        ok: false,
        data: null,
        mensaje: respuesta.mensaje || 'No se encontró un estudiante habilitado para este proceso.'
      };
    }

    data.appConfig = fusionarAppConfig(data.appConfig);

    return {
      ok: true,
      data: data,
      mensaje: respuesta.mensaje || ''
    };
  }

  function obtenerInputCedula() {
    return document.querySelector('#cedulaInput') ||
      document.querySelector('#cedula') ||
      document.querySelector('#numeroIdentificacion') ||
      document.querySelector('[name="cedula"]') ||
      document.querySelector('[name="numeroIdentificacion"]');
  }

  function obtenerBotonConsulta(event) {
    if (event && event.submitter) {
      return event.submitter;
    }

    return document.querySelector('#btnConsultar') ||
      document.querySelector('[data-action="consultar"]') ||
      document.querySelector('#consultaForm button[type="submit"]') ||
      document.querySelector('#formConsulta button[type="submit"]');
  }

  function restaurarCedula(cedula) {
    var input = obtenerInputCedula();

    if (input) {
      input.value = cedula || '';
    }
  }

  function limpiarSugerenciasVisuales() {
    var sugerenciasService = window.TAEstudianteSugerencias;
    var ui = window.TAEstudianteUI;

    if (sugerenciasService && sugerenciasService.limpiarTodo) {
      sugerenciasService.limpiarTodo();
      return;
    }

    if (sugerenciasService && sugerenciasService.limpiar) {
      sugerenciasService.limpiar();
      return;
    }

    if (ui && ui.clearSuggestions) {
      ui.clearSuggestions();
    }
  }

  function mostrarErrorDependencias() {
    console.error('[Estudiantes] Faltan dependencias para consultar: UI, validaciones, estado o repositorio.');
  }

  function obtenerMensajeError(error) {
    if (!error) {
      return '';
    }

    if (error.message) {
      return String(error.message);
    }

    return String(error);
  }

  window.TAEstudianteConsultaController = Object.freeze({
    manejarConsulta: manejarConsulta,
    asegurarFirebase: asegurarFirebase,
    limpiarCedulaMientrasEscribe: limpiarCedulaMientrasEscribe,
    limpiarVistaAntesDeConsultar: limpiarVistaAntesDeConsultar,
    fusionarAppConfig: fusionarAppConfig,
    normalizarRespuestaConsulta: normalizarRespuestaConsulta
  });
})();