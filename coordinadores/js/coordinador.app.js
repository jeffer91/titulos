/* Interfaz integrada de Coordinadores: tabla, filtros, modal e historial. */
(function () {
  'use strict';

  var config = window.TA_COORDINADORES_CONFIG;
  var firebaseService = window.TACoordFirebaseService;
  var repository = window.TACoordRepository;
  var estado = {
    firebase: false,
    coordinadores: [],
    coordinador: null,
    titulos: [],
    tab: 'POR_REVISAR',
    tipo: 'TODOS',
    busqueda: '',
    tituloModal: null,
    tituloSeleccionado: 0
  };

  var textosVista = {
    POR_REVISAR: ['POR REVISAR', 'Títulos pendientes de revisión por Coordinación'],
    DEVUELTOS: ['DEVUELTOS', 'Títulos devueltos al estudiante'],
    VALIDADOS: ['VALIDADOS', 'Títulos validados por Coordinación y enviados a Investigación'],
    APROBADOS: ['APROBADOS', 'Títulos aprobados después de la revisión de Investigación']
  };

  document.addEventListener('DOMContentLoaded', iniciar);

  function iniciar() {
    setText('versionTexto', 'v' + config.version);
    conectarEventos();
    setEstado('Conectando…');
    firebaseService.iniciar(config.firebase).then(function (resultado) {
      estado.firebase = Boolean(resultado.ok);
      if (!resultado.ok) throw new Error(resultado.mensaje || 'No se pudo conectar con Firebase.');
      setEstado('Conectado');
      return cargarCoordinadores();
    }).catch(function (error) {
      estado.firebase = false;
      setEstado('Sin conexión');
      mensaje('No se pudo cargar Coordinadores. ' + errorMensaje(error), 'error');
      renderDiagnostico(errorMensaje(error));
    });
  }

  function conectarEventos() {
    on('coordinadorSelect', 'change', seleccionarCoordinador);
    on('tipoTrabajoSelect', 'change', function () {
      estado.tipo = valor('tipoTrabajoSelect') || 'TODOS';
      renderTabla();
    });
    on('buscarInput', 'input', function () {
      estado.busqueda = normalizarBusqueda(valor('buscarInput'));
      renderTabla();
    });
    on('btnActualizar', 'click', actualizar);
    document.querySelectorAll('[data-tab]').forEach(function (button) {
      button.addEventListener('click', function () {
        estado.tab = button.dataset.tab;
        document.querySelectorAll('[data-tab]').forEach(function (item) {
          item.classList.toggle('is-active', item === button);
        });
        renderEncabezadoVista();
        renderTabla();
      });
    });
    on('btnCerrarDetalle', 'click', cerrarDetalle);
    on('btnDiagnostico', 'click', abrirDiagnostico);
    on('btnCerrarDiagnostico', 'click', cerrarDiagnostico);
    on('detalleModal', 'click', function (event) { if (event.target.id === 'detalleModal') cerrarDetalle(); });
    on('diagnosticoModal', 'click', function (event) { if (event.target.id === 'diagnosticoModal') cerrarDiagnostico(); });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        cerrarDetalle();
        cerrarDiagnostico();
      }
    });
  }

  function cargarCoordinadores() {
    mensaje('Cargando coordinadores…', 'info');
    return repository.listarCoordinadores().then(function (items) {
      estado.coordinadores = items;
      llenarCoordinadores(items);
      mensaje(items.length ? 'Selecciona un coordinador para ver sus títulos.' : 'No hay coordinadores activos registrados.', items.length ? 'info' : 'warning');
      renderDiagnostico('');
      return items;
    });
  }

  function llenarCoordinadores(items) {
    var select = el('coordinadorSelect');
    if (!select) return;
    var anterior = select.value;
    select.innerHTML = '<option value="">Selecciona un coordinador</option>';
    items.forEach(function (item) {
      var option = document.createElement('option');
      option.value = item.id;
      option.textContent = item.nombre;
      select.appendChild(option);
    });
    if (anterior && items.some(function (item) { return item.id === anterior; })) select.value = anterior;
  }

  function seleccionarCoordinador() {
    var id = valor('coordinadorSelect');
    estado.coordinador = estado.coordinadores.filter(function (item) { return item.id === id; })[0] || null;
    estado.titulos = [];
    renderResumenCoordinador();
    renderTabla();
    if (!estado.coordinador) {
      mensaje('Selecciona un coordinador para consultar sus títulos.', 'info');
      return;
    }
    cargarTitulos();
  }

  function actualizar() {
    setLoading('btnActualizar', true, 'Actualizando…');
    var idActual = estado.coordinador && estado.coordinador.id;
    cargarCoordinadores().then(function () {
      if (!idActual) return;
      var select = el('coordinadorSelect');
      select.value = idActual;
      estado.coordinador = estado.coordinadores.filter(function (item) { return item.id === idActual; })[0] || null;
      renderResumenCoordinador();
      if (estado.coordinador) return cargarTitulos();
    }).finally(function () {
      setLoading('btnActualizar', false);
    });
  }

  function cargarTitulos() {
    if (!estado.coordinador) return Promise.resolve([]);
    mensaje('Cargando títulos de ' + estado.coordinador.nombre + '…', 'info');
    return repository.listarTitulosParaCoordinador(estado.coordinador).then(function (items) {
      estado.titulos = items;
      renderTabla();
      mensajeResumen(items);
      renderDiagnostico('');
      return items;
    }).catch(function (error) {
      estado.titulos = [];
      renderTabla();
      mensaje('No se pudieron consultar los títulos. ' + errorMensaje(error), 'error');
      renderDiagnostico(errorMensaje(error));
      throw error;
    });
  }

  function renderResumenCoordinador() {
    var box = el('coordinadorResumen');
    if (!box) return;
    if (!estado.coordinador) {
      box.classList.add('is-hidden');
      return;
    }
    setText('coordinadorNombre', estado.coordinador.nombre);
    setText('coordinadorCarreras', estado.coordinador.carreras.length ? estado.coordinador.carreras.join(', ') : 'Sin carreras asignadas');
    box.classList.remove('is-hidden');
  }

  function mensajeResumen(items) {
    var recibidos = items.length;
    var tipo = items.filter(filtrarTipo).length;
    var vista = items.filter(function (item) { return filtrarTipo(item) && repository.clasificarTitulo(item) === estado.tab; }).length;
    mensaje('Recibidos: ' + recibidos + ' · De sus carreras: ' + recibidos + ' · Del tipo seleccionado: ' + tipo + ' · Del estado: ' + vista + '.', 'success');
  }

  function renderEncabezadoVista() {
    var textos = textosVista[estado.tab] || textosVista.POR_REVISAR;
    setText('vistaKicker', textos[0]);
    setText('vistaTitulo', textos[1]);
  }

  function renderTabla() {
    var body = el('titulosTableBody');
    if (!body) return;
    body.innerHTML = '';
    var items = estado.titulos.filter(function (item) {
      return repository.clasificarTitulo(item) === estado.tab && filtrarTipo(item) && filtrarBusqueda(item);
    });
    setText('totalVista', String(items.length));
    renderEncabezadoVista();
    if (!estado.coordinador) {
      vacio(body, 'Selecciona un coordinador para consultar sus títulos.');
      return;
    }
    if (!items.length) {
      vacio(body, 'No hay títulos para mostrar.');
      return;
    }
    items.forEach(function (titulo) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td class="cell-id">' + escapeHtml(titulo.cedula || '—') + '</td>' +
        '<td><strong>' + escapeHtml(titulo.nombres) + '</strong></td>' +
        '<td>' + escapeHtml(titulo.carrera || '—') + '</td>' +
        '<td></td><td>' + escapeHtml(periodoVisible(titulo)) + '</td><td></td><td></td>';
      tr.children[3].appendChild(badge(titulo.tipoTrabajo.label, titulo.tipoTrabajo.id === 'ARTICULO' ? 'blue' : 'gold'));
      tr.children[5].appendChild(badge(estadoVisible(titulo), claseEstado(repository.clasificarTitulo(titulo))));
      var ver = document.createElement('button');
      ver.type = 'button';
      ver.className = 'btn btn--view';
      ver.textContent = 'Ver';
      ver.addEventListener('click', function () { abrirDetalle(titulo); });
      tr.children[6].appendChild(ver);
      body.appendChild(tr);
    });
  }

  function filtrarTipo(titulo) {
    return estado.tipo === 'TODOS' || titulo.tipoTrabajo.id === estado.tipo;
  }

  function filtrarBusqueda(titulo) {
    if (!estado.busqueda) return true;
    var texto = normalizarBusqueda([titulo.cedula, titulo.nombres, titulo.carrera, titulo.tituloPreferidoTexto]
      .concat((titulo.titulosEnviados || []).map(function (item) { return item.tituloFinal || ''; })).join(' '));
    return texto.indexOf(estado.busqueda) !== -1;
  }

  function abrirDetalle(titulo) {
    estado.tituloModal = titulo;
    estado.tituloSeleccionado = 0;
    setText('detalleTituloModal', titulo.nombres);
    setText('detalleSubtitulo', (titulo.cedula || '—') + ' · ' + (titulo.carrera || 'Carrera no registrada'));
    var body = el('detalleModalBody');
    body.innerHTML = '<div class="modal-loading">Cargando detalle e historial…</div>';
    mostrarModal('detalleModal');
    repository.cargarHistorialTitulo(titulo).then(function (historial) {
      if (!estado.tituloModal || estado.tituloModal.id !== titulo.id) return;
      renderDetalle(titulo, historial);
    }).catch(function () {
      if (!estado.tituloModal || estado.tituloModal.id !== titulo.id) return;
      renderDetalle(titulo, { proceso: titulo.historialProceso || [], archivos: [], logs: [] });
    });
  }

  function renderDetalle(titulo, historial) {
    var body = el('detalleModalBody');
    if (!body) return;

    var modalCard = body.closest('.modal-card--detail');
    var footerAnterior = modalCard && modalCard.querySelector('.modal-decision-footer');
    if (footerAnterior && footerAnterior.parentNode) footerAnterior.parentNode.removeChild(footerAnterior);

    var vista = repository.clasificarTitulo(titulo);
    var editable = vista === 'POR_REVISAR';

    body.innerHTML = '';
    body.appendChild(renderMetaDetalle(titulo));
    body.appendChild(renderPropuestas(titulo, editable));
    body.appendChild(renderHistorial(titulo, historial));

    var decision = renderDecision(titulo, editable);
    decision.classList.add('modal-decision-footer');

    if (modalCard) modalCard.appendChild(decision);
    else body.appendChild(decision);
  }

  function renderMetaDetalle(titulo) {
    var wrap = document.createElement('div');
    wrap.className = 'detail-meta';
    wrap.appendChild(metaItem('Tipo', titulo.tipoTrabajo.label));
    wrap.appendChild(metaItem('Período', periodoVisible(titulo)));
    wrap.appendChild(metaItem('Fecha de envío', fechaVisible(titulo.fechaEnvio)));
    wrap.appendChild(metaItem('Estado', estadoVisible(titulo)));
    return wrap;
  }

  function renderPropuestas(titulo, editable) {
    var section = document.createElement('section');
    section.className = 'detail-section proposals-section';
    var propuestas = titulo.titulosEnviados || [];

    if (!propuestas.length) {
      section.innerHTML = '<h3>Títulos enviados</h3><p class="muted">Este registro no contiene propuestas de título.</p>';
      return section;
    }

    var grid = document.createElement('div');
    grid.className = 'proposal-grid';

    propuestas.forEach(function (propuesta, index) {
      var numero = Number(propuesta.numero || index + 1);
      var card = document.createElement('article');
      var esPreferido = Number(titulo.tituloPreferidoNumero) === numero || propuesta.preferido;
      var revision = titulo.revisionCoordinador || {};
      var esSeleccionado = Number(revision.tituloSeleccionadoNumero || 0) === numero;
      var fueCorregido = Boolean(propuesta.corregidoCoordinacion || (esSeleccionado && revision.corrigioTitulo));

      card.className = 'proposal-card' +
        (esPreferido ? ' is-favorite' : '') +
        (esSeleccionado && !editable ? ' is-selected' : '') +
        (fueCorregido ? ' is-corrected' : '');
      card.dataset.numero = String(numero);

      var head = document.createElement('div');
      head.className = 'proposal-head';

      var title = document.createElement('h3');
      title.textContent = 'Título ' + numero;
      head.appendChild(title);

      var tags = document.createElement('div');
      tags.className = 'proposal-tags';

      if (esPreferido) {
        var fav = document.createElement('span');
        fav.className = 'favorite';
        fav.textContent = '★ Preferido';
        tags.appendChild(fav);
      }

      if (!editable && esSeleccionado) {
        var chosen = document.createElement('span');
        chosen.className = 'selected-label';
        chosen.textContent = fueCorregido ? '✓ Seleccionado · corregido' : '✓ Seleccionado';
        tags.appendChild(chosen);
      }

      if (tags.children.length) head.appendChild(tags);
      card.appendChild(head);

      var p = document.createElement('p');
      p.className = 'proposal-text';
      p.textContent = propuesta.tituloFinal || propuesta.titulo || 'Sin título registrado';
      card.appendChild(p);

      if (fueCorregido && propuesta.tituloOriginalCoordinacion) {
        var original = document.createElement('p');
        original.className = 'proposal-original';
        original.innerHTML = '<strong>Original:</strong> ' + escapeHtml(propuesta.tituloOriginalCoordinacion);
        card.appendChild(original);
      }

      if (editable) {
        var select = document.createElement('label');
        select.className = 'select-title';

        var radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'tituloCoordinacion';
        radio.value = numero;

        var labelText = document.createElement('span');
        labelText.textContent = 'Seleccionar';

        select.appendChild(radio);
        select.appendChild(labelText);
        card.appendChild(select);

        var seleccionar = function (event) {
          if (event && event.target && event.target.tagName === 'INPUT') {
            // El change del radio continúa abajo.
          } else {
            radio.checked = true;
          }

          estado.tituloSeleccionado = numero;
          document.querySelectorAll('.proposal-card').forEach(function (node) {
            node.classList.remove('is-selected');
          });
          card.classList.add('is-selected');

          var correctionPanel = document.querySelector('#correctionPanel');
          if (correctionPanel && !correctionPanel.classList.contains('is-hidden')) {
            prepararCorreccionSeleccionada(titulo);
          }
        };

        radio.addEventListener('change', seleccionar);
        card.addEventListener('click', function (event) {
          if (event.target.closest('label, input, button, textarea')) return;
          seleccionar(event);
        });
      }

      grid.appendChild(card);
    });

    section.appendChild(grid);
    return section;
  }

  function renderHistorial(titulo, historial) {
    var section = document.createElement('section');
    section.className = 'detail-section history-section';

    var versiones = construirVersiones(titulo, historial);
    var revisiones = versiones.filter(function (version) {
      return Boolean(version.revisionCoordinador || version.revision);
    }).length;

    var details = document.createElement('details');
    details.className = 'history-details';

    var summary = document.createElement('summary');
    summary.innerHTML =
      '<span><strong>Historial</strong><small>' +
      (revisiones ? revisiones + ' revisión' + (revisiones === 1 ? '' : 'es') : 'Primer envío') +
      '</small></span><span class="history-details__action">Ver</span>';
    details.appendChild(summary);

    var content = document.createElement('div');
    content.className = 'history-details__content';

    if (!versiones.length) {
      var empty = document.createElement('p');
      empty.className = 'muted history-empty';
      empty.textContent = 'Todavía no existen revisiones anteriores.';
      content.appendChild(empty);
      details.appendChild(content);
      section.appendChild(details);
      return section;
    }

    versiones.forEach(function (version, index) {
      var box = document.createElement('article');
      box.className = 'history-version';
      var numero = Number(version.version || index + 1);
      var revision = version.revisionCoordinador || version.revision || null;

      box.innerHTML =
        '<div class="history-title"><strong>VERSIÓN ' + numero + '</strong></div>';

      if (revision) {
        var review = document.createElement('div');
        review.className = 'history-review';
        review.innerHTML =
          '<strong>' + escapeHtml(labelEstadoRevision(revision.estado)) + '</strong>' +
          '<time>' + escapeHtml(fechaVisible(revision.fechaLocal || revision.fecha || revision.creadoEn)) + '</time>' +
          '<span>' + escapeHtml(revision.coordinadorNombre || revision.investigadorNombre || 'Responsable no registrado') + '</span>' +
          (revision.tituloSeleccionadoTexto
            ? '<p><b>Título seleccionado:</b> ' + escapeHtml(revision.tituloSeleccionadoTexto) + '</p>'
            : '') +
          (revision.observacion ? '<p>' + escapeHtml(revision.observacion) + '</p>' : '');
        box.appendChild(review);
      }

      var sent = document.createElement('div');
      sent.className = 'history-sent';
      var fechaEnvio = version.fechaEnvio || version.creadoEn || titulo.fechaEnvio;
      sent.innerHTML =
        '<div class="history-sent-head"><strong>Envío ' + numero + '</strong><time>' +
        escapeHtml(fechaVisible(fechaEnvio)) + '</time></div>';

      var ul = document.createElement('ul');
      (version.titulosEnviados || []).forEach(function (p) {
        var li = document.createElement('li');
        li.textContent =
          (p.tituloFinal || p.titulo || 'Sin título') +
          (Number(p.numero) === Number(version.tituloPreferidoNumero) || p.preferido ? ' · Preferido' : '');
        ul.appendChild(li);
      });

      if (ul.children.length) sent.appendChild(ul);
      box.appendChild(sent);
      content.appendChild(box);
    });

    details.appendChild(content);
    section.appendChild(details);
    return section;
  }

  function construirVersiones(titulo, historial) {
    var versiones = Array.isArray(historial.proceso) ? historial.proceso.slice() : [];
    if (!versiones.length && titulo.revisionCoordinador) {
      versiones.push({
        version: Math.max(Number(titulo.intentosUsados || 1), 1),
        fechaEnvio: titulo.fechaEnvio,
        tituloPreferidoNumero: titulo.tituloPreferidoNumero,
        titulosEnviados: titulo.titulosEnviados,
        revisionCoordinador: titulo.revisionCoordinador
      });
    }
    (historial.archivos || []).forEach(function (archivo) {
      if (archivo && Array.isArray(archivo.titulosEnviados)) {
        versiones.push({
          version: versiones.length + 1,
          fechaEnvio: archivo.enviadoEn || archivo.creadoEn || archivo.actualizadoEn,
          tituloPreferidoNumero: archivo.tituloPreferidoNumero,
          titulosEnviados: archivo.titulosEnviados,
          revisionCoordinador: archivo.revisionCoordinador || archivo.revision || null
        });
      }
    });
    return versiones.sort(function (a, b) {
      return fechaMs(a.fechaEnvio) - fechaMs(b.fechaEnvio);
    }).map(function (item, index) {
      item.version = index + 1;
      return item;
    });
  }

  function renderDecision(titulo, editable) {
    var section = document.createElement('section');
    section.className = 'detail-section decision-section';
    var revision = titulo.revisionCoordinador || {};

    if (!editable) {
      var estadoBox = document.createElement('div');
      estadoBox.className = 'readonly-box';
      var validado = revision.tituloSeleccionadoTexto || titulo.tituloCoordinador || '';
      var resultado = revision.resultado || titulo.raw && titulo.raw.resultadoCoordinador || '';

      estadoBox.innerHTML =
        (validado
          ? '<div><span>Decisión de Coordinación</span><strong>' +
            escapeHtml(resultado === 'APROBADO_CON_CORRECCION' ? 'Aprobado con corrección' : 'Aprobado') +
            '</strong></div>' +
            '<div><span>Título seleccionado</span><strong>' + escapeHtml(validado) + '</strong></div>'
          : '') +
        (revision.observacion
          ? '<div><span>Observación</span><strong>' + escapeHtml(revision.observacion) + '</strong></div>'
          : '') +
        '<p>Registro revisado. Esta vista es solo de lectura.</p>';

      section.appendChild(estadoBox);
      return section;
    }

    var note = document.createElement('p');
    note.className = 'decision-note';
    note.textContent = 'Selecciona uno de los tres títulos y toma una decisión. Los tres continuarán en el expediente.';

    var correctionPanel = document.createElement('div');
    correctionPanel.id = 'correctionPanel';
    correctionPanel.className = 'correction-panel is-hidden';
    correctionPanel.innerHTML = [
      '<div class="correction-panel__head">',
      '  <div><span>APROBAR CON CORRECCIÓN</span><strong>Corrige únicamente el título seleccionado</strong></div>',
      '  <button type="button" class="correction-panel__close" id="btnCerrarCorreccion" aria-label="Cerrar corrección">×</button>',
      '</div>',
      '<div class="correction-original"><span>Original</span><p id="tituloCorreccionOriginal">Selecciona un título.</p></div>',
      '<label for="tituloCorreccionTexto">Título corregido por Coordinación</label>',
      '<textarea id="tituloCorreccionTexto" rows="2" placeholder="Edita aquí el título seleccionado."></textarea>'
    ].join('');

    var commentWrap = document.createElement('div');
    commentWrap.className = 'decision-comment';

    var label = document.createElement('label');
    label.className = 'decision-label';
    label.setAttribute('for', 'comentarioCoordinador');
    label.textContent = 'Observación';

    var textarea = document.createElement('textarea');
    textarea.id = 'comentarioCoordinador';
    textarea.rows = 2;
    textarea.placeholder = 'Opcional al aprobar. Obligatoria al corregir o devolver.';

    commentWrap.appendChild(label);
    commentWrap.appendChild(textarea);

    var actions = document.createElement('div');
    actions.className = 'decision-actions decision-actions--sticky';

    var aprobar = document.createElement('button');
    aprobar.type = 'button';
    aprobar.className = 'btn btn--success';
    aprobar.textContent = 'Aprobar';
    aprobar.addEventListener('click', function () {
      guardarDecision('VALIDAR', textarea, aprobar, '');
    });

    var corregir = document.createElement('button');
    corregir.type = 'button';
    corregir.className = 'btn btn--warning';
    corregir.textContent = 'Aprobar con corrección';
    corregir.addEventListener('click', function () {
      if (!estado.tituloSeleccionado) {
        mostrarErrorModal('Selecciona el título que vas a corregir.');
        return;
      }

      if (correctionPanel.classList.contains('is-hidden')) {
        correctionPanel.classList.remove('is-hidden');
        prepararCorreccionSeleccionada(titulo);
        corregir.textContent = 'Confirmar corrección';
        var correctionText = el('tituloCorreccionTexto');
        if (correctionText) correctionText.focus();
        return;
      }

      var correctionText = el('tituloCorreccionTexto');
      guardarDecision('VALIDAR_CORRECCION', textarea, corregir, correctionText ? correctionText.value : '');
    });

    var devolver = document.createElement('button');
    devolver.type = 'button';
    devolver.className = 'btn btn--danger';
    devolver.textContent = 'Devolver';
    devolver.addEventListener('click', function () {
      guardarDecision('DEVOLVER', textarea, devolver, '');
    });

    actions.appendChild(aprobar);
    actions.appendChild(corregir);
    actions.appendChild(devolver);

    section.appendChild(note);
    section.appendChild(correctionPanel);
    section.appendChild(commentWrap);
    section.appendChild(actions);

    window.setTimeout(function () {
      var close = el('btnCerrarCorreccion');
      if (close) {
        close.addEventListener('click', function () {
          correctionPanel.classList.add('is-hidden');
          corregir.textContent = 'Aprobar con corrección';
        });
      }
    }, 0);

    return section;
  }

  function prepararCorreccionSeleccionada(titulo) {
    var numero = Number(estado.tituloSeleccionado || 0);
    var propuesta = (titulo.titulosEnviados || []).filter(function (item) {
      return Number(item.numero) === numero;
    })[0] || null;

    var texto = propuesta ? String(propuesta.tituloFinal || propuesta.titulo || '').trim() : '';
    var original = el('tituloCorreccionOriginal');
    var editor = el('tituloCorreccionTexto');

    if (original) original.textContent = texto || 'Título no disponible';
    if (editor) editor.value = texto;
  }

  function guardarDecision(accion, textarea, button, tituloCorregido) {
    var titulo = estado.tituloModal;
    if (!titulo || !estado.coordinador) return;

    var comentario = String(textarea && textarea.value || '').trim();
    var necesitaSeleccion = accion === 'VALIDAR' || accion === 'VALIDAR_CORRECCION';

    if (necesitaSeleccion && !estado.tituloSeleccionado) {
      mostrarErrorModal('Selecciona uno de los tres títulos antes de continuar.');
      return;
    }

    if (accion === 'DEVOLVER' && !comentario) {
      mostrarErrorModal('Escribe qué debe corregir el estudiante antes de devolver.');
      if (textarea) textarea.focus();
      return;
    }

    if (accion === 'VALIDAR_CORRECCION') {
      var corregido = String(tituloCorregido || '').trim();

      if (!corregido) {
        mostrarErrorModal('Escribe el título corregido.');
        var editor = el('tituloCorreccionTexto');
        if (editor) editor.focus();
        return;
      }

      if (!comentario) {
        mostrarErrorModal('Escribe una observación breve que explique la corrección.');
        if (textarea) textarea.focus();
        return;
      }
    }

    limpiarErrorModal();
    setLoadingElement(button, true, 'Guardando…');

    repository.revisarTitulo(
      titulo,
      accion,
      comentario,
      estado.coordinador,
      estado.tituloSeleccionado,
      tituloCorregido
    )
      .then(function () {
        cerrarDetalle();

        var mensajeExito = accion === 'DEVOLVER'
          ? 'Título devuelto al estudiante.'
          : accion === 'VALIDAR_CORRECCION'
            ? 'Título corregido y enviado a Investigación junto con las tres propuestas.'
            : 'Título aprobado y enviado a Investigación junto con las tres propuestas.';

        mensaje(mensajeExito, 'success');
        return cargarTitulos();
      })
      .catch(function (error) {
        mostrarErrorModal(errorMensaje(error));
      })
      .finally(function () {
        setLoadingElement(button, false);
      });
  }

  function limpiarErrorModal() {
    var existente = el('modalDecisionError');
    if (existente && existente.parentNode) existente.parentNode.removeChild(existente);
  }


  function mostrarErrorModal(texto) {
    var existente = el('modalDecisionError');
    if (!existente) {
      existente = document.createElement('div');
      existente.id = 'modalDecisionError';
      existente.className = 'modal-error';
      var section = document.querySelector('.decision-section');
      if (section) section.insertBefore(existente, section.firstChild);
    }
    existente.textContent = texto;
  }

  function abrirDiagnostico() {
    renderDiagnostico('');
    mostrarModal('diagnosticoModal');
  }

  function renderDiagnostico(error) {
    var wrap = el('diagnosticoContenido');
    if (!wrap) return;
    var coord = estado.coordinador;
    wrap.innerHTML =
      diagnosticoItem('Firebase', estado.firebase ? 'Conectado' : 'Sin conexión', estado.firebase) +
      diagnosticoItem('Coordinadores', String(estado.coordinadores.length) + ' cargados', estado.coordinadores.length > 0) +
      diagnosticoItem('Coordinador activo', coord ? coord.nombre : 'Sin seleccionar', Boolean(coord)) +
      diagnosticoItem('Títulos recibidos', String(estado.titulos.length), true) +
      (error ? '<p class="diagnostic-error">' + escapeHtml(error) + '</p>' : '');
  }

  function diagnosticoItem(label, value, ok) {
    return '<div class="diagnostic-item"><span class="diagnostic-dot ' + (ok ? 'is-ok' : '') + '"></span><strong>' + escapeHtml(label) + '</strong><span>' + escapeHtml(value) + '</span></div>';
  }

  function cerrarDetalle() {
    ocultarModal('detalleModal');
    estado.tituloModal = null;
    estado.tituloSeleccionado = 0;
  }
  function cerrarDiagnostico() { ocultarModal('diagnosticoModal'); }
  function mostrarModal(id) {
    var node = el(id); if (!node) return;
    node.classList.remove('is-hidden'); node.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
  }
  function ocultarModal(id) {
    var node = el(id); if (!node || node.classList.contains('is-hidden')) return;
    node.classList.add('is-hidden'); node.setAttribute('aria-hidden', 'true');
    if (document.querySelectorAll('.modal-backdrop:not(.is-hidden)').length === 0) document.body.classList.remove('modal-open');
  }

  function metaItem(label, value) {
    var item = document.createElement('div');
    item.className = 'meta-item';
    var span = document.createElement('span'); span.textContent = label;
    var strong = document.createElement('strong'); strong.textContent = value || '—';
    item.appendChild(span); item.appendChild(strong);
    return item;
  }

  function badge(texto, tipo) {
    var span = document.createElement('span');
    span.className = 'badge badge--' + (tipo || 'muted');
    span.textContent = texto || '—';
    return span;
  }

  function claseEstado(vista) {
    if (vista === 'DEVUELTOS') return 'red';
    if (vista === 'VALIDADOS') return 'blue';
    if (vista === 'APROBADOS') return 'green';
    return 'gold';
  }

  function estadoVisible(titulo) {
    var vista = repository.clasificarTitulo(titulo);
    if (vista === 'DEVUELTOS') return 'Devuelto';
    if (vista === 'VALIDADOS') return 'Validado';
    if (vista === 'APROBADOS') return 'Aprobado';
    return 'Por revisar';
  }

  function labelEstadoRevision(value) {
    var estadoRevision = String(value || '').toUpperCase();
    if (estadoRevision === 'DEVUELTO') return 'Devuelto';
    if (estadoRevision === 'VALIDADO') return 'Validado';
    if (estadoRevision.indexOf('APROBADO') !== -1) return 'Aprobado';
    return estadoRevision || 'Revisado';
  }

  function periodoVisible(titulo) { return titulo.periodoLabel || titulo.periodoId || '—'; }

  function fechaVisible(value, incluirIso) {
    if (!value) return '—';
    var date = fechaDate(value);
    if (!date) return String(value || '—');
    if (incluirIso) return date.toISOString();
    try {
      return new Intl.DateTimeFormat('es-EC', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
    } catch (error) {
      return date.toLocaleString();
    }
  }

  function fechaDate(value) {
    if (!value) return null;
    if (value && typeof value.toDate === 'function') return value.toDate();
    if (value && typeof value.seconds === 'number') return new Date(value.seconds * 1000);
    var date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }
  function fechaMs(value) { var d = fechaDate(value); return d ? d.getTime() : 0; }

  function vacio(body, texto) {
    var tr = document.createElement('tr');
    var td = document.createElement('td');
    td.colSpan = 7; td.className = 'empty-cell'; td.textContent = texto;
    tr.appendChild(td); body.appendChild(tr);
  }
  function mensaje(texto, tipo) {
    var node = el('cargaMensaje'); if (!node) return;
    node.textContent = texto || '';
    node.className = 'load-note' + (tipo ? ' is-' + tipo : '');
  }
  function setEstado(texto) { setText('estadoGeneral', texto); }
  function setLoading(id, loading, texto) { setLoadingElement(el(id), loading, texto); }
  function setLoadingElement(button, loading, texto) {
    if (!button) return;
    if (loading) {
      button.dataset.originalText = button.dataset.originalText || button.textContent;
      button.textContent = texto || 'Cargando…'; button.disabled = true;
    } else {
      button.textContent = button.dataset.originalText || button.textContent; button.disabled = false;
    }
  }
  function normalizarBusqueda(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  }
  function escapeHtml(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
  function errorMensaje(error) { return error && error.message ? error.message : String(error || 'Error desconocido'); }
  function el(id) { return document.getElementById(id); }
  function on(id, event, fn) { var node = el(id); if (node) node.addEventListener(event, fn); }
  function valor(id) { var node = el(id); return node ? String(node.value || '').trim() : ''; }
  function setText(id, text) { var node = el(id); if (node) node.textContent = text === undefined || text === null ? '' : String(text); }
})();
