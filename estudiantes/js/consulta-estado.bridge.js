(function () {
  'use strict';

  var VERSION = '20261006-12';
  var TIMEOUT_MS = 6500;
  var READY_TIMEOUT_MS = 4500;
  var ORIGIN = window.location.origin;
  var iframe = null;
  var ready = false;
  var readyPromise = null;
  var pendientes = Object.create(null);
  var secuencia = 0;

  window.addEventListener('message', recibirMensaje);

  function consultar(datos) {
    datos = datos || {};
    var cedula = String(datos.cedula || '').replace(/\D/g, '');
    var periodoId = String(datos.periodoId || '').trim();

    if (!cedula || !periodoId) {
      return Promise.reject(new Error('Faltan cédula o período para consultar el estado del título.'));
    }

    return asegurarListo().then(function () {
      return new Promise(function (resolve, reject) {
        var requestId = 'ta-' + Date.now() + '-' + (++secuencia);
        var timer = window.setTimeout(function () {
          if (!pendientes[requestId]) return;
          delete pendientes[requestId];
          reject(new Error('El motor aislado de Títulos no respondió a tiempo.'));
        }, TIMEOUT_MS);

        pendientes[requestId] = {
          resolve: resolve,
          reject: reject,
          timer: timer
        };

        iframe.contentWindow.postMessage({
          type: 'TA_CONSULTA_ESTADO_REQUEST',
          requestId: requestId,
          cedula: cedula,
          periodoId: periodoId
        }, ORIGIN);
      });
    });
  }

  function asegurarListo() {
    if (ready && iframe && iframe.contentWindow) return Promise.resolve(true);
    if (readyPromise) return readyPromise;

    readyPromise = new Promise(function (resolve, reject) {
      var timer = window.setTimeout(function () {
        if (!ready) {
          readyPromise = null;
          reject(new Error('No se pudo iniciar el motor aislado de consulta de Títulos.'));
        }
      }, READY_TIMEOUT_MS);

      crearIframe();

      var check = window.setInterval(function () {
        if (ready) {
          window.clearInterval(check);
          window.clearTimeout(timer);
          readyPromise = null;
          resolve(true);
        }
      }, 40);
    });

    return readyPromise;
  }

  function crearIframe() {
    if (iframe && document.body.contains(iframe)) return iframe;

    iframe = document.createElement('iframe');
    iframe.id = 'taConsultaEstadoIframe';
    iframe.title = 'Motor aislado de consulta de títulos';
    iframe.setAttribute('aria-hidden', 'true');
    iframe.tabIndex = -1;
    iframe.style.position = 'fixed';
    iframe.style.width = '1px';
    iframe.style.height = '1px';
    iframe.style.border = '0';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';
    iframe.style.left = '-9999px';
    iframe.src = '../consulta-estado/index.html?embed=1&v=' + encodeURIComponent(VERSION);
    document.body.appendChild(iframe);
    return iframe;
  }

  function recibirMensaje(event) {
    var data = event.data || {};
    var pendiente;

    if (event.origin !== ORIGIN) return;
    if (!iframe || event.source !== iframe.contentWindow) return;

    if (data.type === 'TA_CONSULTA_ESTADO_READY') {
      ready = true;
      return;
    }

    if (data.type !== 'TA_CONSULTA_ESTADO_RESPONSE' || !data.requestId) return;

    pendiente = pendientes[data.requestId];
    if (!pendiente) return;

    window.clearTimeout(pendiente.timer);
    delete pendientes[data.requestId];

    if (data.ok === false) {
      var error = new Error(data.error && data.error.mensaje || 'No se pudo consultar el estado del título.');
      error.codigo = data.error && data.error.codigo || 'CONSULTA_AISLADA_ERROR';
      error.diagnostico = data.diagnostico || null;
      pendiente.reject(error);
      return;
    }

    pendiente.resolve(data);
  }

  function reiniciar() {
    ready = false;
    readyPromise = null;
    Object.keys(pendientes).forEach(function (key) {
      window.clearTimeout(pendientes[key].timer);
      pendientes[key].reject(new Error('Se reinició el motor aislado de consulta.'));
      delete pendientes[key];
    });
    if (iframe && iframe.parentNode) iframe.parentNode.removeChild(iframe);
    iframe = null;
  }

  window.TAConsultaEstadoBridge = Object.freeze({
    consultar: consultar,
    asegurarListo: asegurarListo,
    reiniciar: reiniciar,
    version: VERSION
  });
})();
