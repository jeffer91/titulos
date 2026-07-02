/*
  Archivo: loading.service.js
  Ruta: estudiantes/js/loading.service.js
  Funciones principales del archivo:
  - Mostrar una animación/modal de carga mientras se generan títulos académicos.
  - Indicar paso actual: diagnóstico, propuesta/mejora y evaluación/impacto.
  - Mostrar mensajes generales sin nombres de proveedores ni modelos de IA.
  - Informar avances sin exponer información técnica.
  - Cerrar la animación al finalizar o al producirse un error.
*/
(function () {
  'use strict';

  var estado = {
    creado: false,
    abierto: false,
    pasos: [],
    ultimoEvento: null
  };

  function abrir(opciones) {
    opciones = opciones || {};

    asegurarEstructura();

    estado.abierto = true;
    estado.pasos = [
      crearPasoEstado('diagnostico', 'Diagnóstico', 'pendiente'),
      crearPasoEstado('propuesta', 'Propuesta o mejora', 'pendiente'),
      crearPasoEstado('evaluacion', 'Evaluación o impacto', 'pendiente')
    ];

    setText('#iaLoadingTitulo', 'IA de Titulación trabajando');
    setText('#iaLoadingDetalle', 'Estamos generando tus sugerencias de título. Espera un momento.');
    setText('#iaLoadingProveedor', 'Procesando solicitud académica...');
    setText('#iaLoadingNota', 'Este proceso puede tardar unos segundos.');
    actualizarPasos();

    var modal = qs('#modalLoadingIA');

    if (modal) {
      modal.classList.remove('is-hidden');
      modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('has-open-modal');
    }
  }

  function progreso(evento) {
    evento = evento || {};
    estado.ultimoEvento = evento;

    asegurarEstructura();

    if (!estado.abierto) {
      abrir();
    }

    setText('#iaLoadingTitulo', obtenerTituloSeguro(evento));
    setText('#iaLoadingDetalle', obtenerDetalleSeguro(evento));
    setText('#iaLoadingProveedor', obtenerEstadoSeguro(evento));
    setText('#iaLoadingNota', obtenerNotaSegura(evento));

    marcarPaso(evento);
    actualizarProgreso(evento);
  }

  function cerrar() {
    var modal = qs('#modalLoadingIA');

    estado.abierto = false;

    if (modal) {
      modal.classList.add('is-hidden');
      modal.setAttribute('aria-hidden', 'true');
    }

    if (!hayOtroModalAbierto()) {
      document.body.classList.remove('has-open-modal');
    }
  }

  function mostrarError(mensaje) {
    asegurarEstructura();
    estado.abierto = true;

    var modal = qs('#modalLoadingIA');

    setText('#iaLoadingTitulo', 'No se pudieron generar títulos');
    setText('#iaLoadingDetalle', mensaje || 'No se pudo completar la generación en este momento.');
    setText('#iaLoadingProveedor', 'Generación no disponible.');
    setText('#iaLoadingNota', 'Puedes intentarlo nuevamente o revisar la configuración.');

    if (modal) {
      modal.classList.remove('is-hidden');
      modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('has-open-modal');
    }
  }

  function asegurarEstructura() {
    if (estado.creado && qs('#modalLoadingIA')) {
      return;
    }

    var modal = document.createElement('section');

    modal.id = 'modalLoadingIA';
    modal.className = 'ia-loading-modal is-hidden';
    modal.setAttribute('aria-hidden', 'true');

    modal.innerHTML = [
      '<div class="ia-loading-modal__backdrop"></div>',
      '<div class="ia-loading-modal__panel" role="dialog" aria-modal="true" aria-labelledby="iaLoadingTitulo">',
      '  <div class="ia-loading-modal__spinner" aria-hidden="true"></div>',
      '  <p class="section-kicker">Titulación académica</p>',
      '  <h2 id="iaLoadingTitulo">IA de Titulación trabajando</h2>',
      '  <p class="ia-loading-modal__detail" id="iaLoadingDetalle">Estamos generando tus sugerencias de título. Espera un momento.</p>',
      '  <div class="ia-loading-provider" id="iaLoadingProveedor">Procesando solicitud académica...</div>',
      '  <div class="ia-loading-progress" aria-hidden="true">',
      '    <span id="iaLoadingProgressBar"></span>',
      '  </div>',
      '  <div class="ia-loading-steps" id="iaLoadingSteps"></div>',
      '  <p class="ia-loading-modal__note" id="iaLoadingNota">Este proceso puede tardar unos segundos.</p>',
      '</div>'
    ].join('');

    document.body.appendChild(modal);
    estado.creado = true;
  }

  function marcarPaso(evento) {
    var enfoque = evento.enfoque || '';

    if (!enfoque) {
      return;
    }

    estado.pasos = estado.pasos.map(function (paso) {
      if (paso.id === enfoque) {
        if (evento.tipo === 'falloProveedor') {
          return Object.assign({}, paso, {
            estado: 'trabajando'
          });
        }

        if (evento.tipo === 'exitoProveedor') {
          return Object.assign({}, paso, {
            estado: 'completado'
          });
        }

        return Object.assign({}, paso, {
          estado: 'trabajando'
        });
      }

      if (evento.pasoActual && obtenerIndicePaso(paso.id) < Number(evento.pasoActual) - 1) {
        return Object.assign({}, paso, {
          estado: 'completado'
        });
      }

      return paso;
    });

    actualizarPasos();
  }

  function actualizarPasos() {
    var contenedor = qs('#iaLoadingSteps');

    if (!contenedor) {
      return;
    }

    contenedor.innerHTML = '';

    estado.pasos.forEach(function (paso) {
      var item = document.createElement('div');
      item.className = 'ia-loading-step ia-loading-step--' + paso.estado;

      item.innerHTML = [
        '<span class="ia-loading-step__dot"></span>',
        '<span class="ia-loading-step__label">' + escaparHtml(paso.label) + '</span>',
        '<span class="ia-loading-step__state">' + obtenerTextoEstado(paso.estado) + '</span>'
      ].join('');

      contenedor.appendChild(item);
    });
  }

  function actualizarProgreso(evento) {
    var bar = qs('#iaLoadingProgressBar');
    var pasoActual = Number(evento.pasoActual || 0);
    var totalPasos = Number(evento.totalPasos || 3);
    var porcentaje;

    if (!bar) {
      return;
    }

    if (!pasoActual || !totalPasos) {
      porcentaje = 8;
    } else {
      porcentaje = Math.max(8, Math.min(100, Math.round((pasoActual / totalPasos) * 100)));
    }

    if (evento.tipo === 'finalizado') {
      porcentaje = 100;
    }

    bar.style.width = porcentaje + '%';
  }

  function crearPasoEstado(id, label, estadoPaso) {
    return {
      id: id,
      label: label,
      estado: estadoPaso || 'pendiente'
    };
  }

  function obtenerIndicePaso(id) {
    if (id === 'diagnostico') {
      return 0;
    }

    if (id === 'propuesta') {
      return 1;
    }

    if (id === 'evaluacion') {
      return 2;
    }

    return 99;
  }

  function obtenerTextoEstado(estadoPaso) {
    if (estadoPaso === 'completado') {
      return 'Listo';
    }

    if (estadoPaso === 'trabajando') {
      return 'Generando';
    }

    if (estadoPaso === 'error') {
      return 'Error';
    }

    return 'Pendiente';
  }

  function obtenerTituloSeguro(evento) {
    if (evento.tipo === 'finalizado') {
      return 'Sugerencias listas';
    }

    if (evento.tipo === 'error') {
      return 'No se pudieron generar títulos';
    }

    return 'IA de Titulación trabajando';
  }

  function obtenerDetalleSeguro(evento) {
    var enfoque = String(evento && evento.enfoque ? evento.enfoque : '').toLowerCase();

    if (evento.tipo === 'finalizado') {
      return 'Terminamos de preparar tus opciones de título.';
    }

    if (evento.tipo === 'error') {
      return 'No se pudo completar la generación en este momento.';
    }

    if (enfoque === 'diagnostico') {
      return 'Analizando la propuesta del estudiante.';
    }

    if (enfoque === 'propuesta') {
      return 'Mejorando la redacción académica del título.';
    }

    if (enfoque === 'evaluacion') {
      return 'Revisando el enfoque final del título.';
    }

    return 'Estamos generando tus sugerencias de título. Espera un momento.';
  }

  function obtenerEstadoSeguro(evento) {
    if (evento.tipo === 'finalizado') {
      return 'Proceso completado.';
    }

    if (evento.tipo === 'error') {
      return 'Generación no disponible.';
    }

    return 'Procesando solicitud académica...';
  }

  function obtenerNotaSegura(evento) {
    if (evento.tipo === 'falloProveedor') {
      return 'Estamos ajustando el proceso automáticamente.';
    }

    if (evento.tipo === 'exitoProveedor') {
      return 'Avanzando con la generación del título.';
    }

    if (evento.tipo === 'error') {
      return 'No se pudo completar la generación en este momento.';
    }

    if (evento.tipo === 'finalizado') {
      return 'Ya puedes revisar las sugerencias generadas.';
    }

    return 'Este proceso puede tardar unos segundos.';
  }

  function hayOtroModalAbierto() {
    return Array.prototype.slice.call(document.querySelectorAll('.modal, .ia-loading-modal'))
      .some(function (modal) {
        if (modal.id === 'modalLoadingIA') {
          return false;
        }

        return !modal.classList.contains('is-hidden');
      });
  }

  function setText(selector, texto) {
    var element = qs(selector);

    if (element) {
      element.textContent = texto || '';
    }
  }

  function qs(selector) {
    return document.querySelector(selector);
  }

  function escaparHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  window.TAEstudianteLoading = Object.freeze({
    abrir: abrir,
    progreso: progreso,
    cerrar: cerrar,
    mostrarError: mostrarError
  });
})();