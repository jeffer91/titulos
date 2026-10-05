/* Datos, PIN y segunda revisión del módulo Investigadores. */
(function () {
  'use strict';

  var config = window.TA_INVESTIGADORES_CONFIG;
  var firebaseService = window.TAAdminFirebaseService;

  function buscarInvestigador(cedula) {
    var id = soloNumeros(cedula);
    if (id.length !== 10) return Promise.reject(new Error('Ingresa una cédula válida de 10 dígitos.'));

    return firebaseService.leerDocumento(config.collections.investigadores, id)
      .then(function (doc) {
        if (doc) return normalizarInvestigador(doc);
        return firebaseService.listarDocumentos(config.collections.investigadores, { limit: 1000 })
          .then(function (docs) {
            var encontrado = (docs || []).map(normalizarInvestigador).filter(function (item) {
              return item.cedula === id;
            })[0];
            if (!encontrado) throw new Error('Tu cédula no consta en el registro de investigadores. Comunícate con Administración.');
            return encontrado;
          });
      })
      .then(function (investigador) {
        if (!investigador) throw new Error('Tu cédula no consta en el registro de investigadores.');
        if (!investigador.activo) throw new Error('Tu registro de investigador está inactivo.');
        return investigador;
      });
  }

  function crearPin(investigador, pin) {
    validarPin(pin);
    if (!investigador || !investigador.id) return Promise.reject(new Error('No se identificó al investigador.'));
    if (investigador.pinCreado) return Promise.reject(new Error('Ya existe un PIN para este investigador.'));

    return hashPin(investigador.cedula || investigador.id, pin).then(function (hash) {
      return firebaseService.guardarDocumento(config.collections.investigadores, investigador.id, {
        pinHash: hash,
        pinCreado: true,
        pinActivo: false,
        pinCreadoEn: new Date().toISOString(),
        pinActivadoEn: null,
        pinActivadoPor: ''
      }, { merge: true });
    });
  }

  function validarAcceso(investigador, pin) {
    if (!investigador || !investigador.pinCreado || !investigador.pinHash) {
      return Promise.reject(new Error('Primero debes crear tu PIN.'));
    }
    if (!investigador.pinActivo) {
      return Promise.reject(new Error('Tu PIN todavía está pendiente de activación por Administración.'));
    }

    return hashPin(investigador.cedula || investigador.id, pin).then(function (hash) {
      if (!compararSeguro(hash, investigador.pinHash)) throw new Error('PIN incorrecto.');
      return investigador;
    });
  }

  function cargarPeriodoActivo() {
    return firebaseService.leerDocumento(config.collections.config, config.documents.appConfig)
      .then(function (doc) {
        return doc && (doc.periodoActivoId || (doc.periodoActivo && doc.periodoActivo.id) || doc.periodoActivo) || '';
      })
      .catch(function () { return ''; });
  }

  function listarTitulosHabilitados(investigador, periodoId) {
    var opciones = { limit: 1500 };
    if (periodoId) opciones.where = ['periodoId', '==', periodoId];

    return firebaseService.listarDocumentos(config.collections.titulos, opciones)
      .then(function (docs) {
        return (docs || []).map(normalizarTitulo)
          .filter(estaHabilitadoPorCoordinador)
          .filter(function (titulo) { return perteneceAlInvestigador(titulo, investigador); })
          .sort(function (a, b) { return a.nombres.localeCompare(b.nombres); });
      });
  }

  function revisarTitulo(titulo, accion, observacion, investigador) {
    if (!titulo || !titulo.id) return Promise.reject(new Error('No se encontró el título.'));
    if (!estaHabilitadoPorCoordinador(titulo)) {
      return Promise.reject(new Error('Este título todavía no está habilitado por Coordinación.'));
    }
    if (!investigador || !investigador.pinActivo) return Promise.reject(new Error('El acceso del investigador no está activo.'));

    var estado = estadoDesdeAccion(accion);
    var comentario = limpiar(observacion);
    if ((estado === 'APROBADO_CON_OBSERVACION' || estado === 'DEVUELTO') && !comentario) {
      return Promise.reject(new Error('Debes escribir una observación para esta decisión.'));
    }

    var revision = {
      estado: estado,
      accion: accion,
      observacion: comentario,
      investigadorId: investigador.id,
      investigadorCedula: investigador.cedula,
      investigadorNombre: investigador.nombre,
      investigadorEmail: investigador.email,
      fechaLocal: new Date().toISOString()
    };

    return firebaseService.guardarDocumento(config.collections.titulos, titulo.id, {
      estadoInvestigador: estado,
      revisionInvestigador: revision,
      investigacionRevisada: true,
      investigacionRevisadaEn: revision.fechaLocal,
      actualizadoPorModulo: 'investigadores'
    }, { merge: true })
      .then(function () {
        return firebaseService.agregarDocumento(config.collections.logs, {
          accion: 'REVISION_TITULO_INVESTIGADOR',
          modulo: 'investigadores',
          tituloId: titulo.id,
          cedula: titulo.cedula,
          carrera: titulo.carrera,
          periodoId: titulo.periodoId,
          revision: revision
        }).catch(function () { return null; });
      })
      .then(function () {
        return Object.assign({}, titulo, { estadoInvestigador: estado, revisionInvestigador: revision });
      });
  }

  function estaHabilitadoPorCoordinador(titulo) {
    var revision = titulo.revisionCoordinador || {};
    var estado = String(revision.estado || titulo.estadoCoordinador || titulo.estado || '').toUpperCase();
    var tieneRevision = Boolean(
      titulo.revisionCoordinador ||
      titulo.coordinadorRevisado ||
      (titulo.raw && titulo.raw.revision && titulo.raw.revision.coordinadorEmail) ||
      (titulo.raw && titulo.raw.revisadoPor)
    );

    return tieneRevision && config.estadosCoordinadorHabilitados.indexOf(estado) !== -1;
  }

  function perteneceAlInvestigador(titulo, investigador) {
    var carreras = investigador && investigador.carreras || [];
    if (!carreras.length) return true;
    var carrera = normalizarTexto(titulo.carrera);
    return carreras.some(function (item) {
      var valor = normalizarTexto(item);
      return valor === '*' || valor === 'TODAS' || valor === carrera;
    });
  }

  function normalizarInvestigador(data) {
    return {
      id: data.id || soloNumeros(data.cedula || data.identificacion),
      cedula: soloNumeros(data.cedula || data.identificacion || data.numeroIdentificacion || data.id),
      nombre: limpiar(data.nombres || data.nombre || data.nombreCompleto || ''),
      email: limpiar(data.email || data.correo || '').toLowerCase(),
      carreras: normalizarCarreras(data.carreras || data.carrerasAsignadas || []),
      activo: data.activo !== false,
      pinCreado: Boolean(data.pinCreado || data.pinHash),
      pinActivo: Boolean(data.pinActivo),
      pinHash: String(data.pinHash || ''),
      raw: data
    };
  }

  function normalizarTitulo(data) {
    var revisionGenerica = data.revision || null;
    var revisionCoord = data.revisionCoordinador || (revisionGenerica && revisionGenerica.coordinadorEmail ? revisionGenerica : null);
    return {
      id: data.id || '',
      cedula: soloNumeros(data.cedula || data.numeroIdentificacion),
      nombres: limpiar(data.nombres || data.nombreCompleto || ''),
      carrera: limpiar(data.carrera || data.nombreCarrera || ''),
      periodoId: limpiar(data.periodoId || ''),
      estado: String(data.estado || 'ENVIADO').toUpperCase(),
      estadoCoordinador: String(data.estadoCoordinador || (revisionCoord && revisionCoord.estado) || data.estado || '').toUpperCase(),
      tituloPreferidoNumero: Number(data.tituloPreferidoNumero || 1),
      tituloPreferidoTexto: limpiar(data.tituloPreferidoTexto || ''),
      titulosEnviados: Array.isArray(data.titulosEnviados) ? data.titulosEnviados : [],
      revisionCoordinador: revisionCoord,
      coordinadorRevisado: Boolean(data.coordinadorRevisado),
      estadoInvestigador: String(data.estadoInvestigador || '').toUpperCase(),
      revisionInvestigador: data.revisionInvestigador || null,
      raw: data
    };
  }

  function estadoDesdeAccion(accion) {
    var value = String(accion || '').toUpperCase();
    if (value === 'APROBAR') return 'APROBADO';
    if (value === 'APROBAR_OBSERVACION') return 'APROBADO_CON_OBSERVACION';
    if (value === 'DEVOLVER') return 'DEVUELTO';
    throw new Error('Acción de revisión no válida.');
  }

  function validarPin(pin) {
    var value = String(pin || '');
    if (!new RegExp('^\\d{' + config.pin.min + ',' + config.pin.max + '}$').test(value)) {
      throw new Error('El PIN debe tener entre ' + config.pin.min + ' y ' + config.pin.max + ' dígitos.');
    }
  }

  function hashPin(cedula, pin) {
    validarPin(pin);
    if (!window.crypto || !window.crypto.subtle || !window.TextEncoder) {
      return Promise.reject(new Error('Este navegador no permite proteger el PIN. Abre la aplicación mediante HTTPS.'));
    }
    var texto = new TextEncoder().encode('titulos-investigador-v1|' + cedula + '|' + pin);
    return window.crypto.subtle.digest('SHA-256', texto).then(function (buffer) {
      return Array.prototype.map.call(new Uint8Array(buffer), function (byte) {
        return byte.toString(16).padStart(2, '0');
      }).join('');
    });
  }

  function compararSeguro(a, b) {
    a = String(a || ''); b = String(b || '');
    if (a.length !== b.length) return false;
    var diff = 0;
    for (var i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  }

  function normalizarCarreras(value) {
    if (Array.isArray(value)) return value.map(function (item) {
      return limpiar(item && item.nombreCarrera ? item.nombreCarrera : item);
    }).filter(Boolean);
    return String(value || '').split(/[,;|]/).map(limpiar).filter(Boolean);
  }
  function soloNumeros(value) { return String(value || '').replace(/\D/g, ''); }
  function limpiar(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
  function normalizarTexto(value) { return limpiar(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase(); }

  window.TAInvestigadorRepository = Object.freeze({
    buscarInvestigador: buscarInvestigador,
    crearPin: crearPin,
    validarAcceso: validarAcceso,
    cargarPeriodoActivo: cargarPeriodoActivo,
    listarTitulosHabilitados: listarTitulosHabilitados,
    revisarTitulo: revisarTitulo,
    estaHabilitadoPorCoordinador: estaHabilitadoPorCoordinador
  });
})();
