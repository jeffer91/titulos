/*
  Archivo: ia.providers.service.js
  Ruta: estudiantes/js/ia.providers.service.js
  Funciones principales del archivo:
  - Centralizar las llamadas técnicas a proveedores de IA.
  - Soportar Google Gemini API, GroqCloud, OpenRouter Free Models y Cloudflare Workers AI.
  - Validar configuración mínima de cada proveedor antes de llamarlo.
  - Normalizar modelo, endpoint, nombre visible y errores técnicos.
  - Devolver texto limpio al orquestador de IA.
*/
(function () {
  'use strict';

  var DEFAULT_TIMEOUT_MS = 30000;

  var PROVEEDORES_BASE = Object.freeze({
    gemini: Object.freeze({
      id: 'gemini',
      nombre: 'Google Gemini API',
      modeloDefault: 'gemini-1.5-flash-latest',
      endpointDefault: ''
    }),
    groq: Object.freeze({
      id: 'groq',
      nombre: 'GroqCloud',
      modeloDefault: 'llama-3.1-8b-instant',
      endpointDefault: 'https://api.groq.com/openai/v1/chat/completions'
    }),
    openrouter: Object.freeze({
      id: 'openrouter',
      nombre: 'OpenRouter Free Models',
      modeloDefault: 'meta-llama/llama-3.1-8b-instruct:free',
      endpointDefault: 'https://openrouter.ai/api/v1/chat/completions'
    }),
    cloudflare: Object.freeze({
      id: 'cloudflare',
      nombre: 'Cloudflare Workers AI',
      modeloDefault: '@cf/meta/llama-3.1-8b-instruct',
      endpointDefault: ''
    })
  });

  function llamar(providerId, iaConfig, prompt, opciones) {
    providerId = normalizarProveedor(providerId);
    iaConfig = iaConfig || {};
    opciones = opciones || {};

    var validacion = validarConfig(providerId, iaConfig);

    if (!validacion.ok) {
      return Promise.reject(new Error(validacion.mensaje));
    }

    if (providerId === 'gemini') {
      return llamarGemini(iaConfig, prompt, opciones);
    }

    if (providerId === 'groq') {
      return llamarChatCompatible(providerId, iaConfig, prompt, opciones);
    }

    if (providerId === 'openrouter') {
      return llamarOpenRouter(iaConfig, prompt, opciones);
    }

    if (providerId === 'cloudflare') {
      return llamarCloudflare(iaConfig, prompt, opciones);
    }

    return Promise.reject(new Error('Proveedor de IA no soportado: ' + providerId));
  }

  function llamarGemini(iaConfig, prompt, opciones) {
    var apiKey = obtenerApiKey(iaConfig);
    var model = obtenerModelo('gemini', iaConfig);
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
      encodeURIComponent(model) +
      ':generateContent?key=' +
      encodeURIComponent(apiKey);

    return fetchConTimeout(url, {
      method: 'POST',
      timeoutMs: obtenerTimeout(opciones),
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: prompt
              }
            ]
          }
        ],
        generationConfig: {
          temperature: obtenerTemperature(iaConfig),
          maxOutputTokens: obtenerMaxTokens(iaConfig)
        }
      })
    })
      .then(function (response) {
        return leerJsonSeguro(response).then(function (data) {
          if (!response.ok) {
            throw new Error(extraerErrorApi(data, 'Error al llamar Google Gemini API.'));
          }

          return asegurarTexto(extraerTextoGemini(data), 'Google Gemini API no devolvió texto.');
        });
      });
  }

  function llamarChatCompatible(providerId, iaConfig, prompt, opciones) {
    var apiKey = obtenerApiKey(iaConfig);
    var model = obtenerModelo(providerId, iaConfig);
    var endpoint = obtenerEndpoint(providerId, iaConfig);
    var nombre = obtenerNombre(providerId, iaConfig);

    return fetchConTimeout(endpoint, {
      method: 'POST',
      timeoutMs: obtenerTimeout(opciones),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        model: model,
        temperature: obtenerTemperature(iaConfig),
        max_tokens: obtenerMaxTokens(iaConfig),
        messages: [
          {
            role: 'system',
            content: 'Eres un experto en redacción de títulos académicos para artículos científicos de nivel tecnológico superior. Responde con precisión, sin inventar datos y sin texto innecesario.'
          },
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    })
      .then(function (response) {
        return leerJsonSeguro(response).then(function (data) {
          if (!response.ok) {
            throw new Error(extraerErrorApi(data, 'Error al llamar ' + nombre + '.'));
          }

          return asegurarTexto(extraerTextoChatCompatible(data), nombre + ' no devolvió texto.');
        });
      });
  }

  function llamarOpenRouter(iaConfig, prompt, opciones) {
    var apiKey = obtenerApiKey(iaConfig);
    var model = obtenerModelo('openrouter', iaConfig);
    var endpoint = obtenerEndpoint('openrouter', iaConfig);

    return fetchConTimeout(endpoint, {
      method: 'POST',
      timeoutMs: obtenerTimeout(opciones),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
        'HTTP-Referer': window.location.href,
        'X-Title': 'Sistema de Títulos Académicos'
      },
      body: JSON.stringify({
        model: model,
        temperature: obtenerTemperature(iaConfig),
        max_tokens: obtenerMaxTokens(iaConfig),
        messages: [
          {
            role: 'system',
            content: 'Eres un experto en redacción de títulos académicos para artículos científicos de nivel tecnológico superior. Responde con precisión, sin inventar datos y sin texto innecesario.'
          },
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    })
      .then(function (response) {
        return leerJsonSeguro(response).then(function (data) {
          if (!response.ok) {
            throw new Error(extraerErrorApi(data, 'Error al llamar OpenRouter Free Models.'));
          }

          return asegurarTexto(extraerTextoChatCompatible(data), 'OpenRouter Free Models no devolvió texto.');
        });
      });
  }

  function llamarCloudflare(iaConfig, prompt, opciones) {
    var apiKey = obtenerApiKey(iaConfig);
    var model = obtenerModelo('cloudflare', iaConfig);
    var endpoint = obtenerEndpointCloudflare(iaConfig);
    var url = construirUrlCloudflare(endpoint, model);

    return fetchConTimeout(url, {
      method: 'POST',
      timeoutMs: obtenerTimeout(opciones),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: 'Eres un experto en redacción de títulos académicos para artículos científicos de nivel tecnológico superior. Responde con precisión, sin inventar datos y sin texto innecesario.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: obtenerTemperature(iaConfig),
        max_tokens: obtenerMaxTokens(iaConfig)
      })
    })
      .then(function (response) {
        return leerJsonSeguro(response).then(function (data) {
          if (!response.ok || data.success === false) {
            throw new Error(extraerErrorApi(data, 'Error al llamar Cloudflare Workers AI.'));
          }

          return asegurarTexto(extraerTextoCloudflare(data), 'Cloudflare Workers AI no devolvió texto.');
        });
      });
  }

  function validarConfig(providerId, iaConfig) {
    providerId = normalizarProveedor(providerId);
    iaConfig = iaConfig || {};

    if (!PROVEEDORES_BASE[providerId]) {
      return error('Proveedor de IA no reconocido: ' + providerId);
    }

    if (iaConfig.activo === false) {
      return error(obtenerNombre(providerId, iaConfig) + ' está desactivado.');
    }

    if (!obtenerApiKey(iaConfig)) {
      return error('Falta API Key o token para ' + obtenerNombre(providerId, iaConfig) + '.');
    }

    if (!obtenerModelo(providerId, iaConfig)) {
      return error('Falta modelo para ' + obtenerNombre(providerId, iaConfig) + '.');
    }

    if (providerId !== 'gemini' && !obtenerEndpoint(providerId, iaConfig)) {
      return error('Falta endpoint o Account ID para ' + obtenerNombre(providerId, iaConfig) + '.');
    }

    return ok();
  }

  function fetchConTimeout(url, options) {
    options = options || {};

    var timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);
    var controller = window.AbortController ? new AbortController() : null;
    var timer = null;
    var finalOptions = Object.assign({}, options);

    delete finalOptions.timeoutMs;

    if (controller) {
      finalOptions.signal = controller.signal;
      timer = window.setTimeout(function () {
        controller.abort();
      }, timeoutMs);
    }

    return fetch(url, finalOptions).finally(function () {
      if (timer) {
        window.clearTimeout(timer);
      }
    });
  }

  function leerJsonSeguro(response) {
    return response.json().catch(function () {
      return {};
    });
  }

  function extraerTextoGemini(data) {
    var parts = data &&
      data.candidates &&
      data.candidates[0] &&
      data.candidates[0].content &&
      data.candidates[0].content.parts;

    if (!Array.isArray(parts)) {
      return '';
    }

    return parts.map(function (part) {
      return part && part.text ? part.text : '';
    }).join('\n').trim();
  }

  function extraerTextoChatCompatible(data) {
    if (data && data.choices && data.choices[0] && data.choices[0].message) {
      return limpiarTexto(data.choices[0].message.content);
    }

    if (data && data.choices && data.choices[0] && data.choices[0].text) {
      return limpiarTexto(data.choices[0].text);
    }

    return '';
  }

  function extraerTextoCloudflare(data) {
    if (data && data.result && typeof data.result.response === 'string') {
      return limpiarTexto(data.result.response);
    }

    if (data && data.result && typeof data.result.text === 'string') {
      return limpiarTexto(data.result.text);
    }

    if (
      data &&
      data.result &&
      data.result.choices &&
      data.result.choices[0] &&
      data.result.choices[0].message
    ) {
      return limpiarTexto(data.result.choices[0].message.content);
    }

    if (typeof data === 'string') {
      return limpiarTexto(data);
    }

    return '';
  }

  function asegurarTexto(texto, mensaje) {
    texto = limpiarTexto(texto);

    if (!texto) {
      throw new Error(mensaje || 'El proveedor IA no devolvió texto.');
    }

    return texto;
  }

  function extraerErrorApi(data, fallback) {
    if (data && data.error && data.error.message) {
      return data.error.message;
    }

    if (data && data.error && typeof data.error === 'string') {
      return data.error;
    }

    if (data && data.errors && data.errors[0] && data.errors[0].message) {
      return data.errors[0].message;
    }

    if (data && data.message) {
      return data.message;
    }

    return fallback;
  }

  function construirUrlCloudflare(endpoint, model) {
    endpoint = limpiarTexto(endpoint);
    model = limpiarTexto(model).replace(/^\/+/, '');

    if (/^https?:\/\//i.test(endpoint)) {
      if (endpoint.indexOf('/ai/run/') !== -1) {
        return endpoint;
      }

      return endpoint.replace(/\/+$/g, '') + '/ai/run/' + model;
    }

    return 'https://api.cloudflare.com/client/v4/accounts/' +
      encodeURIComponent(endpoint) +
      '/ai/run/' +
      model;
  }

  function obtenerApiKey(iaConfig) {
    return limpiarTexto(
      iaConfig.apiKey ||
      iaConfig.key ||
      iaConfig.token ||
      iaConfig.bearerToken ||
      ''
    );
  }

  function obtenerModelo(providerId, iaConfig) {
    providerId = normalizarProveedor(providerId);
    iaConfig = iaConfig || {};

    return limpiarTexto(
      iaConfig.modelo ||
      iaConfig.model ||
      iaConfig.modeloIA ||
      (PROVEEDORES_BASE[providerId] && PROVEEDORES_BASE[providerId].modeloDefault) ||
      ''
    );
  }

  function obtenerEndpoint(providerId, iaConfig) {
    providerId = normalizarProveedor(providerId);
    iaConfig = iaConfig || {};

    if (providerId === 'cloudflare') {
      return obtenerEndpointCloudflare(iaConfig);
    }

    return limpiarTexto(
      iaConfig.endpoint ||
      iaConfig.url ||
      iaConfig.baseUrl ||
      (PROVEEDORES_BASE[providerId] && PROVEEDORES_BASE[providerId].endpointDefault) ||
      ''
    );
  }

  function obtenerEndpointCloudflare(iaConfig) {
    iaConfig = iaConfig || {};

    return limpiarTexto(
      iaConfig.endpoint ||
      iaConfig.accountId ||
      iaConfig.accountID ||
      iaConfig.account ||
      iaConfig.url ||
      ''
    );
  }

  function obtenerNombre(providerId, iaConfig) {
    providerId = normalizarProveedor(providerId);
    iaConfig = iaConfig || {};

    return limpiarTexto(
      iaConfig.nombre ||
      iaConfig.label ||
      (PROVEEDORES_BASE[providerId] && PROVEEDORES_BASE[providerId].nombre) ||
      providerId
    );
  }

  function obtenerTemperature(iaConfig) {
    var value = Number(iaConfig.temperature);

    if (Number.isFinite(value)) {
      return value;
    }

    return 0.25;
  }

  function obtenerMaxTokens(iaConfig) {
    var value = Number(
      iaConfig.maxTokens ||
      iaConfig.maxOutputTokens ||
      iaConfig.tokens ||
      650
    );

    if (Number.isFinite(value) && value > 0) {
      return value;
    }

    return 650;
  }

  function obtenerTimeout(opciones) {
    var value = Number(opciones && opciones.timeoutMs);

    if (Number.isFinite(value) && value >= 5000) {
      return value;
    }

    return DEFAULT_TIMEOUT_MS;
  }

  function obtenerProveedorBase(providerId) {
    providerId = normalizarProveedor(providerId);
    return PROVEEDORES_BASE[providerId] || null;
  }

  function normalizarProveedor(providerId) {
    return limpiarTexto(providerId).toLowerCase();
  }

  function limpiarTexto(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function ok() {
    return {
      ok: true,
      mensaje: ''
    };
  }

  function error(mensaje) {
    return {
      ok: false,
      mensaje: mensaje
    };
  }

  window.TAIAProviders = Object.freeze({
    llamar: llamar,
    validarConfig: validarConfig,
    obtenerApiKey: obtenerApiKey,
    obtenerModelo: obtenerModelo,
    obtenerEndpoint: obtenerEndpoint,
    obtenerNombre: obtenerNombre,
    obtenerProveedorBase: obtenerProveedorBase,
    proveedoresBase: PROVEEDORES_BASE
  });
})();