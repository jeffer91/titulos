/*
  Archivo: titulos.academic.validator.js
  Ruta: estudiantes/js/titulos.academic.validator.js
  Funciones principales del archivo:
  - Evaluar la calidad académica de títulos generados por IA.
  - Detectar títulos incompletos, vagos, informales o poco relacionados con la carrera.
  - Clasificar cada título por calidad: buena, revisar o mala.
  - Generar advertencias comprensibles para mostrarlas en el modal de sugerencias.
  - Mantener utilidades reutilizables para prompt, IA, modal y sugerencias.
*/
(function () {
  'use strict';

  var CONECTORES_FINALES = [
    'a', 'al', 'ante', 'bajo', 'cabe', 'con', 'contra', 'de', 'del', 'desde',
    'durante', 'e', 'el', 'en', 'entre', 'hacia', 'hasta', 'la', 'las', 'lo',
    'los', 'mediante', 'o', 'para', 'por', 'según', 'sin', 'sobre', 'tras',
    'un', 'una', 'unos', 'unas', 'y'
  ];

  var PALABRAS_VACIAS = [
    'a', 'al', 'ante', 'bajo', 'con', 'contra', 'de', 'del', 'desde', 'durante',
    'e', 'el', 'en', 'entre', 'es', 'la', 'las', 'lo', 'los', 'mediante', 'o',
    'para', 'por', 'que', 'se', 'sin', 'sobre', 'su', 'sus', 'un', 'una', 'unos',
    'unas', 'y'
  ];

  var ACCIONES_ACADEMICAS = [
    'analisis', 'diagnostico', 'caracterizacion', 'identificacion', 'evaluacion',
    'medicion', 'impacto', 'incidencia', 'influencia', 'relacion', 'propuesta',
    'diseno', 'estrategia', 'plan', 'implementacion', 'optimizacion', 'mejora',
    'efectividad', 'factores', 'riesgos', 'calidad', 'control', 'gestion'
  ];

  var ACCIONES_POR_ENFOQUE = {
    diagnostico: [
      'diagnostico', 'analisis', 'caracterizacion', 'identificacion', 'factores',
      'causas', 'situacion', 'necesidades', 'problemas', 'riesgos'
    ],
    propuesta: [
      'propuesta', 'diseno', 'estrategia', 'plan', 'procedimiento', 'protocolo',
      'metodo', 'implementacion', 'mejora', 'optimizacion', 'intervencion'
    ],
    evaluacion: [
      'evaluacion', 'medicion', 'impacto', 'efectividad', 'resultados',
      'incidencia', 'seguimiento', 'comparacion', 'valoracion'
    ]
  };

  var TERMINOS_INFORMALES = [
    'cosa', 'cosas', 'arreglar', 'arreglos', 'raro', 'raros', 'gente', 'por ahi',
    'alguna vez', 'bien', 'mal', 'que se quejen', 'carros', 'chamba', 'chance',
    'full', 'súper', 'super', 'nomás', 'nomas'
  ];

  function evaluarTitulo(titulo, contexto) {
    contexto = contexto || {};

    var texto = limpiarTitulo(titulo);
    var advertencias = [];
    var puntos = 100;
    var palabras = contarPalabras(texto);
    var ultima = obtenerUltimaPalabra(texto);
    var clave = normalizarClave(texto);
    var enfoque = normalizarClave(contexto.enfoque || '');
    var tieneAccion = contieneAlguna(clave, ACCIONES_ACADEMICAS);
    var tieneContexto = detectarContexto(texto, contexto);
    var relacion = medirRelacionConDatos(texto, contexto);
    var informal = contieneAlgunaFrase(clave, TERMINOS_INFORMALES);
    var incompleto = false;

    if (!texto) {
      advertencias.push('No se recibió texto para evaluar.');
      puntos -= 100;
      incompleto = true;
    }

    if (texto && texto.length < 25) {
      advertencias.push('El título es demasiado corto para un artículo académico.');
      puntos -= 35;
    }

    if (palabras < 8) {
      advertencias.push('El título tiene pocas palabras y puede quedar demasiado general.');
      puntos -= 30;
    }

    if (palabras > 26) {
      advertencias.push('El título es muy largo; conviene hacerlo más directo.');
      puntos -= 12;
    }

    if (ultima && CONECTORES_FINALES.indexOf(ultima) !== -1) {
      advertencias.push('El título parece incompleto porque termina en una palabra conectora.');
      puntos -= 55;
      incompleto = true;
    }

    if (/[,:;\-–—]$/.test(texto)) {
      advertencias.push('El título termina con puntuación que sugiere una frase incompleta.');
      puntos -= 25;
      incompleto = true;
    }

    if (!tieneAccion) {
      advertencias.push('No se reconoce un enfoque académico claro como análisis, diagnóstico, propuesta o evaluación.');
      puntos -= 14;
    }

    if (enfoque && ACCIONES_POR_ENFOQUE[enfoque] && !contieneAlguna(clave, ACCIONES_POR_ENFOQUE[enfoque])) {
      advertencias.push('El título no refleja con claridad el enfoque esperado: ' + obtenerEtiquetaEnfoque(enfoque) + '.');
      puntos -= 13;
    }

    if (!tieneContexto) {
      advertencias.push('Falta población, unidad de estudio, contexto o lugar suficientemente claro.');
      puntos -= 16;
    }

    if (relacion < 2) {
      advertencias.push('El título usa pocos elementos de la propuesta del estudiante.');
      puntos -= 18;
    }

    if (informal) {
      advertencias.push('El título conserva lenguaje informal; debe transformarse a lenguaje técnico.');
      puntos -= 18;
    }

    if (esTituloGenerico(clave)) {
      advertencias.push('El título es demasiado genérico para identificar un artículo académico específico.');
      puntos -= 22;
    }

    puntos = limitarNumero(puntos, 0, 100);

    return {
      texto: texto,
      calidad: clasificarCalidad(puntos, incompleto),
      puntos: puntos,
      advertencias: advertencias,
      esMostrable: Boolean(texto && !incompleto && texto.length >= 25 && palabras >= 6),
      incompleto: incompleto,
      palabras: palabras,
      enfoque: enfoque || '',
      etiquetaEnfoque: obtenerEtiquetaEnfoque(enfoque),
      relacion: relacion
    };
  }

  function evaluarLista(lista, contexto) {
    if (!Array.isArray(lista)) {
      return [];
    }

    return lista.map(function (item) {
      var titulo = typeof item === 'string' ? item : item && item.texto;
      var evaluacion = evaluarTitulo(titulo, contexto);

      if (item && typeof item === 'object') {
        return Object.assign({}, item, {
          texto: evaluacion.texto,
          calidad: item.calidad || evaluacion.calidad,
          puntos: typeof item.puntos === 'number' ? item.puntos : evaluacion.puntos,
          advertencias: unirAdvertencias(item.advertencias, evaluacion.advertencias),
          esMostrable: evaluacion.esMostrable,
          incompleto: evaluacion.incompleto,
          palabras: evaluacion.palabras
        });
      }

      return evaluacion;
    });
  }

  function limpiarTitulo(valor) {
    return String(valor || '')
      .replace(/^\s*[-*•]\s*/g, '')
      .replace(/^\s*\d+[).:-]\s*/g, '')
      .replace(/^\s*(Título|Titulo|Opción|Opcion|Sugerencia)\s*\d*\s*[:.-]\s*/i, '')
      .replace(/^\s*["“”'«»]+|["“”'«»]+\s*$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizarClave(valor) {
    return String(valor || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9ñáéíóúü\s]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function contarPalabras(valor) {
    var texto = normalizarClave(valor);

    if (!texto) {
      return 0;
    }

    return texto.split(' ').filter(Boolean).length;
  }

  function obtenerUltimaPalabra(valor) {
    var partes = normalizarClave(valor).split(' ').filter(Boolean);
    return partes.length ? partes[partes.length - 1] : '';
  }

  function contieneAlguna(textoNormalizado, lista) {
    return lista.some(function (palabra) {
      return new RegExp('(^|\\s)' + escaparRegex(normalizarClave(palabra)) + '(\\s|$)').test(textoNormalizado);
    });
  }

  function contieneAlgunaFrase(textoNormalizado, lista) {
    return lista.some(function (frase) {
      return textoNormalizado.indexOf(normalizarClave(frase)) !== -1;
    });
  }

  function detectarContexto(titulo, contexto) {
    var clave = normalizarClave(titulo);
    var propuesta = contexto.propuesta || {};
    var grupo = normalizarClave(propuesta.grupoEstudio);
    var lugar = normalizarClave(propuesta.lugarContexto);
    var anio = normalizarClave(propuesta.anioPeriodo);

    if (grupo && coincidenciasDeTokens(clave, grupo) >= 1) {
      return true;
    }

    if (lugar && coincidenciasDeTokens(clave, lugar) >= 1) {
      return true;
    }

    if (anio && coincidenciasDeTokens(clave, anio) >= 1) {
      return true;
    }

    return /\b(en|de|para|durante|del|con)\b/.test(clave) && contarPalabras(titulo) >= 10;
  }

  function medirRelacionConDatos(titulo, contexto) {
    contexto = contexto || {};

    var propuesta = contexto.propuesta || {};
    var estudiante = contexto.estudiante || {};
    var baseTitulo = normalizarClave(titulo);
    var baseDatos = [
      estudiante.carrera,
      estudiante.nombreCarrera,
      propuesta.temaGeneral,
      propuesta.problemaNecesidad,
      propuesta.lugarContexto,
      propuesta.grupoEstudio,
      propuesta.anioPeriodo,
      propuesta.objetivo
    ].map(normalizarClave).join(' ');

    return coincidenciasDeTokens(baseTitulo, baseDatos);
  }

  function coincidenciasDeTokens(baseTitulo, baseDatos) {
    var tokensDatos = obtenerTokensSignificativos(baseDatos);
    var vistos = {};
    var total = 0;

    tokensDatos.forEach(function (token) {
      if (vistos[token]) {
        return;
      }

      vistos[token] = true;

      if (baseTitulo.indexOf(token) !== -1) {
        total += 1;
      }
    });

    return total;
  }

  function obtenerTokensSignificativos(valor) {
    return normalizarClave(valor)
      .split(' ')
      .filter(function (token) {
        return token.length >= 4 && PALABRAS_VACIAS.indexOf(token) === -1;
      });
  }

  function esTituloGenerico(clave) {
    var patrones = [
      'analisis de problemas',
      'mejora de procesos',
      'evaluacion de resultados',
      'estrategias para mejorar',
      'estudio sobre algunas estrategias',
      'impacto del marketing digital',
      'educacion digital en estudiantes'
    ];

    return patrones.some(function (patron) {
      return clave === normalizarClave(patron) || clave.indexOf(normalizarClave(patron)) === 0 && contarPalabras(clave) < 8;
    });
  }

  function clasificarCalidad(puntos, incompleto) {
    if (incompleto || puntos < 50) {
      return 'mala';
    }

    if (puntos < 78) {
      return 'revisar';
    }

    return 'buena';
  }

  function obtenerEtiquetaCalidad(calidad) {
    if (calidad === 'buena') {
      return 'Calidad aceptable';
    }

    if (calidad === 'mala') {
      return 'Calidad baja';
    }

    return 'Revisar';
  }

  function obtenerEtiquetaEnfoque(enfoque) {
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

  function unirAdvertencias(a, b) {
    var resultado = [];
    var vistas = {};

    [].concat(a || [], b || []).forEach(function (item) {
      var texto = String(item || '').trim();
      var clave = normalizarClave(texto);

      if (!texto || vistas[clave]) {
        return;
      }

      vistas[clave] = true;
      resultado.push(texto);
    });

    return resultado;
  }

  function limitarNumero(valor, min, max) {
    valor = Number(valor || 0);

    if (valor < min) {
      return min;
    }

    if (valor > max) {
      return max;
    }

    return valor;
  }

  function escaparRegex(valor) {
    return String(valor || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  window.TATitulosAcademicValidator = Object.freeze({
    evaluarTitulo: evaluarTitulo,
    evaluarLista: evaluarLista,
    limpiarTitulo: limpiarTitulo,
    normalizarClave: normalizarClave,
    contarPalabras: contarPalabras,
    obtenerEtiquetaCalidad: obtenerEtiquetaCalidad,
    obtenerEtiquetaEnfoque: obtenerEtiquetaEnfoque,
    unirAdvertencias: unirAdvertencias
  });
})();