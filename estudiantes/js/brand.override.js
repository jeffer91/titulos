/* Ajuste final de identidad: integra el logo al encabezado sin tarjeta blanca. */
(function () {
  'use strict';
  if (document.getElementById('taBrandOverrideStyles')) return;

  var style = document.createElement('style');
  style.id = 'taBrandOverrideStyles';
  style.textContent = [
    'body.ta-premium .student-hero__logo,body.ta-premium .app-logo{background:linear-gradient(145deg,#dce9f5 0%,#edf5fb 100%)!important;border:1px solid rgba(215,165,29,.78)!important;border-radius:14px!important;padding:10px 12px!important;box-shadow:0 12px 30px rgba(0,0,0,.15),inset 0 1px 0 rgba(255,255,255,.9)!important}',
    'body.ta-premium .student-hero__logo,body.ta-premium .app-logo{filter:drop-shadow(0 2px 3px rgba(0,0,0,.10))!important}',
    '@media(max-width:760px){body.ta-premium .student-hero__logo,body.ta-premium .app-logo{background:linear-gradient(145deg,#dce9f5,#edf5fb)!important;padding:8px 10px!important;border-radius:12px!important}}'
  ].join('');

  document.head.appendChild(style);
})();