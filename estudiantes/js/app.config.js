/*
  Configuración base del módulo estudiantes.
  Este archivo usa variables globales para funcionar con doble click y Live Server.
*/
(function () {
  'use strict';

  window.TA_ESTUDIANTES_CONFIG = Object.freeze({
    modulo: 'estudiantes',
    version: '0.1.0-bloque-1',
    modo: 'base-visual',
    propuestasObligatorias: 3,
    periodoVisualTemporal: 'Pendiente de Firebase',
    firebaseActivo: false,
    iaActiva: false,
    sheetsActivo: false,
    textos: Object.freeze({
      consultaPendiente: 'Ingresa tu cédula para habilitar el formulario.',
      firebasePendiente: 'La conexión real con Firebase se agregará en el Bloque 2.',
      iaPendiente: 'La generación real con IA se agregará en el Bloque 4.',
      envioPendiente: 'El envío real a Firebase se agregará en el Bloque 5.'
    }),
    demo: Object.freeze({
      nombres: 'Estudiante pendiente de conexión Firebase',
      carrera: 'Carrera pendiente de conexión Firebase',
      codigoCarrera: '—',
      periodoId: 'Pendiente de Firebase'
    })
  });
})();
