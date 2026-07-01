/* Pantalla de decisiones de títulos para coordinadores. */
(function () {
  'use strict';

  var config = window.TA_COORDINADORES_CONFIG;
  var firebaseService = window.TACoordFirebaseService;
  var repository = window.TACoordRepository;
  var coord = null;
  var filtro = null;
  var firebaseListo = false;

  document.addEventListener('DOMContentLoaded', iniciar);

  function iniciar() {
    var form = document.getElementById('formRevision');
    if (form) form.addEventListener('submit', consultar);
    bloquearFormulario(true);
    iniciarFirebase();
  }

  function iniciarFirebase() {
    setText('estadoGeneral', 'Conectando Firebase');

    if (!firebaseService || !repository) {
      setText('estadoGeneral', 'Archivos incompletos');
      msg('No se cargaron los servicios del módulo coordinadores.', 'error');
      return;
    }

    firebaseService.iniciar(config.firebase).then(function (resultado) {
      firebaseListo = resultado.ok;
      setText('estadoGeneral', resultado.ok ? 'Firebase conectado' : 'Firebase pendiente');
      msg(resultado.ok ? 'Firebase conectado. Ya puedes consultar títulos.' : resultado.mensaje, resultado.ok ? 'success' : 'warning');
      bloquearFormulario(!resultado.ok);
      if (resultado.ok) cargarPeriodo();
    }).catch(function (error) {
      firebaseListo = false;
      setText('estadoGeneral', 'Firebase error');
      msg('No se pudo iniciar Firebase: ' + mensajeError(error), 'error');
      bloquearFormulario(true);
    });
  }

  function cargarPeriodo() {
    repository.cargarConfigApp().then(function (appConfig) {
      var input = document.getElementById('periodoInput');
      if (input && appConfig.periodoActivo) input.value = appConfig.periodoActivo;
    }).catch(function () {});
  }

  function consultar(event) {
    event.preventDefault();

    if (!firebaseListo) return msg('Firebase no está conectado.', 'warning');

    var email = val('coordEmailInput');
    var periodo = val('periodoInput');
    var estado = val('estadoFiltroInput') || 'TODOS';

    if (!email) return msg('Ingresa el correo del coordinador.', 'error');
    if (!periodo) return msg('Ingresa el período.', 'error');

    filtro = { periodoId: periodo, estado: estado };
    coord = null;

    setLoading('btnConsultar', true, 'Consultando...');
    msg('Consultando títulos...', 'info');
    pintar([]);

    repository.buscarCoordinadorPorEmail(email)
      .then(function (coordinador) {
        coord = coordinador;
        return repository.listarTitulosParaCoordinador(coordinador, filtro);
      })
      .then(function (titulos) {
        pintar(titulos);
        msg('Títulos encontrados: ' + titulos.length + '.', 'success');
      })
      .catch(function (error) {
        pintar([]);
        msg('No se pudo consultar: ' + mensajeError(error), 'error');
      })
      .finally(function () {
        setLoading('btnConsultar', false);
      });
  }

  function recargar() {
    if (!coord || !filtro) return Promise.resolve([]);
    return repository.listarTitulosParaCoordinador(coord, filtro).then(function (titulos) {
      pintar(titulos);
      return titulos;
    });
  }

  function pintar(titulos) {
    var lista = document.getElementById('revisionLista');
    if (!lista) return;
    lista.innerHTML = '';

    if (!titulos.length) {
      var empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'No hay títulos para mostrar.';
      lista.appendChild(empty);
      return;
    }

    titulos.forEach(function (titulo) {
      lista.appendChild(card(titulo));
    });
  }

  function card(titulo) {
    var div = document.createElement('article');
    div.className = 'title-item';

    var top = document.createElement('div');
    top.className = 'title-item__top';

    var info = document.createElement('div');
    var h = document.createElement('h3');
    h.textContent = titulo.tituloPreferidoTexto || 'Sin título preferido';
    info.appendChild(h);
    info.appendChild(meta(titulo));

    top.appendChild(info);
    div.appendChild(top);
    div.appendChild(propuestas(titulo));
    div.appendChild(panelDecision(titulo));
    return div;
  }

  function meta(titulo) {
    var wrap = document.createElement('div');
    wrap.className = 'title-meta';
    wrap.appendChild(badge(titulo.estado || 'ENVIADO', claseEstado(titulo.estado)));
    wrap.appendChild(badge(titulo.nombres || 'Sin nombres'));
    wrap.appendChild(badge(titulo.cedula || 'Sin cédula'));
    wrap.appendChild(badge(titulo.carrera || 'Sin carrera'));
    wrap.appendChild(badge('Preferido: propuesta ' + (titulo.tituloPreferidoNumero || 1)));
    if (titulo.revision && titulo.revision.coordinadorNombre) wrap.appendChild(badge('Revisado por: ' + titulo.revision.coordinadorNombre));
    return wrap;
  }

  function propuestas(titulo) {
    var wrap = document.createElement('div');
    wrap.className = 'proposal-list';

    var lista = Array.isArray(titulo.titulosEnviados) ? titulo.titulosEnviados : [];
    if (!lista.length) {
      var empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'Este registro no tiene propuestas cargadas.';
      wrap.appendChild(empty);
      return wrap;
    }

    lista.forEach(function (propuesta) {
      var item = document.createElement('div');
      item.className = 'proposal-item';
      var s = document.createElement('strong');
      s.textContent = 'Propuesta ' + propuesta.numero + (Number(propuesta.numero) === Number(titulo.tituloPreferidoNumero) ? ' · preferida' : '');
      var t = document.createElement('p');
      t.textContent = 'Título: ' + (propuesta.tituloFinal || 'Sin título');
      var tema = document.createElement('p');
      tema.textContent = 'Tema: ' + (propuesta.temaGeneral || '—');
      var problema = document.createElement('p');
      problema.textContent = 'Problema: ' + (propuesta.problemaNecesidad || '—');
      item.appendChild(s);
      item.appendChild(t);
      item.appendChild(tema);
      item.appendChild(problema);
      wrap.appendChild(item);
    });

    return wrap;
  }

  function panelDecision(titulo) {
    var panel = document.createElement('div');
    panel.className = 'review-panel';

    var label = document.createElement('label');
    label.textContent = 'Observación';

    var obs = document.createElement('textarea');
    obs.rows = 3;
    obs.placeholder = 'Obligatoria si apruebas con observación o devuelves.';
    if (titulo.revision && titulo.revision.observacion) obs.value = titulo.revision.observacion;

    var acciones = document.createElement('div');
    acciones.className = 'review-actions';
    acciones.appendChild(boton('Aprobar', 'APROBAR', 'btn--success', titulo, obs));
    acciones.appendChild(boton('Aprobar con observación', 'APROBAR_OBSERVACION', 'btn--secondary', titulo, obs));
    acciones.appendChild(boton('Devolver', 'DEVOLVER', 'btn--danger', titulo, obs));

    panel.appendChild(label);
    panel.appendChild(obs);
    panel.appendChild(acciones);
    return panel;
  }

  function boton(texto, accion, clase, titulo, obs) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn ' + clase;
    b.textContent = texto;
    b.addEventListener('click', function () {
      guardarDecision(titulo, accion, obs, b);
    });
    return b;
  }

  function guardarDecision(titulo, accion, obs, button) {
    var observacion = obs ? String(obs.value || '').trim() : '';

    if (!coord) return msg('Primero consulta con el correo del coordinador.', 'error');
    if ((accion === 'APROBAR_OBSERVACION' || accion === 'DEVOLVER') && !observacion) {
      if (obs) obs.focus();
      return msg('Escribe una observación para esta decisión.', 'error');
    }

    setLoadingElement(button, true, 'Guardando...');
    msg('Guardando decisión...', 'info');

    repository.revisarTitulo(titulo, accion, observacion, coord)
      .then(function () {
        msg('Decisión guardada correctamente.', 'success');
        return recargar();
      })
      .catch(function (error) {
        msg('No se pudo guardar la decisión: ' + mensajeError(error), 'error');
      })
      .finally(function () {
        setLoadingElement(button, false);
      });
  }

  function badge(texto, extraClass) {
    var span = document.createElement('span');
    span.className = 'title-badge' + (extraClass ? ' ' + extraClass : '');
    span.textContent = texto || '—';
    return span;
  }

  function claseEstado(estado) {
    var normalized = String(estado || '').toUpperCase();
    if (normalized.indexOf('APROBADO') !== -1) return 'is-aprobado';
    if (normalized.indexOf('DEVUELTO') !== -1) return 'is-devuelto';
    return 'is-enviado';
  }

  function bloquearFormulario(disabled) {
    var form = document.getElementById('formRevision');
    if (!form) return;
    Array.prototype.slice.call(form.querySelectorAll('input, select, button')).forEach(function (element) {
      element.disabled = Boolean(disabled);
    });
  }

  function val(id) {
    var e = document.getElementById(id);
    return e ? String(e.value || '').trim() : '';
  }

  function setText(id, text) {
    var e = document.getElementById(id);
    if (e) e.textContent = text || '';
  }

  function msg(text, type) {
    var e = document.getElementById('revisionMensaje');
    if (!e) return;
    e.classList.remove('is-info', 'is-success', 'is-warning', 'is-error');
    if (type) e.classList.add('is-' + type);
    e.textContent = text || '';
  }

  function setLoading(id, loading, text) {
    setLoadingElement(document.getElementById(id), loading, text);
  }

  function setLoadingElement(button, loading, text) {
    if (!button) return;
    if (loading) {
      if (!button.dataset.originalText) button.dataset.originalText = button.textContent;
      button.textContent = text || 'Cargando...';
      button.disabled = true;
      return;
    }
    button.disabled = false;
    if (button.dataset.originalText) {
      button.textContent = button.dataset.originalText;
      delete button.dataset.originalText;
    }
  }

  function mensajeError(error) {
    return error && error.message ? error.message : String(error || 'Error desconocido');
  }
})();
