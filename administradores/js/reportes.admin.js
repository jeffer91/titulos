/* Reportes y exportación CSV para administradores. */
(function () {
  'use strict';

  var config = window.TA_ADMINISTRADORES_CONFIG;
  var firebaseService = window.TAAdminFirebaseService;

  var estado = {
    tipo: '',
    registros: [],
    periodo: '',
    estadoTitulo: 'TODOS'
  };

  document.addEventListener('DOMContentLoaded', iniciar);

  function iniciar() {
    conectarEventos();
    iniciarFirebase();
  }

  function conectarEventos() {
    var btnTitulos = qs('#btnReporteTitulos');
    var btnEstudiantes = qs('#btnReporteEstudiantes');
    var btnExportar = qs('#btnExportarCsv');

    if (btnTitulos) btnTitulos.addEventListener('click', consultarTitulos);
    if (btnEstudiantes) btnEstudiantes.addEventListener('click', consultarEstudiantes);
    if (btnExportar) btnExportar.addEventListener('click', exportarCsv);
  }

  function iniciarFirebase() {
    setText('#estadoGeneral', 'Conectando Firebase');
    setText('#projectIdTexto', config.firebase.projectId || '—');
    bloquearBotones(true);

    if (!firebaseService) {
      setText('#estadoGeneral', 'Archivos incompletos');
      showStatus('No se cargó el servicio Firebase del módulo administradores.', 'error');
      return;
    }

    firebaseService.iniciar(config.firebase).then(function (resultado) {
      if (!resultado.ok) {
        setText('#estadoGeneral', 'Firebase pendiente');
        showStatus(resultado.mensaje, 'warning');
        return;
      }

      setText('#estadoGeneral', 'Firebase conectado');
      showStatus('Firebase conectado. Puedes consultar reportes.', 'success');
      bloquearBotones(false);
      cargarPeriodoActivo();
    });
  }

  function cargarPeriodoActivo() {
    firebaseService.leerDocumento(config.collections.config, config.documents.appConfig)
      .then(function (doc) {
        var periodo = doc && doc.periodoActivo ? doc.periodoActivo : '';
        setText('#periodoActivoTexto', periodo || 'Sin período activo');
        if (periodo) setValue('#periodoReporteInput', periodo);
      })
      .catch(function () {
        setText('#periodoActivoTexto', 'No disponible');
      });
  }

  function consultarTitulos() {
    var periodo = value('#periodoReporteInput');
    var estadoFiltro = value('#estadoReporteInput') || 'TODOS';

    if (!periodo) return showStatus('Ingresa el período para consultar títulos.', 'error');

    setLoading('#btnReporteTitulos', true, 'Consultando...');
    showStatus('Consultando títulos...', 'info');

    firebaseService.listarDocumentos(config.collections.titulos, {
      where: ['periodoId', '==', periodo],
      limit: 3000
    }).then(function (docs) {
      var titulos = docs.map(normalizarTitulo).filter(function (titulo) {
        if (estadoFiltro === 'TODOS') return true;
        return String(titulo.estado || '').toUpperCase() === estadoFiltro;
      });

      estado.tipo = 'titulos';
      estado.registros = titulos;
      estado.periodo = periodo;
      estado.estadoTitulo = estadoFiltro;
      renderTitulos(titulos);
      actualizarResumen('Títulos', titulos.length);
      showStatus('Reporte de títulos generado: ' + titulos.length + ' registros.', 'success');
    }).catch(function (error) {
      showStatus('No se pudo consultar títulos: ' + mensajeError(error), 'error');
    }).finally(function () {
      setLoading('#btnReporteTitulos', false);
    });
  }

  function consultarEstudiantes() {
    var periodo = value('#periodoReporteInput');
    if (!periodo) return showStatus('Ingresa el período para consultar estudiantes.', 'error');

    setLoading('#btnReporteEstudiantes', true, 'Consultando...');
    showStatus('Consultando estudiantes...', 'info');

    firebaseService.listarDocumentos(config.collections.estudiantes, {
      where: ['periodoId', '==', periodo],
      limit: 3000
    }).then(function (docs) {
      var estudiantes = docs.map(normalizarEstudiante).sort(function (a, b) {
        return String(a.nombres || '').localeCompare(String(b.nombres || ''));
      });

      estado.tipo = 'estudiantes';
      estado.registros = estudiantes;
      estado.periodo = periodo;
      renderEstudiantes(estudiantes);
      actualizarResumen('Estudiantes', estudiantes.length);
      showStatus('Reporte de estudiantes generado: ' + estudiantes.length + ' registros.', 'success');
    }).catch(function (error) {
      showStatus('No se pudo consultar estudiantes: ' + mensajeError(error), 'error');
    }).finally(function () {
      setLoading('#btnReporteEstudiantes', false);
    });
  }

  function exportarCsv() {
    if (!estado.registros.length) {
      showStatus('Primero genera un reporte para exportar.', 'warning');
      return;
    }

    var csv = estado.tipo === 'titulos'
      ? csvTitulos(estado.registros)
      : csvEstudiantes(estado.registros);

    var filename = [
      'reporte',
      estado.tipo,
      limpiarArchivo(estado.periodo || 'periodo'),
      fechaArchivo()
    ].join('_') + '.csv';

    descargarArchivo(csv, filename, 'text/csv;charset=utf-8');
    showStatus('CSV exportado: ' + filename, 'success');
  }

  function renderTitulos(titulos) {
    var container = qs('#reportePreview');
    if (!container) return;
    container.innerHTML = '';

    if (!titulos.length) return renderEmpty(container, 'No hay títulos para mostrar.');

    var table = crearTabla(['Cédula', 'Nombres', 'Carrera', 'Estado', 'Título preferido']);
    var tbody = table.querySelector('tbody');
    titulos.slice(0, 300).forEach(function (titulo) {
      tbody.appendChild(row([
        titulo.cedula,
        titulo.nombres,
        titulo.carrera,
        titulo.estado,
        titulo.tituloPreferidoTexto
      ]));
    });
    container.appendChild(wrapTable(table));
    if (titulos.length > 300) renderNota(container, 'Mostrando 300 de ' + titulos.length + ' registros. El CSV exporta todos.');
  }

  function renderEstudiantes(estudiantes) {
    var container = qs('#reportePreview');
    if (!container) return;
    container.innerHTML = '';

    if (!estudiantes.length) return renderEmpty(container, 'No hay estudiantes para mostrar.');

    var table = crearTabla(['Cédula', 'Nombres', 'Carrera', 'Estado matrícula', 'Celular']);
    var tbody = table.querySelector('tbody');
    estudiantes.slice(0, 300).forEach(function (estudiante) {
      tbody.appendChild(row([
        estudiante.cedula,
        estudiante.nombres,
        estudiante.carrera,
        estudiante.estadoMatricula,
        estudiante.celular
      ]));
    });
    container.appendChild(wrapTable(table));
    if (estudiantes.length > 300) renderNota(container, 'Mostrando 300 de ' + estudiantes.length + ' registros. El CSV exporta todos.');
  }

  function normalizarTitulo(data) {
    var propuestas = Array.isArray(data.titulosEnviados) ? data.titulosEnviados : [];
    var preferida = propuestas.filter(function (p) {
      return Number(p.numero) === Number(data.tituloPreferidoNumero || 1);
    })[0] || propuestas[0] || {};

    return {
      id: data.id || '',
      cedula: data.cedula || data.numeroIdentificacion || '',
      nombres: data.nombres || data.nombreCompleto || '',
      carrera: data.carrera || data.nombreCarrera || '',
      periodoId: data.periodoId || '',
      estado: data.estado || 'ENVIADO',
      tituloPreferidoNumero: data.tituloPreferidoNumero || 1,
      tituloPreferidoTexto: data.tituloPreferidoTexto || preferida.tituloFinal || '',
      revisionObservacion: data.revision && data.revision.observacion ? data.revision.observacion : ''
    };
  }

  function normalizarEstudiante(data) {
    return {
      id: data.id || '',
      cedula: data.cedula || data.numeroIdentificacion || '',
      nombres: data.nombres || data.nombreCompleto || '',
      carrera: data.carrera || data.nombreCarrera || '',
      periodoId: data.periodoId || '',
      estadoMatricula: data.estadoMatricula || data.estado || 'ACTIVO',
      correoPersonal: data.correoPersonal || data.correo || '',
      celular: data.celular || data.telefono || ''
    };
  }

  function csvTitulos(titulos) {
    var headers = ['id', 'cedula', 'nombres', 'carrera', 'periodoId', 'estado', 'tituloPreferidoNumero', 'tituloPreferidoTexto', 'revisionObservacion'];
    return toCsv(headers, titulos);
  }

  function csvEstudiantes(estudiantes) {
    var headers = ['id', 'cedula', 'nombres', 'carrera', 'periodoId', 'estadoMatricula', 'correoPersonal', 'celular'];
    return toCsv(headers, estudiantes);
  }

  function toCsv(headers, rowsData) {
    var lines = [headers.join(',')];
    rowsData.forEach(function (item) {
      lines.push(headers.map(function (header) {
        return escapeCsv(item[header]);
      }).join(','));
    });
    return '\uFEFF' + lines.join('\n');
  }

  function escapeCsv(valueToEscape) {
    var text = String(valueToEscape == null ? '' : valueToEscape);
    return '"' + text.replace(/"/g, '""') + '"';
  }

  function descargarArchivo(content, filename, mime) {
    var blob = new Blob([content], { type: mime || 'text/plain' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function crearTabla(headers) {
    var table = document.createElement('table');
    table.className = 'data-table';
    var thead = document.createElement('thead');
    var tr = document.createElement('tr');
    headers.forEach(function (header) {
      var th = document.createElement('th');
      th.textContent = header;
      tr.appendChild(th);
    });
    thead.appendChild(tr);
    table.appendChild(thead);
    table.appendChild(document.createElement('tbody'));
    return table;
  }

  function row(values) {
    var tr = document.createElement('tr');
    values.forEach(function (valueToShow) {
      var td = document.createElement('td');
      td.textContent = valueToShow || '—';
      tr.appendChild(td);
    });
    return tr;
  }

  function wrapTable(table) {
    var wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    wrap.appendChild(table);
    return wrap;
  }

  function renderEmpty(container, text) {
    var empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = text;
    container.appendChild(empty);
  }

  function renderNota(container, text) {
    var note = document.createElement('p');
    note.className = 'muted';
    note.textContent = text;
    container.appendChild(note);
  }

  function actualizarResumen(tipo, total) {
    setText('#reporteTotalTexto', String(total));
    setText('#reporteTipoTexto', tipo);
    setText('#reporteFechaTexto', new Date().toLocaleString());
    setText('#registrosTexto', String(total));
  }

  function bloquearBotones(disabled) {
    ['#btnReporteTitulos', '#btnReporteEstudiantes', '#btnExportarCsv'].forEach(function (selector) {
      var button = qs(selector);
      if (button) button.disabled = Boolean(disabled);
    });
  }

  function qs(selector) {
    return document.querySelector(selector);
  }

  function value(selector) {
    var element = qs(selector);
    return element ? String(element.value || '').trim() : '';
  }

  function setValue(selector, valueToSet) {
    var element = qs(selector);
    if (element) element.value = valueToSet == null ? '' : String(valueToSet);
  }

  function setText(selector, valueToSet) {
    var element = qs(selector);
    if (element) element.textContent = valueToSet || '—';
  }

  function showStatus(message, type) {
    var element = qs('#reportesMensaje');
    if (!element) return;
    element.classList.remove('is-info', 'is-success', 'is-warning', 'is-error');
    if (type) element.classList.add('is-' + type);
    element.textContent = message || '';
  }

  function setLoading(selector, loading, text) {
    var button = qs(selector);
    if (!button) return;
    if (loading) {
      if (!button.dataset.originalText) button.dataset.originalText = button.textContent;
      button.textContent = text || 'Cargando...';
      button.disabled = true;
      return;
    }
    button.disabled = false;
    if (button.dataset.originalText) {
      button.textContent = button.dataset.originalText;
      delete button.dataset.originalText;
    }
  }

  function limpiarArchivo(text) {
    return String(text || '').replace(/[^A-Za-z0-9_.-]/g, '_');
  }

  function fechaArchivo() {
    return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  }

  function mensajeError(error) {
    return error && error.message ? error.message : String(error || 'Error desconocido');
  }
})();
