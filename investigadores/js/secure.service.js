/* Transporte seguro: sólo el token Firebase Auth identifica al investigador. */
(function(){
 'use strict';
 var cfg=window.TA_INVESTIGADORES_SEGURIDAD||{},auth=null,iniciando=null;
 function activo(){return cfg.habilitado===true;}
 function fallo(codigo,mensaje){var e=new Error(mensaje||codigo);e.codigo=codigo;return e;}
 function sdk(src){
  if(window.firebase&&window.firebase.auth)return Promise.resolve();
  return new Promise(function(resolve,reject){
   var el=document.createElement('script');
   el.src=src;el.async=false;el.onload=resolve;
   el.onerror=function(){reject(fallo('FIREBASE_AUTH_NO_DISPONIBLE','No se pudo cargar el SDK de acceso institucional.'));};
   document.head.appendChild(el);
  });
 }
 function iniciar(){
  if(!activo())return Promise.resolve(false);
  if(iniciando)return iniciando;
  document.body.classList.add('investigador-seguro');
  var login=document.getElementById('investigadorLoginSeguro');
  if(login)login.hidden=false;
  iniciando=(window.firebase&&window.firebase.initializeApp?Promise.resolve():
    sdk('https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js'))
   .then(function(){
    if(window.firebase&&window.firebase.auth)return true;
    return sdk('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth-compat.js');
   }).then(function(){
    if(!window.firebase||!window.firebase.auth)throw fallo('AUTH_SDK_INCOMPLETO','Firebase Authentication no está disponible.');
    var app;
    try{app=window.firebase.app('ta-investigadores-auth');}
    catch(_){app=window.firebase.initializeApp(window.TA_INVESTIGADORES_FIREBASE_CONFIG,'ta-investigadores-auth');}
    auth=window.firebase.auth(app);
    return auth.setPersistence(window.firebase.auth.Auth.Persistence.SESSION);
   }).then(function(){
    var form=document.getElementById('investigadorLoginSeguroForm');
    if(form&&!form.dataset.conectado){
     form.dataset.conectado='true';
     form.addEventListener('submit',function(event){
      event.preventDefault();
      var correo=document.getElementById('investigadorLoginCorreo');
      var clave=document.getElementById('investigadorLoginClave');
      var estado=document.getElementById('investigadorLoginEstado');
      if(estado)estado.textContent='Verificando credenciales...';
      auth.signInWithEmailAndPassword(correo.value.trim(),clave.value).then(function(){
       clave.value='';
       window.location.reload();
      }).catch(function(e){
       clave.value='';
       if(estado)estado.textContent='No se pudo ingresar. Comprueba tu cuenta institucional.';
       console.error('[Investigadores][Auth]',e.code||e.message);
      });
     });
    }
    return new Promise(function(resolve){
     var off=auth.onAuthStateChanged(function(user){
      off();
      var form=document.getElementById('investigadorLoginSeguroForm');
      var status=document.getElementById('investigadorLoginEstado');
      if(form)form.hidden=!!user;
      if(status)status.textContent=user?'Sesión autenticada: comprobando asignación de carreras.':'Ingresa con tu cuenta institucional autorizada.';
      resolve(Boolean(user));
     },function(){resolve(false);});
    });
   });
  return iniciando;
 }
 function token(){
  return iniciar().then(function(){
   if(!auth||!auth.currentUser)throw fallo('SESION_REQUERIDA','Inicia sesión con tu cuenta institucional.');
   return auth.currentUser.getIdToken();
  });
 }
 function llamar(ruta,opciones){
  opciones=opciones||{};
  return token().then(function(idToken){
   var controlador=new AbortController(),timer=setTimeout(function(){controlador.abort();},20000);
   return fetch(cfg.apiBase.replace(/\/+$/,'')+'/'+ruta,{
    method:opciones.method||'GET',mode:'cors',credentials:'omit',cache:'no-store',
    headers:{Authorization:'Bearer '+idToken,'Content-Type':'application/json'},
    body:opciones.method==='POST'?JSON.stringify(opciones.body||{}):undefined,
    signal:controlador.signal
   }).then(function(res){
    return res.json().then(function(data){
     if(!res.ok||data.ok===false)throw fallo(data.codigo||'API_INVESTIGACION_ERROR',
      'El servidor rechazó la operación ('+(data.codigo||res.status)+').');
     return data.data;
    });
   }).catch(function(e){
    if(e.name==='AbortError')throw fallo('API_TIMEOUT','La consulta segura tardó demasiado.');
    throw e;
   }).finally(function(){clearTimeout(timer);});
  });
 }
 function cerrarSesion(){
  if(!auth)return Promise.resolve();
  return auth.signOut().then(function(){window.location.reload();});
 }
 window.TAInvestigadorSeguro=Object.freeze({
  activo:activo,iniciar:iniciar,cerrarSesion:cerrarSesion,
  perfil:function(){return llamar('perfil');},
  cola:function(){return llamar('cola');},
  revisados:function(){return llamar('revisados');},
  revisar:function(data){return llamar('revision',{method:'POST',body:data});}
 });
})();
