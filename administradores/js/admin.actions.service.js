/* Autorización puntual para decisiones académicas desde el panel histórico.
   Nunca escribe directamente en Firestore: el backend comprueba rol administrador. */
(function(){
 'use strict';
 var authPromise=null,auth=null;
 var config=window.TA_ADMIN_SEGURIDAD||{};
 function err(m){return new Error(m);}
 function addScript(){
  if(window.firebase&&window.firebase.auth)return Promise.resolve();
  return new Promise(function(resolve,reject){
   var script=document.createElement('script');
   script.src='https://www.gstatic.com/firebasejs/10.12.5/firebase-auth-compat.js';
   script.onload=resolve;
   script.onerror=function(){reject(err('No se pudo cargar Firebase Authentication.'));};
   document.head.appendChild(script);
  });
 }
 function conectar(){
  if(authPromise)return authPromise;
  authPromise=Promise.resolve().then(function(){
   if(!window.firebase||!window.firebase.initializeApp)
     throw err('Firebase no está disponible para autenticar la intervención.');
   return addScript();
  }).then(function(){
   var app;
   try{app=window.firebase.app('ta-administracion-segura');}
   catch(_){app=window.firebase.initializeApp(window.TA_ADMIN_FIREBASE_CONFIG,'ta-administracion-segura');}
   auth=window.firebase.auth(app);
   return auth.setPersistence(window.firebase.auth.Auth.Persistence.SESSION).then(function(){
    return new Promise(function(resolve,reject){
     var unsub=auth.onAuthStateChanged(function(user){unsub();resolve(user);},reject);
    });
   });
  }).catch(function(error){authPromise=null;throw error;});
  return authPromise;
 }
 function request(path,method,body){
  return conectar().then(function(){
   var user=auth&&auth.currentUser;
   if(!user)throw err('Inicia sesión con una cuenta administradora autorizada.');
   return user.getIdToken(true);
  }).then(function(token){
   return fetch(config.apiBase.replace(/\/+$/,'')+'/'+path,{
    method:method||'GET',mode:'cors',cache:'no-store',credentials:'omit',
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:method==='POST'?JSON.stringify(body||{}):undefined
   });
  }).then(function(resp){
   return resp.json().then(function(payload){
    if(!resp.ok||payload.ok===false){
     var e=err('Operación rechazada por el servidor: '+(payload.codigo||resp.status));
     e.codigo=payload.codigo||'ADMIN_API_ERROR';throw e;
    }
    return payload.data;
   });
  });
 }
 function iniciarSesion(email,password){
  if(!email||!password)return Promise.reject(err('Escribe correo y contraseña institucional.'));
  return conectar().then(function(){
   return auth.signInWithEmailAndPassword(String(email).trim(),password);
  }).then(function(){return request('sesion','GET');}).catch(function(error){
   // No dejamos abierta una sesión sin autorización verificada por el backend.
   if(auth&&auth.currentUser)return auth.signOut().then(function(){throw error;});
   throw error;
  });
 }
 function estado(){return conectar().then(function(){return Boolean(auth&&auth.currentUser);});}
 function cerrar(){return conectar().then(function(){return auth.signOut();});}
 function decidir(body){return request('envios/decision','POST',body);}
 window.TAAdminAccionesSeguras=Object.freeze({
  iniciarSesion:iniciarSesion,estado:estado,cerrar:cerrar,decidir:decidir
 });
})();