/*
  Flujo externo de formulación de títulos.
  - La app NO genera títulos con IA.
  - Genera un prompt institucional personalizado para que el estudiante lo use en la IA que prefiera.
  - El estudiante realiza 3 rondas externas y pega un título elegido por ronda.
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

  function transformarInterfaz() {
    transformarTitulo(1, 'Título 1', 'Ronda 1', true);
    transformarTitulo(2, 'Título 2', 'Ronda 2', false);
    transformarTitulo(3, 'Título 3', 'Ronda 3', false);
  }

  function transformarTitulo(numero, titulo, ronda, mostrarPrompt) {
    var section = document.querySelector('[data-step="propuesta' + numero + '"]');
    if (!section) return;

    var acciones = [
      '<div class="form-actions step-actions titulo-externo__nav">',
      '<button class="btn btn--ghost" type="button" data-action="prev">Regresar</button>',
      '<button class="btn btn--primary" type="button" data-action="next">Continuar</button>',
      '</div>'
    ].join('');

    var prompt = mostrarPrompt ? [
      '<article class="prompt-institucional">',
      '  <div class="prompt-institucional__top">',
      '    <div>',
      '      <span class="prompt-institucional__eyebrow">GUÍA ITSQMET + IA EXTERNA</span>',
      '      <h3>Genera tus tres títulos en la IA que prefieras</h3>',
      '      <p>La aplicación preparará un prompt con tu carrera y las reglas institucionales. Pégalo en ChatGPT, Gemini, Claude, Copilot, Kimi u otra IA.</p>',
      '    </div>',
      '    <button class="btn btn--prompt" type="button" id="btnCopiarPromptTitulos">Copiar prompt</button>',
      '  </div>',
      '  <div class="prompt-institucional__steps">',
      '    <span><b>1</b> Copia el prompt</span>',
      '    <span><b>2</b> Responde las preguntas de la IA</span>',
      '    <span><b>3</b> Elige 1 título en cada ronda</span>',
      '    <span><b>4</b> Pega aquí Título 1, 2 y 3</span>',
      '  </div>',
      '  <details class="prompt-institucional__preview">',
      '    <summary>Ver el prompt antes de copiar</summary>',
      '    <pre id="promptTitulosPreview"></pre>',
      '  </details>',
      '  <p class="prompt-institucional__status" id="promptTitulosEstado" role="status"></p>',
      '</article>'
    ].join('') : [
      '<article class="ronda-recordatorio">',
      '  <div class="ronda-recordatorio__numero">' + numero + '</div>',
      '  <div>',
      '    <strong>Continúa en la misma conversación con tu IA</strong>',
      '    <p>Completa la ' + ronda.toLowerCase() + ', elige una de las tres opciones nuevas y pega aquí únicamente el título seleccionado.</p>',
      '  </div>',
      '  <button class="btn btn--ghost btn--compact" type="button" data-copy-prompt="true">Copiar prompt otra vez</button>',
      '</article>'
    ].join('');

    section.innerHTML = [
      '<div class="section-heading titulo-externo__heading">',
      '  <p class="section-kicker">Paso ' + (numero + 3) + ' · ' + ronda + '</p>',
      '  <h2>' + titulo + '</h2>',
      '  <p>Pega el título que elegiste en la ' + ronda.toLowerCase() + '. Debe ser únicamente el título, sin explicaciones ni justificaciones.</p>',
      '</div>',
      prompt,
      '<article class="titulo-externo-card">',
      '  <div class="titulo-externo-card__badge">' + titulo.toUpperCase() + '</div>',
      '  <label for="p' + numero + 'Titulo">Título elegido en la ' + ronda.toLowerCase() + '</label>',
      '  <textarea id="p' + numero + 'Titulo" name="p' + numero + 'Titulo" rows="4" maxlength="320" placeholder="Pega aquí únicamente el título que elegiste en la IA."></textarea>',
      '  <div class="titulo-externo-card__meta">',
      '    <span>Ideal: 10 a 25 palabras</span>',
      '    <span>Máximo excepcional: 29 palabras</span>',
      '    <span>Un solo objeto central</span>',
      '  </div>',
      '</article>',
      acciones
    ].join('');

    if (mostrarPrompt) {
      var copiar = section.querySelector('#btnCopiarPromptTitulos');
      if (copiar) copiar.addEventListener('click', copiarPrompt);
      var details = section.querySelector('.prompt-institucional__preview');
      if (details) details.addEventListener('toggle', actualizarVistaPrompt);
    } else {
      var copiarOtra = section.querySelector('[data-copy-prompt="true"]');
      if (copiarOtra) copiarOtra.addEventListener('click', copiarPrompt);
    }
  }

  function construirPrompt() {
    var state = window.TAEstudianteState;
    var estado = state && typeof state.obtener === 'function' ? state.obtener() : {};
    var estudiante = estado && estado.estudiante ? estado.estudiante : {};
    var carrera = limpiar(estudiante.carrera || estudiante.nombreCarrera || 'la carrera registrada del estudiante');
    var periodo = limpiar(estudiante.periodoLabel || estudiante.periodo || estudiante.periodoId || estudiante.ultimoPeriodoId || 'el período académico registrado');
    var hoy = new Date();
    var fechaActual = formatearFecha(hoy);

    return [
      'ACTÚA COMO ASESOR METODOLÓGICO DE TITULACIÓN DEL ITSQMET.',
      '',
      'Datos académicos del estudiante:',
      '- Carrera: ' + carrera + '.',
      '- Período académico: ' + periodo + '.',
      '- Fecha actual: ' + fechaActual + '.',
      '- Tiempo aproximado disponible para desarrollar el trabajo: 1 mes.',
      '',
      'OBJETIVO',
      'Ayúdame a obtener tres títulos de titulación distintos, viables, claros, delimitados y directamente relacionados con mi carrera. Trabajaremos en TRES RONDAS. En cada ronda debes presentar exactamente TRES opciones nuevas y diferentes entre sí: una de diagnóstico/fase inicial, una de propuesta/fase de proceso y una de resultados/evaluación/fase final. Yo elegiré una opción de cada ronda. Al final tendré Título 1, Título 2 y Título 3 para registrarlos en mi aplicación institucional.',
      '',
      'ANTES DE PROPONER TÍTULOS',
      'Primero pregúntame la información que realmente necesitas. Debes preguntar si trabajo o realizo prácticas, en qué empresa/institución/área, qué actividad realizo, qué problema o necesidad observo, qué información puedo obtener y qué población, proceso, equipo, servicio, comunidad o contexto real tengo disponible. No inventes empresas, datos, poblaciones ni problemas.',
      'Si trabajo o realizo prácticas, prioriza ese contexto porque suele ser el más accesible, pero solo si el tema es viable y se relaciona con mi carrera. Si ese entorno no sirve o no tengo acceso suficiente a datos, pregúntame por OTRO contexto real y accesible relacionado con mi carrera y genera títulos sobre otra temática. No te quedes obligado al primer lugar o problema mencionado.',
      '',
      'REGLAS INSTITUCIONALES OBLIGATORIAS PARA TODOS LOS TÍTULOS',
      '1. Debe existir UNA sola acción principal: analizar, evaluar, diagnosticar, describir, identificar, diseñar o desarrollar. No acumules objetivos independientes.',
      '2. Debe existir UN solo objeto central o una sola variable principal. Evita estudios multivariables, relaciones complejas, varias causas y efectos o títulos que obliguen a ejecutar dos investigaciones.',
      '3. El título debe ser neutral. No anticipes resultados, conclusiones, mejoras, impactos positivos/negativos ni problemas que todavía no han sido demostrados.',
      '4. Delimita únicamente lo necesario: población o unidad de análisis, institución/empresa/comunidad/área, precisión técnica y período cuando correspondan.',
      '5. Si el fenómeno depende del tiempo, usa un período real con inicio y fin. Un año aislado NO sustituye el período.',
      '6. Si el año está en curso, nunca plantees como analizado todo el año. Usa únicamente meses o fechas cuyos datos ya puedan existir hasta la fecha actual.',
      '7. Un diagnóstico o un análisis de resultados solo puede referirse a información presente o pasada realmente disponible. No uses datos futuros como si ya existieran.',
      '8. Una propuesta, plan, modelo, diseño, estrategia o guía sí puede proyectarse hacia el futuro, siempre que el producto sea factible de desarrollar en aproximadamente un mes.',
      '9. Un título de resultados/evaluación/impacto debe estudiar algo que YA ocurrió o para lo cual ya existan datos. Si no hay resultados disponibles, formula una evaluación de un proceso pasado o pide otro contexto; no inventes impactos.',
      '10. Prioriza la VIABILIDAD. El trabajo debe poder completarse aproximadamente en un mes con información, recursos e instrumentos razonablemente accesibles.',
      '11. Reduce poblaciones grandes, sistemas demasiado amplios, múltiples componentes o productos simultáneos. No agregues una propuesta de mejora a un diagnóstico ni una evaluación de impacto a un diseño.',
      '12. Usa terminología propia de mi carrera. Descarta temas que pertenezcan principalmente a otra profesión.',
      '13. El título debe ser directo, sin frases decorativas ni explicaciones metodológicas innecesarias.',
      '14. Longitud ideal: 10 a 25 palabras. Puede superar 25 solo si es indispensable para delimitar correctamente, pero no debe superar 29 palabras.',
      '15. Antes de mostrar cada opción comprueba internamente: una acción, un objeto, neutralidad, período coherente, delimitación suficiente, relación con la carrera y factibilidad en un mes.',
      '',
      'DINÁMICA DE LAS 3 RONDAS',
      'RONDA 1:',
      '- Opción 1: diagnóstico / fase inicial.',
      '- Opción 2: propuesta, plan, modelo, diseño o mejora / fase de proceso.',
      '- Opción 3: resultados, evaluación o impacto / fase final, únicamente sobre hechos o datos ya existentes.',
      '- Las tres opciones deben estudiar temas realmente diferenciados cuando sea posible, aunque todos estén relacionados con mi carrera y con contextos a los que tenga acceso.',
      '- Después de presentarlas, DETENTE y pregúntame cuál elijo: 1, 2 o 3.',
      '- Cuando elija, repite únicamente el título elegido y dime: “Copia este como Título 1 en la aplicación”. No inicies la siguiente ronda hasta que yo confirme que ya lo copié.',
      '',
      'RONDA 2:',
      '- Genera tres títulos NUEVOS y diferentes a TODOS los de la ronda anterior.',
      '- Mantén otra vez la estructura: 1 diagnóstico, 1 propuesta/proceso y 1 resultados/evaluación.',
      '- No hagas simples reformulaciones del título seleccionado en la ronda 1. Busca alternativas temáticas distintas y viables relacionadas con mi carrera y mis contextos reales.',
      '- Después de mi elección, repite únicamente el elegido y dime: “Copia este como Título 2 en la aplicación”. Espera mi confirmación.',
      '',
      'RONDA 3:',
      '- Genera otras tres opciones NUEVAS, diferentes a las rondas 1 y 2.',
      '- Mantén: 1 diagnóstico, 1 propuesta/proceso y 1 resultados/evaluación.',
      '- Después de mi elección, repite únicamente el elegido y dime: “Copia este como Título 3 en la aplicación”.',
      '',
      'FORMATO DE RESPUESTA',
      '- No entregues las tres rondas de una sola vez.',
      '- Haz primero tus preguntas de contexto.',
      '- Luego ejecuta solo la ronda que corresponda.',
      '- En cada ronda presenta exactamente tres títulos numerados y debajo de cada uno una justificación de máximo una línea sobre su viabilidad. La justificación NO forma parte del título.',
      '- No continúes hasta recibir mi elección.',
      '',
      'Comienza ahora haciéndome las preguntas necesarias para conocer mi contexto real y formular la Ronda 1.'
    ].join('\n');
  }

  function copiarPrompt(event) {
    if (event && event.preventDefault) event.preventDefault();
    var prompt = construirPrompt();
    var status = document.querySelector('#promptTitulosEstado');

    copiarTexto(prompt).then(function () {
      if (status) status.textContent = 'Prompt copiado. Ahora pégalo en la IA que prefieras y responde sus preguntas.';
      actualizarVistaPrompt();
    }).catch(function () {
      if (status) status.textContent = 'No se pudo copiar automáticamente. Abre “Ver el prompt” y cópialo manualmente.';
      actualizarVistaPrompt();
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
      } catch (e) { reject(e); }
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
      return validarTitulo(numero, valor('#p' + numero + 'Titulo'));
    };

    copia.validarPropuestaDesdeObjeto = function (propuesta, numero) {
      numero = Number(numero || (propuesta && propuesta.numero) || 0);
      return validarTitulo(numero, propuesta && propuesta.tituloFinal);
    };

    copia.validarSugerenciaElegida = function (propuesta, numero) {
      return validarTitulo(Number(numero || (propuesta && propuesta.numero) || 0), propuesta && propuesta.tituloFinal);
    };

    copia.validarTituloAcademico = function (propuesta, numero) {
      return validarTitulo(Number(numero || (propuesta && propuesta.numero) || 0), propuesta && propuesta.tituloFinal);
    };

    copia.validarPaso = function (paso) {
      if (paso === 'contacto') return originalValidaciones.validarDatosContacto();
      if (paso === 'propuesta1') return validarTitulo(1, valor('#p1Titulo'));
      if (paso === 'propuesta2') return validarTitulo(2, valor('#p2Titulo'));
      if (paso === 'propuesta3') return validarTitulo(3, valor('#p3Titulo'));
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
        var resultado = validarTitulo(i + 1, formData.propuestas[i] && formData.propuestas[i].tituloFinal);
        if (!resultado.ok) return resultado;
        var clave = normalizarComparacion(formData.propuestas[i].tituloFinal);
        if (vistos[clave]) return fallo('Los tres títulos deben ser diferentes. Revisa el Título ' + (i + 1) + '.', '#p' + (i + 1) + 'Titulo');
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

  function validarTitulo(numero, texto) {
    numero = Number(numero || 0);
    var titulo = limpiarTitulo(texto);
    var selector = '#p' + numero + 'Titulo';
    var palabras = contarPalabras(titulo);

    if (!titulo) return fallo('Pega el Título ' + numero + ' que elegiste en la ronda ' + numero + '.', selector);
    if (palabras < 10) return fallo('El Título ' + numero + ' es demasiado corto. Debe tener al menos 10 palabras.', selector);
    if (palabras > 29) return fallo('El Título ' + numero + ' es demasiado largo. El máximo permitido es 29 palabras.', selector);
    if (/\b(justificaci[oó]n|explicaci[oó]n)\s*:/i.test(titulo)) return fallo('Pega únicamente el título, sin justificación ni explicación.', selector);
    if (/\n/.test(String(texto || ''))) return fallo('Pega únicamente una línea con el título seleccionado.', selector);

    return { ok: true, data: { numero: numero, tituloFinal: titulo, palabras: palabras }, mensaje: '', selector: '' };
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

  function ajustarResumen() {
    var resumen = document.querySelector('#resumenEnvio');
    if (!resumen) return;
    Array.prototype.forEach.call(resumen.querySelectorAll('strong'), function (strong) {
      strong.textContent = String(strong.textContent || '').replace(/^Propuesta\s+(\d+)/i, 'Título $1');
    });
    var heading = resumen.querySelector('h3');
    if (heading && /Elige el título/i.test(heading.textContent || '')) heading.textContent = 'Elige cuál de tus tres títulos prefieres';
  }

  function instalarEstilos() {
    if (document.getElementById('titulosExternosStyles')) return;
    var style = document.createElement('style');
    style.id = 'titulosExternosStyles';
    style.textContent = [
      '.student-hero__logo-wrap,.app-logo-wrap{background:linear-gradient(145deg,#102d50,#173b63)!important;border:1px solid rgba(226,184,77,.62)!important;box-shadow:0 10px 24px rgba(0,0,0,.18),inset 0 1px 0 rgba(255,255,255,.08)!important}',
      '.student-hero__logo,.app-logo{filter:drop-shadow(0 2px 2px rgba(0,0,0,.12))!important}',
      '.titulo-externo__heading{margin-bottom:14px!important}',
      '.prompt-institucional{border:1px solid #c9d9eb;border-radius:18px;background:linear-gradient(135deg,#f4f9ff 0%,#ffffff 58%,#fffaf0 100%);padding:20px;margin-bottom:16px;box-shadow:0 10px 26px rgba(11,31,58,.06)}',
      '.prompt-institucional__top{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:20px;align-items:center}',
      '.prompt-institucional__eyebrow{display:block;font-size:.67rem;font-weight:950;letter-spacing:.09em;color:#9a6b00;margin-bottom:4px}',
      '.prompt-institucional h3{margin:0 0 5px;color:#0b2d55;font-size:1.12rem}',
      '.prompt-institucional p{margin:0;color:#5c6d82;line-height:1.45}',
      '.btn--prompt{background:#0b5da7;color:#fff;box-shadow:0 8px 18px rgba(11,93,167,.18);white-space:nowrap}',
      '.prompt-institucional__steps{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:16px}',
      '.prompt-institucional__steps span{display:flex;align-items:center;gap:7px;padding:9px 10px;border:1px solid #dbe5ef;border-radius:11px;background:#fff;font-size:.74rem;font-weight:800;color:#314b66}',
      '.prompt-institucional__steps b{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;background:#0b5da7;color:#fff;flex:0 0 22px;font-size:.7rem}',
      '.prompt-institucional__preview{margin-top:13px;border-top:1px solid #dbe5ef;padding-top:10px}',
      '.prompt-institucional__preview summary{cursor:pointer;font-weight:850;color:#31587e;font-size:.8rem}',
      '.prompt-institucional__preview pre{white-space:pre-wrap;max-height:320px;overflow:auto;background:#071b34;color:#e8f1fa;border-radius:12px;padding:14px;font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;margin:10px 0 0}',
      '.prompt-institucional__status{margin-top:10px!important;color:#087443!important;font-weight:850!important;font-size:.8rem!important}',
      '.ronda-recordatorio{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:12px;align-items:center;padding:14px 16px;border:1px solid #cdddeb;border-radius:15px;background:#f7fbff;margin-bottom:14px}',
      '.ronda-recordatorio__numero{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;background:#0b5da7;color:#fff;font-weight:950}',
      '.ronda-recordatorio strong{display:block;color:#153654}',
      '.ronda-recordatorio p{margin:3px 0 0;color:#63758a;font-size:.82rem;line-height:1.35}',
      '.btn--compact{min-height:36px!important;padding:7px 11px!important;font-size:.76rem!important;width:auto!important}',
      '.titulo-externo-card{border:1px solid #b7cde2;border-radius:18px;background:#fff;padding:20px;box-shadow:0 8px 24px rgba(11,31,58,.05)}',
      '.titulo-externo-card__badge{display:inline-flex;padding:5px 9px;border-radius:999px;background:#e8f1fb;color:#0b4f8d;font-size:.68rem;font-weight:950;letter-spacing:.07em;margin-bottom:10px}',
      '.titulo-externo-card label{display:block;margin-bottom:7px;color:#102f50}',
      '.titulo-externo-card textarea{min-height:112px;font-size:1rem;line-height:1.45;background:#fbfdff}',
      '.titulo-externo-card__meta{display:flex;flex-wrap:wrap;gap:7px;margin-top:9px}',
      '.titulo-externo-card__meta span{padding:4px 7px;border-radius:999px;background:#f1f5f9;color:#5d6f82;font-size:.68rem;font-weight:800}',
      '.titulo-externo__nav{margin-top:14px!important}',
      '@media(max-width:800px){.prompt-institucional__top{grid-template-columns:1fr}.prompt-institucional__steps{grid-template-columns:1fr 1fr}.ronda-recordatorio{grid-template-columns:auto 1fr}.ronda-recordatorio .btn{grid-column:1/-1;width:100%!important}}',
      '@media(max-width:520px){.prompt-institucional{padding:15px}.prompt-institucional__steps{grid-template-columns:1fr}.titulo-externo-card{padding:15px}.titulo-externo-card textarea{min-height:132px}.student-hero__logo-wrap,.app-logo-wrap{background:linear-gradient(145deg,#102d50,#173b63)!important}}'
    ].join('');
    document.head.appendChild(style);
  }

  function contarPalabras(texto) {
    return limpiarTitulo(texto).split(/\s+/).filter(Boolean).length;
  }

  function limpiarTitulo(texto) {
    return String(texto || '').replace(/^\s*["“”'«»]+|["“”'«»]+\s*$/g, '').replace(/\s+/g, ' ').trim();
  }

  function normalizarComparacion(texto) {
    return limpiarTitulo(texto).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
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
    copiarPrompt: copiarPrompt,
    transformarInterfaz: transformarInterfaz,
    habilitarTitulosEditables: habilitarTitulosEditables,
    validarTitulo: validarTitulo
  });
})();