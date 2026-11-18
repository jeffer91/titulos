/* Generador XLSX local y sin dependencias del panel de estudiantes. */
(function () {
  'use strict';
  var NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  var REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  var PKG = 'http://schemas.openxmlformats.org/package/2006/relationships';
  var MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  function str(value) {
    if (value == null) return '';
    if (value instanceof Date) return isNaN(value.getTime()) ? '' : value.toISOString();
    if (typeof value === 'object') {
      if (typeof value.seconds === 'number') return new Date(value.seconds * 1000).toISOString();
      return '';
    }
    return String(value);
  }
  function xml(value) {
    return str(value).slice(0, 32767)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }
  function etiqueta(value) {
    var key = str(value || 'SIN_ENVIAR').toUpperCase();
    return ({ APROBADO: 'Aprobado', PENDIENTE: 'Pendiente', ENVIADO: 'Enviado',
      DEVUELTO: 'Devuelto', SIN_ENVIAR: 'Sin enviar' })[key] || key;
  }
  function tituloPropuesto(item) {
    return str(item && (item.tituloFinal || item.titulo || item.texto));
  }
  function tituloDefinitivo(alumno) {
    if (str(alumno.estado).toUpperCase() !== 'APROBADO') return '';
    var d = alumno.titulo || {};
    return str(d.tituloFinal || d.tituloFinalInvestigacion ||
      (d.aprobadoPorAdministracion && d.tituloAdminSeleccionadoTexto) || d.tituloInvestigador);
  }
  function construirHojas(lista, filtros) {
    var estudiantes = [], propuestas = [], estados = {};
    lista.forEach(function (e) {
      var d = e.titulo || {}, ts = Array.isArray(e.titulosEnviados) ? e.titulosEnviados : [];
      var estado = str(e.estado || 'SIN_ENVIAR').toUpperCase();
      estados[estado] = (estados[estado] || 0) + 1;
      var p = Number(e.tituloPreferidoNumero || d.tituloPreferidoNumero || 0);
      var c = Number(d.tituloCoordinadorNumero ||
        (d.revisionCoordinador && d.revisionCoordinador.tituloSeleccionadoNumero) || 0);
      var i = Number(d.tituloInvestigadorNumero ||
        (d.revisionInvestigador && d.revisionInvestigador.tituloSeleccionadoNumero) || 0);
      var a = Number(d.tituloAdminSeleccionadoNumero || 0);
      var final = tituloDefinitivo(e), periodo = str(e.periodoLabel || e.periodoId);
      estudiantes.push([
        str(e.cedula), str(e.nombres), str(e.carrera || e.nombreCarrera), periodo,
        str(e.periodoId), etiqueta(estado), str(e.estadoMatricula),
        str(d.estadoProceso || d.estado),
        str(d.estadoCoordinador || (d.revisionCoordinador && d.revisionCoordinador.estado)),
        str(d.estadoInvestigador || (d.revisionInvestigador && d.revisionInvestigador.estado)),
        str(e.tituloPreferidoTexto), str(d.tituloCoordinador),
        str(d.tituloInvestigador || d.tituloFinalInvestigacion), final,
        ts.length, str(e.actualizadoEn || d.actualizadoEnLocal), str(e.sede),
        str(e.modalidadEstudio), str(e.correoPersonal), str(e.correoInstitucional),
        str(e.celular), str(e.telegram || e.telegramUser)
      ]);
      ts.forEach(function (t, idx) {
        var numero = Number(t.numero || idx + 1);
        propuestas.push([
          str(e.cedula), str(e.nombres), str(e.carrera || e.nombreCarrera), periodo,
          etiqueta(estado), numero, tituloPropuesto(t),
          p === numero ? 'Sí' : 'No', c === numero ? 'Sí' : 'No',
          i === numero ? 'Sí' : 'No',
          d.aprobadoPorAdministracion && a === numero ? 'Sí' : 'No', final
        ]);
      });
    });
    filtros = filtros || {};
    var resumen = [
      ['Generado el', new Date().toLocaleString('es-EC')],
      ['Período', filtros.periodo || 'Todos los cargados'],
      ['Carrera', filtros.carrera || 'Todas'],
      ['Estado', filtros.estado || 'Todos'],
      ['Búsqueda', filtros.busqueda || 'Sin búsqueda'],
      ['Telegram', filtros.telegram || 'Todos'],
      ['Total estudiantes', lista.length],
      ['Total propuestas', propuestas.length]
    ];
    ['APROBADO', 'PENDIENTE', 'DEVUELTO', 'ENVIADO', 'SIN_ENVIAR'].forEach(function (k) {
      resumen.push([etiqueta(k), estados[k] || 0]);
    });
    Object.keys(estados).filter(function (k) {
      return ['APROBADO', 'PENDIENTE', 'DEVUELTO', 'ENVIADO', 'SIN_ENVIAR'].indexOf(k) < 0;
    }).forEach(function (k) { resumen.push([etiqueta(k), estados[k]]); });
    return [
      { nombre: 'Estudiantes', columnas: [
        'Cédula', 'Estudiante', 'Carrera', 'Período', 'ID período', 'Estado título',
        'Estado matrícula', 'Estado proceso', 'Estado Coordinación', 'Estado Investigación',
        'Título preferido', 'Título Coordinación', 'Título Investigación', 'Título definitivo',
        'N.º propuestas', 'Última actualización', 'Sede', 'Modalidad', 'Correo personal',
        'Correo institucional', 'Celular', 'Telegram'
      ], filas: estudiantes, filtrar: true },
      { nombre: 'Propuestas', columnas: [
        'Cédula', 'Estudiante', 'Carrera', 'Período', 'Estado título', 'N.º propuesta',
        'Título propuesto', 'Preferida', 'Elegida Coordinación', 'Elegida Investigación',
        'Elegida Administración', 'Título definitivo'
      ], filas: propuestas, filtrar: true },
      { nombre: 'Resumen', columnas: ['Concepto', 'Valor'], filas: resumen, filtrar: false }
    ];
  }
  function col(n) {
    var out = '';
    for (n += 1; n > 0; n = Math.floor((n - 1) / 26)) {
      out = String.fromCharCode(65 + (n - 1) % 26) + out;
    }
    return out;
  }
  function hojaXml(hoja) {
    var rows = [hoja.columnas].concat(hoja.filas);
    if (rows.length > 1048576 || hoja.columnas.length > 16384) {
      throw new Error('El reporte supera los límites de Excel.');
    }
    var rango = 'A1:' + col(hoja.columnas.length - 1) + rows.length;
    var widths = hoja.columnas.map(function (nombre, n) {
      var largo = str(nombre).length;
      hoja.filas.slice(0, 200).forEach(function (r) {
        largo = Math.max(largo, str(r[n]).length);
      });
      return '<col min="' + (n + 1) + '" max="' + (n + 1) +
        '" width="' + Math.min(60, Math.max(13, largo + 3)) + '" customWidth="1"/>';
    }).join('');
    var body = rows.map(function (row, n) {
      var idx = n + 1;
      return '<row r="' + idx + '">' + hoja.columnas.map(function (_, j) {
        var value = row[j], ref = col(j) + idx, style = n === 0 ? ' s="1"' : '';
        if (typeof value === 'number' && Number.isFinite(value)) {
          return '<c r="' + ref + '"' + style + '><v>' + value + '</v></c>';
        }
        return '<c r="' + ref + '"' + style +
          ' t="inlineStr"><is><t xml:space="preserve">' + xml(value) + '</t></is></c>';
      }).join('') + '</row>';
    }).join('');
    return '<?xml version="1.0" encoding="UTF-8"?>' +
      '<worksheet xmlns="' + NS + '"><dimension ref="' + rango + '"/>' +
      '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
      '<sheetFormatPr defaultRowHeight="16"/><cols>' + widths + '</cols><sheetData>' +
      body + '</sheetData>' + (hoja.filtrar ? '<autoFilter ref="' + rango + '"/>' : '') +
      '</worksheet>';
  }
  function archivosXlsx(hojas) {
    var content = 'http://schemas.openxmlformats.org/package/2006/content-types';
    var parts = [
      ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?>' +
        '<Types xmlns="' + content + '">' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        hojas.map(function (_, n) {
          return '<Override PartName="/xl/worksheets/sheet' + (n + 1) +
            '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
        }).join('') + '</Types>'],
      ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?>' +
        '<Relationships xmlns="' + PKG + '"><Relationship Id="rId1" Type="' + REL +
        '/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
      ['xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8"?>' +
        '<workbook xmlns="' + NS + '" xmlns:r="' + REL + '"><sheets>' +
        hojas.map(function (h, n) {
          return '<sheet name="' + xml(h.nombre) + '" sheetId="' + (n + 1) +
            '" r:id="rId' + (n + 1) + '"/>';
        }).join('') + '</sheets></workbook>'],
      ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8"?>' +
        '<Relationships xmlns="' + PKG + '">' + hojas.map(function (_, n) {
          return '<Relationship Id="rId' + (n + 1) + '" Type="' + REL +
            '/worksheet" Target="worksheets/sheet' + (n + 1) + '.xml"/>';
        }).join('') + '<Relationship Id="rId' + (hojas.length + 1) +
        '" Type="' + REL + '/styles" Target="styles.xml"/></Relationships>'],
      ['xl/styles.xml', '<?xml version="1.0" encoding="UTF-8"?>' +
        '<styleSheet xmlns="' + NS + '">' +
        '<fonts count="2"><font><sz val="11"/><name val="Aptos"/></font>' +
        '<font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Aptos"/></font></fonts>' +
        '<fills count="3"><fill><patternFill patternType="none"/></fill>' +
        '<fill><patternFill patternType="gray125"/></fill>' +
        '<fill><patternFill patternType="solid"><fgColor rgb="FF102D55"/><bgColor indexed="64"/></patternFill></fill></fills>' +
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
        '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs>' +
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
        '</styleSheet>']
    ];
    hojas.forEach(function (h, n) {
      parts.push(['xl/worksheets/sheet' + (n + 1) + '.xml', hojaXml(h)]);
    });
    return parts;
  }
  function crc32(bytes) {
    var crc = 0xFFFFFFFF;
    bytes.forEach(function (b) {
      crc ^= b;
      for (var j = 0; j < 8; j++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xEDB88320 : 0);
    });
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function zip(parts) {
    var coder = new TextEncoder(), locals = [], centrals = [], offset = 0;
    parts.forEach(function (part) {
      var name = coder.encode(part[0]), data = coder.encode(part[1]), crc = crc32(data);
      var local = new Uint8Array(30 + name.length + data.length), l = new DataView(local.buffer);
      l.setUint32(0, 0x04034b50, true); l.setUint16(4, 20, true);
      l.setUint32(14, crc, true); l.setUint32(18, data.length, true);
      l.setUint32(22, data.length, true); l.setUint16(26, name.length, true);
      local.set(name, 30); local.set(data, 30 + name.length); locals.push(local);
      var central = new Uint8Array(46 + name.length), c = new DataView(central.buffer);
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true);
      c.setUint16(6, 20, true); c.setUint32(16, crc, true);
      c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
      c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
      central.set(name, 46); centrals.push(central); offset += local.length;
    });
    var size = centrals.reduce(function (acc, b) { return acc + b.length; }, 0);
    var end = new Uint8Array(22), view = new DataView(end.buffer);
    view.setUint32(0, 0x06054b50, true); view.setUint16(8, parts.length, true);
    view.setUint16(10, parts.length, true); view.setUint32(12, size, true);
    view.setUint32(16, offset, true);
    var result = new Uint8Array(offset + size + 22), pos = 0;
    locals.concat(centrals, [end]).forEach(function (chunk) {
      result.set(chunk, pos); pos += chunk.length;
    });
    return result;
  }
  function crearLibro(hojas) {
    if (!Array.isArray(hojas) || !hojas.length) throw new Error('No hay hojas para exportar.');
    return zip(archivosXlsx(hojas));
  }
  function exportar(lista, filtros) {
    if (!Array.isArray(lista) || !lista.length) {
      throw new Error('No hay estudiantes con estos filtros para exportar.');
    }
    var bytes = crearLibro(construirHojas(lista, filtros)), now = new Date();
    function n(v) { return String(v).padStart(2, '0'); }
    var nombre = 'estado_titulos_estudiantes_' + now.getFullYear() + '-' +
      n(now.getMonth() + 1) + '-' + n(now.getDate()) + '_' +
      n(now.getHours()) + n(now.getMinutes()) + '.xlsx';
    var url = URL.createObjectURL(new Blob([bytes], { type: MIME }));
    try {
      var link = document.createElement('a');
      link.href = url; link.download = nombre;
      document.body.appendChild(link); link.click(); link.remove();
    } finally {
      setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
    }
    return { nombre: nombre, estudiantes: lista.length };
  }
  window.TAAdminExcelService = Object.freeze({
    exportar: exportar, construirHojas: construirHojas, crearLibro: crearLibro
  });
})();