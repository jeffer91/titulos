/*
  Archivo: sugerencias.service.js
  Ruta: estudiantes/js/sugerencias.service.js
  Funciones principales del archivo:
  - Normalizar sugerencias generadas por IA como objetos enriquecidos o texto simple.
  - Abrir el modal de tres sugerencias para que el estudiante elija una.
  - Copiar la sugerencia elegida al campo de título final.
  - Conservar metadatos de IA: proveedor, modelo, enfoque, calidad y advertencias.
  - Resaltar visualmente el campo de título final cuando se aplica una sugerencia.
*/
(function () {
  'use strict';

  var estado = {
    ultimaPropuesta: 0,
    ultimasSugerencias: [],
    seleccionadas: {}
  };

  function renderizar(numero, sugerencias, opciones) {
    numero = Number(numero || 0);
    opciones = opciones || {};

    var lista = normalizarLista(sugerencias, opciones);

    estado.ultimaPropuesta = numero;
    estado.ultimasSugerencias = lista;

    if (!numero) {
      return;
    }

    if (!lista.length) {
      mostrarErrorSugerencias();
      return;
    }

    abrirModalSeleccion(numero, lista, opciones);
  }

  function abrirModalSeleccion(numero, sugerencias, opciones) {
    opciones = opciones || {};

    var modalService = window.TAEstudianteModal;

    if (!modalService || !modalService.abrirSugerencias) {
      aplicar(numero, sugerencias[0], 0);
      return;
    }

    modalService.abrirSugerencias({
      numero: numero,
      sugerencias: sugerencias,
      onSeleccionar: function (seleccion) {
        aplicar(
          seleccion.numero || numero,
          seleccion.sugerencia || seleccion.texto,
          seleccion.index || 0
        );

        if (typeof opciones.onSeleccionar === 'function') {
          opciones.onSeleccionar(seleccion);
        }
      }
    });
  }

  function aplicar(numero, sugerencia, index) {
    numero = Number(numero || 0);
    index = Number(index || 0);

    var item = normalizarSugerencia(sugerencia, {
      index: index,
      enfoque: obtenerEnfoquePorIndice(index)
    });
    var texto = item.texto;

    if (!numero || !texto) {
      return;
    }

    var campo = obtenerCampoTitulo(numero);

    if (!campo) {
      return;
    }

    campo.value = texto;
    campo.dispatchEvent(new Event('input', { bubbles: true }));
    campo.dispatchEvent(new Event('change', { bubbles: true }));

    estado.seleccionadas[numero] = Object.assign({}, item, {
      index: index,
      fecha: new Date().toISOString()
    });

    resaltarCampo(campo, item);
    mostrarMensajeAplicado(numero, item);
  }

  function resaltarCampo(campo, sugerencia) {
    if (!campo) {
      return;
    }

    campo.classList.remove('title-final-selected');
    campo.classList.remove('title-final-selected--stable');
    campo.classList.add('title-final-selected');

    var field = campo.closest ? campo.closest('.field') : null;

    if (field) {
      field.classList.remove('field-title-selected');
      field.classList.remove('field-title-selected--warning');
      field.classList.add('field-title-selected');

      if (sugerencia && sugerencia.calidad && sugerencia.calidad !== 'buena') {
        field.classList.add('field-title-selected--warning');
      }
    }

    window.setTimeout(function () {
      campo.classList.add('title-final-selected--stable');
    }, 80);
  }

  function limpiar(numero) {
    if (numero) {
      delete estado.seleccionadas[Number(numero)];
      return;
    }

    estado.ultimaPropuesta = 0;
    estado.ultimasSugerencias = [];
    estado.seleccionadas = {};
  }

  function limpiarTodo() {
    limpiar();

    [1, 2, 3].forEach(function (numero) {
      var campo = obtenerCampoTitulo(numero);

      if (campo) {
        campo.classList.remove('title-final-selected');
        campo.classList.remove('title-final-selected--stable');
      }

      var field = campo && campo.closest ? campo.closest('.field') : null;

      if (field) {
        field.classList.remove('field-title-selected');
        field.classList.remove('field-title-selected--warning');
      }
    });
  }

  function normalizarLista(sugerencias, contexto) {
    if (!Array.isArray(sugerencias)) {
      return [];
    }

    contexto = contexto || {};

    var vistas = {};

    return sugerencias
      .map(function (item, index) {
        return normalizarSugerencia(item, {
          index: index,
          enfoque: item && item.enfoque ? item.enfoque : obtenerEnfoquePorIndice(index),
          estudiante: contexto.estudiante,
          propuesta: contexto.propuesta
        });
      })
      .filter(function (item) {
        return item.texto.length >= 20;
      })
      .filter(function (item) {
        var key = normalizarClave(item.texto);

        if (vistas[key]) {
          return false;
        }

        vistas[key] = true;
        return true;
      })
      .slice(0, 3);
  }

  function normalizarSugerencia(item, contexto) {
    contexto = contexto || {};

    var texto = typeof item === 'string'
      ? item
      : item && item.texto;
    var enfoque = contexto.enfoque || item && item.enfoque || obtenerEnfoquePorIndice(contexto.index || 0);
    var evaluacion = evaluarTitulo(texto, {
      enfoque: enfoque,
      estudiante: contexto.estudiante,
      propuesta: contexto.propuesta
    });
    var base = item && typeof item === 'object' ? item : {};

    return {
      texto: evaluacion.texto,
      enfoque: enfoque,
      enfoqueLabel: base.enfoqueLabel || obtenerEtiquetaEnfoque(enfoque),
      proveedorIA: base.proveedorIA || base.proveedor || base.ia || '',
      modeloIA: base.modeloIA || base.model || base.modelo || '',
      calidad: base.calidad || evaluacion.calidad,
      calidadLabel: base.calidadLabel || obtenerEtiquetaCalidad(base.calidad || evaluacion.calidad),
      puntos: typeof base.puntos === 'number' ? base.puntos : evaluacion.puntos,
      advertencias: unirAdvertencias(base.advertencias, evaluacion.advertencias),
      justificacion: base.justificacion || '',
      textoOriginal: base.textoOriginal || '',
      prompt: base.prompt || '',
      reconstruido: Boolean(base.reconstruido)
    };
  }

  function obtenerSeleccion(numero) {
    return estado.seleccionadas[Number(numero || 0)] || null;
  }

  function obtenerCampoTitulo(numero) {
    return document.querySelector('#p' + numero + 'Titulo');
  }

  function mostrarMensajeAplicado(numero, sugerencia) {
    var ui = window.TAEstudianteUI;

    if (!ui || !ui.showStatus) {
      return;
    }

    var extra = sugerencia && sugerencia.calidad && sugerencia.calidad !== 'buena'
      ? ' Revisa el texto antes del envío final.'
      : ' Puedes editarla si lo necesitas.';

    ui.showStatus(
      '#envioMensaje',
      'Sugerencia aplicada en el título final de la propuesta ' + numero + '.' + extra,
      sugerencia && sugerencia.calidad === 'mala' ? 'error' : 'success'
    );
  }

  function mostrarErrorSugerencias() {
    var modalService = window.TAEstudianteModal;

    if (modalService && modalService.mostrarAlerta) {
      modalService.mostrarAlerta(
        'No se generaron sugerencias válidas. Puedes escribir el título manualmente o intentarlo más tarde.',
        {
          titulo: 'Sugerencias no disponibles'
        }
      );

      return;
    }

    window.alert('No se generaron sugerencias válidas. Puedes escribir el título manualmente o intentarlo más tarde.');
  }

  function evaluarTitulo(titulo, contexto) {
    var validator = window.TATitulosAcademicValidator;

    if (validator && validator.evaluarTitulo) {
      return validator.evaluarTitulo(titulo, contexto);
    }

    return evaluarTituloLocal(titulo, contexto);
  }

  function evaluarTituloLocal(titulo, contexto) {
    contexto = contexto || {};

    var texto = limpiarTexto(titulo)
      .replace(/^\s*[-*•]\s*/g, '')
      .replace(/^\s*\d+[).:-]\s*/g, '')
      .replace(/^\s*(Título|Titulo|Opción|Opcion|Sugerencia)\s*\d*\s*[:.-]\s*/i, '')
      .trim();
    var palabras = texto ? texto.split(/\s+/).length : 0;
    var ultima = normalizarClave(texto).split(' ').pop() || '';
    var conectores = ['a', 'al', 'con', 'de', 'del', 'el', 'en', 'la', 'las', 'los', 'para', 'por', 'un', 'una', 'y'];
    var incompleto = conectores.indexOf(ultima) !== -1;
    var advertencias = [];
    var puntos = 100;

    if (palabras < 8) {
      puntos -= 30;
      advertencias.push('El título tiene pocas palabras.');
    }

    if (incompleto) {
      puntos -= 55;
      advertencias.push('El título parece incompleto.');
    }

    return {
      texto: texto,
      calidad: incompleto || puntos < 50 ? 'mala' : puntos < 78 ? 'revisar' : 'buena',
      calidadLabel: obtenerEtiquetaCalidad(incompleto || puntos < 50 ? 'mala' : puntos < 78 ? 'revisar' : 'buena'),
      puntos: Math.max(0, puntos),
      advertencias: advertencias,
      enfoque: contexto.enfoque || '',
      etiquetaEnfoque: obtenerEtiquetaEnfoque(contexto.enfoque),
      esMostrable: Boolean(texto && !incompleto && texto.length >= 20),
      palabras: palabras,
      incompleto: incompleto
    };
  }

  function obtenerEnfoquePorIndice(index) {
    index = Number(index || 0);

    if (index === 1) {
      return 'propuesta';
    }

    if (index === 2) {
      return 'evaluacion';
    }

    return 'diagnostico';
  }

  function obtenerEtiquetaEnfoque(enfoque) {
    var validator = window.TATitulosAcademicValidator;

    if (validator && validator.obtenerEtiquetaEnfoque) {
      return validator.obtenerEtiquetaEnfoque(enfoque);
    }

    enfoque = normalizarClave(enfoque);

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

  function obtenerEtiquetaCalidad(calidad) {
    var validator = window.TATitulosAcademicValidator;

    if (validator && validator.obtenerEtiquetaCalidad) {
      return validator.obtenerEtiquetaCalidad(calidad);
    }

    if (calidad === 'buena') {
      return 'Calidad aceptable';
    }

    if (calidad === 'mala') {
      return 'Calidad baja';
    }

    return 'Revisar';
  }

  function unirAdvertencias(a, b) {
    var validator = window.TATitulosAcademicValidator;

    if (validator && validator.unirAdvertencias) {
      return validator.unirAdvertencias(a, b);
    }

    var resultado = [];
    var vistas = {};

    [].concat(a || [], b || []).forEach(function (item) {
      var texto = limpiarTexto(item);
      var key = normalizarClave(texto);

      if (!texto || vistas[key]) {
        return;
      }

      vistas[key] = true;
      resultado.push(texto);
    });

    return resultado;
  }

  function normalizarClave(valor) {
    var validator = window.TATitulosAcademicValidator;

    if (validator && validator.normalizarClave) {
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