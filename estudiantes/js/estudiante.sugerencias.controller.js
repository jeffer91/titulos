/*
  Archivo: estudiante.sugerencias.controller.js
  Ruta: estudiantes/js/estudiante.sugerencias.controller.js
  Funciones principales del archivo:
  - Controlar la generación de sugerencias de títulos con IA.
  - Validar Telegram obligatorio antes de permitir generar sugerencias.
  - Validar la información mínima de cada propuesta antes de llamar a IA.
  - Usar la evaluación de IA/validador académico para advertir si el título no corresponde a la carrera.
  - No bloquear la generación ni la selección de sugerencias.
  - Abrir, actualizar y cerrar la pantalla de carga de IA.
  - Mantener visible la pantalla de progreso mínimo 3 segundos.
  - Enviar la propuesta al servicio TAEstudianteIA.
  - Renderizar la pantalla de sugerencias mediante TAEstudianteSugerencias.
  - Obligar a que el estudiante elija una sugerencia para llenar el título final.
  - Guardar metadatos de IA en el estado del módulo.
  - Manejar errores sin exponer proveedores, tokens ni detalles técnicos sensibles.
*/
(function () {
  'use strict';

  var MIN_LOADING_VISIBLE_MS = 3000;
  var FINALIZACION_VISIBLE_MS = 600;
  var loadingAbiertoEn = 0;

  function manejarSugerencias(numero, button) {
    var state = window.TAEstudianteState;
    var ui = window.TAEstudianteUI;
    var iaService = window.TAEstudianteIA;
    var validaciones = window.TAEstudianteValidaciones;
    var estado = state ? state.obtener() : {};
    var formData;
    var propuesta;
    var resultadoTelegram;
    var resultadoBase;
    var advertenciaIA;

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

    if (!numero || numero < 1 || numero > obtenerTotalPropuestas()) {
      ui.showAlert('No se pudo identificar la propuesta para generar sugerencias.', '');
      return Promise.resolve(null);
    }

    if (validaciones && typeof validaciones.validarDatosContacto === 'function') {
      resultadoTelegram = validaciones.validarDatosContacto();

      if (!resultadoTelegram.ok) {
        ui.showAlert(resultadoTelegram.mensaje, resultadoTelegram.selector || '#telegramInput');
        return Promise.resolve(null);
      }
    }

    formData = leerFormularioSeguro();
    propuesta = formData && Array.isArray(formData.propuestas) ? formData.propuestas[numero - 1] : null;
    propuesta = normalizarPropuestaParaIA(propuesta, numero);

    resultadoBase = validarBaseParaSugerencias(propuesta);

    if (!resultadoBase.ok) {
      ui.showAlert(resultadoBase.mensaje, resultadoBase.selector);
      return Promise.resolve(null);
    }

    if (!iaService || typeof iaService.generarSugerencias !== 'function') {
      mostrarSugerenciasNoDisponibles();
      return Promise.resolve(null);
    }

    if (estado.appConfig && estado.appConfig.iaActiva === false) {
      mostrarSugerenciasNoDisponibles();
      return Promise.resolve(null);
    }

    limpiarSeleccionAnterior(numero);

    if (ui.setLoading) {
      ui.setLoading(button, true, 'Generando...');
    }

    if (ui.showStatus) {
      ui.showStatus('#envioMensaje', 'IA de Titulación trabajando...', 'info');
    }

    abrirLoadingIA({
      numero: numero,
      propuesta: propuesta
    });

    return esperarRenderLoadingIA()
      .then(function () {
        return iaService.generarSugerencias({
          estudiante: estado.estudiante,
          appConfig: estado.appConfig || {},
          propuesta: propuesta,
          propuestaNumero: numero,
          titulosPrevios: obtenerTitulosPrevios(formData, numero),
          onProgress: manejarProgresoIA
        });
      })
      .then(function (respuesta) {
        var sugerencias = extraerSugerencias(respuesta);

        advertenciaIA = obtenerAdvertenciaCarreraDesdeIA(sugerencias, estado.estudiante);

        if (advertenciaIA) {
          sugerencias = agregarAdvertenciaCarreraDesdeIA(sugerencias, advertenciaIA);
        }

        if (!sugerencias.length) {
          return cerrarLoadingIA({
            finalizado: false,
            error: true
          }).then(function () {
            mostrarSugerenciasNoDisponibles();
            return null;
          });
        }

        if (state && typeof state.guardarRespuestaIA === 'function') {
          state.guardarRespuestaIA(numero, respuesta);
        }

        return cerrarLoadingIA({
          finalizado: true
        }).then(function () {
          renderizarSugerencias(numero, sugerencias, respuesta);

          if (advertenciaIA && ui.showStatus) {
            ui.showStatus('#envioMensaje', advertenciaIA.mensaje, 'warning');
          }

          return respuesta;
        });
      })
      .catch(function (error) {
        console.error('[Estudiantes] Error IA:', error);

        return cerrarLoadingIA({
          finalizado: false,
          error: true
        }).then(function () {
          mostrarSugerenciasNoDisponibles(error);
          return null;
        });
      })
      .finally(function () {
        if (ui.setLoading) {
          ui.setLoading(button, false);
        }
      });
  }

  function esperarRenderLoadingIA() {
    return new Promise(function (resolve) {
      window.setTimeout(resolve, 80);
    });
  }

  function renderizarSugerencias(numero, sugerencias, respuestaIA) {
    var state = window.TAEstudianteState;
    var ui = window.TAEstudianteUI;
    var sugerenciasService = window.TAEstudianteSugerencias;
    var formularioController = window.TAEstudianteFormularioController;
    var borradorController = window.TAEstudianteBorradorController;
    var estado = state ? state.obtener() : {};
    var formData = leerFormularioSeguro();
    var propuesta = formData && Array.isArray(formData.propuestas) ? formData.propuestas[numero - 1] : null;

    if (sugerenciasService && typeof sugerenciasService.renderizar === 'function') {
      sugerenciasService.renderizar(numero, sugerencias, {
        estudiante: estado.estudiante,
        propuesta: normalizarPropuestaParaIA(propuesta, numero),
        respuestaIA: respuestaIA || (state && state.obtenerRespuestaIA ? state.obtenerRespuestaIA(numero) : null),
        onSeleccionar: function (seleccion) {
          if (ui && ui.showStatus) {
            ui.showStatus(
              '#envioMensaje',
              'Sugerencia aplicada como título final de la propuesta ' + numero + '. Ahora puedes continuar.',
              'success'
            );
          }

          if (borradorController && typeof borradorController.programarAutoGuardado === 'function') {
            borradorController.programarAutoGuardado();
          }

          if (formularioController && typeof formularioController.actualizarResumenPreferido === 'function') {
            formularioController.actualizarResumenPreferido();
          }

          enfocarTituloFinal(numero);
          return seleccion;
        }
      });

      return;
    }

    if (ui && typeof ui.renderSuggestions === 'function') {
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
      'No se pudieron generar sugerencias en este momento. Revisa los campos de la propuesta e inténtalo nuevamente.'
    );
    var mostrarTecnico = config &&
      config.iaOrquestador &&
      config.iaOrquestador.mostrarErroresTecnicosAlEstudiante === true;

    if (error && error.message && mostrarTecnico) {
      mensaje += ' Detalle técnico: ' + limpiarMensajeTecnico(error.message);
    }

    if (modalService && typeof modalService.mostrarAlerta === 'function') {
      modalService.mostrarAlerta(mensaje, {
        titulo: 'Sugerencias no disponibles'
      });
      return;
    }

    if (ui && typeof ui.showAlert === 'function') {
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
        mensaje: 'Ingresa el tema general de la propuesta antes de generar sugerencias.',
        selector: '#p' + propuesta.numero + 'Tema'
      };
    }

    if (!limpiarTexto(propuesta.problemaNecesidad)) {
      return {
        ok: false,
        mensaje: 'Ingresa el problema o necesidad de la propuesta antes de generar sugerencias.',
        selector: '#p' + propuesta.numero + 'Problema'
      };
    }

    if (!limpiarTexto(propuesta.objetivo)) {
      return {
        ok: false,
        mensaje: 'Ingresa el objetivo de la propuesta antes de generar sugerencias.',
        selector: '#p' + propuesta.numero + 'Objetivo'
      };
    }

    return {
      ok: true,
      mensaje: '',
      selector: ''
    };
  }

  function obtenerAdvertenciaCarreraDesdeIA(sugerencias, estudiante) {
    var carrera = obtenerCarreraEstudiante(estudiante);
    var indices = [];

    if (!carrera || !Array.isArray(sugerencias) || !sugerencias.length) {
      return null;
    }

    sugerencias.forEach(function (sugerencia, index) {
      if (sugerenciaTieneProblemaCarrera(sugerencia)) {
        indices.push(index);
      }
    });

    if (!indices.length) {
      return null;
    }

    return {
      indices: indices,
      mensaje: '⚠️ La IA detectó que una o más sugerencias podrían no corresponder completamente a la carrera "' + carrera + '". Puedes continuar, pero revisa antes de elegir.',
      alerta: '⚠️⚠️⚠️ La IA detectó posible tema fuera de carrera. Verifica que corresponda a "' + carrera + '". ⚠️⚠️⚠️'
    };
  }

  function agregarAdvertenciaCarreraDesdeIA(sugerencias, advertencia) {
    var indices = advertencia && Array.isArray(advertencia.indices) ? advertencia.indices : [];

    return (sugerencias || []).map(function (item, index) {
      var copia;

      if (typeof item === 'string') {
        copia = {
          texto: item,
          titulo: item,
          sugerencia: item
        };
      } else {
        copia = Object.assign({}, item || {});
      }

      if (indices.indexOf(index) !== -1 && advertencia && advertencia.alerta) {
        copia.alertaCarrera = advertencia.alerta;
      }

      return copia;
    });
  }

  function sugerenciaTieneProblemaCarrera(sugerencia) {
    var relacion = obtenerNumeroRelacionCarrera(sugerencia);
    var bandera = obtenerBanderaCarrera(sugerencia);
    var mensajes = [];

    if (bandera === false) {
      return true;
    }

    if (relacion !== null && relacion < 1) {
      return true;
    }

    [
      sugerencia && sugerencia.alertaCarrera,
      sugerencia && sugerencia.validacionCarrera,
      sugerencia && sugerencia.relacionCarrera,
      sugerencia && sugerencia.relacionConCarrera,
      sugerencia && sugerencia.advertencias,
      sugerencia && sugerencia.warnings,
      sugerencia && sugerencia.problemas,
      sugerencia && sugerencia.errores,
      sugerencia && sugerencia.bloqueos
    ].forEach(function (lista) {
      if (typeof lista === 'string') {
        lista = [lista];
      }

      if (lista && typeof lista === 'object' && !Array.isArray(lista)) {
        lista = [
          lista.mensaje,
          lista.detalle,
          lista.estado,
          lista.resultado,
          lista.observacion
        ].filter(Boolean);
      }

      if (!Array.isArray(lista)) {
        return;
      }

      lista.forEach(function (mensaje) {
        mensajes.push(normalizarClaveIA(mensaje));
      });
    });

    return mensajes.some(function (mensaje) {
      if (mensaje.indexOf('carrera') === -1) {
        return false;
      }

      return mensaje.indexOf('no se reconoce') !== -1 ||
        mensaje.indexOf('no corresponde') !== -1 ||
        mensaje.indexOf('fuera de carrera') !== -1 ||
        mensaje.indexOf('relacion suficiente') !== -1 ||
        mensaje.indexOf('relacion directa') !== -1 ||
        mensaje.indexOf('poco relacionado') !== -1 ||
        mensaje.indexOf('sin relacion') !== -1 ||
        mensaje.indexOf('tema no') !== -1;
    });
  }

  function obtenerNumeroRelacionCarrera(sugerencia) {
    var candidatos = [
      sugerencia && sugerencia.relacion,
      sugerencia && sugerencia.relacionCarrera,
      sugerencia && sugerencia.relacionConCarrera,
      sugerencia && sugerencia.scoreCarrera,
      sugerencia && sugerencia.puntajeCarrera,
      sugerencia && sugerencia.validacionCarrera && sugerencia.validacionCarrera.relacion,
      sugerencia && sugerencia.validacionCarrera && sugerencia.validacionCarrera.puntaje,
      sugerencia && sugerencia.validacionCarrera && sugerencia.validacionCarrera.score
    ];
    var i;
    var numero;

    for (i = 0; i < candidatos.length; i += 1) {
      if (candidatos[i] === undefined || candidatos[i] === null || candidatos[i] === '') {
        continue;
      }

      numero = Number(candidatos[i]);

      if (Number.isFinite(numero)) {
        return numero;
      }
    }

    return null;
  }

  function obtenerBanderaCarrera(sugerencia) {
    var candidatos = [
      sugerencia && sugerencia.correspondeCarrera,
      sugerencia && sugerencia.temaCorrespondeCarrera,
      sugerencia && sugerencia.esDeLaCarrera,
      sugerencia && sugerencia.validacionCarrera && sugerencia.validacionCarrera.corresponde,
      sugerencia && sugerencia.validacionCarrera && sugerencia.validacionCarrera.ok
    ];
    var i;

    for (i = 0; i < candidatos.length; i += 1) {
      if (typeof candidatos[i] === 'boolean') {
        return candidatos[i];
      }
    }

    return null;
  }

  function obtenerCarreraEstudiante(estudiante) {
    return limpiarTexto((estudiante && (
      estudiante.carrera ||
      estudiante.nombreCarrera ||
      estudiante.NombreCarrera ||
      estudiante.carreraNombre ||
      estudiante.nombre_carrera
    )) || '');
  }

  function normalizarClaveIA(valor) {
    return String(valor || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function leerFormularioSeguro() {
    var ui = window.TAEstudianteUI;

    if (!ui || typeof ui.readFormData !== 'function') {
      return null;
    }

    return ui.readFormData(obtenerTotalPropuestas());
  }

  function normalizarPropuestaParaIA(propuesta, numero) {
    propuesta = propuesta || {};
    numero = Number(numero || propuesta.numero || 0);

    return {
      numero: numero,
      temaGeneral: limpiarTexto(propuesta.temaGeneral || propuesta.tema || propuesta['tema_general']),
      problemaNecesidad: limpiarTexto(propuesta.problemaNecesidad || propuesta.problema || propuesta.necesidad),
      lugarContexto: limpiarTexto(propuesta.lugarContexto || propuesta.contexto || propuesta.lugar),
      grupoEstudio: limpiarTexto(propuesta.grupoEstudio || propuesta.grupo || propuesta.poblacion),
      anioPeriodo: limpiarTexto(propuesta.anioPeriodo || propuesta.periodo || propuesta.anio),
      objetivo: limpiarTexto(propuesta.objetivo || propuesta.objetivoSimple),
      tituloFinal: limpiarTexto(propuesta.tituloFinal || propuesta.titulo || '')
    };
  }

  function obtenerTitulosPrevios(formData, numeroActual) {
    var propuestas = formData && Array.isArray(formData.propuestas) ? formData.propuestas : [];

    return propuestas
      .filter(function (propuesta, index) {
        return index + 1 !== Number(numeroActual || 0);
      })
      .map(function (propuesta) {
        return limpiarTexto(propuesta && propuesta.tituloFinal);
      })
      .filter(Boolean);
  }

  function extraerSugerencias(respuesta) {
    if (!respuesta) {
      return [];
    }

    if (Array.isArray(respuesta)) {
      return respuesta;
    }

    if (Array.isArray(respuesta.sugerencias)) {
      return respuesta.sugerencias;
    }

    if (respuesta.data && Array.isArray(respuesta.data.sugerencias)) {
      return respuesta.data.sugerencias;
    }

    if (respuesta.resultado && Array.isArray(respuesta.resultado.sugerencias)) {
      return respuesta.resultado.sugerencias;
    }

    if (typeof respuesta.texto === 'string') {
      return respuesta.texto.split('\n').filter(Boolean);
    }

    return [];
  }

  function limpiarSeleccionAnterior(numero) {
    var sugerenciasService = window.TAEstudianteSugerencias;

    if (sugerenciasService && typeof sugerenciasService.limpiar === 'function') {
      sugerenciasService.limpiar(numero);
      return;
    }

    limpiarTituloFinal(numero);
  }

  function limpiarTituloFinal(numero) {
    var campo = document.querySelector('#p' + numero + 'Titulo');

    if (!campo) {
      return;
    }

    campo.value = '';
    campo.removeAttribute('data-sugerencia-seleccionada');
    campo.removeAttribute('data-sugerencia-index');
    campo.classList.remove('title-final-selected', 'title-final-selected--stable');

    campo.dispatchEvent(new Event('input', { bubbles: true }));
    campo.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function enfocarTituloFinal(numero) {
    var campo = document.querySelector('#p' + numero + 'Titulo');

    if (!campo) {
      return;
    }

    window.setTimeout(function () {
      if (typeof campo.focus === 'function') {
        campo.focus();
      }

      if (typeof campo.scrollIntoView === 'function') {
        campo.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
      }
    }, 80);
  }

  function abrirLoadingIA(opciones) {
    var loadingService = window.TAEstudianteLoading;

    opciones = opciones || {};
    loadingAbiertoEn = Date.now();

    if (loadingService && typeof loadingService.abrir === 'function') {
      loadingService.abrir({
        titulo: 'IA de Titulación trabajando',
        detalle: 'Estamos generando sugerencias académicas para la propuesta ' + opciones.numero + '.',
        estado: 'Preparando análisis académico...',
        pasoActual: 0,
        totalPasos: 3,
        minVisibleMs: MIN_LOADING_VISIBLE_MS
      });

      return;
    }

    abrirLoadingFallback(opciones);
  }

  function manejarProgresoIA(evento) {
    var loadingService = window.TAEstudianteLoading;

    evento = evento || {};

    if (loadingService && typeof loadingService.progreso === 'function') {
      loadingService.progreso(evento);
      return;
    }

    actualizarLoadingFallback(evento);
  }

  function cerrarLoadingIA(opciones) {
    var loadingService = window.TAEstudianteLoading;
    var transcurrido = loadingAbiertoEn ? Date.now() - loadingAbiertoEn : MIN_LOADING_VISIBLE_MS;
    var espera = Math.max(0, MIN_LOADING_VISIBLE_MS - transcurrido);

    opciones = opciones || {};

    return new Promise(function (resolve) {
      window.setTimeout(function () {
        if (loadingService && typeof loadingService.progreso === 'function') {
          loadingService.progreso({
            tipo: opciones.error ? 'error' : 'finalizado',
            titulo: opciones.error ? 'No se pudieron generar títulos' : 'Títulos generados',
            detalle: opciones.error
              ? 'No se pudo completar la generación en este momento.'
              : 'Las sugerencias fueron generadas correctamente.',
            estado: opciones.error
              ? 'Generación no disponible.'
              : 'Finalizando generación académica...',
            pasoActual: opciones.error ? 0 : 3,
            totalPasos: 3,
            progreso: 100
          });
        } else {
          actualizarLoadingFallback({
            tipo: opciones.error ? 'error' : 'finalizado',
            titulo: opciones.error ? 'No se pudieron generar títulos' : 'Títulos generados',
            detalle: opciones.error
              ? 'No se pudo completar la generación en este momento.'
              : 'Las sugerencias fueron generadas correctamente.',
            estado: opciones.error
              ? 'Generación no disponible.'
              : 'Finalizando generación académica...',
            progreso: 100
          });
        }

        window.setTimeout(function () {
          if (loadingService && typeof loadingService.cerrar === 'function') {
            loadingService.cerrar({
              respetarMinimo: false
            });
          } else {
            cerrarLoadingFallback();
          }

          resolve(true);
        }, FINALIZACION_VISIBLE_MS);
      }, espera);
    });
  }

  function abrirLoadingFallback(opciones) {
    var modal = document.querySelector('#modalLoadingIA') || document.querySelector('#iaLoadingModal');

    opciones = opciones || {};

    if (!modal) {
      return;
    }

    modal.classList.remove('is-hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('has-open-modal');

    setText('#iaLoadingTitulo', 'IA de Titulación trabajando');
    setText('#iaLoadingDetalle', 'Estamos generando sugerencias académicas para la propuesta ' + opciones.numero + '.');
    setText('#iaLoadingEstado', 'Preparando análisis académico...');
    setText('#iaLoadingNota', 'Este proceso durará al menos 3 segundos para mostrar el avance.');

    actualizarBarraProgresoFallback(10);
  }

  function actualizarLoadingFallback(evento) {
    var progreso;

    evento = evento || {};
    progreso = Number(evento.progreso || evento.percent || evento.porcentaje || 0);

    setText('#iaLoadingTitulo', limpiarMensajeTecnico(evento.titulo || 'IA de Titulación trabajando'));
    setText('#iaLoadingDetalle', limpiarMensajeTecnico(evento.detalle || 'Estamos generando sugerencias académicas.'));
    setText('#iaLoadingEstado', limpiarMensajeTecnico(evento.estado || evento.mensaje || 'Procesando solicitud académica...'));

    if (!progreso && evento.pasoActual && evento.totalPasos) {
      progreso = Math.round((Number(evento.pasoActual) / Number(evento.totalPasos)) * 100);
    }

    actualizarBarraProgresoFallback(progreso || 45);
  }

  function cerrarLoadingFallback() {
    var modal = document.querySelector('#modalLoadingIA') || document.querySelector('#iaLoadingModal');

    if (!modal) {
      return;
    }

    modal.classList.add('is-hidden');
    modal.setAttribute('aria-hidden', 'true');

    if (!hayOtroModalAbierto()) {
      document.body.classList.remove('has-open-modal');
    }
  }

  function actualizarBarraProgresoFallback(porcentaje) {
    var barra = document.querySelector('#iaLoadingProgressBar') ||
      document.querySelector('.ia-loading-progress__bar') ||
      document.querySelector('.ia-loading-modal__progress-bar');

    porcentaje = Math.max(5, Math.min(100, Number(porcentaje || 0)));

    if (barra) {
      barra.style.width = porcentaje + '%';
    }
  }

  function hayOtroModalAbierto() {
    return Array.prototype.slice.call(document.querySelectorAll('.modal, .ia-loading-modal'))
      .some(function (modal) {
        if (modal.id === 'modalLoadingIA' || modal.id === 'iaLoadingModal') {
          return false;
        }

        return !modal.classList.contains('is-hidden');
      });
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

  function setText(selector, value) {
    var element = document.querySelector(selector);

    if (element) {
      element.textContent = value || '';
    }
  }

  function limpiarTexto(valor) {
    return String(valor || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function limpiarMensajeTecnico(mensaje) {
    return String(mensaje || '')
      .replace(/key=[^\s&]+/ig, 'key=***')
      .replace(/api[_-]?key[^\s]+/ig, 'apiKey=***')
      .replace(/Bearer\s+[^\s]+/ig, 'Bearer ***')
      .replace(/Google Gemini API|Gemini|Groq|OpenRouter|Cloudflare/ig, 'IA de Titulación')
      .replace(/\s+/g, ' ')
      .trim();
  }

  window.TAEstudianteSugerenciasController = Object.freeze({
    manejarSugerencias: manejarSugerencias,
    renderizarSugerencias: renderizarSugerencias
  });
})();