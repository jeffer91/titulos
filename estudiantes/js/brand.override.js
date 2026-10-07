/* Identidad institucional del módulo estudiantes: única fuente para logo y favicon. */
(function () {
  'use strict';

  var STYLE_ID = 'taBrandOverrideStyles';
  var LOGO = 'assets/logo-instituto.webp';

  aplicarIdentidad();
  instalarEstilos();

  function aplicarIdentidad() {
    var logo = document.querySelector('.student-hero__logo, .app-logo');
    var favicon = document.querySelector('link[rel~="icon"]');

    if (logo) {
      logo.setAttribute('src', LOGO);
      logo.setAttribute('alt', 'Instituto Superior Tecnológico Quito Metropolitano');
      logo.setAttribute('loading', 'eager');
      logo.setAttribute('decoding', 'async');
    }

    if (favicon) {
      favicon.setAttribute('href', LOGO);
      favicon.setAttribute('type', 'image/webp');
    }
  }

  function instalarEstilos() {
    if (document.getElementById(STYLE_ID)) return;

    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      'body.ta-premium .student-hero__logo,body.ta-premium .app-logo{display:block!important;width:260px!important;max-width:42vw!important;height:auto!important;max-height:104px!important;object-fit:contain!important;flex:0 0 auto!important;background:transparent!important;border:0!important;border-radius:0!important;padding:0!important;box-shadow:none!important;filter:drop-shadow(0 3px 7px rgba(0,0,0,.28))!important}',
      '@media(max-width:780px){body.ta-premium .student-hero__logo,body.ta-premium .app-logo{width:245px!important;max-width:72vw!important;max-height:94px!important;margin:2px 0 5px!important}}',
      '@media(max-width:560px){body.ta-premium .student-hero__logo,body.ta-premium .app-logo{width:min(245px,82vw)!important;max-width:min(245px,82vw)!important;max-height:90px!important}}'
    ].join('');

    document.head.appendChild(style);
  }

  window.TABrandIdentity = Object.freeze({
    aplicar: aplicarIdentidad,
    logo: LOGO
  });
})();