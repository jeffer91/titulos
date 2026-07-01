/* Checklist visual de seguridad para pantallas del sistema. */
(function () {
  'use strict';

  function revisar(config, containerId) {
    var container = document.getElementById(containerId || 'securityChecklist');
    if (!container || !config) return;

    var items = [
      {
        ok: config.firebase && config.firebase.projectId && config.firebase.projectId.indexOf('COLOCA_AQUI') === -1,
        titulo: 'Firebase configurado',
        detalle: 'El projectId no debe quedar con texto de ejemplo.'
      },
      {
        ok: Boolean(config.collections),
        titulo: 'Colecciones declaradas',
        detalle: 'El módulo tiene mapa de colecciones.'
      },
      {
        ok: Boolean(config.modulo),
        titulo: 'Módulo identificado',
        detalle: 'Cada pantalla declara su módulo de trabajo.'
      }
    ];

    container.innerHTML = '';
    items.forEach(function (item) {
      var div = document.createElement('div');
      div.className = 'security-item ' + (item.ok ? '' : 'security-item--warning');
      var h3 = document.createElement('h3');
      h3.textContent = item.ok ? 'Listo: ' + item.titulo : 'Revisar: ' + item.titulo;
      var p = document.createElement('p');
      p.textContent = item.detalle;
      div.appendChild(h3);
      div.appendChild(p);
      container.appendChild(div);
    });
  }

  window.TASecurityCheck = Object.freeze({ revisar: revisar });
})();
