/* Compatibilidad del seguimiento con estados históricos de envios. */
(function () {
  'use strict';

  var repository = window.TAEstudianteRepository;
  if (!repository || repository.__seguimientoCompat) return;

  var copia = {};
  Object.keys(repository).forEach(function (key) { copia[key] = repository[key]; });

  copia.consultarEstudianteCompleto = function (cedula) {
    return repository.consultarEstudianteCompleto(cedula).then(function (respuesta) {
      var data = respuesta && (respuesta.data || respuesta);
      var envio = data && data.envioExistente;

      if (envio) normalizarEstadoHistorico(envio);
      return respuesta;
    });
  };

  copia.__seguimientoCompat = true;
  window.TAEstudianteRepository = Object.freeze(copia);

  function normalizarEstadoHistorico(envio) {
    var estado = normalizar(envio.estado || envio.estadoProceso || '');
    var proceso = normalizar(envio.estadoProceso || '');
    var resultadoCoord = normalizar(envio.resultadoCoordinador || '');
    var resultadoInv = normalizar(envio.resultadoInvestigacion || '');
    var estadoCoord = normalizar(envio.estadoCoordinador || '');
    var estadoInv = normalizar(envio.estadoInvestigador || '');

    var coordinacionAprobada =
      estado === 'APROBADO' ||
      estado === 'PENDIENTE_INVESTIGADOR' ||
      proceso === 'PENDIENTE_INVESTIGADOR' ||
      estado === 'APROBADO_FINAL' ||
      proceso === 'APROBADO_FINAL' ||
      estadoCoord === 'VALIDADO' ||
      estadoCoord === 'APROBADO' ||
      resultadoCoord.indexOf('APROBADO') === 0 ||
      envio.validadoCoordinador === true ||
      envio.validadoCoordinacion === true;

    var investigacionAprobada =
      estado === 'APROBADO_FINAL' ||
      proceso === 'APROBADO_FINAL' ||
      estadoInv === 'APROBADO' ||
      estadoInv === 'APROBADO_CON_OBSERVACION' ||
      resultadoInv.indexOf('APROBADO') === 0 ||
      Boolean(limpiar(envio.tituloFinalInvestigacion || envio.tituloFinal));

    if (coordinacionAprobada) {
      envio.validadoCoordinador = true;
      envio.validadoCoordinacion = true;
      if (!estadoCoord) envio.estadoCoordinador = 'VALIDADO';
    }

    if (investigacionAprobada) {
      envio.investigacionRevisada = true;
      if (!estadoInv) {
        envio.estadoInvestigador = resultadoInv.indexOf('CORRECCION') !== -1 || resultadoInv.indexOf('OBSERV') !== -1
          ? 'APROBADO_CON_OBSERVACION'
          : 'APROBADO';
      }
      envio.estado = 'APROBADO_FINAL';
      envio.estadoProceso = 'APROBADO_FINAL';
    }

    if (resultadoCoord === 'DEVUELTO' && !estadoCoord) {
      envio.estadoCoordinador = 'DEVUELTO';
      if (!envio.devueltoPor) envio.devueltoPor = 'COORDINADOR';
    }

    if (resultadoInv === 'DEVUELTO' && !estadoInv) {
      envio.estadoInvestigador = 'DEVUELTO';
      if (!envio.devueltoPor) envio.devueltoPor = 'INVESTIGACION';
    }

    return envio;
  }

  function limpiar(valor) {
    return String(valor === undefined || valor === null ? '' : valor).replace(/\s+/g, ' ').trim();
  }

  function normalizar(valor) {
    return limpiar(valor)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '_')
      .toUpperCase();
  }
})();