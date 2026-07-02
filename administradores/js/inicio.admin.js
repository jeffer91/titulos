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

    var lista = activos.length ? activos : estado.periodos;

    if (!estado.periodoSeleccionado && lista.length) {
      estado.periodoSeleccionado = lista[0].id;
    }

    ui.llenarSelect('#inicioPeriodoSelect', lista.map(function (periodo) {
      return {
        value: periodo.id,
        label: periodo.label + (periodo.activo ? ' · Activo' : '')
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
      cargarPendientesPorPeriodo()
    ]).then(function (resultados) {
      var estudiantes = resultados[0];
      var pendientesPeriodo = resultados[1];
      var stats = calcularStats(estudiantes);
      var pendientesCarrera = calcularPendientesPorCarrera(estudiantes);

      ui.renderInicioResumen(stats);
      ui.renderPendientesPorCarrera(pendientesCarrera);
      ui.renderPendientesPorPeriodo(pendientesPeriodo);

      ui.showStatus('#inicioMensaje', 'Resumen actualizado correctamente.', 'success');
    }).catch(function (error) {
      ui.showStatus('#inicioMensaje', obtenerMensaje(error, 'No se pudo actualizar el resumen.'), 'error');
    });
  }

  function cargarPendientesPorPeriodo() {
    var periodosActivos = estado.periodos.filter(function (periodo) {
      return periodo.activo;
    });

    var lista = periodosActivos.length ? periodosActivos : estado.periodos;

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