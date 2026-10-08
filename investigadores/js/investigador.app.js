/* Flujo de acceso y cola FIFO de segunda revisión para investigadores. */
(function () {
  'use strict';

  var config = window.TA_INVESTIGADORES_CONFIG;
  var firebaseService = window.TAInvestigadorFirebaseService;
  var repository = window.TAInvestigadorRepository;

  var investigador = null;
  var titulos = [];
  var revisiones = [];
  var revisionesFiltradas = [];
  var carreraActual = '';

  document.addEventListener('DOMContentLoaded', iniciar);

  function iniciar() {
    conectarEventos();
    setText('estadoGeneral', 'Conectando');
    var seguro = window.TAInvestigadorSeguro;
    if(seguro && seguro.activo && seguro.activo()){
      setText('estadoGeneral','Autenticando');
      seguro.iniciar().then(function(identificado){
        if(!identificado){
          setText('estadoGeneral','Sesión requerida');
          mensaje('accesoMensaje','Ingresa con tu cuenta institucional para continuar.','info');
          return null;
        }
        return repository.buscarInvestigador('').then(function(perfil){
          investigador=perfil;
          abrirPanel();
          return cargarTitulos(false);
        });
      }).catch(function(error){
        investigador=null;
        setText('estadoGeneral','Acceso denegado');
        mensaje('accesoMensaje',errorMensaje(error,'Tu cuenta no tiene autorización para esta revisión.'),'error');
      });
      return;
    }

    if (!firebaseService || typeof firebaseService.iniciar !== 'function') {
      setText('estadoGeneral', 'Backend no disponible');
      mensaje('accesoMensaje', '[BACKEND_INVESTIGADORES_NO_DISPONIBLE] No se cargó el backend propio de Investigadores.', 'error');
      bloquearAcceso(true);
      return;
    }

    firebaseService.iniciar(config.firebase)
      .then(function (resultado) {
        if (!resultado.ok) {
          var errorConexion = new Error(resultado.mensaje || 'No se pudo conectar con Firebase.');
          errorConexion.codigo = resultado.codigo || 'FIREBASE_INVESTIGADORES_ERROR';
          throw errorConexion;
        }
        setText('estadoGeneral', 'Listo');
        mensaje('accesoMensaje', '', '');
      })
      .catch(function (error) {
        setText('estadoGeneral', 'Sin conexión');
        mensaje('accesoMensaje', errorMensaje(error, 'No se pudo iniciar la aplicación.'), 'error');
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
    on('btnVistaPendientes', 'click', mostrarVistaPendientes);
    on('btnVistaRevisados', 'click', mostrarVistaRevisados);
    on('btnActualizarRevisados', 'click', cargarRevisiones);
    on('btnDescargarRevisadosPdf', 'click', descargarRevisionesPdf);
    on('filtroRevisionPeriodo', 'change', aplicarFiltrosRevisiones);
    on('filtroRevisionCarrera', 'change', aplicarFiltrosRevisiones);
    on('filtroRevisionResultado', 'change', aplicarFiltrosRevisiones);
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
        mensaje('accesoMensaje', errorMensaje(error, 'No se pudo validar el registro.'), 'error');
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
        mensaje('accesoMensaje', errorMensaje(error, 'No se pudo crear el PIN.'), 'error');
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
        mensaje('accesoMensaje', errorMensaje(error, 'No se pudo revisar el acceso.'), 'error');
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

    repository.validarAcceso(investigador, pin)
      .then(function (actualizado) {
        investigador = actualizado;

        valueSet('pinInput', '');
        abrirPanel();
        return cargarTitulos(false);
      })
      .catch(function (error) {
        mensaje('accesoMensaje', errorMensaje(error, 'No se pudo iniciar sesión.'), 'error');
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
    ocultar('panelRevisados');
    mostrar('resumenPendientes');
    activarBotonVista('btnVistaPendientes');

    setText('investigadorNombre', investigador.nombre || 'Investigador');
    setText(
      'investigadorDetalle',
      (investigador.cedula || '') + (investigador.email ? ' · ' + investigador.email : '')
    );
    setText('estadoGeneral', 'Acceso activo');
  }

  function mostrarVistaPendientes() {
    mostrar('resumenPendientes');
    mostrar('revisionMensaje');
    ocultar('panelRevisados');
    activarBotonVista('btnVistaPendientes');

    if (carreraActual) {
      ocultar('panelCarreras');
      mostrar('panelCola');
    } else {
      mostrar('panelCarreras');
      ocultar('panelCola');
    }
  }

  function mostrarVistaRevisados() {
    ocultar('resumenPendientes');
    ocultar('revisionMensaje');
    ocultar('panelCarreras');
    ocultar('panelCola');
    mostrar('panelRevisados');
    activarBotonVista('btnVistaRevisados');

    if (!revisiones.length) {
      cargarRevisiones();
    } else {
      aplicarFiltrosRevisiones();
    }
  }

  function activarBotonVista(idActivo) {
    ['btnVistaPendientes', 'btnVistaRevisados'].forEach(function (id) {
      var button = el(id);
      if (button) button.classList.toggle('is-active', id === idActivo);
    });
  }

  function cargarRevisiones() {
    if (!investigador) return Promise.resolve();

    var button = el('btnActualizarRevisados');
    setLoading(button, true, 'Actualizando...');
    mensaje('reporteRevisionMensaje', 'Cargando tus revisiones...', 'info');

    return repository.listarRevisadosPorInvestigador(investigador)
      .then(function (items) {
        revisiones = items || [];
        cargarOpcionesRevisiones();
        aplicarFiltrosRevisiones();
        setText('totalRevisados', revisiones.length);
        mensaje(
          'reporteRevisionMensaje',
          revisiones.length ? '' : 'Todavía no tienes revisiones registradas.',
          revisiones.length ? '' : 'info'
        );
      })
      .catch(function (error) {
        revisiones = [];
        revisionesFiltradas = [];
        renderRevisiones();
        mensaje('reporteRevisionMensaje', errorMensaje(error, 'No se pudieron cargar tus revisiones.'), 'error');
      })
      .finally(function () {
        setLoading(button, false);
      });
  }

  function cargarOpcionesRevisiones() {
    var service = window.TARevisionReportService;
    if (!service) return;

    var opciones = service.opciones(revisiones);
    llenarSelect('filtroRevisionPeriodo', opciones.periodos, 'Todos');
    llenarSelect('filtroRevisionCarrera', opciones.carreras, 'Todas');
  }

  function aplicarFiltrosRevisiones() {
    var service = window.TARevisionReportService;
    if (!service) return;

    revisionesFiltradas = service.filtrar(revisiones, {
      periodo: value('filtroRevisionPeriodo'),
      carrera: value('filtroRevisionCarrera'),
      resultado: value('filtroRevisionResultado')
    });

    renderRevisiones();
  }

  function renderRevisiones() {
    var service = window.TARevisionReportService;
    var body = el('revisadosBody');
    if (!body || !service) return;

    var resumen = service.resumen(revisionesFiltradas);
    setText('reporteTotalRevisados', resumen.total);
    setText('reporteTotalAprobados', resumen.aprobados);
    setText('reporteTotalDevueltos', resumen.devueltos);

    body.innerHTML = '';

    if (!revisionesFiltradas.length) {
      body.innerHTML = '<tr><td colspan="6" class="queue-empty">No hay revisiones que coincidan con los filtros.</td></tr>';
      return;
    }

    revisionesFiltradas.forEach(function (item) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + escapeHtml(formatearFechaCorta(item.fechaRevision)) + '</td>' +
        '<td><strong>' + escapeHtml(item.nombres || '—') + '</strong></td>' +
        '<td>' + escapeHtml(item.cedula || '—') + '</td>' +
        '<td>' + escapeHtml(item.carrera || '—') + '</td>' +
        '<td><span class="report-state report-state--' + claseResultado(item.estadoRevision) + '">' + escapeHtml(item.resultadoLabel || item.estadoRevision || '—') + '</span></td>' +
        '<td class="review-title-cell">' + escapeHtml(item.tituloFinal || '—') + '</td>';
      body.appendChild(tr);
    });
  }

  function descargarRevisionesPdf() {
    var pdf = window.TARevisionPdfService;
    var service = window.TARevisionReportService;

    if (!pdf || !service) {
      mensaje('reporteRevisionMensaje', 'No se cargó el generador PDF. Actualiza la página.', 'error');
      return;
    }

    if (!revisionesFiltradas.length) {
      mensaje('reporteRevisionMensaje', 'No hay revisiones para descargar con estos filtros.', 'warning');
      return;
    }

    try {
      var periodo = value('filtroRevisionPeriodo');
      var carrera = value('filtroRevisionCarrera');
      var resultado = value('filtroRevisionResultado');
      var periodoLabel = textoOpcion('filtroRevisionPeriodo');
      var resultadoLabel = textoOpcion('filtroRevisionResultado');

      var filename = pdf.descargar({
        titulo: 'REPORTE DE REVISIONES DE INVESTIGACIÓN',
        subtitulo: 'Investigador: ' + (investigador.nombre || investigador.cedula || ''),
        revisiones: revisionesFiltradas,
        resumen: service.resumen(revisionesFiltradas),
        ocultarInvestigador: true,
        filtros: {
          periodo: periodo,
          periodoLabel: periodo ? periodoLabel : 'Todos',
          carrera: carrera,
          resultado: resultado,
          resultadoLabel: resultado ? resultadoLabel : 'Todos',
          investigador: investigador.id || investigador.cedula,
          investigadorLabel: investigador.nombre || investigador.cedula
        }
      });

      mensaje('reporteRevisionMensaje', 'PDF generado: ' + filename, 'success');
    } catch (error) {
      mensaje('reporteRevisionMensaje', errorMensaje(error, 'No se pudo generar el PDF.'), 'error');
    }
  }

  function llenarSelect(id, items, placeholder) {
    var select = el(id);
    if (!select) return;

    var actual = select.value;
    select.innerHTML = '<option value="">' + escapeHtml(placeholder || 'Todos') + '</option>';

    (items || []).forEach(function (item) {
      var option = document.createElement('option');
      option.value = item.value;
      option.textContent = item.label;
      select.appendChild(option);
    });

    if (actual && Array.prototype.some.call(select.options, function (option) { return option.value === actual; })) {
      select.value = actual;
    }
  }

  function textoOpcion(id) {
    var select = el(id);
    if (!select || !select.options || select.selectedIndex < 0) return '';
    return select.options[select.selectedIndex].textContent || '';
  }

  function claseResultado(estado) {
    estado = String(estado || '').toUpperCase();
    if (estado === 'DEVUELTO') return 'danger';
    if (estado === 'APROBADO_CON_OBSERVACION') return 'warning';
    return 'success';
  }

  function formatearFechaCorta(valor) {
    if (!valor) return '—';
    try {
      var fecha = new Date(valor);
      if (isNaN(fecha.getTime())) return '—';
      return new Intl.DateTimeFormat('es-EC', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }).format(fecha);
    } catch (error) {
      return '—';
    }
  }

  function cargarTitulos(mantenerCarrera) {
    if (!investigador) return Promise.resolve();

    var button = el('btnActualizarTitulos');
    setLoading(button, true, 'Actualizando...');
    mensaje('revisionMensaje', 'Actualizando cola de revisión...', 'info');

    return repository.listarTitulosHabilitados(investigador)
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
          pendientes ? '' : 'No hay expedientes pendientes de revisión.',
          pendientes ? '' : 'info'
        );
      })
      .catch(function (error) {
        titulos = [];
        renderResumen();
        renderCarreras();
        mensaje('revisionMensaje', errorMensaje(error, 'No se pudieron cargar los títulos.'), 'error');
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
      'Todos los períodos · revisión por orden de validación de Coordinación.'
    );

    body.innerHTML = '';

    if (!grupos.length) {
      body.innerHTML =
        '<tr><td colspan="3" class="queue-empty">' +
        '<strong>Todo al día</strong><span>No hay carreras con expedientes pendientes.</span>' +
        '</td></tr>';
      return;
    }

    grupos.forEach(function (grupo) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td><div class="career-name"><strong>' + escapeHtml(grupo.carrera) + '</strong></div></td>' +
        '<td class="text-center"><span class="queue-count">' + grupo.items.length + '</span></td>' +
        '<td class="text-right"></td>';

      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn--primary btn--compact';
      button.textContent = 'Revisar →';
      button.addEventListener('click', function () {
        entrarCarrera(grupo.carrera);
      });

      tr.children[2].appendChild(button);
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
      var fechaA = Number(a.items[0] && a.items[0].fechaColaMs || Number.MAX_SAFE_INTEGER);
      var fechaB = Number(b.items[0] && b.items[0].fechaColaMs || Number.MAX_SAFE_INTEGER);
      if (fechaA !== fechaB) return fechaA - fechaB;
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
    setText('colaOrdenInfo', 'Primero se revisa el validado más antiguo');

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
            '<span>' + escapeHtml(formatearPeriodo(titulo.periodoLabel || titulo.periodoId)) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="queue-arrival">' +
          '<span>Validado por Coordinación</span>' +
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
          mensaje('revisionMensaje', errorMensaje(error, 'No se pudo guardar la revisión.'), 'error');
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
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).format(fecha).replace(',', ' ·');
    } catch (error) {
      return 'Sin fecha';
    }
  }

  function formatearPeriodo(valor) {
    var texto = limpiar(valor);
    if (!texto) return 'Sin período';

    var match = texto.match(/(\d{4})[-_](\d{2}).*?(\d{4})[-_](\d{2})/);
    if (match) {
      return nombreMes(Number(match[2])) + ' ' + match[1] + ' – ' + nombreMes(Number(match[4])) + ' ' + match[3];
    }

    return texto
      .replace(/_/g, ' ')
      .replace(/\bA\b/i, 'a')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function nombreMes(numero) {
    var meses = [
      '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    return meses[numero] || String(numero || '');
  }

  function salir() {
    var seguro=window.TAInvestigadorSeguro;
    if(seguro&&seguro.activo&&seguro.activo())return seguro.cerrarSesion();
    investigador = null;
    titulos = [];
    revisiones = [];
    revisionesFiltradas = [];
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

  function errorMensaje(error, fallback) {
    if (!error) return fallback || 'Error desconocido';

    var partes = [];
    var codigo = error.codigo || error.code || error.name || '';

    if (codigo) partes.push('[' + codigo + ']');
    if (error.operacion) partes.push(String(error.operacion));
    if (error.coleccion) partes.push('colección ' + String(error.coleccion));
    partes.push(error.message || fallback || String(error));

    return partes.join(' · ');
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
