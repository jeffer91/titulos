/* Pantalla Períodos del administrador. */
(function () {
  'use strict';

  var repository = window.TAAdministradorRepository;
  var ui = window.TAAdminUI;
  var config = window.TA_ADMINISTRADORES_CONFIG;

  var estado = {
    periodos: []
  };

  function iniciar() {
    conectarEventos();
  }

  function conectarEventos() {
    var btnActualizar = ui.qs('#btnActualizarPeriodos');

    if (btnActualizar) {
      btnActualizar.addEventListener('click', cargar);
    }
  }

  function cargar() {
    ui.showStatus('#periodosMensaje', config.textos.cargando, 'info');

    return repository.listarPeriodos()
      .then(function (periodos) {
        estado.periodos = periodos || [];
        render();
        ui.showStatus('#periodosMensaje', 'Períodos actualizados correctamente.', 'success');
      })
      .catch(function (error) {
        ui.showStatus('#periodosMensaje', obtenerMensaje(error, 'No se pudieron cargar los períodos.'), 'error');
      });
  }

  function render() {
    var body = ui.qs('#periodosTableBody');

    if (!body) return;

    body.innerHTML = '';

    if (!estado.periodos.length) {
      ui.limpiarTabla('#periodosTableBody', 5, 'No se encontraron períodos en Firebase.');
      return;
    }

    estado.periodos.forEach(function (periodo) {
      var tr = document.createElement('tr');
      var estadoBadge = periodo.activo
        ? '<span class="badge badge--success">Activo</span>'
        : '<span class="badge badge--muted">Desactivado</span>';

      tr.innerHTML =
        '<td><strong>' + ui.escapeHtml(periodo.label) + '</strong></td>' +
        '<td>' + ui.escapeHtml(periodo.id) + '</td>' +
        '<td>' + ui.escapeHtml(periodo.origen || 'detectado') + '</td>' +
        '<td>' + estadoBadge + '</td>' +
        '<td class="text-right"></td>';

      var actionCell = tr.querySelector('td:last-child');
      var button = document.createElement('button');

      button.type = 'button';
      button.className = periodo.activo ? 'btn btn--small btn--ghost' : 'btn btn--small btn--primary';
      button.textContent = periodo.activo ? 'Desactivar' : 'Activar';
      button.addEventListener('click', function () {
        cambiarEstado(periodo.id, !periodo.activo, button);
      });

      actionCell.appendChild(button);
      body.appendChild(tr);
    });
  }

  function cambiarEstado(periodoId, activo, button) {
    ui.setLoading(button, true, activo ? 'Activando...' : 'Desactivando...');
    ui.showStatus('#periodosMensaje', 'Actualizando período...', 'info');

    repository.cambiarEstadoPeriodo(periodoId, activo)
      .then(function () {
        ui.showStatus('#periodosMensaje', 'Estado del período actualizado correctamente.', 'success');
        window.dispatchEvent(new CustomEvent('admin:periodos-actualizados'));
        return cargar();
      })
      .catch(function (error) {
        ui.showStatus('#periodosMensaje', obtenerMensaje(error, 'No se pudo actualizar el período.'), 'error');
      })
      .finally(function () {
        ui.setLoading(button, false);
      });
  }

  function obtenerMensaje(error, fallback) {
    return error && error.message ? error.message : fallback;
  }

  window.TAAdminPeriodos = Object.freeze({
    iniciar: iniciar,
    cargar: cargar
  });
})();