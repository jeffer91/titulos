/* Configuración base del módulo coordinadores. */
(function () {
  'use strict';

  window.TA_COORDINADORES_CONFIG = Object.freeze({
    modulo: 'coordinadores',
    version: '0.1.0-bloque-8',
    modo: 'base-visual',
    firebaseActivo: false,
    electronActivo: false,
    rutas: Object.freeze({
      htmlPrincipal: 'coordinadores/coordinador.html',
      cssPrincipal: 'coordinadores/css/coordinador.css',
      jsPrincipal: 'coordinadores/js/coordinador.app.js',
      electron: 'coordinadores/electron/'
    }),
    funcionesFuturas: Object.freeze([
      'Consulta de títulos por carrera y período',
      'Revisión de propuestas enviadas por estudiantes',
      'Aprobación, aprobación con observación o devolución',
      'Historial de decisiones de coordinación'
    ])
  });
})();
