/*
  Arranque del módulo público de estudiantes.
  Arquitectura por bloques:
  1. Consulta académica.
  2. Datos del estudiante.
  3. Estado del título o cronograma.
  4. Títulos externos y envío.

  La lógica de consulta vive en estudiante.consulta.controller.js.
  Este archivo solo prepara dependencias y conecta eventos.
*/
(function () {
  'use strict';

  var BUILD = '20261008-51';

  document.addEventListener('DOMContentLoaded', iniciar);

  function iniciar() {
    var resultado = verificarDependencias();

    actualizarBadgesIniciales();

    if (!resultado.ok) {
      mostrarErrorDependencias(resultado.faltantes);
      return;
    }

    /* Precarga en segundo plano. Nunca bloquea la interfaz. */
    preconectarFirebase();

    cargarFlujoTitulosExternos()
      .then(function () {
        return cargarSeguimientoVisual();
      })
      .then(function () {
        return cargarMarcaVisual();
      })
      .catch(function (error) {
        console.warn('[Estudiantes] Capa complementaria no disponible; continúa el flujo base:', error);
        return false;
      })
      .then(function () {
        window.TAEstudianteEvents.iniciar();
        console.info('[Estudiantes] Flujo secuencial por bloques iniciado. Build ' + BUILD + '.');
      });
  }

  function preconectarFirebase() {
    var service = window.TAEstudianteFirebaseService;
    var config = window.TA_ESTUDIANTES_CONFIG || {};
    var state = window.TAEstudianteState;

    if (!service || typeof service.iniciar !== 'function') {
      mostrarErrorBackend({
        codigo: 'BACKEND_ESTUDIANTES_NO_DISPONIBLE',
        mensaje: 'No se cargó el servicio Firebase exclusivo de Estudiantes.'
      });
      return Promise.resolve(false);
    }

    if (service.estaListo && service.estaListo()) {
      if (state && state.marcarFirebaseListo) state.marcarFirebaseListo(true);
      return Promise.resolve(true);
    }

    return service.iniciar(config.firebase)
      .then(function (resultado) {
        var ok = !(resultado && resultado.ok === false);

        if (ok) {
          if (state && state.marcarFirebaseListo) state.marcarFirebaseListo(true);
          return true;
        }

        mostrarErrorBackend({
          codigo: resultado && resultado.codigo || 'FIREBASE_ESTUDIANTES_ERROR',
          mensaje: resultado && resultado.mensaje || 'No se pudo conectar el backend de Estudiantes.'
        });
        return false;
      })
      .catch(function (error) {
        mostrarErrorBackend({
          codigo: error && (error.codigo || error.code || error.name) || 'FIREBASE_ESTUDIANTES_ERROR',
          mensaje: error && error.message || 'No se pudo conectar el backend de Estudiantes.',
          stack: error && error.stack || ''
        });
        return false;
      });
  }

  function cargarFlujoTitulosExternos() {
    return cargarScript(
      'ta-titulos-externos',
      'js/titulos.externos.service.js?v=' + BUILD,
      function () { return Boolean(window.TATitulosExternos); }
    );
  }

  function cargarMarcaVisual() {
    return cargarScript(
      'ta-brand-override',
      'js/brand.override.js?v=' + BUILD,
      function () { return Boolean(document.getElementById('taBrandOverrideStyles')); }
    ).catch(function () { return false; });
  }

  function cargarSeguimientoVisual() {
    return cargarScript(
      'ta-seguimiento-service',
      'js/seguimiento.service.js?v=' + BUILD,
      function () { return Boolean(window.TAEstudianteSeguimiento); }
    ).then(function () {
      return cargarScript(
        'ta-seguimiento-visual',
        'js/seguimiento.visual.js?v=' + BUILD,
        function () { return Boolean(document.getElementById('seguimientoVisualV2Styles')); }
      ).catch(function () { return false; });
    }).then(function () {
      return cargarScript(
        'ta-seguimiento-premium',
        'js/seguimiento.premium.js?v=' + BUILD,
        function () { return Boolean(document.getElementById('taSeguimientoPremiumStyles')); }
      ).catch(function () { return false; });
    });
  }

  function cargarScript(id, src, verificar) {
    if (typeof verificar === 'function' && verificar()) return Promise.resolve(true);

    return new Promise(function (resolve, reject) {
      var existente = document.getElementById(id);
      if (existente) {
        if (typeof verificar !== 'function' || verificar()) return resolve(true);
        existente.addEventListener('load', function () {
          if (typeof verificar === 'function' && !verificar()) {
            reject(new Error('El servicio ' + id + ' no quedó disponible.'));
            return;
          }
          resolve(true);
        }, { once: true });
        existente.addEventListener('error', function () {
          reject(new Error('No se pudo cargar ' + src + '.'));
        }, { once: true });
        return;
      }

      var script = document.createElement('script');
      script.id = id;
      script.src = src;
      script.async = false;
      script.onload = function () {
        if (typeof verificar === 'function' && !verificar()) {
          reject(new Error('El servicio ' + id + ' no quedó disponible.'));
          return;
        }
        resolve(true);
      };
      script.onerror = function () { reject(new Error('No se pudo descargar ' + src + '.')); };
      document.head.appendChild(script);
    });
  }

  function verificarDependencias() {
    var dependencias = {
      TA_ESTUDIANTES_CONFIG: window.TA_ESTUDIANTES_CONFIG,
      TAEstudianteFirebaseService: window.TAEstudianteFirebaseService,
      TAEstudianteRepository: window.TAEstudianteRepository,
      TAEstudianteValidaciones: window.TAEstudianteValidaciones,
      TAEstudianteUI: window.TAEstudianteUI,
      TAEstudianteModal: window.TAEstudianteModal,
      TAEstudianteFormulario: window.TAEstudianteFormulario,
      TAEstudiantePaginacion: window.TAEstudiantePaginacion,
      TAEstudianteTelegram: window.TAEstudianteTelegram,
      TAEstudianteState: window.TAEstudianteState,
      TAEstudianteConsultaController: window.TAEstudianteConsultaController,
      TAEstudianteRecomendacionesController: window.TAEstudianteRecomendacionesController,
      TAEstudianteFormularioController: window.TAEstudianteFormularioController,
      TAEstudianteBorradorController: window.TAEstudianteBorradorController,
      TAEstudianteEnvioController: window.TAEstudianteEnvioController,
      TAEstudianteEvents: window.TAEstudianteEvents
    };

    var faltantes = Object.keys(dependencias).filter(function (key) { return !dependencias[key]; });
    return { ok: faltantes.length === 0, faltantes: faltantes };
  }

  function mostrarErrorBackend(detalle) {
    detalle = detalle || {};
    var codigo = detalle.codigo || 'BACKEND_ESTUDIANTES_ERROR';
    var mensaje = detalle.mensaje || 'Ocurrió un error en el backend de Estudiantes.';
    var texto = 'Error de conexión [' + codigo + ']: ' + mensaje;

    console.error('[Estudiantes][Backend]', detalle);

    var consultaMensaje = document.querySelector('#consultaMensaje');
    if (consultaMensaje) {
      consultaMensaje.textContent = texto;
      consultaMensaje.className = 'status-message status-message--danger';
      consultaMensaje.classList.remove('is-hidden');
    }

    if (window.TAEstudianteDiagnostico && typeof window.TAEstudianteDiagnostico.registrar === 'function') {
      window.TAEstudianteDiagnostico.registrar('ERROR_BACKEND_ESTUDIANTES', {
        codigo: codigo,
        mensaje: mensaje,
        stack: detalle.stack || ''
      });
    }
  }

  function mostrarErrorDependencias(faltantes) {
    var mensaje = 'La pantalla de estudiantes no pudo iniciar correctamente. Faltan: ' + faltantes.join(', ') + '.';
    console.error('[Estudiantes] ' + mensaje);

    var consultaMensaje = document.querySelector('#consultaMensaje');
    if (consultaMensaje) {
      consultaMensaje.textContent = mensaje;
      consultaMensaje.className = 'status-message status-message--danger';
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
      periodoBadge.textContent = config.periodoActivoLabel || config.periodoLabel || config.periodoActivo || 'Período por confirmar';
    }
  }

  window.TAEstudianteApp = Object.freeze({
    iniciar: iniciar,
    verificarDependencias: verificarDependencias,
    cargarSeguimiento: cargarSeguimientoVisual,
    cargarTitulosExternos: cargarFlujoTitulosExternos,
    preconectarFirebase: preconectarFirebase,
    build: BUILD
  });
})();