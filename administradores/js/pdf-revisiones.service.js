/* Generación institucional de PDF para revisiones de Investigación. */
(function () {
  'use strict';

  function descargar(options) {
    options = options || {};
    var rows = options.revisiones || [];

    if (!rows.length) {
      throw new Error('No hay revisiones para incluir en el PDF.');
    }

    var jsPDF = window.jspdf && window.jspdf.jsPDF;
    if (!jsPDF) {
      throw new Error('No se cargó el motor PDF. Actualiza la página e inténtalo nuevamente.');
    }

    var doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    if (typeof doc.autoTable !== 'function') {
      throw new Error('No se cargó el componente de tablas PDF.');
    }

    var resumen = options.resumen || {};
    var filtros = options.filtros || {};
    var ocultarInvestigador = options.ocultarInvestigador === true;
    var titulo = options.titulo || 'REPORTE DE REVISIÓN DE TÍTULOS';
    var subtitulo = options.subtitulo || 'Área: Investigación';
    var fechaGeneracion = formatearFechaCompleta(new Date());

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('ITSQMET', 14, 14);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('Instituto Superior Tecnológico Quito Metropolitano', 14, 20);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(titulo, 148.5, 14, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(subtitulo, 148.5, 20, { align: 'center' });

    var info = [];
    if (filtros.periodoLabel || filtros.periodo) info.push('Período: ' + (filtros.periodoLabel || filtros.periodo));
    if (filtros.investigadorLabel) info.push('Investigador: ' + filtros.investigadorLabel);
    if (filtros.carrera) info.push('Carrera: ' + filtros.carrera);
    if (filtros.resultadoLabel) info.push('Resultado: ' + filtros.resultadoLabel);
    if (filtros.desde || filtros.hasta) info.push('Fechas: ' + (filtros.desde || 'inicio') + ' a ' + (filtros.hasta || 'actualidad'));

    doc.setFontSize(8);
    doc.setTextColor(65, 76, 92);
    doc.text(info.length ? info.join(' · ') : 'Todos los registros revisados', 14, 27);
    doc.text('Generado: ' + fechaGeneracion, 283, 27, { align: 'right' });

    doc.setTextColor(23, 32, 51);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Revisados: ' + Number(resumen.total || rows.length), 14, 34);
    doc.text('Aprobados: ' + Number(resumen.aprobados || 0), 55, 34);
    doc.text('Devueltos: ' + Number(resumen.devueltos || 0), 96, 34);
    if (!ocultarInvestigador) {
      doc.text('Investigadores: ' + Number(resumen.investigadores || 0), 137, 34);
    }

    var head = [['N.º', 'Fecha']];
    if (!ocultarInvestigador) head[0].push('Investigador');
    head[0] = head[0].concat(['Estudiante', 'Cédula', 'Carrera', 'Resultado', 'Título final']);

    var body = rows.map(function (item, index) {
      var row = [
        index + 1,
        formatearFecha(item.fechaRevision)
      ];
      if (!ocultarInvestigador) row.push(item.investigadorNombre || item.investigadorCedula || '—');
      return row.concat([
        item.nombres || '—',
        item.cedula || '—',
        item.carrera || '—',
        item.resultadoLabel || item.estadoRevision || '—',
        item.tituloFinal || '—'
      ]);
    });

    var widths = ocultarInvestigador
      ? { 0: 10, 1: 24, 2: 42, 3: 24, 4: 48, 5: 31, 6: 92 }
      : { 0: 9, 1: 22, 2: 36, 3: 38, 4: 22, 5: 43, 6: 28, 7: 82 };

    var styles = {};
    Object.keys(widths).forEach(function (key) {
      styles[key] = { cellWidth: widths[key] };
    });

    doc.autoTable({
      startY: 39,
      head: head,
      body: body,
      theme: 'grid',
      margin: { left: 10, right: 10, bottom: 14 },
      styles: {
        font: 'helvetica',
        fontSize: 6.8,
        cellPadding: 1.7,
        valign: 'top',
        overflow: 'linebreak'
      },
      headStyles: {
        fillColor: [11, 31, 58],
        textColor: [255, 255, 255],
        fontStyle: 'bold'
      },
      alternateRowStyles: {
        fillColor: [247, 249, 252]
      },
      columnStyles: styles,
      didDrawPage: function () {
        var page = doc.internal.getNumberOfPages();
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(90, 105, 122);
        doc.text('Sistema de Titulación ITSQMET', 10, 203);
        doc.text('Página ' + page, 287, 203, { align: 'right' });
      }
    });

    var filename = options.filename || construirNombreArchivo(options, filtros);
    doc.save(filename);
    return filename;
  }

  function construirNombreArchivo(options, filtros) {
    var parts = [
      'reporte',
      'revisiones',
      filtros && (filtros.investigadorLabel || filtros.investigador) || 'investigacion',
      filtros && filtros.periodo || 'todos'
    ];
    return parts.map(limpiarArchivo).filter(Boolean).join('_') + '.pdf';
  }

  function formatearFecha(value) {
    if (!value) return '—';
    var d = new Date(value);
    if (isNaN(d.getTime())) return '—';
    try {
      return new Intl.DateTimeFormat('es-EC', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }).format(d);
    } catch (error) {
      return d.toISOString().slice(0, 10);
    }
  }

  function formatearFechaCompleta(value) {
    var d = value instanceof Date ? value : new Date(value);
    try {
      return new Intl.DateTimeFormat('es-EC', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).format(d);
    } catch (error) {
      return d.toISOString();
    }
  }

  function limpiarArchivo(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase()
      .slice(0, 70);
  }

  window.TARevisionPdfService = Object.freeze({
    descargar: descargar
  });
})();