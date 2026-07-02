/*
  Archivo: loading.service.js
  Ruta: estudiantes/js/loading.service.js
  Funciones principales del archivo:
  - Mostrar una animación/modal de carga mientras se generan títulos académicos.
  - Indicar paso actual: diagnóstico, propuesta/mejora y evaluación/impacto.
  - Mostrar mensajes generales sin nombres de proveedores ni modelos de IA.
  - Informar avances sin exponer información técnica.
  - Reutilizar el modal existente del HTML si ya existe.
  - Evitar duplicados entre iaLoadingModal y modalLoadingIA.
  - Mantener visible la carga mínimo 3 segundos cuando se solicite.
  - Cerrar la animación al finalizar o al producirse un error.
*/
(function () {
  'use strict';

  var MODAL_CANONICO_ID = 'modalLoadingIA';
  var MODAL_HTML_ID = 'iaLoadingModal';
  var MIN_VISIBLE_DEFAULT_MS = 3000;

  var estado = {
    abierto: false,
    abiertoEn: 0,
    minVisibleMs: MIN_VISIBLE_DEFAULT_MS,
    cierreProgramado: null,
    pasos: [],
    ultimoEvento: null
  };

  function abrir(opciones) {
    opciones = opciones || {};

    asegurarEstructura();
    cancelarCierreProgramado();

    estado.abierto = true;
    estado.abiertoEn = Date.now();
    estado.minVisibleMs = Number(opciones.minVisibleMs || MIN_VISIBLE_DEFAULT_MS);
    estado.pasos = crearPasosIniciales();
    estado.ultimoEvento = null;

    setText('#iaLoadingTitulo', opciones.titulo || 'IA de Titulación trabajando');
    setText('#iaLoadingDetalle', opciones.detalle || 'Estamos generando tus sugerencias de título. Espera un momento.');
    setEstadoTexto(opciones.estado || 'Procesando solicitud académica...');
    setNotaTexto('Este proceso durará al menos 3 segundos para mostrar el avance.');

    actualizarPasos();
    actualizarProgreso({
      pasoActual: Number(opciones.pasoActual || 0),
      totalPasos: Number(opciones.totalPasos || 3),
      progreso: Number(opciones.progreso || 8)
    });

    mostrarModal();
  }

  function progreso(evento) {
    evento = evento || {};
    estado.ultimoEvento = evento;

    asegurarEstructura();

    if (!estado.abierto) {
      abrir({
        minVisibleMs: MIN_VISIBLE_DEFAULT_MS
      });
    }

    setText('#iaLoadingTitulo', obtenerTituloSeguro(evento));
    setText('#iaLoadingDetalle', obtenerDetalleSeguro(evento));
    setEstadoTexto(obtenerEstadoSeguro(evento));
    setNotaTexto(obtenerNotaSegura(evento));

    marcarPaso(evento);
    actualizarProgreso(evento);
  }

  function cerrar(opciones) {
    var transcurrido;
    var espera;

    opciones = opciones || {};

    if (!estado.abierto && !obtenerModal()) {
      return Promise.resolve(true);
    }

    if (opciones.respetarMinimo === false) {
      cerrarAhora();
      return Promise.resolve(true);
    }

    transcurrido = estado.abiertoEn ? Date.now() - estado.abiertoEn : estado.minVisibleMs;
    espera = Math.max(0, Number(estado.minVisibleMs || MIN_VISIBLE_DEFAULT_MS) - transcurrido);

    cancelarCierreProgramado();

    return new Promise(function (resolve) {
      estado.cierreProgramado = window.setTimeout(function () {
        cerrarAhora();
        resolve(true);
      }, espera);
    });
  }

  function cerrarAhora() {
    var modal = obtenerModal();

    cancelarCierreProgramado();

    estado.abierto = false;
    estado.abiertoEn = 0;

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
    cancelarCierreProgramado();

    estado.abierto = true;

    setText('#iaLoadingTitulo', 'No se pudieron generar títulos');
    setText('#iaLoadingDetalle', limpiarMensaje(mensaje) || 'No se pudo completar la generación en este momento.');
    setEstadoTexto('Generación no disponible.');
    setNotaTexto('Puedes intentarlo nuevamente o revisar la configuración.');

    marcarPaso({
      tipo: 'error',
      pasoActual: 0,
      totalPasos: 3,
      progreso: 100
    });

    mostrarModal();
  }

  function cancelarCierreProgramado() {
    if (estado.cierreProgramado) {
      window.clearTimeout(estado.cierreProgramado);
      estado.cierreProgramado = null;
    }
  }

  function mostrarModal() {
    var modal = obtenerModal();

    if (!modal) {
      return;
    }

    modal.classList.remove('is-hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('has-open-modal');
  }

  function asegurarEstructura() {
    var modal = obtenerModal();
    var htmlModal;
    var canonico;

    if (!modal) {
      crearModal();
      return;
    }

    if (modal.id === MODAL_HTML_ID) {
      htmlModal = modal;
      canonico = document.getElementById(MODAL_CANONICO_ID);

      if (!canonico) {
        htmlModal.id = MODAL_CANONICO_ID;
      }
    }

    asegurarProgreso();
    asegurarPasos();
  }

  function crearModal() {
    var modal = document.createElement('section');

    modal.id = MODAL_CANONICO_ID;
    modal.className = 'ia-loading-modal is-hidden';
    modal.setAttribute('aria-hidden', 'true');

    modal.innerHTML = [
      '<div class="ia-loading-modal__backdrop"></div>',
      '<div class="ia-loading-modal__panel" role="dialog" aria-modal="true" aria-labelledby="iaLoadingTitulo">',
      '<div class="ia-loading-modal__spinner" aria-hidden="true"></div>',
      '<p class="section-kicker">Titulación académica</p>',
      '<h2 id="iaLoadingTitulo">IA de Titulación trabajando</h2>',
      '<p id="iaLoadingDetalle">Analizando la propuesta del estudiante.</p>',
      '<div class="ia-loading-modal__status" id="iaLoadingEstado">Procesando solicitud académica...</div>',
      '<div class="ia-loading-progress" aria-hidden="true">',
      '<div class="ia-loading-progress__bar" id="iaLoadingProgressBar"></div>',
      '</div>',
      '<div class="ia-loading-steps" id="iaLoadingSteps"></div>',
      '<p class="ia-loading-modal__hint" id="iaLoadingNota">Este proceso durará al menos 3 segundos.</p>',
      '</div>'
    ].join('');

    document.body.appendChild(modal);

    estado.pasos = crearPasosIniciales();
    actualizarPasos();
  }

  function obtenerModal() {
    return document.getElementById(MODAL_CANONICO_ID) ||
      document.getElementById(MODAL_HTML_ID);
  }

  function asegurarProgreso() {
    var modal = obtenerModal();
    var panel;
    var progress;
    var bar;

    if (!modal) {
      return;
    }

    progress = modal.querySelector('.ia-loading-progress');

    if (!progress) {
      panel = modal.querySelector('.ia-loading-modal__panel') || modal;
      progress = document.createElement('div');
      progress.className = 'ia-loading-progress';
      progress.setAttribute('aria-hidden', 'true');
      progress.innerHTML = '<div class="ia-loading-progress__bar" id="iaLoadingProgressBar"></div>';

      insertarDespues(progress, qs('#iaLoadingEstado'), panel);
    }

    bar = qs('#iaLoadingProgressBar') || progress.querySelector('.ia-loading-progress__bar');

    if (bar && !bar.id) {
      bar.id = 'iaLoadingProgressBar';
    }
  }

  function asegurarPasos() {
    var modal = obtenerModal();
    var panel;
    var steps;

    if (!modal) {
      return;
    }

    steps = qs('#iaLoadingSteps');

    if (!steps) {
      panel = modal.querySelector('.ia-loading-modal__panel') || modal;
      steps = document.createElement('div');
      steps.className = 'ia-loading-steps';
      steps.id = 'iaLoadingSteps';

      insertarDespues(steps, modal.querySelector('.ia-loading-progress'), panel);
    }

    if (!steps.children.length) {
      estado.pasos = crearPasosIniciales();
      actualizarPasos();
    }
  }

  function crearPasosIniciales() {
    return [
      {
        id: 'diagnostico',
        label: 'Diagnóstico',
        estado: 'pendiente'
      },
      {
        id: 'propuesta',
        label: 'Propuesta o mejora',
        estado: 'pendiente'
      },
      {
        id: 'evaluacion',
        label: 'Evaluación o impacto',
        estado: 'pendiente'
      }
    ];
  }

  function actualizarPasos() {
    var steps = qs('#iaLoadingSteps');

    if (!steps) {
      return;
    }

    steps.innerHTML = '';

    estado.pasos.forEach(function (paso) {
      var div = document.createElement('div');

      div.className = 'ia-loading-step ia-loading-step--' + paso.estado;
      div.setAttribute('data-step', paso.id);

      div.innerHTML = [
        '<span class="ia-loading-step__dot" aria-hidden="true"></span>',
        '<strong class="ia-loading-step__label">' + escaparHtml(paso.label) + '</strong>',
        '<em class="ia-loading-step__state">' + escaparHtml(obtenerTextoEstadoPaso(paso.estado)) + '</em>'
      ].join('');

      steps.appendChild(div);
    });
  }

  function marcarPaso(evento) {
    var pasoActual;
    var totalPasos;

    evento = evento || {};
    pasoActual = Number(evento.pasoActual || evento.step || 0);
    totalPasos = Number(evento.totalPasos || evento.total || 3);

    if (evento.tipo === 'finalizado') {
      estado.pasos.forEach(function (paso) {
        paso.estado = 'completado';
      });

      actualizarPasos();
      return;
    }

    if (evento.tipo === 'error') {
      estado.pasos.forEach(function (paso) {
        paso.estado = 'pendiente';
      });

      actualizarPasos();
      return;
    }

    estado.pasos.forEach(function (paso, index) {
      if (index + 1 < pasoActual) {
        paso.estado = 'completado';
      } else if (index + 1 === pasoActual) {
        paso.estado = 'trabajando';
      } else {
        paso.estado = 'pendiente';
      }
    });

    if (pasoActual <= 0 && totalPasos > 0) {
      estado.pasos[0].estado = 'trabajando';
    }

    actualizarPasos();
  }

  function actualizarProgreso(evento) {
    var bar = qs('#iaLoadingProgressBar') ||
      (obtenerModal() ? obtenerModal().querySelector('.ia-loading-progress__bar') : null);
    var pasoActual;
    var totalPasos;
    var progreso;

    evento = evento || {};
    pasoActual = Number(evento.pasoActual || evento.step || 0);
    totalPasos = Number(evento.totalPasos || evento.total || 3);
    progreso = Number(evento.progreso || evento.percent || evento.porcentaje || 0);

    if (!progreso && pasoActual && totalPasos) {
      progreso = Math.round((pasoActual / totalPasos) * 100);
    }

    if (evento.tipo === 'inicio') {
      progreso = Math.max(progreso, 12);
    }

    if (evento.tipo === 'finalizado') {
      progreso = 100;
    }

    if (evento.tipo === 'error') {
      progreso = 100;
    }

    progreso = Math.max(8, Math.min(100, progreso || 12));

    if (bar) {
      bar.style.width = progreso + '%';
    }
  }

  function obtenerTextoEstadoPaso(estadoPaso) {
    if (estadoPaso === 'completado') {
      return 'Listo';
    }

    if (estadoPaso === 'trabajando') {
      return 'Procesando';
    }

    return 'Pendiente';
  }

  function obtenerTituloSeguro(evento) {
    evento = evento || {};

    if (evento.tipo === 'finalizado') {
      return 'Títulos generados';
    }

    if (evento.tipo === 'error') {
      return 'No se pudieron generar títulos';
    }

    return limpiarMensaje(evento.titulo || 'IA de Titulación trabajando');
  }

  function obtenerDetalleSeguro(evento) {
    var enfoque;

    evento = evento || {};
    enfoque = normalizarEnfoque(evento.enfoque);

    if (evento.tipo === 'finalizado') {
      return 'Las sugerencias fueron generadas correctamente.';
    }

    if (evento.tipo === 'error') {
      return 'No se pudo completar la generación en este momento.';
    }

    if (evento.tipo === 'reescritura') {
      return 'Estamos ajustando la redacción para que el título quede completo y académico.';
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

    return limpiarMensaje(evento.detalle || 'Estamos generando tus sugerencias de título. Espera un momento.');
  }

  function obtenerEstadoSeguro(evento) {
    evento = evento || {};

    if (evento.tipo === 'finalizado') {
      return 'Proceso completado.';
    }

    if (evento.tipo === 'error') {
      return 'Generación no disponible.';
    }

    if (evento.tipo === 'falloProveedor') {
      return 'Ajustando el proceso automáticamente...';
    }

    if (evento.tipo === 'reescritura') {
      return 'Corrigiendo título incompleto...';
    }

    return limpiarMensaje(evento.estado || evento.mensaje || 'Procesando solicitud académica...');
  }

  function obtenerNotaSegura(evento) {
    evento = evento || {};

    if (evento.tipo === 'falloProveedor') {
      return 'Estamos intentando completar la generación sin mostrar detalles técnicos.';
    }

    if (evento.tipo === 'exitoProveedor') {
      return 'Avanzando con la generación del título.';
    }

    if (evento.tipo === 'reescritura') {
      return 'No se cortará el título; se reescribirá completo si hace falta.';
    }

    if (evento.tipo === 'error') {
      return 'Puedes intentarlo nuevamente o revisar la configuración.';
    }

    if (evento.tipo === 'finalizado') {
      return 'Ya puedes revisar las sugerencias generadas.';
    }

    return 'Este proceso durará al menos 3 segundos para mostrar el avance.';
  }

  function setEstadoTexto(texto) {
    setText('#iaLoadingEstado', texto);
    setText('#iaLoadingProveedor', texto);
  }

  function setNotaTexto(texto) {
    var nota = qs('#iaLoadingNota');
    var modal = obtenerModal();
    var hint = modal ? modal.querySelector('.ia-loading-modal__hint') : null;

    if (nota) {
      nota.textContent = texto || '';
    }

    if (hint) {
      hint.textContent = texto || '';
    }
  }

  function hayOtroModalAbierto() {
    return Array.prototype.slice.call(document.querySelectorAll('.modal, .ia-loading-modal'))
      .some(function (modal) {
        if (modal.id === MODAL_CANONICO_ID || modal.id === MODAL_HTML_ID) {
          return false;
        }

        return !modal.classList.contains('is-hidden');
      });
  }

  function insertarDespues(nuevoElemento, referencia, fallbackPadre) {
    if (referencia && referencia.parentNode) {
      referencia.parentNode.insertBefore(nuevoElemento, referencia.nextSibling);
      return;
    }

    fallbackPadre.appendChild(nuevoElemento);
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

  function normalizarEnfoque(enfoque) {
    enfoque = String(enfoque || '').toLowerCase().trim();

    if (enfoque === 'diagnóstico') {
      return 'diagnostico';
    }

    if (enfoque === 'mejora') {
      return 'propuesta';
    }

    if (enfoque === 'impacto') {
      return 'evaluacion';
    }

    if (enfoque === 'diagnostico' || enfoque === 'propuesta' || enfoque === 'evaluacion') {
      return enfoque;
    }

    return '';
  }

  function limpiarMensaje(mensaje) {
    return String(mensaje || '')
      .replace(/key=[^\s&]+/ig, 'key=***')
      .replace(/api[_-]?key[^\s]+/ig, 'apiKey=***')
      .replace(/Bearer\s+[^\s]+/ig, 'Bearer ***')
      .replace(/Google Gemini API|Gemini|Groq|OpenRouter|Cloudflare/ig, 'IA de Titulación')
      .replace(/\s+/g, ' ')
      .trim();
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
    cerrarAhora: cerrarAhora,
    mostrarError: mostrarError
  });
})();