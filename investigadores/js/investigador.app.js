/* Flujo de acceso y cola FIFO de segunda revisión para investigadores. */
(function () {
  'use strict';

  var config = window.TA_INVESTIGADORES_CONFIG;
  var firebaseService = window.TAAdminFirebaseService;
  var repository = window.TAInvestigadorRepository;

  var investigador = null;
  var titulos = [];
  var periodoActivo = '';
  var carreraActual = '';

  document.addEventListener('DOMContentLoaded', iniciar);

  function iniciar() {
    conectarEventos();
    setText('estadoGeneral', 'Conectando');

    firebaseService.iniciar(config.firebase)
      .then(function (resultado) {
        if (!resultado.ok) throw new Error(resultado.mensaje || 'No se pudo conectar con Firebase.');
        setText('estadoGeneral', 'Listo');
        mensaje('accesoMensaje', '', '');
      })
      .catch(function (error) {
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
    on('btnActualizarTitulos', 'click', function () { cargarTitulos(true); });
    on('btnVolverCarreras', 'click', volverCarreras);
    on('btnSalir', 'click', salir);
  }

  function identificar(event) {
    event.preventDefault();

    var cedula = soloNumeros(value('cedulaInput'));
    var button = el('btnContinuar');

    setLoading(button, true, 'Validando...');
    mensaje('accesoMensaje', 'Validando tu registro...', 'info');

    repository.buscarInvestigador(cedula)
      .then(function (data) {
        investigador = data;
        setText('accesoTitulo', data.nombre || 'Investigador');
        ocultar('formIdentificacion');

        if (!data.pinCreado) {
          setText('accesoAyuda', 'Tu registro todavía no tiene un PIN asignado. Solicítalo a Administración.');
          mensaje('accesoMensaje', 'No tienes un PIN asignado.', 'warning');
          return;
        }

        ocultar('panelPendiente');
        ocultar('formCrearPin');
        setText('accesoAyuda', 'Ingresa tu PIN para acceder.');
        mostrar('formLoginPin');
        mensaje('accesoMensaje', 'Acceso listo.', 'success');

        var input = el('pinInput');
        if (input) input.focus();
      })
      .catch(function (error) {
        investigador = null;
        mensaje('accesoMensaje', error.message || 'No se pudo validar el registro.', 'error');
      })
      .finally(function () {
        setLoading(button, false);
      });
  }

  function crearPin(event) {
    event.preventDefault();

    var pin = value('nuevoPinInput');
    var confirmar = value('confirmarPinInput');
    var button = el('btnCrearPin');

    if (pin !== confirmar) {
      mensaje('accesoMensaje', 'Los PIN no coinciden.', 'error');
      return;
    }

    if (!investigador) {
      mensaje('accesoMensaje', 'Vuelve a identificarte.', 'error');
      return;
    }

    setLoading(button, true, 'Creando...');

    repository.crearPin(investigador, pin)
      .then(function () {
        valueSet('nuevoPinInput', '');
        valueSet('confirmarPinInput', '');
        ocultar('formCrearPin');

        return repository.buscarInvestigador(investigador.cedula);
      })
      .then(function (actualizado) {
        investigador = actualizado;
        setText('accesoAyuda', 'PIN creado. Ingresa el mismo PIN para acceder.');
        mostrar('formLoginPin');
        mensaje('accesoMensaje', 'PIN creado correctamente.', 'success');
        var input = el('pinInput');
        if (input) input.focus();
      })
      .catch(function (error) {
        mensaje('accesoMensaje', error.message || 'No se pudo crear el PIN.', 'error');
      })
      .finally(function () {
        setLoading(button, false);
      });
  }

  function revisarActivacion() {
    if (!investigador) return;

    repository.buscarInvestigador(investigador.cedula)
      .then(function (data) {
        investigador = data;
        ocultar('panelPendiente');

        if (!data.pinCreado) {
          mensaje('accesoMensaje', 'Todavía no tienes un PIN asignado.', 'warning');
          return;
        }

        mostrar('formLoginPin');
        setText('accesoAyuda', 'Ingresa tu PIN para acceder.');
        mensaje('accesoMensaje', 'PIN registrado.', 'success');
      })
      .catch(function (error) {
        mensaje('accesoMensaje', error.message || 'No se pudo revisar el acceso.', 'error');
      });
  }

  function ingresar(event) {
    event.preventDefault();

    var pin = value('pinInput');
    var button = el('btnIngresar');

    if (!investigador) {
      mensaje('accesoMensaje', 'Vuelve a identificarte.', 'error');
      return;
    }

    setLoading(button, true, 'Ingresando...');

    repository.buscarInvestigador(investigador.cedula)
      .then(function (actualizado) {
        investigador = actualizado;
        return repository.validarAcceso(investigador, pin);
      })
      .then(function () {
        valueSet('pinInput', '');
        abrirPanel();
        return repository.cargarPeriodoActivo();
      })
      .then(function (periodo) {
        periodoActivo = periodo || '';
        return cargarTitulos(false);
      })
      .catch(function (error) {
        mensaje('accesoMensaje', error.message || 'No se pudo iniciar sesión.', 'error');
      })
      .finally(function () {
        setLoading(button, false);
      });
  }

  function abrirPanel() {
    ocultar('panelAcceso');
    mostrar('panelTrabajo');
    mostrar('panelCarreras');
    ocultar('panelCola');

    setText('investigadorNombre', investigador.nombre || 'Investigador');
    setText(
      'investigadorDetalle',
      (investigador.cedula || '') + (investigador.email ? ' · ' + investigador.email : '')
    );
    setText('estadoGeneral', 'Acceso activo');
  }

  function cargarTitulos(mantenerCarrera) {
    if (!investigador) return Promise.resolve();

    var button = el('btnActualizarTitulos');
    setLoading(button, true, 'Actualizando...');
    mensaje('revisionMensaje', 'Actualizando cola de revisión...', 'info');

    return repository.listarTitulosHabilitados(investigador, periodoActivo)
      .then(function (items) {
        titulos = items || [];
        renderResumen();
        renderCarreras();

        if (mantenerCarrera && carreraActual) {
          renderCola();
        } else {
          volverCarreras(false);
        }

        var pendientes = titulos.filter(esPendiente).length;
        mensaje(
          'revisionMensaje',
          pendientes
            ? pendientes + ' expediente' + (pendientes === 1 ? '' : 's') + ' pendiente' + (pendientes === 1 ? '' : 's') + ' de revisión.'
            : 'No hay expedientes pendientes de revisión.',
          pendientes ? 'success' : 'info'
        );
      })
      .catch(function (error) {
        titulos = [];
        renderResumen();
        renderCarreras();
        mensaje('revisionMensaje', error.message || 'No se pudieron cargar los títulos.', 'error');
      })
      .finally(function () {
        setLoading(button, false);
      });
  }

  function renderResumen() {
    var pendientes = titulos.filter(esPendiente);
    var carreras = agruparCarreras(pendientes);
    var revisados = titulos.filter(estaRevisadoPorMi).length;

    setText('totalPendientes', pendientes.length);
    setText('totalCarrerasPendientes', carreras.length);
    setText('totalRevisados', revisados);
  }

  function renderCarreras() {
    var body = el('carrerasPendientesBody');
    if (!body) return;

    var pendientes = titulos.filter(esPendiente);
    var grupos = agruparCarreras(pendientes);

    setText(
      'periodoActualTexto',
      periodoActivo
        ? 'Período ' + formatearPeriodo(periodoActivo) + ' · revisión por orden de envío.'
        : 'Revisión por orden de envío.'
    );

    body.innerHTML = '';

    if (!grupos.length) {
      body.innerHTML =
        '<tr><td colspan="4" class="queue-empty">' +
        '<strong>Todo al día</strong><span>No hay carreras con expedientes pendientes.</span>' +
        '</td></tr>';
      return;
    }

    grupos.forEach(function (grupo) {
      var tr = document.createElement('tr');
      var primer = grupo.items[0];

      tr.innerHTML =
        '<td><div class="career-name"><strong>' + escapeHtml(grupo.carrera) + '</strong>' +
        '<span>' + grupo.items.length + ' por revisar</span></div></td>' +
        '<td class="text-center"><span class="queue-count">' + grupo.items.length + '</span></td>' +
        '<td><span class="queue-date">' + escapeHtml(formatearFecha(primer.fechaColaInvestigacion || primer.fechaEnvio)) + '</span></td>' +
        '<td class="text-right"></td>';

      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn--primary btn--compact';
      button.textContent = 'Ingresar →';
      button.addEventListener('click', function () {
        entrarCarrera(grupo.carrera);
      });

      tr.children[3].appendChild(button);
      body.appendChild(tr);
    });
  }

  function agruparCarreras(items) {
    var mapa = {};

    (items || []).forEach(function (titulo) {
      var carrera = limpiar(titulo.carrera) || 'Sin carrera';
      var clave = normalizar(carrera);

      if (!mapa[clave]) {
        mapa[clave] = { carrera: carrera, items: [] };
      }

      mapa[clave].items.push(titulo);
    });

    return Object.keys(mapa).map(function (clave) {
      var grupo = mapa[clave];
      grupo.items.sort(compararPorEnvio);
      return grupo;
    }).sort(function (a, b) {
      if (b.items.length !== a.items.length) return b.items.length - a.items.length;
      return a.carrera.localeCompare(b.carrera);
    });
  }

  function entrarCarrera(carrera) {
    carreraActual = carrera;
    ocultar('panelCarreras');
    mostrar('panelCola');
    renderCola();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function volverCarreras(scroll) {
    carreraActual = '';
    mostrar('panelCarreras');
    ocultar('panelCola');
    if (scroll !== false) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderCola() {
    var contenedor = el('tituloActual');
    if (!contenedor) return;

    var items = titulos.filter(function (titulo) {
      return esPendiente(titulo) && normalizar(titulo.carrera) === normalizar(carreraActual);
    }).sort(compararPorEnvio);

    setText('colaCarreraNombre', carreraActual || 'Carrera');
    setText('colaContador', items.length + ' pendiente' + (items.length === 1 ? '' : 's'));
    setText('colaPosicion', items.length ? 'Revisión 1 de ' + items.length : 'Carrera al día');
    setText('colaOrdenInfo', 'Primero se revisa el envío más antiguo');

    contenedor.innerHTML = '';

    if (!items.length) {
      contenedor.innerHTML =
        '<div class="empty-state queue-done"><strong>✓ Carrera al día</strong>' +
        '<p>No quedan expedientes pendientes en esta carrera.</p>' +
        '<button class="btn btn--primary" type="button" id="btnCarreraLista">Volver a carreras</button></div>';

      var volver = el('btnCarreraLista');
      if (volver) volver.addEventListener('click', volverCarreras);
      renderResumen();
      renderCarreras();
      return;
    }

    contenedor.appendChild(crearExpediente(items[0]));
  }

  function crearExpediente(titulo) {
    var article = document.createElement('article');
    var coordinador = titulo.revisionCoordinador || {};
    var seleccionadoNumero = Number(
      titulo.tituloCoordinadorNumero ||
      coordinador.tituloSeleccionadoNumero ||
      0
    );

    article.className = 'title-card queue-title-card';

    article.innerHTML =
      '<div class="queue-card-head">' +
        '<div>' +
          '<span class="state state--coord">Habilitado por Coordinación</span>' +
          '<h3>' + escapeHtml(titulo.nombres || 'Estudiante') + '</h3>' +
          '<div class="meta">' +
            '<span>' + escapeHtml(titulo.cedula || 'Sin cédula') + '</span>' +
            '<span>' + escapeHtml(titulo.carrera || 'Sin carrera') + '</span>' +
            '<span>' + escapeHtml(formatearPeriodo(titulo.periodoId || periodoActivo)) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="queue-arrival">' +
          '<span>Enviado</span>' +
          '<strong>' + escapeHtml(formatearFecha(titulo.fechaColaInvestigacion || titulo.fechaEnvio)) + '</strong>' +
        '</div>' +
      '</div>' +
      (coordinador.observacion
        ? '<div class="coord-note"><strong>Observación de Coordinación:</strong> ' + escapeHtml(coordinador.observacion) + '</div>'
        : '');

    var proposals = document.createElement('div');
    proposals.className = 'proposals proposals--review';

    (titulo.titulosEnviados || []).forEach(function (p) {
      var item = document.createElement('article');
      var numero = Number(p.numero || 0);
      var seleccionado = numero === seleccionadoNumero;
      var corregido = Boolean(
        p.corregidoCoordinacion ||
        (seleccionado && titulo.resultadoCoordinador === 'APROBADO_CON_CORRECCION')
      );

      item.className =
        'proposal' +
        (seleccionado ? ' is-selected-by-coord' : '') +
        (corregido ? ' is-corrected-by-coord' : '');

      item.innerHTML =
        '<div class="proposal__head">' +
          '<strong>Título ' + escapeHtml(numero || '') + '</strong>' +
          (seleccionado ? '<span>Seleccionado por Coordinación</span>' : '') +
          (corregido ? '<span class="proposal__corrected">Corregido</span>' : '') +
        '</div>' +
        '<p>' + escapeHtml(p.tituloFinal || p.titulo || 'Sin título') + '</p>' +
        (corregido && p.tituloOriginalCoordinacion
          ? '<small><b>Original:</b> ' + escapeHtml(p.tituloOriginalCoordinacion) + '</small>'
          : '');

      proposals.appendChild(item);
    });

    article.appendChild(proposals);

    var decision = document.createElement('div');
    decision.className = 'decision queue-decision';

    var obsLabel = document.createElement('label');
    obsLabel.setAttribute('for', 'observacionInvestigacionActual');
    obsLabel.textContent = 'Observación';

    var obs = document.createElement('textarea');
    obs.id = 'observacionInvestigacionActual';
    obs.rows = 2;
    obs.placeholder = 'Obligatoria si apruebas con observación o devuelves.';

    decision.appendChild(obsLabel);
    decision.appendChild(obs);

    var actions = document.createElement('div');
    actions.className = 'actions actions--review';
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
      bloquearDecisiones(true);

      repository.revisarTitulo(titulo, accion, obs.value, investigador)
        .then(function () {
          mensaje('revisionMensaje', 'Revisión guardada. Cargando el siguiente expediente...', 'success');
          return cargarTitulos(true);
        })
        .catch(function (error) {
          mensaje('revisionMensaje', error.message || 'No se pudo guardar la revisión.', 'error');
          bloquearDecisiones(false);
        })
        .finally(function () {
          setLoading(button, false);
        });
    });

    return button;
  }

  function bloquearDecisiones(estado) {
    document.querySelectorAll('.actions--review .btn').forEach(function (button) {
      button.disabled = Boolean(estado);
    });
  }

  function esPendiente(titulo) {
    if (repository.estaPendienteInvestigacion) {
      return repository.estaPendienteInvestigacion(titulo);
    }

    var estado = String(titulo.estado || '').toUpperCase();
    var proceso = String(titulo.estadoProceso || '').toUpperCase();
    return proceso === 'PENDIENTE_INVESTIGADOR' || estado === 'PENDIENTE_INVESTIGADOR';
  }

  function estaRevisadoPorMi(titulo) {
    var revision = titulo && titulo.revisionInvestigador;
    return Boolean(
      revision &&
      revision.investigadorId === investigador.id &&
      String(revision.estado || '').toUpperCase() !== 'PENDIENTE'
    );
  }

  function compararPorEnvio(a, b) {
    var fechaA = Number(a && a.fechaColaMs || Number.MAX_SAFE_INTEGER);
    var fechaB = Number(b && b.fechaColaMs || Number.MAX_SAFE_INTEGER);

    if (fechaA !== fechaB) return fechaA - fechaB;
    return String(a && a.nombres || '').localeCompare(String(b && b.nombres || ''));
  }

  function formatearFecha(valor) {
    if (!valor) return 'Sin fecha';

    try {
      var fecha = new Date(valor);
      if (isNaN(fecha.getTime())) return 'Sin fecha';

      return new Intl.DateTimeFormat('es-EC', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }).format(fecha);
    } catch (error) {
      return 'Sin fecha';
    }
  }

  function formatearPeriodo(valor) {
    var texto = limpiar(valor);
    if (!texto) return 'Sin período';

    return texto
      .replace(/_/g, ' ')
      .replace(/\bA\b/i, 'a')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function salir() {
    investigador = null;
    titulos = [];
    periodoActivo = '';
    carreraActual = '';

    ocultar('panelTrabajo');
    mostrar('panelAcceso');
    mostrar('formIdentificacion');
    ocultar('formCrearPin');
    ocultar('formLoginPin');
    ocultar('panelPendiente');

    valueSet('cedulaInput', '');
    valueSet('pinInput', '');

    setText('accesoTitulo', 'Ingresa tu cédula');
    setText('accesoAyuda', 'Identifícate con tu cédula e ingresa el PIN asignado.');
    setText('estadoGeneral', 'Listo');

    mensaje('accesoMensaje', '', '');
    mensaje('revisionMensaje', '', '');
  }

  function bloquearAcceso(state) {
    ['cedulaInput', 'btnContinuar'].forEach(function (id) {
      if (el(id)) el(id).disabled = Boolean(state);
    });
  }

  function setLoading(button, state, text) {
    if (!button) return;

    if (state) {
      button.dataset.text = button.textContent;
      button.textContent = text || 'Procesando...';
      button.disabled = true;
    } else {
      button.textContent = button.dataset.text || button.textContent;
      button.disabled = false;
    }
  }

  function mensaje(id, text, tipo) {
    var node = el(id);
    if (!node) return;

    node.textContent = text || '';
    node.className = 'message' + (tipo ? ' message--' + tipo : '');
  }

  function mostrar(id) {
    var node = typeof id === 'string' ? el(id) : id;
    if (node) node.classList.remove('is-hidden');
  }

  function ocultar(id) {
    var node = typeof id === 'string' ? el(id) : id;
    if (node) node.classList.add('is-hidden');
  }

  function el(id) {
    return document.getElementById(id);
  }

  function on(id, event, handler) {
    var node = el(id);
    if (node) node.addEventListener(event, handler);
  }

  function value(id) {
    var node = el(id);
    return node ? String(node.value || '').trim() : '';
  }

  function valueSet(id, val) {
    var node = el(id);
    if (node) node.value = val || '';
  }

  function setText(id, text) {
    var node = el(id);
    if (node) node.textContent = text === undefined || text === null ? '' : String(text);
  }

  function soloNumeros(text) {
    return String(text || '').replace(/\D/g, '');
  }

  function limpiar(text) {
    return String(text === undefined || text === null ? '' : text).replace(/\s+/g, ' ').trim();
  }

  function normalizar(text) {
    return limpiar(text)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase();
  }

  function escapeHtml(text) {
    return String(text === undefined || text === null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
})();
