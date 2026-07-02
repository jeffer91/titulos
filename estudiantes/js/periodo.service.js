/* Servicio para normalizar períodos académicos. */
(function () {
  'use strict';

  var meses = Object.freeze({
    '01': 'Enero',
    '02': 'Febrero',
    '03': 'Marzo',
    '04': 'Abril',
    '05': 'Mayo',
    '06': 'Junio',
    '07': 'Julio',
    '08': 'Agosto',
    '09': 'Septiembre',
    '10': 'Octubre',
    '11': 'Noviembre',
    '12': 'Diciembre'
  });

  function normalizarPeriodoEstudiante(estudiante) {
    estudiante = estudiante || {};

    if (tieneTexto(estudiante.periodoLabel)) {
      return normalizarTextoPeriodo(estudiante.periodoLabel);
    }

    if (tieneTexto(estudiante.periodoNombre)) {
      return normalizarTextoPeriodo(estudiante.periodoNombre);
    }

    if (tieneTexto(estudiante.periodoId)) {
      return formatearPeriodoId(estudiante.periodoId);
    }

    if (tieneTexto(estudiante.ultimoPeriodoId)) {
      return formatearPeriodoId(estudiante.ultimoPeriodoId);
    }

    return 'Período no registrado';
  }

  function formatearPeriodoId(periodoId) {
    var texto = String(periodoId || '').trim();

    if (!texto) return 'Período no registrado';

    var partes = extraerPartes(texto);

    if (!partes) return texto;

    var inicio = formatearAnioMes(partes.inicioAnio, partes.inicioMes);
    var fin = formatearAnioMes(partes.finAnio, partes.finMes);

    if (!inicio || !fin) return texto;

    return inicio + ' a ' + fin;
  }

  function extraerPartes(texto) {
    var limpio = String(texto || '').trim();

    var coincidencia = limpio.match(/(\d{4})[-_/](\d{1,2})\D+(\d{4})[-_/](\d{1,2})/);

    if (!coincidencia) return null;

    return {
      inicioAnio: coincidencia[1],
      inicioMes: completarMes(coincidencia[2]),
      finAnio: coincidencia[3],
      finMes: completarMes(coincidencia[4])
    };
  }

  function formatearAnioMes(anio, mes) {
    var nombreMes = meses[mes];

    if (!nombreMes || !anio) return '';

    return nombreMes + ' ' + anio;
  }

  function completarMes(mes) {
    var numero = String(mes || '').replace(/\D/g, '');
    if (numero.length === 1) return '0' + numero;
    return numero;
  }

  function normalizarTextoPeriodo(texto) {
    var valor = String(texto || '').replace(/\s+/g, ' ').trim();

    if (!valor) return 'Período no registrado';

    return valor
      .replace(/\benero\b/gi, 'Enero')
      .replace(/\bfebrero\b/gi, 'Febrero')
      .replace(/\bmarzo\b/gi, 'Marzo')
      .replace(/\babril\b/gi, 'Abril')
      .replace(/\bmayo\b/gi, 'Mayo')
      .replace(/\bjunio\b/gi, 'Junio')
      .replace(/\bjulio\b/gi, 'Julio')
      .replace(/\bagosto\b/gi, 'Agosto')
      .replace(/\bseptiembre\b/gi, 'Septiembre')
      .replace(/\boctubre\b/gi, 'Octubre')
      .replace(/\bnoviembre\b/gi, 'Noviembre')
      .replace(/\bdiciembre\b/gi, 'Diciembre')
      .replace(/\s+a\s+/gi, ' a ');
  }

  function tieneTexto(valor) {
    return String(valor || '').trim() !== '';
  }

  window.TAEstudiantePeriodo = Object.freeze({
    normalizarPeriodoEstudiante: normalizarPeriodoEstudiante,
    formatearPeriodoId: formatearPeriodoId,
    normalizarTextoPeriodo: normalizarTextoPeriodo
  });
})();