(function () {
  'use strict';

  /*
    BLOQUE 1 — Compatibilidad temporal.
    Ya NO existe iframe, postMessage, READY ni motor oculto.
    El controlador actual puede seguir llamando TAConsultaEstadoBridge,
    pero este objeto delega de forma directa a TAConsultaEstadoService.
    En el Bloque 3 el controlador dejará de usar este alias.
  */
  var VERSION = '20261007-38';

  function obtenerServicio() {
    var service = window.TAConsultaEstadoService;

    if (!service || typeof service.consultar !== 'function') {
      throw crearError(
        'SERVICIO_TITULOS_NO_DISPONIBLE',
        'El servicio directo /consulta-estado/ no está disponible.'
      );
    }

    return service;
  }

  function consultar(datos) {
    datos = datos || {};

    var cedula = String(datos.cedula || '').replace(/\D/g, '');
    var periodoId = String(datos.periodoId || '').trim();
    var inicio = Date.now();
    var service;

    if (!cedula || !periodoId) {
      return Promise.reject(crearError(
        'DATOS_INCOMPLETOS',
        'Faltan cédula o período para consultar el estado del título.'
      ));
    }

    try {
      service = obtenerServicio();
    } catch (error) {
      return Promise.reject(error);
    }

    return Promise.resolve(service.consultar(periodoId, cedula))
      .then(function (resultado) {
        resultado = resultado || {};

        return {
          type: 'TA_CONSULTA_ESTADO_RESPONSE',
          ok: true,
          encontrado: Boolean(resultado.encontrado),
          envio: resultado.envio || null,
          diagnostico: {
            motor: 'DIRECTO',
            base: resultado.base || 'titulos-ec2fa',
            coleccion: resultado.coleccion || 'envios',
            documentoId: resultado.documentoId || '',
            ruta: resultado.ruta || '',
            rutasProbadas: resultado.rutasProbadas || [],
            periodoCanonico: resultado.periodoCanonico || periodoId,
            status: resultado.status || 0,
            duracionMs: resultado.duracionMs || (Date.now() - inicio)
          }
        };
      })
      .catch(function (error) {
        if (!error.codigo) error.codigo = 'CONSULTA_TITULOS_ERROR';

        error.diagnostico = Object.assign({
          motor: 'DIRECTO',
          base: 'titulos-ec2fa',
          coleccion: 'envios',
          periodoCanonico: periodoId,
          duracionMs: Date.now() - inicio
        }, error.diagnostico || {});

        throw error;
      });
  }

  function asegurarListo() {
    try {
      obtenerServicio();
      return Promise.resolve(true);
    } catch (error) {
      return Promise.reject(error);
    }
  }

  function reiniciar() {
    return true;
  }

  function crearError(codigo, mensaje) {
    var error = new Error(mensaje || codigo || 'Error del servicio directo de Títulos.');
    error.codigo = codigo || 'CONSULTA_TITULOS_ERROR';
    return error;
  }

  window.TAConsultaEstadoBridge = Object.freeze({
    consultar: consultar,
    asegurarListo: asegurarListo,
    reiniciar: reiniciar,
    version: VERSION,
    modo: 'DIRECTO_SIN_IFRAME'
  });
})();
