/* Repositorio Firebase del módulo coordinadores. */
(function () {
  'use strict';

  var config = window.TA_COORDINADORES_CONFIG;
  var firebaseService = window.TACoordFirebaseService;

  function cargarConfigApp() {
    return firebaseService.leerDocumento(config.collections.config, config.documents.appConfig)
      .then(function (doc) {
        if (!doc) {
          return Object.assign({}, config.defaultAppConfig, {
            id: config.documents.appConfig,
            origen: 'default-local'
          });
        }

        return Object.assign({}, config.defaultAppConfig, doc, {
          origen: 'firebase'
        });
      });
  }

  function buscarCoordinadorPorEmail(email) {
    var docId = normalizarEmail(email);
    if (!docId) return Promise.reject(new Error('Ingresa el correo del coordinador.'));

    return firebaseService.leerDocumento(config.collections.coordinadores, docId)
      .then(function (coordinador) {
        if (!coordinador) throw new Error('No se encontró un coordinador con ese correo.');
        var normalizado = normalizarCoordinador(coordinador);
        if (!normalizado.activo) throw new Error('El coordinador está inactivo.');
        if (!normalizado.carreras.length) throw new Error('El coordinador no tiene carreras asignadas.');
        return normalizado;
      });
  }

  function listarTitulosParaCoordinador(coordinador, filtros) {
    var periodoId = String(filtros && filtros.periodoId || '').trim();
    var estadoFiltro = String(filtros && filtros.estado || '').trim().toUpperCase();

    if (!periodoId) return Promise.reject(new Error('Ingresa el período para consultar títulos.'));

    return firebaseService.listarDocumentos(config.collections.titulos, {
      where: ['periodoId', '==', periodoId],
      limit: 1000
    }).then(function (titulos) {
      return titulos
        .map(normalizarTitulo)
        .filter(function (titulo) {
          return perteneceACoordinador(titulo, coordinador);
        })
        .filter(function (titulo) {
          if (!estadoFiltro || estadoFiltro === 'TODOS') return true;
          return String(titulo.estado || '').toUpperCase() === estadoFiltro;
        })
        .sort(function (a, b) {
          return String(a.nombres || '').localeCompare(String(b.nombres || ''));
        });
    });
  }

  function perteneceACoordinador(titulo, coordinador) {
    var carreraTitulo = normalizarTextoComparacion(titulo.carrera || titulo.nombreCarrera || '');
    var codigoTitulo = normalizarTextoComparacion(titulo.codigoCarrera || '');

    return coordinador.carreras.some(function (carrera) {
      var carreraCoord = normalizarTextoComparacion(carrera);
      return carreraCoord && (
        carreraTitulo === carreraCoord ||
        codigoTitulo === carreraCoord ||
        carreraTitulo.indexOf(carreraCoord) !== -1 ||
        carreraCoord.indexOf(carreraTitulo) !== -1
      );
    });
  }

  function normalizarCoordinador(data) {
    return {
      id: data.id || normalizarEmail(data.email || data.correo || ''),
      email: normalizarEmail(data.email || data.correo || data.id || ''),
      nombres: String(data.nombres || data.nombre || data.nombreCompleto || '').trim(),
      carreras: normalizarCarreras(data.carreras || data.carrerasAsignadas || data.carrera || ''),
      activo: data.activo !== false,
      rol: data.rol || 'coordinador',
      observacion: String(data.observacion || '').trim(),
      raw: data
    };
  }

  function normalizarTitulo(data) {
    var propuestas = Array.isArray(data.titulosEnviados) ? data.titulosEnviados : data.propuestas || [];
    var preferidoNumero = Number(data.tituloPreferidoNumero || 1);
    var preferida = propuestas.filter(function (propuesta) {
      return Number(propuesta.numero) === preferidoNumero;
    })[0] || propuestas[0] || {};

    return {
      id: data.id || '',
      cedula: data.cedula || data.numeroIdentificacion || '',
      numeroIdentificacion: data.numeroIdentificacion || data.cedula || '',
      nombres: data.nombres || data.nombreCompleto || '',
      carrera: data.carrera || data.nombreCarrera || '',
      nombreCarrera: data.nombreCarrera || data.carrera || '',
      codigoCarrera: data.codigoCarrera || '',
      periodoId: data.periodoId || '',
      estado: data.estado || 'ENVIADO',
      tituloPreferidoNumero: preferidoNumero,
      tituloPreferidoTexto: data.tituloPreferidoTexto || preferida.tituloFinal || '',
      titulosEnviados: propuestas,
      enviadoEn: data.enviadoEn || data.creadoEn || data.actualizadoEn || null,
      revision: data.revision || null,
      raw: data
    };
  }

  function normalizarCarreras(value) {
    if (Array.isArray(value)) return value.map(limpiarTexto).filter(Boolean);
    return String(value || '').split(',').map(limpiarTexto).filter(Boolean);
  }

  function normalizarEmail(value) {
    return String(value || '').trim().toLowerCase();
  }

  function limpiarTexto(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function normalizarTextoComparacion(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();
  }

  window.TACoordRepository = Object.freeze({
    cargarConfigApp: cargarConfigApp,
    buscarCoordinadorPorEmail: buscarCoordinadorPorEmail,
    listarTitulosParaCoordinador: listarTitulosParaCoordinador,
    normalizarTitulo: normalizarTitulo,
    normalizarCoordinador: normalizarCoordinador
  });
})();
