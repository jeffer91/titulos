/* Pantalla Estudiantes del administrador. */
(function () {
  'use strict';

  var repository = window.TAAdministradorRepository;
  var ui = window.TAAdminUI;
  var config = window.TA_ADMINISTRADORES_CONFIG;

  var estado = {
    periodos: [],
    estudiantes: [],
    filtrados: [],
    detalleActual: null
  };

  function iniciar() {
    conectarEventos();
    window.addEventListener('admin:autorizacion-cambio', function () {
      var modal = ui.qs('#modalDetalleEstudiante');
      if (modal && !modal.classList.contains('is-hidden') && estado.detalleActual) {
        verMas(estado.detalleActual);
      }
    });
  }

  function conectarEventos() {
    var btnActualizar = ui.qs('#btnActualizarEstudiantes');
    var formFiltros = ui.qs('#formFiltrosEstudiantes');
    var btnLimpiar = ui.qs('#btnLimpiarFiltrosEstudiantes');
    var btnAplicar = formFiltros ? formFiltros.querySelector('button[type="submit"]') : null;

    var camposFiltros = [
      '#estFiltroPeriodo',
      '#estFiltroBusqueda',
      '#estFiltroCarrera',
      '#estFiltroEstado',
      '#estFiltroTelegram'
    ];

    if (btnActualizar && !btnActualizar.dataset.estudiantesBound) {
      btnActualizar.dataset.estudiantesBound = 'true';
      btnActualizar.addEventListener('click', cargar);
    }

    if (formFiltros && !formFiltros.dataset.estudiantesBound) {
      formFiltros.dataset.estudiantesBound = 'true';
      formFiltros.addEventListener('submit', function (event) {
        event.preventDefault();
        aplicarFiltros();
      });
    }

    if (btnAplicar && !btnAplicar.dataset.estudiantesBound) {
      btnAplicar.dataset.estudiantesBound = 'true';
      btnAplicar.addEventListener('click', function (event) {
        event.preventDefault();
        aplicarFiltros();
      });
    }

    if (btnLimpiar && !btnLimpiar.dataset.estudiantesBound) {
      btnLimpiar.dataset.estudiantesBound = 'true';
      btnLimpiar.addEventListener('click', limpiarFiltros);
    }

    camposFiltros.forEach(function (selector) {
      var campo = ui.qs(selector);

      if (!campo || campo.dataset.estudiantesFilterBound) return;

      campo.dataset.estudiantesFilterBound = 'true';
      campo.addEventListener(campo.tagName === 'INPUT' ? 'input' : 'change', aplicarFiltros);
    });
  }

  function cargar() {
    ui.showStatus('#estudiantesMensaje', config.textos.cargando, 'info');

    return repository.listarPeriodos()
      .then(function (periodos) {
        estado.periodos = periodos || [];
        llenarFiltroPeriodos();
        return cargarEstudiantes();
      })
      .catch(function (error) {
        ui.showStatus('#estudiantesMensaje', obtenerMensaje(error, 'No se pudieron cargar los estudiantes.'), 'error');
      });
  }

  function cargarEstudiantes() {
    var periodo = ui.value('#estFiltroPeriodo');

    return repository.listarEstudiantesConTitulos(periodo)
      .then(function (estudiantes) {
        estado.estudiantes = estudiantes || [];
        llenarFiltroCarreras();
        aplicarFiltros();
        ui.showStatus('#estudiantesMensaje', 'Estudiantes actualizados correctamente.', 'success');
      });
  }

  function llenarFiltroPeriodos() {
    var activos = estado.periodos.filter(function (periodo) {
      return periodo.activo;
    });

    var lista = activos.length ? activos : estado.periodos;

    ui.llenarSelect('#estFiltroPeriodo', lista.map(function (periodo) {
      return {
        value: periodo.id,
        label: periodo.label + (periodo.activo ? ' · Activo' : '')
      };
    }), {
      placeholderText: 'Todos los períodos activos',
      placeholderValue: ''
    });
  }

  function llenarFiltroCarreras() {
    var mapa = {};

    estado.estudiantes.forEach(function (item) {
      var carrera = limpiarTexto(item.carrera || item.nombreCarrera);
      var key = normalizarTexto(carrera);

      if (!key) return;

      if (!mapa[key]) {
        mapa[key] = carrera;
      }
    });

    var carreras = Object.keys(mapa).sort(function (a, b) {
      return mapa[a].localeCompare(mapa[b]);
    }).map(function (key) {
      return {
        value: mapa[key],
        label: mapa[key]
      };
    });

    ui.llenarSelect('#estFiltroCarrera', carreras, {
      placeholderText: 'Todas las carreras',
      placeholderValue: ''
    });
  }

  function aplicarFiltros() {
    var periodo = limpiarTexto(ui.value('#estFiltroPeriodo'));
    var busqueda = normalizarTexto(ui.value('#estFiltroBusqueda'));
    var carrera = normalizarTexto(ui.value('#estFiltroCarrera'));
    var estadoFiltro = limpiarTexto(ui.value('#estFiltroEstado'));
    var telegramFiltro = limpiarTexto(ui.value('#estFiltroTelegram'));

    estado.filtrados = estado.estudiantes.filter(function (item) {
      var itemPeriodo = limpiarTexto(item.periodoId || item.periodo || '');
      var itemCarrera = normalizarTexto(item.carrera || item.nombreCarrera || item.NombreCarrera || '');

      var textoBusqueda = normalizarTexto([
        item.cedula,
        item.nombres,
        item.nombre,
        item.apellidos,
        item.carrera,
        item.nombreCarrera,
        item.NombreCarrera
      ].join(' '));

      if (periodo && itemPeriodo !== periodo) return false;

      if (busqueda && textoBusqueda.indexOf(busqueda) === -1) return false;

      if (carrera && itemCarrera !== carrera) return false;

      if (estadoFiltro && !coincideEstado(item, estadoFiltro)) return false;

      if (telegramFiltro === 'CON_TELEGRAM' && !tieneTelegram(item)) return false;

      if (telegramFiltro === 'SIN_TELEGRAM' && tieneTelegram(item)) return false;

      return true;
    });

    renderTabla();
  }

  function limpiarFiltros() {
    ui.setValue('#estFiltroPeriodo', '');
    ui.setValue('#estFiltroBusqueda', '');
    ui.setValue('#estFiltroCarrera', '');
    ui.setValue('#estFiltroEstado', '');
    ui.setValue('#estFiltroTelegram', '');
    aplicarFiltros();
  }

  function renderTabla() {
    var body = ui.qs('#estudiantesTableBody');

    if (!body) return;

    body.innerHTML = '';

    if (!estado.filtrados.length) {
      ui.limpiarTabla('#estudiantesTableBody', 6, 'No se encontraron estudiantes con los filtros seleccionados.');
      return;
    }

    estado.filtrados.forEach(function (item) {
      var tr = document.createElement('tr');

      tr.innerHTML =
        '<td>' + ui.escapeHtml(item.cedula) + '</td>' +
        '<td><strong>' + ui.escapeHtml(item.nombres) + '</strong></td>' +
        '<td>' + ui.escapeHtml(item.carrera || item.nombreCarrera) + '</td>' +
        '<td>' + ui.escapeHtml(item.periodoLabel || item.periodoId) + '</td>' +
        '<td></td>' +
        '<td class="text-right"></td>';

      var estadoCell = tr.children[4];
      var actionCell = tr.children[5];
      var button = document.createElement('button');

      estadoCell.appendChild(ui.badgeEstadoTitulo(item.estado));

      button.type = 'button';
      button.className = 'btn btn--small btn--primary';
      button.textContent = 'Ver más';
      button.addEventListener('click', function () {
        verMas(item);
      });

      actionCell.appendChild(button);
      body.appendChild(tr);
    });
  }

  function verMas(item) {
    estado.detalleActual = item;
    ui.setText('#modalDetalleTitulo', item.nombres || 'Detalle del estudiante');
    ui.setText('#modalDetalleSubtitulo', (item.cedula || '') + ' · ' + (item.carrera || item.nombreCarrera || ''));

    ui.abrirDetalleEstudiante(item);
    agregarAccionesDetalle(item);
  }

  function agregarAccionesDetalle(item) {
    var container = ui.qs('#detalleEstudianteContenido');
    if (!container) return;
    var expediente = item.titulo || {};
    var propuestas = Array.isArray(item.titulosEnviados) ? item.titulosEnviados : [];
    var acciones = document.createElement('section');
    acciones.className = 'detail-box admin-actions';
    var sesion = window.TAAdminAccionesSeguras;
    var habilitado = Boolean(sesion && typeof sesion.autorizadoLocal === 'function' && sesion.autorizadoLocal());
    var aprobado = expediente.procesoCerrado === true ||
      normalizarTexto(expediente.estadoProceso || expediente.estado) === 'APROBADO_FINAL';
    acciones.innerHTML =
      '<div class="admin-actions__head"><h3>Acciones administrativas</h3>' +
      '<small>Intervenciones verificadas y registradas en el historial</small></div>' +
      (!propuestas.length ? '<p>No hay títulos activos que puedan revisarse.</p>' :
      '<div class="admin-actions__form"' + (habilitado ? '' : ' hidden') + '>' +
      '<label for="adminAccionPropuesta">Propuesta sobre la que actuarás</label>' +
      '<select id="adminAccionPropuesta" class="admin-actions__select"></select>' +
      '<label for="adminAccionMotivo">Justificación administrativa</label>' +
      '<textarea id="adminAccionMotivo" rows="2" maxlength="1000" placeholder="Motivo de la intervención (mínimo 8 caracteres)"></textarea>' +
      (aprobado ? '<label class="admin-reopen"><input id="adminReabrirAprobado" type="checkbox" /> ' +
        'Confirmo que esta intervención reabrirá o reemplazará la aprobación vigente; conservar el historial anterior.</label>' : '') +
      '<div id="adminAccionEditor" class="admin-actions__editor" hidden>' +
        '<label for="adminAccionTituloCorregido">Título corregido</label>' +
        '<textarea id="adminAccionTituloCorregido" rows="3" maxlength="260"></textarea>' +
      '</div>' +
      '<div class="admin-actions__buttons">' +
        '<button type="button" class="btn btn--primary" data-admin-decision="APROBAR">Aprobar título</button>' +
        '<button type="button" class="btn btn--secondary" data-admin-decision="CORREGIR_APROBAR">Corregir y aprobar</button>' +
        '<button type="button" class="btn btn--secondary" data-admin-decision="ENVIAR_COORDINACION">Enviar a Coordinación</button>' +
        '<button type="button" class="btn btn--secondary" data-admin-decision="ENVIAR_INVESTIGACION">Enviar a Investigación</button>' +
      '</div>' +
      '<p id="adminAccionResultado" role="status" class="admin-actions__status"></p>' +
      '</div>') +
      '<div class="admin-actions__archive">' +
        '<small>Reinicio del envío</small>' +
        '<button type="button" class="btn btn--danger" id="adminArchivarDesdeDetalle">Archivar intento y permitir nuevo envío</button>' +
      '</div>';
    container.appendChild(acciones);
    if (!propuestas.length) {
      acciones.querySelector('.admin-actions__archive').hidden = true;
      return;
    }
    var select = acciones.querySelector('#adminAccionPropuesta');
    propuestas.forEach(function(p,index) {
      var numero = Number(p.numero || index + 1);
      var option = document.createElement('option');
      option.value = String(numero);
      option.textContent = 'Propuesta ' + numero +
        (numero === Number(item.tituloPreferidoNumero) ? ' · Preferida' : '') +
        ' — ' + String(p.tituloFinal || p.titulo || '').slice(0,90);
      select.appendChild(option);
    });
    var elegido = Number(expediente.tituloAdminSeleccionadoNumero ||
      expediente.tituloCoordinadorNumero || item.tituloPreferidoNumero || 1);
    if(propuestas.some(function(p,i){return Number(p.numero || i+1) === elegido;}))
      select.value=String(elegido);
    var editor = acciones.querySelector('#adminAccionEditor');
    var editText = acciones.querySelector('#adminAccionTituloCorregido');
    function actualOriginal() {
      var n=Number(select.value);
      var p=propuestas.filter(function(v,i){return Number(v.numero||i+1)===n;})[0]||{};
      return String(p.tituloFinal||p.titulo||'').trim();
    }
    editText.value=actualOriginal();
    select.addEventListener('change',function(){editText.value=actualOriginal();});
    var corregir = acciones.querySelector('[data-admin-decision="CORREGIR_APROBAR"]');
    corregir.setAttribute('aria-expanded','false');
    corregir.addEventListener('click',function(){
      if (editor.hidden) {
        editor.hidden = false;
        editText.focus();
        corregir.textContent = 'Confirmar corrección y aprobación';
        corregir.setAttribute('aria-expanded','true');
        return;
      }
      confirmarDecision('CORREGIR_APROBAR',item,acciones);
    });
    acciones.querySelectorAll('[data-admin-decision]').forEach(function(button){
      if(button.getAttribute('data-admin-decision')==='CORREGIR_APROBAR')return;
      button.addEventListener('click',function(){
        editor.hidden=true;
        corregir.textContent='Corregir y aprobar';
        corregir.setAttribute('aria-expanded','false');
        confirmarDecision(button.getAttribute('data-admin-decision'),item,acciones);
      });
    });
    acciones.querySelector('#adminArchivarDesdeDetalle').addEventListener('click',function(){
      confirmarArchivarIntento(item);
    });
  }

  function mostrarEstadoAccion(box,mensaje,esError){
    var p=box.querySelector('#adminAccionResultado');
    if(!p)return;
    p.textContent=mensaje||'';
    p.classList.toggle('is-error',Boolean(esError));
  }

  function confirmarDecision(accion,item,box){
    var propuestaNumero=Number(box.querySelector('#adminAccionPropuesta').value||0);
    var motivo=box.querySelector('#adminAccionMotivo').value.trim();
    var reabrir=box.querySelector('#adminReabrirAprobado');
    var reabrirAprobado=Boolean(reabrir&&reabrir.checked);
    var corregido=accion==='CORREGIR_APROBAR'
      ? box.querySelector('#adminAccionTituloCorregido').value.trim() : '';
    if(motivo.length<8){
      mostrarEstadoAccion(box,'Escribe una justificación de al menos 8 caracteres.',true);return;
    }
    if(reabrir&&!reabrirAprobado){
      mostrarEstadoAccion(box,'Para modificar un expediente aprobado, marca la autorización de reapertura.',true);return;
    }
    if(reabrir&&motivo.length<15){
      mostrarEstadoAccion(box,'La reapertura requiere un motivo de al menos 15 caracteres.',true);return;
    }
    if(accion==='CORREGIR_APROBAR'&&corregido.length<20){
      mostrarEstadoAccion(box,'Escribe el título corregido (mínimo 20 caracteres).',true);return;
    }
    var nombres={
      APROBAR:'Aprobar definitivamente',
      CORREGIR_APROBAR:'Corregir y aprobar definitivamente',
      ENVIAR_COORDINACION:'Enviar a Coordinación',
      ENVIAR_INVESTIGACION:'Enviar a Investigación'
    };
    var actual=(item.titulosEnviados||[]).filter(function(p,i){
      return Number(p.numero||i+1)===propuestaNumero;
    })[0]||{};
    var datos=item.titulo||{};
    var body={tituloId:datos.id,accion:accion,motivo:motivo,
      propuestaNumero:propuestaNumero,
      tituloCorregido:corregido,reabrirAprobado:reabrirAprobado,
      estadoEsperado:String(datos.estado||''),
      procesoEsperado:String(datos.estadoProceso||''),
      tituloOriginalEsperado:String(actual.tituloFinal||actual.titulo||'').trim(),
      actualizacionEsperada:typeof datos.actualizadoEnLocal==='string'
        ? datos.actualizadoEnLocal : null};
    var servicio=window.TAAdminAccionesSeguras;
    if(!servicio || !servicio.autorizadoLocal || !servicio.autorizadoLocal()){
      mostrarEstadoAccion(box,'Esta sesión no puede realizar decisiones académicas. No se guardó ningún cambio.',true);
      return;
    }
      ui.confirmar({
      titulo:nombres[accion]||'Confirmar acción administrativa',
      mensaje:'Estudiante: '+item.nombres+'. '+(accion==='ENVIAR_COORDINACION'
        ? 'Se reiniciará la revisión inicial.' : 'Propuesta '+propuestaNumero+'.')+
        (reabrirAprobado?' Se conservará la aprobación anterior en el historial.':'')+
        ' ¿Confirmas esta resolución?',
      onConfirm:function(){
        mostrarEstadoAccion(box,'Guardando decisión administrativa...',false);
        repository.intervenirTitulo(body).then(function(){
          ui.cerrarDetalleEstudiante();
          window.dispatchEvent(new CustomEvent('admin:titulos-actualizados'));
          return cargarEstudiantes();
        }).then(function(){
          ui.showStatus('#estudiantesMensaje','Intervención registrada: '+nombres[accion]+'.','success');
        }).catch(function(error){
          mostrarEstadoAccion(box,obtenerMensaje(error,'No se pudo guardar la intervención.'),true);
          ui.showStatus('#estudiantesMensaje',obtenerMensaje(error,'No se pudo guardar la intervención.'),'error');
        });
      }
      });
  }

  function confirmarArchivarIntento(item) {
    ui.confirmar({
      titulo: 'Archivar intento',
      mensaje: 'Se guardará una copia del intento en el historial y el estudiante podrá enviar nuevamente sus títulos. ¿Deseas continuar?',
      onConfirm: function () {
        archivarIntento(item);
      }
    });
  }

  function archivarIntento(item) {
    if (!item.titulo || !item.titulo.id) {
      ui.showStatus('#estudiantesMensaje', 'No se encontró un intento para archivar.', 'error');
      return;
    }

    ui.showStatus('#estudiantesMensaje', 'Archivando intento...', 'info');

    repository.archivarIntento(item.titulo.id)
      .then(function () {
        ui.cerrarDetalleEstudiante();
        ui.showStatus('#estudiantesMensaje', 'Intento archivado. El estudiante podrá enviar nuevamente.', 'success');
        return cargarEstudiantes();
      })
      .catch(function (error) {
        ui.showStatus('#estudiantesMensaje', obtenerMensaje(error, 'No se pudo archivar el intento.'), 'error');
      });
  }

  function coincideEstado(item, filtro) {
    var estadoActual = normalizarTexto(item.estado || item.estadoTitulo || '');
    var filtroNormalizado = normalizarTexto(filtro);

    if (filtroNormalizado === 'PENDIENTE') {
      return estadoCoincide(estadoActual, [
        config.estadosTitulo.pendiente,
        config.estadosTitulo.enviado,
        'PENDIENTE',
        'ENVIADO'
      ]);
    }

    if (filtroNormalizado === 'ENVIADO') {
      return Boolean(item.titulo) || estadoCoincide(estadoActual, [
        config.estadosTitulo.enviado,
        'ENVIADO'
      ]);
    }

    if (filtroNormalizado === 'SIN_ENVIAR') {
      return estadoCoincide(estadoActual, [
        config.estadosTitulo.sinEnviar,
        'SIN_ENVIAR',
        'SIN ENVIAR'
      ]);
    }

    if (filtroNormalizado === 'DEVUELTO') {
      return estadoCoincide(estadoActual, [
        config.estadosTitulo.devuelto,
        'DEVUELTO'
      ]);
    }

    if (filtroNormalizado === 'APROBADO') {
      return estadoCoincide(estadoActual, [
        config.estadosTitulo.aprobado,
        'APROBADO'
      ]);
    }

    return estadoActual === filtroNormalizado;
  }

  function estadoCoincide(estadoActual, valores) {
    for (var i = 0; i < valores.length; i += 1) {
      if (estadoActual === normalizarTexto(valores[i])) return true;
    }

    return false;
  }

  function tieneTelegram(item) {
    return Boolean(String(item.telegram || item.telegramUser || '').trim());
  }

  function limpiarTexto(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function normalizarTexto(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();
  }

  function obtenerMensaje(error, fallback) {
    return error && error.message ? error.message : fallback;
  }

  window.TAAdminEstudiantes = Object.freeze({
    iniciar: iniciar,
    cargar: cargar,
    aplicarFiltros: aplicarFiltros
  });
})();