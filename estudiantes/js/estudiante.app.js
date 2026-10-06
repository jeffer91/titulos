/*
  Archivo: estudiante.app.js
  Ruta: estudiantes/js/estudiante.app.js
  Funciones principales:
  - Iniciar el módulo público de estudiantes.
  - Mantener el motor aislado fuera del arranque crítico.
  - Precargar servicios en segundo plano sin bloquear la interfaz.
  - Mantener historial y visualización fuera del camino crítico.
*/
(function () {
  'use strict';

  var BUILD = '20261006-13';

  document.addEventListener('DOMContentLoaded', iniciar);

  function iniciar() {
    var resultado = verificarDependencias();

    actualizarBadgesIniciales();

    if (!resultado.ok) {
      mostrarErrorDependencias(resultado.faltantes);
      return;
    }

    ajustarLoadingConsulta();
    preconectarFirebase();

    cargarSeguimiento()
      .then(function () {
        window.TAEstudianteEvents.iniciar();
        precalentarMotorAislado();
        console.info('[Estudiantes] Módulo iniciado. El motor aislado se prepara en segundo plano.');
      })
      .catch(function (error) {
        console.error('[Estudiantes] No se pudo cargar la capa de seguimiento:', error);
        /* La pantalla base sigue operativa; no se bloquea todo el módulo por el seguimiento. */
        try {
          window.TAEstudianteEvents.iniciar();
        } catch (eventError) {
          mostrarErrorDependencias(['eventos del módulo estudiantes']);
        }
      });
  }

  function preconectarFirebase() {
    var service = window.TAFirebaseService;
    var config = window.TA_ESTUDIANTES_CONFIG || {};
    var state = window.TAEstudianteState;

    if (!service || typeof service.iniciar !== 'function') {
      return Promise.resolve(false);
    }

    if (service.estaListo && service.estaListo()) {
      if (state && typeof state.marcarFirebaseListo === 'function') state.marcarFirebaseListo(true);
      return Promise.resolve(true);
    }

    return service.iniciar(config.firebase)
      .then(function (resultado) {
        var ok = !(resultado && resultado.ok === false);
        if (ok && state && typeof state.marcarFirebaseListo === 'function') state.marcarFirebaseListo(true);
        return ok;
      })
      .catch(function (error) {
        console.warn('[Estudiantes] Precarga Firebase pendiente:', error);
        return false;
      });
  }

  function cargarSeguimiento() {
    return cargarScriptSeguimiento(
      'ta-consulta-estado-bridge',
      'js/consulta-estado.bridge.js?v=' + BUILD,
      function () { return Boolean(window.TAConsultaEstadoBridge); }
    ).then(function () {
      return cargarScriptSeguimiento(
        'ta-seguimiento-service',
        'js/seguimiento.service.js?v=' + BUILD,
        function () { return Boolean(window.TAEstudianteSeguimiento); }
      );
    }).then(function () {
      return cargarScriptSeguimiento(
        'ta-seguimiento-lookup',
        'js/seguimiento.lookup.js?v=' + BUILD,
        function () { return Boolean(window.TAEstudianteRepository && window.TAEstudianteRepository.__consultaAislada); }
      );
    }).then(function () {
      return cargarScriptSeguimiento(
        'ta-seguimiento-fast',
        'js/seguimiento.fast.js?v=' + BUILD,
        function () { return Boolean(window.TAEstudianteRepository && window.TAEstudianteRepository.__consultaRapida); }
      );
    }).then(function () {
      return cargarScriptSeguimiento(
        'ta-seguimiento-visual',
        'js/seguimiento.visual.js?v=' + BUILD,
        function () { return Boolean(document.getElementById('seguimientoVisualV2Styles')); }
      ).catch(function (error) {
        console.warn('[Estudiantes] El seguimiento funcionará sin la capa visual adicional:', error);
        return false;
      });
    });
  }

  function precalentarMotorAislado() {
    var bridge = window.TAConsultaEstadoBridge;
    if (!bridge || typeof bridge.asegurarListo !== 'function') return;

    window.setTimeout(function () {
      bridge.asegurarListo().catch(function (error) {
        console.warn('[Estudiantes] Motor aislado pendiente; se reintentará al consultar:', error);
      });
    }, 0);
  }

  function ajustarLoadingConsulta() {
    var loading = window.TAEstudianteLoading;
    var copia;
    var originalAbrir;
    var originalCerrar;
    var consultaActiva = false;

    if (!loading || loading.__consultaSinEspera) return;

    copia = copiarObjeto(loading);
    originalAbrir = loading.abrir;
    originalCerrar = loading.cerrar;

    if (typeof originalAbrir === 'function') {
      copia.abrir = function (opciones) {
        var opts = Object.assign({}, opciones || {});
        var titulo = String(opts.titulo || '').toLowerCase();
        consultaActiva = titulo.indexOf('consultando datos') !== -1 || titulo.indexOf('verificando titulación') !== -1;
        if (consultaActiva) opts.minVisibleMs = 120;
        return originalAbrir(opts);
      };
    }

    if (typeof originalCerrar === 'function') {
      copia.cerrar = function (opciones) {
        var opts = Object.assign({}, opciones || {});
        if (consultaActiva) {
          opts.respetarMinimo = false;
          consultaActiva = false;
        }
        return originalCerrar(opts);
      };
    }

    copia.__consultaSinEspera = true;
    window.TAEstudianteLoading = Object.freeze(copia);
  }

  function cargarScriptSeguimiento(id, src, verificar) {
    if (typeof verificar === 'function' && verificar()) return Promise.resolve(true);

    return new Promise(function (resolve, reject) {
      var existente = document.getElementById(id);

      if (existente) {
        if (typeof verificar !== 'function' || verificar()) {
          resolve(true);
          return;
        }

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

    var faltantes = Object.keys(dependencias).filter(function (key) { return !dependencias[key]; });
    return { ok: faltantes.length === 0, faltantes: faltantes };
  }

  function mostrarErrorDependencias(faltantes) {
    var mensaje = 'La pantalla de estudiantes no pudo iniciar correctamente. Faltan: ' + faltantes.join(', ') + '.';
    console.error('[Estudiantes] ' + mensaje);

    var consultaMensaje = document.querySelector('#consultaMensaje');
    if (consultaMensaje) {
      consultaMensaje.textContent = mensaje;
      consultaMensaje.className = 'status-message status-message--danger';
    }

    if (window.TAEstudianteModal && window.TAEstudianteModal.mostrarAlerta) {
      window.TAEstudianteModal.mostrarAlerta(mensaje, { titulo: 'Error de carga' });
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

  function copiarObjeto(objeto) {
    var copia = {};
    Object.keys(objeto || {}).forEach(function (key) { copia[key] = objeto[key]; });
    return copia;
  }

  window.TAEstudianteApp = Object.freeze({
    iniciar: iniciar,
    verificarDependencias: verificarDependencias,
    cargarSeguimiento: cargarSeguimiento,
    preconectarFirebase: preconectarFirebase,
    precalentarMotorAislado: precalentarMotorAislado
  });
})();
