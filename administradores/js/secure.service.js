/* Transporte administrativo. No almacena claves de IA ni permite Firebase directo. */
(function(){
 'use strict';
 var cfg=window.TA_ADMIN_SEGURIDAD||{},auth=null,starting=null;
 function activo(){return cfg.habilitado===true;}
 function failure(code,msg){var e=new Error(msg||code);e.codigo=code;return e;}
 function load(src){
  return new Promise(function(ok,fail){
   var tag=document.createElement('script');
   tag.src=src;tag.async=false;tag.onload=ok;
   tag.onerror=function(){fail(failure('AUTH_SDK_NO_DISPONIBLE','No se pudo cargar Firebase Authentication.'));};
   document.head.appendChild(tag);
  });
 }
 function iniciar(){
  if(!activo())return Promise.resolve(false);
  if(starting)return starting;
  document.body.classList.add('admin-auth-pending','admin-modo-seguro');
  var panel=document.getElementById('adminLoginSeguro');if(panel)panel.hidden=false;
  starting=(window.firebase&&window.firebase.initializeApp?Promise.resolve():
    load('https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js'))
   .then(function(){
    if(window.firebase&&window.firebase.auth)return true;
    return load('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth-compat.js');
   }).then(function(){
    if(!window.firebase||!window.firebase.auth)throw failure('AUTH_SDK_INVALIDO','No se ha cargado Firebase Authentication.');
    var app;
    try{app=window.firebase.app('ta-administracion-segura');}
    catch(_){app=window.firebase.initializeApp(window.TA_ADMIN_FIREBASE_CONFIG,'ta-administracion-segura');}
    auth=window.firebase.auth(app);
    return auth.setPersistence(window.firebase.auth.Auth.Persistence.SESSION);
   }).then(function(){
    var form=document.getElementById('adminLoginSeguroForm');
    if(form&&!form.dataset.linked){
     form.dataset.linked='1';
     form.addEventListener('submit',function(ev){
      ev.preventDefault();
      var email=document.getElementById('adminLoginCorreo');
      var pass=document.getElementById('adminLoginClave');
      var msg=document.getElementById('adminLoginMensaje');
      if(msg)msg.textContent='Verificando credenciales...';
      auth.signInWithEmailAndPassword(email.value.trim(),pass.value).then(function(){
       pass.value='';window.location.reload();
      }).catch(function(err){
       pass.value='';
       if(msg)msg.textContent='No se pudo autenticar esta cuenta.';
       console.error('[Administrador][AUTH]',err.code||err.message);
      });
     });
     var logout=document.getElementById('adminSalirSeguro');
     if(logout)logout.addEventListener('click',function(){auth.signOut().then(function(){window.location.reload();});});
    }
    return new Promise(function(resolve){
     var unsub=auth.onAuthStateChanged(function(user){
      unsub();
      var form=document.getElementById('adminLoginSeguroForm');
      var logout=document.getElementById('adminSalirSeguro');
      var msg=document.getElementById('adminLoginMensaje');
      if(form)form.hidden=Boolean(user);
      if(logout)logout.hidden=!user;
      if(msg)msg.textContent=user?'Sesión autenticada. Validando rol de Administración.':'Ingresa con tu cuenta autorizada.';
      resolve(Boolean(user));
     },function(){resolve(false);});
    });
   });
  return starting;
 }
 function token(){
  return iniciar().then(function(){
   if(!auth||!auth.currentUser)throw failure('SESION_REQUERIDA','Inicia sesión con tu cuenta de Administración.');
   return auth.currentUser.getIdToken();
  });
 }
 function call(path,opts){
  opts=opts||{};
  return token().then(function(idToken){
   var controller=new AbortController(),timer=setTimeout(function(){controller.abort();},20000);
   return fetch(cfg.apiBase.replace(/\/+$/,'')+'/'+path,{
    method:opts.method||'GET',mode:'cors',credentials:'omit',cache:'no-store',
    headers:{Authorization:'Bearer '+idToken,'Content-Type':'application/json'},
    body:opts.method==='POST'?JSON.stringify(opts.body||{}):undefined,signal:controller.signal
   }).then(function(resp){
    return resp.json().then(function(payload){
     if(!resp.ok||payload.ok===false)throw failure(payload.codigo||'ADMIN_API_ERROR',
       'Operación administrativa rechazada ('+(payload.codigo||resp.status)+').');
     return payload.data;
    });
   }).catch(function(e){
    if(e.name==='AbortError')throw failure('ADMIN_API_TIMEOUT','Tiempo de espera de la API agotado.');
    throw e;
   }).finally(function(){clearTimeout(timer);});
  });
 }
 function noMigrado(nombre){
  return Promise.reject(failure('OPERACION_NO_MIGRADA','La operación '+nombre+' necesita autorización adicional del backend (bloque 6).'));
 }
 window.TAAdministradorSeguro=Object.freeze({
  activo:activo,iniciar:iniciar,llamar:call,noMigrado:noMigrado,
  sesion:function(){return token().then(function(){return call('sesion');});},
  config:function(){return call('configuracion');},
  estudiantes:function(){return call('estudiantes');},
  envios:function(){return call('envios');},
  archivar:function(id,motivo){return call('envios/archivar',{method:'POST',body:{tituloId:id,motivo:motivo}});},
  guardarConfig:function(data){return call('configuracion/guardar',{method:'POST',body:data});},
  coordinadores:function(){return call('coordinadores');},
  crearCoordinador:function(data){return call('coordinadores/crear',{method:'POST',body:data});},
  coordinadorEstado:function(data){return call('coordinadores/estado',{method:'POST',body:data});},
  coordinadorCarrera:function(data){return call('coordinadores/carrera',{method:'POST',body:data});},
  investigadores:function(){return call('investigadores');},
  crearInvestigador:function(data){return call('investigadores/crear',{method:'POST',body:data});},
  investigadorEstado:function(data){return call('investigadores/estado',{method:'POST',body:data});},
  investigadorCarrera:function(data){return call('investigadores/carrera',{method:'POST',body:data});},
  carreras:function(){return call('carreras');},
  proveedores:function(){return call('proveedores');},
  asignarRol:function(data){return call('usuarios/rol',{method:'POST',body:data});}
 });
})();
