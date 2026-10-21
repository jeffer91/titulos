/* Estadísticas del Administrador. Todo se calcula localmente con datos compartidos. */
(function () {
  'use strict';
  var repo = window.TAAdministradorRepository;
  var ui = window.TAAdminUI;
  var filas = [], configuracion = {}, periodos = [], resultadoActual = null;
  var TODOS = '__TODOS_ACTIVOS__';
  var ESTADOS = ['APROBADO','SIN_ENVIO','COORDINACION','INVESTIGACION','DEVUELTO','OTROS'];
  function texto(v){return String(v === undefined || v === null ? '' : v).replace(/\s+/g,' ').trim();}
  function clave(v){return texto(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();}
  function num(v){return Number(v||0).toLocaleString('es-EC');}
  function porcentaje(a,b){return b ? Math.round(a*10000/b)/100 : 0;}
  function etiquetaEstado(e){
    return {APROBADO:'Aprobados',SIN_ENVIO:'Sin enviar',COORDINACION:'Pendientes de Coordinación',
      INVESTIGACION:'Pendientes de Investigación',DEVUELTO:'Devueltos',OTROS:'En revisión / por conciliar'}[e] || e;
  }
  function modalidad(item){
    var carrera=clave(item.carrera||item.nombreCarrera);
    var especificada=clave(item.modalidadEstudio||item.raw&&(
      item.raw.modalidadEstudio||item.raw.modalidad||item.raw.modalidadEducativa));
    if (/ONLINE|VIRTUAL|DISTANCIA/.test(carrera+' '+especificada)) return 'ONLINE';
    if (/PRESENCIAL/.test(carrera+' '+especificada)) return 'PRESENCIAL';
    if(especificada) return 'OTRA';
    return 'SIN_DATO';
  }
  function estado(item){
    var titulo=item.titulo;
    if (!titulo || !Array.isArray(item.titulosEnviados) || !item.titulosEnviados.length) return 'SIN_ENVIO';
    var global=clave(titulo.estado),proceso=clave(titulo.estadoProceso);
    if (global==='APROBADO_FINAL'||proceso==='APROBADO_FINAL'||titulo.procesoCerrado===true)
      return 'APROBADO';
    var etapa=repo.obtenerEtapaRevision(titulo);
    if(etapa==='COORDINACION')return 'COORDINACION';
    if(etapa==='INVESTIGACION')return 'INVESTIGACION';
    var clasificado=repo.clasificarEstadoTitulo(titulo);
    if(clasificado==='APROBADO')return 'APROBADO';
    if(clasificado==='DEVUELTO')return 'DEVUELTO';
    if(global==='BORRADOR_REINICIADO'||global==='ARCHIVADO')return 'SIN_ENVIO';
    return 'OTROS';
  }
  function contar(lista){
    var r={total:lista.length,aprobados:0,faltan:0,porcentaje:0};
    ESTADOS.forEach(function(e){r[e]=0;});
    lista.forEach(function(item){r[estado(item)]++;});
    r.aprobados=r.APROBADO;r.faltan=r.total-r.aprobados;r.porcentaje=porcentaje(r.aprobados,r.total);
    return r;
  }
  function filtrar(lista,filtro,activos){
    var activoSet=new Set((activos||[]).map(String));
    return (lista||[]).filter(function(x){
      if(filtro.periodo===TODOS && !activoSet.has(String(x.periodoId||'')))return false;
      if(filtro.periodo!==TODOS && filtro.periodo && String(x.periodoId||'')!==filtro.periodo)return false;
      if(filtro.carrera && clave(x.carrera||x.nombreCarrera)!==clave(filtro.carrera))return false;
      if(filtro.sede && clave(x.sede||x.raw&&x.raw.sede||'SIN_DATO')!==clave(filtro.sede))return false;
      if(filtro.modalidad && modalidad(x)!==filtro.modalidad)return false;
      return true;
    });
  }
  function agrupar(lista){
    var mapa=Object.create(null);
    (lista||[]).forEach(function(item){
      var nombre=texto(item.carrera||item.nombreCarrera)||'Sin carrera';
      var k=clave(nombre);
      if(!mapa[k])mapa[k]={carrera:nombre,lista:[]};
      mapa[k].lista.push(item);
    });
    return Object.keys(mapa).map(function(k){
      return Object.assign({carrera:mapa[k].carrera},contar(mapa[k].lista));
    }).sort(function(a,b){
      return b.faltan-a.faltan || a.carrera.localeCompare(b.carrera,'es');
    });
  }
  function opcion(select,valor,etiqueta){
    var o=document.createElement('option');o.value=valor;o.textContent=etiqueta;select.appendChild(o);
  }
  function llenar(selector,items,inicial){
    var el=ui.qs(selector);if(!el)return;
    var elegido=el.value || inicial || '';
    el.textContent='';
    items.forEach(function(item){opcion(el,item.value,item.label);});
    el.value=items.some(function(item){return item.value===elegido;})?elegido:(inicial||'');
  }
  function opcionLista(datos,leer,etiquetaTodos){
    var mapa=Object.create(null);
    datos.forEach(function(item){var raw=texto(leer(item));if(raw && !mapa[clave(raw)])mapa[clave(raw)]=raw;});
    return [{value:'',label:etiquetaTodos}].concat(Object.keys(mapa).sort(function(a,b){
      return mapa[a].localeCompare(mapa[b],'es');
    }).map(function(k){return {value:mapa[k],label:mapa[k]};}));
  }
  function prepararFiltros(){
    var activos=(configuracion.periodosActivos||[]).map(String);
    var valores=periodos.map(function(p){
      return {value:p.id,label:p.label+(p.activo?' · Activo':' · Histórico')};
    });
    llenar('#statsFiltroPeriodo',[{value:TODOS,label:'Todos los períodos activos'}].concat(valores),TODOS);
    llenar('#statsFiltroCarrera',opcionLista(filas,function(x){return x.carrera||x.nombreCarrera;},'Todas las carreras'),'');
    llenar('#statsFiltroSede',opcionLista(filas,function(x){return x.sede||x.raw&&x.raw.sede||'Sin dato';},'Todas las sedes'),'');
    llenar('#statsFiltroModalidad',[
      {value:'',label:'Todas las modalidades'},
      {value:'PRESENCIAL',label:'Presencial'},
      {value:'ONLINE',label:'Online / virtual'},
      {value:'OTRA',label:'Otra modalidad'},
      {value:'SIN_DATO',label:'Sin modalidad registrada'}
    ],'');
    var txt=ui.qs('#statsCobertura');
    if(txt)txt.textContent=activos.length+' período(s) activo(s) en la configuración';
  }
  function filtros(){
    return {periodo:ui.value('#statsFiltroPeriodo')||TODOS,
      carrera:ui.value('#statsFiltroCarrera'),sede:ui.value('#statsFiltroSede'),
      modalidad:ui.value('#statsFiltroModalidad')};
  }
  function celda(tr,value){
    var td=document.createElement('td');td.textContent=String(value);tr.appendChild(td);return td;
  }
  function pintar(){
    var lista=filtrar(filas,filtros(),configuracion.periodosActivos||[]);
    var resumen=contar(lista),carreras=agrupar(lista);
    resultadoActual={resumen:resumen,carreras:carreras};
    ui.setText('#statsTotal',num(resumen.total));
    ui.setText('#statsAprobados',num(resumen.aprobados));
    ui.setText('#statsFaltan',num(resumen.faltan));
    ui.setText('#statsPorcentaje',resumen.porcentaje.toLocaleString('es-EC')+' %');
    ui.setText('#statsSinEnviar',num(resumen.SIN_ENVIO));
    ui.setText('#statsCoordinacion',num(resumen.COORDINACION));
    ui.setText('#statsInvestigacion',num(resumen.INVESTIGACION));
    ui.setText('#statsDevueltos',num(resumen.DEVUELTO));
    ui.setText('#statsOtros',num(resumen.OTROS));
    var tbody=ui.qs('#statsTablaCarreras');if(tbody){
      tbody.textContent='';
      if(!carreras.length){var tr=document.createElement('tr');var td=celda(tr,'No existen estudiantes con estos filtros.');td.colSpan=5;td.className='empty-cell';tbody.appendChild(tr);}
      carreras.forEach(function(item){
        var tr=document.createElement('tr');
        celda(tr,item.carrera);celda(tr,num(item.total));celda(tr,num(item.aprobados));
        celda(tr,num(item.faltan));celda(tr,item.porcentaje.toLocaleString('es-EC')+' %');
        tbody.appendChild(tr);
      });
    }
    var barras=ui.qs('#statsGraficaCarreras');if(barras){
      barras.textContent='';
      carreras.slice(0,12).forEach(function(item){
        var div=document.createElement('div');div.className='stats-bar-item';
        var cab=document.createElement('div');cab.className='stats-bar-caption';
        var titulo=document.createElement('span');titulo.textContent=item.carrera;
        var valor=document.createElement('strong');
        valor.textContent=num(item.aprobados)+' / '+num(item.total)+' ('+item.porcentaje.toLocaleString('es-EC')+' %)';
        cab.appendChild(titulo);cab.appendChild(valor);
        var fondo=document.createElement('div');fondo.className='stats-bar-track';
        var progreso=document.createElement('div');progreso.className='stats-bar-fill';
        progreso.style.width=Math.max(0,Math.min(100,item.porcentaje))+'%';
        fondo.appendChild(progreso);div.appendChild(cab);div.appendChild(fondo);barras.appendChild(div);
      });
      if(!carreras.length){
        var empty=document.createElement('p');empty.className='muted';
        empty.textContent='Sin información para la selección actual.';barras.appendChild(empty);
      }
    }
    ui.showStatus('#statsMensaje',num(resumen.total)+' estudiantes en la selección. Los filtros no consultan Firebase.','success');
  }
  function cargar(){
    ui.showStatus('#statsMensaje','Preparando estadísticas con los datos compartidos...','info');
    return Promise.all([repo.listarEstudiantesConTitulos(''),repo.cargarAppConfig(),repo.listarPeriodos()])
      .then(function(res){
        filas=res[0]||[];configuracion=res[1]||{};periodos=res[2]||[];
        prepararFiltros();pintar();
      }).catch(function(err){
        ui.showStatus('#statsMensaje','No se pudieron preparar las estadísticas. '+err.message,'error');
        throw err;
      });
  }
  function exportar(){
    if(!resultadoActual)return;
    var header=['Carrera','Total','Aprobados','Faltan','Porcentaje'];
    var datos=resultadoActual.carreras.map(function(c){
      return [c.carrera,c.total,c.aprobados,c.faltan,c.porcentaje];
    });
    var csv=[header].concat(datos).map(function(row){
      return row.map(function(x){
        // Proteger la apertura en Excel de fórmulas procedentes de nombres externos.
        var v=String(x);
        if(/^[=+\-@\t\r]/.test(v))v="'"+v;
        return '"'+v.replace(/"/g,'""')+'"';
      }).join(';');
    }).join('\r\n');
    var blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});
    var url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='estadisticas-titulacion.csv';document.body.appendChild(a);
    a.click();a.remove();URL.revokeObjectURL(url);
  }
  function iniciar(){
    ['#statsFiltroPeriodo','#statsFiltroCarrera','#statsFiltroSede','#statsFiltroModalidad'].forEach(function(sel){
      var el=ui.qs(sel);if(el)el.addEventListener('change',pintar);
    });
    var clear=ui.qs('#btnLimpiarEstadisticas');
    if(clear)clear.addEventListener('click',function(){
      ui.setValue('#statsFiltroPeriodo',TODOS);
      ui.setValue('#statsFiltroCarrera','');ui.setValue('#statsFiltroSede','');
      ui.setValue('#statsFiltroModalidad','');pintar();
    });
    var csv=ui.qs('#btnExportarEstadisticas');
    if(csv)csv.addEventListener('click',exportar);
  }
  window.TAAdminEstadisticas=Object.freeze({
    iniciar:iniciar,cargar:cargar,contar:contar,filtrar:filtrar,agrupar:agrupar
  });
})();
