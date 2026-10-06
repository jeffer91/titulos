/*
  Archivo: estudiante.app.js
  Ruta: estudiantes/js/estudiante.app.js
  Funciones principales:
  - Iniciar el módulo público de estudiantes.
  - Mantener el motor aislado fuera del arranque crítico.
  - Precargar servicios en segundo plano sin bloquear la interfaz.
  - Mostrar la carga de consulta dentro de la misma página, sin popup.
  - Mantener historial y visualización fuera del camino crítico.
*/
(function () {
  'use strict';

  var BUILD = '20261006-14';

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
        console.info('[Estudiantes] Módulo iniciado. La consulta usa carga integrada en la página.');
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

  /*
    La consulta de cédula reutiliza el componente de carga existente, pero lo mueve
    temporalmente dentro de #consultaCard. De esta forma no hay overlay, backdrop,
    bloqueo del body ni modal flotante. La IA conserva su popup original.
  */
  function ajustarLoadingConsulta() {
    var loading = window.TAEstudianteLoading;
    var copia;
    var originalAbrir;
    var originalCerrar;
    var consultaActiva = false;

    if (!loading || loading.__consultaInline) return;

    inyectarEstilosLoadingInline();

    copia = copiarObjeto(loading);
    originalAbrir = loading.abrir;
    originalCerrar = loading.cerrar;

    if (typeof originalAbrir === 'function') {
      copia.abrir = function (opciones) {
        var opts = Object.assign({}, opciones || {});
        var titulo = String(opts.titulo || '').toLowerCase();
        consultaActiva = esLoadingConsulta(titulo);

        if (consultaActiva) {
          /* loading.service usa ||, por eso se envía 1 y no 0. */
          opts.minVisibleMs = 1;
        }

        var resultado = originalAbrir(opts);

        if (consultaActiva) {
          activarLoadingInline();
        }

        return resultado;
      };
    }

    if (typeof originalCerrar === 'function') {
      copia.cerrar = function (opciones) {
        var opts = Object.assign({}, opciones || {});
        var eraConsulta = consultaActiva;

        if (eraConsulta) {
          opts.respetarMinimo = false;
          consultaActiva = false;
        }

        var resultado = originalCerrar(opts);

        if (eraConsulta) {
          desactivarLoadingInline();
        }

        return resultado;
      };
    }

    copia.__consultaSinEspera = true;
    copia.__consultaInline = true;
    window.TAEstudianteLoading = Object.freeze(copia);
  }

  function esLoadingConsulta(titulo) {
    return titulo.indexOf('consultando datos') !== -1 ||
      titulo.indexOf('verificando titulación') !== -1 ||
      titulo.indexOf('datos encontrados') !== -1;
  }

  function activarLoadingInline() {
    var modal = obtenerLoadingModal();
    var host = obtenerHostLoadingInline();
    var panel;

    if (!modal || !host) return;

    host.classList.add('is-active');
    modal.classList.add('ta-consulta-inline');
    modal.classList.remove('is-hidden');
    modal.setAttribute('aria-hidden', 'false');
    host.appendChild(modal);

    panel = modal.querySelector('.ia-loading-modal__panel') || modal.querySelector('.modal__panel');
    if (panel) {
      panel.setAttribute('role', 'status');
      panel.setAttribute('aria-live', 'polite');
      panel.setAttribute('aria-modal', 'false');
    }

    document.body.classList.remove('has-open-modal');
  }

  function desactivarLoadingInline() {
    var modal = obtenerLoadingModal();
    var host = document.querySelector('#consultaInlineLoadingHost');
    var panel;

    if (modal && modal.classList.contains('ta-consulta-inline')) {
      modal.classList.remove('ta-consulta-inline');
      panel = modal.querySelector('.ia-loading-modal__panel') || modal.querySelector('.modal__panel');
      if (panel) {
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        panel.removeAttribute('aria-live');
      }
      document.body.appendChild(modal);
    }

    if (host) host.classList.remove('is-active');
    document.body.classList.remove('has-open-modal');
  }

  function obtenerLoadingModal() {
    return document.querySelector('#modalLoadingIA') || document.querySelector('#iaLoadingModal');
  }

  function obtenerHostLoadingInline() {
    var host = document.querySelector('#consultaInlineLoadingHost');
    var card;
    var mensaje;

    if (host) return host;

    card = document.querySelector('#consultaCard');
    if (!card) return null;

    host = document.createElement('div');
    host.id = 'consultaInlineLoadingHost';
    host.className = 'consulta-inline-loading-host';
    host.setAttribute('aria-live', 'polite');

    mensaje = card.querySelector('#consultaMensaje');
    if (mensaje && mensaje.parentNode) {
      mensaje.parentNode.insertBefore(host, mensaje);
    } else {
      card.appendChild(host);
    }

    return host;
  }

  function inyectarEstilosLoadingInline() {
    if (document.getElementById('consultaInlineLoadingStyles')) return;

    var style = document.createElement('style');
    style.id = 'consultaInlineLoadingStyles';
    style.textContent = [
      '.consulta-inline-loading-host{display:none;margin-top:16px}',
      '.consulta-inline-loading-host.is-active{display:block}',
      '.consulta-inline-loading-host .ta-consulta-inline{position:static!important;inset:auto!important;width:100%!important;height:auto!important;min-height:0!important;display:block!important;background:transparent!important;padding:0!important;overflow:visible!important;z-index:auto!important}',
      '.consulta-inline-loading-host .ta-consulta-inline .ia-loading-modal__backdrop,.consulta-inline-loading-host .ta-consulta-inline .modal__backdrop{display:none!important}',
      '.consulta-inline-loading-host .ta-consulta-inline .ia-loading-modal__panel,.consulta-inline-loading-host .ta-consulta-inline .modal__panel{position:static!important;transform:none!important;width:100%!important;max-width:none!important;min-height:0!important;max-height:none!important;overflow:visible!important;margin:0!important;padding:20px!important;border:1px solid #bfd5ec!important;border-radius:18px!important;background:linear-gradient(135deg,#f7fbff 0%,#eef6ff 58%,#f8fbff 100%)!important;box-shadow:none!important;text-align:left!important}',
      '.consulta-inline-loading-host .ta-consulta-inline .ia-loading-modal__spinner{width:38px!important;height:38px!important;margin:0 0 12px!important;border-width:4px!important}',
      '.consulta-inline-loading-host .ta-consulta-inline .section-kicker{margin:0 0 5px!important;color:#416486!important}',
      '.consulta-inline-loading-host .ta-consulta-inline h2{margin:0 0 6px!important;font-size:1.18rem!important;color:#071b34!important}',
      '.consulta-inline-loading-host .ta-consulta-inline p{margin:4px 0!important}',
      '.consulta-inline-loading-host .ta-consulta-inline .ia-loading-modal__status{display:inline-flex!important;margin:10px 0 12px!important;padding:8px 12px!important;border:1px solid #b9d4ee!important;border-radius:999px!important;background:#fff!important;color:#0b3e6d!important;font-weight:800!important}',
      '.consulta-inline-loading-host .ta-consulta-inline .ia-loading-progress{height:8px!important;margin:4px 0 14px!important;background:#dce8f5!important;border-radius:999px!important;overflow:hidden!important}',
      '.consulta-inline-loading-host .ta-consulta-inline .ia-loading-progress__bar{height:100%!important;background:linear-gradient(90deg,#0b5da7,#0f8f8a)!important;border-radius:999px!important;transition:width .25s ease!important}',
      '.consulta-inline-loading-host .ta-consulta-inline .ia-loading-steps{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:8px!important;margin:0!important}',
      '.consulta-inline-loading-host .ta-consulta-inline .ia-loading-step{min-width:0!important;padding:10px!important;border:1px solid #d5e3f0!important;border-radius:12px!important;background:#fff!important}',
      '.consulta-inline-loading-host .ta-consulta-inline .ia-loading-step__label{display:block!important;font-size:.78rem!important;line-height:1.25!important;color:#18334f!important}',
      '.consulta-inline-loading-host .ta-consulta-inline .ia-loading-step__state,.consulta-inline-loading-host .ta-consulta-inline .ia-loading-step__status{display:block!important;margin-top:3px!important;font-size:.72rem!important;font-style:normal!important;color:#627b94!important}',
      '.consulta-inline-loading-host .ta-consulta-inline .ia-loading-step--completado{border-color:#9ed9bd!important;background:#f1fbf6!important}',
      '.consulta-inline-loading-host .ta-consulta-inline .ia-loading-step--trabajando{border-color:#8ab9ea!important;background:#eef6ff!important}',
      '.consulta-inline-loading-host .ta-consulta-inline .ia-loading-modal__hint{margin-top:10px!important;font-size:.78rem!important;color:#60758d!important}',
      '@media(max-width:760px){.consulta-inline-loading-host .ta-consulta-inline .ia-loading-steps{grid-template-columns:1fr 1fr!important}.consulta-inline-loading-host .ta-consulta-inline .ia-loading-modal__panel{padding:16px!important}}',
      '@media(max-width:460px){.consulta-inline-loading-host .ta-consulta-inline .ia-loading-steps{grid-template-columns:1fr!important}}'
    ].join('');

    document.head.appendChild(style);
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
