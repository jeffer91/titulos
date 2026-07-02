/*
  Archivo: titulos.academic.validator.js
  Ruta: estudiantes/js/titulos.academic.validator.js
  Funciones principales del archivo:
  - Evaluar la calidad académica de títulos generados por IA.
  - Detectar títulos incompletos, vagos, informales o poco relacionados con la carrera.
  - Validar que el título incluya grupo de estudio, contexto/lugar y período cuando fueron llenados.
  - Aplicar la regla: 10 a 25 palabras correcto, 26 a 29 con advertencia y 30 o más bloqueado.
  - Mantener utilidades reutilizables para prompt, IA, modal y sugerencias.
*/
(function () {
  'use strict';

  var MIN_PALABRAS = 10;
  var MAX_PALABRAS_CORRECTAS = 25;
  var MAX_PALABRAS_ADVERTENCIA = 29;
  var BLOQUEO_PALABRAS = 30;

  var CONECTORES_FINALES = [
    'a', 'al', 'ante', 'bajo', 'cabe', 'con', 'contra', 'de', 'del', 'desde',
    'durante', 'e', 'el', 'en', 'entre', 'hacia', 'hasta', 'la', 'las', 'lo',
    'los', 'mediante', 'o', 'para', 'por', 'segun', 'según', 'sin', 'sobre',
    'tras', 'un', 'una', 'unos', 'unas', 'y'
  ];

  var PALABRAS_VACIAS = [
    'a', 'al', 'ante', 'bajo', 'con', 'contra', 'de', 'del', 'desde', 'durante',
    'e', 'el', 'en', 'entre', 'es', 'la', 'las', 'lo', 'los', 'mediante', 'o',
    'para', 'por', 'que', 'se', 'sin', 'sobre', 'su', 'sus', 'un', 'una', 'unos',
    'unas', 'y', 'como', 'hacia', 'hasta', 'este', 'esta', 'estos', 'estas'
  ];

  var ACCIONES_ACADEMICAS = [
    'analisis', 'análisis', 'diagnostico', 'diagnóstico', 'caracterizacion',
    'caracterización', 'identificacion', 'identificación', 'evaluacion',
    'evaluación', 'medicion', 'medición', 'impacto', 'incidencia', 'influencia',
    'relacion', 'relación', 'propuesta', 'diseno', 'diseño', 'estrategia',
    'plan', 'implementacion', 'implementación', 'optimizacion', 'optimización',
    'mejora', 'efectividad', 'factores', 'riesgos', 'calidad', 'control',
    'gestion', 'gestión', 'procedimiento', 'protocolo', 'modelo'
  ];

  var ACCIONES_POR_ENFOQUE = {
    diagnostico: [
      'diagnostico', 'diagnóstico', 'analisis', 'análisis', 'caracterizacion',
      'caracterización', 'identificacion', 'identificación', 'factores',
      'causas', 'situacion', 'situación', 'necesidades', 'problemas',
      'riesgos'
    ],
    propuesta: [
      'propuesta', 'diseno', 'diseño', 'estrategia', 'plan', 'procedimiento',
      'protocolo', 'metodo', 'método', 'implementacion', 'implementación',
      'mejora', 'optimizacion', 'optimización', 'intervencion', 'intervención'
    ],
    evaluacion: [
      'evaluacion', 'evaluación', 'medicion', 'medición', 'impacto',
      'efectividad', 'resultados', 'incidencia', 'seguimiento', 'comparacion',
      'comparación', 'valoracion', 'valoración'
    ]
  };

  var TERMINOS_INFORMALES = [
    'cosa', 'cosas', 'arreglar', 'arreglos', 'raro', 'raros', 'por ahi',
    'por ahí', 'alguna vez', 'que se quejen', 'chamba', 'chance', 'full',
    'súper', 'super', 'nomás', 'nomas'
  ];

  var FINALES_INCOMPLETOS = [
    'vehiculos atendidos', 'vehículos atendidos', 'vehiculos', 'vehículos',
    'motores', 'clientes', 'usuarios', 'estudiantes', 'pacientes',
    'unidad de estudio', 'poblacion', 'población', 'procesos', 'servicios',
    'fallas', 'ruidos'
  ];

  function evaluarTitulo(titulo, contexto) {
    contexto = contexto || {};

    var texto = limpiarTitulo(titulo);
    var advertencias = [];
    var errores = [];
    var bloqueos = [];
    var puntos = 100;
    var palabras = contarPalabras(texto);
    var ultima = obtenerUltimaPalabra(texto);
    var clave = normalizarClave(texto);
    var enfoque = normalizarClave(contexto.enfoque || '');
    var tieneAccion = contieneAlguna(clave, ACCIONES_ACADEMICAS);
    var relacion = medirRelacionConDatos(texto, contexto);
    var informal = contieneAlgunaFrase(clave, TERMINOS_INFORMALES);
    var incompleto = false;
    var propuesta = contexto.propuesta || {};
    var estudiante = contexto.estudiante || {};
    var tieneContexto = detectarContexto(texto, contexto);

    if (!texto) {
      agregarUnico(bloqueos, 'No se recibió texto para evaluar.');
      puntos -= 100;
      incompleto = true;
    }

    if (texto && palabras < MIN_PALABRAS) {
      agregarUnico(bloqueos, 'El título debe tener al menos 10 palabras.');
      puntos -= 45;
    }

    if (palabras >= BLOQUEO_PALABRAS) {
      agregarUnico(bloqueos, 'El título tiene 30 palabras o más y debe reescribirse completo.');
      puntos -= 45;
    } else if (palabras > MAX_PALABRAS_CORRECTAS && palabras <= MAX_PALABRAS_ADVERTENCIA) {
      agregarUnico(advertencias, 'El título supera 25 palabras; puede mostrarse, pero conviene hacerlo más directo.');
      puntos -= 8;
    }

    if (ultima && CONECTORES_FINALES.indexOf(ultima) !== -1) {
      agregarUnico(bloqueos, 'El título parece incompleto porque termina en una palabra conectora.');
      puntos -= 55;
      incompleto = true;
    }

    if (terminaEnFragmentoCortado(ultima)) {
      agregarUnico(bloqueos, 'El título termina con una palabra cortada o incompleta.');
      puntos -= 55;
      incompleto = true;
    }

    if (/[,:;\-–—]$/.test(texto)) {
      agregarUnico(bloqueos, 'El título termina con puntuación que sugiere una frase incompleta.');
      puntos -= 25;
      incompleto = true;
    }

    if (!tieneAccion) {
      agregarUnico(errores, 'No se reconoce un enfoque académico claro como análisis, diagnóstico, propuesta o evaluación.');
      puntos -= 14;
    }

    if (enfoque && ACCIONES_POR_ENFOQUE[enfoque] && !contieneAlguna(clave, ACCIONES_POR_ENFOQUE[enfoque])) {
      agregarUnico(errores, 'El título no refleja con claridad el enfoque esperado: ' + obtenerEtiquetaEnfoque(enfoque) + '.');
      puntos -= 13;
    }

    if (!tieneContexto) {
      agregarUnico(errores, 'Falta población, unidad de estudio, contexto o lugar suficientemente claro.');
      puntos -= 16;
    }

    validarCampoObligatorio(texto, propuesta.grupoEstudio, 'grupo de estudio o población', 'grupo', errores, bloqueos);
    validarCampoObligatorio(texto, propuesta.lugarContexto, 'lugar o contexto', 'lugar', errores, bloqueos);
    validarCampoObligatorio(texto, propuesta.anioPeriodo, 'año o período', 'periodo', errores, bloqueos);

    if (usaCorreccionDeRuidosImprecisa(texto)) {
      agregarUnico(errores, 'La frase “corrección de ruidos” es imprecisa; debe indicar fallas asociadas a ruidos o causas vinculadas.');
      puntos -= 16;
    }

    if (terminaConIdeaAcademicaIncompleta(texto, propuesta)) {
      agregarUnico(bloqueos, 'El título cierra con una idea incompleta; debe indicar contexto, lugar o período.');
      puntos -= 32;
      incompleto = true;
    }

    if (relacion < 2) {
      agregarUnico(advertencias, 'El título usa pocos elementos de la propuesta del estudiante.');
      puntos -= 10;
    }

    if (informal) {
      agregarUnico(advertencias, 'El título conserva lenguaje informal; debe transformarse a lenguaje técnico.');
      puntos -= 14;
    }

    if (esTituloGenerico(clave)) {
      agregarUnico(errores, 'El título es demasiado genérico para identificar un artículo académico específico.');
      puntos -= 22;
    }

    if (estudiante && estudiante.carrera && relacion < 1) {
      agregarUnico(advertencias, 'No se reconoce una relación suficiente con la carrera del estudiante.');
      puntos -= 8;
    }

    puntos = limitarNumero(puntos, 0, 100);

    return construirResultado({
      texto: texto,
      calidad: clasificarCalidad(puntos, incompleto, errores.length, bloqueos.length),
      puntos: puntos,
      advertencias: advertencias,
      errores: errores,
      bloqueos: bloqueos,
      incompleto: incompleto,
      palabras: palabras,
      enfoque: enfoque || '',
      relacion: relacion
    });
  }

  function construirResultado(datos) {
    var bloqueado = datos.bloqueos.length > 0;
    var tieneErrores = datos.errores.length > 0;
    var esMostrable = Boolean(datos.texto && !bloqueado && datos.palabras >= MIN_PALABRAS && datos.palabras < BLOQUEO_PALABRAS);
    var esValido = Boolean(esMostrable && !tieneErrores && !datos.incompleto);
    var longitudEstado = 'correcta';
    var problemas = unirAdvertencias(datos.bloqueos, datos.errores).concat(datos.advertencias);

    if (datos.palabras < MIN_PALABRAS || datos.palabras >= BLOQUEO_PALABRAS) {
      longitudEstado = 'bloqueado';
    } else if (datos.palabras > MAX_PALABRAS_CORRECTAS) {
      longitudEstado = 'advertencia';
    }

    return {
      texto: datos.texto,
      calidad: datos.calidad,
      calidadLabel: obtenerEtiquetaCalidad(datos.calidad),
      puntos: datos.puntos,
      advertencias: datos.advertencias,
      errores: datos.errores,
      bloqueos: datos.bloqueos,
      problemas: problemas,
      esMostrable: esMostrable,
      esValido: esValido,
      requiereCorreccion: !esValido,
      incompleto: Boolean(datos.incompleto || bloqueado),
      bloqueado: bloqueado,
      palabras: datos.palabras,
      longitudEstado: longitudEstado,
      enfoque: datos.enfoque || '',
      etiquetaEnfoque: obtenerEtiquetaEnfoque(datos.enfoque),
      relacion: datos.relacion
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
          calidadLabel: item.calidadLabel || evaluacion.calidadLabel,
          puntos: typeof item.puntos === 'number' ? item.puntos : evaluacion.puntos,
          advertencias: unirAdvertencias(item.advertencias, evaluacion.advertencias),
          errores: unirAdvertencias(item.errores, evaluacion.errores),
          bloqueos: unirAdvertencias(item.bloqueos, evaluacion.bloqueos),
          problemas: unirAdvertencias(item.problemas, evaluacion.problemas),
          esMostrable: evaluacion.esMostrable,
          esValido: evaluacion.esValido,
          requiereCorreccion: evaluacion.requiereCorreccion,
          incompleto: evaluacion.incompleto,
          bloqueado: evaluacion.bloqueado,
          palabras: evaluacion.palabras,
          longitudEstado: evaluacion.longitudEstado
        });
      }

      return evaluacion;
    });
  }

  function validarCampoObligatorio(titulo, valorCampo, etiqueta, tipo, errores, bloqueos) {
    if (!campoFueProporcionado(valorCampo)) {
      return;
    }

    if (tipo === 'periodo') {
      if (!contienePeriodoNatural(titulo, valorCampo)) {
        agregarUnico(bloqueos, 'Debe incluir el ' + etiqueta + ' proporcionado por el estudiante.');
      }
      return;
    }

    if (!contieneDatoNatural(titulo, valorCampo, tipo)) {
      agregarUnico(errores, 'Debe incluir el ' + etiqueta + ' proporcionado por el estudiante de forma natural.');
    }
  }

  function contieneDatoNatural(titulo, valorCampo, tipo) {
    var claveTitulo = normalizarClave(titulo);
    var claveCampo = normalizarClave(valorCampo);
    var tokensCampo = obtenerTokensSignificativos(claveCampo);
    var coincidencias;

    if (!claveCampo) {
      return true;
    }

    if (claveTitulo.indexOf(claveCampo) !== -1) {
      return true;
    }

    coincidencias = coincidenciasDeTokens(claveTitulo, claveCampo);

    if (tokensCampo.length <= 2 && coincidencias >= 1) {
      return true;
    }

    if (tokensCampo.length >= 3 && coincidencias >= 2) {
      return true;
    }

    return coincidePorSinonimos(claveTitulo, claveCampo, tipo);
  }

  function contienePeriodoNatural(titulo, valorCampo) {
    var claveTitulo = normalizarClave(titulo);
    var claveCampo = normalizarClave(valorCampo);
    var anios = String(valorCampo || '').match(/20\d{2}|19\d{2}/g) || [];
    var vistos = {};
    var aniosUnicos = anios.filter(function (anio) {
      if (vistos[anio]) {
        return false;
      }

      vistos[anio] = true;
      return true;
    });

    if (!claveCampo) {
      return true;
    }

    if (claveTitulo.indexOf(claveCampo) !== -1) {
      return true;
    }

    if (aniosUnicos.length) {
      return aniosUnicos.every(function (anio) {
        return claveTitulo.indexOf(anio) !== -1;
      });
    }

    return coincidenciasDeTokens(claveTitulo, claveCampo) >= 1;
  }

  function coincidePorSinonimos(claveTitulo, claveCampo, tipo) {
    if (tipo === 'grupo') {
      if (/(gente|persona|personas|cliente|clientes|usuario|usuarios|trabaja|trabajan|trabajador|trabajadores|colaborador|colaboradores|empleado|empleados)/.test(claveCampo)) {
        return /(usuarios|personas|clientes|trabajadores|colaboradores|empleados|poblacion|población)/.test(claveTitulo);
      }

      if (/(vehiculo|vehículo|vehiculos|vehículos|carro|carros|auto|autos|motor|motores)/.test(claveCampo)) {
        return /(vehiculo|vehículo|vehiculos|vehículos|automotriz|motores|unidades|automotores)/.test(claveTitulo);
      }

      if (/(estudiante|estudiantes|alumno|alumnos)/.test(claveCampo)) {
        return /(estudiantes|alumnos|aprendices|poblacion estudiantil|población estudiantil)/.test(claveTitulo);
      }
    }

    if (tipo === 'lugar') {
      if (/(taller|mecanica|mecánica|automotriz|concesionario)/.test(claveCampo)) {
        return /(taller|talleres|mecanica|mecánica|automotriz|concesionario|servicio tecnico|servicio técnico)/.test(claveTitulo);
      }

      if (/(instituto|universidad|escuela|colegio|empresa|clinica|clínica|hospital|sede|area|área|departamento)/.test(claveCampo)) {
        return coincidenciasDeTokens(claveTitulo, claveCampo) >= 1;
      }
    }

    return false;
  }

  function campoFueProporcionado(valor) {
    var texto = normalizarClave(valor);

    if (!texto) {
      return false;
    }

    return [
      'no especificado',
      'sin especificar',
      'no aplica',
      'ninguno',
      'n/a',
      'na',
      'contexto no especificado',
      'poblacion o unidad de estudio no especificada',
      'población o unidad de estudio no especificada',
      'ano o periodo no especificado',
      'año o período no especificado',
      'periodo no especificado'
    ].indexOf(texto) === -1;
  }

  function limpiarTitulo(valor) {
    return String(valor || '')
      .replace(/```[a-z]*\s*/ig, '')
      .replace(/```/g, '')
      .replace(/^\s*[-*•]\s*/g, '')
      .replace(/^\s*\d+[).:-]\s*/g, '')
      .replace(/^\s*(Título|Titulo|Opción|Opcion|Sugerencia)\s*\d*\s*[:.-]\s*/i, '')
      .replace(/^\s*(Diagnóstico|Diagnostico|Propuesta|Evaluación|Evaluacion)\s*[:.-]\s*/i, '')
      .replace(/\s*(?:Justificaci[oó]n(?:\s+breve)?|Explicaci[oó]n|Nota)\s*:\s*[\s\S]*$/i, '')
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

  function terminaEnFragmentoCortado(ultima) {
    var fragmentos = [
      'mec', 'intermit', 'an', 'automot', 'diagnost', 'identific',
      'reparaci', 'reducci', 'eficien', 'evalua', 'caracteriz',
      'propuest', 'implementaci', 'estandariz', 'optimizaci', 'correcci'
    ];

    if (!ultima) {
      return false;
    }

    if (/^\d{4}$/.test(ultima)) {
      return false;
    }

    if (ultima.length <= 3 && ['ia', 'tic', 'web', 'gps', 'app'].indexOf(ultima) === -1) {
      return true;
    }

    return fragmentos.indexOf(ultima) !== -1;
  }

  function terminaConIdeaAcademicaIncompleta(texto, propuesta) {
    var clave = normalizarClave(texto);
    var requiereCierre = campoFueProporcionado(propuesta && propuesta.lugarContexto) ||
      campoFueProporcionado(propuesta && propuesta.anioPeriodo);

    if (!requiereCierre) {
      return false;
    }

    return FINALES_INCOMPLETOS.some(function (finalIncompleto) {
      return clave.endsWith(normalizarClave(finalIncompleto));
    });
  }

  function usaCorreccionDeRuidosImprecisa(texto) {
    var clave = normalizarClave(texto);

    if (clave.indexOf('correccion de ruidos') === -1 && clave.indexOf('corrección de ruidos') === -1) {
      return false;
    }

    return clave.indexOf('fallas asociadas a ruidos') === -1 &&
      clave.indexOf('fallas vinculadas a ruidos') === -1 &&
      clave.indexOf('causas de ruidos') === -1 &&
      clave.indexOf('causas asociadas a ruidos') === -1;
  }

  function contieneAlguna(textoNormalizado, lista) {
    return lista.some(function (palabra) {
      var normal = normalizarClave(palabra);
      return normal && new RegExp('(^|\\s)' + escaparRegex(normal) + '(\\s|$)').test(textoNormalizado);
    });
  }

  function contieneAlgunaFrase(textoNormalizado, lista) {
    return lista.some(function (frase) {
      var normal = normalizarClave(frase);
      return normal && textoNormalizado.indexOf(normal) !== -1;
    });
  }

  function detectarContexto(titulo, contexto) {
    var clave = normalizarClave(titulo);
    var propuesta = contexto.propuesta || {};
    var grupo = normalizarClave(propuesta.grupoEstudio);
    var lugar = normalizarClave(propuesta.lugarContexto);
    var anio = normalizarClave(propuesta.anioPeriodo);

    if (campoFueProporcionado(propuesta.grupoEstudio) && contieneDatoNatural(titulo, grupo, 'grupo')) {
      return true;
    }

    if (campoFueProporcionado(propuesta.lugarContexto) && contieneDatoNatural(titulo, lugar, 'lugar')) {
      return true;
    }

    if (campoFueProporcionado(propuesta.anioPeriodo) && contienePeriodoNatural(titulo, anio)) {
      return true;
    }

    return /\b(en|de|para|durante|del|con)\b/.test(clave) && contarPalabras(titulo) >= MIN_PALABRAS;
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
      'análisis de problemas',
      'mejora de procesos',
      'evaluacion de resultados',
      'evaluación de resultados',
      'estrategias para mejorar',
      'estudio sobre algunas estrategias',
      'impacto del marketing digital',
      'educacion digital en estudiantes',
      'educación digital en estudiantes'
    ];

    return patrones.some(function (patron) {
      var normal = normalizarClave(patron);
      return clave === normal || (clave.indexOf(normal) === 0 && contarPalabras(clave) < MIN_PALABRAS);
    });
  }

  function clasificarCalidad(puntos, incompleto, totalErrores, totalBloqueos) {
    if (incompleto || totalBloqueos > 0 || puntos < 50) {
      return 'mala';
    }

    if (totalErrores > 0 || puntos < 82) {
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

  function agregarUnico(lista, mensaje) {
    var texto = String(mensaje || '').trim();
    var clave = normalizarClave(texto);

    if (!texto) {
      return;
    }

    if (!lista.some(function (item) { return normalizarClave(item) === clave; })) {
      lista.push(texto);
    }
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
    unirAdvertencias: unirAdvertencias,
    campoFueProporcionado: campoFueProporcionado,
    contieneDatoNatural: contieneDatoNatural,
    contienePeriodoNatural: contienePeriodoNatural
  });
})();