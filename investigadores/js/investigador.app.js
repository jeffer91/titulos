/* Interfaz de acceso y segunda revisión para investigadores. */
(function () {
  'use strict';

  var config = window.TA_INVESTIGADORES_CONFIG;
  var firebaseService = window.TAAdminFirebaseService;
  var repository = window.TAInvestigadorRepository;
  var investigador = null;
  var titulos = [];

  document.addEventListener('DOMContentLoaded', iniciar);

  function iniciar() {
    conectarEventos();
    setText('estadoGeneral', 'Conectando');
    firebaseService.iniciar(config.firebase).then(function (resultado) {
      if (!resultado.ok) throw new Error(resultado.mensaje || 'No se pudo conectar con Firebase.');
      setText('estadoGeneral', 'Listo');
      mensaje('accesoMensaje', '', '');
    }).catch(function (error) {
      setText('estadoGeneral', 'Sin conexión');
      mensaje('accesoMensaje', error.message || 'No se pudo iniciar la aplicación.', 'error');
      bloquearAcceso(true);
    });
  }

  function conectarEventos() {
    on('formIdentificacion', 'submit', identificar);
    on('formCrearPin', 'submit', crearPin);
    on('formLoginPin', 'submit', ingresar);
    on('btnRevisarActivacion', 'click', revisarActivacion);
    on('btnActualizarTitulos', 'click', cargarTitulos);
    on('estadoFiltro', 'change', renderTitulos);
    on('btnSalir', 'click', salir);
  }

  function identificar(event) {
    event.preventDefault();
    var cedula = soloNumeros(value('cedulaInput'));
    var button = el('btnContinuar');
    setLoading(button, true, 'Validando...');
    mensaje('accesoMensaje', 'Validando tu registro...', 'info');

    repository.buscarInvestigador(cedula).then(function (data) {
      investigador = data;
      setText('accesoTitulo', data.nombre || 'Investigador');
      ocultar('formIdentificacion');

      if (!data.pinCreado) {
        setText('accesoAyuda', 'Es tu primer ingreso. Crea un PIN personal; después Administración deberá activarlo.');
        mostrar('formCrearPin');
        mensaje('accesoMensaje', 'Registro encontrado. Crea tu PIN para continuar.', 'success');
        return;
      }

      if (!data.pinActivo) {
        mostrarPendiente();
        return;
      }

      setText('accesoAyuda', 'Tu acceso está activo. Ingresa tu PIN.');
      mostrar('formLoginPin');
      el('pinInput').focus();
      mensaje('accesoMensaje', 'PIN activo.', 'success');
    }).catch(function (error) {
      investigador = null;
      mensaje('accesoMensaje', error.message || 'No se pudo validar el registro.', 'error');
    }).finally(function () {
      setLoading(button, false);
    });
  }

  function crearPin(event) {
    event.preventDefault();
    var pin = value('nuevoPinInput');
    var confirmar = value('confirmarPinInput');
    var button = el('btnCrearPin');

    if (pin !== confirmar) return mensaje('accesoMensaje', 'Los PIN no coinciden.', 'error');
    if (!investigador) return mensaje('accesoMensaje', 'Vuelve a identificarte.', 'error');

    setLoading(button, true, 'Creando...');
    repository.crearPin(investigador, pin).then(function () {
      investigador.pinCreado = true;
      investigador.pinActivo = false;
      investigador.pinHash = '';
      valueSet('nuevoPinInput', '');
      valueSet('confirmarPinInput', '');
      ocultar('formCrearPin');
      mostrarPendiente();
    }).catch(function (error) {
      mensaje('accesoMensaje', error.message || 'No se pudo crear el PIN.', 'error');
    }).finally(function () {
      setLoading(button, false);
    });
  }

  function mostrarPendiente() {
    ocultar('formLoginPin');
    ocultar('formCrearPin');
    mostrar('panelPendiente');
    setText('accesoAyuda', 'Tu PIN fue creado correctamente. Falta la activación de Administración.');
    mensaje('accesoMensaje', 'Tu acceso está pendiente de activación.', 'warning');
  }

  function revisarActivacion() {
    if (!investigador) return;
    var button = el('btnRevisarActivacion');
    setLoading(button, true, 'Revisando...');

    repository.buscarInvestigador(investigador.cedula).then(function (data) {
      investigador = data;
      if (!data.pinActivo) {
        mensaje('accesoMensaje', 'Todavía está pendiente. Administración aún no ha activado tu PIN.', 'warning');
        return;
      }
      ocultar('panelPendiente');
      mostrar('formLoginPin');
      setText('accesoAyuda', '¡Listo! Administración activó tu PIN. Ya puedes ingresar.');
      mensaje('accesoMensaje', 'PIN activado.', 'success');
      el('pinInput').focus();
    }).catch(function (error) {
      mensaje('accesoMensaje', error.message || 'No se pudo revisar la activación.', 'error');
    }).finally(function () {
      setLoading(button, false);
    });
  }

  function ingresar(event) {
    event.preventDefault();
    var pin = value('pinInput');
    var button = el('btnIngresar');
    if (!investigador) return mensaje('accesoMensaje', 'Vuelve a identificarte.', 'error');

    setLoading(button, true, 'Ingresando...');
    repository.buscarInvestigador(investigador.cedula).then(function (actualizado) {
      investigador = actualizado;
      return repository.validarAcceso(investigador, pin);
    }).then(function () {
      valueSet('pinInput', '');
      abrirPanel();
      return repository.cargarPeriodoActivo();
    }).then(function (periodo) {
      if (periodo) valueSet('periodoInput', periodo);
      return cargarTitulos();
    }).catch(function (error) {
      mensaje('accesoMensaje', error.message || 'No se pudo iniciar sesión.', 'error');
    }).finally(function () {
      setLoading(button, false);
    });
  }

  function abrirPanel() {
    ocultar('panelAcceso');
    mostrar('panelTrabajo');
    setText('investigadorNombre', investigador.nombre || 'Investigador');
    setText('investigadorDetalle', (investigador.cedula || '') + (investigador.email ? ' · ' + investigador.email : ''));
    setText('estadoGeneral', 'Acceso activo');
  }

  function cargarTitulos() {
    if (!investigador) return Promise.resolve();
    var button = el('btnActualizarTitulos');
    var periodo = value('periodoInput');
    setLoading(button, true, 'Actualizando...');
    mensaje('revisionMensaje', 'Buscando títulos aprobados previamente por Coordinación...', 'info');

    return repository.listarTitulosHabilitados(investigador, periodo).then(function (items) {
      titulos = items;
      renderResumen();
      renderTitulos();
      mensaje('revisionMensaje', 'Títulos habilitados para segunda revisión: ' + items.length + '.', 'success');
    }).catch(function (error) {
      titulos = [];
      renderResumen();
      renderTitulos();
      mensaje('revisionMensaje', error.message || 'No se pudieron cargar los títulos.', 'error');
    }).finally(function () {
      setLoading(button, false);
    });
  }

  function renderResumen() {
    var revisados = titulos.filter(estaRevisadoPorMi).length;
    setText('totalHabilitados', titulos.length);
    setText('totalPendientes', titulos.length - revisados);
    setText('totalRevisados', revisados);
  }

  function renderTitulos() {
    var lista = el('titulosLista');
    var filtro = value('estadoFiltro') || 'TODOS';
    var items = titulos.filter(function (titulo) {
      if (filtro === 'PENDIENTE') return !estaRevisadoPorMi(titulo);
      if (filtro === 'REVISADO') return estaRevisadoPorMi(titulo);
      return true;
    });

    lista.innerHTML = '';
    if (!items.length) {
      lista.innerHTML = '<div class="empty-state"><strong>Sin títulos en este filtro</strong><p>Solo aparecen trabajos que ya fueron aprobados por Coordinación.</p></div>';
      return;
    }
    items.forEach(function (titulo) { lista.appendChild(crearCard(titulo)); });
  }

  function crearCard(titulo) {
    var article = document.createElement('article');
    var estado = titulo.estadoInvestigador || 'PENDIENTE';
    var coordinador = titulo.revisionCoordinador || {};
    article.className = 'title-card';
    var tituloCoord = titulo.tituloCoordinador || coordinador.tituloSeleccionadoTexto || titulo.tituloPreferidoTexto || 'Título sin texto';
    article.innerHTML =
      '<div class="title-head"><div><span class="state state--coord">Coordinación: ' + escapeHtml(titulo.estadoCoordinador || 'APROBADO') + '</span>' +
      '<h3>' + escapeHtml(tituloCoord) + '</h3></div>' +
      '<span class="state ' + claseEstado(estado) + '">' + escapeHtml(estado) + '</span></div>' +
      '<div class="meta"><span>' + escapeHtml(titulo.nombres || 'Sin nombre') + '</span><span>' + escapeHtml(titulo.cedula || 'Sin cédula') + '</span><span>' + escapeHtml(titulo.carrera || 'Sin carrera') + '</span><span>' + escapeHtml(titulo.periodoId || 'Sin período') + '</span></div>' +
      '<div class="coord-note"><strong>Primera revisión:</strong> ' + escapeHtml(coordinador.coordinadorNombre || coordinador.coordinadorEmail || 'Coordinación') +
      (titulo.resultadoCoordinador === 'APROBADO_CON_CORRECCION' ? ' · Título corregido por Coordinación' : '') +
      (coordinador.observacion ? ' · ' + escapeHtml(coordinador.observacion) : '') + '</div>';

    var proposals = document.createElement('div');
    proposals.className = 'proposals';
    (titulo.titulosEnviados || []).forEach(function (p) {
      var item = document.createElement('div');
      var seleccionado = Number(p.numero) === Number(titulo.tituloCoordinadorNumero || coordinador.tituloSeleccionadoNumero || 0);
      var corregido = Boolean(p.corregidoCoordinacion || (seleccionado && titulo.resultadoCoordinador === 'APROBADO_CON_CORRECCION'));
      item.className = 'proposal' + (seleccionado ? ' is-selected-by-coord' : '') + (corregido ? ' is-corrected-by-coord' : '');
      item.innerHTML =
        '<div class="proposal__head"><strong>Título ' + escapeHtml(p.numero || '') + '</strong>' +
        (seleccionado ? '<span>Seleccionado por Coordinación</span>' : '') +
        (corregido ? '<span class="proposal__corrected">Corregido</span>' : '') +
        '</div><p>' + escapeHtml(p.tituloFinal || p.titulo || 'Sin título') + '</p>' +
        (corregido && p.tituloOriginalCoordinacion ? '<small><b>Original:</b> ' + escapeHtml(p.tituloOriginalCoordinacion) + '</small>' : '');
      proposals.appendChild(item);
    });
    if (titulo.titulosEnviados && titulo.titulosEnviados.length) article.appendChild(proposals);

    var decision = document.createElement('div');
    decision.className = 'decision';
    var obs = document.createElement('textarea');
    obs.rows = 2;
    obs.placeholder = 'Observación de investigación (obligatoria si devuelves o apruebas con observación)';
    obs.value = titulo.revisionInvestigador && titulo.revisionInvestigador.observacion || '';
    decision.appendChild(obs);

    var actions = document.createElement('div');
    actions.className = 'actions';
    actions.appendChild(botonDecision('Aprobar', 'APROBAR', 'btn--success', titulo, obs));
    actions.appendChild(botonDecision('Aprobar con observación', 'APROBAR_OBSERVACION', 'btn--secondary', titulo, obs));
    actions.appendChild(botonDecision('Devolver', 'DEVOLVER', 'btn--danger', titulo, obs));
    decision.appendChild(actions);
    article.appendChild(decision);
    return article;
  }

  function botonDecision(texto, accion, clase, titulo, obs) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn ' + clase;
    button.textContent = texto;
    button.addEventListener('click', function () {
      setLoading(button, true, 'Guardando...');
      repository.revisarTitulo(titulo, accion, obs.value, investigador).then(function (actualizado) {
        var indice = titulos.findIndex(function (item) { return item.id === titulo.id; });
        if (indice >= 0) titulos[indice] = actualizado;
        renderResumen();
        renderTitulos();
        mensaje('revisionMensaje', 'Revisión de investigación guardada correctamente.', 'success');
      }).catch(function (error) {
        mensaje('revisionMensaje', error.message || 'No se pudo guardar la revisión.', 'error');
      }).finally(function () {
        setLoading(button, false);
      });
    });
    return button;
  }

  function estaRevisadoPorMi(titulo) {
    return Boolean(titulo.revisionInvestigador && titulo.revisionInvestigador.investigadorId === investigador.id);
  }

  function salir() {
    investigador = null;
    titulos = [];
    ocultar('panelTrabajo');
    mostrar('panelAcceso');
    mostrar('formIdentificacion');
    ocultar('formCrearPin');
    ocultar('formLoginPin');
    ocultar('panelPendiente');
    valueSet('cedulaInput', '');
    valueSet('periodoInput', '');
    setText('accesoTitulo', 'Ingresa tu cédula');
    setText('accesoAyuda', 'En tu primer ingreso podrás crear un PIN. El acceso quedará pendiente hasta que Administración lo active.');
    setText('estadoGeneral', 'Listo');
    mensaje('accesoMensaje', '', '');
  }

  function bloquearAcceso(state) {
    ['cedulaInput', 'btnContinuar'].forEach(function (id) { if (el(id)) el(id).disabled = Boolean(state); });
  }
  function claseEstado(estado) {
    if (estado === 'APROBADO') return 'state--success';
    if (estado === 'DEVUELTO') return 'state--danger';
    if (estado === 'APROBADO_CON_OBSERVACION') return 'state--warning';
    return 'state--pending';
  }
  function setLoading(button, state, text) {
    if (!button) return;
    if (state) { button.dataset.text = button.textContent; button.textContent = text || 'Procesando...'; button.disabled = true; }
    else { button.textContent = button.dataset.text || button.textContent; button.disabled = false; }
  }
  function mensaje(id, text, tipo) {
    var node = el(id); if (!node) return;
    node.textContent = text || '';
    node.className = 'message' + (tipo ? ' message--' + tipo : '');
  }
  function mostrar(id) { var node = typeof id === 'string' ? el(id) : id; if (node) node.classList.remove('is-hidden'); }
  function ocultar(id) { var node = typeof id === 'string' ? el(id) : id; if (node) node.classList.add('is-hidden'); }
  function el(id) { return document.getElementById(id); }
  function on(id, event, handler) { var node = el(id); if (node) node.addEventListener(event, handler); }
  function value(id) { var node = el(id); return node ? String(node.value || '').trim() : ''; }
  function valueSet(id, val) { var node = el(id); if (node) node.value = val || ''; }
  function setText(id, text) { var node = el(id); if (node) node.textContent = text === undefined || text === null ? '' : String(text); }
  function soloNumeros(value) { return String(value || '').replace(/\D/g, ''); }
  function escapeHtml(value) { return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;'); }
})();
