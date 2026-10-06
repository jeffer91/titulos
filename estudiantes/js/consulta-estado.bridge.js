(function () {
  'use strict';

  var VERSION = '20261006-13';
  var TIMEOUT_MS = 5600;
  var READY_TIMEOUT_MS = 4200;
  var ORIGIN = window.location.origin;
  var iframe = null;
  var ready = false;
  var readyPromise = null;
  var readyResolve = null;
  var readyReject = null;
  var readyTimer = null;
  var pendientes = Object.create(null);
  var secuencia = 0;

  window.addEventListener('message', recibirMensaje);

  function consultar(datos) {
    datos = datos || {};
    var cedula = String(datos.cedula || '').replace(/\D/g, '');
    var periodoId = String(datos.periodoId || '').trim();

    if (!cedula || !periodoId) {
      return Promise.reject(crearError('DATOS_INCOMPLETOS', 'Faltan cédula o período para consultar el estado del título.'));
    }

    return asegurarListo().then(function () {
      return new Promise(function (resolve, reject) {
        var requestId = 'ta-' + Date.now() + '-' + (++secuencia);
        var timer = window.setTimeout(function () {
          if (!pendientes[requestId]) return;
          delete pendientes[requestId];
          reject(crearError('BRIDGE_TIMEOUT', 'El motor aislado de Títulos no respondió a tiempo.'));
        }, TIMEOUT_MS);

        pendientes[requestId] = {
          resolve: resolve,
          reject: reject,
          timer: timer
        };

        if (!iframe || !iframe.contentWindow) {
          window.clearTimeout(timer);
          delete pendientes[requestId];
          reject(crearError('IFRAME_NO_DISPONIBLE', 'El motor aislado de Títulos no está disponible.'));
          return;
        }

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
      readyResolve = resolve;
      readyReject = reject;
      limpiarReadyTimer();

      readyTimer = window.setTimeout(function () {
        if (ready) return;
        fallarInicio(crearError('READY_TIMEOUT', 'No se pudo iniciar el motor aislado de consulta de Títulos.'));
      }, READY_TIMEOUT_MS);

      crearIframe();
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
    iframe.onload = function () {
      /* El READY del hijo confirma que sus scripts ya están operativos. */
    };
    iframe.onerror = function () {
      fallarInicio(crearError('IFRAME_LOAD_ERROR', 'No se pudo cargar el motor aislado de consulta de Títulos.'));
    };
    iframe.src = '../consulta-estado/index.html?embed=1&v=' + encodeURIComponent(VERSION) + '&cb=' + Date.now();
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
      limpiarReadyTimer();
      if (readyResolve) readyResolve(true);
      readyPromise = null;
      readyResolve = null;
      readyReject = null;
      return;
    }

    if (data.type !== 'TA_CONSULTA_ESTADO_RESPONSE' || !data.requestId) return;

    pendiente = pendientes[data.requestId];
    if (!pendiente) return;

    window.clearTimeout(pendiente.timer);
    delete pendientes[data.requestId];

    if (data.ok === false) {
      var error = crearError(
        data.error && data.error.codigo || 'CONSULTA_AISLADA_ERROR',
        data.error && data.error.mensaje || 'No se pudo consultar el estado del título.'
      );
      error.diagnostico = data.diagnostico || null;
      pendiente.reject(error);
      return;
    }

    pendiente.resolve(data);
  }

  function fallarInicio(error) {
    limpiarReadyTimer();
    ready = false;
    if (readyReject) readyReject(error);
    readyPromise = null;
    readyResolve = null;
    readyReject = null;
    destruirIframe();
  }

  function limpiarReadyTimer() {
    if (readyTimer) {
      window.clearTimeout(readyTimer);
      readyTimer = null;
    }
  }

  function destruirIframe() {
    if (iframe && iframe.parentNode) iframe.parentNode.removeChild(iframe);
    iframe = null;
  }

  function reiniciar() {
    ready = false;
    limpiarReadyTimer();
    if (readyReject) readyReject(crearError('REINICIO', 'Se reinició el motor aislado de consulta.'));
    readyPromise = null;
    readyResolve = null;
    readyReject = null;

    Object.keys(pendientes).forEach(function (key) {
      window.clearTimeout(pendientes[key].timer);
      pendientes[key].reject(crearError('REINICIO', 'Se reinició el motor aislado de consulta.'));
      delete pendientes[key];
    });

    destruirIframe();
  }

  function crearError(codigo, mensaje) {
    var error = new Error(mensaje || codigo || 'Error del motor aislado.');
    error.codigo = codigo || 'BRIDGE_ERROR';
    return error;
  }

  window.TAConsultaEstadoBridge = Object.freeze({
    consultar: consultar,
    asegurarListo: asegurarListo,
    reiniciar: reiniciar,
    version: VERSION
  });
})();
