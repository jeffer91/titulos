/* Pantalla Estudiantes del administrador. */
(function () {
  'use strict';

  var repository = window.TAAdministradorRepository;
  var ui = window.TAAdminUI;
  var config = window.TA_ADMINISTRADORES_CONFIG;

  var estado = {
    periodos: [],
    estudiantes: [],
    filtrados: []
  };

  function iniciar() {
    conectarEventos();
  }

  function conectarEventos() {
    var btnActualizar = ui.qs('#btnActualizarEstudiantes');
    var formFiltros = ui.qs('#formFiltrosEstudiantes');
    var btnLimpiar = ui.qs('#btnLimpiarFiltrosEstudiantes');

    if (btnActualizar) {
      btnActualizar.addEventListener('click', cargar);
    }

    if (formFiltros) {
      formFiltros.addEventListener('submit', function (event) {
        event.preventDefault();
        aplicarFiltros();
      });
    }

    if (btnLimpiar) {
      btnLimpiar.addEventListener('click', limpiarFiltros);
    }
  }

  function cargar() {
    ui.showStatus('#estudiantesMensaje', config.textos.cargando, 'info');

    return repository.listarPeriodos()
      .then(function (periodos) {
        estado.periodos = periodos || [];
        llenarFiltroPeriodos();
        return cargarEstudiantes();
      })
      .catch(function (error) {
        ui.showStatus('#estudiantesMensaje', obtenerMensaje(error, 'No se pudieron cargar los estudiantes.'), 'error');
      });
  }

  function cargarEstudiantes() {
    var periodo = ui.value('#estFiltroPeriodo');

    return repository.listarEstudiantesConTitulos(periodo)
      .then(function (estudiantes) {
        estado.estudiantes = estudiantes || [];
        llenarFiltroCarreras();
        aplicarFiltros();
        ui.showStatus('#estudiantesMensaje', 'Estudiantes actualizados correctamente.', 'success');
      });
  }

  function llenarFiltroPeriodos() {
    var activos = estado.periodos.filter(function (periodo) {
      return periodo.activo;
    });

    var lista = activos.length ? activos : estado.periodos;

    ui.llenarSelect('#estFiltroPeriodo', lista.map(function (periodo) {
      return {
        value: periodo.id,
        label: periodo.label + (periodo.activo ? ' · Activo' : '')
      };
    }), {
      placeholderText: 'Todos los períodos activos',
      placeholderValue: ''
    });
  }

  function llenarFiltroCarreras() {
    var mapa = {};

    estado.estudiantes.forEach(function (item) {
      var carrera = item.carrera || item.nombreCarrera;
      if (carrera) mapa[carrera] = true;
    });

    var carreras = Object.keys(mapa).sort().map(function (carrera) {
      return {
        value: carrera,
        label: carrera
      };
    });

    ui.llenarSelect('#estFiltroCarrera', carreras, {
      placeholderText: 'Todas las carreras',
      placeholderValue: ''
    });
  }

  function aplicarFiltros() {
    var periodo = ui.value('#estFiltroPeriodo');
    var busqueda = normalizarTexto(ui.value('#estFiltroBusqueda'));
    var carrera = ui.value('#estFiltroCarrera');
    var estadoFiltro = ui.value('#estFiltroEstado');
    var telegramFiltro = ui.value('#estFiltroTelegram');

    estado.filtrados = estado.estudiantes.filter(function (item) {
      var textoBusqueda = normalizarTexto([
        item.cedula,
        item.nombres,
        item.carrera,
        item.nombreCarrera
      ].join(' '));

      if (periodo && item.periodoId !== periodo) return false;

      if (busqueda && textoBusqueda.indexOf(busqueda) === -1) return false;

      if (carrera && item.carrera !== carrera && item.nombreCarrera !== carrera) return false;

      if (estadoFiltro && !coincideEstado(item, estadoFiltro)) return false;

      if (telegramFiltro === 'CON_TELEGRAM' && !tieneTelegram(item)) return false;

      if (telegramFiltro === 'SIN_TELEGRAM' && tieneTelegram(item)) return false;

      return true;
    });

    renderTabla();
  }

  function limpiarFiltros() {
    ui.setValue('#estFiltroBusqueda', '');
    ui.setValue('#estFiltroCarrera', '');
    ui.setValue('#estFiltroEstado', '');
    ui.setValue('#estFiltroTelegram', '');
    aplicarFiltros();
  }

  function renderTabla() {
    var body = ui.qs('#estudiantesTableBody');

    if (!body) return;

    body.innerHTML = '';

    if (!estado.filtrados.length) {
      ui.limpiarTabla('#estudiantesTableBody', 6, 'No se encontraron estudiantes con los filtros seleccionados.');
      return;
    }

    estado.filtrados.forEach(function (item) {
      var tr = document.createElement('tr');

      tr.innerHTML =
        '<td>' + ui.escapeHtml(item.cedula) + '</td>' +
        '<td><strong>' + ui.escapeHtml(item.nombres) + '</strong></td>' +
        '<td>' + ui.escapeHtml(item.carrera || item.nombreCarrera) + '</td>' +
        '<td>' + ui.escapeHtml(item.periodoLabel || item.periodoId) + '</td>' +
        '<td></td>' +
        '<td class="text-right"></td>';

      var estadoCell = tr.children[4];
      var actionCell = tr.children[5];
      var button = document.createElement('button');

      estadoCell.appendChild(ui.badgeEstadoTitulo(item.estado));

      button.type = 'button';
      button.className = 'btn btn--small btn--primary';
      button.textContent = 'Ver más';
      button.addEventListener('click', function () {
        verMas(item);
      });

      actionCell.appendChild(button);
      body.appendChild(tr);
    });
  }

  function verMas(item) {
    ui.setText('#modalDetalleTitulo', item.nombres || 'Detalle del estudiante');
    ui.setText('#modalDetalleSubtitulo', (item.cedula || '') + ' · ' + (item.carrera || item.nombreCarrera || ''));

    ui.abrirDetalleEstudiante(item);
    agregarAccionesDetalle(item);
  }

  function agregarAccionesDetalle(item) {
    var container = ui.qs('#detalleEstudianteContenido');

    if (!container) return;

    var acciones = document.createElement('article');
    acciones.className = 'detail-box';

    var h3 = document.createElement('h3');
    h3.textContent = 'Acciones administrativas';
    acciones.appendChild(h3);

    if (item.titulo && item.titulo.id) {
      var p = document.createElement('p');
      p.textContent = 'Puedes archivar el intento actual para permitir que el estudiante registre nuevamente sus títulos.';
      acciones.appendChild(p);

      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn--danger';
      button.textContent = 'Archivar intento y permitir nuevo envío';
      button.addEventListener('click', function () {
        confirmarArchivarIntento(item);
      });

      acciones.appendChild(button);
    } else {
      var sinTitulo = document.createElement('p');
      sinTitulo.textContent = 'El estudiante todavía no tiene un intento enviado para archivar.';
      acciones.appendChild(sinTitulo);
    }

    container.appendChild(acciones);
  }

  function confirmarArchivarIntento(item) {
    ui.confirmar({
      titulo: 'Archivar intento',
      mensaje: 'Se guardará una copia del intento en el historial y el estudiante podrá enviar nuevamente sus títulos. ¿Deseas continuar?',
      onConfirm: function () {
        archivarIntento(item);
      }
    });
  }

  function archivarIntento(item) {
    if (!item.titulo || !item.titulo.id) {
      ui.showStatus('#estudiantesMensaje', 'No se encontró un intento para archivar.', 'error');
      return;
    }

    ui.showStatus('#estudiantesMensaje', 'Archivando intento...', 'info');

    repository.archivarIntento(item.titulo.id)
      .then(function () {
        ui.cerrarDetalleEstudiante();
        ui.showStatus('#estudiantesMensaje', 'Intento archivado. El estudiante podrá enviar nuevamente.', 'success');
        return cargarEstudiantes();
      })
      .catch(function (error) {
        ui.showStatus('#estudiantesMensaje', obtenerMensaje(error, 'No se pudo archivar el intento.'), 'error');
      });
  }

  function coincideEstado(item, filtro) {
    if (filtro === 'PENDIENTE') {
      return item.estado === config.estadosTitulo.pendiente || item.estado === config.estadosTitulo.enviado;
    }

    if (filtro === 'ENVIADO') {
      return Boolean(item.titulo);
    }

    return item.estado === filtro;
  }

  function tieneTelegram(item) {
    return Boolean(String(item.telegram || item.telegramUser || '').trim());
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

  window.TAAdminEstudiantes = Object.freeze({
    iniciar: iniciar,
    cargar: cargar,
    aplicarFiltros: aplicarFiltros
  });
})();