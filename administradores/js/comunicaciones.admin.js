/* Comunicaciones de titulacion: borradores personalizados en Outlook web.
 * Ninguna accion envia correos: el administrador revisa y pulsa Enviar en Outlook.
 * No necesita OAuth ni almacena correos personales en localStorage.
 */
(function(){
  'use strict';
  var repo=window.TAAdministradorRepository,ui=window.TAAdminUI;
  var candidatos=[],abiertosSesion=new Set(),contactosImportados=new Map();
  var maxTanda=30;
  var OUTLOOK='https://outlook.office.com/mail/deeplink/compose';
  var ASUNTO='ITSQMET | Envío pendiente de títulos de titulación';
  var TITULOS_URL='https://jeffer91.github.io/titulos/estudiantes/';
  function texto(v){return String(v===undefined||v===null?'':v).replace(/\s+/g,' ').trim();}
  function correoValido(s){return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(s);}
  function escape(s){return ui.escapeHtml?ui.escapeHtml(s):texto(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');}
  function contactos(item){
    // Orden institucional -> personal. Un único borrador puede tener ambas cuentas.
    // La base académica emplea variantes camelCase, con espacios y con guiones.
    var imported=contactosImportados.get(texto(item&&item.cedula))||{};
    var campos=[item||{},item&&item.raw||{},item&&item.titulo||{},
      item&&item.contacto||{},item&&item.raw&&item.raw.contacto||{},imported];
    var keysInstitucional=new Set([
      'correoinstitucional','emailinstitucional','mailinstitucional',
      'correoestudiantil','emailestudiantil',
      'correoitsqmet','emailacademico','correoacademico','correocorporativo',
      'emailcorporativo','correoelectronicoinstitucional','emailestudiante',
      'correoinstitucionalestudiante','correoinstitucionalalumno'
    ]);
    var keysPersonal=new Set([
      'correopersonal','emailpersonal','correoelectronico','email','correo','mail',
      'correoalternativo','emailalternativo','correosecundario'
    ]);
    var keysTelefono=new Set([
      'celular','telefonocelular','numerocelular','telefonomovil','movil',
      'whatsapp','telefono','telefonocontacto','numerotelefono'
    ]);
    var institucional=[],personal=[],telefonos=[];
    function agregar(lista,email){
      email=texto(email).toLowerCase();
      if(correoValido(email)&&lista.indexOf(email)<0)lista.push(email);
    }
    campos.forEach(function(c){
      Object.keys(c||{}).forEach(function(k){
        var key=texto(k).normalize('NFD').replace(/[\u0300-\u036f]/g,'')
          .replace(/[^A-Za-z0-9]/g,'').toLowerCase();
        var val=c[k];
        if(keysInstitucional.has(key)){
          agregar(institucional,val);
        }else if(keysPersonal.has(key)){
          var direccion=texto(val).toLowerCase();
          // Si solo está registrado en un campo genérico, reconocer el dominio institucional.
          var dominio=direccion.split('@')[1]||'';
          if(/(^|\.)itsqmet\.edu\.ec$/.test(dominio))agregar(institucional,direccion);
          else agregar(personal,direccion);
        }else if(keysTelefono.has(key)&&texto(val)&&telefonos.indexOf(texto(val))<0){
          telefonos.push(texto(val));
        }
      });
    });
    var emails=institutionalFirst(institucional,personal);
    var telefonoValido=telefonos.find(function(v){return Boolean(telefonoEcuador(v));});
    return {emails:emails,institucional:institucional,personal:personal,
      telefono:telefonoValido||telefonos[0]||''};
  }
  function institutionalFirst(institucional,personal){
    var seen=new Set(),ordered=[];
    institucional.concat(personal).forEach(function(mail){
      if(!seen.has(mail)){seen.add(mail);ordered.push(mail);}
    });
    return ordered;
  }
  function telefonoEcuador(raw){
    var rawValue=texto(raw),internacional=/^(\+|00)/.test(rawValue);
    var v=rawValue.replace(/[^\d+]/g,'');
    if(v.startsWith('+'))v=v.substring(1);
    if(/^09\d{8}$/.test(v))return '593'+v.substring(1);
    if(/^9\d{8}$/.test(v))return '593'+v;
    if(/^5939\d{8}$/.test(v))return v;
    if(/^00\d{11,15}$/.test(v))return v.substring(2);
    // Los números nacionales ambiguos de 10 dígitos pueden ser cédulas;
    // aceptamos otros países solo si se indicó un prefijo internacional.
    if(internacional && /^\d{9,15}$/.test(v) && !/^0/.test(v))return v;
    return '';
  }
  function nombre(item){return texto(item&&item.nombres||item&&item.nombre||'estudiante');}
  function sinTitulo(item){
    if(!item)return false;
    // El examen complexivo no exige presentar títulos de trabajo de titulación.
    var modalidad=texto(item.modalidadTitulacion ||
      (item.raw && (item.raw.modalidadTitulacion || item.raw.modalidadTitulacionActual)) ||
      (item.titulo && (item.titulo.modalidadTitulacion || item.titulo.tipoTrabajo)) || '');
    if(/COMPLEXIVO/i.test(modalidad))return false;
    var t=item.titulo;
    var g=texto(t&&(t.estadoProceso||t.estado)).toUpperCase();
    if(g==='ARCHIVADO'||g==='BORRADOR_REINICIADO')return true;
    if(!t)return true;
    // Evitar falsos positivos: los expedientes en revisión o con propuestas
    // legadas no deben recibir correos de "todavía no envió".
    if(t.procesoCerrado===true)return false;
    if(/APROBADO|ENVIADO|PENDIENTE|VALIDADO|INVESTIGACION|COORDINACION|DEVUELTO/.test(g))return false;
    if([t.titulo1,t.titulo2,t.titulo3,t.tituloPreferidoTexto,t.tituloCoordinador,t.tituloFinal]
      .some(function(v){return texto(v).length>0;}))return false;
    var propuestas=[item.titulosEnviados,t.titulosEnviados,t.propuestasDetalle];
    if(propuestas.some(function(a){return Array.isArray(a)&&a.length>0;}))return false;
    return g==='SIN_ENVIAR'||g==='SIN ENVIAR'||g==='BORRADOR';
  }
  function plantilla(item,whatsapp){
    var saludo='Estimado/a '+nombre(item)+':';
    var carrera=texto(item.carrera||item.nombreCarrera||'');
    var periodo=texto(item.periodoLabel||item.periodoId||'');
    var falta=sinTitulo(item);
    var global=texto(item.titulo&&(item.titulo.estadoProceso||item.titulo.estado)||item.estado).toUpperCase();
    var aprobado=global==='APROBADO_FINAL'||global==='APROBADO'||item.titulo&&item.titulo.procesoCerrado===true;
    var devuelto=!falta&&(global==='DEVUELTO'||texto(item.estado).toUpperCase()==='DEVUELTO');
    var intro=falta ?
      'Al revisar su expediente de titulación, verificamos que todavía no registra el envío de sus propuestas de títulos.' :
      devuelto ? 'Su expediente de titulación registra una devolución que requiere su atención.' :
      aprobado ? 'Su expediente registra un título aprobado. Le compartimos esta comunicación informativa sobre su proceso.' :
      'Su expediente de titulación registra propuestas enviadas y actualmente está en proceso de revisión.';
    var indicacion=falta ?
      'Le solicitamos ingresar al sistema institucional y remitir las tres propuestas de títulos para iniciar su revisión.' :
      devuelto ? 'Ingrese al sistema institucional, revise las observaciones, corrija las propuestas y reenvíelas cuando esté habilitado.' :
      aprobado ? 'No necesita volver a enviar propuestas. Puede consultar el título aprobado desde la plataforma.' :
      'No es necesario enviar nuevamente las propuestas mientras estén en revisión. Consulte su estado y las observaciones en la plataforma.';
    var partes=[saludo,'',intro,'',
      'Carrera: '+(carrera||'Por confirmar'),'Período académico: '+(periodo||'Por confirmar'),'',
      indicacion,'Enlace de estudiantes: '+TITULOS_URL,''];
    if(falta||devuelto){
      partes.push('Para formular los títulos, tenga en cuenta la Guía institucional para la formulación y aprobación de títulos de titulación:',
        '• Una sola acción principal y un objeto de estudio claramente identificado.',
        '• Delimitar la población y el contexto cuando corresponda.',
        '• Indicar las fechas de inicio y fin si el estudio depende del tiempo.',
        '• Evitar títulos que anticipen resultados o impliquen dos trabajos independientes.','');
      partes.push(whatsapp?'Solicite la guía en PDF a la Unidad si todavía no la tiene.':
        'Si no dispone de la guía institucional en PDF, puede solicitarla a la Unidad de Titulación.');
    }
    partes.push('','Atentamente,','Unidad de Titulación y Eficiencia Terminal','ITSQMET');
    return partes.join('\n');
  }
  function abrirWhatsapp(item){
    var phone=telefonoEcuador(contactos(item).telefono);
    if(!phone){
      var nuevo=window.prompt('El estudiante no tiene un WhatsApp registrado. Introduce el número (ejemplo: 09xxxxxxxx).');
      phone=telefonoEcuador(nuevo);
      if(!phone){if(nuevo)alert('El número ingresado no es válido.');return false;}
    }
    var msg=encodeURIComponent(plantilla(item,true));
    // Enlace web oficial: funciona con WhatsApp Web o permite abrir la app.
    // No dependemos de un protocolo whatsapp:// registrado en Windows.
    var anchor=document.createElement('a');
    anchor.href='https://wa.me/'+phone+'?text='+msg;
    anchor.target='_blank';anchor.rel='noopener noreferrer';
    document.body.appendChild(anchor);anchor.click();anchor.remove();
    return true;
  }

  function enlaceOutlook(item,correo){
    var emails=contactos(item).emails;
    var destinatarios=correo?[texto(correo).toLowerCase()]:emails;
    destinatarios=destinatarios.filter(correoValido);
    if(!destinatarios.length)return '';
    // Outlook on the web admite to, subject y body codificados en la URL.
    // El borrador nunca es enviado desde GitHub Pages.
    return OUTLOOK+
      '?to='+encodeURIComponent(destinatarios.join(';'))+
      '&subject='+encodeURIComponent(ASUNTO)+
      '&body='+encodeURIComponent(plantilla(item,false)+'\r\n ');
  }
  function abrirCorreo(item){
    var correo=contactos(item).emails[0]||'';
    if(!correo){
      var escrito=window.prompt('El estudiante no tiene correo registrado. Introduce un correo válido para Outlook:');
      if(escrito===null)return false;
      correo=texto(escrito).toLowerCase();
      if(!correoValido(correo)){window.alert('Correo inválido.');return false;}
    }
    // Si hay correos almacenados, incluir ambos: institucional y personal.
    var destino=enlaceOutlook(item,contactos(item).emails.length?null:correo);
    var nueva=window.open(destino,'_blank');
    if(!nueva){
      // El usuario aún puede abrirlo desde un enlace voluntario.
      window.alert('Tu navegador bloqueó la pestaña. Permite ventanas emergentes para jeffer91.github.io e inténtalo.');
      return false;
    }
    try{nueva.opener=null;}catch(e){}
    return true;
  }
  function modal(){return ui.qs('#modalComunicaciones');}
  function mensaje(msg,tipo){
    var out=ui.qs('#comMensaje');
    if(out){out.textContent=msg;out.dataset.tipo=tipo||'info';}
  }
  function abrirModal(){
    var m=modal();
    if(!m)return;
    m.classList.remove('is-hidden');
    m.setAttribute('aria-hidden','false');
  }
  function cerrarModal(){
    var m=modal();
    if(!m)return;
    m.classList.add('is-hidden');
    m.setAttribute('aria-hidden','true');
  }
  function parseCsvLine(line,sep){
    var result=[],actual='',quoted=false;
    for(var i=0;i<line.length;i++){
      var ch=line[i];
      if(ch==='"'){
        if(quoted && line[i+1]==='"'){actual+='"';i++;}
        else quoted=!quoted;
      }else if(ch===sep&&!quoted){result.push(actual);actual='';}
      else actual+=ch;
    }
    result.push(actual);return result;
  }
  function importarCsv(file){
    if(!file)return Promise.resolve();
    return file.text().then(function(content){
      var lines=content.replace(/^\uFEFF/,'').split(/\r?\n/).filter(function(line){return texto(line);});
      if(lines.length<2)throw Error('El CSV no contiene estudiantes.');
      var header=lines[0],sep=[';',',','\t'].sort(function(a,b){
        return header.split(b).length-header.split(a).length;
      })[0];
      var names=parseCsvLine(header,sep).map(function(v){
        return texto(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'')
          .replace(/[^a-zA-Z0-9]/g,'').toUpperCase();
      });
      var indice=function(list){return names.findIndex(function(n){return list.indexOf(n)>=0;});};
      var id=indice(['CEDULA','IDENTIFICACION','NUMEROIDENTIFICACION']);
      var cp=indice(['CORREO','EMAIL','CORREOPERSONAL','EMAILPERSONAL']);
      var ci=indice(['CORREOINSTITUCIONAL','EMAILINSTITUCIONAL']);
      var tel=indice(['CELULAR','TELEFONO','WHATSAPP']);
      if(id<0||(cp<0&&ci<0))throw Error('CSV requiere cedula y correo o correoInstitucional.');
      var count=0;
      lines.slice(1).forEach(function(line){
        var cells=parseCsvLine(line,sep),cedula=texto(cells[id]).replace(/\D/g,'');
        if(!/^\d{10}$/.test(cedula))return;
        var data={correoPersonal:cp>=0?texto(cells[cp]):'',
          correoInstitucional:ci>=0?texto(cells[ci]):'',celular:tel>=0?texto(cells[tel]):''};
        if(!data.correoPersonal&&!data.correoInstitucional&&!data.celular)return;
        contactosImportados.set(cedula,data);
        count++;
      });
      render();
      mensaje('Contactos adicionales cargados de '+count+' estudiantes. Se usan solo en esta sesión.','success');
    }).catch(function(error){mensaje('CSV no válido: '+error.message,'error');});
  }
  function llave(item){return texto(item&&item.cedula);}
  function calcularCandidatos(estudiantes){
    // No enviar recordatorio a quien tiene propuestas, incluso de periodos anteriores.
    // El filtro visible define la población. Nunca duplicar una cédula.
    var vistos=new Set(),salida=[];
    (estudiantes||[]).filter(sinTitulo).forEach(function(item){
      var key=llave(item);
      if(!key||vistos.has(key))return;
      vistos.add(key);salida.push(item);
    });
    return salida.sort(function(a,b){return nombre(a).localeCompare(nombre(b),'es');});
  }
  function elegibles(){
    return candidatos.filter(function(item){
      return contactos(item).emails.length>0&&!abiertosSesion.has(llave(item));
    });
  }
  function resumen(){
    var listos=candidatos.filter(function(item){return contactos(item).emails.length>0;}).length;
    var abiertos=candidatos.filter(function(item){return abiertosSesion.has(llave(item));}).length;
    ui.setText('#comTotal',String(candidatos.length));
    ui.setText('#comConCorreo',String(listos));
    ui.setText('#comConInstitucional',String(candidatos.filter(function(item){
      return contactos(item).institucional.length>0;
    }).length));
    ui.setText('#comSinInstitucional',String(candidatos.filter(function(item){
      return !contactos(item).institucional.length;
    }).length));
    ui.setText('#comSinContacto',String(candidatos.length-listos));
    ui.setText('#comAbiertos',String(abiertos));
    ui.setText('#comPendientes',String(elegibles().length));
    var cantidad=ui.qs('#comCantidad');
    var btn=ui.qs('#comBtnPreparar');
    if(btn)btn.disabled=elegibles().length===0;
    if(cantidad&&cantidad.value==='')cantidad.value=String(Math.min(15,elegibles().length));
  }
  function linkOutlook(item){
    var el=document.createElement('a');
    el.className='btn btn--small btn--secondary com-open-link';
    el.target='_blank';el.rel='noopener noreferrer';
    el.textContent='Abrir en Outlook';
    el.href=enlaceOutlook(item);
    el.addEventListener('click',function(){
      // Significa pestaña solicitada por clic, no mensaje enviado.
      abiertosSesion.add(llave(item));
      render();
      mensaje('Se abrió o solicitó un borrador de Outlook. Revisa y pulsa Enviar allí; aquí no se registra el envío.','info');
    });
    return el;
  }
  function render(){
    var tbody=ui.qs('#comDestinatarios');
    if(!tbody)return;
    tbody.textContent='';
    candidatos.forEach(function(item){
      var tr=document.createElement('tr');
      var contacto=contactos(item),emails=contacto.emails,cedula=llave(item);
      var created=abiertosSesion.has(cedula);
      var detalle=contacto.institucional.map(function(e){return 'Institucional: '+e;})
        .concat(contacto.personal.filter(function(e){
          return contacto.institucional.indexOf(e)<0;
        }).map(function(e){return 'Personal: '+e;}));
      var columnas=[nombre(item)+' · '+cedula,
        texto(item.carrera||item.nombreCarrera||''),
        detalle.join(' | ')||'SIN CORREO',
        created?'Pestaña solicitada':!contacto.institucional.length?
          (emails.length?'Sin institucional (usa personal)':'Sin correo'):
          'Institucional incluido'];
      columnas.forEach(function(val){
        var td=document.createElement('td');td.textContent=val;tr.appendChild(td);
      });
      var action=document.createElement('td');
      if(emails.length)action.appendChild(linkOutlook(item));
      if(!contacto.institucional.length){
        var nuevo=document.createElement('button');
        nuevo.type='button';nuevo.className='btn btn--small btn--ghost';
        nuevo.textContent='Añadir institucional';
        nuevo.addEventListener('click',function(){
          var respuesta=window.prompt('Introduce el correo institucional de '+nombre(item)+':');
          if(respuesta===null)return;
          var mail=texto(respuesta).toLowerCase();
          if(!correoValido(mail)){
            window.alert('Correo institucional no válido.');return;
          }
          var key=llave(item);
          var previo=contactosImportados.get(key)||{};
          contactosImportados.set(key,Object.assign({},previo,{correoInstitucional:mail}));
          render();
        });
        action.appendChild(nuevo);
      }
      tr.appendChild(action);tbody.appendChild(tr);
    });
    resumen();
    var primero=elegibles()[0]||candidatos[0];
    var vista=ui.qs('#comVistaPrevia');
    if(vista && primero){
      vista.textContent='Para: '+(contactos(primero).emails.join('; ')||'Correo no disponible')+
        '\nAsunto: '+ASUNTO+'\n\n'+plantilla(primero,false);
    }else if(vista)vista.textContent='No hay recordatorios pendientes en la selección.';
  }
  function obtenerCandidatos(){
    // Usar la tabla actual y sus filtros: no solicitar Firebase por segunda vez.
    var modulo=window.TAAdminEstudiantes;
    var filas=modulo&&typeof modulo.obtenerFiltrados==='function'?modulo.obtenerFiltrados():null;
    if(!Array.isArray(filas)){
      mensaje('Abre primero la sección Estudiantes y carga el listado.','error');
      return Promise.resolve([]);
    }
    candidatos=calcularCandidatos(filas);
    render();
    return Promise.resolve(candidatos);
  }
  function abrirMasivo(){
    abrirModal();
    mensaje('Analizando los estudiantes visibles según los filtros de la tabla...','info');
    return obtenerCandidatos().then(function(){
      mensaje(candidatos.length+' estudiantes sin títulos en la selección. Indica cuántos borradores quieres abrir en Outlook.','success');
    });
  }
  function abrirLote(abrirVentana){
    // IMPORTANTÍSIMO: se ejecuta de forma síncrona desde el clic del usuario.
    // Los navegadores pueden bloquear la apertura de múltiples pestañas.
    var input=ui.qs('#comCantidad'),numero=Number(input&&input.value);
    if(!Number.isInteger(numero)||numero<1||numero>maxTanda){
      mensaje('Introduce una cantidad entera entre 1 y '+maxTanda+'.','error');
      return {abiertos:0,bloqueados:false};
    }
    var targets=elegibles().slice(0,numero);
    if(!targets.length){mensaje('No quedan estudiantes con correo pendientes de preparar.','info');return {abiertos:0,bloqueados:false};}
    var abiertos=0,bloqueados=false;
    targets.forEach(function(item){
      if(bloqueados)return;
      var url=enlaceOutlook(item);
      if(!url)return;
      var tab=abrirVentana(url,'_blank');
      if(!tab){bloqueados=true;return;}
      try{tab.opener=null;}catch(e){}
      abiertosSesion.add(llave(item));
      abiertos++;
    });
    render();
    if(bloqueados){
      mensaje('Se solicitaron '+abiertos+' de '+targets.length+' pestañas. El navegador bloqueó otras. '+
        'Permite ventanas emergentes para jeffer91.github.io o abre las pendientes una a una con «Abrir en Outlook».','warning');
    }else{
      mensaje('Se solicitaron '+abiertos+' pestañas de Outlook. Revisa cada borrador y pulsa Enviar. '+
        'No se han enviado correos desde esta aplicación.','success');
    }
    return {abiertos:abiertos,bloqueados:bloqueados};
  }
  function abrirTanda(){
    return abrirLote(function(url,target){return window.open(url,target);});
  }
  function reiniciarPendientes(){
    if(!window.confirm('¿Volver a incluir los borradores ya abiertos? Esto puede producir borradores duplicados en Outlook.'))return;
    abiertosSesion.clear();render();
    mensaje('Se restableció la lista de borradores pendientes, sin modificar correos ni registros de estudiantes.','info');
  }
  function iniciar(){
    var global=ui.qs('#btnCorreoMasivo');
    if(global)global.addEventListener('click',abrirMasivo);
    var close=ui.qs('#comCerrar');
    if(close)close.addEventListener('click',cerrarModal);
    var send=ui.qs('#comBtnPreparar');
    if(send)send.addEventListener('click',abrirTanda);
    var reset=ui.qs('#comBtnReiniciar');
    if(reset)reset.addEventListener('click',reiniciarPendientes);
    var input=ui.qs('#comCsvContactos');
    if(input)input.addEventListener('change',function(){
      importarCsv(this.files&&this.files[0]);this.value='';
    });
  }
  window.TAAdminComunicaciones=Object.freeze({
    iniciar:iniciar,abrirMasivo:abrirMasivo,abrirCorreo:abrirCorreo,abrirWhatsapp:abrirWhatsapp,
    contactos:contactos,telefonoEcuador:telefonoEcuador,sinTitulo:sinTitulo,plantilla:plantilla,
    enlaceOutlook:enlaceOutlook,calcularCandidatos:calcularCandidatos,
    abrirLote:abrirLote,parseCsvLine:parseCsvLine,obtenerCandidatos:obtenerCandidatos
  });
})();
