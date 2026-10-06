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
      '  <p class="section-kicker">Paso ' + (numero + 3) + ' · ' + ronda + '</p>',
      '  <h2>' + titulo + '</h2>',
      '  <p>Pega aquí el título que elegiste en la ' + ronda.toLowerCase() + '. Puedes editarlo libremente antes de continuar.</p>',
      '</div>',
      '<article class="titulo-externo-card titulo-externo-card--principal">',
      '  <div class="titulo-externo-card__badge">' + titulo.toUpperCase() + ' ELEGIDO</div>',
      '  <label for="p' + numero + 'Titulo">Título elegido en la ' + ronda.toLowerCase() + '</label>',
      '  <textarea id="p' + numero + 'Titulo" name="p' + numero + 'Titulo" rows="4" maxlength="360" placeholder="Pega aquí únicamente el título que elegiste en la IA."></textarea>',
      '  <div class="titulo-externo-card__footer">',
      '    <span class="titulo-externo-card__contador" id="p' + numero + 'Contador">0 palabras</span>',
      '    <span class="titulo-externo-card__estado" id="p' + numero + 'Estado">Pega un título para habilitar Continuar.</span>',
      '  </div>',
      '  <div class="titulo-externo-card__meta">',
      '    <span>Referencia: 10 a 25 palabras</span>',
      '    <span>Una sola finalidad principal</span>',
      '    <span>Un solo objeto o variable</span>',
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
      '      <span class="prompt-institucional__eyebrow">AYUDA OPCIONAL · IA EXTERNA</span>',
      '      <h3>¿Todavía no tienes tus títulos?</h3>',
      '      <p>Copia este prompt y pégalo en la IA que prefieras. La IA te hará preguntas sencillas, una por una, y te acompañará durante las tres rondas.</p>',
      '    </div>',
      '    <button class="btn btn--prompt" type="button" id="btnCopiarPromptTitulos">Copiar prompt maestro</button>',
      '  </div>',
      '  <div class="prompt-institucional__steps">',
      '    <span><b>1</b> Copia el prompt</span>',
      '    <span><b>2</b> Responde una pregunta a la vez</span>',
      '    <span><b>3</b> Elige 1 de 3 títulos por ronda</span>',
      '    <span><b>4</b> Pega cada elegido en la app</span>',
      '  </div>',
      '  <details class="prompt-institucional__preview">',
      '    <summary>Ver el prompt antes de copiar</summary>',
      '    <pre id="promptTitulosPreview"></pre>',
      '  </details>',
      '  <p class="prompt-institucional__status" id="promptTitulosEstado" role="status"></p>',
      '</article>'
    ].join('');
  }

  function construirAyudaContinuacion(numero) {
    return [
      '<article class="ronda-recordatorio">',
      '  <div class="ronda-recordatorio__numero">' + numero + '</div>',
      '  <div>',
      '    <strong>Continúa en la misma conversación con tu IA</strong>',
      '    <p>Si la IA perdió el hilo, copia la instrucción corta de esta ronda. Debe darte tres títulos nuevos: diagnóstico, propuesta y resultados.</p>',
      '  </div>',
      '  <div class="ronda-recordatorio__acciones">',
      '    <button class="btn btn--secondary btn--compact" type="button" data-copy-continuacion="' + numero + '">Copiar instrucción Ronda ' + numero + '</button>',
      '    <button class="btn btn--ghost btn--compact" type="button" data-copy-maestro="true">Copiar prompt maestro</button>',
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

    window.TAEstudianteFormularioController = Object.freeze(copia);
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
      'body.ta-premium .student-hero__logo,body.ta-premium .app-logo{background:linear-gradient(145deg,#dce9f5 0%,#edf5fb 100%)!important;border:1px solid rgba(215,165,29,.78)!important;box-shadow:0 10px 26px rgba(0,0,0,.14),inset 0 1px 0 rgba(255,255,255,.9)!important}',
      '.titulo-externo__sticky-nav{position:sticky;top:10px;z-index:35;display:flex;align-items:center;justify-content:space-between;gap:12px;margin:-4px 0 18px;padding:10px 12px;border:1px solid rgba(196,211,227,.92);border-radius:14px;background:rgba(255,255,255,.94);box-shadow:0 10px 26px rgba(7,31,61,.12);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}',
      '.titulo-externo__sticky-nav .btn{width:auto!important;min-width:132px;min-height:40px!important;padding:8px 14px!important}',
      '.titulo-externo__sticky-nav .btn:disabled{opacity:.5;cursor:not-allowed;box-shadow:none!important}',
      '.titulo-externo__heading{margin-bottom:14px!important}',
      '.titulo-externo-card{border:1px solid #aec7df;border-radius:18px;background:linear-gradient(180deg,#ffffff,#fbfdff);padding:20px;box-shadow:0 10px 28px rgba(11,31,58,.07);margin-bottom:16px}',
      '.titulo-externo-card--principal{border-top:4px solid #0b5da7}',
      '.titulo-externo-card__badge{display:inline-flex;padding:5px 9px;border-radius:999px;background:#e7f1fb;color:#0b4f8d;font-size:.68rem;font-weight:950;letter-spacing:.07em;margin-bottom:10px}',
      '.titulo-externo-card label{display:block;margin-bottom:7px;color:#102f50;font-size:.95rem}',
      '.titulo-externo-card textarea{min-height:118px;font-size:1rem;line-height:1.48;background:#fff;border-color:#b9cadb}',
      '.titulo-externo-card textarea.is-ready{border-color:#57a77d;box-shadow:0 0 0 3px rgba(10,137,88,.08)}',
      '.titulo-externo-card__footer{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:9px;padding-top:8px;border-top:1px solid #e5edf5}',
      '.titulo-externo-card__contador{font-size:.72rem;font-weight:900;color:#49647f}',
      '.titulo-externo-card__estado{font-size:.72rem;font-weight:850;color:#8a5a00;text-align:right}',
      '.titulo-externo-card__estado.is-ready{color:#087443}',
      '.titulo-externo-card__meta{display:flex;flex-wrap:wrap;gap:7px;margin-top:9px}',
      '.titulo-externo-card__meta span{padding:4px 7px;border-radius:999px;background:#f1f5f9;color:#5d6f82;font-size:.68rem;font-weight:800}',
      '.prompt-institucional{border:1px solid #c9d9eb;border-radius:18px;background:linear-gradient(135deg,#f4f9ff 0%,#ffffff 58%,#fffaf0 100%);padding:20px;margin-top:8px;box-shadow:0 10px 26px rgba(11,31,58,.05)}',
      '.prompt-institucional__top{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:20px;align-items:center}',
      '.prompt-institucional__eyebrow{display:block;font-size:.67rem;font-weight:950;letter-spacing:.09em;color:#9a6b00;margin-bottom:4px}',
      '.prompt-institucional h3{margin:0 0 5px;color:#0b2d55;font-size:1.08rem}',
      '.prompt-institucional p{margin:0;color:#5c6d82;line-height:1.45}',
      '.btn--prompt{background:#0b5da7;color:#fff;box-shadow:0 8px 18px rgba(11,93,167,.18);white-space:nowrap}',
      '.prompt-institucional__steps{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:16px}',
      '.prompt-institucional__steps span{display:flex;align-items:center;gap:7px;padding:9px 10px;border:1px solid #dbe5ef;border-radius:11px;background:#fff;font-size:.74rem;font-weight:800;color:#314b66}',
      '.prompt-institucional__steps b{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;background:#0b5da7;color:#fff;flex:0 0 22px;font-size:.7rem}',
      '.prompt-institucional__preview{margin-top:13px;border-top:1px solid #dbe5ef;padding-top:10px}',
      '.prompt-institucional__preview summary{cursor:pointer;font-weight:850;color:#31587e;font-size:.8rem}',
      '.prompt-institucional__preview pre{white-space:pre-wrap;max-height:360px;overflow:auto;background:#071b34;color:#e8f1fa;border-radius:12px;padding:14px;font:12px/1.48 ui-monospace,SFMono-Regular,Menlo,monospace;margin:10px 0 0}',
      '.prompt-institucional__status{margin-top:10px!important;color:#087443!important;font-weight:850!important;font-size:.8rem!important}',
      '.ronda-recordatorio{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:12px;align-items:center;padding:14px 16px;border:1px solid #cdddeb;border-radius:15px;background:#f7fbff;margin-top:8px}',
      '.ronda-recordatorio__numero{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;background:#0b5da7;color:#fff;font-weight:950}',
      '.ronda-recordatorio strong{display:block;color:#153654}',
      '.ronda-recordatorio p{margin:3px 0 0;color:#63758a;font-size:.82rem;line-height:1.35}',
      '.ronda-recordatorio__acciones{display:flex;flex-direction:column;gap:7px;align-items:stretch}',
      '.ronda-recordatorio__status{grid-column:2/-1;margin:0!important;color:#087443!important;font-size:.76rem!important;font-weight:850!important}',
      '.btn--compact{min-height:36px!important;padding:7px 11px!important;font-size:.74rem!important;width:auto!important}',
      '@media(max-width:800px){.prompt-institucional__top{grid-template-columns:1fr}.prompt-institucional__steps{grid-template-columns:1fr 1fr}.ronda-recordatorio{grid-template-columns:auto 1fr}.ronda-recordatorio__acciones{grid-column:1/-1;flex-direction:row}.ronda-recordatorio__acciones .btn{flex:1}.ronda-recordatorio__status{grid-column:1/-1}.titulo-externo__sticky-nav{top:6px}}',
      '@media(max-width:560px){.titulo-externo__sticky-nav{padding:8px;gap:8px}.titulo-externo__sticky-nav .btn{min-width:0;flex:1;font-size:.78rem!important;padding:8px 9px!important}.titulo-externo-card{padding:15px}.titulo-externo-card textarea{min-height:136px}.titulo-externo-card__footer{align-items:flex-start;flex-direction:column}.titulo-externo-card__estado{text-align:left}.prompt-institucional{padding:15px}.prompt-institucional__steps{grid-template-columns:1fr}.ronda-recordatorio__acciones{flex-direction:column}.ronda-recordatorio__acciones .btn{width:100%!important}body.ta-premium .student-hero__logo,body.ta-premium .app-logo{background:linear-gradient(145deg,#dce9f5,#edf5fb)!important}}'
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