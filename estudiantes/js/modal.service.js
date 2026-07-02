/*
  Archivo: modal.service.js
  Ruta: estudiantes/js/modal.service.js
  Funciones del archivo:
  - Centralizar apertura y cierre de modales del módulo estudiantes.
  - Mostrar el modal inicial obligatorio de recomendaciones.
  - Mostrar el modal de sugerencias generadas por IA sin etiquetas técnicas.
  - Mostrar únicamente alertas de carrera cuando vengan marcadas como alertaCarrera.
  - Evitar que se muestren advertencias internas como longitud, respaldo académico o warnings técnicos.
  - Mostrar alertas generales y errores sin depender de window.alert.
  - Gestionar callbacks de botones Entendido, Cancelar y Usar sugerencia.
*/
(function () {
  'use strict';

  var callbacks = {
    recomendaciones: null,
    sugerenciaSeleccionada: null,
    alertaCerrada: null
  };

  document.addEventListener('DOMContentLoaded', iniciar);

  function iniciar() {
    conectarCierreModal('#btnCerrarRecomendaciones', '#modalRecomendaciones', function () {
      ejecutarCallbackRecomendaciones();
    });

    conectarCierreModal('#btnEntendidoRecomendaciones', '#modalRecomendaciones', function () {
      ejecutarCallbackRecomendaciones();
    });

    conectarCierreModal('#btnCerrarSugerencias', '#modalSugerencias');
    conectarCierreModal('#btnCancelarSugerencias', '#modalSugerencias');

    conectarCierreModal('#btnCerrarAlerta', '#modalAlerta', function () {
      ejecutarCallbackAlerta();
    });

    conectarCierreModal('#btnAceptarAlerta', '#modalAlerta', function () {
      ejecutarCallbackAlerta();
    });

    conectarBackdrops();
    conectarEscape();
  }

  function abrirRecomendaciones(onEntendido) {
    callbacks.recomendaciones = typeof onEntendido === 'function' ? onEntendido : null;
    abrir('#modalRecomendaciones');
  }

  function abrirSugerencias(opciones) {
    opciones = opciones || {};

    var numero = Number(opciones.numero || 0);
    var sugerencias = Array.isArray(opciones.sugerencias) ? opciones.sugerencias : [];
    var contenedor = qs('#modalSugerenciasLista');

    callbacks.sugerenciaSeleccionada = typeof opciones.onSeleccionar === 'function'
      ? opciones.onSeleccionar
      : null;

    actualizarEncabezadoSugerencias();

    if (!contenedor) {
      return;
    }

    contenedor.innerHTML = '';

    if (!sugerencias.length) {
      contenedor.appendChild(crearVacio());
      abrir('#modalSugerencias');
      return;
    }

    sugerencias.slice(0, 3).forEach(function (sugerencia, index) {
      contenedor.appendChild(crearTarjetaSugerencia(numero, sugerencia, index));
    });

    abrir('#modalSugerencias');
  }

  function crearTarjetaSugerencia(numero, sugerencia, index) {
    var item = normalizarSugerencia(sugerencia);
    var article = document.createElement('article');
    var titulo = document.createElement('h3');
    var parrafo = document.createElement('p');
    var alerta = document.createElement('p');
    var actions = document.createElement('div');
    var boton = document.createElement('button');
    var alertasCarrera = obtenerAlertasCarrera(item, sugerencia);

    article.className = 'suggestion-modal-card';

    titulo.textContent = 'Sugerencia ' + (index + 1);

    parrafo.className = 'suggestion-modal-card__text';
    parrafo.textContent = item.texto || 'No se pudo leer esta sugerencia.';

    if (alertasCarrera.length) {
      alerta.className = 'suggestion-modal-card__warning';
      alerta.textContent = alertasCarrera.join(' ');
      alerta.style.margin = '10px 0 0';
      alerta.style.padding = '10px 12px';
      alerta.style.borderRadius = '12px';
      alerta.style.background = '#fff7ed';
      alerta.style.color = '#9a3412';
      alerta.style.fontWeight = '800';
      alerta.style.lineHeight = '1.45';
    }

    actions.className = 'suggestion-modal-card__actions';

    boton.type = 'button';
    boton.className = 'btn btn--primary';
    boton.textContent = 'Usar esta sugerencia';

    boton.addEventListener('click', function () {
      if (callbacks.sugerenciaSeleccionada) {
        callbacks.sugerenciaSeleccionada({
          numero: numero,
          index: index,
          texto: item.texto,
          sugerencia: item.original || {
            texto: item.texto
          }
        });
      }

      cerrar('#modalSugerencias');
    });

    actions.appendChild(boton);

    article.appendChild(titulo);
    article.appendChild(parrafo);

    if (alertasCarrera.length) {
      article.appendChild(alerta);
    }

    article.appendChild(actions);

    return article;
  }

  function crearVacio() {
    var div = document.createElement('div');
    var strong = document.createElement('strong');
    var p = document.createElement('p');

    div.className = 'suggestion-modal-empty';
    strong.textContent = 'No se generaron sugerencias válidas.';
    p.textContent = 'Puedes escribir el título manualmente o volver a intentarlo más tarde.';

    div.appendChild(strong);
    div.appendChild(p);

    return div;
  }

  function mostrarAlerta(mensaje, opciones) {
    opciones = opciones || {};

    var titulo = qs('#tituloModalAlerta') || qs('#modalAlertaTitulo');
    var texto = qs('#mensajeModalAlerta') || qs('#modalAlertaMensaje');

    callbacks.alertaCerrada = typeof opciones.onCerrar === 'function'
      ? opciones.onCerrar
      : null;

    if (titulo) {
      titulo.textContent = opciones.titulo || 'Revisa la información';
    }

    if (texto) {
      texto.textContent = mensaje || 'Revisa la información ingresada.';
    }

    abrir('#modalAlerta');
  }

  function ejecutarCallbackRecomendaciones() {
    var callback = callbacks.recomendaciones;

    callbacks.recomendaciones = null;

    if (callback) {
      callback();
    }
  }

  function ejecutarCallbackAlerta() {
    var callback = callbacks.alertaCerrada;

    callbacks.alertaCerrada = null;

    if (callback) {
      callback();
    }
  }

  function conectarCierreModal(selectorBoton, selectorModal, callback) {
    var boton = qs(selectorBoton);

    if (!boton || boton.dataset.modalBound === 'true') {
      return;
    }

    boton.dataset.modalBound = 'true';

    boton.addEventListener('click', function (event) {
      if (event && event.preventDefault) {
        event.preventDefault();
      }

      cerrar(selectorModal);

      if (typeof callback === 'function') {
        callback();
      }
    });
  }

  function conectarBackdrops() {
    qsa('[data-close-modal]').forEach(function (element) {
      if (element.dataset.modalBackdropBound === 'true') {
        return;
      }

      element.dataset.modalBackdropBound = 'true';

      element.addEventListener('click', function (event) {
        var selector = element.getAttribute('data-close-modal');

        if (event && event.preventDefault) {
          event.preventDefault();
        }

        if (selector) {
          cerrar(selector);
        }
      });
    });

    qsa('.modal__backdrop').forEach(function (backdrop) {
      if (backdrop.dataset.modalBackdropBound === 'true') {
        return;
      }

      backdrop.dataset.modalBackdropBound = 'true';

      backdrop.addEventListener('click', function () {
        var modal = backdrop.closest('.modal');

        if (modal && modal.id) {
          cerrar('#' + modal.id);
        }
      });
    });
  }

  function conectarEscape() {
    if (document.body.dataset.taModalEscapeBound === 'true') {
      return;
    }

    document.body.dataset.taModalEscapeBound = 'true';

    document.addEventListener('keydown', function (event) {
      if (!event || event.key !== 'Escape') {
        return;
      }

      cerrarUltimoModalAbierto();
    });
  }

  function cerrarUltimoModalAbierto() {
    var abiertos = qsa('.modal, .ia-loading-modal').filter(function (modal) {
      return !modal.classList.contains('is-hidden');
    });

    var ultimo = abiertos[abiertos.length - 1];

    if (ultimo && ultimo.id) {
      cerrar('#' + ultimo.id);
    }
  }

  function abrir(selector) {
    var modal = qs(selector);

    if (!modal) {
      return;
    }

    modal.classList.remove('is-hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('has-open-modal');
  }

  function cerrar(selector) {
    var modal = qs(selector);

    if (!modal) {
      return;
    }

    modal.classList.add('is-hidden');
    modal.setAttribute('aria-hidden', 'true');

    if (!hayModalAbierto()) {
      document.body.classList.remove('has-open-modal');
    }
  }

  function cerrarTodos() {
    qsa('.modal, .ia-loading-modal').forEach(function (modal) {
      modal.classList.add('is-hidden');
      modal.setAttribute('aria-hidden', 'true');
    });

    document.body.classList.remove('has-open-modal');
  }

  function hayModalAbierto() {
    return qsa('.modal, .ia-loading-modal').some(function (modal) {
      return !modal.classList.contains('is-hidden');
    });
  }

  function actualizarEncabezadoSugerencias() {
    var tituloModal = qs('#tituloModalSugerencias') ||
      qs('#modalSugerenciasTitulo') ||
      qs('#modalSugerencias h2');

    var subtituloModal = qs('#subtituloModalSugerencias') ||
      qs('#modalSugerenciasSubtitulo') ||
      qs('#modalSugerencias .modal__subtitle');

    if (tituloModal) {
      tituloModal.textContent = 'Elige una sugerencia';
    }

    if (subtituloModal) {
      subtituloModal.textContent = '';
      subtituloModal.style.display = 'none';
    }
  }

  function obtenerAlertasCarrera(item, original) {
    var alertas = [];

    agregarAlertasDesdeValor(alertas, item && item.alertaCarrera);
    agregarAlertasDesdeValor(alertas, item && item.alertasCarrera);
    agregarAlertasDesdeValor(alertas, original && original.alertaCarrera);
    agregarAlertasDesdeValor(alertas, original && original.alertasCarrera);

    if (item && item.original) {
      agregarAlertasDesdeValor(alertas, item.original.alertaCarrera);
      agregarAlertasDesdeValor(alertas, item.original.alertasCarrera);

      if (item.original.original) {
        agregarAlertasDesdeValor(alertas, item.original.original.alertaCarrera);
        agregarAlertasDesdeValor(alertas, item.original.original.alertasCarrera);
      }
    }

    if (original && original.original) {
      agregarAlertasDesdeValor(alertas, original.original.alertaCarrera);
      agregarAlertasDesdeValor(alertas, original.original.alertasCarrera);
    }

    return alertas;
  }

  function agregarAlertasDesdeValor(destino, valor) {
    if (typeof valor === 'string') {
      valor = [valor];
    }

    if (!Array.isArray(valor)) {
      return;
    }

    valor.forEach(function (mensaje) {
      mensaje = normalizarTexto(mensaje);

      if (mensaje && destino.indexOf(mensaje) === -1) {
        destino.push(mensaje);
      }
    });
  }

  function normalizarSugerencia(sugerencia) {
    var texto = '';

    if (typeof sugerencia === 'string') {
      texto = sugerencia;
    } else if (sugerencia && typeof sugerencia === 'object') {
      texto = sugerencia.texto ||
        sugerencia.titulo ||
        sugerencia.tituloFinal ||
        sugerencia.tituloSugerido ||
        sugerencia.propuesta ||
        sugerencia.sugerencia ||
        sugerencia.title ||
        '';
    }

    return {
      texto: normalizarTexto(texto),
      original: sugerencia
    };
  }

  function qs(selector, root) {
    return (root || document).querySelector(selector);
  }

  function qsa(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  function normalizarTexto(valor) {
    return String(valor || '').replace(/\s+/g, ' ').trim();
  }

  window.TAEstudianteModal = Object.freeze({
    abrirRecomendaciones: abrirRecomendaciones,
    abrirSugerencias: abrirSugerencias,
    mostrarAlerta: mostrarAlerta,
    abrir: abrir,
    cerrar: cerrar,
    cerrarTodos: cerrarTodos
  });
})();