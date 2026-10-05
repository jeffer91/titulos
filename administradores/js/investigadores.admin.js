/* Gestión de investigadores y activación de PIN desde Administrador. */
(function () {
  'use strict';

  var ui = window.TAAdminUI;
  var firebaseService = window.TAAdminFirebaseService;
  var config = window.TA_ADMINISTRADORES_CONFIG;
  var investigadores = [];

  function iniciar() {
    var actualizar = ui.qs('#btnActualizarInvestigadores');
    var form = ui.qs('#formCrearInvestigador');

    if (actualizar) actualizar.addEventListener('click', cargar);
    if (form) form.addEventListener('submit', crearInvestigador);
  }

  function cargar() {
    ui.showStatus('#investigadoresMensaje', 'Cargando investigadores...', 'info');

    return firebaseService.listarDocumentos(config.collections.investigadores, { limit: 1000 })
      .then(function (docs) {
        investigadores = (docs || []).map(normalizarInvestigador).sort(function (a, b) {
          return a.nombre.localeCompare(b.nombre);
        });
        renderResumen();
        renderTabla();
        ui.showStatus('#investigadoresMensaje', 'Investigadores actualizados.', 'success');
        return investigadores;
      })
      .catch(function (error) {
        ui.showStatus('#investigadoresMensaje', mensaje(error, 'No se pudieron cargar los investigadores.'), 'error');
        throw error;
      });
  }

  function crearInvestigador(event) {
    event.preventDefault();

    var cedula = soloNumeros(ui.value('#investigadorCedulaInput'));
    var nombre = limpiar(ui.value('#investigadorNombreInput'));
    var email = limpiar(ui.value('#investigadorEmailInput')).toLowerCase();
    var button = ui.qs('#btnCrearInvestigador');

    if (cedula.length !== 10) {
      ui.showStatus('#investigadoresMensaje', 'La cédula debe tener 10 dígitos.', 'error');
      return;
    }
    if (!nombre) {
      ui.showStatus('#investigadoresMensaje', 'Ingresa el nombre del investigador.', 'error');
      return;
    }

    ui.setLoading(button, true, 'Guardando...');

    firebaseService.leerDocumento(config.collections.investigadores, cedula)
      .then(function (existente) {
        if (existente) throw new Error('Ya existe un investigador con esa cédula.');

        return firebaseService.guardarDocumento(config.collections.investigadores, cedula, {
          cedula: cedula,
          nombres: nombre,
          email: email,
          rol: 'investigador',
          activo: true,
          pinCreado: false,
          pinActivo: false,
          origen: 'administrador'
        }, { merge: false });
      })
      .then(function () {
        ui.setValue('#investigadorCedulaInput', '');
        ui.setValue('#investigadorNombreInput', '');
        ui.setValue('#investigadorEmailInput', '');
        ui.showStatus('#investigadoresMensaje', 'Investigador registrado. Ahora puede crear su PIN en el primer ingreso.', 'success');
        return cargar();
      })
      .catch(function (error) {
        ui.showStatus('#investigadoresMensaje', mensaje(error, 'No se pudo registrar el investigador.'), 'error');
      })
      .finally(function () {
        ui.setLoading(button, false);
      });
  }

  function cambiarAcceso(investigador, activar, button) {
    if (activar && !investigador.pinCreado) {
      ui.showStatus('#investigadoresMensaje', 'El investigador todavía no ha creado su PIN.', 'error');
      return;
    }

    ui.setLoading(button, true, activar ? 'Activando...' : 'Desactivando...');

    firebaseService.guardarDocumento(config.collections.investigadores, investigador.id, {
      pinActivo: Boolean(activar),
      pinActivadoEn: activar ? new Date().toISOString() : null,
      pinActivadoPor: activar ? 'administrador' : '',
      pinDesactivadoEn: activar ? null : new Date().toISOString()
    }, { merge: true })
      .then(function () {
        ui.showStatus('#investigadoresMensaje', activar ? 'PIN activado correctamente.' : 'Acceso del investigador desactivado.', 'success');
        return cargar();
      })
      .catch(function (error) {
        ui.showStatus('#investigadoresMensaje', mensaje(error, 'No se pudo actualizar el acceso.'), 'error');
      })
      .finally(function () {
        ui.setLoading(button, false);
      });
  }

  function restablecerPin(investigador, button) {
    ui.confirmar({
      titulo: 'Restablecer PIN',
      mensaje: 'Se eliminará el PIN de ' + investigador.nombre + '. En su siguiente ingreso tendrá que crear uno nuevo y volverá a requerir activación.',
      onConfirm: function () {
        ui.setLoading(button, true, 'Restableciendo...');
        firebaseService.guardarDocumento(config.collections.investigadores, investigador.id, {
          pinHash: '',
          pinCreado: false,
          pinActivo: false,
          pinCreadoEn: null,
          pinActivadoEn: null,
          pinActivadoPor: '',
          pinRestablecidoEn: new Date().toISOString()
        }, { merge: true })
          .then(cargar)
          .catch(function (error) {
            ui.showStatus('#investigadoresMensaje', mensaje(error, 'No se pudo restablecer el PIN.'), 'error');
          })
          .finally(function () {
            ui.setLoading(button, false);
          });
      }
    });
  }

  function renderResumen() {
    ui.setText('#investigadoresTotal', investigadores.length);
    ui.setText('#investigadoresPendientes', investigadores.filter(function (item) {
      return item.pinCreado && !item.pinActivo;
    }).length);
    ui.setText('#investigadoresActivos', investigadores.filter(function (item) {
      return item.pinCreado && item.pinActivo;
    }).length);
  }

  function renderTabla() {
    var body = ui.qs('#investigadoresTableBody');
    if (!body) return;

    body.innerHTML = '';
    if (!investigadores.length) {
      ui.limpiarTabla('#investigadoresTableBody', 6, 'No hay investigadores registrados.');
      return;
    }

    investigadores.forEach(function (investigador) {
      var tr = document.createElement('tr');
      var acciones = document.createElement('div');
      var acceso = document.createElement('button');
      var reset = document.createElement('button');

      tr.innerHTML =
        '<td><strong>' + ui.escapeHtml(investigador.cedula) + '</strong></td>' +
        '<td>' + ui.escapeHtml(investigador.nombre) + '</td>' +
        '<td>' + ui.escapeHtml(investigador.email || '—') + '</td>' +
        '<td></td><td></td><td class="text-right"></td>';

      tr.children[3].appendChild(ui.crearBadge(investigador.pinCreado ? 'Creado' : 'Sin crear', investigador.pinCreado ? 'primary' : 'muted'));
      tr.children[4].appendChild(ui.crearBadge(investigador.pinActivo ? 'Activo' : (investigador.pinCreado ? 'Pendiente' : 'Sin PIN'), investigador.pinActivo ? 'success' : (investigador.pinCreado ? 'warning' : 'muted')));

      acciones.className = 'table-actions';
      acceso.type = 'button';
      acceso.className = 'btn btn--small ' + (investigador.pinActivo ? 'btn--ghost' : 'btn--primary');
      acceso.textContent = investigador.pinActivo ? 'Desactivar' : 'Activar PIN';
      acceso.disabled = !investigador.pinCreado;
      acceso.addEventListener('click', function () {
        cambiarAcceso(investigador, !investigador.pinActivo, acceso);
      });
      acciones.appendChild(acceso);

      if (investigador.pinCreado) {
        reset.type = 'button';
        reset.className = 'btn btn--small btn--secondary';
        reset.textContent = 'Restablecer';
        reset.addEventListener('click', function () { restablecerPin(investigador, reset); });
        acciones.appendChild(reset);
      }

      tr.children[5].appendChild(acciones);
      body.appendChild(tr);
    });
  }

  function normalizarInvestigador(data) {
    return {
      id: data.id || data._docId || soloNumeros(data.cedula || data.identificacion),
      cedula: soloNumeros(data.cedula || data.identificacion || data.numeroIdentificacion || data.id),
      nombre: limpiar(data.nombres || data.nombre || data.nombreCompleto || 'Sin nombre'),
      email: limpiar(data.email || data.correo || '').toLowerCase(),
      pinCreado: Boolean(data.pinCreado || data.pinHash),
      pinActivo: Boolean(data.pinActivo),
      activo: data.activo !== false,
      raw: data
    };
  }

  function soloNumeros(value) { return String(value || '').replace(/\D/g, ''); }
  function limpiar(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
  function mensaje(error, fallback) { return error && error.message ? error.message : fallback; }

  window.TAAdminInvestigadores = Object.freeze({ iniciar: iniciar, cargar: cargar });
})();
