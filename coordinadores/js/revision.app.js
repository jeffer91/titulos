/* Pantalla de decisiones de títulos para coordinadores. */
(function () {
  'use strict';

  var config = window.TA_COORDINADORES_CONFIG;
  var firebaseService = window.TACoordFirebaseService;
  var repository = window.TACoordRepository;
  var coord = null;
  var filtro = null;

  document.addEventListener('DOMContentLoaded', function () {
    var form = document.getElementById('formRevision');
    if (form) form.addEventListener('submit', consultar);
    firebaseService.iniciar(config.firebase).then(function (r) {
      setText('estadoGeneral', r.ok ? 'Firebase conectado' : 'Firebase pendiente');
      msg(r.ok ? 'Firebase conectado.' : r.mensaje, r.ok ? 'success' : 'warning');
      if (r.ok) cargarPeriodo();
    });
  });

  function cargarPeriodo() {
    repository.cargarConfigApp().then(function (appConfig) {
      var input = document.getElementById('periodoInput');
      if (input && appConfig.periodoActivo) input.value = appConfig.periodoActivo;
    }).catch(function () {});
  }

  function consultar(event) {
    event.preventDefault();
    var email = val('coordEmailInput');
    var periodo = val('periodoInput');
    var estado = val('estadoFiltroInput') || 'TODOS';
    if (!email || !periodo) return msg('Ingresa correo y período.', 'error');
    filtro = { periodoId: periodo, estado: estado };
    msg('Consultando títulos...', 'info');
    repository.buscarCoordinadorPorEmail(email)
      .then(function (c) {
        coord = c;
        return repository.listarTitulosParaCoordinador(c, filtro);
      })
      .then(pintar)
      .catch(function (e) { msg(e.message, 'error'); pintar([]); });
  }

  function pintar(titulos) {
    var lista = document.getElementById('revisionLista');
    if (!lista) return;
    lista.innerHTML = '';
    if (!titulos.length) {
      lista.textContent = 'No hay títulos para mostrar.';
      return;
    }
    titulos.forEach(function (t) { lista.appendChild(card(t)); });
    msg('Títulos encontrados: ' + titulos.length + '.', 'success');
  }

  function card(t) {
    var div = document.createElement('article');
    div.className = 'title-item';
    var h = document.createElement('h3');
    h.textContent = t.tituloPreferidoTexto || 'Sin título preferido';
    div.appendChild(h);
    var p = document.createElement('p');
    p.textContent = (t.nombres || '') + ' | ' + (t.cedula || '') + ' | ' + (t.estado || 'ENVIADO');
    div.appendChild(p);
    var obs = document.createElement('textarea');
    obs.rows = 3;
    obs.placeholder = 'Observación';
    div.appendChild(obs);
    div.appendChild(btn('Aprobar', 'APROBAR', t, obs));
    div.appendChild(btn('Aprobar con observación', 'APROBAR_OBSERVACION', t, obs));
    div.appendChild(btn('Devolver', 'DEVOLVER', t, obs));
    return div;
  }

  function btn(text, action, titulo, obs) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn--secondary';
    b.textContent = text;
    b.addEventListener('click', function () {
      repository.revisarTitulo(titulo, action, obs.value, coord)
        .then(function () { msg('Decisión guardada.', 'success'); return repository.listarTitulosParaCoordinador(coord, filtro); })
        .then(pintar)
        .catch(function (e) { msg(e.message, 'error'); });
    });
    return b;
  }

  function val(id) { var e = document.getElementById(id); return e ? String(e.value || '').trim() : ''; }
  function setText(id, text) { var e = document.getElementById(id); if (e) e.textContent = text || ''; }
  function msg(text, type) {
    var e = document.getElementById('revisionMensaje');
    if (!e) return;
    e.classList.remove('is-info', 'is-success', 'is-warning', 'is-error');
    if (type) e.classList.add('is-' + type);
    e.textContent = text || '';
  }
})();
