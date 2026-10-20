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

  var resolucionesAdministracion = {
    APROBAR: 'Aprobar definitivamente por Administración',
    CORREGIR_APROBAR: 'Guardar y aprobar definitivamente'
  };
  var accionesDetalle = {
    APROBAR_COORDINACION: 'Aprobar por Coordinación',
    APROBAR_INVESTIGACION: 'Aprobar por Investigación',
    ENVIAR_COORDINACION: 'Devolver a Coordinación',
    ENVIAR_INVESTIGACION: 'Devolver a Investigación',
    DEVOLVER_ESTUDIANTE: 'Devolver al estudiante',
    BORRAR_TITULO: 'Borrar título seleccionado'
  };

  function agregarAccionesDetalle(item) {
    var container=ui.qs('#detalleEstudianteContenido');
    if(!container)return;
    var d=item.titulo||{}, propuestas=item.titulosEnviados||[];
    var box=document.createElement('section');box.className='detail-box admin-actions';
    var cerrado=d.procesoCerrado===true||d.estado==='APROBADO_FINAL'||d.estadoProceso==='APROBADO_FINAL';
    var sesion=window.TAAdminAccionesSeguras;
    var disponible=!(window.TA_ADMIN_SEGURIDAD&&window.TA_ADMIN_SEGURIDAD.habilitado)||Boolean(sesion&&sesion.autorizadoLocal());
    box.innerHTML='<div class="admin-actions__head"><div><small>GESTIÓN DEL EXPEDIENTE</small><h3>Acciones administrativas</h3></div><span class="admin-proposal__tag">Historial conservado</span></div>'+
      (!propuestas.length?'<p>No hay propuestas activas para gestionar.</p>':
      '<div class="admin-actions__form"><label for="adminAccionPropuesta">Título sobre el que actuarás</label><select id="adminAccionPropuesta"></select><p id="adminTituloActivo" class="admin-active-title"></p>'+
      '<div class="admin-actions__editor"><strong>Editar y aprobar definitivamente como Administrador</strong>'+
      '<label for="adminTituloCorregido">Título definitivo (puedes reemplazarlo por completo)</label><textarea id="adminTituloCorregido" rows="3" maxlength="260"></textarea>'+
      '<label for="adminAccionMotivo">Motivo u observación</label><textarea id="adminAccionMotivo" rows="2" maxlength="1000" placeholder="Justifica la intervención (mínimo 8 caracteres)"></textarea>'+
      '<button type="button" id="adminAprobarFinal" class="btn btn--primary admin-actions__final-button">Guardar y aprobar definitivamente</button>'+
      '<small>La aprobación del Administrador cierra el expediente sin requerir Coordinación ni Investigación. Si no cambias el texto, aprueba la propuesta original.</small></div>'+
      '<div class="admin-actions__buttons">'+Object.keys(accionesDetalle).map(function(k){return '<button type="button" class="btn '+(k==='BORRAR_TITULO'?'btn--danger':k.indexOf('APROBAR')===0?'btn--primary':'btn--secondary')+'" data-admin-decision="'+k+'">'+accionesDetalle[k]+'</button>';}).join('')+'</div>'+
      (cerrado?'<label class="admin-reopen"><input id="adminReabrirAprobado" type="checkbox">Confirmo modificar la aprobación vigente. La decisión anterior quedará en el historial.</label>':'')+
      '<p class="admin-actions__availability"'+(disponible?' hidden':'')+'>Las decisiones no están disponibles en esta sesión.</p><p id="adminAccionResultado" role="status" aria-live="polite" class="admin-actions__status"></p></div>');
    container.prepend(box);
    if(!propuestas.length)return;
    var select=box.querySelector('#adminAccionPropuesta');
    propuestas.forEach(function(p,i){var o=document.createElement('option');o.value=String(p.numero||i+1);o.textContent='Propuesta '+o.value+(Number(o.value)===Number(item.tituloPreferidoNumero)?' · Preferida':'');select.appendChild(o);});
    var elegido=Number(d.tituloAdminSeleccionadoNumero||d.tituloCoordinadorNumero||item.tituloPreferidoNumero||propuestas[0].numero||1);
    if(propuestas.some(function(p,i){return Number(p.numero||i+1)===elegido;}))select.value=String(elegido);
    function seleccionar(){
      var p=propuestas.find(function(p,i){return Number(p.numero||i+1)===Number(select.value);})||{};
      box.querySelector('#adminTituloActivo').textContent=p.tituloFinal||p.titulo||'';
      box.querySelector('#adminTituloCorregido').value=p.tituloFinal||p.titulo||'';
      container.querySelectorAll('[data-propuesta-numero]').forEach(function(card){var chosen=card.dataset.propuestaNumero===select.value;card.classList.toggle('is-selected',chosen);card.setAttribute('aria-pressed',String(chosen));});
    }
    select.addEventListener('change',seleccionar);
    container.querySelectorAll('[data-propuesta-numero]').forEach(function(card){card.addEventListener('click',function(){select.value=card.dataset.propuestaNumero;seleccionar();});});
    seleccionar();
    var botonFinal=box.querySelector('#adminAprobarFinal');
    if(!disponible)botonFinal.disabled=true;
    botonFinal.addEventListener('click',function(){
      var p=propuestas.find(function(p,i){return Number(p.numero||i+1)===Number(select.value);})||{};
      var antes=String(p.tituloFinal||p.titulo||'').replace(/\s+/g,' ').trim();
      var despues=box.querySelector('#adminTituloCorregido').value.replace(/\s+/g,' ').trim();
      var clave=function(s){return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();};
      confirmarDecision(clave(antes)===clave(despues)?'APROBAR':'CORREGIR_APROBAR',item,box);
    });
    box.querySelectorAll('[data-admin-decision]').forEach(function(button){
      if(!disponible)button.disabled = true;
      button.addEventListener('click',function(){confirmarDecision(button.dataset.adminDecision,item,box);});
    });
  }

  function mostrarEstadoAccion(box,mensaje,esError){
    var p=box.querySelector('#adminAccionResultado');if(!p)return;
    p.textContent=mensaje||'';p.classList.toggle('is-error',Boolean(esError));
  }

  function confirmarDecision(accion,item,box){
    if(box.dataset.busy==='true')return;
    var numero=Number(box.querySelector('#adminAccionPropuesta').value);
    var motivo=box.querySelector('#adminAccionMotivo').value.trim();
    var check=box.querySelector('#adminReabrirAprobado');
    var d=item.titulo||{};
    var p=(item.titulosEnviados||[]).find(function(p,i){return Number(p.numero||i+1)===numero;})||{};
    var body={tituloId:d.id,accion:accion,propuestaNumero:numero,motivo:motivo,reabrirAprobado:Boolean(check&&check.checked),
      estadoEsperado:String(d.estado||''),procesoEsperado:String(d.estadoProceso||''),
      tituloOriginalEsperado:String(p.tituloFinal||p.titulo||'').trim(),
      actualizacionEsperada:typeof d.actualizadoEnLocal==='string'?d.actualizadoEnLocal:null};
    if(accion==='CORREGIR_APROBAR')body.tituloCorregido=box.querySelector('#adminTituloCorregido').value.replace(/\s+/g,' ').trim();
    try{window.TAAdminWorkflow.preparar(Object.assign({},d,{titulosEnviados:item.titulosEnviados}),body,new Date().toISOString());}
    catch(e){mostrarEstadoAccion(box,e.message,true);return;}
    var nombreAccion=resolucionesAdministracion[accion]||accionesDetalle[accion];
    var esFinalAdmin=Boolean(resolucionesAdministracion[accion]);
    ui.confirmar({titulo:nombreAccion,mensaje:'Propuesta '+numero+' de '+item.nombres+'. '+
      (esFinalAdmin?'Se guardará el título definitivo y el expediente quedará APROBADO FINAL por Administración, sin requerir otras aprobaciones. ':accion==='BORRAR_TITULO'?'Se retirará solo esta propuesta. Si está vinculada a una aprobación, se reabrirá la revisión. ':accion==='DEVOLVER_ESTUDIANTE'?'Podrá corregir y reenviar sus propuestas. ':'')+'Se conservará el historial. ¿Confirmas?',
      onConfirm:function(){
        if(box.dataset.busy==='true')return;
        box.dataset.busy='true';box.querySelectorAll('button,select,textarea,input').forEach(function(e){e.disabled=true;});
        mostrarEstadoAccion(box,'Guardando cambios…',false);
        repository.intervenirTitulo(body).then(function(){
          ui.cerrarDetalleEstudiante();window.dispatchEvent(new CustomEvent('admin:titulos-actualizados'));
          return cargarEstudiantes().then(function(){
            var actualizado=estado.estudiantes.find(function(x){return x.cedula===item.cedula&&x.periodoId===item.periodoId;});
            if(actualizado)verMas(actualizado);
            ui.showStatus('#estudiantesMensaje',nombreAccion+': cambio guardado.','success');
          });
        }).catch(function(e){mostrarEstadoAccion(box,obtenerMensaje(e,'No se pudo guardar el cambio.'),true);ui.showStatus('#estudiantesMensaje',obtenerMensaje(e,'No se pudo guardar el cambio.'),'error');})
        .finally(function(){box.dataset.busy='false';box.querySelectorAll('button,select,textarea,input').forEach(function(e){e.disabled=false;});});
      }});
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