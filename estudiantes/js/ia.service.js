/* Servicio de IA para sugerencias de títulos del módulo estudiantes. */
(function () {
  'use strict';

  var config = window.TA_ESTUDIANTES_CONFIG;
  var firebaseService = window.TAFirebaseService;

  var DEFAULT_TIMEOUT_MS = 30000;

  function generarSugerencias(params) {
    var estudiante = params.estudiante;
    var appConfig = params.appConfig || {};
    var propuesta = params.propuesta;
    var proveedor = normalizarProveedor(appConfig.proveedorIA || config.defaultAppConfig.proveedorIA || 'gemini');

    return cargarConfigProveedor(proveedor).then(function (iaConfig) {
      var validacion = validarConfigProveedor(proveedor, iaConfig);
      if (!validacion.ok) return Promise.reject(new Error(validacion.mensaje));

      var prompt = construirPrompt(estudiante, propuesta);

      return llamarProveedor(proveedor, iaConfig, prompt).then(function (texto) {
        var sugerencias = limpiarSugerencias(texto);
        if (!sugerencias.length) {
          throw new Error('La IA no devolvió títulos válidos. Intenta mejorar los datos de la propuesta.');
        }

        return {
          ok: true,
          proveedor: proveedor,
          model: iaConfig.model || iaConfig.modelo || '',
          prompt: prompt,
          textoOriginal: texto,
          sugerencias: sugerencias.slice(0, 3)
        };
      });
    });
  }

  function cargarConfigProveedor(proveedor) {
    if (!firebaseService || !firebaseService.estaListo()) {
      return Promise.reject(new Error('Firebase no está listo para leer la configuración de IA.'));
    }

    return firebaseService.leerDocumento(config.collections.ia, proveedor).then(function (iaConfig) {
      if (!iaConfig) {
        throw new Error('No existe configuración IA/' + proveedor + ' en Firebase.');
      }
      return iaConfig;
    });
  }

  function validarConfigProveedor(proveedor, iaConfig) {
    if (!iaConfig) return error('No se encontró configuración para el proveedor de IA.');
    if (iaConfig.activo === false) return error('El proveedor IA/' + proveedor + ' está desactivado.');
    if (!iaConfig.apiKey && !iaConfig.key) return error('Falta apiKey en IA/' + proveedor + '.');
    if (!obtenerModelo(proveedor, iaConfig)) return error('Falta model en IA/' + proveedor + '.');
    return ok();
  }

  function llamarProveedor(proveedor, iaConfig, prompt) {
    if (proveedor === 'gemini') return llamarGemini(iaConfig, prompt);
    if (proveedor === 'groq') return llamarChatCompatible(iaConfig, prompt, 'https://api.groq.com/openai/v1/chat/completions');
    if (proveedor === 'openrouter') return llamarOpenRouter(iaConfig, prompt);
    if (proveedor === 'mistral') return llamarChatCompatible(iaConfig, prompt, 'https://api.mistral.ai/v1/chat/completions');

    return Promise.reject(new Error('Proveedor de IA no soportado: ' + proveedor));
  }

  function llamarGemini(iaConfig, prompt) {
    var apiKey = iaConfig.apiKey || iaConfig.key;
    var model = obtenerModelo('gemini', iaConfig);
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(apiKey);

    return fetchConTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          temperature: Number(iaConfig.temperature || 0.35),
          maxOutputTokens: Number(iaConfig.maxOutputTokens || 900)
        }
      })
    }).then(function (response) {
      return response.json().then(function (data) {
        if (!response.ok) throw new Error(extraerErrorApi(data, 'Error al llamar Gemini.'));
        return extraerTextoGemini(data);
      });
    });
  }

  function llamarChatCompatible(iaConfig, prompt, url) {
    var apiKey = iaConfig.apiKey || iaConfig.key;
    var model = iaConfig.model || iaConfig.modelo;

    return fetchConTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        model: model,
        temperature: Number(iaConfig.temperature || 0.35),
        max_tokens: Number(iaConfig.maxTokens || iaConfig.maxOutputTokens || 900),
        messages: [
          { role: 'system', content: 'Eres un tutor académico experto en formulación de títulos de artículos académicos cortos.' },
          { role: 'user', content: prompt }
        ]
      })
    }).then(function (response) {
      return response.json().then(function (data) {
        if (!response.ok) throw new Error(extraerErrorApi(data, 'Error al llamar proveedor IA.'));
        return extraerTextoChatCompatible(data);
      });
    });
  }

  function llamarOpenRouter(iaConfig, prompt) {
    var apiKey = iaConfig.apiKey || iaConfig.key;
    var model = iaConfig.model || iaConfig.modelo;

    return fetchConTimeout('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
        'HTTP-Referer': window.location.href,
        'X-Title': 'Títulos estudiantes'
      },
      body: JSON.stringify({
        model: model,
        temperature: Number(iaConfig.temperature || 0.35),
        max_tokens: Number(iaConfig.maxTokens || iaConfig.maxOutputTokens || 900),
        messages: [
          { role: 'system', content: 'Eres un tutor académico experto en formulación de títulos de artículos académicos cortos.' },
          { role: 'user', content: prompt }
        ]
      })
    }).then(function (response) {
      return response.json().then(function (data) {
        if (!response.ok) throw new Error(extraerErrorApi(data, 'Error al llamar OpenRouter.'));
        return extraerTextoChatCompatible(data);
      });
    });
  }

  function construirPrompt(estudiante, propuesta) {
    var carrera = estudiante && (estudiante.carrera || estudiante.nombreCarrera) ? estudiante.carrera || estudiante.nombreCarrera : 'Carrera no especificada';

    return [
      'Actúa como tutor académico experto en títulos de artículos.',
      'Debes generar exactamente 3 títulos académicos para una propuesta de estudiante.',
      'Los títulos deben ser naturales, claros, viables para un artículo corto, sin comillas y sin numeración innecesaria.',
      'No inventes datos fuera de la información proporcionada.',
      'Evita títulos demasiado largos, frases sueltas o lenguaje informal.',
      '',
      'Carrera: ' + carrera,
      'Tema general: ' + (propuesta.temaGeneral || ''),
      'Problema o necesidad: ' + (propuesta.problemaNecesidad || ''),
      'Lugar o contexto: ' + (propuesta.lugarContexto || ''),
      'Grupo de estudio: ' + (propuesta.grupoEstudio || ''),
      'Año o período: ' + (propuesta.anioPeriodo || ''),
      'Objetivo simple: ' + (propuesta.objetivo || ''),
      '',
      'Responde únicamente con 3 títulos, uno por línea.'
    ].join('\n');
  }

  function limpiarSugerencias(texto) {
    return String(texto || '')
      .split('\n')
      .map(function (linea) {
        return linea
          .replace(/^\s*[-*•]\s*/g, '')
          .replace(/^\s*\d+[).:-]\s*/g, '')
          .replace(/^\s*["“”'«»]+|["“”'«»]+\s*$/g, '')
          .replace(/\s+/g, ' ')
          .trim();
      })
      .filter(function (linea) {
        return linea.length >= 20;
      })
      .filter(function (linea, index, array) {
        return array.indexOf(linea) === index;
      });
  }

  function extraerTextoGemini(data) {
    var parts = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
    if (!Array.isArray(parts)) return '';
    return parts.map(function (part) { return part.text || ''; }).join('\n').trim();
  }

  function extraerTextoChatCompatible(data) {
    return data && data.choices && data.choices[0] && data.choices[0].message
      ? String(data.choices[0].message.content || '').trim()
      : '';
  }

  function fetchConTimeout(url, options) {
    var timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);
    var controller = window.AbortController ? new AbortController() : null;
    var timer = null;
    var finalOptions = Object.assign({}, options || {});
    delete finalOptions.timeoutMs;

    if (controller) {
      finalOptions.signal = controller.signal;
      timer = window.setTimeout(function () {
        controller.abort();
      }, timeoutMs);
    }

    return fetch(url, finalOptions).finally(function () {
      if (timer) window.clearTimeout(timer);
    });
  }

  function obtenerModelo(proveedor, iaConfig) {
    if (iaConfig.model || iaConfig.modelo) return iaConfig.model || iaConfig.modelo;
    if (proveedor === 'gemini') return 'gemini-1.5-flash';
    if (proveedor === 'groq') return 'llama-3.1-8b-instant';
    if (proveedor === 'openrouter') return 'google/gemini-flash-1.5';
    if (proveedor === 'mistral') return 'mistral-small-latest';
    return '';
  }

  function extraerErrorApi(data, fallback) {
    if (data && data.error && data.error.message) return data.error.message;
    if (data && data.message) return data.message;
    return fallback;
  }

  function normalizarProveedor(proveedor) {
    return String(proveedor || '').trim().toLowerCase();
  }

  function ok() {
    return { ok: true, mensaje: '' };
  }

  function error(mensaje) {
    return { ok: false, mensaje: mensaje };
  }

  window.TAEstudianteIA = Object.freeze({
    generarSugerencias: generarSugerencias,
    construirPrompt: construirPrompt,
    limpiarSugerencias: limpiarSugerencias
  });
})();
