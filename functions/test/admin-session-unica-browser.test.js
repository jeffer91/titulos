'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../../administradores/js/admin.actions.service.js'),'utf8');

function entorno({logueado=true,resultado={ok:true,usuario:{uid:'admin1',rol:'administrador'}}}={}){
 const request=[],listeners={};
 const form={hidden:true,dataset:{},addEventListener(name,fn){listeners['form:'+name]=fn;},querySelector(){return {disabled:false};}};
 const login={hidden:true}, mensaje={textContent:''};
 const iniciar={hidden:true,focus(){},addEventListener(name,fn){listeners['iniciar:'+name]=fn;}};
 const cerrar={hidden:true,addEventListener(name,fn){listeners['cerrar:'+name]=fn;}};
 const cancelar={hidden:true,addEventListener(name,fn){listeners['cancelar:'+name]=fn;}};
 const estado={textContent:''},correo={value:'admin@example.org',focus(){}},clave={value:'seguro'};
 const elements={adminLoginSeguro:login,adminLoginSeguroForm:form,adminLoginMensaje:mensaje,
   adminIniciarSesionPrincipal:iniciar,adminCerrarSesionPrincipal:cerrar,
   adminCancelarLogin:cancelar,adminLoginCorreo:correo,adminLoginClave:clave,
   adminEstadoGeneral:estado};
 const user=logueado?{getIdToken:async()=> 'token-identidad'}:null;
 const auth={currentUser:user,setPersistence:async()=>{},onAuthStateChanged(fn){queueMicrotask(()=>fn(auth.currentUser));return ()=>{};},
   signOut:async()=>{auth.currentUser=null;},
   signInWithEmailAndPassword:async()=>{auth.currentUser={getIdToken:async()=> 'token-identidad'};}
 };
 function authFactory(){return auth;}
 authFactory.Auth={Persistence:{SESSION:'SESSION'}};
 const firebase={initializeApp:()=>({}),app:()=>({}),auth:authFactory};
 const events=[];
 const window={firebase,TA_ADMIN_FIREBASE_CONFIG:{apiKey:'demo'},
  TA_ADMIN_SEGURIDAD:{apiBase:'https://test.example.org/administradoresApi'},
  dispatchEvent:e=>events.push(e)};
 const document={getElementById:id=>elements[id]||null};
 const fetch=async(url,options)=>{request.push({url,options});
   return {ok:true,status:200,json:async()=>resultado};
 };
 class CustomEvent { constructor(type,details){this.type=type;this.detail=details.detail;} }
 vm.runInNewContext(source,{window,document,fetch,queueMicrotask,Promise,CustomEvent});
 return {service:window.TAAdminAccionesSeguras,request,login,form,iniciar,cerrar,
   estado,mensaje,listeners,auth,events};
}
test('sin sesión solicita un único acceso al entrar y permite volver a consulta',async()=>{
 const e=entorno({logueado:false});
 assert.equal(await e.service.prepararPanel(),false);
 assert.equal(e.login.hidden,false);
 assert.equal(e.iniciar.hidden,false);
 assert.equal(e.cerrar.hidden,true);
 assert.equal(e.request.length,0);
 assert.equal(e.service.autorizadoLocal(),false);
 e.listeners['cancelar:click']();
 assert.equal(e.login.hidden,true);
 assert.equal(await e.service.estado(),false);
});
test('sesión con rol válido se reutiliza y oculta segundo acceso',async()=>{
 const e=entorno();
 assert.equal(await e.service.prepararPanel(),true);
 assert.equal(e.login.hidden,true);
 assert.equal(e.iniciar.hidden,true);
 assert.equal(e.cerrar.hidden,false);
 assert.equal(e.request.length,1);
 assert.match(e.request[0].url,/\/sesion$/);
 assert.equal(e.request[0].options.headers.Authorization,'Bearer token-identidad');
 assert.equal(await e.service.estado(),true);
 assert.equal(e.service.autorizadoLocal(),true);
 assert.ok(e.events.some(e=>e.type==='admin:autorizacion-cambio'&&e.detail.autorizado===true));
});
test('un usuario sin rol administrador no queda autorizado',async()=>{
 const e=entorno({resultado:{ok:true,usuario:{uid:'est1',rol:'estudiante'}}});
 assert.equal(await e.service.prepararPanel(),false);
 assert.equal(e.login.hidden,false);
 assert.equal(e.cerrar.hidden,true);
 assert.equal(e.service.autorizadoLocal(),false);
 assert.equal(await e.service.estado(),false);
});
test('la API impide aprobar títulos sin token autenticado',async()=>{
 const e=entorno({logueado:false});
 await assert.rejects(()=>e.service.decidir({accion:'APROBAR'}),/cuenta institucional/i);
 assert.equal(e.request.length,0);
});
test('la sesión se solicita una sola vez en el panel y no al abrir un expediente',async()=>{
 const e=entorno({logueado:false});
 await e.service.prepararPanel();
 assert.equal(e.login.hidden,false);
 e.listeners['cancelar:click']();
 assert.equal(e.login.hidden,true);
 e.listeners['iniciar:click']();
 assert.equal(e.login.hidden,false);
 assert.equal(e.request.length,0);
});
