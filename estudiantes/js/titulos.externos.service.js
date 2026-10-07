/*
  Flujo externo de formulación de títulos.
  - La app NO genera títulos con IA.
  - Genera un prompt institucional personalizado para usar en la IA que prefiera el estudiante.
  - La IA hace preguntas sencillas, una por una, y ejecuta 3 rondas.
  - El estudiante pega un título elegido por ronda en Título 1, Título 2 y Título 3.
  - Se conservan p1Titulo, p2Titulo y p3Titulo para no romper persistencia, resumen ni revisión.
*/
(function () {
  'use strict';

  var originalValidaciones = window.TAEstudianteValidaciones;
  var originalFormularioController = window.TAEstudianteFormularioController;

  transformarInterfaz();
  instalarValidacionesExternas();
  envolverFormularioController();
  instalarEstilos();
  instalarModalConfirmacion();
  habilitarTitulosEditables();
  actualizarTodosLosEstados();

  function transformarInterfaz() {
    transformarTitulo(1, 'Título 1', 'Ronda 1');
    transformarTitulo(2, 'Título 2', 'Ronda 2');
    transformarTitulo(3, 'Título 3', 'Ronda 3');
  }

  function transformarTitulo(numero, titulo, ronda) {
    var section = document.querySelector('[data-step="propuesta' + numero + '"]');
    if (!section) return;

    var ayuda = numero === 1 ? construirAyudaPrincipal() : construirAyudaContinuacion(numero);

    section.innerHTML = [
      '<div class="titulo-externo__sticky-nav" data-ronda="' + numero + '">',
      '  <button class="btn btn--ghost" type="button" data-action="prev">← Regresar</button>',
      '  <button class="btn btn--primary titulo-externo__continuar" type="button" data-action="next" disabled>Continuar →</button>',
      '</div>',
      '<div class="section-heading titulo-externo__heading">',
      '  <p class="section-kicker">' + ronda + '</p>',
      '  <h2>' + titulo + '</h2>',
      '</div>',
      '<article class="titulo-externo-card titulo-externo-card--principal">',
      '  <label for="p' + numero + 'Titulo">Pega el título que elegiste</label>',
      '  <textarea id="p' + numero + 'Titulo" name="p' + numero + 'Titulo" rows="3" maxlength="360" placeholder="Pega aquí tu título elegido."></textarea>',
      '  <div class="titulo-externo-card__footer">',
      '    <span class="titulo-externo-card__contador" id="p' + numero + 'Contador">0 palabras</span>',
      '    <span class="titulo-externo-card__estado" id="p' + numero + 'Estado">Pega un título para continuar.</span>',
      '  </div>',
      '  <div class="titulo-externo-card__meta">',
      '    <span>10–25 palabras</span>',
      '    <span>1 finalidad · 1 objeto</span>',
      '  </div>',
      '</article>',
      ayuda
    ].join('');

    var campo = section.querySelector('#p' + numero + 'Titulo');
    if (campo) {
      campo.addEventListener('input', function () { actualizarEstadoTitulo(numero); });
      campo.addEventListener('paste', function () {
        window.setTimeout(function () { actualizarEstadoTitulo(numero); }, 0);
      });
    }

    if (numero === 1) {
      var copiarMaestro = section.querySelector('#btnCopiarPromptTitulos');
      if (copiarMaestro) copiarMaestro.addEventListener('click', copiarPromptMaestro);
      var details = section.querySelector('.prompt-institucional__preview');
      if (details) details.addEventListener('toggle', actualizarVistaPrompt);
    } else {
      var copiarContinuacion = section.querySelector('[data-copy-continuacion="' + numero + '"]');
      var copiarMaestroSec = section.querySelector('[data-copy-maestro="true"]');
      if (copiarContinuacion) copiarContinuacion.addEventListener('click', function (event) { copiarContinuacionRonda(event, numero); });
      if (copiarMaestroSec) copiarMaestroSec.addEventListener('click', copiarPromptMaestro);
    }
  }

  function construirAyudaPrincipal() {
    return [
      '<article class="prompt-institucional">',
      '  <div class="prompt-institucional__top">',
      '    <div>',
      '      <span class="prompt-institucional__eyebrow">AYUDA OPCIONAL</span>',
      '      <h3>¿Aún no tienes tu título?</h3>',
      '      <p>Copia el prompt y úsalo en la IA que prefieras.</p>',
      '    </div>',
      '    <button class="btn btn--prompt" type="button" id="btnCopiarPromptTitulos">Copiar prompt</button>',
      '  </div>',
      '  <div class="prompt-institucional__flow"><span>1 Copia</span><i>→</i><span>2 Responde</span><i>→</i><span>3 Elige</span><i>→</i><span>4 Pega</span></div>',
      '  <details class="prompt-institucional__preview">',
      '    <summary>Ver prompt</summary>',
      '    <pre id="promptTitulosPreview"></pre>',
      '  </details>',
      '  <p class="prompt-institucional__status" id="promptTitulosEstado" role="status"></p>',
      '</article>'
    ].join('');
  }

  function construirAyudaContinuacion(numero) {
    return [
      '<article class="ronda-recordatorio">',
      '  <div>',
      '    <strong>¿La IA perdió el hilo?</strong>',
      '    <p>Copia la instrucción corta y continúa en la misma conversación.</p>',
      '  </div>',
      '  <div class="ronda-recordatorio__acciones">',
      '    <button class="btn btn--secondary btn--compact" type="button" data-copy-continuacion="' + numero + '">Continuar Ronda ' + numero + '</button>',
      '    <button class="btn btn--ghost btn--compact" type="button" data-copy-maestro="true">Prompt maestro</button>',
      '  </div>',
      '  <p class="ronda-recordatorio__status" id="ronda' + numero + 'Estado" role="status"></p>',
      '</article>'
    ].join('');
  }

  function construirPrompt() {
    var state = window.TAEstudianteState;
    var estado = state && typeof state.obtener === 'function' ? state.obtener() : {};
    var estudiante = estado && estado.estudiante ? estado.estudiante : {};
    var carrera = limpiar(estudiante.carrera || estudiante.nombreCarrera || 'la carrera registrada del estudiante');
    var periodo = limpiar(estudiante.periodoLabel || estudiante.periodo || estudiante.periodoId || estudiante.ultimoPeriodoId || 'el período académico registrado');
    var fechaActual = formatearFecha(new Date());

    return [
      'ACTÚA COMO ASESOR METODOLÓGICO DE TITULACIÓN DEL ITSQMET.',
      '',
      'DATOS DEL ESTUDIANTE',
      '- Carrera: ' + carrera + '.',
      '- Período académico: ' + periodo + '.',
      '- Fecha actual: ' + fechaActual + '.',
      '- Tiempo disponible aproximado para desarrollar el trabajo: 1 mes.',
      '',
      'OBJETIVO',
      'Ayúdame a obtener TRES títulos finales de titulación para registrarlos en mi aplicación institucional. Trabajaremos en TRES RONDAS. En cada ronda debes presentarme exactamente tres opciones nuevas: una de Diagnóstico, una de Propuesta y una de Resultados. Yo elegiré una opción de cada ronda y la copiaré como Título 1, Título 2 y Título 3.',
      '',
      'CÓMO DEBES HABLAR CONMIGO',
      '1. Asume que puedo ser una persona que nunca ha escrito un trabajo de titulación.',
      '2. Haz UNA sola pregunta por mensaje y espera mi respuesta antes de hacer la siguiente.',
      '3. Usa lenguaje cotidiano. No me preguntes por “variable”, “unidad de análisis”, “delimitación metodológica” ni otros términos técnicos si puedes preguntarlo de forma sencilla.',
      '4. Si respondo “no sé”, “no entiendo” o algo parecido, dame entre 3 y 4 ejemplos sencillos relacionados con mi carrera para que pueda escoger o adaptar uno.',
      '5. No me pidas que redacte objetivos, hipótesis ni metodología. Tú debes transformar mis respuestas sencillas en títulos académicos viables.',
      '',
      'PREGUNTAS INICIALES SUGERIDAS',
      'Hazlas una por una y solo las que hagan falta:',
      '- “¿Actualmente trabajas o haces prácticas? Responde Sí o No.”',
      '- Si digo Sí: “¿Dónde trabajas o haces prácticas? Puedes escribir solo el nombre de la empresa o institución.”',
      '- “¿Qué haces normalmente allí? Ejemplo: atiendo clientes, manejo inventario, arreglo vehículos, llevo redes sociales, registro pacientes.”',
      '- “¿Qué problema o situación has notado? Cuéntamelo con tus propias palabras.”',
      '- “¿Sobre qué personas, documentos, productos, vehículos, procesos o servicios puedes conseguir información fácilmente?”',
      '- Cuando haga falta: “¿Desde qué mes hasta qué mes tienes información disponible? Ejemplo: enero a septiembre de 2026.”',
      'Si no trabajo ni hago prácticas, pregúntame si tengo acceso real a algún negocio, institución, emprendimiento, comunidad, familiar, barrio, taller, servicio u otro contexto relacionado con mi carrera. Si ese contexto no sirve, ayúdame a escoger OTRO tema o contexto real relacionado con mi carrera.',
      '',
      'REGLAS INSTITUCIONALES OBLIGATORIAS',
      '1. Cada título debe tener UNA sola acción principal y UNA sola finalidad central.',
      '2. Cada título debe estudiar UN solo objeto o UNA sola variable principal. NO propongas relaciones entre dos variables.',
      '3. No unas dos trabajos con “y”, “además” o estructuras equivalentes.',
      '4. El título debe ser neutral: no afirmes de antemano que algo es deficiente, exitoso, ineficiente, positivo, negativo o que produjo un impacto.',
      '5. Delimita solo lo necesario: población o unidad concreta, empresa/institución/comunidad/área, elemento técnico y período cuando corresponda.',
      '6. Si el fenómeno cambia con el tiempo, usa un período real con inicio y fin. Un año aislado no sustituye el período.',
      '7. Si el año está en curso, no uses todo el año como si ya hubiera terminado. Usa únicamente meses o fechas cuyos datos realmente pueden existir hasta hoy.',
      '8. Un diagnóstico solo puede usar información presente o pasada disponible.',
      '9. Una propuesta, plan, modelo, diseño, estrategia o guía sí puede proyectarse al futuro, siempre que pueda desarrollarse en aproximadamente un mes.',
      '10. Un título de Resultados/Evaluación/Impacto solo puede proponerse si yo tengo acceso real a datos de algo que YA ocurrió.',
      '11. Si no tengo datos reales para una opción de Resultados, NO inventes información ni fuerces un título. Detén la ronda y hazme una pregunta sencilla para encontrar OTRO tema o contexto real donde sí existan datos pasados accesibles. La ronda solo continúa cuando las tres opciones sean viables.',
      '12. El trabajo completo debe ser realizable aproximadamente en un mes. Reduce población, componentes, procesos o alcance cuando sea necesario.',
      '13. No agregues varios productos en un mismo título. Si es diagnóstico, no agregues además un plan. Si es diseño, no agregues además medición de impacto.',
      '14. Todos los títulos deben relacionarse directamente con mi carrera y usar terminología propia de ella.',
      '15. Redacción directa. Evita frases decorativas, explicaciones metodológicas innecesarias y palabras que no cambian el alcance.',
      '16. Longitud orientativa: 10 a 25 palabras. Puedes usar algunas más solo si son indispensables para delimitar bien el trabajo.',
      '',
      'DINÁMICA OBLIGATORIA DE LAS RONDAS',
      'RONDA 1',
      '- Genera exactamente 3 opciones nuevas y diferentes entre sí.',
      '- Opción 1 — Diagnóstico: fase inicial, situación actual o caracterización de algo que pueda observarse con datos disponibles.',
      '- Opción 2 — Propuesta: plan, modelo, diseño, estrategia, guía, protocolo o mejora factible de desarrollar en un mes.',
      '- Opción 3 — Resultados: análisis, evaluación o impacto de algo que ya ocurrió y para lo cual confirmaste que tengo datos.',
      '- Después de mostrar las tres opciones, DETENTE y pregúntame cuál elijo: 1, 2 o 3.',
      '- Cuando elija, repite solo el título elegido y escribe: “Copia este como Título 1 en la aplicación”. Luego pregúntame si ya lo copié. No empieces la Ronda 2 hasta que yo confirme.',
      '',
      'RONDA 2',
      '- Vuelve a generar exactamente 3 opciones NUEVAS: Diagnóstico, Propuesta y Resultados.',
      '- Deben ser diferentes a TODOS los títulos mostrados en la Ronda 1. No hagas simples reformulaciones; busca otros temas o ángulos viables relacionados con mi carrera y mis contextos reales.',
      '- Para la opción Resultados vuelve a confirmar que existan datos pasados accesibles. Si no existen, pregúntame por otro contexto antes de generar la ronda.',
      '- Después de mi elección, repite solo el título elegido y escribe: “Copia este como Título 2 en la aplicación”. Espera mi confirmación.',
      '',
      'RONDA 3',
      '- Genera otras 3 opciones NUEVAS: Diagnóstico, Propuesta y Resultados.',
      '- Deben ser diferentes a todo lo mostrado en las rondas 1 y 2.',
      '- Mantén las mismas reglas de viabilidad, una sola variable, temporalidad real y datos disponibles.',
      '- Después de mi elección, repite solo el título elegido y escribe: “Copia este como Título 3 en la aplicación”.',
      '',
      'FORMATO DE CADA RONDA',
      'Presenta solo:',
      '1. [Diagnóstico] Título...',
      '2. [Propuesta] Título...',
      '3. [Resultados] Título...',
      'No añadas explicaciones largas ni justificaciones debajo de los títulos.',
      '',
      'Comienza ahora con UNA sola pregunta sencilla para conocer mi contexto real.'
    ].join('\n');
  }

  function construirContinuacion(numero) {
    var state = window.TAEstudianteState;
    var estado = state && typeof state.obtener === 'function' ? state.obtener() : {};
    var estudiante = estado && estado.estudiante ? estado.estudiante : {};
    var carrera = limpiar(estudiante.carrera || estudiante.nombreCarrera || 'mi carrera');

    return [
      'Continúa con la RONDA ' + numero + ' del ejercicio de títulos de titulación para la carrera ' + carrera + '.',
      'Genera exactamente 3 títulos NUEVOS y diferentes a todos los mostrados antes:',
      '1. [Diagnóstico] una opción de fase inicial con datos presentes o pasados disponibles.',
      '2. [Propuesta] una opción de plan, modelo, diseño, estrategia, guía o mejora realizable aproximadamente en un mes.',
      '3. [Resultados] una opción sobre algo que YA ocurrió y para lo cual tengo datos reales disponibles.',
      'No uses dos variables ni relaciones entre variables. Mantén una sola finalidad y un solo objeto central.',
      'Si no tienes confirmado que dispongo de datos reales para la opción Resultados, NO la inventes: hazme primero UNA pregunta sencilla para encontrar otro tema o contexto con datos pasados accesibles.',
      'Respeta períodos reales: si el año está en curso, no uses todo el año como si ya hubiera terminado.',
      'Presenta solo los tres títulos con las etiquetas Diagnóstico, Propuesta y Resultados. Después pregúntame cuál elijo y espera mi respuesta.'
    ].join('\n');
  }

  function copiarPromptMaestro(event) {
    if (event && event.preventDefault) event.preventDefault();
    var prompt = construirPrompt();
    var status = document.querySelector('#promptTitulosEstado');

    copiarTexto(prompt).then(function () {
      if (status) status.textContent = 'Prompt copiado. Pégalo en la IA que prefieras y responde una pregunta a la vez.';
      actualizarVistaPrompt();
    }).catch(function () {
      if (status) status.textContent = 'No se pudo copiar automáticamente. Abre “Ver el prompt” y cópialo manualmente.';
      actualizarVistaPrompt();
    });
  }

  function copiarContinuacionRonda(event, numero) {
    if (event && event.preventDefault) event.preventDefault();
    var texto = construirContinuacion(numero);
    var status = document.querySelector('#ronda' + numero + 'Estado');

    copiarTexto(texto).then(function () {
      if (status) status.textContent = 'Instrucción de Ronda ' + numero + ' copiada. Pégala en la misma conversación con tu IA.';
    }).catch(function () {
      if (status) status.textContent = 'No se pudo copiar automáticamente. Vuelve a copiar el prompt maestro si la IA perdió el contexto.';
    });
  }

  function copiarTexto(texto) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(texto);

    return new Promise(function (resolve, reject) {
      var area = document.createElement('textarea');
      area.value = texto;
      area.setAttribute('readonly', 'readonly');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();

      try {
        document.execCommand('copy') ? resolve() : reject(new Error('copy'));
      } catch (e) {
        reject(e);
      }

      document.body.removeChild(area);
    });
  }

  function actualizarVistaPrompt() {
    var preview = document.querySelector('#promptTitulosPreview');
    if (preview) preview.textContent = construirPrompt();
  }

  function instalarValidacionesExternas() {
    if (!originalValidaciones) return;

    var copia = copiarObjeto(originalValidaciones);

    copia.validarPropuestaPorNumero = function (numero) {
      return validarTituloPresente(numero, valor('#p' + numero + 'Titulo'));
    };

    copia.validarPropuestaDesdeObjeto = function (propuesta, numero) {
      numero = Number(numero || (propuesta && propuesta.numero) || 0);
      return validarTituloPresente(numero, propuesta && propuesta.tituloFinal);
    };

    copia.validarSugerenciaElegida = function (propuesta, numero) {
      return validarTituloPresente(Number(numero || (propuesta && propuesta.numero) || 0), propuesta && propuesta.tituloFinal);
    };

    copia.validarTituloAcademico = function (propuesta, numero) {
      return validarTituloPresente(Number(numero || (propuesta && propuesta.numero) || 0), propuesta && propuesta.tituloFinal);
    };

    copia.validarPaso = function (paso) {
      if (paso === 'contacto') return originalValidaciones.validarDatosContacto();
      if (paso === 'propuesta1') return validarTituloPresente(1, valor('#p1Titulo'));
      if (paso === 'propuesta2') return validarTituloPresente(2, valor('#p2Titulo'));
      if (paso === 'propuesta3') return validarTituloPresente(3, valor('#p3Titulo'));
      return { ok: true, data: null, mensaje: '', selector: '' };
    };

    copia.validarEnvio = function (formData, total) {
      var contacto = originalValidaciones.validarDatosContacto();
      if (!contacto.ok) return contacto;

      total = Number(total || 3);
      if (!formData || !Array.isArray(formData.propuestas) || formData.propuestas.length < total) {
        return fallo('Debes completar los tres títulos.', '#p1Titulo');
      }

      var vistos = {};
      for (var i = 0; i < total; i += 1) {
        var resultado = validarTituloPresente(i + 1, formData.propuestas[i] && formData.propuestas[i].tituloFinal);
        if (!resultado.ok) return resultado;

        var clave = normalizarComparacion(formData.propuestas[i].tituloFinal);
        if (vistos[clave]) {
          return fallo('Los tres títulos deben ser diferentes. Revisa el Título ' + (i + 1) + '.', '#p' + (i + 1) + 'Titulo');
        }
        vistos[clave] = true;
      }

      var preferido = Number(formData.tituloPreferidoNumero || 0);
      if (!preferido || preferido < 1 || preferido > total) {
        return fallo('Selecciona cuál de los tres títulos prefieres antes de enviar.', '#resumenEnvio');
      }

      return { ok: true, data: { contacto: contacto.data }, mensaje: '', selector: '' };
    };

    window.TAEstudianteValidaciones = Object.freeze(copia);
  }

  function validarTituloPresente(numero, texto) {
    numero = Number(numero || 0);
    var titulo = limpiarTitulo(texto);
    var selector = '#p' + numero + 'Titulo';

    if (!titulo) {
      return fallo('Pega el Título ' + numero + ' que elegiste en la Ronda ' + numero + ' para continuar.', selector);
    }

    return {
      ok: true,
      data: {
        numero: numero,
        tituloFinal: titulo,
        palabras: contarPalabras(titulo)
      },
      mensaje: '',
      selector: ''
    };
  }

  function envolverFormularioController() {
    if (!originalFormularioController) return;

    var copia = copiarObjeto(originalFormularioController);

    ['inicializarFormularioTrasConsulta', 'limpiarFormularioVisual', 'cargarFormulario'].forEach(function (nombre) {
      if (typeof originalFormularioController[nombre] !== 'function') return;

      copia[nombre] = function () {
        var resultado = originalFormularioController[nombre].apply(originalFormularioController, arguments);
        habilitarTitulosEditables();
        actualizarVistaPrompt();
        ajustarResumen();
        window.setTimeout(actualizarTodosLosEstados, 0);
        return resultado;
      };
    });

    if (typeof originalFormularioController.actualizarResumenPreferido === 'function') {
      copia.actualizarResumenPreferido = function () {
        var resultado = originalFormularioController.actualizarResumenPreferido.apply(originalFormularioController, arguments);
        ajustarResumen();
        return resultado;
      };
    }

    if (typeof originalFormularioController.manejarCambioPaso === 'function') {
      copia.manejarCambioPaso = function (info) {
        var resultado = originalFormularioController.manejarCambioPaso.apply(originalFormularioController, arguments);
        window.setTimeout(actualizarTodosLosEstados, 0);
        return resultado;
      };
    }

    if (typeof originalFormularioController.validarAntesDeAvanzar === 'function') {
      copia.validarAntesDeAvanzar = function (pasoActual, pasoDestino) {
        var numero = obtenerNumeroRondaDesdePaso(pasoActual);

        if (!numero) {
          return originalFormularioController.validarAntesDeAvanzar.apply(originalFormularioController, arguments);
        }

        var titulo = valor('#p' + numero + 'Titulo');
        var validacion = validarTituloPresente(numero, titulo);

        if (!validacion.ok) {
          enfocarTitulo(numero);
          return false;
        }

        return mostrarConfirmacionTitulo(numero, limpiarTitulo(titulo))
          .then(function (confirmado) {
            if (!confirmado) {
              enfocarTitulo(numero);
              return false;
            }

            if (typeof originalFormularioController.actualizarResumenPreferido === 'function') {
              originalFormularioController.actualizarResumenPreferido();
              ajustarResumen();
            }

            return true;
          });
      };
    }

    window.TAEstudianteFormularioController = Object.freeze(copia);
  }

  var resolverConfirmacionTitulo = null;

  function obtenerNumeroRondaDesdePaso(paso) {
    var match = /^propuesta([1-3])$/.exec(String(paso || ''));
    return match ? Number(match[1]) : 0;
  }

  function instalarModalConfirmacion() {
    if (document.getElementById('modalConfirmarTitulo')) return;

    var modal = document.createElement('div');
    modal.id = 'modalConfirmarTitulo';
    modal.className = 'titulo-confirmacion-modal is-hidden';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = [
      '<div class="titulo-confirmacion-modal__backdrop" data-confirmacion-cancelar="true"></div>',
      '<section class="titulo-confirmacion-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="tituloConfirmacionHeading">',
      '  <button type="button" class="titulo-confirmacion-modal__close" aria-label="Cerrar" data-confirmacion-cancelar="true">×</button>',
      '  <span class="titulo-confirmacion-modal__eyebrow" id="tituloConfirmacionEyebrow">CONFIRMACIÓN · TÍTULO 1</span>',
      '  <h2 id="tituloConfirmacionHeading">¿Este es el título que quieres registrar?</h2>',
      '  <p class="titulo-confirmacion-modal__intro" id="tituloConfirmacionIntro">Revísalo antes de continuar.</p>',
      '  <div class="titulo-confirmacion-modal__titulo" id="tituloConfirmacionTexto"></div>',
      '  <div class="titulo-confirmacion-modal__actions">',
      '    <button type="button" class="btn btn--ghost" id="btnEditarTituloConfirmacion">Editar título</button>',
      '    <button type="button" class="btn btn--primary" id="btnConfirmarTituloContinuar">Confirmar y continuar</button>',
      '  </div>',
      '</section>'
    ].join('');

    document.body.appendChild(modal);

    var cancelar = modal.querySelectorAll('[data-confirmacion-cancelar="true"]');
    Array.prototype.forEach.call(cancelar, function (elemento) {
      elemento.addEventListener('click', function (event) {
        if (event && event.preventDefault) event.preventDefault();
        cerrarConfirmacionTitulo(false);
      });
    });

    var editar = modal.querySelector('#btnEditarTituloConfirmacion');
    if (editar) {
      editar.addEventListener('click', function (event) {
        if (event && event.preventDefault) event.preventDefault();
        cerrarConfirmacionTitulo(false);
      });
    }

    var confirmar = modal.querySelector('#btnConfirmarTituloContinuar');
    if (confirmar) {
      confirmar.addEventListener('click', function (event) {
        if (event && event.preventDefault) event.preventDefault();
        cerrarConfirmacionTitulo(true);
      });
    }

    document.addEventListener('keydown', function (event) {
      if (!event || event.key !== 'Escape') return;
      var abierto = document.getElementById('modalConfirmarTitulo');
      if (abierto && !abierto.classList.contains('is-hidden')) {
        cerrarConfirmacionTitulo(false);
      }
    });
  }

  function mostrarConfirmacionTitulo(numero, titulo) {
    instalarModalConfirmacion();

    var modal = document.getElementById('modalConfirmarTitulo');
    if (!modal) return Promise.resolve(true);

    var eyebrow = modal.querySelector('#tituloConfirmacionEyebrow');
    var intro = modal.querySelector('#tituloConfirmacionIntro');
    var texto = modal.querySelector('#tituloConfirmacionTexto');
    var confirmar = modal.querySelector('#btnConfirmarTituloContinuar');

    if (eyebrow) eyebrow.textContent = 'CONFIRMACIÓN · TÍTULO ' + numero;
    if (intro) intro.textContent = 'Confirma que este sea el título que elegiste en la Ronda ' + numero + '.';
    if (texto) texto.textContent = titulo;
    if (confirmar) confirmar.textContent = 'Confirmar y continuar';

    modal.dataset.numeroTitulo = String(numero);
    modal.classList.remove('is-hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('has-open-modal');

    return new Promise(function (resolve) {
      resolverConfirmacionTitulo = resolve;
      window.setTimeout(function () {
        if (confirmar && typeof confirmar.focus === 'function') confirmar.focus();
      }, 50);
    });
  }

  function cerrarConfirmacionTitulo(confirmado) {
    var modal = document.getElementById('modalConfirmarTitulo');
    var numero = modal ? Number(modal.dataset.numeroTitulo || 0) : 0;

    if (modal) {
      modal.classList.add('is-hidden');
      modal.setAttribute('aria-hidden', 'true');
    }

    if (!document.querySelector('.modal:not(.is-hidden), .ia-loading-modal:not(.is-hidden), .titulo-confirmacion-modal:not(.is-hidden)')) {
      document.body.classList.remove('has-open-modal');
    }

    var resolver = resolverConfirmacionTitulo;
    resolverConfirmacionTitulo = null;

    if (resolver) resolver(Boolean(confirmado));

    if (!confirmado && numero) {
      window.setTimeout(function () { enfocarTitulo(numero); }, 80);
    }
  }

  function enfocarTitulo(numero) {
    var campo = document.querySelector('#p' + numero + 'Titulo');
    if (!campo) return;

    if (typeof campo.focus === 'function') campo.focus();
    if (typeof campo.scrollIntoView === 'function') {
      campo.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function habilitarTitulosEditables() {
    for (var i = 1; i <= 3; i += 1) {
      var campo = document.querySelector('#p' + i + 'Titulo');
      if (!campo) continue;

      campo.removeAttribute('readonly');
      campo.removeAttribute('data-sugerencia-seleccionada');
      campo.removeAttribute('data-sugerencia-index');
      campo.removeAttribute('data-sugerencia-enfoque');
      campo.removeAttribute('data-sugerencia-fecha');
      campo.classList.remove('title-final-selected', 'title-final-selected--stable');
    }
  }

  function actualizarTodosLosEstados() {
    for (var i = 1; i <= 3; i += 1) actualizarEstadoTitulo(i);
  }

  function actualizarEstadoTitulo(numero) {
    var campo = document.querySelector('#p' + numero + 'Titulo');
    var section = document.querySelector('[data-step="propuesta' + numero + '"]');
    if (!campo || !section) return;

    var titulo = limpiarTitulo(campo.value);
    var palabras = contarPalabras(titulo);
    var contador = section.querySelector('#p' + numero + 'Contador');
    var estado = section.querySelector('#p' + numero + 'Estado');
    var continuar = section.querySelector('.titulo-externo__continuar');
    var listo = Boolean(titulo);

    if (contador) contador.textContent = palabras + (palabras === 1 ? ' palabra' : ' palabras');
    if (estado) {
      estado.textContent = listo ? 'Título pegado. Puedes continuar.' : 'Pega un título para habilitar Continuar.';
      estado.classList.toggle('is-ready', listo);
    }

    if (continuar) continuar.disabled = !listo;
    campo.classList.toggle('is-ready', listo);
  }

  function ajustarResumen() {
    var resumen = document.querySelector('#resumenEnvio');
    if (!resumen) return;

    Array.prototype.forEach.call(resumen.querySelectorAll('strong'), function (strong) {
      strong.textContent = String(strong.textContent || '').replace(/^Propuesta\s+(\d+)/i, 'Título $1');
    });

    var heading = resumen.querySelector('h3');
    if (heading && /Elige el título/i.test(heading.textContent || '')) {
      heading.textContent = 'Elige cuál de tus tres títulos prefieres';
    }
  }

  function instalarEstilos() {
    if (document.getElementById('titulosExternosStyles')) return;

    var style = document.createElement('style');
    style.id = 'titulosExternosStyles';
    style.textContent = [
      '.titulo-externo__sticky-nav{position:sticky;top:6px;z-index:35;display:flex;align-items:center;justify-content:space-between;gap:8px;margin:-6px 0 10px;padding:7px 9px;border:1px solid rgba(196,211,227,.92);border-radius:12px;background:rgba(255,255,255,.95);box-shadow:0 7px 18px rgba(7,31,61,.10);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}',
      '.titulo-externo__sticky-nav .btn{width:auto!important;min-width:112px;min-height:34px!important;padding:6px 11px!important;font-size:.82rem!important}',
      '.titulo-externo__sticky-nav .btn:disabled{opacity:.5;cursor:not-allowed;box-shadow:none!important}',
      '.titulo-externo__heading{display:flex!important;align-items:baseline!important;gap:9px!important;margin:0 0 8px!important;padding:0!important}',
      '.titulo-externo__heading .section-kicker{margin:0!important;font-size:.62rem!important}',
      '.titulo-externo__heading h2{margin:0!important;font-size:1.32rem!important}',
      '.titulo-externo-card{border:1px solid #b7cce0;border-radius:14px;background:#fff;padding:13px 14px;box-shadow:0 6px 18px rgba(11,31,58,.05);margin-bottom:10px}',
      '.titulo-externo-card--principal{border-top:3px solid #0b5da7}',
      '.titulo-externo-card label{display:block;margin-bottom:5px;color:#102f50;font-size:.84rem;font-weight:850}',
      '.titulo-externo-card textarea{min-height:82px!important;font-size:.94rem;line-height:1.42;background:#fff;border-color:#c4d3e2;padding:10px 12px!important}',
      '.titulo-externo-card textarea.is-ready{border-color:#57a77d;box-shadow:0 0 0 2px rgba(10,137,88,.07)}',
      '.titulo-externo-card__footer{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:6px;padding-top:6px;border-top:1px solid #e8eef4}',
      '.titulo-externo-card__contador,.titulo-externo-card__estado{font-size:.65rem;font-weight:850}',
      '.titulo-externo-card__contador{color:#49647f}',
      '.titulo-externo-card__estado{color:#8a5a00;text-align:right}',
      '.titulo-externo-card__estado.is-ready{color:#087443}',
      '.titulo-externo-card__meta{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}',
      '.titulo-externo-card__meta span{padding:3px 6px;border-radius:999px;background:#f1f5f9;color:#5d6f82;font-size:.61rem;font-weight:800}',
      '.prompt-institucional{border:1px solid #d2dfec;border-radius:14px;background:linear-gradient(135deg,#f7fbff,#fffaf2);padding:12px 14px;margin-top:4px;box-shadow:0 5px 16px rgba(11,31,58,.04)}',
      '.prompt-institucional__top{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center}',
      '.prompt-institucional__eyebrow{display:block;font-size:.58rem;font-weight:950;letter-spacing:.08em;color:#9a6b00;margin-bottom:2px}',
      '.prompt-institucional h3{margin:0 0 2px;color:#0b2d55;font-size:.94rem}',
      '.prompt-institucional p{margin:0;color:#617286;line-height:1.3;font-size:.78rem}',
      '.btn--prompt{background:#0b5da7;color:#fff;box-shadow:0 5px 13px rgba(11,93,167,.16);white-space:nowrap;min-height:34px!important;padding:6px 11px!important;font-size:.78rem!important}',
      '.prompt-institucional__flow{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-top:9px;color:#31587e;font-size:.68rem;font-weight:850}',
      '.prompt-institucional__flow span{padding:3px 7px;border:1px solid #dce7f1;border-radius:999px;background:#fff}',
      '.prompt-institucional__flow i{font-style:normal;color:#8ca0b5}',
      '.prompt-institucional__preview{margin-top:8px;border-top:1px solid #e1e8ef;padding-top:7px}',
      '.prompt-institucional__preview summary{cursor:pointer;font-weight:850;color:#31587e;font-size:.7rem}',
      '.prompt-institucional__preview pre{white-space:pre-wrap;max-height:280px;overflow:auto;background:#071b34;color:#e8f1fa;border-radius:10px;padding:11px;font:11px/1.42 ui-monospace,SFMono-Regular,Menlo,monospace;margin:7px 0 0}',
      '.prompt-institucional__status{margin-top:6px!important;color:#087443!important;font-weight:850!important;font-size:.68rem!important}',
      '.ronda-recordatorio{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:10px 12px;border:1px solid #d2dfec;border-radius:13px;background:#f8fbff;margin-top:4px}',
      '.ronda-recordatorio strong{display:block;color:#153654;font-size:.82rem}',
      '.ronda-recordatorio p{margin:2px 0 0;color:#63758a;font-size:.7rem;line-height:1.3}',
      '.ronda-recordatorio__acciones{display:flex;gap:6px;align-items:center}',
      '.ronda-recordatorio__status{grid-column:1/-1;margin:0!important;color:#087443!important;font-size:.67rem!important;font-weight:850!important}',
      '.btn--compact{min-height:32px!important;padding:5px 9px!important;font-size:.68rem!important;width:auto!important}',
      '.titulo-confirmacion-modal{position:fixed;inset:0;z-index:1005;display:grid;place-items:center;padding:18px}',
      '.titulo-confirmacion-modal.is-hidden{display:none!important}',
      '.titulo-confirmacion-modal__backdrop{position:absolute;inset:0;background:rgba(4,18,37,.62);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px)}',
      '.titulo-confirmacion-modal__dialog{position:relative;z-index:1;width:min(720px,100%);border-radius:20px;background:#fff;border:1px solid #d7e2ed;box-shadow:0 28px 80px rgba(3,20,42,.28);padding:22px}',
      '.titulo-confirmacion-modal__close{position:absolute;right:14px;top:13px;width:36px;height:36px;border-radius:50%;border:1px solid #d5e1ed;background:#fff;color:#102a49;font-size:1.45rem;font-weight:900;line-height:1;cursor:pointer}',
      '.titulo-confirmacion-modal__eyebrow{display:block;padding-right:46px;color:#9a6b00;font-size:.66rem;font-weight:950;letter-spacing:.09em;margin-bottom:7px}',
      '.titulo-confirmacion-modal__dialog h2{margin:0 48px 6px 0;color:#0b294d;font-size:1.42rem;line-height:1.18}',
      '.titulo-confirmacion-modal__intro{margin:0 0 13px;color:#68798e;font-size:.88rem;line-height:1.4}',
      '.titulo-confirmacion-modal__titulo{padding:15px 16px;border:1px solid #b9d0e5;border-left:5px solid #0b5da7;border-radius:13px;background:linear-gradient(90deg,#f3f8ff,#fff);color:#102b49;font-size:1rem;line-height:1.48;font-weight:800;overflow-wrap:anywhere}',
      '.titulo-confirmacion-modal__actions{display:grid;grid-template-columns:1fr 1.25fr;gap:10px;margin-top:16px}',
      '.titulo-confirmacion-modal__actions .btn{min-height:42px!important;width:100%!important}',
      '.titulo-confirmacion-modal__actions .btn--primary{background:#08294f!important;color:#fff!important}',
      '@media(max-width:800px){.prompt-institucional__top{grid-template-columns:1fr auto}.ronda-recordatorio{grid-template-columns:1fr}.ronda-recordatorio__acciones{justify-content:flex-start}.titulo-externo__sticky-nav{top:5px}}',
      '@media(max-width:560px){.titulo-confirmacion-modal{padding:12px}.titulo-confirmacion-modal__dialog{padding:18px 15px;border-radius:16px}.titulo-confirmacion-modal__dialog h2{font-size:1.16rem;margin-right:38px}.titulo-confirmacion-modal__intro{font-size:.8rem}.titulo-confirmacion-modal__titulo{font-size:.88rem;padding:12px 13px}.titulo-confirmacion-modal__actions{grid-template-columns:1fr;gap:7px}.titulo-confirmacion-modal__actions .btn{min-height:39px!important}}',
      '@media(max-width:560px){.titulo-externo__sticky-nav{padding:6px 7px;gap:7px;margin-bottom:8px}.titulo-externo__sticky-nav .btn{min-width:0;flex:1;font-size:.75rem!important;padding:6px 8px!important}.titulo-externo__heading{gap:7px!important}.titulo-externo__heading h2{font-size:1.16rem!important}.titulo-externo-card{padding:11px 12px}.titulo-externo-card textarea{min-height:96px!important}.titulo-externo-card__footer{align-items:flex-start;flex-direction:column;gap:3px}.titulo-externo-card__estado{text-align:left}.prompt-institucional{padding:10px 11px}.prompt-institucional__top{grid-template-columns:1fr}.prompt-institucional__flow{gap:5px}.prompt-institucional__flow i{display:none}.prompt-institucional__flow span{font-size:.62rem;padding:3px 6px}.btn--prompt{width:100%!important}.ronda-recordatorio__acciones{display:grid;grid-template-columns:1fr 1fr}.ronda-recordatorio__acciones .btn{width:100%!important}}'
    ].join('');

    document.head.appendChild(style);
  }

  function contarPalabras(texto) {
    var limpio = limpiarTitulo(texto);
    return limpio ? limpio.split(/\s+/).filter(Boolean).length : 0;
  }

  function limpiarTitulo(texto) {
    return String(texto || '')
      .replace(/^\s*["“”'«»]+|["“”'«»]+\s*$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizarComparacion(texto) {
    return limpiarTitulo(texto)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function valor(selector) {
    var el = document.querySelector(selector);
    return el ? String(el.value || '').trim() : '';
  }

  function fallo(mensaje, selector) {
    return { ok: false, data: '', mensaje: mensaje, selector: selector || '' };
  }

  function copiarObjeto(objeto) {
    var copia = {};
    Object.keys(objeto || {}).forEach(function (key) { copia[key] = objeto[key]; });
    return copia;
  }

  function limpiar(texto) {
    return String(texto === undefined || texto === null ? '' : texto).replace(/\s+/g, ' ').trim();
  }

  function formatearFecha(fecha) {
    try {
      return new Intl.DateTimeFormat('es-EC', { day: '2-digit', month: 'long', year: 'numeric' }).format(fecha);
    } catch (e) {
      return fecha.toLocaleDateString();
    }
  }

  window.TATitulosExternos = Object.freeze({
    construirPrompt: construirPrompt,
    construirContinuacion: construirContinuacion,
    copiarPrompt: copiarPromptMaestro,
    transformarInterfaz: transformarInterfaz,
    habilitarTitulosEditables: habilitarTitulosEditables,
    validarTitulo: validarTituloPresente,
    actualizarEstados: actualizarTodosLosEstados
  });
})();