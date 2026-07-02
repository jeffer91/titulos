/*
  Archivo: ia.service.js
  Ruta: estudiantes/js/ia.service.js
  Funciones principales del archivo:
  - Funcionar como fachada principal de generación de sugerencias IA para estudiantes.
  - Delegar la generación real al orquestador multi IA.
  - Mantener compatibilidad con estudiante.app.js mediante window.TAEstudianteIA.
  - Exponer funciones de prompt y limpieza usadas por otros servicios.
  - Evitar que la pantalla estudiantes dependa directamente de proveedores específicos.
*/
(function () {
  'use strict';

  var promptService = window.TATitulosPrompt;
  var orquestador = window.TAIAOrquestador;

  function generarSugerencias(params) {
    params = params || {};

    if (window.TAIAOrquestador && window.TAIAOrquestador.generarSugerencias) {
      return window.TAIAOrquestador.generarSugerencias(params);
    }

    return Promise.reject(new Error('El orquestador de IA no está cargado. Revisa el orden de scripts en estudiante.html.'));
  }

  function construirPrompt(estudiante, propuesta) {
    if (promptService && promptService.construirPrompt) {
      return promptService.construirPrompt(estudiante, propuesta);
    }

    return construirPromptBasico(estudiante, propuesta);
  }

  function construirPromptPorEnfoque(estudiante, propuesta, enfoque, titulosPrevios) {
    if (promptService && promptService.construirPromptPorEnfoque) {
      return promptService.construirPromptPorEnfoque(estudiante, propuesta, enfoque, titulosPrevios);
    }

    return construirPromptBasico(estudiante, propuesta) + '\n\nEnfoque obligatorio: ' + obtenerEtiquetaEnfoque(enfoque) + '.';
  }

  function limpiarSugerencias(texto) {
    if (promptService && promptService.limpiarSugerencias) {
      return promptService.limpiarSugerencias(texto);
    }

    return String(texto || '')
      .split('\n')
      .map(limpiarTitulo)
      .filter(function (linea) {
        return linea.length >= 20;
      })
      .slice(0, 3);
  }

  function construirPromptBasico(estudiante, propuesta) {
    estudiante = estudiante || {};
    propuesta = propuesta || {};

    return [
      'Actúa como experto en redacción de títulos académicos para artículos científicos de nivel tecnológico superior.',
      'Genera títulos formales, delimitados y directamente relacionados con la carrera del estudiante.',
      '',
      'Estructura obligatoria:',
      '[Tipo de estudio] + [variable principal] + [variable secundaria o problema] + [población o unidad de análisis] + [contexto o lugar] + [periodo si aplica]',
      '',
      'Carrera: ' + limpiarTexto(estudiante.carrera || estudiante.nombreCarrera),
      'Tema general: ' + limpiarTexto(propuesta.temaGeneral),
      'Grupo de estudio: ' + limpiarTexto(propuesta.grupoEstudio),
      'Lugar o contexto: ' + limpiarTexto(propuesta.lugarContexto),
      'Año o período: ' + limpiarTexto(propuesta.anioPeriodo),
      'Problema o necesidad: ' + limpiarTexto(propuesta.problemaNecesidad),
      'Objetivo simple: ' + limpiarTexto(propuesta.objetivo),
      '',
      'Responde únicamente con títulos académicos completos.'
    ].join('\n');
  }

  function obtenerEtiquetaEnfoque(enfoque) {
    var validator = window.TATitulosAcademicValidator;

    if (validator && validator.obtenerEtiquetaEnfoque) {
      return validator.obtenerEtiquetaEnfoque(enfoque);
    }

    enfoque = limpiarTexto(enfoque).toLowerCase();

    if (enfoque === 'diagnostico') {
      return 'Diagnóstico';
    }

    if (enfoque === 'propuesta') {
      return 'Propuesta o mejora';
    }

    if (enfoque === 'evaluacion') {
      return 'Evaluación o impacto';
    }

    return 'Título académico';
  }

  function limpiarTitulo(valor) {
    var validator = window.TATitulosAcademicValidator;

    if (validator && validator.limpiarTitulo) {
      return validator.limpiarTitulo(valor);
    }

    return limpiarTexto(valor)
      .replace(/^\s*[-*•]\s*/g, '')
      .replace(/^\s*\d+[).:-]\s*/g, '')
      .replace(/^\s*(Título|Titulo|Opción|Opcion|Sugerencia)\s*\d*\s*[:.-]\s*/i, '')
      .replace(/^\s*["“”'«»]+|["“”'«»]+\s*$/g, '')
      .trim();
  }

  function limpiarTexto(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  window.TAEstudianteIA = Object.freeze({
    generarSugerencias: generarSugerencias,
    construirPrompt: construirPrompt,
    construirPromptPorEnfoque: construirPromptPorEnfoque,
    limpiarSugerencias: limpiarSugerencias,
    orquestador: orquestador || null
  });
})();