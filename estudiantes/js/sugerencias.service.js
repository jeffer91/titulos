/*
  Archivo: sugerencias.service.js
  Ruta: estudiantes/js/sugerencias.service.js
  Funciones principales del archivo:
  - Normalizar sugerencias generadas por IA como objetos enriquecidos o texto simple.
  - Abrir el modal de sugerencias para que el estudiante elija una opción.
  - Evitar que el título final se complete sin una selección explícita.
  - Copiar la sugerencia elegida al campo de título final de la propuesta.
  - Marcar el campo de título final como elegido desde sugerencias.
  - Conservar metadatos de IA: proveedor, modelo, enfoque, calidad, advertencias e índice.
  - Limpiar selección anterior cuando se regeneran sugerencias.
  - Exponer obtenerSeleccion() para validaciones.js.
*/
(function () {
  'use strict';

  var estado = {
    ultimaPropuesta: 0,
    ultimasSugerencias: [],
    porPropuesta: {},
    seleccionadas: {}
  };

  function renderizar(numero, sugerencias, opciones) {
    var lista;

    numero = Number(numero || 0);
    opciones = opciones || {};
    lista = normalizarLista(sugerencias, opciones);

    estado.ultimaPropuesta = numero;
    estado.ultimasSugerencias = lista;
    estado.porPropuesta[numero] = lista;

    if (!numero) {
      return;
    }

    limpiar(numero, {
      conservarSugerencias: true
    });

    if (!lista.length) {
      mostrarErrorSugerencias();
      return;
    }

    abrirModalSeleccion(numero, lista, opciones);
  }

  function abrirModalSeleccion(numero, sugerencias, opciones) {
    var modalService = window.TAEstudianteModal;

    opciones = opciones || {};

    if (modalService && typeof modalService.abrirSugerencias === 'function') {
      modalService.abrirSugerencias({
        numero: numero,
        sugerencias: sugerencias,
        onSeleccionar: function (seleccion) {
          var aplicada = aplicar(
            seleccion.numero || numero,
            seleccion.sugerencia || seleccion.texto,
            seleccion.index || 0
          );

          if (typeof opciones.onSeleccionar === 'function') {
            opciones.onSeleccionar(aplicada || seleccion);
          }
        }
      });

      return;
    }

    abrirModalFallback(numero, sugerencias, opciones);
  }

  function aplicar(numero, sugerencia, index) {
    var item;
    var texto;
    var campo;

    numero = Number(numero || 0);
    index = Number(index || 0);

    item = normalizarSugerencia(sugerencia, {
      index: index,
      enfoque: obtenerEnfoquePorIndice(index),
      numero: numero
    });

    texto = limpiarTitulo(item.texto);
    campo = obtenerCampoTitulo(numero);

    if (!numero || !texto || !campo) {
      return null;
    }

    campo.value = texto;
    campo.setAttribute('data-sugerencia-seleccionada', 'true');
    campo.setAttribute('data-sugerencia-index', String(index));
    campo.setAttribute('data-sugerencia-enfoque', item.enfoque || obtenerEnfoquePorIndice(index));
    campo.setAttribute('data-sugerencia-fecha', new Date().toISOString());
    campo.setAttribute('readonly', 'readonly');

    campo.dispatchEvent(new Event('input', { bubbles: true }));
    campo.dispatchEvent(new Event('change', { bubbles: true }));

    estado.seleccionadas[numero] = Object.assign({}, item, {
      numero: numero,
      index: index,
      texto: texto,
      titulo: texto,
      sugerencia: texto,
      fecha: new Date().toISOString()
    });

    resaltarCampo(campo, item);
    marcarSugerenciaActiva(numero, index);
    mostrarMensajeAplicado(numero, item);
    cerrarModalSugerencias();

    return estado.seleccionadas[numero];
  }

  function limpiar(numero, opciones) {
    var campo;
    var contenedor;

    opciones = opciones || {};
    numero = Number(numero || 0);

    if (!numero) {
      limpiarTodo();
      return;
    }

    delete estado.seleccionadas[numero];

    if (!opciones.conservarSugerencias) {
      delete estado.porPropuesta[numero];
    }

    campo = obtenerCampoTitulo(numero);

    if (campo) {
      campo.value = '';
      campo.removeAttribute('data-sugerencia-seleccionada');
      campo.removeAttribute('data-sugerencia-index');
      campo.removeAttribute('data-sugerencia-enfoque');
      campo.removeAttribute('data-sugerencia-fecha');
      campo.classList.remove('title-final-selected', 'title-final-selected--stable');

      if (!campo.hasAttribute('readonly')) {
        campo.setAttribute('readonly', 'readonly');
      }

      campo.dispatchEvent(new Event('input', { bubbles: true }));
      campo.dispatchEvent(new Event('change', { bubbles: true }));

      limpiarEstadoCampo(campo);
    }

    contenedor = obtenerContenedorSugerencias(numero);

    if (contenedor && !opciones.conservarSugerencias) {
      contenedor.innerHTML = '';
    }
  }

  function limpiarTodo() {
    Object.keys(estado.seleccionadas).forEach(function (numero) {
      limpiar(Number(numero), {
        conservarSugerencias: false
      });
    });

    estado.ultimaPropuesta = 0;
    estado.ultimasSugerencias = [];
    estado.porPropuesta = {};
    estado.seleccionadas = {};

    cerrarModalSugerencias();
  }

  function obtenerSeleccion(numero) {
    numero = Number(numero || 0);
    return estado.seleccionadas[numero] || null;
  }

  function normalizarLista(sugerencias, opciones) {
    var lista;

    opciones = opciones || {};

    if (!Array.isArray(sugerencias)) {
      sugerencias = extraerDesdeRespuesta(sugerencias);
    }

    lista = (sugerencias || [])
      .map(function (item, index) {
        return normalizarSugerencia(item, {
          index: index,
          enfoque: obtenerEnfoquePorIndice(index),
          respuestaIA: opciones.respuestaIA,
          propuesta: opciones.propuesta,
          estudiante: opciones.estudiante
        });
      })
      .filter(function (item) {
        return Boolean(item && item.texto);
      });

    lista = deduplicarPorTexto(lista);

    return lista.slice(0, 3);
  }

  function normalizarSugerencia(sugerencia, opciones) {
    var texto;
    var original;

    opciones = opciones || {};
    original = sugerencia;

    if (typeof sugerencia === 'string') {
      texto = sugerencia;
      sugerencia = {
        texto: sugerencia
      };
    } else {
      sugerencia = sugerencia || {};
      texto = sugerencia.texto ||
        sugerencia.titulo ||
        sugerencia.sugerencia ||
        sugerencia.title ||
        sugerencia.value ||
        '';
    }

    texto = limpiarTitulo(texto);

    return {
      texto: texto,
      titulo: texto,
      sugerencia: texto,
      enfoque: limpiarTexto(sugerencia.enfoque || opciones.enfoque || obtenerEnfoquePorIndice(opciones.index)),
      calidad: limpiarTexto(sugerencia.calidad || sugerencia.nivel || ''),
      proveedor: limpiarTexto(sugerencia.proveedor || sugerencia.provider || obtenerValorSeguro(opciones.respuestaIA, 'proveedor')),
      modelo: limpiarTexto(sugerencia.modelo || sugerencia.model || obtenerValorSeguro(opciones.respuestaIA, 'modelo')),
      advertencias: normalizarAdvertencias(sugerencia.advertencias || sugerencia.warnings || []),
      index: Number(opciones.index || sugerencia.index || 0),
      original: original || sugerencia
    };
  }

  function abrirModalFallback(numero, sugerencias, opciones) {
    var modal = obtenerModalSugerencias();
    var lista = modal.querySelector('#modalSugerenciasLista');

    if (!lista) {
      aplicar(numero, sugerencias[0], 0);
      return;
    }

    actualizarEncabezadoModal(numero);
    lista.innerHTML = '';

    sugerencias.slice(0, 3).forEach(function (sugerencia, index) {
      lista.appendChild(crearTarjetaSugerencia(numero, sugerencia, index, opciones));
    });

    modal.classList.remove('is-hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('has-open-modal');

    enfocarPrimerBoton(modal);
  }

  function obtenerModalSugerencias() {
    var modal = document.querySelector('#modalSugerencias');

    if (modal) {
      return modal;
    }

    modal = document.createElement('section');
    modal.id = 'modalSugerencias';
    modal.className = 'modal is-hidden';
    modal.setAttribute('aria-hidden', 'true');

    modal.innerHTML = [
      '<div class="modal__backdrop"></div>',
      '<div class="modal__panel modal__panel--wide" role="dialog" aria-modal="true" aria-labelledby="modalSugerenciasTitulo">',
      '<button class="modal__close" type="button" id="btnCerrarSugerencias" aria-label="Cerrar">×</button>',
      '<div class="modal__content">',
      '<div class="section-heading">',
      '<p class="section-kicker">Sugerencias generadas</p>',
      '<h2 id="modalSugerenciasTitulo">Sugerencias académicas generadas</h2>',
      '<p class="muted" id="modalSugerenciasSubtitulo">Selecciona una opción para usarla como título final.</p>',
      '</div>',
      '<div class="suggestion-modal-list" id="modalSugerenciasLista"></div>',
      '<div class="modal__actions">',
      '<button class="btn btn--ghost" type="button" id="btnCancelarSugerencias">Cancelar</button>',
      '</div>',
      '</div>',
      '</div>'
    ].join('');

    document.body.appendChild(modal);

    conectarCierreFallback(modal);

    return modal;
  }

  function crearTarjetaSugerencia(numero, sugerencia, index, opciones) {
    var item = normalizarSugerencia(sugerencia, {
      index: index,
      enfoque: obtenerEnfoquePorIndice(index),
      respuestaIA: opciones && opciones.respuestaIA
    });
    var article = document.createElement('article');
    var titulo = document.createElement('h3');
    var texto = document.createElement('p');
    var meta = document.createElement('p');
    var actions = document.createElement('div');
    var boton = document.createElement('button');

    article.className = 'suggestion-modal-card';
    article.setAttribute('data-sugerencia-index', String(index));
    article.setAttribute('data-propuesta', String(numero));

    titulo.textContent = 'Sugerencia ' + (index + 1);

    texto.className = 'suggestion-modal-card__text';
    texto.textContent = item.texto || 'No se pudo leer esta sugerencia.';

    meta.className = 'suggestion-modal-card__meta';
    meta.textContent = obtenerEtiquetaEnfoque(item.enfoque);

    actions.className = 'suggestion-modal-card__actions';

    boton.type = 'button';
    boton.className = 'btn btn--primary';
    boton.textContent = 'Usar esta sugerencia';
    boton.addEventListener('click', function () {
      var aplicada = aplicar(numero, item, index);

      if (opciones && typeof opciones.onSeleccionar === 'function') {
        opciones.onSeleccionar(aplicada || {
          numero: numero,
          index: index,
          texto: item.texto,
          sugerencia: item
        });
      }
    });

    actions.appendChild(boton);

    article.appendChild(titulo);
    article.appendChild(texto);
    article.appendChild(meta);
    article.appendChild(actions);

    return article;
  }

  function actualizarEncabezadoModal(numero) {
    var titulo = document.querySelector('#modalSugerenciasTitulo');
    var subtitulo = document.querySelector('#modalSugerenciasSubtitulo');

    if (titulo) {
      titulo.textContent = 'Sugerencias para la propuesta ' + numero;
    }

    if (subtitulo) {
      subtitulo.textContent = 'Elige una sugerencia. Se copiará automáticamente al campo “Título final”.';
    }
  }

  function cerrarModalSugerencias() {
    var modal = document.querySelector('#modalSugerencias');

    if (!modal) {
      return;
    }

    modal.classList.add('is-hidden');
    modal.setAttribute('aria-hidden', 'true');

    if (!hayOtroModalAbierto()) {
      document.body.classList.remove('has-open-modal');
    }
  }

  function conectarCierreFallback(modal) {
    var cerrar = modal.querySelector('#btnCerrarSugerencias');
    var cancelar = modal.querySelector('#btnCancelarSugerencias');
    var backdrop = modal.querySelector('.modal__backdrop');

    [cerrar, cancelar, backdrop].forEach(function (element) {
      if (!element || element.dataset.taCerrarSugerencias === 'true') {
        return;
      }

      element.dataset.taCerrarSugerencias = 'true';
      element.addEventListener('click', cerrarModalSugerencias);
    });
  }

  function resaltarCampo(campo, sugerencia) {
    var field;

    if (!campo) {
      return;
    }

    campo.classList.remove('title-final-selected');
    campo.classList.remove('title-final-selected--stable');
    campo.classList.add('title-final-selected');

    window.setTimeout(function () {
      campo.classList.remove('title-final-selected');
      campo.classList.add('title-final-selected--stable');
    }, 900);

    field = campo.closest ? campo.closest('.field') : null;

    if (field) {
      field.classList.remove('field-title-selected');
      field.classList.remove('field-title-selected--warning');
      field.classList.add('field-title-selected');

      if (sugerencia && sugerencia.calidad && sugerencia.calidad !== 'buena') {
        field.classList.add('field-title-selected--warning');
      }
    }
  }

  function limpiarEstadoCampo(campo) {
    var field = campo && campo.closest ? campo.closest('.field') : null;

    if (!field) {
      return;
    }

    field.classList.remove('field-title-selected');
    field.classList.remove('field-title-selected--warning');

    Array.prototype.slice.call(field.querySelectorAll('.title-selected-message')).forEach(function (element) {
      element.remove();
    });
  }

  function mostrarMensajeAplicado(numero, sugerencia) {
    var campo = obtenerCampoTitulo(numero);
    var field = campo && campo.closest ? campo.closest('.field') : null;
    var mensaje;

    if (!field) {
      return;
    }

    Array.prototype.slice.call(field.querySelectorAll('.title-selected-message')).forEach(function (element) {
      element.remove();
    });

    mensaje = document.createElement('small');
    mensaje.className = 'title-selected-message';
    mensaje.textContent = 'Sugerencia elegida y aplicada como título final. Puedes continuar.';

    if (sugerencia && sugerencia.enfoque) {
      mensaje.textContent += ' Enfoque: ' + obtenerEtiquetaEnfoque(sugerencia.enfoque) + '.';
    }

    field.appendChild(mensaje);
  }

  function mostrarErrorSugerencias() {
    var ui = window.TAEstudianteUI;
    var modalService = window.TAEstudianteModal;
    var mensaje = 'No se generaron sugerencias válidas. Revisa la información de la propuesta e inténtalo nuevamente.';

    if (modalService && typeof modalService.mostrarAlerta === 'function') {
      modalService.mostrarAlerta(mensaje, {
        titulo: 'Sin sugerencias válidas'
      });
      return;
    }

    if (ui && typeof ui.showAlert === 'function') {
      ui.showAlert(mensaje, '', 'Sin sugerencias válidas');
    }
  }

  function marcarSugerenciaActiva(numero, index) {
    Array.prototype.slice.call(document.querySelectorAll('[data-propuesta="' + numero + '"][data-sugerencia-index]'))
      .forEach(function (card) {
        card.classList.toggle('is-selected', Number(card.getAttribute('data-sugerencia-index')) === Number(index));
      });
  }

  function obtenerCampoTitulo(numero) {
    return document.querySelector('#p' + numero + 'Titulo') ||
      document.querySelector('[name="p' + numero + 'Titulo"]') ||
      document.querySelector('[data-titulo-final="' + numero + '"]');
  }

  function obtenerContenedorSugerencias(numero) {
    return document.querySelector('#p' + numero + 'Sugerencias') ||
      document.querySelector('[data-sugerencias="' + numero + '"]');
  }

  function extraerDesdeRespuesta(respuesta) {
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

  function deduplicarPorTexto(lista) {
    var vistos = {};
    var resultado = [];

    lista.forEach(function (item) {
      var key = normalizarClave(item.texto);

      if (!key || vistos[key]) {
        return;
      }

      vistos[key] = true;
      resultado.push(item);
    });

    return resultado;
  }

  function normalizarAdvertencias(value) {
    if (Array.isArray(value)) {
      return value.map(limpiarTexto).filter(Boolean);
    }

    if (typeof value === 'string' && limpiarTexto(value)) {
      return [limpiarTexto(value)];
    }

    return [];
  }

  function obtenerValorSeguro(objeto, key) {
    if (!objeto || !key) {
      return '';
    }

    return objeto[key] || '';
  }

  function obtenerEnfoquePorIndice(index) {
    index = Number(index || 0);

    if (index === 0) {
      return 'diagnostico';
    }

    if (index === 1) {
      return 'propuesta';
    }

    if (index === 2) {
      return 'evaluacion';
    }

    return 'academico';
  }

  function obtenerEtiquetaEnfoque(enfoque) {
    var validator = window.TATitulosAcademicValidator;

    if (validator && typeof validator.obtenerEtiquetaEnfoque === 'function') {
      return validator.obtenerEtiquetaEnfoque(enfoque);
    }

    enfoque = limpiarTexto(enfoque).toLowerCase();

    if (enfoque === 'diagnostico') {
      return 'Diagnóstico';
    }

    if (enfoque === 'propuesta') {
      return 'Propuesta o mejora';
    }

    if (enfoque === 'evaluacion') {
      return 'Evaluación o impacto';
    }

    return 'Título académico';
  }

  function limpiarTitulo(valor) {
    var validator = window.TATitulosAcademicValidator;

    if (validator && typeof validator.limpiarTitulo === 'function') {
      return validator.limpiarTitulo(valor);
    }

    return limpiarTexto(valor)
      .replace(/\s*(?:Justificaci[oó]n(?:\s+breve)?|Explicaci[oó]n)\s*:\s*[\s\S]*$/i, '')
      .replace(/^\s*[-*•]\s*/g, '')
      .replace(/^\s*\d+[).:-]\s*/g, '')
      .replace(/^\s*(Título|Titulo|Opción|Opcion|Sugerencia)\s*\d*\s*[:.-]\s*/i, '')
      .replace(/^\s*["“”'«»]+|["“”'«»]+\s*$/g, '')
      .trim();
  }

  function normalizarClave(valor) {
    var validator = window.TATitulosAcademicValidator;

    if (validator && typeof validator.normalizarClave === 'function') {
      return validator.normalizarClave(valor);
    }

    return String(valor || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9ñáéíóúü\s]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function enfocarPrimerBoton(modal) {
    var boton = modal ? modal.querySelector('button') : null;

    if (!boton) {
      return;
    }

    window.setTimeout(function () {
      boton.focus();
    }, 60);
  }

  function hayOtroModalAbierto() {
    return Array.prototype.slice.call(document.querySelectorAll('.modal, .ia-loading-modal'))
      .some(function (modal) {
        if (modal.id === 'modalSugerencias') {
          return false;
        }

        return !modal.classList.contains('is-hidden');
      });
  }

  function limpiarTexto(valor) {
    return String(valor || '').replace(/\s+/g, ' ').trim();
  }

  window.TAEstudianteSugerencias = Object.freeze({
    renderizar: renderizar,
    aplicar: aplicar,
    limpiar: limpiar,
    limpiarTodo: limpiarTodo,
    normalizarLista: normalizarLista,
    normalizarSugerencia: normalizarSugerencia,
    obtenerSeleccion: obtenerSeleccion
  });
})();