/*
  Archivo: estudiante.borrador.controller.js
  Ruta: estudiantes/js/estudiante.borrador.controller.js
  Funciones principales del archivo:
  - Controlar guardado manual de borrador local.
  - Controlar autoguardado mientras el estudiante escribe.
  - Validar si el formulario tiene datos suficientes para guardar borrador.
  - Eliminar borrador local cuando el usuario lo solicita.
  - Evitar guardar borradores después del envío final.
  - Separar la lógica de borrador del archivo estudiante.app.js.
*/
(function () {
  'use strict';

  function guardarBorradorManual() {
    var state = window.TAEstudianteState;
    var ui = window.TAEstudianteUI;
    var validaciones = window.TAEstudianteValidaciones;
    var formularioService = window.TAEstudianteFormulario;
    var estado = state ? state.obtener() : {};
    var formData;
    var resultado;
    var guardado;

    if (!ui) {
      return;
    }

    if (!estado.estudiante) {
      ui.showAlert('Primero consulta la cédula del estudiante.', '#cedulaInput');
      return;
    }

    if (estado.enviadoFinal) {
      ui.showAlert('El envío ya fue registrado. No es necesario guardar borrador.', '');
      return;
    }

    if (!formularioService || !formularioService.guardarBorrador) {
      ui.showAlert('No se pudo guardar el borrador porque el servicio no está disponible.', '');
      return;
    }

    formData = leerFormularioSeguro();

    if (!formData) {
      ui.showAlert('No se pudo leer la información del formulario.', '');
      return;
    }

    if (validaciones && validaciones.validarFormularioParaBorrador) {
      resultado = validaciones.validarFormularioParaBorrador(formData);

      if (!resultado.ok) {
        ui.showAlert(resultado.mensaje, resultado.selector);
        return;
      }
    }

    guardado = formularioService.guardarBorrador(
      estado.estudiante,
      estado.appConfig,
      formData
    );

    ui.showStatus(
      '#envioMensaje',
      guardado && guardado.mensaje
        ? guardado.mensaje
        : obtenerTextoConfig('borradorGuardado', 'Borrador local guardado en este equipo.'),
      guardado && guardado.ok === false ? 'warning' : 'success'
    );
  }

  function programarAutoGuardado() {
    var state = window.TAEstudianteState;
    var config = window.TA_ESTUDIANTES_CONFIG || {};
    var estado = state ? state.obtener() : {};

    if (!state) {
      return;
    }

    if (!estado.estudiante || config.borradorLocalActivo === false || estado.enviadoFinal) {
      return;
    }

    state.establecerTimerAutoGuardado(window.setTimeout(function () {
      autoGuardarAhora();
    }, 800));
  }

  function autoGuardarAhora() {
    var state = window.TAEstudianteState;
    var validaciones = window.TAEstudianteValidaciones;
    var formularioService = window.TAEstudianteFormulario;
    var estado = state ? state.obtener() : {};
    var formData;
    var resultado;

    if (!estado.estudiante || estado.enviadoFinal) {
      return;
    }

    if (!formularioService || !formularioService.guardarBorrador) {
      return;
    }

    formData = leerFormularioSeguro();

    if (!formData) {
      return;
    }

    if (validaciones && validaciones.validarFormularioParaBorrador) {
      resultado = validaciones.validarFormularioParaBorrador(formData);

      if (!resultado.ok) {
        return;
      }
    }

    formularioService.guardarBorrador(
      estado.estudiante,
      estado.appConfig,
      formData
    );
  }

  function limpiarBorradorManual() {
    var state = window.TAEstudianteState;
    var ui = window.TAEstudianteUI;
    var formularioService = window.TAEstudianteFormulario;
    var estado = state ? state.obtener() : {};
    var resultado;

    if (!ui) {
      return;
    }

    if (!estado.estudiante) {
      ui.showAlert('Primero consulta la cédula del estudiante.', '#cedulaInput');
      return;
    }

    if (!formularioService || !formularioService.eliminarBorrador) {
      ui.showAlert('No se pudo limpiar el borrador.', '');
      return;
    }

    resultado = formularioService.eliminarBorrador(
      estado.estudiante,
      estado.appConfig
    );

    ui.showStatus(
      '#envioMensaje',
      resultado && resultado.mensaje ? resultado.mensaje : 'Borrador eliminado.',
      resultado && resultado.ok === false ? 'warning' : 'success'
    );
  }

  function limpiarBorradorSilencioso() {
    var state = window.TAEstudianteState;
    var formularioService = window.TAEstudianteFormulario;
    var estado = state ? state.obtener() : {};

    if (!estado.estudiante) {
      return;
    }

    if (!formularioService || !formularioService.eliminarBorrador) {
      return;
    }

    try {
      formularioService.eliminarBorrador(estado.estudiante, estado.appConfig);
    } catch (error) {
      console.warn('[Estudiantes] No se pudo eliminar el borrador local:', error);
    }
  }

  function leerFormularioSeguro() {
    var ui = window.TAEstudianteUI;

    if (!ui || !ui.readFormData) {
      return null;
    }

    return ui.readFormData(obtenerTotalPropuestas());
  }

  function obtenerTextoConfig(key, fallback) {
    var config = window.TA_ESTUDIANTES_CONFIG || {};

    if (config.textos && config.textos[key]) {
      return config.textos[key];
    }

    return fallback || '';
  }

  function obtenerTotalPropuestas() {
    var config = window.TA_ESTUDIANTES_CONFIG || {};
    return Number(config.propuestasObligatorias || 3);
  }

  window.TAEstudianteBorradorController = Object.freeze({
    guardarBorradorManual: guardarBorradorManual,
    programarAutoGuardado: programarAutoGuardado,
    autoGuardarAhora: autoGuardarAhora,
    limpiarBorradorManual: limpiarBorradorManual,
    limpiarBorradorSilencioso: limpiarBorradorSilencioso
  });
})();