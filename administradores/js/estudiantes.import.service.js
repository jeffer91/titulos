/* Servicio de lectura y normalización de estudiantes para administradores. */
(function () {
  'use strict';

  var SHEETJS_CDN = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';

  function leerArchivo(file, periodoForzado) {
    if (!file) return Promise.reject(new Error('Selecciona un archivo de estudiantes.'));

    var name = String(file.name || '').toLowerCase();

    if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
      return leerExcel(file, periodoForzado);
    }

    if (name.endsWith('.json')) {
      return leerTexto(file).then(function (text) {
        return normalizarJson(text, periodoForzado);
      });
    }

    return leerTexto(file).then(function (text) {
      return normalizarTabla(parseCsv(text), periodoForzado);
    });
  }

  function leerExcel(file, periodoForzado) {
    return cargarSheetJS().then(function () {
      return leerArrayBuffer(file);
    }).then(function (buffer) {
      var workbook = window.XLSX.read(buffer, { type: 'array' });
      var firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) throw new Error('El Excel no tiene hojas.');

      var rows = window.XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], {
        defval: '',
        raw: false
      });

      return normalizarTabla(rows, periodoForzado);
    });
  }

  function cargarSheetJS() {
    if (window.XLSX) return Promise.resolve();

    return new Promise(function (resolve, reject) {
      var existing = document.getElementById('sheetjs-xlsx-admin');
      if (existing) {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }

      var script = document.createElement('script');
      script.src = SHEETJS_CDN;
      script.id = 'sheetjs-xlsx-admin';
      script.onload = resolve;
      script.onerror = function () {
        reject(new Error('No se pudo cargar la librería para leer Excel. Revisa tu conexión o usa CSV.'));
      };
      document.head.appendChild(script);
    });
  }

  function leerTexto(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || '')); };
      reader.onerror = function () { reject(new Error('No se pudo leer el archivo.')); };
      reader.readAsText(file, 'UTF-8');
    });
  }

  function leerArrayBuffer(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(new Error('No se pudo leer el Excel.')); };
      reader.readAsArrayBuffer(file);
    });
  }

  function normalizarJson(text, periodoForzado) {
    var parsed = JSON.parse(text);
    var rows = Array.isArray(parsed) ? parsed : parsed.estudiantes || parsed.items || parsed.data || [];
    if (!Array.isArray(rows)) throw new Error('El JSON debe contener un arreglo de estudiantes.');
    return normalizarTabla(rows, periodoForzado);
  }

  function parseCsv(text) {
    var clean = String(text || '').replace(/^\uFEFF/, '').trim();
    if (!clean) return [];

    var delimiter = detectarDelimitador(clean);
    var lines = clean.split(/\r?\n/).filter(function (line) { return line.trim(); });
    var headers = splitCsvLine(lines.shift(), delimiter).map(function (header) { return header.trim(); });

    return lines.map(function (line) {
      var values = splitCsvLine(line, delimiter);
      var row = {};
      headers.forEach(function (header, index) {
        row[header] = values[index] || '';
      });
      return row;
    });
  }

  function detectarDelimitador(text) {
    var firstLine = String(text || '').split(/\r?\n/)[0] || '';
    var candidates = [',', ';', '\t', '|'];
    var best = ',';
    var bestCount = 0;

    candidates.forEach(function (candidate) {
      var count = firstLine.split(candidate).length;
      if (count > bestCount) {
        bestCount = count;
        best = candidate;
      }
    });

    return best;
  }

  function splitCsvLine(line, delimiter) {
    var result = [];
    var current = '';
    var inQuotes = false;

    for (var i = 0; i < line.length; i += 1) {
      var char = line[i];
      var next = line[i + 1];

      if (char === '"' && inQuotes && next === '"') {
        current += '"';
        i += 1;
        continue;
      }

      if (char === '"') {
        inQuotes = !inQuotes;
        continue;
      }

      if (char === delimiter && !inQuotes) {
        result.push(current.trim());
        current = '';
        continue;
      }

      current += char;
    }

    result.push(current.trim());
    return result;
  }

  function normalizarTabla(rows, periodoForzado) {
    var estudiantes = [];
    var errores = [];
    var duplicados = {};

    rows.forEach(function (row, index) {
      var estudiante = normalizarFila(row, periodoForzado);
      var fila = index + 2;

      if (!estudiante.numeroIdentificacion) {
        errores.push('Fila ' + fila + ': falta cédula o número de identificación.');
        return;
      }

      if (!estudiante.nombres) {
        errores.push('Fila ' + fila + ': faltan nombres.');
        return;
      }

      if (!estudiante.carrera && !estudiante.nombreCarrera) {
        errores.push('Fila ' + fila + ': falta carrera.');
        return;
      }

      if (!estudiante.periodoId) {
        errores.push('Fila ' + fila + ': falta período.');
        return;
      }

      if (duplicados[estudiante.numeroIdentificacion]) {
        errores.push('Fila ' + fila + ': cédula duplicada en el archivo (' + estudiante.numeroIdentificacion + ').');
        return;
      }

      duplicados[estudiante.numeroIdentificacion] = true;
      estudiantes.push(estudiante);
    });

    return {
      ok: estudiantes.length > 0,
      estudiantes: estudiantes,
      errores: errores,
      totalFilas: rows.length,
      totalValidos: estudiantes.length,
      totalErrores: errores.length
    };
  }

  function normalizarFila(row, periodoForzado) {
    var source = normalizarKeys(row || {});
    var cedula = soloNumeros(valor(source, ['numeroidentificacion', 'identificacion', 'cedula', 'documento', 'dni', 'ci']));
    var nombres = valor(source, ['nombres', 'nombrecompleto', 'estudiante', 'alumno', 'apellidosynombres', 'nombresyapellidos']);
    var carrera = valor(source, ['nombrecarrera', 'carrera', 'programa', 'especialidad']);
    var codigoCarrera = valor(source, ['codigocarrera', 'codcarrera', 'codigo_carrera', 'carreraid']);
    var periodoId = periodoForzado || valor(source, ['periodoid', 'periodo', 'periodoactivo']);
    var estadoMatricula = valor(source, ['estadomatricula', 'estado', 'matricula']) || 'ACTIVO';

    return {
      id: cedula,
      numeroIdentificacion: cedula,
      cedula: cedula,
      nombres: limpiarTexto(nombres),
      nombreCompleto: limpiarTexto(nombres),
      codigoCarrera: limpiarTexto(codigoCarrera),
      carrera: limpiarTexto(carrera),
      nombreCarrera: limpiarTexto(carrera),
      periodoId: limpiarTexto(periodoId),
      estadoMatricula: limpiarTexto(estadoMatricula).toUpperCase(),
      puedeEnviarTitulo: true,
      correoPersonal: limpiarTexto(valor(source, ['correopersonal', 'correo', 'email', 'mail'])),
      celular: soloNumeros(valor(source, ['celular', 'telefono', 'phone'])),
      actualizadoPorModulo: 'administradores'
    };
  }

  function normalizarKeys(row) {
    var normalized = {};
    Object.keys(row).forEach(function (key) {
      normalized[normalizarKey(key)] = row[key];
    });
    return normalized;
  }

  function normalizarKey(key) {
    return String(key || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toLowerCase();
  }

  function valor(source, keys) {
    for (var i = 0; i < keys.length; i += 1) {
      var value = source[keys[i]];
      if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim();
    }
    return '';
  }

  function limpiarTexto(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function soloNumeros(value) {
    return String(value || '').replace(/\D/g, '').trim();
  }

  window.TAAdminEstudiantesImport = Object.freeze({
    leerArchivo: leerArchivo,
    normalizarTabla: normalizarTabla,
    parseCsv: parseCsv
  });
})();
