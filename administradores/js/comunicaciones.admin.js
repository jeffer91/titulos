/* Comunicaciones académicas desde Administración.
 * Los envíos reales requieren OAuth explícito a Gmail y un PDF seleccionado por el operador.
 * No contiene credenciales ni transmite teléfonos o correos a servicios distintos de sus destinatarios.
 */
(function(){
  'use strict';
  var repo=window.TAAdministradorRepository,ui=window.TAAdminUI;
  var token='',tokenHasta=0,oauthClient=null,archivoGuia=null;
  var candidatos=[],seleccionados=[],enviadosSesion=new Set(),cancelar=false,procesando=false;
  var API='https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
  var TIPO='application/pdf';
  var ASUNTO='ITSQMET | Envío pendiente de títulos de titulación';
  var TITULOS_URL='https://jeffer91.github.io/titulos/estudiantes/';
  function texto(v){return String(v===undefined||v===null?'':v).replace(/\s+/g,' ').trim();}
  function correoValido(s){return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(s);}
  function escape(s){return ui.escapeHtml?ui.escapeHtml(s):texto(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');}
  function contactos(item){
    var campos=[item||{},item&&item.raw||{},item&&item.titulo||{}];
    var personal=['correoPersonal','emailPersonal','correoElectronico','correo','email','mail','CorreoPersonal','Email','EMAIL','Correo','CORREO'];
    var institucional=['correoInstitucional','emailInstitucional','correoEstudiantil','mailInstitucional','CorreoInstitucional','EmailInstitucional','correoITSQMET'];
    var celulares=['celular','telefonoCelular','numeroCelular','telefonoMovil','movil','whatsapp','WhatsApp','CELULAR','Celular','telefono','Telefono','telefonoContacto'];
    var emails=[],telefonos=[];
    campos.forEach(function(c){
      personal.concat(institucional).forEach(function(k){
        var v=texto(c[k]).toLowerCase();
        if(correoValido(v)&&emails.indexOf(v)<0)emails.push(v);
      });
      celulares.forEach(function(k){var v=texto(c[k]);if(v&&!telefonos.includes(v))telefonos.push(v);});
    });
    return {emails:emails,telefono:telefonos[0]||''};
  }
  function telefonoEcuador(raw){
    var v=texto(raw).replace(/[^\d+]/g,'');
    if(v.startsWith('+'))v=v.substring(1);
    if(/^09\d{8}$/.test(v))return '593'+v.substring(1);
    if(/^9\d{8}$/.test(v))return '593'+v;
    if(/^5939\d{8}$/.test(v))return v;
    if(/^00\d{11,15}$/.test(v))return v.substring(2);
    if(/^\d{10,15}$/.test(v) && !/^0/.test(v))return v;
    return '';
  }
  function nombre(item){return texto(item&&item.nombres||item&&item.nombre||'estudiante');}
  function sinTitulo(item){
    if(!item)return false;
    var t=item.titulo;
    var g=texto(t&&(t.estadoProceso||t.estado)).toUpperCase();
    if(g==='ARCHIVADO'||g==='BORRADOR_REINICIADO')return true;
    return !t||!Array.isArray(item.titulosEnviados)||item.titulosEnviados.length===0;
  }
  function plantilla(item,whatsapp){
    var saludo='Estimado/a '+nombre(item)+':';
    var carrera=texto(item.carrera||item.nombreCarrera||'');
    var periodo=texto(item.periodoLabel||item.periodoId||'');
    var intro=sinTitulo(item)?
      'Al revisar su expediente de titulación, verificamos que todavía no registra el envío de sus propuestas de títulos.':
      'Le escribimos desde la Unidad de Titulación y Eficiencia Terminal para solicitarle que consulte el estado actual de sus propuestas de títulos.';
    var partes=[saludo,'',intro,'',
      'Carrera: '+(carrera||'Por confirmar'),'Período académico: '+(periodo||'Por confirmar'),'',
      'Le solicitamos ingresar al sistema institucional y remitir las tres propuestas de títulos para iniciar su revisión.',
      'Enlace de estudiantes: '+TITULOS_URL,'',
      'Para formular los títulos, tenga en cuenta la Guía institucional para la formulación y aprobación de títulos de titulación:',
      '• Una sola acción principal y un objeto de estudio claramente identificado.',
      '• Delimitar la población y el contexto cuando corresponda.',
      '• Indicar las fechas de inicio y fin si el estudio depende del tiempo.',
      '• Evitar títulos que anticipen resultados o impliquen dos trabajos independientes.',''];
    partes.push(whatsapp?'Solicite la guía en PDF a la Unidad si todavía no la tiene.':
      'En este recordatorio se solicita adjuntar la guía institucional de títulos, versión 1.0, octubre de 2026.');
    partes.push('','Atentamente,','Unidad de Titulación y Eficiencia Terminal','ITSQMET');
    return partes.join('\n');
  }
  function abrirWhatsapp(item){
    var phone=telefonoEcuador(contactos(item).telefono);
    if(!phone){alert('El estudiante no tiene un número de WhatsApp válido registrado.');return false;}
    var msg=encodeURIComponent(plantilla(item,true));
    // Chrome/Windows puede preguntar si se abre la aplicación instalada.
    var anchor=document.createElement('a');
    anchor.href='whatsapp://send?phone='+phone+'&text='+msg;
    anchor.target='_blank';anchor.rel='noopener noreferrer';
    document.body.appendChild(anchor);anchor.click();anchor.remove();
    var fallback=ui.qs('#comWhatsFallback');
    if(fallback){fallback.href='https://wa.me/'+phone+'?text='+msg;fallback.hidden=false;}
    return true;
  }
  function abrirCorreo(item){
    var emails=contactos(item).emails;
    if(!emails.length){alert('El estudiante no tiene correo electrónico registrado.');return false;}
    var mailto='mailto:'+emails.map(encodeURIComponent).join(',')+
      '?subject='+encodeURIComponent(ASUNTO)+'&body='+encodeURIComponent(plantilla(item,false));
    // mailto: abre un borrador editable: el navegador NO adjunta archivos automáticamente.
    window.location.href=mailto;
    return true;
  }
  function mensaje(s,tipo){
    var node=ui.qs('#comMensaje');
    if(node){node.textContent=s||'';node.className='status-message'+(tipo?' is-'+tipo:'');}
  }
  function modal(){return ui.qs('#modalComunicaciones');}
  function ocultar(){
    if(procesando){mensaje('Detén primero el envío en curso.','warning');return;}
    var m=modal();if(m){m.classList.add('is-hidden');m.setAttribute('aria-hidden','true');}
  }
  function mostrar(){
    var m=modal();if(m){m.classList.remove('is-hidden');m.setAttribute('aria-hidden','false');}
  }
  function render(){
    var tbody=ui.qs('#comDestinatarios');if(!tbody)return;
    tbody.textContent='';
    var totalSinCorreo=0, totalElegidos=0;
    candidatos.forEach(function(c,i){
      var emails=contactos(c).emails;
      if(!emails.length)totalSinCorreo++;
      var permitido=emails.length>0&&!enviadosSesion.has(c.cedula+'__'+c.periodoId);
      var tr=document.createElement('tr');
      var td=document.createElement('td'),cb=document.createElement('input');
      cb.type='checkbox';cb.className='com-check';cb.dataset.index=String(i);
      cb.checked=permitido && seleccionados.includes(i);cb.disabled=!permitido;
      cb.addEventListener('change',function(){
        if(cb.checked&&!seleccionados.includes(i))seleccionados.push(i);
        else seleccionados=seleccionados.filter(function(n){return n!==i;});
        actualizarResumen();
      });
      td.appendChild(cb);tr.appendChild(td);
      var n=document.createElement('td');n.textContent=nombre(c)+' ('+texto(c.cedula)+')';tr.appendChild(n);
      var d=document.createElement('td');d.textContent=texto(c.carrera||c.nombreCarrera);tr.appendChild(d);
      var e=document.createElement('td');e.textContent=emails.join(' / ')||'SIN CORREO';tr.appendChild(e);
      var status=document.createElement('td');
      status.textContent=enviadosSesion.has(c.cedula+'__'+c.periodoId)?'Enviado en esta sesión':
        (permitido?'Pendiente':'Sin correo');tr.appendChild(status);
      tbody.appendChild(tr);
      if(cb.checked)totalElegidos++;
    });
    actualizarResumen();
    ui.setText('#comSinContacto',String(totalSinCorreo));
  }
  function actualizarResumen(){
    var cuantos=seleccionados.filter(function(i){
      var c=candidatos[i];return c&&contactos(c).emails.length&&!enviadosSesion.has(c.cedula+'__'+c.periodoId);
    }).length;
    ui.setText('#comSeleccionados',String(cuantos));
    ui.setText('#comTotal',String(candidatos.length));
  }
  function obtenerCandidatos(){
    var p=ui.value('#comPeriodo');
    return Promise.all([repo.listarEstudiantesConTitulos(''),repo.listarPeriodos()]).then(function(results){
      var rows=results[0]||[],periodos=results[1]||[];
      var activos=new Set(periodos.filter(function(x){return x.activo;}).map(function(x){return String(x.id);}));
      candidatos=rows.filter(function(item){
        return sinTitulo(item)&& (p==='__ACTIVOS__'?activos.has(String(item.periodoId)):String(item.periodoId)===p);
      });
      // deduplicación de matrícula y periodo; no se enviarán dos veces por cédula.
      var set=new Set();candidatos=candidatos.filter(function(c){
        var clave=texto(c.cedula)+'__'+texto(c.periodoId);
        if(!c.cedula||set.has(clave))return false;
        set.add(clave);return true;
      });
      candidatos.sort(function(a,b){return nombre(a).localeCompare(nombre(b),'es');});
      seleccionados=candidatos.map(function(c,i){
        return contactos(c).emails.length&&!enviadosSesion.has(c.cedula+'__'+c.periodoId)?i:-1;
      }).filter(function(i){return i>=0;});
      render();
    });
  }
  function abrirMasivo(){
    if(procesando)return;
    mostrar();mensaje('Preparando el listado sin realizar nuevas lecturas si los datos siguen en memoria.','info');
    return repo.listarPeriodos().then(function(lista){
      var select=ui.qs('#comPeriodo');if(!select)return;
      select.textContent='';
      var option=document.createElement('option');option.value='__ACTIVOS__';option.textContent='Todos los períodos activos';select.appendChild(option);
      (lista||[]).filter(function(p){return p.activo;}).forEach(function(p){
        var o=document.createElement('option');o.value=p.id;o.textContent=p.label;select.appendChild(o);
      });
      return obtenerCandidatos();
    }).then(function(){mensaje('Revisa los destinatarios, conecta Gmail y selecciona la guía PDF antes de enviar.','info');})
      .catch(function(e){mensaje('No se pudo preparar la lista: '+e.message,'error');});
  }
  function scriptGis(){
    if(window.google&&window.google.accounts&&window.google.accounts.oauth2)return Promise.resolve(true);
    return new Promise(function(resolve,reject){
      var existing=document.querySelector('#comGoogleIdentity');
      if(existing){existing.addEventListener('load',function(){resolve(true);},{once:true});
        existing.addEventListener('error',reject,{once:true});return;}
      var script=document.createElement('script');script.id='comGoogleIdentity';
      script.src='https://accounts.google.com/gsi/client';script.async=true;script.defer=true;
      script.onload=function(){resolve(true);};script.onerror=function(){reject(new Error('Google Identity no disponible.'));};
      document.head.appendChild(script);
    });
  }
  function conectarGmail(){
    var id=texto(ui.value('#comGoogleClientId'));
    if(!/^[\w-]+\.apps\.googleusercontent\.com$/.test(id)){
      mensaje('Introduce el OAuth Client ID de tipo Web configurado para https://jeffer91.github.io.','error');return;
    }
    // El client ID es identificador público. El token nunca se guarda.
    try{sessionStorage.setItem('itsqmet.gmail.clientId',id);}catch(e){}
    mensaje('Autorizando el envío en tu propia cuenta de Gmail…','info');
    scriptGis().then(function(){
      return new Promise(function(resolve,reject){
        oauthClient=window.google.accounts.oauth2.initTokenClient({
          client_id:id,scope:'https://www.googleapis.com/auth/gmail.send',
          callback:function(resp){
            if(!resp||resp.error||!resp.access_token){reject(new Error(resp&&resp.error||'Gmail no concedió acceso.'));return;}
            token=resp.access_token;tokenHasta=Date.now()+Number(resp.expires_in||3000)*1000;
            resolve(true);
          },
          error_callback:function(resp){reject(new Error(resp&&resp.type||'No se pudo conectar Gmail.'));}
        });
        oauthClient.requestAccessToken({prompt:'consent'});
      });
    }).then(function(){
      ui.setText('#comGmailEstado','Gmail conectado (solo permiso de envío)');
      mensaje('Cuenta de Gmail conectada. El envío requiere todavía una confirmación explícita.','success');
    }).catch(function(e){mensaje('Gmail no conectado: '+e.message,'error');});
  }
  function b64bytes(buffer){
    var data=new Uint8Array(buffer),pieces=[],paso=8192;
    for(var i=0;i<data.length;i+=paso){
      var slice=data.subarray(i,i+paso),str='';
      for(var j=0;j<slice.length;j++)str+=String.fromCharCode(slice[j]);
      pieces.push(str);
    }
    return btoa(pieces.join(''));
  }
  function b64utf8(s){return b64bytes(new TextEncoder().encode(s).buffer);}
  function b64url(s){return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
  function normalizarLineas64(s){return s.match(/.{1,76}/g).join('\r\n');}
  function mime(item,pdf,filename){
    var emails=contactos(item).emails;
    var nombreArchivo=filename.replace(/[^\w.()-]/g,'_')||'Guia_titulos_ITSQMET.pdf';
    var boundary='=_itsqmet_'+Date.now()+'_'+Math.floor(Math.random()*999999);
    var body=plantilla(item,false).replace('En este recordatorio se solicita adjuntar la guía institucional de títulos, versión 1.0, octubre de 2026.','Se adjunta la Guía institucional para la formulación y aprobación de títulos de titulación (versión 1.0, octubre de 2026).');
    var parts=[
      'To: '+emails.join(', '),
      'Subject: =?UTF-8?B?'+b64utf8(ASUNTO)+'?=',
      'MIME-Version: 1.0',
      'Content-Type: multipart/mixed; boundary="'+boundary+'"','',
      '--'+boundary,
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: base64','',
      normalizarLineas64(b64utf8(body)),
      '--'+boundary,
      'Content-Type: '+TIPO+'; name="'+nombreArchivo+'"',
      'Content-Disposition: attachment; filename="'+nombreArchivo+'"',
      'Content-Transfer-Encoding: base64','',
      normalizarLineas64(pdf),
      '--'+boundary+'--',''
    ];
    return b64url(unescape(encodeURIComponent(parts.join('\r\n'))));
  }
  function confirmarEnvio(){
    if(procesando)return;
    var file=archivoGuia;
    var items=seleccionados.map(function(i){return candidatos[i];}).filter(function(c){
      return c&&contactos(c).emails.length&&!enviadosSesion.has(c.cedula+'__'+c.periodoId);
    });
    if(!items.length){mensaje('Selecciona al menos un estudiante con correo válido.','warning');return;}
    if(!file||file.type!==TIPO||file.size>8*1024*1024){
      mensaje('Selecciona la guía institucional original en formato PDF (máximo 8 MB).','error');return;}
    if(!token||Date.now()>tokenHasta-45000){mensaje('Conecta Gmail o renueva la autorización antes de enviar.','error');return;}
    var detalle=items.length+' correo(s) personalizado(s), cada uno con el PDF adjunto. No se incluirán estudiantes que ya tengan títulos enviados.';
    if(!window.confirm('CONFIRMAR ENVÍO REAL\n\n'+detalle+'\n\n¿Enviar ahora desde tu Gmail a estos destinatarios?'))return;
    enviarTodos(items,file);
  }
  async function enviarTodos(items,file){
    procesando=true;cancelar=false;
    var btn=ui.qs('#comBtnEnviar');if(btn)btn.disabled=true;
    var buf=await file.arrayBuffer();var pdf=b64bytes(buf),hechos=0,errores=0;
    for(var i=0;i<items.length;i++){
      if(cancelar)break;
      var item=items[i],clave=texto(item.cedula)+'__'+texto(item.periodoId);
      try{
        if(Date.now()>tokenHasta-45000)throw new Error('La autorización de Gmail caducó.');
        mensaje('Enviando '+(i+1)+' de '+items.length+' a '+nombre(item)+'…','info');
        var respuesta=await fetch(API,{
          method:'POST',
          headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
          body:JSON.stringify({raw:mime(item,pdf,file.name)})
        });
        if(!respuesta.ok){
          var err=await respuesta.json().catch(function(){return {};});
          throw new Error(err.error&&err.error.message||'Error de Gmail '+respuesta.status);
        }
        enviadosSesion.add(clave);hechos++;
      }catch(e){
        errores++;
        mensaje('Error al enviar a '+nombre(item)+': '+e.message+' (se detuvo la tanda).','error');
        cancelar=true;
      }
      if((i+1)%5===0||cancelar||i===items.length-1)render();
      if(!cancelar)await new Promise(function(resolve){setTimeout(resolve,550);});
    }
    procesando=false;if(btn)btn.disabled=false;render();
    mensaje('Enviados: '+hechos+'. Errores: '+errores+(cancelar?'. Tanda detenida.':' . Tanda finalizada.')+
      ' Los enviados en esta sesión no se volverán a seleccionar.','success');
    // Nunca conservar el token fuera de memoria ni el contenido de PDF en almacenamiento.
  }
  function iniciar(){
    var btn=ui.qs('#btnCorreoMasivo');
    if(btn)btn.addEventListener('click',abrirMasivo);
    var close=ui.qs('#comCerrar');if(close)close.addEventListener('click',ocultar);
    var pv=ui.qs('#comPeriodo');if(pv)pv.addEventListener('change',obtenerCandidatos);
    var conect=ui.qs('#comBtnGmail');if(conect)conect.addEventListener('click',conectarGmail);
    var send=ui.qs('#comBtnEnviar');if(send)send.addEventListener('click',confirmarEnvio);
    var stop=ui.qs('#comBtnDetener');if(stop)stop.addEventListener('click',function(){cancelar=true;});
    var pdf=ui.qs('#comPdf');if(pdf)pdf.addEventListener('change',function(){
      archivoGuia=this.files&&this.files[0]||null;
      ui.setText('#comPdfInfo',archivoGuia?archivoGuia.name+' ('+Math.ceil(archivoGuia.size/1024)+' KB)':'Sin guía seleccionada');
    });
    try{var saved=sessionStorage.getItem('itsqmet.gmail.clientId');if(saved)ui.setValue('#comGoogleClientId',saved);}catch(e){}
  }
  window.TAAdminComunicaciones=Object.freeze({
    iniciar:iniciar,abrirMasivo:abrirMasivo,abrirCorreo:abrirCorreo,abrirWhatsapp:abrirWhatsapp,
    contactos:contactos,telefonoEcuador:telefonoEcuador,sinTitulo:sinTitulo,plantilla:plantilla,
    obtenerCandidatos:obtenerCandidatos
  });
})();
