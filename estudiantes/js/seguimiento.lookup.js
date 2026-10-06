/*
  Capa aislada de consulta del estado del título.
  La aplicación principal NO consulta envios mediante Firestore SDK.
  Delega exclusivamente al motor /consulta-estado/ mediante postMessage.
*/
(function () {
  'use strict';

  var base = window.TAEstudianteRepository;
  var cfg = window.TA_ESTUDIANTES_CONFIG || {};
  var bridge = window.TAConsultaEstadoBridge;

  if (!base || base.__consultaEstable) return;

  if (!bridge || typeof bridge.consultar !== 'function') {
    throw new Error('El motor aislado de consulta de Títulos no está disponible.');
  }

  instalar();

  function instalar() {
    var copia = copiar(base);

    copia.consultarEnvio = consultarEnvioAislado;
    copia.cargarConfiguracionApp = cargarConfiguracionLocal;
    copia.__consultaEstable = true;
    copia.__consultaAislada = true;
    copia.__lookupParalelo = false;

    window.TAEstudianteRepository = Object.freeze(copia);
  }

  function consultarEnvioAislado(periodoId, cedulaIngresada) {
    var periodo = limpiar(periodoId);
    var cedula = normalizarCedula(cedulaIngresada);
    var inicio = Date.now();

    if (!periodo || !cedula) return Promise.resolve(null);

    console.info('[Títulos aislado] Consultando', periodo + '__' + cedula);

    return bridge.consultar({
      periodoId: periodo,
      cedula: cedula
    }).then(function (respuesta) {
      if (!respuesta || respuesta.ok === false) {
        throw crearErrorDesdeRespuesta(respuesta);
      }

      console.info('[Títulos aislado] Respuesta recibida en ' + (Date.now() - inicio) + ' ms.', respuesta.diagnostico || {});

      if (!respuesta.encontrado || !respuesta.envio) return null;
      return normalizarEnvio(respuesta.envio);
    }).catch(function (error) {
      console.error('[Títulos aislado] Error de consulta:', {
        codigo: error && error.codigo || '',
        mensaje: error && error.message || String(error || ''),
        periodoId: periodo,
        cedula: cedula,
        diagnostico: error && error.diagnostico || null
      });
      throw error;
    });
  }

  function cargarConfiguracionLocal() {
    var defaults = Object.assign({}, cfg.defaultAppConfig || {});
    defaults.origen = 'local-consulta-aislada';
    defaults.procesoActivo = defaults.procesoActivo !== false;
    defaults.periodoActivoId = '';
    defaults.periodoActivoLabel = '';
    return Promise.resolve(defaults);
  }

  function normalizarEnvio(data) {
    var propuestas;
    var preferido;
    var elegido;

    if (!data) return null;

    propuestas = Array.isArray(data.titulosEnviados) && data.titulosEnviados.length
      ? data.titulosEnviados.slice()
      : [1, 2, 3].map(function (numero) {
          var titulo = limpiar(data['titulo' + numero]);
          if (!titulo) return null;
          return {
            numero: numero,
            tituloFinal: titulo,
            preferido: Number(data.tituloPreferidoNumero) === numero
          };
        }).filter(Boolean);

    preferido = limpiar(data.tituloPreferidoTexto || data.tituloElegido || '');
    if (!preferido) {
      elegido = propuestas.filter(function (p) {
        return Number(p.numero) === Number(data.tituloPreferidoNumero || 1);
      })[0];
      preferido = elegido ? limpiar(elegido.tituloFinal || elegido.titulo) : '';
    }

    return Object.assign({}, data, {
      id: data.id || data._docId || '',
      cedula: normalizarCedula(data.cedula || data.numeroIdentificacion || ''),
      titulosEnviados: propuestas,
      tituloPreferidoTexto: preferido,
      intentosUsados: Number(data.intentosUsados || data.numeroEnvios || 1),
      puedeReenviar: data.puedeReenviar === true || data.permitirReenvio === true
    });
  }

  function crearErrorDesdeRespuesta(respuesta) {
    var data = respuesta && respuesta.error || {};
    var error = new Error(data.mensaje || 'No se pudo consultar el estado del título.');
    error.codigo = data.codigo || 'CONSULTA_AISLADA_ERROR';
    error.diagnostico = respuesta && respuesta.diagnostico || null;
    return error;
  }

  function copiar(obj) {
    var out = {};
    Object.keys(obj || {}).forEach(function (key) { out[key] = obj[key]; });
    return out;
  }

  function normalizarCedula(value) {
    var cedula = String(value || '').replace(/\D/g, '');
    return cedula.length === 9 ? '0' + cedula : cedula;
  }

  function limpiar(value) {
    return String(value === undefined || value === null ? '' : value).replace(/\s+/g, ' ').trim();
  }
})();
