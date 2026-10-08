/* Pantalla Inicio del administrador. */
(function () {
  'use strict';

  var repository = window.TAAdministradorRepository;
  var ui = window.TAAdminUI;
  var config = window.TA_ADMINISTRADORES_CONFIG;

  var estado = {
    periodos: [],
    periodoSeleccionado: ''
  };

  function iniciar() {
    conectarEventos();
  }

  function conectarEventos() {
    var btnActualizar = ui.qs('#btnActualizarInicio');
    var periodoSelect = ui.qs('#inicioPeriodoSelect');

    if (btnActualizar) {
      btnActualizar.addEventListener('click', cargar);
    }

    if (periodoSelect) {
      periodoSelect.addEventListener('change', function () {
        estado.periodoSeleccionado = periodoSelect.value;
        cargarResumen();
      });
    }
  }

  function cargar() {
    ui.showStatus('#inicioMensaje', config.textos.cargando, 'info');

    return repository.listarPeriodos()
      .then(function (periodos) {
        estado.periodos = periodos || [];
        llenarSelectorPeriodos();
        return cargarResumen();
      })
      .catch(function (error) {
        ui.showStatus('#inicioMensaje', obtenerMensaje(error, 'No se pudo cargar el inicio.'), 'error');
      });
  }

  function llenarSelectorPeriodos() {
    var activos = estado.periodos.filter(function (periodo) {
      return periodo.activo;
    });

    // La vista histórica sigue siendo consultable, pero no se identifica como activa.
    var lista = activos.length ? activos : estado.periodos;
    if (!lista.some(function(p){return p.id===estado.periodoSeleccionado;})) {
      estado.periodoSeleccionado = lista.length ? lista[0].id : '';
    }

    if (!estado.periodoSeleccionado && lista.length) {
      estado.periodoSeleccionado = lista[0].id;
    }

    ui.llenarSelect('#inicioPeriodoSelect', lista.map(function (periodo) {
      return {
        value: periodo.id,
        label: periodo.label + (periodo.activo ? ' · Activo' : ' · Desactivado (histórico)')
      };
    }), {
      placeholder: false,
      selected: estado.periodoSeleccionado
    });
  }

  function cargarResumen() {
    var periodo = estado.periodoSeleccionado || ui.value('#inicioPeriodoSelect');

    ui.showStatus('#inicioMensaje', config.textos.cargando, 'info');

    return Promise.all([
      repository.listarEstudiantesConTitulos(periodo),
      repository.obtenerFaltantesRevision(periodo)
    ]).then(function (resultados) {
      var estudiantes = resultados[0] || [];
      var faltantes = resultados[1] || {
        coordinacion: { total: 0, carreras: [] },
        investigacion: { total: 0, carreras: [] }
      };
      var stats = calcularStats(estudiantes);

      stats.coordinacionPendientes = Number(faltantes.coordinacion && faltantes.coordinacion.total || 0);
      stats.investigacionPendientes = Number(faltantes.investigacion && faltantes.investigacion.total || 0);

      ui.renderInicioResumen(stats);
      actualizarPeriodoHeader(periodo);

      window.dispatchEvent(new CustomEvent('admin:faltantes-actualizados', {
        detail: {
          total: stats.coordinacionPendientes + stats.investigacionPendientes,
          coordinacion: stats.coordinacionPendientes,
          investigacion: stats.investigacionPendientes
        }
      }));

      ui.showStatus('#inicioMensaje', 'Resumen actualizado correctamente.', 'success');
    }).catch(function (error) {
      ui.showStatus('#inicioMensaje', obtenerMensaje(error, 'No se pudo actualizar el resumen.'), 'error');
    });
  }

  function actualizarPeriodoHeader(periodoId) {
    var encontrado = estado.periodos.filter(function (periodo) {
      return periodo.id === periodoId;
    })[0];

    ui.setText('#adminPeriodoActual', encontrado ? encontrado.label : repository.formatearPeriodoId(periodoId));
  }

  function cargarPendientesPorPeriodo() {
    var periodosActivos = estado.periodos.filter(function (periodo) {
      return periodo.activo;
    });

    var lista = periodosActivos; // Nunca contabilizar desactivados como pendientes activos.

    if (!lista.length) return Promise.resolve([]);

    return Promise.all(lista.map(function (periodo) {
      return repository.listarEstudiantesConTitulos(periodo.id).then(function (estudiantes) {
        return {
          periodoId: periodo.id,
          periodoLabel: periodo.label,
          total: contarPendientes(estudiantes)
        };
      });
    })).then(function (items) {
      return items.sort(function (a, b) {
        return Number(b.total || 0) - Number(a.total || 0);
      });
    });
  }

  function calcularStats(estudiantes) {
    var stats = {
      totalEstudiantes: estudiantes.length,
      sinEnviar: 0,
      enviados: 0,
      pendientes: 0,
      devueltos: 0,
      aprobados: 0
    };

    estudiantes.forEach(function (item) {
      if (item.estado === config.estadosTitulo.sinEnviar) {
        stats.sinEnviar += 1;
        return;
      }

      stats.enviados += 1;

      if (item.estado === config.estadosTitulo.aprobado) {
        stats.aprobados += 1;
        return;
      }

      if (item.estado === config.estadosTitulo.devuelto) {
        stats.devueltos += 1;
        return;
      }

      stats.pendientes += 1;
    });

    return stats;
  }

  function contarPendientes(estudiantes) {
    var total = 0;

    estudiantes.forEach(function (item) {
      if (item.estado === config.estadosTitulo.pendiente || item.estado === config.estadosTitulo.enviado) {
        total += 1;
      }
    });

    return total;
  }

  function calcularPendientesPorCarrera(estudiantes) {
    var mapa = {};

    estudiantes.forEach(function (item) {
      if (item.estado !== config.estadosTitulo.pendiente && item.estado !== config.estadosTitulo.enviado) return;

      var carrera = item.carrera || item.nombreCarrera || 'Sin carrera';

      if (!mapa[carrera]) {
        mapa[carrera] = {
          carrera: carrera,
          total: 0
        };
      }

      mapa[carrera].total += 1;
    });

    return Object.keys(mapa).map(function (key) {
      return mapa[key];
    }).sort(function (a, b) {
      return Number(b.total || 0) - Number(a.total || 0);
    });
  }

  function obtenerMensaje(error, fallback) {
    return error && error.message ? error.message : fallback;
  }

  window.TAAdminInicio = Object.freeze({
    iniciar: iniciar,
    cargar: cargar,
    cargarResumen: cargarResumen
  });
})();