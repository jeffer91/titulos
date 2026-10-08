/* Controlador principal del panel administrador. */
(function () {
  'use strict';

  var config = window.TA_ADMINISTRADORES_CONFIG;
  var ui = window.TAAdminUI;
  var repository = window.TAAdministradorRepository;

  var modulos = {
    inicio: window.TAAdminInicio,
    faltantes: window.TAAdminFaltantes,
    periodos: window.TAAdminPeriodos,
    coordinadores: window.TAAdminCoordinadores,
    investigadores: window.TAAdminInvestigadores,
    reportes: window.TAAdminReportesRevision,
    estudiantes: window.TAAdminEstudiantes,
    ajustes: window.TAAdminAjustes,
    respaldo: window.TAAdminRespaldo
  };

  var estado = {
    firebaseListo: false,
    inicializado: false,
    tabActual: 'inicio',
    modulosIniciados: {},
    modulosCargados: {},
    normalizacionEjecutada: false
  };

  document.addEventListener('DOMContentLoaded', iniciar);

  function iniciar() {
    conectarEventosBase();
    iniciarModulos();

    ui.setText('#adminEstadoGeneral', 'Conectando');

    var seguro = window.TAAdministradorSeguro;
    if (seguro && seguro.activo && seguro.activo()) {
      seguro.iniciar().then(function (autenticado) {
        if (!autenticado) {
          ui.setText('#adminEstadoGeneral', 'Sesión requerida');
          return false;
        }
        return repository.iniciarFirebase().then(function () {
          estado.firebaseListo = true;
          estado.inicializado = true;
          document.body.classList.remove('admin-auth-pending');
          ui.setText('#adminEstadoGeneral', 'Acceso verificado');
          activarTab('coordinadores');
          return true;
        });
      }).catch(function (error) {
        estado.firebaseListo = false;
        ui.setText('#adminEstadoGeneral', 'Acceso denegado');
        var estadoLogin = document.getElementById('adminLoginMensaje');
        if (estadoLogin) estadoLogin.textContent = obtenerMensaje(error, 'No autorizado');
      });
      return;
    }

    repository.iniciarFirebase()
      .then(function () {
        estado.firebaseListo = true;
        estado.inicializado = true;

        ui.setText('#adminEstadoGeneral', 'Conectado');

        return ejecutarNormalizacionAutomatica();
      })
      .then(function () {
        activarTab(obtenerTabInicial());
      })
      .catch(function (error) {
        estado.firebaseListo = false;
        estado.inicializado = true;

        ui.setText('#adminEstadoGeneral', 'Sin conexión');

        ui.showStatus('#inicioMensaje', {
          titulo: 'No se pudo iniciar administrador',
          mensaje: 'No se pudo conectar correctamente con Firebase.',
          detalle: obtenerMensaje(error, config.textos.firebaseError || 'Error desconocido.')
        }, 'error');

        activarTab(obtenerTabInicial(), false);
      });
  }

  function conectarEventosBase() {
    ui.qsa('[data-admin-tab]').forEach(function (button) {
      button.addEventListener('click', function () {
        activarTab(button.getAttribute('data-admin-tab'));
      });
    });

    if (ui.conectarModalesBase) {
      ui.conectarModalesBase();
    }

    conectarEventosGlobales();
  }

  function conectarEventosGlobales() {
    window.addEventListener('admin:periodos-actualizados', function () {
      estado.modulosCargados.inicio = false;
      estado.modulosCargados.faltantes = false;
      estado.modulosCargados.estudiantes = false;
      estado.modulosCargados.coordinadores = false;
      estado.modulosCargados.investigadores = false;
      estado.modulosCargados.reportes = false;

      if (estado.tabActual === 'inicio') {
        cargarModulo('inicio', true);
      }

      if (estado.tabActual === 'faltantes') {
        cargarModulo('faltantes', true);
      }

      if (estado.tabActual === 'estudiantes') {
        cargarModulo('estudiantes', true);
      }

      if (estado.tabActual === 'coordinadores') {
        cargarModulo('coordinadores', true);
      }

      if (estado.tabActual === 'investigadores') {
        cargarModulo('investigadores', true);
      }

      if (estado.tabActual === 'reportes') {
        cargarModulo('reportes', true);
      }
    });

    window.addEventListener('admin:faltantes-actualizados', function (event) {
      var total = event && event.detail ? Number(event.detail.total || 0) : 0;
      var badge = ui.qs('#faltantesSidebarBadge');

      if (badge) {
        badge.textContent = String(total);
        badge.classList.toggle('is-zero', total === 0);
      }
    });

    window.addEventListener('hashchange', function () {
      var tab = obtenerTabInicial();

      if (tab && tab !== estado.tabActual) {
        activarTab(tab);
      }
    });
  }

  function iniciarModulos() {
    Object.keys(modulos).forEach(function (nombre) {
      var modulo = modulos[nombre];

      if (!modulo || typeof modulo.iniciar !== 'function') return;

      try {
        modulo.iniciar();
        estado.modulosIniciados[nombre] = true;
      } catch (error) {
        estado.modulosIniciados[nombre] = false;
        console.error('No se pudo iniciar el módulo ' + nombre, error);
      }
    });
  }

  function ejecutarNormalizacionAutomatica() {
    if (estado.normalizacionEjecutada) return Promise.resolve({ ok: true, cambios: 0 });

    estado.normalizacionEjecutada = true;

    /* La Firebase académica es una fuente externa de solo lectura.
       No intentamos corregir ni normalizar sus documentos desde esta app. */
    if (!config.normalizacion || config.normalizacion.corregirFirebaseAutomatico !== true) {
      return Promise.resolve({ ok: true, cambios: 0, omitida: true });
    }

    if (!repository || typeof repository.normalizarDatosAutomaticamente !== 'function') {
      return Promise.resolve({ ok: true, cambios: 0 });
    }

    ui.setText('#adminEstadoGeneral', 'Normalizando');

    return repository.normalizarDatosAutomaticamente()
      .then(function (resultado) {
        var total = resultado && resultado.cambios ? resultado.cambios : 0;

        ui.setText('#adminEstadoGeneral', total > 0 ? 'Conectado · normalizado' : 'Conectado');

        return resultado;
      })
      .catch(function (error) {
        ui.setText('#adminEstadoGeneral', 'Conectado');

        ui.showStatus('#inicioMensaje', {
          titulo: 'Normalización no completada',
          mensaje: 'El administrador abrió, pero no se pudo completar la normalización automática.',
          detalle: obtenerMensaje(error, 'Error desconocido.')
        }, 'error');

        return {
          ok: false,
          cambios: 0,
          error: error
        };
      });
  }

  function activarTab(nombreTab, cargarDatos) {
    if (!nombreTab || !modulos[nombreTab]) {
      nombreTab = 'inicio';
    }

    estado.tabActual = nombreTab;
    ui.activarTab(nombreTab);

    if (window.location.hash !== '#' + nombreTab) {
      history.replaceState(null, '', '#' + nombreTab);
    }

    if (cargarDatos === false) return;

    cargarModulo(nombreTab, false);
  }

  function cargarModulo(nombreTab, forzar) {
    var seguro = window.TAAdministradorSeguro;
    if (seguro && seguro.activo && seguro.activo() &&
        ['coordinadores','investigadores','periodos','ajustes'].indexOf(nombreTab) === -1) {
      mostrarMensajeModulo(nombreTab, {
        titulo:'Operación pendiente de migración',
        mensaje:'Esta sección todavía no tiene endpoints autorizados del backend.',
        detalle:'No se permite consultar directamente Firebase desde el modo seguro.'
      }, 'error');
      return Promise.resolve(false);
    }
    var modulo = modulos[nombreTab];

    if (!modulo || typeof modulo.cargar !== 'function') return Promise.resolve(false);

    if (!estado.firebaseListo) {
      mostrarMensajeModulo(nombreTab, {
        titulo: 'Sin conexión',
        mensaje: 'No hay conexión con Firebase.',
        detalle: 'Revisa la configuración Firebase del módulo administrador.'
      }, 'error');

      return Promise.resolve(false);
    }

    if (estado.modulosCargados[nombreTab] && !forzar) {
      return Promise.resolve(true);
    }

    return Promise.resolve()
      .then(function () {
        return modulo.cargar();
      })
      .then(function () {
        estado.modulosCargados[nombreTab] = true;
        return true;
      })
      .catch(function (error) {
        mostrarMensajeModulo(nombreTab, {
          titulo: 'No se pudo cargar la sección',
          mensaje: 'Ocurrió un problema al cargar "' + nombreTab + '".',
          detalle: obtenerMensaje(error, 'Error desconocido.')
        }, 'error');

        return false;
      });
  }

  function obtenerTabInicial() {
    var hash = String(window.location.hash || '').replace('#', '').trim();

    if (hash && modulos[hash]) {
      return hash;
    }

    return 'inicio';
  }

  function mostrarMensajeModulo(nombreTab, mensaje, tipo) {
    var mapa = {
      inicio: '#inicioMensaje',
      faltantes: '#faltantesMensaje',
      periodos: '#periodosMensaje',
      coordinadores: '#coordinadoresMensaje',
      investigadores: '#investigadoresMensaje',
      reportes: '#reportesRevisionMensaje',
      estudiantes: '#estudiantesMensaje',
      ajustes: '#ajustesMensaje',
      respaldo: '#respaldoMensaje'
    };

    ui.showStatus(mapa[nombreTab] || '#inicioMensaje', mensaje, tipo || 'info');
  }

  function obtenerMensaje(error, fallback) {
    if (!error) return fallback || 'Error desconocido.';

    var partes = [];
    var codigo = error.codigo || error.code || error.name || '';

    if (codigo) partes.push('[' + codigo + ']');
    if (error.operacion) partes.push(String(error.operacion));
    if (error.coleccion) partes.push('colección ' + String(error.coleccion));
    partes.push(error.message || fallback || String(error));

    return partes.join(' · ');
  }

  window.TAAdministradorApp = Object.freeze({
    activarTab: activarTab,
    cargarModulo: cargarModulo,
    ejecutarNormalizacionAutomatica: ejecutarNormalizacionAutomatica,
    estado: estado
  });
})();