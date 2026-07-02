/*
  Archivo: ia.orquestador.service.js
  Ruta: estudiantes/js/ia.orquestador.service.js
  Funciones principales del archivo:
  - Orquestar la generación de títulos con varios proveedores de IA.
  - Intentar primero el proveedor principal configurado y luego los demás activos.
  - Generar títulos por etapas: diagnóstico, propuesta/mejora y evaluación/impacto.
  - Emitir eventos de progreso para mostrar animación de carga.
  - Evitar que la app falle si una IA está saturada, con alta demanda o con timeout.
  - Extraer títulos desde respuestas simples, JSON, listas, markdown o varias líneas.
  - Generar sugerencias académicas de respaldo si todos los proveedores fallan.
  - Devolver sugerencias enriquecidas con proveedor, modelo, enfoque, calidad y advertencias.
*/
(function () {
  'use strict';

  var config = window.TA_ESTUDIANTES_CONFIG;
  var firebaseService = window.TAFirebaseService;
  var providersService = window.TAIAProviders;
  var promptService = window.TATitulosPrompt;
  var validator = window.TATitulosAcademicValidator;

  var ENFOQUES = Object.freeze(['diagnostico', 'propuesta', 'evaluacion']);

  function generarSugerencias(params) {
    params = params || {};

    var estudiante = params.estudiante || {};
    var appConfig = params.appConfig || {};
    var propuesta = normalizarPropuestaIA(params.propuesta || {});
    var onProgress = typeof params.onProgress === 'function' ? params.onProgress : noop;
    var opciones = obtenerOpciones(appConfig);

    emitir(onProgress, {
      tipo: 'inicio',
      titulo: 'IA de Titulación trabajando',
      detalle: 'Preparando la generación académica.',
      pasoActual: 0,
      totalPasos: ENFOQUES.length
    });

    return cargarProveedoresDisponibles(appConfig, opciones)
      .then(function (proveedores) {
        if (!proveedores.length) {
          return generarPorEnfoques({
            estudiante: estudiante,
            propuesta: propuesta,
            proveedores: [],
            opciones: opciones,
            onProgress: onProgress,
            usarRespaldo: true
          });
        }

        emitir(onProgress, {
          tipo: 'proveedores',
          titulo: 'IA de Titulación trabajando',
          detalle: 'Preparando opciones académicas.',
          proveedores: proveedores.map(function () {
            return 'IA de Titulación';
          })
        });

        return generarPorEnfoques({
          estudiante: estudiante,
          propuesta: propuesta,
          proveedores: proveedores,
          opciones: opciones,
          onProgress: onProgress,
          usarRespaldo: true
        });
      })
      .then(function (resultado) {
        resultado = asegurarResultadoValido(resultado, estudiante, propuesta);

        emitir(onProgress, {
          tipo: 'finalizado',
          titulo: 'Títulos generados',
          detalle: 'Las sugerencias fueron generadas correctamente.',
          pasoActual: ENFOQUES.length,
          totalPasos: ENFOQUES.length
        });

        return resultado;
      })
      .catch(function (error) {
        emitir(onProgress, {
          tipo: 'error',
          titulo: 'Generando sugerencias alternativas',
          detalle: 'Se prepararán opciones académicas con los datos ingresados.',
          error: error
        });

        return generarResultadoRespaldo(estudiante, propuesta, {
          motivo: limpiarMensajeError(error),
          prompts: [],
          textosOriginales: [],
          intentos: []
        });
      });
  }

  function generarPorEnfoques(contexto) {
    var sugerencias = [];
    var prompts = [];
    var textosOriginales = [];
    var intentos = [];
    var cadena = Promise.resolve();

    ENFOQUES.forEach(function (enfoque, index) {
      cadena = cadena.then(function () {
        var titulosPrevios = sugerencias.map(function (item) {
          return item.texto;
        });

        var prompt = construirPromptPorEnfoque(
          contexto.estudiante,
          contexto.propuesta,
          enfoque,
          titulosPrevios
        );

        prompts.push(prompt);

        emitir(contexto.onProgress, {
          tipo: 'enfoque',
          titulo: 'IA de Titulación trabajando',
          detalle: obtenerMensajeEnfoque(enfoque),
          enfoque: enfoque,
          enfoqueLabel: obtenerEtiquetaEnfoque(enfoque),
          pasoActual: index + 1,
          totalPasos: ENFOQUES.length
        });

        if (!contexto.proveedores || !contexto.proveedores.length) {
          var respaldoSinProveedor = construirSugerenciaRespaldo({
            estudiante: contexto.estudiante,
            propuesta: contexto.propuesta,
            enfoque: enfoque,
            motivo: 'No hay proveedores activos disponibles.'
          });

          sugerencias.push(respaldoSinProveedor);
          textosOriginales.push(respaldoSinProveedor.textoOriginal);
          intentos.push({
            proveedor: 'respaldo',
            proveedorLabel: 'IA de Titulación',
            modelo: 'respaldo-academico',
            enfoque: enfoque,
            ok: true,
            mensaje: 'Sugerencia de respaldo generada.'
          });

          return respaldoSinProveedor;
        }

        return intentarProveedores({
          estudiante: contexto.estudiante,
          propuesta: contexto.propuesta,
          proveedores: contexto.proveedores,
          opciones: contexto.opciones,
          onProgress: contexto.onProgress,
          enfoque: enfoque,
          prompt: prompt,
          titulosPrevios: titulosPrevios,
          pasoActual: index + 1,
          totalPasos: ENFOQUES.length
        }).then(function (resultado) {
          sugerencias.push(resultado.sugerencia);
          textosOriginales.push(resultado.textoOriginal);
          intentos = intentos.concat(resultado.intentos);

          return resultado;
        }).catch(function (error) {
          if (!contexto.usarRespaldo) {
            throw error;
          }

          var respaldo = construirSugerenciaRespaldo({
            estudiante: contexto.estudiante,
            propuesta: contexto.propuesta,
            enfoque: enfoque,
            motivo: limpiarMensajeError(error)
          });

          sugerencias.push(respaldo);
          textosOriginales.push(respaldo.textoOriginal);
          intentos.push({
            proveedor: 'respaldo',
            proveedorLabel: 'IA de Titulación',
            modelo: 'respaldo-academico',
            enfoque: enfoque,
            ok: true,
            mensaje: 'Sugerencia de respaldo generada después de fallo de proveedor.'
          });

          return {
            sugerencia: respaldo,
            textoOriginal: respaldo.textoOriginal,
            intentos: intentos
          };
        });
      });
    });

    return cadena.then(function () {
      return {
        ok: true,
        proveedor: obtenerProveedorPrincipalResultado(sugerencias),
        proveedorLabel: obtenerProveedorLabelPrincipalResultado(sugerencias),
        model: obtenerModeloPrincipalResultado(sugerencias),
        sugerencias: sugerencias,
        prompts: prompts,
        prompt: prompts.join('\n\n---\n\n'),
        textosOriginales: textosOriginales,
        textoOriginal: textosOriginales.join('\n\n---\n\n'),
        intentos: intentos
      };
    });
  }

  function intentarProveedores(contexto) {
    var errores = [];
    var intentos = [];
    var cadena = Promise.reject(new Error('Inicio de cadena de proveedores.'));

    contexto.proveedores.forEach(function (proveedor, index) {
      cadena = cadena.catch(function () {
        emitir(contexto.onProgress, {
          tipo: 'proveedor',
          titulo: 'IA de Titulación trabajando',
          detalle: 'Generando una opción académica de ' + obtenerEtiquetaEnfoque(contexto.enfoque).toLowerCase() + '.',
          proveedor: proveedor.id,
          proveedorLabel: 'IA de Titulación',
          modelo: '',
          enfoque: contexto.enfoque,
          pasoActual: contexto.pasoActual,
          totalPasos: contexto.totalPasos,
          proveedorActual: index + 1,
          totalProveedores: contexto.proveedores.length
        });

        return generarConReescritura(contexto, proveedor, 0, '', [])
          .then(function (resultado) {
            intentos.push({
              proveedor: proveedor.id,
              proveedorLabel: proveedor.nombre,
              modelo: proveedor.modelo,
              enfoque: contexto.enfoque,
              ok: true,
              mensaje: 'Título generado correctamente.'
            });

            emitir(contexto.onProgress, {
              tipo: 'exitoProveedor',
              titulo: 'Sugerencia generada',
              detalle: 'Se generó una sugerencia válida.',
              proveedor: proveedor.id,
              proveedorLabel: 'IA de Titulación',
              modelo: '',
              enfoque: contexto.enfoque,
              pasoActual: contexto.pasoActual,
              totalPasos: contexto.totalPasos
            });

            return {
              sugerencia: resultado.sugerencia,
              textoOriginal: resultado.textoOriginal,
              intentos: intentos
            };
          })
          .catch(function (error) {
            var mensaje = limpiarMensajeError(error);

            errores.push({
              proveedor: proveedor.id,
              proveedorLabel: proveedor.nombre,
              modelo: proveedor.modelo,
              enfoque: contexto.enfoque,
              mensaje: mensaje
            });

            intentos.push({
              proveedor: proveedor.id,
              proveedorLabel: proveedor.nombre,
              modelo: proveedor.modelo,
              enfoque: contexto.enfoque,
              ok: false,
              mensaje: mensaje
            });

            emitir(contexto.onProgress, {
              tipo: 'falloProveedor',
              titulo: 'Reintentando generación',
              detalle: 'La respuesta no fue suficiente. Probando otra alternativa.',
              proveedor: proveedor.id,
              proveedorLabel: 'IA de Titulación',
              modelo: '',
              enfoque: contexto.enfoque,
              pasoActual: contexto.pasoActual,
              totalPasos: contexto.totalPasos,
              error: mensaje
            });

            return Promise.reject(error);
          });
      });
    });

    return cadena.catch(function () {
      throw construirErrorFinal(contexto.enfoque, errores);
    });
  }

  function generarConReescritura(contexto, proveedor, numeroIntento, textoAnterior, fallosAnteriores) {
    var promptActual = numeroIntento === 0
      ? contexto.prompt
      : construirPromptReescritura(contexto, textoAnterior, fallosAnteriores);

    if (numeroIntento > 0) {
      emitir(contexto.onProgress, {
        tipo: 'reescritura',
        titulo: 'Ajustando título académico',
        detalle: 'Reescribiendo la opción para cumplir las reglas.',
        proveedor: proveedor.id,
        proveedorLabel: 'IA de Titulación',
        modelo: '',
        enfoque: contexto.enfoque,
        pasoActual: contexto.pasoActual,
        totalPasos: contexto.totalPasos
      });
    }

    return providersService.llamar(
      proveedor.id,
      proveedor.config,
      promptActual,
      {
        timeoutMs: contexto.opciones.timeoutMs
      }
    ).then(function (texto) {
      var sugerencia = construirSugerencia({
        estudiante: contexto.estudiante,
        propuesta: contexto.propuesta,
        proveedor: proveedor,
        enfoque: contexto.enfoque,
        prompt: promptActual,
        textoOriginal: texto
      });

      var validacionFinal = validarSugerenciaFinal(sugerencia, contexto);

      if (validacionFinal.ok) {
        return {
          sugerencia: sugerencia,
          textoOriginal: texto
        };
      }

      if (numeroIntento < contexto.opciones.maxReescrituras) {
        return generarConReescritura(
          contexto,
          proveedor,
          numeroIntento + 1,
          texto,
          validacionFinal.mensajes
        );
      }

      throw new Error(proveedor.nombre + ' devolvió un título inválido: ' + validacionFinal.mensajes.join(' '));
    });
  }

  function construirPromptReescritura(contexto, textoAnterior, fallos) {
    contexto = contexto || {};
    fallos = Array.isArray(fallos) ? fallos : [];

    return [
      'Reescribe el título académico anterior porque no cumple las reglas obligatorias de la app.',
      '',
      'TÍTULO O RESPUESTA ANTERIOR:',
      limpiarTexto(textoAnterior),
      '',
      'PROBLEMAS DETECTADOS:',
      fallos.length ? fallos.map(function (item) { return '- ' + item; }).join('\n') : '- El título no cumple las reglas obligatorias.',
      '',
      'REGLAS OBLIGATORIAS:',
      '- Devuelve únicamente un título académico completo.',
      '- El título debe tener entre 10 y 25 palabras, contando artículos, conectores y preposiciones.',
      '- El rango ideal es de 12 a 18 palabras.',
      '- No cortes palabras.',
      '- No termines con una palabra incompleta.',
      '- No incluyas justificación, explicación, numeración, etiquetas, comillas, tablas ni markdown.',
      '- El título debe corresponder al enfoque solicitado: ' + obtenerEtiquetaEnfoque(contexto.enfoque) + '.',
      '- El título debe mantener relación directa con la carrera, el problema, la población, el contexto y el año/período.',
      '- Formato obligatorio: [Enfoque académico] + [problema o variable principal] + [unidad de estudio o población] + [contexto o lugar] + [año o período si fue proporcionado].',
      '- Si el grupo de estudio fue proporcionado, debe aparecer de forma natural en el título.',
      '- Si el lugar o contexto fue proporcionado, debe aparecer de forma natural en el título.',
      '- Si el año o período fue proporcionado, debe aparecer obligatoriamente en el título.',
      '- No cierres el título con ideas incompletas como “vehículos atendidos”, “motores” o “usuarios” si falta lugar o período.',
      '- No uses frases imprecisas como “corrección de ruidos”; usa una formulación completa como “corrección de fallas asociadas a ruidos”.',
      '- Si no puedes cumplir el formato, reescribe el título hasta cumplirlo antes de responder.',
      '',
      'DATOS OBLIGATORIOS DEL FORMULARIO:',
      'Carrera: ' + limpiarTexto(contexto.estudiante && (contexto.estudiante.carrera || contexto.estudiante.nombreCarrera)),
      'Tema: ' + limpiarTexto(contexto.propuesta && contexto.propuesta.temaGeneral),
      'Problema: ' + limpiarTexto(contexto.propuesta && contexto.propuesta.problemaNecesidad),
      'Población o unidad de estudio: ' + limpiarTexto(contexto.propuesta && contexto.propuesta.grupoEstudio),
      'Lugar o contexto: ' + limpiarTexto(contexto.propuesta && contexto.propuesta.lugarContexto),
      'Año o período: ' + limpiarTexto(contexto.propuesta && contexto.propuesta.anioPeriodo),
      'Objetivo: ' + limpiarTexto(contexto.propuesta && contexto.propuesta.objetivo),
      '',
      'RESPUESTA FINAL:',
      'Escribe solo el título académico completo.'
    ].join('\n');
  }

  function construirSugerencia(opciones) {
    opciones = opciones || {};

    var titulo = extraerTitulo(opciones.textoOriginal);
    var evaluacion = evaluarTitulo(titulo, {
      estudiante: opciones.estudiante,
      propuesta: opciones.propuesta,
      enfoque: opciones.enfoque
    });

    return {
      texto: evaluacion.texto,
      enfoque: opciones.enfoque,
      enfoqueLabel: obtenerEtiquetaEnfoque(opciones.enfoque),
      proveedorIA: opciones.proveedor.id,
      proveedorIALabel: 'IA de Titulación',
      modeloIA: '',
      calidad: evaluacion.calidad,
      calidadLabel: obtenerEtiquetaCalidad(evaluacion.calidad),
      puntos: evaluacion.puntos,
      advertencias: evaluacion.advertencias || [],
      justificacion: '',
      textoOriginal: opciones.textoOriginal || '',
      prompt: opciones.prompt || '',
      reconstruido: false,
      incompleto: Boolean(evaluacion.incompleto),
      palabras: evaluacion.palabras || contarPalabras(evaluacion.texto)
    };
  }

  function construirSugerenciaRespaldo(opciones) {
    opciones = opciones || {};

    var estudiante = opciones.estudiante || {};
    var propuesta = normalizarPropuestaIA(opciones.propuesta || {});
    var enfoque = opciones.enfoque || 'diagnostico';
    var titulo = construirTituloRespaldo(estudiante, propuesta, enfoque);
    var evaluacion = evaluarTituloBasico(titulo, {
      estudiante: estudiante,
      propuesta: propuesta,
      enfoque: enfoque
    });

    return {
      texto: evaluacion.texto,
      enfoque: enfoque,
      enfoqueLabel: obtenerEtiquetaEnfoque(enfoque),
      proveedorIA: 'respaldo',
      proveedorIALabel: 'IA de Titulación',
      modeloIA: '',
      calidad: evaluacion.calidad,
      calidadLabel: obtenerEtiquetaCalidad(evaluacion.calidad),
      puntos: evaluacion.puntos,
      advertencias: limpiarUnicos([
        'Sugerencia generada con respaldo académico por falta de respuesta válida de los proveedores.',
        opciones.motivo || ''
      ].filter(Boolean)),
      justificacion: '',
      textoOriginal: titulo,
      prompt: '',
      reconstruido: true,
      incompleto: Boolean(evaluacion.incompleto),
      palabras: evaluacion.palabras || contarPalabras(evaluacion.texto)
    };
  }

  function construirTituloRespaldo(estudiante, propuesta, enfoque) {
    var carrera = limpiarTexto(estudiante && (estudiante.carrera || estudiante.nombreCarrera));
    var tema = limpiarTexto(propuesta.temaGeneral);
    var problema = limpiarTexto(propuesta.problemaNecesidad);
    var grupo = limpiarTexto(propuesta.grupoEstudio);
    var contexto = limpiarTexto(propuesta.lugarContexto);
    var periodo = limpiarTexto(propuesta.anioPeriodo);
    var variable = obtenerVariablePrincipal(tema, problema);
    var unidad = grupo || 'unidad de estudio';
    var lugar = contexto || carrera || 'contexto académico';
    var anio = periodo ? ' ' + periodo.replace(/\.$/, '') : '';

    if (enfoque === 'diagnostico') {
      return limpiarTitulo([
        'Diagnóstico de',
        variable,
        'en',
        unidad,
        'del',
        lugar + anio
      ].join(' '));
    }

    if (enfoque === 'propuesta') {
      return limpiarTitulo([
        'Propuesta de mejora de',
        variable,
        'en',
        unidad,
        'del',
        lugar + anio
      ].join(' '));
    }

    if (enfoque === 'evaluacion') {
      return limpiarTitulo([
        'Evaluación del impacto de',
        variable,
        'en',
        unidad,
        'del',
        lugar + anio
      ].join(' '));
    }

    return limpiarTitulo([
      'Análisis de',
      variable,
      'en',
      unidad,
      'del',
      lugar + anio
    ].join(' '));
  }

  function obtenerVariablePrincipal(tema, problema) {
    var texto = limpiarTexto(tema);

    if (texto) {
      return texto
        .replace(/\.$/, '')
        .replace(/^análisis\s+de\s+/i, '')
        .replace(/^diagnóstico\s+de\s+/i, '')
        .replace(/^propuesta\s+de\s+/i, '')
        .trim();
    }

    texto = limpiarTexto(problema);

    if (!texto) {
      return 'la problemática académica identificada';
    }

    return texto
      .split(/[.,;]/)[0]
      .replace(/^se\s+identifica\s+/i, '')
      .replace(/^existe\s+/i, '')
      .trim();
  }

  function validarSugerenciaFinal(sugerencia, contexto) {
    contexto = contexto || {};

    var mensajes = [];
    var texto = limpiarTitulo(sugerencia && sugerencia.texto);
    var palabras = contarPalabras(texto);
    var enfoque = contexto.enfoque;
    var propuesta = normalizarPropuestaIA(contexto.propuesta || {});

    if (!texto) {
      mensajes.push('No devolvió un título académico.');
    }

    if (incluyeJustificacion(texto) || incluyeJustificacion(sugerencia && sugerencia.textoOriginal)) {
      mensajes.push('Incluyó justificación o explicación.');
    }

    if (palabras < 10) {
      mensajes.push('El título tiene menos de 10 palabras.');
    }

    if (palabras > 29) {
      mensajes.push('El título tiene más de 29 palabras.');
    }

    if (terminaEnPalabraIncompleta(texto)) {
      mensajes.push('El título termina con una palabra incompleta o conector final.');
    }

    if (sugerencia && sugerencia.incompleto) {
      mensajes.push('El validador marcó el título como incompleto.');
    }

    if (sugerencia && sugerencia.calidad === 'mala') {
      mensajes.push('El validador marcó el título como baja calidad.');
    }

    if (!correspondeEnfoque(texto, enfoque)) {
      mensajes.push('El título no corresponde claramente al enfoque solicitado.');
    }

    validarCampoObligatorioEnTitulo({
      texto: texto,
      valor: propuesta.grupoEstudio,
      nombre: 'grupo de estudio o unidad de análisis',
      mensajes: mensajes
    });

    validarCampoObligatorioEnTitulo({
      texto: texto,
      valor: propuesta.lugarContexto,
      nombre: 'lugar o contexto',
      mensajes: mensajes
    });

    validarCampoObligatorioEnTitulo({
      texto: texto,
      valor: propuesta.anioPeriodo,
      nombre: 'año o período',
      tipo: 'periodo',
      mensajes: mensajes
    });

    if (terminaConIdeaAcademicaIncompleta(texto, propuesta)) {
      mensajes.push('El título termina con una idea incompleta y no cierra el contexto académico.');
    }

    if (usaCorreccionDeRuidosImprecisa(texto)) {
      mensajes.push('El título usa una frase imprecisa como “corrección de ruidos”; debe expresar fallas asociadas a ruidos.');
    }

    return {
      ok: mensajes.length === 0,
      mensajes: mensajes
    };
  }

  function validarCampoObligatorioEnTitulo(opciones) {
    opciones = opciones || {};

    var texto = opciones.texto || '';
    var valor = limpiarTexto(opciones.valor);
    var nombre = opciones.nombre || 'campo obligatorio';
    var mensajes = opciones.mensajes || [];
    var incluido = false;

    if (!campoFueProporcionado(valor)) {
      return;
    }

    incluido = opciones.tipo === 'periodo'
      ? incluyePeriodoProporcionado(texto, valor)
      : incluyeDatoProporcionado(texto, valor);

    if (!incluido) {
      mensajes.push('El título no incluye el dato obligatorio: ' + nombre + ' (' + valor + ').');
    }
  }

  function campoFueProporcionado(valor) {
    var clave = normalizarClave(valor);

    if (!clave) {
      return false;
    }

    return [
      'no especificado',
      'no especificada',
      'sin especificar',
      'sin dato',
      'sin datos',
      'ninguno',
      'ninguna',
      'na',
      'n a'
    ].indexOf(clave) === -1;
  }

  function incluyePeriodoProporcionado(texto, valor) {
    var tituloClave = normalizarClave(texto);
    var valorClave = normalizarClave(valor);
    var anios = valorClave.match(/\b(?:19|20)\d{2}\b/g) || [];

    if (!tituloClave || !valorClave) {
      return false;
    }

    if (anios.length) {
      return anios.every(function (anio) {
        return contieneToken(tituloClave, anio);
      });
    }

    return incluyeDatoProporcionado(texto, valor);
  }

  function incluyeDatoProporcionado(texto, valor) {
    var tituloClave = normalizarClave(texto);
    var valorClave = normalizarClave(valor);
    var tokens;

    if (!tituloClave || !valorClave) {
      return false;
    }

    if (tituloClave.indexOf(valorClave) !== -1) {
      return true;
    }

    tokens = obtenerTokensRelevantes(valorClave);

    if (!tokens.length) {
      return false;
    }

    if (tokens.length <= 2) {
      return tokens.every(function (token) {
        return contieneToken(tituloClave, token);
      });
    }

    return contarCoincidenciasTokens(tituloClave, tokens) >= Math.min(3, tokens.length);
  }

  function obtenerTokensRelevantes(valor) {
    var descartadas = [
      'a', 'al', 'ante', 'bajo', 'con', 'contra', 'de', 'del', 'desde',
      'durante', 'e', 'el', 'en', 'entre', 'hacia', 'hasta', 'la', 'las',
      'lo', 'los', 'mediante', 'o', 'para', 'por', 'segun', 'sin', 'sobre',
      'tras', 'un', 'una', 'unos', 'unas', 'y', 'ano', 'anio', 'anos',
      'anios', 'año', 'años', 'periodo', 'periodos', 'período', 'períodos'
    ];

    return normalizarClave(valor)
      .split(/\s+/)
      .filter(function (token) {
        return token && token.length > 2 && descartadas.indexOf(token) === -1;
      });
  }

  function contarCoincidenciasTokens(texto, tokens) {
    var total = 0;

    tokens.forEach(function (token) {
      if (contieneToken(texto, token)) {
        total += 1;
      }
    });

    return total;
  }

  function contieneToken(texto, token) {
    return (' ' + normalizarClave(texto) + ' ').indexOf(' ' + normalizarClave(token) + ' ') !== -1;
  }

  function terminaConIdeaAcademicaIncompleta(texto, propuesta) {
    var clave = normalizarClave(texto);
    var requiereCierre = campoFueProporcionado(propuesta && propuesta.lugarContexto) ||
      campoFueProporcionado(propuesta && propuesta.anioPeriodo);

    if (!requiereCierre) {
      return false;
    }

    return /(vehiculos atendidos|vehiculos|motores|clientes|usuarios|estudiantes|pacientes|unidad de estudio|poblacion|procesos|servicios)$/.test(clave);
  }

  function usaCorreccionDeRuidosImprecisa(texto) {
    var clave = normalizarClave(texto);

    if (clave.indexOf('correccion de ruidos') === -1) {
      return false;
    }

    return clave.indexOf('fallas asociadas a ruidos') === -1 &&
      clave.indexOf('fallas vinculadas a ruidos') === -1 &&
      clave.indexOf('causas de ruidos') === -1 &&
      clave.indexOf('causas asociadas a ruidos') === -1;
  }

  function cargarProveedoresDisponibles(appConfig, opciones) {
    var orden = construirOrdenProveedores(appConfig, opciones);
    var promesas = orden.map(function (providerId) {
      return leerProveedor(providerId).then(function (data) {
        return construirProveedor(providerId, data);
      }).catch(function (error) {
        console.warn('[IA Orquestador] No se pudo cargar proveedor ' + providerId + ':', error);
        return null;
      });
    });

    return Promise.all(promesas).then(function (proveedores) {
      return proveedores.filter(function (proveedor) {
        return Boolean(proveedor);
      });
    });
  }

  function leerProveedor(providerId) {
    if (!firebaseService || !firebaseService.leerDocumento) {
      return Promise.reject(new Error('Firebase no está listo para leer proveedores IA.'));
    }

    if (!config || !config.collections || !config.collections.ia) {
      return Promise.reject(new Error('No existe la colección IA en la configuración.'));
    }

    return firebaseService.leerDocumento(config.collections.ia, providerId);
  }

  function construirProveedor(providerId, data) {
    data = data || {};

    var base = buscarProveedorBase(providerId);
    var finalData = Object.assign({
      id: providerId,
      proveedor: providerId,
      nombre: base ? base.nombre : providerId,
      activo: false,
      apiKey: '',
      key: '',
      modelo: base ? base.modeloDefault : '',
      model: base ? base.modeloDefault : '',
      endpoint: base ? base.endpointDefault : ''
    }, data);

    if (!finalData.modelo && finalData.model) {
      finalData.modelo = finalData.model;
    }

    if (!finalData.model && finalData.modelo) {
      finalData.model = finalData.modelo;
    }

    if (!finalData.endpoint && base && base.endpointDefault) {
      finalData.endpoint = base.endpointDefault;
    }

    if (finalData.activo === false) {
      return null;
    }

    if (!providersService || !providersService.validarConfig) {
      return null;
    }

    var validacion = providersService.validarConfig(providerId, finalData);

    if (!validacion.ok) {
      console.warn('[IA Orquestador] Proveedor omitido:', providerId, validacion.mensaje);
      return null;
    }

    return {
      id: providerId,
      nombre: providersService.obtenerNombre(providerId, finalData),
      modelo: providersService.obtenerModelo(providerId, finalData),
      config: finalData
    };
  }

  function construirOrdenProveedores(appConfig, opciones) {
    appConfig = appConfig || {};
    opciones = opciones || {};

    var principal = limpiarTexto(appConfig.proveedorIA || opciones.proveedorPrincipal || 'gemini');
    var ordenBase = Array.isArray(appConfig.proveedoresIAOrden) && appConfig.proveedoresIAOrden.length
      ? appConfig.proveedoresIAOrden
      : opciones.proveedoresOrden;

    var resultado = [];
    var vistos = {};

    if (principal) {
      agregarProveedorOrden(resultado, vistos, principal);
    }

    (ordenBase || []).forEach(function (item) {
      agregarProveedorOrden(resultado, vistos, item);
    });

    obtenerIdsProveedoresBase().forEach(function (item) {
      agregarProveedorOrden(resultado, vistos, item);
    });

    return resultado;
  }

  function agregarProveedorOrden(resultado, vistos, providerId) {
    providerId = limpiarTexto(providerId).toLowerCase();

    if (!providerId || vistos[providerId]) {
      return;
    }

    if (!buscarProveedorBase(providerId)) {
      return;
    }

    vistos[providerId] = true;
    resultado.push(providerId);
  }

  function obtenerOpciones(appConfig) {
    appConfig = appConfig || {};

    var conf = config && config.iaOrquestador ? config.iaOrquestador : {};
    var ordenConfig = Array.isArray(conf.proveedoresOrden) ? conf.proveedoresOrden : [];
    var timeout = Number(
      appConfig.iaTimeoutMs ||
      conf.timeoutMs ||
      30000
    );
    var maxReescrituras = Number(
      appConfig.iaMaxReescrituras ||
      conf.maxReescrituras ||
      3
    );

    return {
      proveedorPrincipal: limpiarTexto(appConfig.proveedorIA || 'gemini'),
      proveedoresOrden: ordenConfig.length ? ordenConfig : ['gemini', 'groq', 'openrouter', 'cloudflare'],
      timeoutMs: Number.isFinite(timeout) && timeout >= 5000 ? timeout : 30000,
      maxReescrituras: Number.isFinite(maxReescrituras) && maxReescrituras >= 1 ? maxReescrituras : 3
    };
  }

  function construirPromptPorEnfoque(estudiante, propuesta, enfoque, titulosPrevios) {
    propuesta = normalizarPropuestaIA(propuesta || {});

    if (promptService && promptService.construirPromptPorEnfoque) {
      return promptService.construirPromptPorEnfoque(estudiante, propuesta, enfoque, titulosPrevios);
    }

    if (promptService && promptService.construirPrompt) {
      return promptService.construirPrompt(estudiante, propuesta);
    }

    return [
      'Genera un título académico completo para artículo científico.',
      'Enfoque: ' + obtenerEtiquetaEnfoque(enfoque) + '.',
      'Carrera: ' + limpiarTexto(estudiante && (estudiante.carrera || estudiante.nombreCarrera)),
      'Tema: ' + limpiarTexto(propuesta && propuesta.temaGeneral),
      'Problema: ' + limpiarTexto(propuesta && propuesta.problemaNecesidad),
      'Población o contexto: ' + limpiarTexto(propuesta && propuesta.grupoEstudio),
      'Lugar: ' + limpiarTexto(propuesta && propuesta.lugarContexto),
      'Año o período: ' + limpiarTexto(propuesta && propuesta.anioPeriodo),
      'Objetivo: ' + limpiarTexto(propuesta && propuesta.objetivo),
      '',
      'Formato obligatorio:',
      '[Enfoque académico] + [problema o variable principal] + [unidad de estudio o población] + [contexto o lugar] + [año o período si fue proporcionado].',
      '',
      'Reglas obligatorias:',
      '- El título debe tener entre 10 y 25 palabras.',
      '- Si el grupo de estudio fue proporcionado, debe aparecer en el título.',
      '- Si el lugar o contexto fue proporcionado, debe aparecer en el título.',
      '- Si el año o período fue proporcionado, debe aparecer en el título.',
      '- No cortes palabras.',
      '- No termines con una palabra incompleta.',
      '- No incluyas justificación ni explicación.',
      '- Responde únicamente con el título académico completo.'
    ].join('\n');
  }

  function extraerTitulo(texto) {
    if (promptService && promptService.extraerTitulo) {
      var tituloPrompt = promptService.extraerTitulo(texto);

      if (tituloPrompt && contarPalabras(tituloPrompt) >= 5) {
        return limpiarTitulo(tituloPrompt);
      }
    }

    var bruto = String(texto || '').trim();
    var jsonTitulo = extraerTituloDesdeJson(bruto);
    var lineas;
    var candidatos;

    if (jsonTitulo) {
      return limpiarTitulo(jsonTitulo);
    }

    bruto = bruto
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .replace(/\r/g, '\n')
      .trim();

    var match = bruto.match(/(?:t[ií]tulo|titulo|opci[oó]n|sugerencia)\s*\d*\s*[:.-]\s*([^\n]+)/i);

    if (match && match[1]) {
      return limpiarTitulo(match[1]);
    }

    lineas = bruto
      .split('\n')
      .map(limpiarTitulo)
      .filter(function (linea) {
        return Boolean(linea) &&
          !/^(respuesta|titulo|título|opcion|opción|sugerencia|justificacion|justificación)$/i.test(linea) &&
          !incluyeJustificacion(linea);
      });

    candidatos = lineas
      .map(function (linea) {
        return {
          texto: limpiarTitulo(linea),
          palabras: contarPalabras(linea),
          puntos: puntuarCandidatoTitulo(linea)
        };
      })
      .filter(function (item) {
        return item.texto && item.palabras >= 8 && item.palabras <= 32;
      })
      .sort(function (a, b) {
        return b.puntos - a.puntos;
      });

    if (candidatos.length) {
      return limpiarTitulo(candidatos[0].texto);
    }

    return limpiarTitulo(lineas[0] || bruto.split('\n')[0] || bruto);
  }

  function extraerTituloDesdeJson(texto) {
    var limpio = String(texto || '')
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    var data;
    var keys = ['titulo', 'título', 'title', 'texto', 'sugerencia', 'opcion', 'opción'];

    if (!limpio) {
      return '';
    }

    try {
      data = JSON.parse(limpio);
    } catch (error) {
      data = null;
    }

    if (Array.isArray(data)) {
      for (var i = 0; i < data.length; i += 1) {
        var desdeArray = extraerTituloDesdeObjeto(data[i], keys);
        if (desdeArray) return desdeArray;
      }
    }

    if (data && typeof data === 'object') {
      return extraerTituloDesdeObjeto(data, keys);
    }

    return '';
  }

  function extraerTituloDesdeObjeto(obj, keys) {
    if (!obj || typeof obj !== 'object') {
      return '';
    }

    for (var i = 0; i < keys.length; i += 1) {
      if (obj[keys[i]]) {
        return limpiarTitulo(obj[keys[i]]);
      }
    }

    if (Array.isArray(obj.sugerencias) && obj.sugerencias.length) {
      return extraerTituloDesdeObjeto(obj.sugerencias[0], keys);
    }

    if (Array.isArray(obj.titulos) && obj.titulos.length) {
      return extraerTituloDesdeObjeto(obj.titulos[0], keys);
    }

    return '';
  }

  function puntuarCandidatoTitulo(texto) {
    var puntos = 0;
    var palabras = contarPalabras(texto);
    var clave = normalizarClave(texto);

    if (palabras >= 10 && palabras <= 25) puntos += 50;
    if (palabras >= 12 && palabras <= 20) puntos += 20;
    if (correspondeEnfoque(texto, 'diagnostico') || correspondeEnfoque(texto, 'propuesta') || correspondeEnfoque(texto, 'evaluacion')) puntos += 15;
    if (!terminaEnPalabraIncompleta(texto)) puntos += 10;
    if (!incluyeJustificacion(texto)) puntos += 10;
    if (clave.indexOf('justificacion') !== -1 || clave.indexOf('explicacion') !== -1) puntos -= 40;

    return puntos;
  }

  function extraerJustificacion() {
    return '';
  }

  function evaluarTitulo(titulo, contexto) {
    if (validator && validator.evaluarTitulo) {
      return validator.evaluarTitulo(titulo, contexto);
    }

    return evaluarTituloBasico(titulo, contexto);
  }

  function evaluarTituloBasico(titulo) {
    var texto = limpiarTitulo(titulo);
    var palabras = contarPalabras(texto);
    var incompleto = terminaEnPalabraIncompleta(texto);
    var advertencias = [];
    var puntos = 100;

    if (palabras < 10) {
      puntos -= 40;
      advertencias.push('El título tiene menos de 10 palabras.');
    }

    if (palabras > 29) {
      puntos -= 40;
      advertencias.push('El título tiene más de 29 palabras.');
    }

    if (incompleto) {
      puntos -= 55;
      advertencias.push('El título parece incompleto.');
    }

    if (incluyeJustificacion(texto)) {
      puntos -= 60;
      advertencias.push('El título incluye justificación o explicación.');
    }

    return {
      texto: texto,
      calidad: incompleto || puntos < 50 ? 'mala' : puntos < 78 ? 'revisar' : 'buena',
      puntos: Math.max(0, puntos),
      advertencias: advertencias,
      incompleto: incompleto,
      palabras: palabras
    };
  }

  function construirErrorFinal(enfoque, errores) {
    var mensaje = 'No se pudo generar el título de ' + obtenerEtiquetaEnfoque(enfoque).toLowerCase() + ' con ningún proveedor activo.';
    var error = new Error(mensaje);

    error.detalleProveedores = errores || [];
    error.esErrorOrquestador = true;

    return error;
  }

  function obtenerMensajeEnfoque(enfoque) {
    if (enfoque === 'diagnostico') {
      return 'Paso 1 de 3: creando título de diagnóstico.';
    }

    if (enfoque === 'propuesta') {
      return 'Paso 2 de 3: creando título de propuesta o mejora.';
    }

    if (enfoque === 'evaluacion') {
      return 'Paso 3 de 3: creando título de evaluación o impacto.';
    }

    return 'Generando título académico.';
  }

  function obtenerEtiquetaEnfoque(enfoque) {
    if (validator && validator.obtenerEtiquetaEnfoque) {
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

  function obtenerEtiquetaCalidad(calidad) {
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

  function buscarProveedorBase(providerId) {
    providerId = limpiarTexto(providerId).toLowerCase();

    if (config && Array.isArray(config.proveedoresSugerencias)) {
      for (var i = 0; i < config.proveedoresSugerencias.length; i += 1) {
        if (config.proveedoresSugerencias[i].id === providerId) {
          return config.proveedoresSugerencias[i];
        }
      }
    }

    if (providersService && providersService.obtenerProveedorBase) {
      return providersService.obtenerProveedorBase(providerId);
    }

    return null;
  }

  function obtenerIdsProveedoresBase() {
    if (config && Array.isArray(config.proveedoresSugerencias)) {
      return config.proveedoresSugerencias.map(function (proveedor) {
        return proveedor.id;
      });
    }

    return ['gemini', 'groq', 'openrouter', 'cloudflare'];
  }

  function obtenerProveedorPrincipalResultado(sugerencias) {
    return sugerencias && sugerencias[0] ? sugerencias[0].proveedorIA : '';
  }

  function obtenerProveedorLabelPrincipalResultado(sugerencias) {
    return sugerencias && sugerencias[0] ? sugerencias[0].proveedorIALabel : '';
  }

  function obtenerModeloPrincipalResultado(sugerencias) {
    return sugerencias && sugerencias[0] ? sugerencias[0].modeloIA : '';
  }

  function asegurarResultadoValido(resultado, estudiante, propuesta) {
    resultado = resultado || {};
    resultado.sugerencias = Array.isArray(resultado.sugerencias) ? resultado.sugerencias.filter(function (item) {
      return item && limpiarTexto(item.texto);
    }) : [];

    if (resultado.sugerencias.length) {
      resultado.ok = true;
      return resultado;
    }

    return generarResultadoRespaldo(estudiante, propuesta, {
      motivo: 'No se obtuvieron sugerencias válidas.',
      prompts: resultado.prompts || [],
      textosOriginales: resultado.textosOriginales || [],
      intentos: resultado.intentos || []
    });
  }

  function generarResultadoRespaldo(estudiante, propuesta, extra) {
    extra = extra || {};
    propuesta = normalizarPropuestaIA(propuesta || {});

    var sugerencias = ENFOQUES.map(function (enfoque) {
      return construirSugerenciaRespaldo({
        estudiante: estudiante,
        propuesta: propuesta,
        enfoque: enfoque,
        motivo: extra.motivo || ''
      });
    });

    return {
      ok: true,
      proveedor: 'respaldo',
      proveedorLabel: 'IA de Titulación',
      model: '',
      sugerencias: sugerencias,
      prompts: extra.prompts || [],
      prompt: (extra.prompts || []).join('\n\n---\n\n'),
      textosOriginales: extra.textosOriginales || sugerencias.map(function (item) { return item.textoOriginal; }),
      textoOriginal: (extra.textosOriginales || sugerencias.map(function (item) { return item.textoOriginal; })).join('\n\n---\n\n'),
      intentos: extra.intentos || []
    };
  }

  function normalizarPropuestaIA(propuesta) {
    propuesta = propuesta || {};

    return {
      numero: propuesta.numero || propuesta.id || '',
      temaGeneral: limpiarTexto(propuesta.temaGeneral || propuesta.tema || propuesta.ideaPrincipal || propuesta.tituloTema || ''),
      problemaNecesidad: limpiarTexto(propuesta.problemaNecesidad || propuesta.problema || propuesta.necesidad || ''),
      lugarContexto: limpiarTexto(propuesta.lugarContexto || propuesta.contexto || propuesta.lugar || propuesta.ubicacion || ''),
      grupoEstudio: limpiarTexto(propuesta.grupoEstudio || propuesta.grupo || propuesta.poblacion || propuesta.unidadEstudio || ''),
      anioPeriodo: limpiarTexto(propuesta.anioPeriodo || propuesta.periodo || propuesta.anio || propuesta.año || ''),
      objetivo: limpiarTexto(propuesta.objetivo || propuesta.objetivoSimple || ''),
      tituloFinal: limpiarTexto(propuesta.tituloFinal || propuesta.titulo || '')
    };
  }

  function emitir(callback, data) {
    try {
      callback(data || {});
    } catch (error) {
      console.warn('[IA Orquestador] Error en callback de progreso:', error);
    }
  }

  function limpiarMensajeError(error) {
    var mensaje = error && error.message ? error.message : String(error || 'Error desconocido.');

    return limpiarTexto(mensaje)
      .replace(/key=[^\s&]+/ig, 'key=***')
      .replace(/api[_-]?key[^\s]+/ig, 'apiKey=***')
      .replace(/Bearer\s+[^\s]+/ig, 'Bearer ***');
  }

  function limpiarTitulo(valor) {
    if (validator && validator.limpiarTitulo) {
      return validator.limpiarTitulo(valor);
    }

    return limpiarTexto(valor)
      .replace(/\s*(?:Justificaci[oó]n(?:\s+breve)?|Explicaci[oó]n)\s*:\s*[\s\S]*$/i, '')
      .replace(/^```[a-z]*\s*/i, '')
      .replace(/```$/i, '')
      .replace(/^\s*[-*•]\s*/g, '')
      .replace(/^\s*\d+[).:-]\s*/g, '')
      .replace(/^\s*(Título|Titulo|Opción|Opcion|Sugerencia)\s*\d*\s*[:.-]\s*/i, '')
      .replace(/^\s*["“”'«»]+|["“”'«»]+\s*$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function incluyeJustificacion(texto) {
    return /justificaci[oó]n|explicaci[oó]n|corresponde\s+al\s+enfoque|este\s+t[ií]tulo|porque\s+permite/i.test(String(texto || ''));
  }

  function correspondeEnfoque(texto, enfoque) {
    var clave = normalizarClave(texto);

    if (!clave) {
      return false;
    }

    if (enfoque === 'diagnostico') {
      return contieneAlguna(clave, [
        'diagnostico', 'analisis', 'caracterizacion', 'identificacion',
        'causas', 'factores', 'dificultades', 'problemas', 'variabilidad',
        'comportamiento', 'condiciones', 'parametros'
      ]);
    }

    if (enfoque === 'propuesta') {
      return contieneAlguna(clave, [
        'propuesta', 'diseno', 'estrategia', 'plan', 'protocolo',
        'metodo', 'procedimiento', 'implementacion', 'mejora',
        'optimizacion', 'modelo', 'sistema'
      ]);
    }

    if (enfoque === 'evaluacion') {
      return contieneAlguna(clave, [
        'evaluacion', 'medicion', 'impacto', 'efectividad',
        'analisis del impacto', 'resultados', 'reduccion', 'desempeno',
        'eficiencia', 'eficacia'
      ]);
    }

    return true;
  }

  function contieneAlguna(texto, palabras) {
    for (var i = 0; i < palabras.length; i += 1) {
      if (texto.indexOf(normalizarClave(palabras[i])) !== -1) {
        return true;
      }
    }

    return false;
  }

  function contarPalabras(texto) {
    return obtenerPalabras(texto).length;
  }

  function obtenerPalabras(texto) {
    return limpiarTexto(texto)
      .replace(/[.,;:!?¿¡()[\]{}"“”'«»]/g, ' ')
      .split(/\s+/)
      .filter(function (item) {
        return Boolean(item);
      });
  }

  function terminaEnPalabraIncompleta(texto) {
    var palabras = obtenerPalabras(texto);
    var ultima = palabras.length ? palabras[palabras.length - 1] : '';
    var clave = normalizarClave(ultima);
    var conectores = [
      'a', 'al', 'ante', 'bajo', 'con', 'contra', 'de', 'del', 'desde',
      'durante', 'e', 'el', 'en', 'entre', 'hacia', 'hasta', 'la', 'las',
      'lo', 'los', 'mediante', 'o', 'para', 'por', 'segun', 'sin', 'sobre',
      'tras', 'un', 'una', 'unos', 'unas', 'y'
    ];
    var fragmentosCortados = [
      'mec', 'intermit', 'an', 'automot', 'diagnost', 'identific',
      'reparaci', 'reducci', 'eficien', 'evalua', 'caracteriz',
      'propuest', 'implementaci', 'estandariz'
    ];

    if (!clave) {
      return true;
    }

    if (/^\d{4}$/.test(clave)) {
      return false;
    }

    if (conectores.indexOf(clave) !== -1) {
      return true;
    }

    if (fragmentosCortados.indexOf(clave) !== -1) {
      return true;
    }

    if (clave.length <= 3 && ['ia', 'tic', 'web', 'gps', 'app'].indexOf(clave) === -1) {
      return true;
    }

    return false;
  }

  function normalizarClave(valor) {
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

  function limpiarUnicos(lista) {
    var vistos = {};
    var resultado = [];

    (lista || []).forEach(function (item) {
      var limpio = limpiarTexto(item);

      if (!limpio || vistos[limpio]) {
        return;
      }

      vistos[limpio] = true;
      resultado.push(limpio);
    });

    return resultado;
  }

  function limpiarTexto(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function noop() {}

  window.TAIAOrquestador = Object.freeze({
    generarSugerencias: generarSugerencias,
    cargarProveedoresDisponibles: cargarProveedoresDisponibles,
    construirOrdenProveedores: construirOrdenProveedores
  });
})();