/*
  Archivo: titulos.prompt.service.js
  Ruta: estudiantes/js/titulos.prompt.service.js
  Funciones principales del archivo:
  - Construir prompts académicos estrictos para títulos de artículos científicos.
  - Generar prompts separados para diagnóstico, propuesta/mejora y evaluación/impacto.
  - Enviar títulos generados previamente para evitar repeticiones entre sugerencias.
  - Construir prompts de corrección cuando una IA omite grupo, contexto, período o enfoque.
  - Extraer y limpiar títulos aunque la IA responda con texto adicional.
  - Mantener funciones de respaldo por compatibilidad, sin usarlas como sustituto del flujo IA.
*/
(function () {
  'use strict';

  var ENFOQUES = {
    diagnostico: {
      id: 'diagnostico',
      etiqueta: 'Diagnóstico',
      titulo: 'Título académico de diagnóstico',
      finalidad: 'Diagnóstico del problema.',
      descripcion: [
        'identificar el problema principal',
        'analizar causas o factores asociados',
        'caracterizar la situación actual',
        'describir una necesidad técnica, académica o profesional',
        'delimitar población, proceso, lugar o contexto'
      ],
      estructura: '[Diagnóstico / Análisis / Caracterización / Identificación] + [problema técnico o académico] + [población, proceso o unidad de estudio] + [contexto o lugar] + [año o período obligatorio si fue proporcionado]',
      evitar: [
        'títulos que ya propongan una solución',
        'títulos que midan resultados antes de una intervención',
        'títulos sin problema, población o contexto'
      ],
      verbos: ['Diagnóstico', 'Análisis', 'Caracterización', 'Identificación']
    },
    propuesta: {
      id: 'propuesta',
      etiqueta: 'Propuesta o mejora',
      titulo: 'Título académico de proceso, estrategia o propuesta de mejora',
      finalidad: 'Proceso, estrategia, método, plan o propuesta de mejora.',
      descripcion: [
        'plantear una estrategia de mejora',
        'diseñar un procedimiento, método, protocolo o plan',
        'proponer una intervención técnica o académica',
        'mejorar el problema identificado',
        'conectar la solución con la carrera del estudiante'
      ],
      estructura: '[Propuesta / Diseño / Estrategia / Plan de mejora / Implementación] + [acción técnica o académica] + [problema que se busca mejorar] + [población, proceso o unidad de estudio] + [contexto o lugar] + [año o período obligatorio si fue proporcionado]',
      evitar: [
        'títulos que solo diagnostiquen el problema',
        'títulos que ya midan impacto o resultados',
        'promesas exageradas como solución definitiva'
      ],
      verbos: ['Propuesta', 'Diseño', 'Estrategia', 'Plan de mejora']
    },
    evaluacion: {
      id: 'evaluacion',
      etiqueta: 'Evaluación o impacto',
      titulo: 'Título académico de resultados, evaluación o impacto',
      finalidad: 'Evaluación de resultados, impacto o efectividad.',
      descripcion: [
        'medir resultados de una estrategia, proceso, método o intervención',
        'evaluar la efectividad de una mejora',
        'analizar cambios, beneficios o impacto',
        'relacionar resultados con indicadores propios de la carrera',
        'mantener delimitación clara de población, contexto y periodo'
      ],
      estructura: '[Evaluación / Medición / Análisis del impacto / Efectividad] + [estrategia, proceso o intervención] + [resultado esperado o indicador] + [población, proceso o unidad de estudio] + [contexto o lugar] + [año o período obligatorio si fue proporcionado]',
      evitar: [
        'títulos que solo diagnostiquen el problema',
        'títulos que solo propongan una mejora sin evaluar resultados',
        'títulos que afirmen resultados no comprobados'
      ],
      verbos: ['Evaluación', 'Medición', 'Análisis del impacto', 'Efectividad']
    }
  };

  function construirPrompt(estudiante, propuesta) {
    return construirPromptGeneral(estudiante, propuesta);
  }

  function construirPromptGeneral(estudiante, propuesta) {
    estudiante = estudiante || {};
    propuesta = propuesta || {};

    var datos = obtenerDatosBase(estudiante, propuesta);

    return [
      'Actúa como experto en redacción de títulos académicos para artículos científicos de nivel tecnológico superior.',
      '',
      'Tu tarea es generar exactamente 3 títulos académicos formales, claros, delimitados y directamente relacionados con la carrera del estudiante.',
      '',
      'REGLA PRINCIPAL OBLIGATORIA:',
      'El título debe responder en una sola frase: qué se estudia, en quién o en qué contexto, dónde y con qué enfoque.',
      'La carrera manda el enfoque técnico del título. Si la información del estudiante es informal, ambigua o poco académica, debes transformarla en lenguaje técnico y académico propio de la carrera.',
      '',
      'REGLA OBLIGATORIA DE EXTENSIÓN:',
      'Cada título debe tener entre 10 y 25 palabras, contando artículos, conectores y preposiciones.',
      'El rango ideal es de 12 a 18 palabras.',
      'Si para cerrar académicamente la idea necesitas 26 a 29 palabras, puedes hacerlo.',
      'Nunca generes títulos de 30 palabras o más.',
      '',
      'ESTRUCTURA IDEAL OBLIGATORIA:',
      config.estructura,
      '',
      'REGLA CRÍTICA DE ETAPA DEL PROCESO:',
      'Este título pertenece únicamente a la etapa: ' + config.etiqueta + '.',
      'No cambies esta etapa por otra.',
      'Si el enfoque es Diagnóstico, el título debe tratar el inicio del proceso: identificación, análisis o caracterización del problema.',
      'Si el enfoque es Propuesta o mejora, el título debe tratar el proceso/intervención: diseño, estrategia, plan, método, protocolo o implementación.',
      'Si el enfoque es Evaluación o impacto, el título debe tratar el final del proceso: evaluación, impacto, resultados, efectividad o comparación posterior.',
      '',
      'VERBOS O INICIOS PERMITIDOS PARA ESTE TÍTULO:',
      config.verbos.join(', '),
      '',
      'PROHIBICIÓN OBLIGATORIA:',
      enfoque === 'diagnostico' ? 'No uses verbos de propuesta ni de evaluación en este título.' : '',
      enfoque === 'propuesta' ? 'No empieces con Diagnóstico, Análisis, Caracterización ni Identificación. Este título debe iniciar como proceso, propuesta, diseño, estrategia, plan, método, protocolo o implementación.' : '',
      enfoque === 'evaluacion' ? 'No empieces con Diagnóstico, Análisis, Caracterización, Identificación, Propuesta, Diseño ni Plan. Este título debe iniciar como evaluación, impacto, resultados, efectividad o comparación.' : '',
      '',
      'FORMATO ACADÉMICO OBLIGATORIO:',
      'El cumplimiento del formato es obligatorio.',
      'No entregues títulos que omitan carrera, población, contexto o período cuando esos datos hayan sido proporcionados.',
      'Si no puedes cumplir el formato, reescribe el título hasta cumplirlo.',
      'Si el campo Carrera existe, el título debe estar directamente relacionado con esa carrera.',
      'Si el campo Tema general existe, debe transformarse en una variable o problema académico.',
      'Si el campo Grupo de estudio existe, debe aparecer como población o unidad de estudio.',
      'Si el campo Lugar o contexto existe, debe aparecer en el título.',
      'Si el campo Año o período existe, debe aparecer obligatoriamente en el título.',
      'Cada título debe estar completo, sin cortes ni palabras truncadas.',
      'Los tres títulos deben ser diferentes entre sí.',
      '',
      'DATOS DEL ESTUDIANTE:',
      'Carrera: ' + datos.carrera,
      'Tema general: ' + datos.temaGeneral,
      'Grupo de estudio: ' + datos.grupoEstudio,
      'Lugar o contexto: ' + datos.lugarContexto,
      'Año o período: ' + datos.anioPeriodo,
      'Problema o necesidad: ' + datos.problemaNecesidad,
      'Objetivo simple: ' + datos.objetivo,
      '',
      'ENFOQUES OBLIGATORIOS:',
      '1. Diagnóstico del problema.',
      '2. Proceso, estrategia, método, plan o propuesta de mejora.',
      '3. Evaluación de resultados, impacto o efectividad.',
      '',
      'REGLA DE DIFERENCIACIÓN:',
      'Los tres títulos deben ser diferentes en enfoque, estructura, verbo académico y finalidad investigativa. No deben ser simples paráfrasis entre sí.',
      '',
      'EVITA:',
      '- lenguaje informal;',
      '- títulos demasiado generales;',
      '- títulos sin relación directa con la carrera;',
      '- títulos sin población o contexto;',
      '- títulos sin año o período cuando ese dato haya sido proporcionado;',
      '- títulos incompletos;',
      '- comillas, numeración, viñetas, explicaciones o justificaciones.',
      '',
      'FORMATO DE RESPUESTA:',
      'Antes de responder, verifica internamente que cada título cumpla todo el formato obligatorio.',
      'Devuelve únicamente los tres títulos académicos.',
      'Devuelve exactamente 3 líneas, una por título.',
      'No incluyas explicaciones, justificaciones, numeraciones largas ni texto adicional.'
    ].join('\n');
  }

  function construirPromptPorEnfoque(estudiante, propuesta, enfoque, titulosPrevios) {
    estudiante = estudiante || {};
    propuesta = propuesta || {};
    titulosPrevios = Array.isArray(titulosPrevios) ? titulosPrevios : [];

    var datos = obtenerDatosBase(estudiante, propuesta);
    var config = obtenerEnfoque(enfoque);
    var titulosPreviosTexto = titulosPrevios.length
      ? titulosPrevios.map(function (titulo, index) {
        return (index + 1) + '. ' + limpiarTexto(typeof titulo === 'string' ? titulo : titulo && titulo.texto);
      }).join('\n')
      : 'Ninguno.';

    return [
      'Actúa como experto en redacción de títulos académicos para artículos científicos de nivel tecnológico superior.',
      '',
      'Tu tarea es generar un único título académico formal, claro, delimitado y directamente relacionado con la carrera del estudiante.',
      '',
      'REGLA PRINCIPAL OBLIGATORIA:',
      'El título debe tener relación directa con la carrera del estudiante.',
      'La carrera manda el enfoque técnico del título.',
      'Si la información escrita por el estudiante es informal, ambigua o poco académica, debes transformarla en lenguaje técnico y académico propio de la carrera.',
      '',
      'REGLA OBLIGATORIA DE EXTENSIÓN:',
      'Cada título debe tener entre 10 y 25 palabras, contando artículos, conectores y preposiciones.',
      'El rango ideal es de 12 a 18 palabras.',
      'Si para cerrar académicamente la idea necesitas 26 a 29 palabras, puedes hacerlo.',
      'Nunca generes títulos de 30 palabras o más.',
      '',
      'PREGUNTA QUE DEBE RESPONDER EL TÍTULO:',
      '¿Qué se estudia, en quién o en qué contexto, dónde y con qué enfoque?',
      '',
      'ESTRUCTURA IDEAL OBLIGATORIA:',
      '[Enfoque académico] + [problema o variable principal] + [población o unidad de estudio] + [contexto o lugar] + [año o período obligatorio si fue proporcionado]',
      '',
      'FORMATO ACADÉMICO OBLIGATORIO:',
      'El cumplimiento del formato es obligatorio.',
      'No entregues títulos que omitan carrera, población, contexto o período cuando esos datos hayan sido proporcionados.',
      'Si no puedes cumplir el formato, reescribe el título hasta cumplirlo.',
      'Si el campo Carrera existe, el título debe estar directamente relacionado con esa carrera.',
      'Si el campo Tema general existe, debe transformarse en una variable o problema académico.',
      'Si el campo Grupo de estudio existe, debe aparecer como población o unidad de estudio.',
      'Si el campo Lugar o contexto existe, debe aparecer en el título.',
      'Si el campo Año o período existe, debe aparecer obligatoriamente en el título.',
      'Cada título debe estar completo, sin cortes ni palabras truncadas.',
      '',
      'DATOS DEL ESTUDIANTE:',
      'Carrera: ' + datos.carrera,
      'Tema general: ' + datos.temaGeneral,
      'Grupo de estudio: ' + datos.grupoEstudio,
      'Lugar o contexto: ' + datos.lugarContexto,
      'Año o período: ' + datos.anioPeriodo,
      'Problema o necesidad: ' + datos.problemaNecesidad,
      'Objetivo simple: ' + datos.objetivo,
      '',
      'TÍTULOS GENERADOS PREVIAMENTE:',
      titulosPreviosTexto,
      '',
      'ENFOQUE DE ESTE TÍTULO:',
      config.etiqueta + ' — ' + config.finalidad,
      '',
      'El título debe centrarse únicamente en esta etapa:',
      config.descripcion.map(function (item) { return '- ' + item + ';'; }).join('\n'),
      '',
      'VALIDACIÓN ANTES DE RESPONDER:',
      'Antes de responder verifica internamente que el título no pertenece a otra etapa.',
      'Si el título empieza con una palabra prohibida para esta etapa, reescríbelo completo.',
      'Responde solo con un título de la etapa ' + config.etiqueta + '.',
      '',
      'REGLA DE DIFERENCIACIÓN:',
      'Este título debe ser diferente de cualquier título generado previamente.',
      'No debe ser una repetición con sinónimos.',
      'No debe tener el mismo verbo principal, la misma estructura ni el mismo enfoque que los otros títulos.',
      'Debe representar claramente la etapa de ' + config.etiqueta.toLowerCase() + '.',
      '',
      'ESTRUCTURA RECOMENDADA:',
      config.estructura,
      '',
      'EVITA:',
      '- lenguaje informal;',
      '- títulos demasiado generales;',
      '- títulos sin relación directa con la carrera;',
      '- títulos sin población o contexto;',
      '- títulos sin año o período cuando ese dato haya sido proporcionado;',
      '- títulos incompletos o terminados en conectores como de, para, en, la, el;',
      '- explicaciones, justificaciones, numeraciones largas, tablas, markdown o títulos alternativos;',
      config.evitar.map(function (item) { return '- ' + item + ';'; }).join('\n'),
      '',
      'GENERA:',
      '1 título académico de ' + config.etiqueta.toLowerCase() + '.',
      '',
      'FORMATO DE RESPUESTA:',
      'Antes de responder, verifica internamente que el título cumpla todo el formato obligatorio.',
      'Devuelve únicamente el título académico.',
      'No escribas la palabra Título.',
      'No incluyas explicaciones, justificaciones, numeraciones largas ni texto adicional.',
      'No agregues tablas, markdown ni títulos alternativos.'
    ].join('\n');
  }

  function construirPromptCorreccionAcademica(estudiante, propuesta, opciones) {
    estudiante = estudiante || {};
    propuesta = propuesta || {};
    opciones = opciones || {};

    if (typeof opciones === 'string') {
      opciones = {
        enfoque: opciones,
        tituloFallido: arguments[3],
        errores: arguments[4],
        titulosPrevios: arguments[5]
      };
    }

    var datos = obtenerDatosBase(estudiante, propuesta);
    var config = obtenerEnfoque(opciones.enfoque || 'diagnostico');
    var tituloFallido = limpiarTexto(opciones.tituloFallido || opciones.tituloAnterior || '');
    var erroresTexto = construirListaErrores(opciones.errores || opciones.problemas || opciones.advertencias);
    var titulosPrevios = Array.isArray(opciones.titulosPrevios) ? opciones.titulosPrevios : [];
    var titulosPreviosTexto = titulosPrevios.length
      ? titulosPrevios.map(function (titulo, index) {
        return (index + 1) + '. ' + limpiarTexto(typeof titulo === 'string' ? titulo : titulo && titulo.texto);
      }).join('\n')
      : 'Ninguno.';

    return [
      'Actúa como corrector académico estricto de títulos para artículos científicos de nivel tecnológico superior.',
      '',
      'Tu tarea es corregir o reescribir completamente el título fallido.',
      'No conserves una redacción incompleta. Si el título anterior está mal, escribe uno nuevo completo.',
      '',
      'TÍTULO FALLIDO:',
      tituloFallido || 'No disponible.',
      '',
      'ERRORES DETECTADOS:',
      erroresTexto,
      '',
      'REGLA PRINCIPAL OBLIGATORIA:',
      'El título debe responder en una sola frase: qué se estudia, en quién o en qué contexto, dónde y con qué enfoque.',
      'La carrera manda el enfoque técnico del título. Si la información del estudiante es informal, ambigua o poco académica, transfórmala en lenguaje técnico propio de la carrera.',
      '',
      'REGLA OBLIGATORIA DE EXTENSIÓN:',
      'El título debe tener entre 10 y 25 palabras.',
      'Si para cerrar académicamente la idea necesitas 26 a 29 palabras, puedes hacerlo.',
      'Nunca generes títulos de 30 palabras o más.',
      'No cortes el título: reescríbelo completo.',
      '',
      'ESTRUCTURA OBLIGATORIA:',
      '[Enfoque académico] + [problema o variable principal] + [unidad de estudio o población] + [contexto o lugar] + [año o período si fue proporcionado]',
      '',
      'ENFOQUE OBLIGATORIO:',
      config.etiqueta,
      'Finalidad: ' + config.finalidad,
      'Estructura recomendada: ' + config.estructura,
      '',
      'DATOS DEL ESTUDIANTE:',
      'Carrera: ' + datos.carrera,
      'Tema general: ' + datos.temaGeneral,
      'Grupo de estudio: ' + datos.grupoEstudio,
      'Lugar o contexto: ' + datos.lugarContexto,
      'Año o período: ' + datos.anioPeriodo,
      'Problema o necesidad: ' + datos.problemaNecesidad,
      'Objetivo simple: ' + datos.objetivo,
      '',
      'CAMPOS OBLIGATORIOS SI FUERON PROPORCIONADOS:',
      '- El grupo de estudio debe aparecer como población o unidad de estudio.',
      '- El lugar o contexto debe aparecer de forma natural.',
      '- El año o período debe aparecer de forma explícita.',
      '',
      'TÍTULOS YA APROBADOS QUE NO DEBES REPETIR:',
      titulosPreviosTexto,
      '',
      'EVITA:',
      '- lenguaje informal;',
      '- títulos demasiado generales;',
      '- títulos sin relación directa con la carrera;',
      '- títulos sin población, contexto o período cuando esos datos existan;',
      '- títulos que terminen con ideas incompletas como “vehículos atendidos”, “motores”, “usuarios” o “servicios”;',
      '- frases imprecisas como “corrección de ruidos”; usa “corrección de fallas asociadas a ruidos” o una formulación académica completa;',
      '- explicaciones, justificaciones, numeraciones largas, tablas, markdown o títulos alternativos.',
      '',
      'FORMATO DE RESPUESTA:',
      'Devuelve únicamente el título académico corregido.',
      'No escribas la palabra Título.',
      'No incluyas explicaciones, justificaciones, numeraciones largas ni texto adicional.'
    ].join('\n');
  }

  function limpiarSugerencias(texto) {
    var vistas = {};

    return extraerLineasCandidatas(texto)
      .map(limpiarTitulo)
      .filter(function (linea) {
        return linea.length >= 20;
      })
      .filter(function (linea) {
        if (/^justificaci[oó]n breve/i.test(linea)) {
          return false;
        }

        if (/^justificaci[oó]n/i.test(linea)) {
          return false;
        }

        if (/^(diagn[oó]stico|propuesta|evaluaci[oó]n)\s*:?$/i.test(linea)) {
          return false;
        }

        return true;
      })
      .filter(function (linea) {
        var key = normalizarClave(linea);

        if (vistas[key]) {
          return false;
        }

        vistas[key] = true;
        return true;
      })
      .slice(0, 3);
  }

  function extraerTitulo(texto) {
    var porEtiqueta = String(texto || '').match(/t[ií]tulo\s*:\s*(.+)/i);

    if (porEtiqueta && porEtiqueta[1]) {
      return limpiarTitulo(porEtiqueta[1]);
    }

    return limpiarSugerencias(texto)[0] || '';
  }

  function extraerJustificacion(texto) {
    var match = String(texto || '').match(/justificaci[oó]n\s*breve\s*:\s*([\s\S]+)/i);
    var valor = match && match[1] ? match[1] : '';

    return limpiarTexto(valor)
      .replace(/^[-*•]\s*/g, '')
      .trim();
  }

  function completarSiFaltanTres(sugerencias, contexto) {
    sugerencias = Array.isArray(sugerencias) ? sugerencias.slice(0, 3) : [];
    contexto = contexto || {};

    ['diagnostico', 'propuesta', 'evaluacion'].forEach(function (enfoque) {
      if (sugerencias.length >= 3) {
        return;
      }

      sugerencias.push(construirTituloRespaldo(
        contexto.estudiante || {},
        contexto.propuesta || {},
        enfoque,
        sugerencias
      ));
    });

    return sugerencias.slice(0, 3);
  }

  function construirTituloRespaldo(estudiante, propuesta, enfoque, titulosPrevios) {
    var datos = obtenerDatosBase(estudiante, propuesta);
    var config = obtenerEnfoque(enfoque);
    var variablePrincipal = construirVariablePrincipal(datos);
    var variableSecundaria = construirVariableSecundaria(datos, enfoque);
    var unidad = construirUnidad(datos);
    var contexto = construirContexto(datos);
    var periodo = construirPeriodo(datos);
    var verbo = elegirVerboDisponible(config.verbos, titulosPrevios);
    var titulo;

    if (enfoque === 'diagnostico') {
      titulo = verbo + ' de ' + variablePrincipal + ' en ' + unidad + contexto + periodo;
    } else if (enfoque === 'propuesta') {
      titulo = verbo + ' para mejorar ' + variableSecundaria + ' en ' + unidad + contexto + periodo;
    } else {
      titulo = verbo + ' de ' + variableSecundaria + ' en ' + unidad + contexto + periodo;
    }

    return limpiarTitulo(titulo);
  }

  function extraerLineasCandidatas(texto) {
    var limpio = String(texto || '')
      .replace(/\r/g, '\n')
      .replace(/```[\s\S]*?```/g, function (bloque) {
        return bloque.replace(/```/g, '');
      });

    var lineas = limpio.split('\n');
    var candidatas = [];

    lineas.forEach(function (linea) {
      var actual = limpiarTexto(linea);
      var matchTitulo = actual.match(/t[ií]tulo\s*:\s*(.+)/i);

      if (matchTitulo && matchTitulo[1]) {
        candidatas.push(matchTitulo[1]);
        return;
      }

      if (/^justificaci[oó]n/i.test(actual)) {
        return;
      }

      candidatas.push(actual);
    });

    if (!candidatas.length && limpio) {
      candidatas.push(limpio);
    }

    return candidatas;
  }

  function obtenerDatosBase(estudiante, propuesta) {
    estudiante = estudiante || {};
    propuesta = propuesta || {};

    return {
      carrera: limpiarTexto(estudiante.carrera || estudiante.nombreCarrera || 'Carrera no especificada'),
      temaGeneral: limpiarTexto(propuesta.temaGeneral || 'Tema no especificado'),
      grupoEstudio: limpiarTexto(propuesta.grupoEstudio || 'población o unidad de estudio no especificada'),
      lugarContexto: limpiarTexto(propuesta.lugarContexto || 'contexto no especificado'),
      anioPeriodo: limpiarTexto(propuesta.anioPeriodo || ''),
      problemaNecesidad: limpiarTexto(propuesta.problemaNecesidad || 'problema no especificado'),
      objetivo: limpiarTexto(propuesta.objetivo || 'objetivo no especificado')
    };
  }

  function obtenerEnfoque(enfoque) {
    enfoque = normalizarClave(enfoque || 'diagnostico');
    return ENFOQUES[enfoque] || ENFOQUES.diagnostico;
  }

  function construirVariablePrincipal(datos) {
    var tema = limpiarInformalidad(datos.temaGeneral);
    var carrera = normalizarClave(datos.carrera);

    if (/motor|automotriz|mecanica|mec[aá]nica|vehiculo|vehículo|carro|auto/.test(normalizarClave(tema + ' ' + datos.problemaNecesidad + ' ' + datos.carrera))) {
      return 'ruidos anómalos en motores automotrices';
    }

    if (tema && normalizarClave(tema) !== 'tema no especificado') {
      return tema;
    }

    if (carrera && carrera !== 'carrera no especificada') {
      return 'procesos relacionados con ' + datos.carrera.toLowerCase();
    }

    return 'variable principal del estudio';
  }

  function construirVariableSecundaria(datos, enfoque) {
    var problema = limpiarInformalidad(datos.problemaNecesidad);
    var objetivo = limpiarInformalidad(datos.objetivo);
    var clave = normalizarClave(problema + ' ' + objetivo + ' ' + datos.temaGeneral + ' ' + datos.carrera);

    if (/motor|automotriz|vehiculo|vehículo|carro|auto|aceler/.test(clave)) {
      if (enfoque === 'propuesta') {
        return 'la identificación técnica de fallas durante la aceleración';
      }

      if (enfoque === 'evaluacion') {
        return 'un procedimiento de diagnóstico de ruidos durante la aceleración';
      }

      return 'fallas intermitentes durante la aceleración';
    }

    if (problema && normalizarClave(problema) !== 'problema no especificado') {
      return problema;
    }

    if (objetivo && normalizarClave(objetivo) !== 'objetivo no especificado') {
      return objetivo;
    }

    return 'el problema identificado';
  }

  function construirUnidad(datos) {
    var grupo = limpiarInformalidad(datos.grupoEstudio);
    var clave = normalizarClave(grupo + ' ' + datos.lugarContexto + ' ' + datos.carrera);

    if (/cliente|persona|gente/.test(clave) && /carro|vehiculo|vehículo|automotriz|motor/.test(clave)) {
      return 'usuarios de servicios de reparación automotriz';
    }

    if (/taller/.test(clave)) {
      return 'talleres de reparación automotriz';
    }

    if (grupo && normalizarClave(grupo) !== 'poblacion o unidad de estudio no especificada') {
      return grupo;
    }

    return 'la unidad de estudio definida';
  }

  function construirContexto(datos) {
    var lugar = limpiarInformalidad(datos.lugarContexto);
    var clave = normalizarClave(lugar);

    if (!lugar || clave === 'contexto no especificado') {
      return '';
    }

    if (/taller|barrio|automotriz|mecan/.test(clave)) {
      return ' en ' + lugar;
    }

    if (/^en\s/.test(clave)) {
      return ' ' + lugar;
    }

    return ' en ' + lugar;
  }

  function construirPeriodo(datos) {
    var periodo = limpiarTexto(datos.anioPeriodo);

    if (!periodo || normalizarClave(periodo).indexOf('no especificado') !== -1) {
      return '';
    }

    if (/^durante\s/i.test(periodo)) {
      return ' ' + periodo;
    }

    return ' durante ' + periodo;
  }

  function elegirVerboDisponible(verbos, titulosPrevios) {
    var usados = (titulosPrevios || []).map(function (titulo) {
      return normalizarClave(typeof titulo === 'string' ? titulo : titulo && titulo.texto).split(' ')[0];
    });

    for (var i = 0; i < verbos.length; i += 1) {
      if (usados.indexOf(normalizarClave(verbos[i]).split(' ')[0]) === -1) {
        return verbos[i];
      }
    }

    return verbos[0];
  }

  function limpiarInformalidad(valor) {
    return limpiarTexto(valor)
      .replace(/\barreglos? de motores? que suenan? raro\b/ig, 'ruidos anómalos en motores automotrices')
      .replace(/\bcarros\b/ig, 'vehículos')
      .replace(/\bgente\b/ig, 'usuarios')
      .replace(/\bpor ahí\b/ig, '')
      .replace(/\balguna vez\b/ig, '')
      .replace(/\bsuena raro\b/ig, 'presenta ruidos anómalos')
      .replace(/\bsuenan raro\b/ig, 'presentan ruidos anómalos')
      .replace(/\barreglar\b/ig, 'mejorar')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function construirListaErrores(lista) {
    lista = Array.isArray(lista) ? lista : [];

    if (!lista.length) {
      return '- El título no cumplió la validación académica obligatoria.';
    }

    return lista.map(function (item) {
      return '- ' + limpiarTexto(item);
    }).join('\n');
  }

  function limpiarTitulo(valor) {
    var validator = window.TATitulosAcademicValidator;

    if (validator && validator.limpiarTitulo) {
      return limpiarTexto(validator.limpiarTitulo(valor))
        .replace(/\s*(?:Justificaci[oó]n(?:\s+breve)?|Explicaci[oó]n)\s*:\s*[\s\S]*$/i, '')
        .replace(/\s+/g, ' ')
        .trim();
    }

    return String(valor || '')
      .replace(/\s*(?:Justificaci[oó]n(?:\s+breve)?|Explicaci[oó]n)\s*:\s*[\s\S]*$/i, '')
      .replace(/^\s*[-*•]\s*/g, '')
      .replace(/^\s*\d+[).:-]\s*/g, '')
      .replace(/^\s*(Título|Titulo|Opción|Opcion|Sugerencia)\s*\d*\s*[:.-]\s*/i, '')
      .replace(/^\s*["“”'«»]+|["“”'«»]+\s*$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
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

  window.TATitulosPrompt = Object.freeze({
    construirPrompt: construirPrompt,
    construirPromptGeneral: construirPromptGeneral,
    construirPromptPorEnfoque: construirPromptPorEnfoque,
    construirPromptCorreccionAcademica: construirPromptCorreccionAcademica,
    limpiarSugerencias: limpiarSugerencias,
    extraerTitulo: extraerTitulo,
    extraerJustificacion: extraerJustificacion,
    completarSiFaltanTres: completarSiFaltanTres,
    construirTituloRespaldo: construirTituloRespaldo,
    limpiarTitulo: limpiarTitulo,
    limpiarTexto: limpiarTexto,
    obtenerEnfoque: obtenerEnfoque
  });
})();