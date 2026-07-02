/* Pantalla Coordinadores del administrador. */
(function () {
  'use strict';

  var repository = window.TAAdministradorRepository;
  var ui = window.TAAdminUI;
  var config = window.TA_ADMINISTRADORES_CONFIG;

  var estado = {
    coordinadores: [],
    carreras: []
  };

  function iniciar() {
    conectarEventos();
  }

  function conectarEventos() {
    var btnActualizar = ui.qs('#btnActualizarCoordinadores');
    var formCrear = ui.qs('#formCrearCoordinador');
    var formEliminar = ui.qs('#formEliminarCoordinador');

    if (btnActualizar) {
      btnActualizar.addEventListener('click', cargar);
    }

    if (formCrear) {
      formCrear.addEventListener('submit', manejarCrearCoordinador);
    }

    if (formEliminar) {
      formEliminar.addEventListener('submit', manejarEliminarCoordinador);
    }
  }

  function cargar() {
    ui.showStatus('#coordinadoresMensaje', config.textos.cargando, 'info');

    return Promise.all([
      repository.listarCoordinadores(),
      repository.obtenerCarreras()
    ]).then(function (resultados) {
      estado.coordinadores = resultados[0] || [];
      estado.carreras = resultados[1] || [];

      llenarSelectEliminar();
      renderCarreras();

      ui.showStatus('#coordinadoresMensaje', 'Coordinadores actualizados correctamente.', 'success');
    }).catch(function (error) {
      ui.showStatus('#coordinadoresMensaje', obtenerMensaje(error, 'No se pudieron cargar los coordinadores.'), 'error');
    });
  }

  function manejarCrearCoordinador(event) {
    event.preventDefault();

    var button = ui.qs('#btnCrearCoordinador');
    var nombre = ui.value('#coordNombreInput');

    if (!nombre) {
      ui.showStatus('#coordinadoresMensaje', 'Ingresa el nombre del coordinador.', 'error');
      return;
    }

    ui.setLoading(button, true, 'Creando...');
    ui.showStatus('#coordinadoresMensaje', 'Creando coordinador...', 'info');

    repository.crearCoordinador(nombre)
      .then(function () {
        ui.setValue('#coordNombreInput', '');
        ui.showStatus('#coordinadoresMensaje', 'Coordinador creado correctamente.', 'success');
        return cargar();
      })
      .catch(function (error) {
        ui.showStatus('#coordinadoresMensaje', obtenerMensaje(error, 'No se pudo crear el coordinador.'), 'error');
      })
      .finally(function () {
        ui.setLoading(button, false);
      });
  }

  function manejarEliminarCoordinador(event) {
    event.preventDefault();

    var coordinadorId = ui.value('#coordEliminarSelect');

    if (!coordinadorId) {
      ui.showStatus('#coordinadoresMensaje', 'Selecciona un coordinador para eliminar.', 'error');
      return;
    }

    var coordinador = buscarCoordinador(coordinadorId);

    ui.confirmar({
      titulo: 'Eliminar coordinador',
      mensaje: 'Se desactivará el coordinador "' + (coordinador ? coordinador.nombre : coordinadorId) + '" y se retirarán sus carreras asignadas. ¿Deseas continuar?',
      onConfirm: function () {
        eliminarCoordinadorConfirmado(coordinadorId);
      }
    });
  }

  function eliminarCoordinadorConfirmado(coordinadorId) {
    var button = ui.qs('#btnEliminarCoordinador');

    ui.setLoading(button, true, 'Eliminando...');
    ui.showStatus('#coordinadoresMensaje', 'Actualizando coordinador...', 'info');

    repository.eliminarCoordinador(coordinadorId)
      .then(function () {
        ui.showStatus('#coordinadoresMensaje', 'Coordinador eliminado correctamente.', 'success');
        return cargar();
      })
      .catch(function (error) {
        ui.showStatus('#coordinadoresMensaje', obtenerMensaje(error, 'No se pudo eliminar el coordinador.'), 'error');
      })
      .finally(function () {
        ui.setLoading(button, false);
      });
  }

  function llenarSelectEliminar() {
    var activos = estado.coordinadores.filter(function (coordinador) {
      return coordinador.activo;
    });

    ui.llenarSelect('#coordEliminarSelect', activos.map(function (coordinador) {
      return {
        value: coordinador.id,
        label: coordinador.nombre
      };
    }), {
      placeholderText: 'Selecciona un coordinador'
    });
  }

  function renderCarreras() {
    var body = ui.qs('#coordinadoresCarrerasBody');

    if (!body) return;

    body.innerHTML = '';

    if (!estado.carreras.length) {
      ui.limpiarTabla('#coordinadoresCarrerasBody', 4, 'No se encontraron carreras.');
      return;
    }

    estado.carreras.forEach(function (carrera) {
      var nombreCarrera = carrera.nombreCarrera;
      var asignado = buscarCoordinadorPorCarrera(nombreCarrera);
      var tr = document.createElement('tr');

      tr.innerHTML =
        '<td><strong>' + ui.escapeHtml(nombreCarrera) + '</strong></td>' +
        '<td></td>' +
        '<td></td>' +
        '<td class="text-right"></td>';

      var selectCell = tr.children[1];
      var estadoCell = tr.children[2];
      var actionCell = tr.children[3];

      var select = crearSelectCoordinadores(asignado ? asignado.id : '');
      var button = document.createElement('button');

      button.type = 'button';
      button.className = 'btn btn--small btn--primary';
      button.textContent = 'Guardar';
      button.addEventListener('click', function () {
        asignarCarrera(nombreCarrera, select.value, button);
      });

      if (asignado) {
        estadoCell.appendChild(ui.crearBadge('Asignado', 'success'));
      } else {
        estadoCell.appendChild(ui.crearBadge('Sin coordinador', 'warning'));
      }

      selectCell.appendChild(select);
      actionCell.appendChild(button);
      body.appendChild(tr);
    });
  }

  function crearSelectCoordinadores(selectedId) {
    var select = document.createElement('select');
    var placeholder = document.createElement('option');

    placeholder.value = '';
    placeholder.textContent = 'Sin coordinador';
    select.appendChild(placeholder);

    estado.coordinadores.filter(function (coordinador) {
      return coordinador.activo;
    }).forEach(function (coordinador) {
      var option = document.createElement('option');
      option.value = coordinador.id;
      option.textContent = coordinador.nombre;

      if (selectedId && selectedId === coordinador.id) {
        option.selected = true;
      }

      select.appendChild(option);
    });

    return select;
  }

  function asignarCarrera(nombreCarrera, coordinadorId, button) {
    ui.setLoading(button, true, 'Guardando...');
    ui.showStatus('#coordinadoresMensaje', 'Guardando asignación...', 'info');

    repository.asignarCarreraACoordinador(nombreCarrera, coordinadorId)
      .then(function () {
        ui.showStatus('#coordinadoresMensaje', 'Carrera asignada correctamente.', 'success');
        return cargar();
      })
      .catch(function (error) {
        ui.showStatus('#coordinadoresMensaje', obtenerMensaje(error, 'No se pudo guardar la asignación.'), 'error');
      })
      .finally(function () {
        ui.setLoading(button, false);
      });
  }

  function buscarCoordinador(id) {
    for (var i = 0; i < estado.coordinadores.length; i += 1) {
      if (estado.coordinadores[i].id === id) return estado.coordinadores[i];
    }

    return null;
  }

  function buscarCoordinadorPorCarrera(nombreCarrera) {
    var carreraKey = normalizarTexto(nombreCarrera);

    for (var i = 0; i < estado.coordinadores.length; i += 1) {
      var coordinador = estado.coordinadores[i];
      var carreras = coordinador.carreras || [];
      var carrerasAsignadas = coordinador.carrerasAsignadas || [];

      for (var j = 0; j < carreras.length; j += 1) {
        if (normalizarTexto(carreras[j]) === carreraKey) return coordinador;
      }

      for (var k = 0; k < carrerasAsignadas.length; k += 1) {
        if (normalizarTexto(carrerasAsignadas[k].nombreCarrera) === carreraKey) return coordinador;
      }
    }

    return null;
  }

  function normalizarTexto(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();
  }

  function obtenerMensaje(error, fallback) {
    return error && error.message ? error.message : fallback;
  }

  window.TAAdminCoordinadores = Object.freeze({
    iniciar: iniciar,
    cargar: cargar
  });
})();