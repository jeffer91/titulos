/* Controlador principal del módulo estudiantes. */
(function () {
  'use strict';

  var config = window.TA_ESTUDIANTES_CONFIG;
  var ui = window.TAEstudianteUI;
  var validaciones = window.TAEstudianteValidaciones;
  var firebaseService = window.TAFirebaseService;
  var repository = window.TAEstudianteRepository;
  var formularioService = window.TAEstudianteFormulario;
  var iaService = window.TAEstudianteIA;
  var sheetsService = window.TAEstudianteSheets;

  var estado = {
    estudiante: null,
    appConfig: null,
    envioExistente: null,
    firebaseListo: false,
    ultimoFormulario: null,
    ultimoPayload: null,
    autoGuardadoTimer: null
  };

  document.addEventListener('DOMContentLoaded', iniciar);

  function iniciar() {
    ui.setText('#estadoGeneral', 'Conectando Firebase');
    ui.showStatus('#consultaMensaje', 'Inicializando conexión con Firebase...', 'info');
    conectarEventos();
    limpiarCedulaMientrasEscribe();
    iniciarFirebase();
  }

  function iniciarFirebase() {
    if (!firebaseService || !repository || !formularioService || !iaService || !sheetsService) {
      estado.firebaseListo = false;
      ui.setText('#estadoGeneral', 'Archivos incompletos');
      ui.showStatus('#consultaMensaje', 'No se cargaron todos los archivos del módulo estudiantes. Revisa los scripts del HTML.', 'error');
      bloquearConsulta(true);
      return;
    }

    firebaseService.iniciar(config.firebase).then(function (resultado) {
      estado.firebaseListo = resultado.ok;

      if (!resultado.ok) {
        ui.setText('#estadoGeneral', 'Firebase pendiente');
        ui.showStatus('#consultaMensaje', resultado.mensaje, 'warning');
        bloquearConsulta(true);
        return;
      }

      ui.setText('#estadoGeneral', 'Firebase conectado');
      ui.showStatus('#consultaMensaje', config.textos.firebaseConectado, 'success');
      bloquearConsulta(false);
    });
  }

  function bloquearConsulta(bloquear) {
    var btnConsultar = ui.qs('#btnConsultar');
    var cedulaInput = ui.qs('#cedulaInput');

    if (btnConsultar) btnConsultar.disabled = Boolean(bloquear);
    if (cedulaInput) cedulaInput.disabled = Boolean(bloquear);
  }

  function conectarEventos() {
    var formConsulta = ui.qs('#formConsulta');
    var formPropuestas = ui.qs('#formPropuestas');
    var btnVistaPrevia = ui.qs('#btnVistaPrevia');
    var btnCerrarModal = ui.qs('#btnCerrarModal');
    var btnCancelarResumen = ui.qs('#btnCancelarResumen');
    var btnConfirmarEnvio = ui.qs('#btnConfirmarEnvio');
    var btnGuardarBorrador = ui.qs('#btnGuardarBorrador');
    var btnLimpiarBorrador = ui.qs('#btnLimpiarBorrador');

    if (formConsulta) formConsulta.addEventListener('submit', manejarConsulta);

    if (formPropuestas) {
      formPropuestas.addEventListener('submit', manejarEnvio);
      formPropuestas.addEventListener('input', programarAutoGuardado);
      formPropuestas.addEventListener('change', programarAutoGuardado);
    }

    if (btnVistaPrevia) btnVistaPrevia.addEventListener('click', mostrarVistaPrevia);
    if (btnGuardarBorrador) btnGuardarBorrador.addEventListener('click', guardarBorradorManual);
    if (btnLimpiarBorrador) btnLimpiarBorrador.addEventListener('click', limpiarBorradorManual);
    if (btnCerrarModal) btnCerrarModal.addEventListener('click', ui.closeModal);
    if (btnCancelarResumen) btnCancelarResumen.addEventListener('click', ui.closeModal);
    if (btnConfirmarEnvio) btnConfirmarEnvio.addEventListener('click', confirmarEnvioFinal);

    ui.qsa('.js-generar-sugerencias').forEach(function (button) {
      button.addEventListener('click', function () {
        manejarSugerencias(Number(button.dataset.propuesta), button);
      });
    });
  }

  function limpiarCedulaMientrasEscribe() {
    var input = ui.qs('#cedulaInput');
    if (!input) return;

    input.addEventListener('input', function () {
      input.value = validaciones.limpiarCedula(input.value);
    });
  }

  function manejarConsulta(event) {
    event.preventDefault();

    var btnConsultar = ui.qs('#btnConsultar');
    var cedula = ui.value('#cedulaInput');
    var resultado = validaciones.validarCedulaBasica(cedula);

    ui.clearFieldErrors();

    if (!resultado.ok) {
      ui.showStatus('#consultaMensaje', resultado.mensaje, 'error');
      if (resultado.selector) ui.markFieldError(resultado.selector);
      return;
    }

    if (!estado.firebaseListo) {
      ui.showStatus('#consultaMensaje', config.textos.firebasePendiente, 'warning');
      return;
    }

    ui.setLoading(btnConsultar, true, 'Consultando...');
    limpiarEstadoConsulta();
    ui.showStatus('#consultaMensaje', 'Buscando estudiante en Firebase...', 'info');

    repository.consultarEstudianteCompleto(resultado.data)
      .then(function (respuesta) {
        if (!respuesta || !respuesta.ok) {
          ui.showStatus('#consultaMensaje', respuesta ? respuesta.mensaje : 'No se encontró información del estudiante.', 'error');
          limpiarEstadoConsulta();
          return;
        }

        estado.estudiante = respuesta.data.estudiante;
        estado.appConfig = respuesta.data.appConfig;
        estado.envioExistente = respuesta.data.envioExistente;

        ui.renderStudent(estado.estudiante);
        inicializarFormularioTrasConsulta(respuesta.data);
        mostrarEstadoIntentos(respuesta.data);
      })
      .catch(function (error) {
        limpiarEstadoConsulta();
        ui.showStatus('#consultaMensaje', 'Error al consultar Firebase: ' + obtenerMensajeError(error), 'error');
      })
      .finally(function () {
        ui.setLoading(btnConsultar, false);
      });
  }

  function limpiarEstadoConsulta() {
    estado.estudiante = null;
    estado.appConfig = null;
    estado.envioExistente = null;
    estado.ultimoFormulario = null;
    estado.ultimoPayload = null;
    ui.hide('#seccionEstudiante');
    ui.hide('#formPropuestas');
    ui.clearSuggestions();
    ui.clearFieldErrors();
    ui.showStatus('#envioMensaje', '', 'info');
  }

  function inicializarFormularioTrasConsulta(data) {
    var formDataExistente = null;
    var borrador = null;

    limpiarFormularioVisual();
    cargarContactoDesdeEstudiante(estado.estudiante);

    if (data.envioExistente) {
      formDataExistente = formularioService.formDataDesdeEnvio(data.envioExistente, config.propuestasObligatorias);
      ui.fillFormData(formDataExistente);
      ui.showStatus('#envioMensaje', 'Se cargó el último envío registrado para revisión.', 'info');
    }

    borrador = formularioService.leerBorrador(estado.estudiante, estado.appConfig);
    if (borrador && borrador.formData) {
      ui.fillFormData(borrador.formData);
      ui.showStatus('#envioMensaje', config.textos.borradorRestaurado, 'success');
    }
  }

  function limpiarFormularioVisual() {
    var vacio = {
      telegram: '',
      celular: '',
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

    ui.fillFormData(vacio);
    ui.clearSuggestions();
  }

  function cargarContactoDesdeEstudiante(estudiante) {
    if (!estudiante) return;
    ui.setValue('#celularInput', estudiante.celular || '');
  }

  function mostrarEstadoIntentos(data) {
    var mensaje = 'Formulario habilitado. Intentos disponibles: ' + data.intentosDisponibles + ' de ' + data.maxIntentos + '.';

    if (data.envioExistente) mensaje += ' Ya existe un envío anterior registrado.';

    ui.showStatus('#consultaMensaje', mensaje, 'success');
  }

  function manejarSugerencias(numero, button) {
    var propuesta = ui.readFormData(config.propuestasObligatorias).propuestas[numero - 1];
    var resultado = validarBaseParaSugerencias(propuesta);

    ui.clearFieldErrors();

    if (!resultado.ok) {
      ui.showStatus('#envioMensaje', resultado.mensaje, 'error');
      if (resultado.selector) ui.markFieldError(resultado.selector);
      return;
    }

    if (!estado.estudiante) {
      ui.showStatus('#envioMensaje', 'Primero consulta la cédula del estudiante.', 'error');
      return;
    }

    if (estado.appConfig && estado.appConfig.iaActiva === false) {
      ui.showStatus('#envioMensaje', config.textos.iaPendiente, 'warning');
      return;
    }

    ui.setLoading(button, true, 'Generando...');
    ui.showStatus('#envioMensaje', config.textos.iaGenerando || 'Generando sugerencias con IA...', 'info');

    iaService.generarSugerencias({
      estudiante: estado.estudiante,
      appConfig: estado.appConfig,
      propuesta: propuesta
    })
      .then(function (respuesta) {
        ui.renderSuggestions(numero, respuesta.sugerencias);
        ui.showStatus('#envioMensaje', (config.textos.iaLista || 'Sugerencias generadas correctamente.') + ' Proveedor: ' + respuesta.proveedor + '.', 'success');
      })
      .catch(function (error) {
        ui.showStatus('#envioMensaje', 'No se pudieron generar sugerencias con IA: ' + obtenerMensajeError(error), 'error');
      })
      .finally(function () {
        ui.setLoading(button, false);
      });
  }

  function validarBaseParaSugerencias(propuesta) {
    if (!propuesta.temaGeneral) {
      return { ok: false, mensaje: 'Para generar sugerencias, primero escribe el tema general de la propuesta ' + propuesta.numero + '.', selector: '#p' + propuesta.numero + 'Tema' };
    }

    if (!propuesta.problemaNecesidad) {
      return { ok: false, mensaje: 'Para generar sugerencias, primero escribe el problema o necesidad de la propuesta ' + propuesta.numero + '.', selector: '#p' + propuesta.numero + 'Problema' };
    }

    if (!propuesta.objetivo) {
      return { ok: false, mensaje: 'Para generar sugerencias, primero escribe el objetivo simple de la propuesta ' + propuesta.numero + '.', selector: '#p' + propuesta.numero + 'Objetivo' };
    }

    return { ok: true, mensaje: '', selector: '' };
  }

  function guardarBorradorManual() {
    var formData = ui.readFormData(config.propuestasObligatorias);
    var resultado = validaciones.validarFormularioParaBorrador(formData);

    if (!estado.estudiante) {
      ui.showStatus('#envioMensaje', 'Primero consulta la cédula del estudiante.', 'error');
      return;
    }

    if (!resultado.ok) {
      ui.showStatus('#envioMensaje', resultado.mensaje, 'warning');
      return;
    }

    var guardado = formularioService.guardarBorrador(estado.estudiante, estado.appConfig, formData);
    ui.showStatus('#envioMensaje', guardado.mensaje, guardado.ok ? 'success' : 'warning');
  }

  function programarAutoGuardado() {
    if (!estado.estudiante || !config.borradorLocalActivo) return;

    window.clearTimeout(estado.autoGuardadoTimer);
    estado.autoGuardadoTimer = window.setTimeout(function () {
      var formData = ui.readFormData(config.propuestasObligatorias);
      var resultado = validaciones.validarFormularioParaBorrador(formData);
      if (resultado.ok) formularioService.guardarBorrador(estado.estudiante, estado.appConfig, formData);
    }, 800);
  }

  function limpiarBorradorManual() {
    if (!estado.estudiante) {
      ui.showStatus('#envioMensaje', 'Primero consulta la cédula del estudiante.', 'error');
      return;
    }

    var resultado = formularioService.eliminarBorrador(estado.estudiante, estado.appConfig);
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
    if (!estado.estudiante) {
      ui.showStatus('#envioMensaje', 'Primero consulta la cédula del estudiante.', 'error');
      return;
    }

    var formData = ui.readFormData(config.propuestasObligatorias);
    var resultado = validaciones.validarEnvio(formData, config.propuestasObligatorias);

    ui.clearFieldErrors();

    if (!resultado.ok) {
      ui.showStatus('#envioMensaje', resultado.mensaje, 'error');
      if (resultado.selector) ui.markFieldError(resultado.selector);
      return;
    }

    estado.ultimoFormulario = formData;
    estado.ultimoPayload = formularioService.construirPayload(estado.estudiante, estado.appConfig, formData, estado.envioExistente);
    ui.renderSummary(estado.estudiante, formData, estado.ultimoPayload);
    ui.openModal();

    if (!abrirComoEnvio) ui.showStatus('#envioMensaje', 'Vista previa generada correctamente.', 'success');
  }

  function confirmarEnvioFinal() {
    var btnConfirmar = ui.qs('#btnConfirmarEnvio');

    if (!estado.firebaseListo) {
      ui.closeModal();
      ui.showStatus('#envioMensaje', 'Firebase no está conectado. No se puede guardar el envío.', 'error');
      return;
    }

    if (!estado.estudiante || !estado.ultimoFormulario || !estado.ultimoPayload) {
      ui.closeModal();
      ui.showStatus('#envioMensaje', 'No hay información lista para enviar.', 'error');
      return;
    }

    ui.setLoading(btnConfirmar, true, 'Enviando...');
    ui.showStatus('#envioMensaje', 'Guardando propuestas en Firebase...', 'info');

    repository.guardarEnvioFinal(estado.ultimoPayload)
      .then(function (respuesta) {
        estado.envioExistente = respuesta.data;
        estado.ultimoPayload = respuesta.data;
        formularioService.eliminarBorrador(estado.estudiante, estado.appConfig);
        ui.closeModal();
        ui.showStatus('#envioMensaje', 'Propuestas guardadas en Firebase. Enviando respaldo a Google Sheets...', 'info');
        return respaldarEnSheets(respuesta);
      })
      .then(function (resultadoFinal) {
        if (resultadoFinal.sheets && resultadoFinal.sheets.ok) {
          ui.showStatus('#envioMensaje', 'Propuestas enviadas correctamente y respaldadas en Google Sheets. Código de registro: ' + resultadoFinal.id + '.', 'success');
          return;
        }

        ui.showStatus('#envioMensaje', 'Propuestas enviadas correctamente. Código de registro: ' + resultadoFinal.id + '. Advertencia: ' + resultadoFinal.sheets.mensaje, 'warning');
      })
      .catch(function (error) {
        ui.showStatus('#envioMensaje', 'No se pudo guardar el envío: ' + obtenerMensajeError(error), 'error');
      })
      .finally(function () {
        ui.setLoading(btnConfirmar, false);
      });
  }

  function respaldarEnSheets(respuestaFirebase) {
    return sheetsService.respaldarEnvio(respuestaFirebase.data, estado.appConfig)
      .then(function (resultadoSheets) {
        return repository.actualizarRespaldoSheets(
          respuestaFirebase.data.periodoId,
          respuestaFirebase.data.cedula,
          resultadoSheets
        ).catch(function () {
          return resultadoSheets;
        }).then(function (respaldoRegistrado) {
          return {
            id: respuestaFirebase.id,
            firebase: respuestaFirebase,
            sheets: respaldoRegistrado || resultadoSheets
          };
        });
      });
  }

  function obtenerMensajeError(error) {
    return error && error.message ? error.message : String(error || 'Error desconocido');
  }
})();
