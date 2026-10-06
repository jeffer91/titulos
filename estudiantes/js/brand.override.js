/* Ajuste final de identidad: logo institucional integrado directamente al encabezado. */
(function () {
  'use strict';
  if (document.getElementById('taBrandOverrideStyles')) return;

  var style = document.createElement('style');
  style.id = 'taBrandOverrideStyles';
  style.textContent = [
    'body.ta-premium .student-hero__logo,body.ta-premium .app-logo{background:transparent!important;border:0!important;border-radius:0!important;padding:0!important;box-shadow:none!important;filter:drop-shadow(0 3px 7px rgba(0,0,0,.28))!important;object-fit:contain!important}',
    'body.ta-premium .student-hero__logo{width:260px!important;max-width:min(260px,42vw)!important;max-height:104px!important;flex:0 0 auto!important}',
    '@media(max-width:760px){body.ta-premium .student-hero__brand{align-items:flex-start!important}body.ta-premium .student-hero__logo{width:250px!important;max-width:72vw!important;max-height:96px!important;margin:2px 0 6px!important;background:transparent!important;border:0!important;padding:0!important;box-shadow:none!important;border-radius:0!important}}',
    '@media(max-width:430px){body.ta-premium .student-hero__logo{width:235px!important;max-width:78vw!important;max-height:90px!important}}'
  ].join('');

  document.head.appendChild(style);
})();