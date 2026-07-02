/*
  Archivo: modal.service.js
  Ruta: estudiantes/js/modal.service.js
  Funciones del archivo:
  - Centralizar apertura y cierre de modales del módulo estudiantes.
  - Mostrar el modal inicial obligatorio de recomendaciones.
  - Mostrar el modal de sugerencias generadas por IA sin etiquetas técnicas.
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
    var actions = document.createElement('div');
    var boton = document.createElement('button');

    article.className = 'suggestion-modal-card';

    titulo.textContent = 'Sugerencia ' + (index + 1);

    parrafo.className = 'suggestion-modal-card__text';
    parrafo.textContent = item.texto || 'No se pudo leer esta sugerencia.';

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

    var titulo = qs('#tituloModalAlerta');
    var texto = qs('#mensajeModalAlerta');

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

  function abrir(selector) {
    var modal = qs(selector);

    if (!modal) {
      return;
    }

    modal.classList.remove('is-hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('has-open-modal');

    enfocarPrimerBoton(modal);
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
    qsa('.modal').forEach(function (modal) {
      modal.classList.add('is-hidden');
      modal.setAttribute('aria-hidden', 'true');
    });

    document.body.classList.remove('has-open-modal');
  }

  function conectarCierreModal(botonSelector, modalSelector, despuesDeCerrar) {
    var boton = qs(botonSelector);

    if (!boton) {
      return;
    }

    boton.addEventListener('click', function () {
      cerrar(modalSelector);

      if (typeof despuesDeCerrar === 'function') {
        despuesDeCerrar();
      }
    });
  }

  function conectarBackdrops() {
    qsa('.modal__backdrop').forEach(function (backdrop) {
      backdrop.addEventListener('click', function () {
        var modal = backdrop.closest ? backdrop.closest('.modal') : null;

        if (!modal) {
          return;
        }

        if (modal.id === 'modalRecomendaciones') {
          return;
        }

        cerrar('#' + modal.id);
      });
    });
  }

  function conectarEscape() {
    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') {
        return;
      }

      var modalRecomendaciones = qs('#modalRecomendaciones');

      if (modalRecomendaciones && !modalRecomendaciones.classList.contains('is-hidden')) {
        return;
      }

      cerrarTodos();
    });
  }

  function ejecutarCallbackRecomendaciones() {
    var callback = callbacks.recomendaciones;
    callbacks.recomendaciones = null;

    if (typeof callback === 'function') {
      callback();
    }
  }

  function ejecutarCallbackAlerta() {
    var callback = callbacks.alertaCerrada;
    callbacks.alertaCerrada = null;

    if (typeof callback === 'function') {
      callback();
    }
  }

  function hayModalAbierto() {
    return qsa('.modal').some(function (modal) {
      return !modal.classList.contains('is-hidden');
    });
  }

  function enfocarPrimerBoton(modal) {
    window.setTimeout(function () {
      var boton = modal.querySelector('button:not([disabled])');

      if (boton) {
        boton.focus();
      }
    }, 60);
  }

function actualizarEncabezadoSugerencias() {
  var tituloModal = qs('#modalSugerenciasTitulo');
  var subtituloModal = qs('#modalSugerenciasSubtitulo');

  if (tituloModal) {
    tituloModal.textContent = '';
    tituloModal.style.display = 'none';
  }

  if (subtituloModal) {
    subtituloModal.textContent = '';
    subtituloModal.style.display = 'none';
  }
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