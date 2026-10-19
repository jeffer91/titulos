'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../../administradores/js/admin.actions.service.js'),'utf8');
function ambiente({logueado=true,respuesta={ok:true,usuario:{uid:'admin-prueba',rol:'administrador'}}}={}){
 const state=new Set(['admin-auth-pending']),requests=[];
 const form={hidden:true,dataset:{},addEventListener(){}};
 const panel={hidden:true};
 const msg={textContent:''};
 const salir={hidden:true,addEventListener(){}},cabecera={hidden:true,addEventListener(){}};
 const dom={'adminLoginSeguro':panel,'adminLoginSeguroForm':form,'adminLoginMensaje':msg,
   'adminSalirSeguro':salir,'adminCerrarSesionPrincipal':cabecera};
 const user=logueado?{getIdToken:async()=> 'token-valido'}:null;
 const auth={currentUser:user,setPersistence:async()=>{},onAuthStateChanged(cb){
   queueMicrotask(()=>cb(auth.currentUser));return ()=>{};
 },signOut:async()=>{auth.currentUser=null}};
 function firebaseAuth(){return auth;}
 firebaseAuth.Auth={Persistence:{SESSION:'SESSION'}};
 const firebase={initializeApp:()=>({}),app:()=>({}),auth:firebaseAuth};
 const window={firebase,TA_ADMIN_FIREBASE_CONFIG:{apiKey:'test-config'},
  TA_ADMIN_SEGURIDAD:{apiBase:'https://api-pruebas.example.net/administradoresApi'},
  location:{reload(){throw new Error('No debería recargar sin una acción de usuario.');}}};
 const document={getElementById:id=>dom[id]||null,body:{classList:{
   add:key=>state.add(key),remove:key=>state.delete(key)
 }}};
 const fetch=async(url,options)=>{
   requests.push({url,options});
   return {ok:true,status:200,json:async()=>respuesta};
 };
 vm.runInNewContext(source,{window,document,fetch,queueMicrotask,Promise});
 return {api:window.TAAdminAccionesSeguras,requests,state,panel,form,salir,cabecera,msg};
}
test('inicia sesión una sola vez, con rol verificado, sin mostrar otro formulario',async()=>{
 const a=ambiente();
 assert.equal(await a.api.iniciarPanel(),true);
 assert.equal(a.panel.hidden,true);
 assert.equal(a.cabecera.hidden,false);
 assert.equal(a.state.has('admin-auth-pending'),false);
 assert.equal(a.requests.length,1);
 assert.match(a.requests[0].url,/\/sesion$/);
 assert.equal(a.requests[0].options.headers.Authorization,'Bearer token-valido');
});
test('rechaza una respuesta sin administrador aunque HTTP diga ok',async()=>{
 const a=ambiente({respuesta:{ok:true,usuario:{uid:'uid-prueba',rol:'estudiante'}}});
 assert.equal(await a.api.iniciarPanel(),false);
 assert.equal(a.panel.hidden,false);
 assert.equal(a.state.has('admin-auth-pending'),true);
 assert.equal(a.cabecera.hidden,true);
});
test('sin sesión no llama a la API ni permite abrir módulos',async()=>{
 const a=ambiente({logueado:false});
 assert.equal(await a.api.iniciarPanel(),false);
 assert.equal(a.requests.length,0);
 assert.equal(a.state.has('admin-auth-pending'),true);
 assert.equal(a.form.hidden,false);
});
test('decisión administrativa usa token y no permite aprobar sin usuario',async()=>{
 const a=ambiente({logueado:false});
 await assert.rejects(()=>a.api.decidir({accion:'APROBAR'}),/cuenta institucional/i);
 assert.equal(a.requests.length,0);
});
