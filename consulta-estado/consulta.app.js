(function () {
  'use strict';

  var service = window.TAConsultaEstadoService;
  var EMBED = new URLSearchParams(window.location.search).get('embed') === '1';
  var TARGET_ORIGIN = window.location.origin;
  var VERSION = '20261007-45';

  document.addEventListener('DOMContentLoaded', iniciar);

  function iniciar() {
    if (!service || typeof service.consultar !== 'function') {
      mostrarError('El motor de consulta no está disponible.');
      return;
    }

    if (EMBED) {
      document.documentElement.classList.add('is-embed');
      document.body.classList.add('is-embed');
    }

    conectarFormulario();
    conectarMensajes();
    notificarListo();
  }

  function conectarFormulario() {
    var form = document.querySelector('#consultaEstadoForm');
    if (!form) return;

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var cedula = obtenerValor('#cedula');
      var periodo = obtenerValor('#periodo');
      ejecutarConsulta(periodo, cedula, null);
    });
  }

  function conectarMensajes() {
    window.addEventListener('message', function (event) {
      var data = event.data || {};
      if (event.origin !== TARGET_ORIGIN) return;
      if (event.source !== window.parent) return;
      if (data.type !== 'TA_CONSULTA_ESTADO_REQUEST') return;

      ejecutarConsulta(data.periodoId, data.cedula, data.requestId || '');
    });
  }

  function ejecutarConsulta(periodoId, cedula, requestId) {
    var inicio = Date.now();
    mostrarEstado('Consultando…', 'info');

    return service.consultar(periodoId, cedula)
      .then(function (resultado) {
        var respuesta = {
          type: 'TA_CONSULTA_ESTADO_RESPONSE',
          requestId: requestId || '',
          ok: true,
          encontrado: Boolean(resultado && resultado.encontrado),
          envio: resultado && resultado.envio || null,
          diagnostico: {
            base: resultado && resultado.base || 'titulos-ec2fa',
            coleccion: resultado && resultado.coleccion || 'envios',
            documentoId: resultado && resultado.documentoId || '',
            ruta: resultado && resultado.ruta || '',
            estrategia: resultado && resultado.estrategia || 'IDENTIDAD_PRIMERO',
            rutasProbadas: resultado && resultado.rutasProbadas || [],
            periodoCanonico: resultado && resultado.periodoCanonico || '',
            status: resultado && resultado.status || 0,
            duracionMs: resultado && resultado.duracionMs || (Date.now() - inicio)
          }
        };

        renderResultado(respuesta);
        responderAlPadre(respuesta);
        return respuesta;
      })
      .catch(function (error) {
        var respuesta = {
          type: 'TA_CONSULTA_ESTADO_RESPONSE',
          requestId: requestId || '',
          ok: false,
          encontrado: false,
          envio: null,
          error: {
            codigo: error && error.codigo || 'CONSULTA_ERROR',
            mensaje: error && error.message || 'No se pudo consultar el estado del título.'
          },
          diagnostico: Object.assign({
            base: 'titulos-ec2fa',
            coleccion: 'envios',
            duracionMs: Date.now() - inicio
          }, error && error.diagnostico || {})
        };

        renderResultado(respuesta);
        responderAlPadre(respuesta);
        return respuesta;
      });
  }

  function renderResultado(respuesta) {
    if (EMBED) return;

    var output = document.querySelector('#resultado');
    if (!output) return;

    if (!respuesta.ok) {
      output.className = 'result result--error';
      output.innerHTML = '<strong>Error:</strong> ' + escapar(respuesta.error && respuesta.error.mensaje || 'Consulta fallida') +
        '<br><small>Código: ' + escapar(respuesta.error && respuesta.error.codigo || '') + '</small>';
      return;
    }

    if (!respuesta.encontrado) {
      output.className = 'result result--warning';
      output.innerHTML = [
        '<strong>No existe un envío compatible para ese período y cédula.</strong>',
        '<div><b>Base:</b> ' + escapar(respuesta.diagnostico.base || 'titulos-ec2fa') + '</div>',
        '<div><b>Colección:</b> ' + escapar(respuesta.diagnostico.coleccion || 'envios') + '</div>',
        '<div><b>Período:</b> ' + escapar(respuesta.diagnostico.periodoCanonico || '') + '</div>',
        '<div><b>Ruta final:</b> ' + escapar(respuesta.diagnostico.ruta || 'NO_ENCONTRADO') + '</div>',
        '<div><b>Tiempo:</b> ' + escapar(String(respuesta.diagnostico.duracionMs || 0)) + ' ms</div>'
      ].join('');
      return;
    }

    var envio = respuesta.envio || {};
    output.className = 'result result--ok';
    output.innerHTML = [
      '<strong>Título encontrado</strong>',
      '<div><b>Estado:</b> ' + escapar(envio.estado || envio.estadoProceso || 'Sin estado') + '</div>',
      '<div><b>Título final:</b> ' + escapar(envio.tituloFinal || envio.tituloFinalInvestigacion || envio.tituloElegido || 'Aún no definido') + '</div>',
      '<div><b>Base:</b> ' + escapar(respuesta.diagnostico.base || 'titulos-ec2fa') + '</div>',
      '<div><b>Colección:</b> ' + escapar(respuesta.diagnostico.coleccion || 'envios') + '</div>',
      '<div><b>Documento:</b> ' + escapar(respuesta.diagnostico.documentoId || '') + '</div>',
      '<div><b>Estrategia:</b> ' + escapar(respuesta.diagnostico.estrategia || 'IDENTIDAD_PRIMERO') + '</div>',
      '<div><b>Ruta:</b> ' + escapar(respuesta.diagnostico.ruta || '') + '</div>',
      '<div><b>Tiempo:</b> ' + escapar(String(respuesta.diagnostico.duracionMs || 0)) + ' ms</div>'
    ].join('');
  }

  function responderAlPadre(respuesta) {
    if (!EMBED || window.parent === window) return;
    window.parent.postMessage(respuesta, TARGET_ORIGIN);
  }

  function notificarListo() {
    if (!EMBED || window.parent === window) return;
    window.parent.postMessage({ type: 'TA_CONSULTA_ESTADO_READY', version: VERSION }, TARGET_ORIGIN);
  }

  function mostrarEstado(texto, tipo) {
    if (EMBED) return;
    var output = document.querySelector('#resultado');
    if (!output) return;
    output.className = 'result result--' + (tipo || 'info');
    output.textContent = texto || '';
  }

  function mostrarError(mensaje) {
    mostrarEstado(mensaje, 'error');
  }

  function obtenerValor(selector) {
    var input = document.querySelector(selector);
    return input ? input.value : '';
  }

  function escapar(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
})();
