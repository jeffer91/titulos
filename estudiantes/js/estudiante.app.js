/* Controlador principal del módulo estudiantes. */
(function () {
  'use strict';

  var config = window.TA_ESTUDIANTES_CONFIG;
  var ui = window.TAEstudianteUI;
  var validaciones = window.TAEstudianteValidaciones;

  var estado = {
    estudiante: null,
    ultimoFormulario: null
  };

  document.addEventListener('DOMContentLoaded', iniciar);

  function iniciar() {
    ui.showStatus('#consultaMensaje', config.textos.consultaPendiente, 'info');
    conectarEventos();
    limpiarCedulaMientrasEscribe();
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

    ui.setLoading(btnConsultar, true, 'Consultando...');

    window.setTimeout(function () {
      estado.estudiante = crearEstudianteVisual(resultado.data);
      ui.renderStudent(estado.estudiante);
      ui.showStatus('#consultaMensaje', 'Formulario habilitado. ' + config.textos.firebasePendiente, 'success');
      ui.setLoading(btnConsultar, false);
    }, 350);
  }

  function crearEstudianteVisual(cedula) {
    return {
      cedula: cedula,
      nombres: config.demo.nombres,
      carrera: config.demo.carrera,
      codigoCarrera: config.demo.codigoCarrera,
      periodoId: config.demo.periodoId
    };
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
      ui.showStatus('#envioMensaje', 'Bloque 1 completado: envío visual validado. ' + config.textos.envioPendiente, 'success');
    }, 450);
  }
})();
