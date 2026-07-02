/*
  Archivo: estudiante.sugerencias.controller.js
  Ruta: estudiantes/js/estudiante.sugerencias.controller.js
  Funciones principales del archivo:
  - Controlar la generación de sugerencias de títulos con IA.
  - Validar la información mínima de cada propuesta antes de llamar a IA.
  - Abrir, actualizar y cerrar la animación de IA de Titulación.
  - Enviar la propuesta al servicio TAEstudianteIA.
  - Renderizar sugerencias usando TAEstudianteSugerencias.
  - Manejar errores de IA sin exponer nombres técnicos al estudiante.
*/
(function () {
  'use strict';

  function manejarSugerencias(numero, button) {
    var state = window.TAEstudianteState;
    var ui = window.TAEstudianteUI;
    var iaService = window.TAEstudianteIA;
    var estado = state ? state.obtener() : {};
    var formData;
    var propuesta;
    var resultado;

    numero = Number(numero || 0);

    if (!ui) {
      console.error('[Estudiantes] UI no disponible para generar sugerencias.');
      return Promise.resolve(null);
    }

    if (ui.clearFieldErrors) {
      ui.clearFieldErrors();
    }

    if (estado.enviadoFinal) {
      ui.showAlert('El envío ya fue registrado. No se pueden hacer nuevos cambios.', '');
      return Promise.resolve(null);
    }

    if (!estado.estudiante) {
      ui.showAlert('Primero consulta la cédula del estudiante.', '#cedulaInput');
      return Promise.resolve(null);
    }

    if (!numero) {
      ui.showAlert('No se pudo identificar la propuesta para generar sugerencias.', '');
      return Promise.resolve(null);
    }

    formData = leerFormularioSeguro();
    propuesta = formData && formData.propuestas ? formData.propuestas[numero - 1] : null;
    resultado = validarBaseParaSugerencias(propuesta);

    if (!resultado.ok) {
      ui.showAlert(resultado.mensaje, resultado.selector);
      return Promise.resolve(null);
    }

    if (!iaService || !iaService.generarSugerencias) {
      mostrarSugerenciasNoDisponibles();
      return Promise.resolve(null);
    }

    if (estado.appConfig && estado.appConfig.iaActiva === false) {
      mostrarSugerenciasNoDisponibles();
      return Promise.resolve(null);
    }

    ui.setLoading(button, true, 'Generando...');
    ui.showStatus('#envioMensaje', 'IA de Titulación trabajando...', 'info');

    abrirLoadingIA();

    return iaService.generarSugerencias({
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
          return null;
        }

        if (state && state.guardarRespuestaIA) {
          state.guardarRespuestaIA(numero, respuesta);
        }

        ui.showStatus(
          '#envioMensaje',
          obtenerTextoConfig('sugerenciasGeneradas', 'Sugerencias generadas correctamente. Revisa el título antes de elegir.'),
          'success'
        );

        renderizarSugerencias(numero, sugerencias, respuesta);

        return respuesta;
      })
      .catch(function (error) {
        console.error('[Estudiantes] Error IA:', error);
        mostrarSugerenciasNoDisponibles(error);
        return null;
      })
      .finally(function () {
        cerrarLoadingIA();

        if (ui.setLoading) {
          ui.setLoading(button, false);
        }
      });
  }

  function abrirLoadingIA() {
    var loadingService = window.TAEstudianteLoading;

    if (!loadingService || !loadingService.abrir) {
      return;
    }

    loadingService.abrir({
      titulo: 'IA de Titulación trabajando',
      detalle: 'Estamos generando sugerencias académicas completas.'
    });
  }

  function manejarProgresoIA(evento) {
    var loadingService = window.TAEstudianteLoading;

    if (!loadingService || !loadingService.progreso) {
      return;
    }

    loadingService.progreso(evento || {});
  }

  function cerrarLoadingIA() {
    var loadingService = window.TAEstudianteLoading;

    if (!loadingService || !loadingService.cerrar) {
      return;
    }

    window.setTimeout(function () {
      loadingService.cerrar();
    }, 350);
  }

  function renderizarSugerencias(numero, sugerencias, respuestaIA) {
    var state = window.TAEstudianteState;
    var ui = window.TAEstudianteUI;
    var sugerenciasService = window.TAEstudianteSugerencias;
    var formularioController = window.TAEstudianteFormularioController;
    var borradorController = window.TAEstudianteBorradorController;
    var estado = state ? state.obtener() : {};
    var formData = leerFormularioSeguro();
    var propuesta = formData && formData.propuestas ? formData.propuestas[numero - 1] : null;

    if (sugerenciasService && sugerenciasService.renderizar) {
      sugerenciasService.renderizar(numero, sugerencias, {
        estudiante: estado.estudiante,
        propuesta: propuesta,
        respuestaIA: respuestaIA || (state && state.obtenerRespuestaIA ? state.obtenerRespuestaIA(numero) : null),
        onSeleccionar: function () {
          if (borradorController && borradorController.programarAutoGuardado) {
            borradorController.programarAutoGuardado();
          }

          if (formularioController && formularioController.actualizarResumenPreferido) {
            formularioController.actualizarResumenPreferido();
          }
        }
      });

      return;
    }

    if (ui && ui.renderSuggestions) {
      ui.renderSuggestions(numero, sugerencias.map(function (item) {
        return typeof item === 'string' ? item : item && item.texto ? item.texto : '';
      }));
    }
  }

  function mostrarSugerenciasNoDisponibles(error) {
    var ui = window.TAEstudianteUI;
    var modalService = window.TAEstudianteModal;
    var config = window.TA_ESTUDIANTES_CONFIG || {};
    var mensaje = obtenerTextoConfig(
      'sugerenciasNoDisponibles',
      'No se pudieron generar sugerencias en este momento. Puedes escribir el título manualmente o intentarlo nuevamente.'
    );
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

    if (ui && ui.showAlert) {
      ui.showAlert(mensaje, '', 'Sugerencias no disponibles');
    }
  }

  function validarBaseParaSugerencias(propuesta) {
    if (!propuesta) {
      return {
        ok: false,
        mensaje: 'Completa la información de la propuesta antes de generar sugerencias.',
        selector: ''
      };
    }

    if (!limpiarTexto(propuesta.temaGeneral)) {
      return {
        ok: false,
        mensaje: 'Para generar sugerencias, primero escribe el tema general de la propuesta ' + propuesta.numero + '.',
        selector: '#p' + propuesta.numero + 'Tema'
      };
    }

    if (!limpiarTexto(propuesta.problemaNecesidad)) {
      return {
        ok: false,
        mensaje: 'Para generar sugerencias, primero escribe el problema o necesidad de la propuesta ' + propuesta.numero + '.',
        selector: '#p' + propuesta.numero + 'Problema'
      };
    }

    if (!limpiarTexto(propuesta.objetivo)) {
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

  function limpiarMensajeTecnico(mensaje) {
    return limpiarTexto(mensaje)
      .replace(/api\s*key/gi, 'configuración')
      .replace(/token/gi, 'configuración')
      .replace(/provider/gi, 'servicio')
      .replace(/model/gi, 'modelo')
      .replace(/gemini|groq|openrouter|cloudflare/gi, 'IA')
      .slice(0, 220);
  }

  function limpiarTexto(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  window.TAEstudianteSugerenciasController = Object.freeze({
    manejarSugerencias: manejarSugerencias,
    abrirLoadingIA: abrirLoadingIA,
    manejarProgresoIA: manejarProgresoIA,
    cerrarLoadingIA: cerrarLoadingIA,
    renderizarSugerencias: renderizarSugerencias,
    mostrarSugerenciasNoDisponibles: mostrarSugerenciasNoDisponibles,
    validarBaseParaSugerencias: validarBaseParaSugerencias,
    limpiarMensajeTecnico: limpiarMensajeTecnico
  });
})();