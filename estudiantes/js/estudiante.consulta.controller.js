/*
  Archivo: estudiante.consulta.controller.js
  Ruta: estudiantes/js/estudiante.consulta.controller.js
  Funciones principales del archivo:
  - Controlar la consulta de cédula del módulo estudiantes.
  - Mostrar una pantalla de carga durante la consulta de datos académicos.
  - Mantener visible esa carga un tiempo mínimo para evitar saltos bruscos de pantalla.
  - Inicializar Firebase antes de buscar datos.
  - Validar la cédula sin borrar el campo ingresado por el estudiante.
  - Consultar estudiante, configuración y envío existente mediante el repositorio.
  - Guardar el resultado de consulta en estudiante.state.js.
  - Dejar listo el flujo para mostrar datos académicos y continuar con Telegram obligatorio.
*/
(function () {
  'use strict';

  var TIEMPO_MINIMO_CONSULTA_MS = 1400;

  function manejarConsulta(event, opciones) {
    var ui = window.TAEstudianteUI;
    var validaciones = window.TAEstudianteValidaciones;
    var state = window.TAEstudianteState;
    var repository = window.TAEstudianteRepository;

    var inputCedula;
    var cedulaOriginal;
    var resultadoCedula;
    var button;
    var inicioConsulta;

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

    inicioConsulta = Date.now();

    ui.setLoading(button, true, 'Consultando...');
    ui.showStatus('#consultaMensaje', 'Consultando datos académicos...', 'info');

    abrirPopupConsulta({
      titulo: 'Consultando datos académicos',
      detalle: 'Estamos validando tu cédula, período activo y datos académicos. Espera un momento.',
      estado: 'Preparando consulta...',
      paso: 1
    });

    return asegurarFirebase()
      .then(function () {
        actualizarPopupConsulta({
          titulo: 'Consultando datos académicos',
          detalle: 'Conexión lista. Buscando información académica del estudiante.',
          estado: 'Buscando estudiante habilitado...',
          paso: 2
        });

        return repository.consultarEstudianteCompleto(resultadoCedula.data);
      })
      .then(function (respuesta) {
        actualizarPopupConsulta({
          titulo: 'Validando información',
          detalle: 'Estamos revisando que el estudiante pertenezca al período activo.',
          estado: 'Validando período y permisos...',
          paso: 3
        });

        return esperarTiempoRestante(inicioConsulta, TIEMPO_MINIMO_CONSULTA_MS)
          .then(function () {
            return respuesta;
          });
      })
      .then(function (respuesta) {
        var data = normalizarRespuestaConsulta(respuesta);

        if (!data.ok) {
          cerrarPopupConsulta();

          state.reiniciarConsulta({
            conservarFirebase: true
          });

          restaurarCedula(resultadoCedula.data);
          ui.showStatus('#consultaMensaje', data.mensaje || 'No se pudo completar la consulta.', 'warning');
          ui.showAlert(data.mensaje || 'No se encontró información para la cédula ingresada.', '#cedulaInput');
          return null;
        }

        actualizarPopupConsulta({
          titulo: 'Datos encontrados',
          detalle: 'La información académica fue validada correctamente.',
          estado: 'Mostrando datos del estudiante...',
          paso: 4
        });

        state.guardarResultadoConsulta(data.data);

        cerrarPopupConsulta();

        if (typeof ui.renderStudent === 'function') {
          ui.renderStudent(data.data.estudiante);
        }

        ui.showStatus('#consultaMensaje', '', 'success');

        if (typeof opciones.onConsultaExitosa === 'function') {
          opciones.onConsultaExitosa(data.data);
        }

        return data.data;
      })
      .catch(function (error) {
        console.error('[Estudiantes] Error en consulta:', error);

        cerrarPopupConsulta();

        state.reiniciarConsulta({
          conservarFirebase: true
        });

        restaurarCedula(resultadoCedula.data);

        ui.showStatus('#consultaMensaje', 'No se pudo consultar la información. Revisa la conexión o Firebase.', 'error');
        ui.showAlert(
          obtenerMensajeError(error) || 'No se pudo consultar la información del estudiante.',
          '#cedulaInput',
          'Error de consulta'
        );

        return null;
      })
      .finally(function () {
        cerrarPopupConsulta();
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

    if (input.dataset.taCedulaLimpiaConectada === 'true') {
      return;
    }

    input.dataset.taCedulaLimpiaConectada = 'true';

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
    var recomendacionesController = window.TAEstudianteRecomendacionesController;

    opciones = opciones || {};

    if (state) {
      state.reiniciarConsulta({
        conservarFirebase: true
      });
    }

    if (recomendacionesController && typeof recomendacionesController.reiniciar === 'function') {
      recomendacionesController.reiniciar();
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
      telegramService.marcarEstado(false, 'Telegram obligatorio pendiente de validación.');
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

  function abrirPopupConsulta(info) {
    var loading = window.TAEstudianteLoading;

    info = info || {};

    if (loading && typeof loading.abrir === 'function') {
      loading.abrir({
        titulo: info.titulo || 'Consultando datos académicos',
        detalle: info.detalle || 'Estamos validando la información del estudiante.'
      });

      actualizarPopupConsulta(info);
      return;
    }

    abrirPopupConsultaFallback(info);
  }

  function actualizarPopupConsulta(info) {
    var loading = window.TAEstudianteLoading;
    var paso;

    info = info || {};
    paso = Number(info.paso || 1);

    if (loading && typeof loading.abrir === 'function') {
      setTextoSeguro('#iaLoadingTitulo', info.titulo || 'Consultando datos académicos');
      setTextoSeguro('#iaLoadingDetalle', info.detalle || 'Estamos validando la información del estudiante.');
      setTextoSeguro('#iaLoadingEstado', info.estado || 'Procesando consulta...');
      setTextoSeguro('#iaLoadingProveedor', info.estado || 'Procesando consulta...');
      setTextoSeguro('#iaLoadingNota', 'No cierres esta pantalla mientras se validan tus datos.');

      prepararPasosConsulta(paso);
      actualizarBarraConsulta(paso);
      return;
    }

    actualizarPopupConsultaFallback(info);
  }

  function cerrarPopupConsulta() {
    var loading = window.TAEstudianteLoading;

    if (loading && typeof loading.cerrar === 'function') {
      loading.cerrar();
      return;
    }

    cerrarPopupConsultaFallback();
  }

  function prepararPasosConsulta(pasoActual) {
    var contenedor = document.querySelector('#iaLoadingSteps');
    var pasos = [
      {
        id: 'cedula',
        label: 'Validar cédula'
      },
      {
        id: 'firebase',
        label: 'Buscar datos'
      },
      {
        id: 'periodo',
        label: 'Validar período'
      },
      {
        id: 'mostrar',
        label: 'Mostrar datos'
      }
    ];

    if (!contenedor) {
      return;
    }

    contenedor.innerHTML = '';

    pasos.forEach(function (paso, index) {
      var estadoPaso = 'pendiente';
      var item = document.createElement('div');

      if (index + 1 < pasoActual) {
        estadoPaso = 'completado';
      } else if (index + 1 === pasoActual) {
        estadoPaso = 'trabajando';
      }

      item.className = 'ia-loading-step ia-loading-step--' + estadoPaso;
      item.setAttribute('data-step', paso.id);
      item.innerHTML =
        '<span class="ia-loading-step__dot"></span>' +
        '<span class="ia-loading-step__label">' + escaparHtml(paso.label) + '</span>' +
        '<span class="ia-loading-step__status">' + obtenerTextoEstadoPaso(estadoPaso) + '</span>';

      contenedor.appendChild(item);
    });
  }

  function actualizarBarraConsulta(pasoActual) {
    var barra = document.querySelector('#iaLoadingProgressBar') ||
      document.querySelector('.ia-loading-modal__progress-bar');
    var porcentaje = Math.max(15, Math.min(100, Number(pasoActual || 1) * 25));

    if (barra) {
      barra.style.width = porcentaje + '%';
    }
  }

  function abrirPopupConsultaFallback(info) {
    var modal = obtenerPopupConsultaFallback();

    info = info || {};

    modal.classList.remove('is-hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('has-open-modal');

    actualizarPopupConsultaFallback(info);
  }

  function actualizarPopupConsultaFallback(info) {
    var modal = obtenerPopupConsultaFallback();

    info = info || {};

    setTextoEn(modal, '[data-consulta-loading="titulo"]', info.titulo || 'Consultando datos académicos');
    setTextoEn(modal, '[data-consulta-loading="detalle"]', info.detalle || 'Estamos validando la información del estudiante.');
    setTextoEn(modal, '[data-consulta-loading="estado"]', info.estado || 'Procesando consulta...');
  }

  function cerrarPopupConsultaFallback() {
    var modal = document.querySelector('#consultaLoadingModal');

    if (!modal) {
      return;
    }

    modal.classList.add('is-hidden');
    modal.setAttribute('aria-hidden', 'true');

    if (!hayOtroModalAbierto()) {
      document.body.classList.remove('has-open-modal');
    }
  }

  function obtenerPopupConsultaFallback() {
    var modal = document.querySelector('#consultaLoadingModal');

    if (modal) {
      return modal;
    }

    modal = document.createElement('section');
    modal.id = 'consultaLoadingModal';
    modal.className = 'modal consulta-loading-modal is-hidden';
    modal.setAttribute('aria-hidden', 'true');

    modal.innerHTML = [
      '<div class="modal__backdrop"></div>',
      '<div class="modal__panel modal__panel--small" role="dialog" aria-modal="true">',
      '<p class="section-kicker">Consulta académica</p>',
      '<h2 data-consulta-loading="titulo">Consultando datos académicos</h2>',
      '<p data-consulta-loading="detalle">Estamos validando la información del estudiante.</p>',
      '<div class="status-message" data-consulta-loading="estado">Procesando consulta...</div>',
      '</div>'
    ].join('');

    document.body.appendChild(modal);

    return modal;
  }

  function esperarTiempoRestante(inicio, minimoMs) {
    var transcurrido = Date.now() - Number(inicio || Date.now());
    var restante = Math.max(0, Number(minimoMs || 0) - transcurrido);

    return new Promise(function (resolve) {
      window.setTimeout(resolve, restante);
    });
  }

  function obtenerTextoEstadoPaso(estadoPaso) {
    if (estadoPaso === 'completado') {
      return 'Listo';
    }

    if (estadoPaso === 'trabajando') {
      return 'Procesando';
    }

    return 'Pendiente';
  }

  function setTextoSeguro(selector, texto) {
    var element = document.querySelector(selector);

    if (element) {
      element.textContent = texto || '';
    }
  }

  function setTextoEn(root, selector, texto) {
    var element = root ? root.querySelector(selector) : null;

    if (element) {
      element.textContent = texto || '';
    }
  }

  function hayOtroModalAbierto() {
    return Array.prototype.slice.call(document.querySelectorAll('.modal, .ia-loading-modal'))
      .some(function (modal) {
        if (modal.id === 'consultaLoadingModal') {
          return false;
        }

        return !modal.classList.contains('is-hidden');
      });
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

  function escaparHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
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
    normalizarRespuestaConsulta: normalizarRespuestaConsulta,
    abrirPopupConsulta: abrirPopupConsulta,
    actualizarPopupConsulta: actualizarPopupConsulta,
    cerrarPopupConsulta: cerrarPopupConsulta
  });
})();