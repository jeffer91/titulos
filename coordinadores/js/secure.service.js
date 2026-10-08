/* Acceso aislado de Coordinadores: Firebase Auth + API verificada en servidor. */
(function(){
 'use strict';
 var cfg=window.TA_COORDINADORES_SEGURIDAD||{},auth=null,inicializando=null;
 function activo(){return cfg.habilitado===true;}
 function error(codigo,mensaje){var e=new Error(mensaje||codigo);e.codigo=codigo;return e;}
 function cargar(src,id,verificar) {
  if(verificar())return Promise.resolve(true);
  return new Promise(function(resolve,reject){
   var s=document.createElement('script');s.src=src;s.id=id;s.async=false;
   s.onload=function(){if(!verificar())reject(error('SDK_INCOMPLETO','No se cargó Firebase Authentication.'));else resolve(true);};
   s.onerror=function(){reject(error('SDK_NO_DISPONIBLE','No se pudo cargar Firebase Authentication.'));};
   document.head.appendChild(s);
  });
 }
 function iniciar(){
  if(!activo())return Promise.resolve(false);
  if(inicializando)return inicializando;
  document.body.classList.add('coord-secure-pending');
  inicializando=cargar('https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js','coord-firebase-app',
    function(){return Boolean(window.firebase&&window.firebase.initializeApp);})
    .then(function(){
     return cargar('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth-compat.js','coord-firebase-auth',
      function(){return Boolean(window.firebase&&window.firebase.auth);});
    }).then(function(){
      var app;
      try{app=window.firebase.app('ta-coordinadores-auth');}
      catch(_){app=window.firebase.initializeApp(window.TA_COORDINADORES_FIREBASE_CONFIG,'ta-coordinadores-auth');}
      auth=window.firebase.auth(app);
      return auth.setPersistence(window.firebase.auth.Auth.Persistence.SESSION);
    }).then(function(){
      var panel=document.getElementById('coordLoginSeguro');
      if(panel)panel.hidden=false;
      var form=document.getElementById('coordLoginForm');
      if(form&&!form.dataset.conectado){
        form.dataset.conectado='true';
        form.addEventListener('submit',function(ev){
          ev.preventDefault();
          var email=document.getElementById('coordLoginEmail'),pin=document.getElementById('coordLoginPassword');
          var estado=document.getElementById('coordLoginMensaje');
          if(estado)estado.textContent='Verificando credenciales...';
          auth.signInWithEmailAndPassword(email.value.trim(),pin.value).then(function(){
            pin.value='';
            window.location.reload();
          }).catch(function(e){
            pin.value='';
            if(estado)estado.textContent='No fue posible ingresar. Revisa tus credenciales.';
            console.error('[Coordinadores][AUTH]',e.code||e.message);
          });
        });
        var salir=document.getElementById('coordLoginSalir');
        if(salir)salir.addEventListener('click',function(){auth.signOut().then(function(){window.location.reload();});});
      }
      return new Promise(function(resolve){
        var stop=auth.onAuthStateChanged(function(user){
          stop();
          var login=document.getElementById('coordLoginForm');
          var logout=document.getElementById('coordLoginSalir');
          var estado=document.getElementById('coordLoginMensaje');
          if(login)login.hidden=!!user;
          if(logout)logout.hidden=!user;
          if(estado)estado.textContent=user?'Sesión iniciada. Acceso sujeto a carreras asignadas.':'Ingresa con la cuenta institucional autorizada.';
          if(user)document.body.classList.remove('coord-secure-pending');
          resolve(Boolean(user));
        },function(){resolve(false);});
      });
    });
  return inicializando;
 }
 function sesion(){
  return iniciar().then(function(){
    if(!auth||!auth.currentUser)throw error('SESION_REQUERIDA','Inicia sesión con tu cuenta institucional.');
    return auth.currentUser.getIdToken().then(function(token){
      if(!token)throw error('SESION_INVALIDA','La sesión no está disponible.');
      return token;
    });
  });
 }
 function llamar(ruta,opciones){
  opciones=opciones||{};
  var method=opciones.method||'GET';
  var qs=Object.keys(opciones.query||{}).filter(function(k){return opciones.query[k]!==undefined&&opciones.query[k]!=='';})
    .map(function(k){return encodeURIComponent(k)+'='+encodeURIComponent(opciones.query[k]);}).join('&');
  return sesion().then(function(token){
    var controller=new AbortController(),timer=setTimeout(function(){controller.abort();},20000);
    return fetch(cfg.apiBase.replace(/\/+$/,'')+'/'+ruta+(qs?'?'+qs:''),{
      method:method,mode:'cors',credentials:'omit',cache:'no-store',
      headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
      body:method==='POST'?JSON.stringify(opciones.body||{}):undefined,signal:controller.signal
    }).then(function(response){
      return response.json().then(function(data){
        if(!response.ok||data.ok===false)throw error(data.codigo||'API_COORDINADORES_ERROR',
          'Operación rechazada por el servidor ('+(data.codigo||response.status)+').');
        return data.data;
      });
    }).catch(function(e){
      if(e.name==='AbortError')throw error('API_TIMEOUT','La consulta segura tardó demasiado.');
      throw e;
    }).finally(function(){clearTimeout(timer);});
  });
 }
 window.TACoordinadorSeguro=Object.freeze({
  activo:activo,iniciar:iniciar,sesion:sesion,
  perfil:function(){return llamar('perfil');},
  listar:function(){return llamar('titulos');},
  historial:function(tituloId){return llamar('historial',{query:{tituloId:tituloId}});},
  revisar:function(datos){return llamar('revision',{method:'POST',body:datos});}
 });
})();
