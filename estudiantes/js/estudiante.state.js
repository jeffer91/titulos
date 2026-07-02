/*
  Archivo: estudiante.state.js
  Ruta: estudiantes/js/estudiante.state.js
  Funciones principales del archivo:
  - Centralizar el estado global del módulo estudiantes.
  - Evitar que estudiante.app.js tenga variables globales mezcladas.
  - Guardar estudiante consultado, configuración, envío existente y payload final.
  - Guardar el estado de consulta, recomendaciones, envío final y respuestas de IA.
  - Exponer métodos seguros para leer, actualizar, limpiar y reiniciar el estado.
*/
(function () {
  'use strict';

  var estado = crearEstadoInicial();

  function crearEstadoInicial() {
    return {
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
  }

  function obtener() {
    return estado;
  }

  function snapshot() {
    return {
      estudiante: estado.estudiante,
      appConfig: estado.appConfig,
      envioExistente: estado.envioExistente,
      firebaseListo: estado.firebaseListo,
      ultimoFormulario: estado.ultimoFormulario,
      ultimoPayload: estado.ultimoPayload,
      ultimoResultadoFinal: estado.ultimoResultadoFinal,
      autoGuardadoTimer: estado.autoGuardadoTimer,
      enviadoFinal: estado.enviadoFinal,
      consultaCompletada: estado.consultaCompletada,
      recomendacionesCerradas: estado.recomendacionesCerradas,
      ultimasRespuestasIA: Object.assign({}, estado.ultimasRespuestasIA || {})
    };
  }

  function actualizar(parcial) {
    parcial = parcial || {};

    Object.keys(parcial).forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(estado, key)) {
        estado[key] = parcial[key];
      }
    });

    return estado;
  }

  function establecer(key, value) {
    if (Object.prototype.hasOwnProperty.call(estado, key)) {
      estado[key] = value;
    }

    return estado;
  }

  function reiniciarTodo() {
    limpiarTimerAutoGuardado();
    estado = crearEstadoInicial();
    return estado;
  }

  function reiniciarConsulta(opciones) {
    opciones = opciones || {};

    var firebaseListoAnterior = estado.firebaseListo;
    var appConfigAnterior = estado.appConfig;

    limpiarTimerAutoGuardado();

    estado.estudiante = null;
    estado.appConfig = opciones.conservarAppConfig === true ? appConfigAnterior : null;
    estado.envioExistente = null;
    estado.ultimoFormulario = null;
    estado.ultimoPayload = null;
    estado.ultimoResultadoFinal = null;
    estado.autoGuardadoTimer = null;
    estado.enviadoFinal = false;
    estado.consultaCompletada = false;
    estado.recomendacionesCerradas = false;
    estado.ultimasRespuestasIA = {};

    if (opciones.conservarFirebase !== false) {
      estado.firebaseListo = firebaseListoAnterior;
    } else {
      estado.firebaseListo = false;
    }

    return estado;
  }

  function marcarFirebaseListo(valor) {
    estado.firebaseListo = Boolean(valor);
    return estado.firebaseListo;
  }

  function marcarConsultaCompletada(valor) {
    estado.consultaCompletada = valor !== false;
    return estado.consultaCompletada;
  }

  function marcarRecomendacionesCerradas(valor) {
    estado.recomendacionesCerradas = valor !== false;
    return estado.recomendacionesCerradas;
  }

  function marcarEnvioFinal(valor) {
    estado.enviadoFinal = valor !== false;
    return estado.enviadoFinal;
  }

  function guardarResultadoConsulta(data) {
    data = data || {};

    estado.estudiante = data.estudiante || null;
    estado.appConfig = data.appConfig || estado.appConfig || null;
    estado.envioExistente = data.envioExistente || null;
    estado.consultaCompletada = Boolean(data.estudiante);
    estado.recomendacionesCerradas = false;
    estado.enviadoFinal = false;
    estado.ultimoFormulario = null;
    estado.ultimoPayload = null;
    estado.ultimoResultadoFinal = null;
    estado.ultimasRespuestasIA = {};

    return estado;
  }

  function guardarPayloadFinal(formData, payload) {
    estado.ultimoFormulario = formData || null;
    estado.ultimoPayload = payload || null;

    return {
      formData: estado.ultimoFormulario,
      payload: estado.ultimoPayload
    };
  }

  function guardarResultadoFinal(resultadoFinal) {
    estado.ultimoResultadoFinal = resultadoFinal || null;
    estado.enviadoFinal = Boolean(resultadoFinal);
    return estado.ultimoResultadoFinal;
  }

  function establecerTimerAutoGuardado(timer) {
    limpiarTimerAutoGuardado();
    estado.autoGuardadoTimer = timer || null;
    return estado.autoGuardadoTimer;
  }

  function limpiarTimerAutoGuardado() {
    if (estado.autoGuardadoTimer) {
      window.clearTimeout(estado.autoGuardadoTimer);
      estado.autoGuardadoTimer = null;
    }
  }

  function guardarRespuestaIA(numero, respuesta) {
    numero = Number(numero || 0);

    if (!numero) {
      return null;
    }

    estado.ultimasRespuestasIA[numero] = respuesta || null;
    return estado.ultimasRespuestasIA[numero];
  }

  function obtenerRespuestaIA(numero) {
    numero = Number(numero || 0);
    return estado.ultimasRespuestasIA[numero] || null;
  }

  function limpiarRespuestasIA(numero) {
    if (numero) {
      delete estado.ultimasRespuestasIA[Number(numero)];
      return;
    }

    estado.ultimasRespuestasIA = {};
  }

  function puedeEditar() {
    return Boolean(estado.estudiante) && estado.enviadoFinal !== true;
  }

  window.TAEstudianteState = Object.freeze({
    obtener: obtener,
    snapshot: snapshot,
    actualizar: actualizar,
    establecer: establecer,
    reiniciarTodo: reiniciarTodo,
    reiniciarConsulta: reiniciarConsulta,
    marcarFirebaseListo: marcarFirebaseListo,
    marcarConsultaCompletada: marcarConsultaCompletada,
    marcarRecomendacionesCerradas: marcarRecomendacionesCerradas,
    marcarEnvioFinal: marcarEnvioFinal,
    guardarResultadoConsulta: guardarResultadoConsulta,
    guardarPayloadFinal: guardarPayloadFinal,
    guardarResultadoFinal: guardarResultadoFinal,
    establecerTimerAutoGuardado: establecerTimerAutoGuardado,
    limpiarTimerAutoGuardado: limpiarTimerAutoGuardado,
    guardarRespuestaIA: guardarRespuestaIA,
    obtenerRespuestaIA: obtenerRespuestaIA,
    limpiarRespuestasIA: limpiarRespuestasIA,
    puedeEditar: puedeEditar
  });
})();