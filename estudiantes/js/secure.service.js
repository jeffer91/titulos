/* Transporte auténtico y aislado del módulo de estudiantes. */
(function(){
 'use strict';
 var settings=window.TA_ESTUDIANTES_SEGURIDAD||{};
 var auth=null,initPromise=null,ultimoExpediente=null;
 function activo(){return settings.habilitado===true;}
 function error(code,message){var err=new Error(message||code);err.codigo=code;return err;}
 function iniciar(){
   if(!activo())return Promise.resolve(false);
   if(initPromise)return initPromise;
   initPromise=new Promise(function(resolve,reject){
     if(window.firebase&&window.firebase.auth)return resolve();
     var tag=document.createElement('script');
     tag.src='https://www.gstatic.com/firebasejs/10.12.5/firebase-auth-compat.js';
     tag.onload=resolve;tag.onerror=function(){reject(error('AUTH_SDK_ERROR','No se pudo descargar Firebase Authentication.'));};
     document.head.appendChild(tag);
   }).then(function(){
     if(!window.firebase||!window.firebase.auth)throw error('AUTH_SDK_ERROR','Authentication no está disponible.');
     var app;
     try{app=window.firebase.app('ta-estudiante-autenticado');}
     catch(_){app=window.firebase.initializeApp(window.TA_ESTUDIANTES_FIREBASE_TITULOS_CONFIG,'ta-estudiante-autenticado');}
     auth=window.firebase.auth(app);
     return auth.setPersistence(window.firebase.auth.Auth.Persistence.SESSION);
   }).then(function(){
     var panel=document.getElementById('taLoginSeguro');
     if(panel)panel.hidden=false;
     var form=document.getElementById('taLoginForm');
     if(form&&!form.dataset.conectado){
       form.dataset.conectado='true';
       form.addEventListener('submit',function(ev){
         ev.preventDefault();
         var email=document.getElementById('taLoginCorreo');
         var password=document.getElementById('taLoginClave');
         var status=document.getElementById('taLoginEstado');
         if(status)status.textContent='Validando credenciales...';
         auth.signInWithEmailAndPassword(email.value.trim(),password.value).then(function(){
           password.value='';
           return mostrarEstado();
         }).catch(function(ex){
           password.value='';
           if(status)status.textContent='No se pudo iniciar sesión. Revisa tus credenciales.';
           console.error('[Estudiantes][AUTH]',ex.code||ex.message);
         });
       });
       var salir=document.getElementById('taLoginSalir');
       if(salir)salir.addEventListener('click',function(){
         ultimoExpediente=null;
         auth.signOut().then(mostrarEstado);
         window.location.reload();
       });
     }
     auth.onAuthStateChanged(function(){ultimoExpediente=null;mostrarEstado();});
     return mostrarEstado();
   });
   return initPromise;
 }
 function mostrarEstado(){
   if(!auth)return Promise.resolve(false);
   var login=document.getElementById('taLoginForm');
   var salir=document.getElementById('taLoginSalir');
   var estado=document.getElementById('taLoginEstado');
   var input=document.getElementById('cedulaInput');
   var user=auth.currentUser;
   if(login)login.hidden=!!user;
   if(salir)salir.hidden=!user;
   if(estado)estado.textContent=user?'Sesión verificada. Puedes consultar tus datos.':'Inicia sesión con tu cuenta institucional para consultar.';
   if(!user)return Promise.resolve(false);
   return user.getIdTokenResult().then(function(result){
     var cedula=String(result.claims&&result.claims.cedula||'');
     if(/^\d{10}$/.test(cedula)&&input){
       input.value=cedula;
       input.readOnly=true;
       input.title='Cédula verificada mediante la cuenta institucional.';
     }
     return true;
   });
 }
 function asegurarSesion(){
   return iniciar().then(function(){
     if(!auth||!auth.currentUser)throw error('SESION_REQUERIDA','Inicia sesión con tu cuenta institucional.');
     return auth.currentUser.getIdToken().then(function(token){
       if(!token)throw error('SESION_INVALIDA','Vuelve a iniciar sesión.');
       return token;
     });
   });
 }
 function llamar(ruta,options){
   options=options||{};
   var method=options.method||'GET';
   var qs=options.query?Object.keys(options.query).filter(function(k){return options.query[k]!==undefined&&options.query[k]!==null&&options.query[k]!=='';})
     .map(function(k){return encodeURIComponent(k)+'='+encodeURIComponent(options.query[k]);}).join('&'):'';
   return asegurarSesion().then(function(token){
     var controller=new AbortController();
     var timer=setTimeout(function(){controller.abort();},20000);
     return fetch(settings.apiBase.replace(/\/+$/,'')+'/'+ruta+(qs?'?'+qs:''),{
       method:method,
       mode:'cors',
       credentials:'omit',
       headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
       body:method==='POST'?JSON.stringify(options.body||{}):undefined,
       signal:controller.signal,
       cache:'no-store'
     }).then(function(resp){
       return resp.json().catch(function(){throw error('RESPUESTA_NO_JSON','El backend no devolvió una respuesta válida.');})
         .then(function(data){
           if(!resp.ok||data.ok===false)throw error(data.codigo||'API_ESTUDIANTE_ERROR',
             'Error de consulta ('+(data.codigo||resp.status)+'). Comunícate con Coordinación si persiste.');
           return data.data;
         });
     }).catch(function(ex){
       if(ex.name==='AbortError')throw error('API_TIMEOUT','El backend tardó demasiado.');
       throw ex;
     }).finally(function(){clearTimeout(timer);});
   });
 }
 function expediente(query){
   query=query||{};
   var key=String(query.cedula||'')+'|'+String(query.periodoId||'');
   if(ultimoExpediente&&ultimoExpediente.key===key&&Date.now()-ultimoExpediente.at<12000)
     return Promise.resolve(ultimoExpediente.data);
   return llamar('expediente',{query:query}).then(function(data){
     ultimoExpediente={key:key,data:data,at:Date.now()};
     return data;
   });
 }
 function enviar(payload){
   return llamar('envio',{method:'POST',body:payload}).then(function(result){ultimoExpediente=null;return {ok:true,id:result.id,data:result.data,mensaje:result.mensaje};});
 }
 function historial(periodoId){return llamar('historial',{query:{periodoId:periodoId}});}
 function configuracion(){return llamar('configuracion');}
 function proveedores(){return llamar('proveedores');}
 function ia(prompt){return llamar('ia',{method:'POST',body:{prompt:prompt}}).then(function(result){return result.texto;});}
 window.TAEstudianteSeguro=Object.freeze({
   activo:activo,iniciar:iniciar,asegurarSesion:asegurarSesion,
   expediente:expediente,enviar:enviar,historial:historial,configuracion:configuracion,
   proveedores:proveedores,ia:ia
 });
})();
