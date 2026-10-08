/* Reportes de revisiones de Investigación para Administración. */
(function () {
  'use strict';

  var repository = window.TAAdministradorRepository;
  var ui = window.TAAdminUI;
  var reportService = window.TARevisionReportService;
  var pdfService = window.TARevisionPdfService;

  var estado = {
    revisiones: [],
    filtradas: []
  };

  function iniciar() {
    var btnActualizar = ui.qs('#btnActualizarReportesRevision');
    var btnPdf = ui.qs('#btnDescargarReportesRevisionPdf');
    var btnLimpiar = ui.qs('#btnLimpiarReportesRevision');

    if (btnActualizar) btnActualizar.addEventListener('click', cargar);
    if (btnPdf) btnPdf.addEventListener('click', descargarPdf);
    if (btnLimpiar) btnLimpiar.addEventListener('click', limpiarFiltros);

    [
      '#reporteRevisionPeriodo',
      '#reporteRevisionInvestigador',
      '#reporteRevisionCarrera',
      '#reporteRevisionResultado',
      '#reporteRevisionDesde',
      '#reporteRevisionHasta'
    ].forEach(function (selector) {
      var node = ui.qs(selector);
      if (node) node.addEventListener('change', aplicarFiltros);
    });
  }

  function cargar() {
    if (!reportService) {
      ui.showStatus('#reportesRevisionMensaje', 'No se cargó el motor de reportes.', 'error');
      return Promise.reject(new Error('Motor de reportes no disponible.'));
    }

    ui.showStatus('#reportesRevisionMensaje', 'Cargando revisiones de Investigación...', 'info');

    return repository.listarRevisionesInvestigacion()
      .then(function (items) {
        estado.revisiones = items || [];
        cargarSelectores();
        aplicarFiltros();

        ui.showStatus(
          '#reportesRevisionMensaje',
          estado.revisiones.length
            ? 'Reporte actualizado: ' + estado.revisiones.length + ' revisiones registradas.'
            : 'No hay revisiones de Investigación registradas.',
          estado.revisiones.length ? 'success' : 'info'
        );

        return estado.revisiones;
      })
      .catch(function (error) {
        estado.revisiones = [];
        estado.filtradas = [];
        renderResumen();
        renderTabla();
        ui.showStatus(
          '#reportesRevisionMensaje',
          error && error.message ? error.message : 'No se pudieron cargar las revisiones.',
          'error'
        );
        throw error;
      });
  }

  function cargarSelectores() {
    var options = reportService.opciones(estado.revisiones);

    llenarSelectConTodos('#reporteRevisionPeriodo', options.periodos, 'Todos los períodos');
    llenarSelectConTodos('#reporteRevisionInvestigador', options.investigadores, 'Todos los investigadores');
    llenarSelectConTodos('#reporteRevisionCarrera', options.carreras, 'Todas las carreras');
  }

  function llenarSelectConTodos(selector, items, placeholder) {
    var node = ui.qs(selector);
    if (!node) return;

    var actual = node.value;
    node.innerHTML = '';

    var first = document.createElement('option');
    first.value = '';
    first.textContent = placeholder;
    node.appendChild(first);

    (items || []).forEach(function (item) {
      var option = document.createElement('option');
      option.value = item.value;
      option.textContent = item.label;
      node.appendChild(option);
    });

    if (actual && Array.prototype.some.call(node.options, function (option) {
      return option.value === actual;
    })) {
      node.value = actual;
    }
  }

  function aplicarFiltros() {
    if (!reportService) return;

    estado.filtradas = reportService.filtrar(estado.revisiones, {
      periodo: ui.value('#reporteRevisionPeriodo'),
      investigador: ui.value('#reporteRevisionInvestigador'),
      carrera: ui.value('#reporteRevisionCarrera'),
      resultado: ui.value('#reporteRevisionResultado'),
      desde: ui.value('#reporteRevisionDesde'),
      hasta: ui.value('#reporteRevisionHasta')
    });

    renderResumen();
    renderTabla();
  }

  function renderResumen() {
    var resumen = reportService
      ? reportService.resumen(estado.filtradas)
      : { total: 0, aprobados: 0, devueltos: 0, investigadores: 0 };

    ui.setText('#reporteRevisionTotal', resumen.total || 0);
    ui.setText('#reporteRevisionAprobados', resumen.aprobados || 0);
    ui.setText('#reporteRevisionDevueltos', resumen.devueltos || 0);
    ui.setText('#reporteRevisionInvestigadoresTotal', resumen.investigadores || 0);
  }

  function renderTabla() {
    var body = ui.qs('#reportesRevisionBody');
    if (!body) return;

    body.innerHTML = '';

    if (!estado.filtradas.length) {
      ui.limpiarTabla('#reportesRevisionBody', 8, 'No hay revisiones que coincidan con los filtros.');
      return;
    }

    estado.filtradas.forEach(function (item) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + ui.escapeHtml(formatearFecha(item.fechaRevision)) + '</td>' +
        '<td><strong>' + ui.escapeHtml(item.investigadorNombre || item.investigadorCedula || '—') + '</strong></td>' +
        '<td>' + ui.escapeHtml(item.nombres || '—') + '</td>' +
        '<td>' + ui.escapeHtml(item.cedula || '—') + '</td>' +
        '<td>' + ui.escapeHtml(item.carrera || '—') + '</td>' +
        '<td><span class="report-result report-result--' + claseResultado(item.estadoRevision) + '">' +
          ui.escapeHtml(item.resultadoLabel || item.estadoRevision || '—') +
        '</span></td>' +
        '<td class="report-title-cell">' + ui.escapeHtml(item.tituloFinal || '—') + '</td>' +
        '<td class="report-observation-cell">' + ui.escapeHtml(item.observacion || '—') + '</td>';
      body.appendChild(tr);
    });
  }

  function descargarPdf() {
    if (!pdfService || !reportService) {
      ui.showStatus('#reportesRevisionMensaje', 'No se cargó el generador PDF.', 'error');
      return;
    }

    if (!estado.filtradas.length) {
      ui.showStatus('#reportesRevisionMensaje', 'No hay registros para incluir en el PDF.', 'warning');
      return;
    }

    try {
      var periodo = ui.value('#reporteRevisionPeriodo');
      var investigador = ui.value('#reporteRevisionInvestigador');
      var carrera = ui.value('#reporteRevisionCarrera');
      var resultado = ui.value('#reporteRevisionResultado');
      var desde = ui.value('#reporteRevisionDesde');
      var hasta = ui.value('#reporteRevisionHasta');

      var filename = pdfService.descargar({
        titulo: 'REPORTE DE REVISIONES DE INVESTIGACIÓN',
        subtitulo: 'Administrador · Sistema de Titulación',
        revisiones: estado.filtradas,
        resumen: reportService.resumen(estado.filtradas),
        filtros: {
          periodo: periodo,
          periodoLabel: periodo ? textoSeleccionado('#reporteRevisionPeriodo') : 'Todos',
          investigador: investigador,
          investigadorLabel: investigador ? textoSeleccionado('#reporteRevisionInvestigador') : 'Todos',
          carrera: carrera,
          resultado: resultado,
          resultadoLabel: resultado ? textoSeleccionado('#reporteRevisionResultado') : 'Todos',
          desde: desde,
          hasta: hasta
        }
      });

      ui.showStatus('#reportesRevisionMensaje', 'PDF generado: ' + filename, 'success');
    } catch (error) {
      ui.showStatus(
        '#reportesRevisionMensaje',
        error && error.message ? error.message : 'No se pudo generar el PDF.',
        'error'
      );
    }
  }

  function limpiarFiltros() {
    [
      '#reporteRevisionPeriodo',
      '#reporteRevisionInvestigador',
      '#reporteRevisionCarrera',
      '#reporteRevisionResultado',
      '#reporteRevisionDesde',
      '#reporteRevisionHasta'
    ].forEach(function (selector) {
      var node = ui.qs(selector);
      if (node) node.value = '';
    });

    aplicarFiltros();
  }

  function textoSeleccionado(selector) {
    var node = ui.qs(selector);
    if (!node || node.selectedIndex < 0) return '';
    return node.options[node.selectedIndex].textContent || '';
  }

  function claseResultado(estado) {
    estado = String(estado || '').toUpperCase();
    if (estado === 'DEVUELTO') return 'danger';
    if (estado === 'APROBADO_CON_OBSERVACION') return 'warning';
    return 'success';
  }

  function formatearFecha(value) {
    if (!value) return '—';
    try {
      var date = new Date(value);
      if (isNaN(date.getTime())) return '—';
      return new Intl.DateTimeFormat('es-EC', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }).format(date);
    } catch (error) {
      return '—';
    }
  }

  window.TAAdminReportesRevision = Object.freeze({
    iniciar: iniciar,
    cargar: cargar,
    aplicarFiltros: aplicarFiltros
  });
})();