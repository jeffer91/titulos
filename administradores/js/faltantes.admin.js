/* Módulo de faltantes del administrador. */
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
    var btn = ui.qs('#btnActualizarFaltantes');
    var select = ui.qs('#faltantesPeriodoSelect');

    if (btn) btn.addEventListener('click', cargarDatos);

    if (select) {
      select.addEventListener('change', function () {
        estado.periodoSeleccionado = select.value;
        cargarDatos();
      });
    }
  }

  function cargar() {
    ui.showStatus('#faltantesMensaje', config.textos.cargando, 'info');

    return repository.listarPeriodos()
      .then(function (periodos) {
        estado.periodos = periodos || [];
        llenarPeriodos();
        return cargarDatos();
      })
      .catch(function (error) {
        ui.showStatus('#faltantesMensaje', obtenerMensaje(error, 'No se pudieron cargar los faltantes.'), 'error');
      });
  }

  function llenarPeriodos() {
    var activos = estado.periodos.filter(function (periodo) { return periodo.activo; });
    var lista = activos.length ? activos : estado.periodos;

    if (!estado.periodoSeleccionado && lista.length) {
      estado.periodoSeleccionado = lista[0].id;
    }

    ui.llenarSelect('#faltantesPeriodoSelect', lista.map(function (periodo) {
      return {
        value: periodo.id,
        label: periodo.label + (periodo.activo ? ' · Activo' : '')
      };
    }), {
      placeholder: false,
      selected: estado.periodoSeleccionado
    });
  }

  function cargarDatos() {
    var periodo = estado.periodoSeleccionado || ui.value('#faltantesPeriodoSelect');

    ui.showStatus('#faltantesMensaje', config.textos.cargando, 'info');

    return repository.obtenerFaltantesRevision(periodo)
      .then(function (resultado) {
        resultado = resultado || {
          coordinacion: { total: 0, carreras: [] },
          investigacion: { total: 0, carreras: [] },
          total: 0
        };

        ui.setText('#faltantesCoordinacionTotal', resultado.coordinacion.total || 0);
        ui.setText('#faltantesInvestigacionTotal', resultado.investigacion.total || 0);
        ui.setText('#faltantesTotalGeneral', resultado.total || 0);
        renderTabla('#faltantesCoordinacionBody', resultado.coordinacion.carreras, 'Coordinación');
        renderTabla('#faltantesInvestigacionBody', resultado.investigacion.carreras, 'Investigación');

        window.dispatchEvent(new CustomEvent('admin:faltantes-actualizados', {
          detail: {
            total: Number(resultado.total || 0),
            coordinacion: Number(resultado.coordinacion.total || 0),
            investigacion: Number(resultado.investigacion.total || 0)
          }
        }));

        ui.showStatus('#faltantesMensaje', 'Faltantes actualizados correctamente.', 'success');
        return resultado;
      })
      .catch(function (error) {
        ui.showStatus('#faltantesMensaje', obtenerMensaje(error, 'No se pudieron actualizar los faltantes.'), 'error');
        throw error;
      });
  }

  function renderTabla(selector, items, etapa) {
    var body = ui.qs(selector);
    if (!body) return;

    body.innerHTML = '';

    if (!items || !items.length) {
      ui.limpiarTabla(selector, 2, 'No hay pendientes de ' + etapa + '.');
      return;
    }

    items.forEach(function (item) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td><strong>' + ui.escapeHtml(item.carrera || 'Sin carrera') + '</strong></td>' +
        '<td class="text-right"><span class="pending-count">' + Number(item.total || 0) + '</span></td>';
      body.appendChild(tr);
    });
  }

  function obtenerMensaje(error, fallback) {
    return error && error.message ? error.message : fallback;
  }

  window.TAAdminFaltantes = Object.freeze({
    iniciar: iniciar,
    cargar: cargar,
    cargarDatos: cargarDatos
  });
})();