/* Controlador base del módulo coordinadores. */
(function () {
  'use strict';

  var config = window.TA_COORDINADORES_CONFIG;

  document.addEventListener('DOMContentLoaded', iniciar);

  function iniciar() {
    actualizarEstado();
    renderDiagnostico();
  }

  function actualizarEstado() {
    var estado = document.getElementById('estadoGeneral');
    if (!estado) return;

    estado.textContent = detectarModoEjecucion();
  }

  function renderDiagnostico() {
    var container = document.getElementById('diagnosticoModulo');
    if (!container) return;

    var items = [
      {
        titulo: 'HTML independiente',
        descripcion: 'Pantalla base creada para coordinadores.',
        estado: 'ok'
      },
      {
        titulo: 'CSS propio',
        descripcion: 'El módulo usa estilos propios y no depende de estudiantes.',
        estado: 'ok'
      },
      {
        titulo: 'JS propio',
        descripcion: 'El módulo tiene configuración y controlador independientes.',
        estado: 'ok'
      },
      {
        titulo: 'Firebase',
        descripcion: 'Pendiente para bloques posteriores.',
        estado: 'pending'
      },
      {
        titulo: 'Electron',
        descripcion: 'Pendiente para el instalador propio de coordinadores.',
        estado: 'pending'
      },
      {
        titulo: 'Revisión de títulos',
        descripcion: 'Pendiente de implementar el flujo completo.',
        estado: 'pending'
      }
    ];

    container.innerHTML = '';
    items.forEach(function (item) {
      var card = document.createElement('div');
      card.className = 'diagnostic-item ' + (item.estado === 'ok' ? 'is-ok' : 'is-pending');

      var title = document.createElement('strong');
      title.textContent = item.titulo;

      var description = document.createElement('p');
      description.textContent = item.descripcion;

      card.appendChild(title);
      card.appendChild(description);
      container.appendChild(card);
    });
  }

  function detectarModoEjecucion() {
    if (window.location.protocol === 'file:') return 'Doble click';
    if (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost') return 'Live Server';
    if (window.navigator && /Electron/i.test(window.navigator.userAgent)) return 'Electron';
    return 'Web';
  }
})();
