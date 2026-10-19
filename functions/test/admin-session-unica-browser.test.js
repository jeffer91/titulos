'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../../administradores/js/admin.actions.service.js'),'utf8');

function entorno({logueado=true,otraSesion=false,externa=false,
 respuesta={ok:true,usuario:{uid:'admin1',rol:'administrador'}}}={}){
 const requests=[],events=[];
 const usuario=logueado?{getIdToken:async()=> 'token-identidad'}:null;
 function authCon(usuarioActual){
  return {
   currentUser:usuarioActual,
   setPersistence:async()=>{throw Error('No debe alterar persistencia existente');},
   onAuthStateChanged(cb){queueMicrotask(()=>cb(this.currentUser));return ()=>{};}
  };
 }
 const authDedicada=authCon(otraSesion?null:usuario);
 const authOtra=authCon(otraSesion?usuario:null);
 const cfg={apiKey:'demo',projectId:'titulos-test'};
 const dedicada={name:'ta-administracion-segura',options:cfg};
 const otra={name:'ta-admin-titulos',options:cfg};
 const ajena={name:'otra-firebase',options:{apiKey:'externo',projectId:'externo'}};
 const authAjena=authCon(usuario);
 function authFactory(app){
  return app===otra?authOtra:app===ajena?authAjena:authDedicada;
 }
 authFactory.Auth={Persistence:{SESSION:'SESSION'}};
 const firebase={
  apps:(otraSesion?[otra]:[]).concat(externa?[ajena]:[]),
  initializeApp:(_cfg,nombre)=>nombre==='ta-admin-titulos'?otra:dedicada,
  app:nombre=>nombre==='ta-admin-titulos'?otra:dedicada,
  auth:authFactory
 };
 const window={
  firebase,
  TA_ADMIN_FIREBASE_CONFIG:cfg,
  TA_ADMIN_SEGURIDAD:{apiBase:'https://test.example.org/administradoresApi'},
  dispatchEvent:e=>events.push(e)
 };
 const document={createElement(){throw Error('No debe generar formularios o elementos de acceso.');}};
 const fetch=async(url,options)=>{
  requests.push({url,options});
  return {ok:true,status:200,json:async()=>respuesta};
 };
 class CustomEvent {constructor(type,details){this.type=type;this.detail=details.detail;}}
 vm.runInNewContext(source,{window,document,fetch,queueMicrotask,Promise,CustomEvent});
 return {service:window.TAAdminAccionesSeguras,requests,events,auth:authDedicada,authOtra};
}
test('sin sesión, no aparece ninguna solicitud de ingreso ni se llama al servidor',async()=>{
 const e=entorno({logueado:false});
 assert.equal(await e.service.prepararPanel(),false);
 assert.equal(e.service.autorizadoLocal(),false);
 assert.equal(e.requests.length,0);
});
test('reutiliza automáticamente una sesión existente con rol administrativo',async()=>{
 const e=entorno();
 assert.equal(await e.service.prepararPanel(),true);
 assert.equal(e.service.autorizadoLocal(),true);
 assert.equal(e.requests.length,1);
 assert.match(e.requests[0].url,/\/sesion$/);
 assert.equal(e.requests[0].options.headers.Authorization,'Bearer token-identidad');
 assert.ok(e.events.some(e=>e.type==='admin:autorizacion-cambio'&&e.detail.autorizado===true));
});
test('sesión sin rol administrativo no habilita acciones',async()=>{
 const e=entorno({respuesta:{ok:true,usuario:{uid:'visitante',rol:'estudiante'}}});
 assert.equal(await e.service.prepararPanel(),false);
 assert.equal(e.service.autorizadoLocal(),false);
});
test('sin sesión administrativa, no intenta escribir',async()=>{
 const e=entorno({logueado:false});
 await assert.rejects(()=>e.service.decidir({accion:'APROBAR'}),/no se guardó ningún cambio/i);
 assert.equal(e.requests.length,0);
});
test('una sesión verificada permite enviar una decisión firmada sin pedir datos',async()=>{
 const e=entorno();
 await e.service.prepararPanel();
 assert.equal(await e.service.decidir({accion:'APROBAR'}),undefined);
 assert.equal(e.requests.length,2);
 assert.match(e.requests[1].url,/\/envios\/decision$/);
 assert.equal(e.requests[1].options.method,'POST');
 assert.equal(e.requests[1].options.headers.Authorization,'Bearer token-identidad');
 assert.equal(JSON.parse(e.requests[1].options.body).accion,'APROBAR');
});

test('reutiliza sesión de otra app Firebase del mismo proyecto sin alterar persistencia',async()=>{
 const e=entorno({otraSesion:true});
 assert.equal(await e.service.prepararPanel(),true);
 assert.equal(e.service.autorizadoLocal(),true);
 await e.service.decidir({accion:'ENVIAR_INVESTIGACION'});
 assert.equal(e.requests.length,2);
 assert.equal(e.requests[1].options.headers.Authorization,'Bearer token-identidad');
});
test('ignora sesiones de aplicaciones Firebase con otro proyecto',async()=>{
 const e=entorno({logueado:true,externa:true});
 assert.equal(await e.service.prepararPanel(),true);
 assert.equal(e.requests.length,1);
 const f=entorno({logueado:false,externa:true});
 assert.equal(await f.service.prepararPanel(),false);
 assert.equal(f.requests.length,0);
});
