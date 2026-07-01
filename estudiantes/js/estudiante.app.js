/* Controlador principal del módulo estudiantes. */
(function () {
  'use strict';

  var config = window.TA_ESTUDIANTES_CONFIG;
  var ui = window.TAEstudianteUI;
  var validaciones = window.TAEstudianteValidaciones;
  var firebaseService = window.TAFirebaseService;
  var repository = window.TAEstudianteRepository;

  var estado = {
    estudiante: null,
    appConfig: null,
    envioExistente: null,
    firebaseListo: false,
    ultimoFormulario: null
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
    if (!firebaseService || !repository) {
      estado.firebaseListo = false;
      ui.setText('#estadoGeneral', 'Firebase no cargado');
      ui.showStatus('#consultaMensaje', 'No se cargaron los archivos de Firebase. Revisa los scripts del HTML.', 'error');
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

    if (formConsulta) {
      formConsulta.addEventListener('submit', manejarConsulta);
    }

    if (formPropuestas) {
      formPropuestas.addEventListener('submit', manejarEnvio);
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
      btnConfirmarEnvio.addEventListener('click', confirmarEnvioVisual);
    }

    ui.qsa('.js-generar-sugerencias').forEach(function (button) {
      button.addEventListener('click', function () {
        manejarSugerencias(Number(button.dataset.propuesta));
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

    if (!resultado.ok) {
      ui.showStatus('#consultaMensaje', resultado.mensaje, 'error');
      return;
    }

    if (!estado.firebaseListo) {
      ui.showStatus('#consultaMensaje', config.textos.firebasePendiente, 'warning');
      return;
    }

    ui.setLoading(btnConsultar, true, 'Consultando...');
    ui.hide('#seccionEstudiante');
    ui.hide('#formPropuestas');
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
        cargarContactoDesdeEstudiante(estado.estudiante);
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
    ui.hide('#seccionEstudiante');
    ui.hide('#formPropuestas');
  }

  function cargarContactoDesdeEstudiante(estudiante) {
    if (!estudiante) return;
    ui.setValue('#celularInput', estudiante.celular || '');
  }

  function mostrarEstadoIntentos(data) {
    var mensaje = 'Formulario habilitado. Intentos disponibles: ' + data.intentosDisponibles + ' de ' + data.maxIntentos + '.';

    if (data.envioExistente) {
      mensaje += ' Ya existe un envío anterior registrado.';
    }

    ui.showStatus('#consultaMensaje', mensaje, 'success');
  }

  function manejarSugerencias(numero) {
    var propuesta = ui.readFormData(config.propuestasObligatorias).propuestas[numero - 1];
    var resultado = validarBaseParaSugerencias(propuesta);

    if (!resultado.ok) {
      ui.showStatus('#envioMensaje', resultado.mensaje, 'error');
      return;
    }

    var sugerencias = generarSugerenciasVisuales(propuesta);
    ui.renderSuggestions(numero, sugerencias);
    ui.showStatus('#envioMensaje', config.textos.iaPendiente + ' Por ahora se muestran sugerencias visuales de prueba.', 'info');
  }

  function validarBaseParaSugerencias(propuesta) {
    if (!propuesta.temaGeneral) {
      return { ok: false, mensaje: 'Para generar sugerencias, primero escribe el tema general de la propuesta ' + propuesta.numero + '.' };
    }

    if (!propuesta.problemaNecesidad) {
      return { ok: false, mensaje: 'Para generar sugerencias, primero escribe el problema o necesidad de la propuesta ' + propuesta.numero + '.' };
    }

    if (!propuesta.objetivo) {
      return { ok: false, mensaje: 'Para generar sugerencias, primero escribe el objetivo simple de la propuesta ' + propuesta.numero + '.' };
    }

    return { ok: true, mensaje: '' };
  }

  function generarSugerenciasVisuales(propuesta) {
    var tema = limpiarFrase(propuesta.temaGeneral);
    var contexto = limpiarFrase(propuesta.lugarContexto || 'un contexto académico definido');
    var grupo = limpiarFrase(propuesta.grupoEstudio || 'la población de estudio');
    var periodo = limpiarFrase(propuesta.anioPeriodo || 'el período seleccionado');

    return [
      'Análisis de ' + tema + ' en ' + contexto + ' durante ' + periodo,
      'Evaluación de ' + tema + ' en ' + grupo + ' dentro de ' + contexto,
      'Propuesta de mejora para ' + tema + ' aplicada a ' + contexto + ' en ' + periodo
    ];
  }

  function limpiarFrase(valor) {
    return String(valor || '')
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[.]+$/g, '');
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

    if (!resultado.ok) {
      ui.showStatus('#envioMensaje', resultado.mensaje, 'error');
      return;
    }

    estado.ultimoFormulario = formData;
    ui.renderSummary(estado.estudiante, formData);
    ui.openModal();

    if (!abrirComoEnvio) {
      ui.showStatus('#envioMensaje', 'Vista previa generada correctamente.', 'success');
    }
  }

  function confirmarEnvioVisual() {
    var btnConfirmar = ui.qs('#btnConfirmarEnvio');

    if (!estado.estudiante || !estado.ultimoFormulario) {
      ui.closeModal();
      ui.showStatus('#envioMensaje', 'No hay información lista para enviar.', 'error');
      return;
    }

    ui.setLoading(btnConfirmar, true, 'Confirmando...');

    window.setTimeout(function () {
      ui.closeModal();
      ui.setLoading(btnConfirmar, false);
      ui.showStatus('#envioMensaje', 'Bloque 2 completado: consulta Firebase activa. ' + config.textos.envioPendiente, 'success');
    }, 450);
  }

  function obtenerMensajeError(error) {
    return error && error.message ? error.message : String(error || 'Error desconocido');
  }
})();
