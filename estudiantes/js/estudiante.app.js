/*
  Archivo: estudiante.app.js
  Ruta: estudiantes/js/estudiante.app.js
  Funciones principales del archivo:
  - Iniciar el módulo público de estudiantes.
  - Verificar que los servicios principales estén cargados.
  - Cargar el seguimiento de títulos existentes antes de conectar eventos.
  - Delegar eventos, consulta, recomendaciones, formulario, sugerencias, borrador y envío a controladores separados.
*/
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', iniciar);

  function iniciar() {
    var resultado = verificarDependencias();

    actualizarBadgesIniciales();

    if (!resultado.ok) {
      mostrarErrorDependencias(resultado.faltantes);
      return;
    }

    cargarSeguimiento()
      .catch(function (error) {
        console.error('[Estudiantes] No se pudo cargar el seguimiento de títulos:', error);
        return false;
      })
      .then(function () {
        window.TAEstudianteEvents.iniciar();
        console.info('[Estudiantes] Módulo iniciado correctamente con seguimiento de títulos existentes.');
      });
  }

  function cargarSeguimiento() {
    if (window.TAEstudianteSeguimiento) {
      return Promise.resolve(true);
    }

    return new Promise(function (resolve, reject) {
      var existente = document.getElementById('ta-seguimiento-service');

      if (existente) {
        if (window.TAEstudianteSeguimiento) {
          resolve(true);
          return;
        }

        existente.addEventListener('load', function () { resolve(Boolean(window.TAEstudianteSeguimiento)); }, { once: true });
        existente.addEventListener('error', function () { reject(new Error('No se pudo cargar seguimiento.service.js.')); }, { once: true });
        return;
      }

      var script = document.createElement('script');
      script.id = 'ta-seguimiento-service';
      script.src = 'js/seguimiento.service.js?v=20261006-1';
      script.async = false;
      script.onload = function () {
        if (!window.TAEstudianteSeguimiento) {
          reject(new Error('El servicio de seguimiento no quedó disponible.'));
          return;
        }
        resolve(true);
      };
      script.onerror = function () {
        reject(new Error('No se pudo descargar seguimiento.service.js.'));
      };
      document.head.appendChild(script);
    });
  }

  function verificarDependencias() {
    var dependencias = {
      TA_ESTUDIANTES_CONFIG: window.TA_ESTUDIANTES_CONFIG,
      TAFirebaseService: window.TAFirebaseService,
      TAEstudianteRepository: window.TAEstudianteRepository,
      TAEstudianteValidaciones: window.TAEstudianteValidaciones,
      TAEstudianteUI: window.TAEstudianteUI,
      TAEstudianteModal: window.TAEstudianteModal,
      TAEstudianteLoading: window.TAEstudianteLoading,
      TAEstudianteFormulario: window.TAEstudianteFormulario,
      TAEstudiantePaginacion: window.TAEstudiantePaginacion,
      TAEstudianteTelegram: window.TAEstudianteTelegram,
      TAEstudianteSugerencias: window.TAEstudianteSugerencias,
      TAEstudianteState: window.TAEstudianteState,
      TAEstudianteConsultaController: window.TAEstudianteConsultaController,
      TAEstudianteRecomendacionesController: window.TAEstudianteRecomendacionesController,
      TAEstudianteFormularioController: window.TAEstudianteFormularioController,
      TAEstudianteSugerenciasController: window.TAEstudianteSugerenciasController,
      TAEstudianteBorradorController: window.TAEstudianteBorradorController,
      TAEstudianteEnvioController: window.TAEstudianteEnvioController,
      TAEstudianteEvents: window.TAEstudianteEvents
    };

    var faltantes = Object.keys(dependencias).filter(function (key) {
      return !dependencias[key];
    });

    return {
      ok: faltantes.length === 0,
      faltantes: faltantes
    };
  }

  function mostrarErrorDependencias(faltantes) {
    var mensaje = 'La pantalla de estudiantes no pudo iniciar porque faltan archivos JS: ' +
      faltantes.join(', ') +
      '. Revisa el orden de scripts en estudiante.html.';

    console.error('[Estudiantes] ' + mensaje);

    var consultaMensaje = document.querySelector('#consultaMensaje');

    if (consultaMensaje) {
      consultaMensaje.textContent = mensaje;
      consultaMensaje.className = 'status-message status-message--danger';
    }

    if (window.TAEstudianteModal && window.TAEstudianteModal.mostrarAlerta) {
      window.TAEstudianteModal.mostrarAlerta(mensaje, {
        titulo: 'Error de carga'
      });
    }
  }

  function actualizarBadgesIniciales() {
    var config = window.TA_ESTUDIANTES_CONFIG || {};
    var estadoBadge = document.querySelector('#estadoProcesoBadge');
    var periodoBadge = document.querySelector('#periodoActivoBadge');

    if (estadoBadge) {
      estadoBadge.textContent = 'Proceso activo';
      estadoBadge.className = 'status-pill status-pill--info';
    }

    if (periodoBadge) {
      periodoBadge.textContent =
        config.periodoActivoLabel ||
        config.periodoLabel ||
        config.periodoActivo ||
        'Período por confirmar';
    }
  }

  window.TAEstudianteApp = Object.freeze({
    iniciar: iniciar,
    verificarDependencias: verificarDependencias,
    cargarSeguimiento: cargarSeguimiento
  });
})();