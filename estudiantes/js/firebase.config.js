/* Configuración Firebase del módulo estudiantes.
   Se usan dos proyectos independientes:
   - utet-4387a: consulta académica (solo lectura desde esta app).
   - titulos-ec2fa: proceso de títulos, configuración, IA y envíos. */
(function () {
  'use strict';

  window.TA_ESTUDIANTES_FIREBASE_ACADEMICO_CONFIG = Object.freeze({
    apiKey: 'AIzaSyCaHf1C0BB0X_H3BDZ1o-UDAsPmLTjsZLA',
    authDomain: 'utet-4387a.firebaseapp.com',
    projectId: 'utet-4387a',
    storageBucket: 'utet-4387a.firebasestorage.app',
    messagingSenderId: '902848131454',
    appId: '1:902848131454:web:47f515eb6480834724c32f'
  });

  window.TA_ESTUDIANTES_FIREBASE_TITULOS_CONFIG = Object.freeze({
    apiKey: 'AIzaSyDkSOhJ552LwxQtt8GhP5iDJk49y0t4mOg',
    authDomain: 'titulos-ec2fa.firebaseapp.com',
    projectId: 'titulos-ec2fa',
    storageBucket: 'titulos-ec2fa.firebasestorage.app',
    messagingSenderId: '14269419714',
    appId: '1:14269419714:web:79df03c4df888c61edab5b',
    measurementId: 'G-4MC529QMW9'
  });

})();