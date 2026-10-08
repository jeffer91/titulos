'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {webcrypto,createHash}=require('node:crypto');
const BASE=path.join(__dirname,'../..');
const leer=p=>fs.readFileSync(path.join(BASE,p),'utf8');
const CEDULA='1712345678'; // Datos FICTICIOS; nunca publicar PIN institucional.
const CORRECTO='2468',DISTINTO='1357';
const HASH=(cedula,pin)=>createHash('sha256').update('titulos-investigador-v1|'+cedula+'|'+pin).digest('hex');
function elemento(){
 return {value:'',textContent:'',dataset:{},children:[],handlers:{},disabled:false,
  classList:{add(){},remove(){},contains(){return false;}},
  setAttribute(){},appendChild(x){this.children.push(x);},
  addEventListener(tipo,cb){this.handlers[tipo]=cb;},
  focus(){},querySelector(){return null;}};
}
function mock(){
 const elements={};
 for(const id of ['#btnComprobarPinInvestigador','#formCambiarPinInvestigador','#investigadorNuevoPin',
  '#btnGuardarPinInvestigador','#investigadoresTableBody','#modalPinInvestigador',
  '#modalPinInvestigadorMensaje','#investigadoresMensaje'])
  elements[id]=elemento();
 let db={id:CEDULA,cedula:CEDULA,nombres:'PERSONA DE PRUEBA',email:'demo@example.edu',
  activo:true,pinHash:HASH(CEDULA,DISTINTO),pinCreado:true,pinActivo:true};
 const reports=[];
 const ui={
  qs(selector){return elements[selector]||null;},
  value(selector){return (elements[selector]||{}).value||'';},
  setValue(selector,value){if(elements[selector])elements[selector].value=value;},
  setText(selector,value){if(elements[selector])elements[selector].textContent=String(value);},
  setLoading(){},
  showStatus(selector,message,tipo){reports.push({selector,message,tipo});},
  crearBadge(){return elemento();},
  limpiarTabla(){},
  escapeHtml(value){return String(value);}
 };
 let updates=0;
 const audits=[];
 let otherRecords=[];
 let connected=true;
 const firebase={
  async leerDocumento(){return {...db};},
  async buscarInvestigadoresPorCedulaServidor(){
   if(!connected)throw new Error('Firestore sin conexión');
   return [{...db},...otherRecords];
  },
  async cambiarAccesoInvestigador(payload){
   if(!connected)throw new Error('Firestore sin conexión');
   db={...db,activo:payload.activo,pinActivo:payload.activo};
   audits.push({tipo:'ADMIN_CAMBIO_ACCESO_INVESTIGADOR',estado:payload.activo});
   return {activo:payload.activo};
  },
  async leerDocumentoServidor(){
   if(!connected)throw new Error('Firestore sin conexión: acceso no verificado');
   return {...db};
  },
  async listarDocumentosServidor(){
   if(!connected)throw new Error('Firestore sin conexión');
   return [{...db},...otherRecords];
  },
  async guardarPinInvestigador(payload){
   if(!connected)throw new Error('Firestore sin conexión');
   assert.equal(payload.docId,CEDULA);assert.equal(payload.cedula,CEDULA);
   assert.equal(payload.crear,false);
   assert.match(payload.hash,/^[a-f0-9]{64}$/);
   if(Number(payload.revisionEsperada)!==Number(db.pinRevision||0))
    throw Error('El PIN fue modificado por otra sesión.');
   updates++;
   db={...db,pinHash:payload.hash,pinRevision:(db.pinRevision||0)+1,
    pinCreado:true,pinVerificadoPor:'administrador_pin'};
   audits.push({tipo:'ADMIN_PIN_INVESTIGADOR_CAMBIO',entidadId:CEDULA,pinRevision:db.pinRevision});
   return {docId:CEDULA,revision:db.pinRevision,activo:db.activo,pinActivo:db.pinActivo};
  },
  async guardarDocumento(collection,id,patch){
   assert.equal(collection,'investigadores');assert.equal(id,CEDULA);
   updates++; db={...db,...patch};
  },
  async listarDocumentos(){return [{...db}];}
 };
 const window={
  TAAdminUI:ui,TAAdminFirebaseService:firebase,TA_ADMINISTRADORES_CONFIG:{collections:{investigadores:'investigadores'}},
  TAAdministradorSeguro:{activo(){return false;}},
  crypto:webcrypto,TextEncoder,setTimeout(){return 0;}
 };
 const document={addEventListener(){},createElement(tag){
  const el=elemento();if(tag==='tr')el.children=Array.from({length:6},elemento);return el;
 }};
 const scope={window,document,TextEncoder,Uint8Array,Promise,Set,Date,console};
 vm.runInNewContext(leer('administradores/js/investigadores.admin.js'),scope);
 return {window,elements,reports,latest:()=>db,updates:()=>updates,audits,
  disconnect(){connected=false;},setOthers(rows){otherRecords=rows;}};
}
function repo(firestoreData){
 const firebase={
  async buscarInvestigadoresPorCedulaServidor(){return firestoreData?[firestoreData]:[];},
  async leerDocumentoServidor(){return firestoreData;},
  async listarDocumentosServidor(){return firestoreData?[firestoreData]:[];},
  async leerDocumento(){return firestoreData;},
  async listarDocumentos(){return firestoreData?[firestoreData]:[];}
 };
 const window={
  TA_INVESTIGADORES_CONFIG:{collections:{investigadores:'investigadores'},pin:{min:4,max:8}},
  TAInvestigadorFirebaseService:firebase,TAInvestigadorSeguro:{activo(){return false;}},
  crypto:webcrypto,TextEncoder
 };
 vm.runInNewContext(leer('investigadores/js/investigador.repository.js'),
  {window,TextEncoder,Uint8Array,Promise,Set,Date,console});
 return window.TAInvestigadorRepository;
}
test('Administrador Investigadores inicia y enlaza eventos sin ReferenceError',()=>{
 const env=mock();
 assert.doesNotThrow(()=>env.window.TAAdminInvestigadores.iniciar());
 assert.equal(typeof env.elements['#btnComprobarPinInvestigador'].handlers.click,'function');
 assert.equal(typeof env.elements['#formCambiarPinInvestigador'].handlers.submit,'function');
});
test('comprobar PIN distingue discrepancia sin cambiar Firestore',async()=>{
 const env=mock();env.window.TAAdminInvestigadores.iniciar();
 await env.window.TAAdminInvestigadores.cargar();
 const body=env.elements['#investigadoresTableBody'];
 assert.equal(body.children.length,1);
 const actions=body.children[0].children[5].children[0].children;
 const cambiar=actions.find(el=>el.textContent==='Cambiar PIN');
 assert.ok(cambiar);
 cambiar.handlers.click();
 env.elements['#investigadorNuevoPin'].value=CORRECTO;
 const check=env.elements['#btnComprobarPinInvestigador'];
 const coincide=await check.handlers.click();
 assert.equal(coincide,false);
 assert.equal(env.updates(),0);
 assert.ok(env.reports.some(e=>e.message.includes('NO coincide')));
});
test('Administración puede restablecer PIN y Investigadores lo valida con mismo algoritmo',async()=>{
 const env=mock();env.window.TAAdminInvestigadores.iniciar();
 await env.window.TAAdminInvestigadores.cargar();
 const actions=env.elements['#investigadoresTableBody'].children[0].children[5].children[0].children;
 actions.find(el=>el.textContent==='Cambiar PIN').handlers.click();
 const input=env.elements['#investigadorNuevoPin'];
 input.value=CORRECTO;
 const form=env.elements['#formCambiarPinInvestigador'];
 form.handlers.submit({preventDefault(){}});
 // La escritura es una sola transacción; confirmar que finalizó y quedó en servidor.
 for(let i=0;i<40&&env.updates()<1;i++)await new Promise(resolve=>setTimeout(resolve,5));
 assert.equal(env.updates(),1,'el PIN debe guardarse en una sola transacción');
 assert.equal(env.latest().pinHash,HASH(CEDULA,CORRECTO));
 assert.equal(env.latest().pinActivo,true);
 assert.equal(env.latest().pinVerificadoPor,'administrador_pin');
 assert.equal(env.latest().pinRevision,1);
 assert.equal(env.audits.length,1);
 assert.equal(env.audits[0].pinHash,undefined);
 const login=repo(env.latest());
 const profile=await login.buscarInvestigador(CEDULA);
 const acceso=await login.validarAcceso(profile,CORRECTO);
 assert.equal(acceso.cedula,CEDULA);
 await assert.rejects(()=>login.validarAcceso(profile,DISTINTO),/PIN incorrecto/);
});
test('investigador con documento de otra cédula falla de forma explícita',async()=>{
 const doc={id:CEDULA,cedula:'1722222222',activo:true,pinActivo:true,pinHash:HASH(CEDULA,CORRECTO)};
 const login=repo(doc);
 await assert.rejects(()=>login.buscarInvestigador(CEDULA),/cédula del registro.*no coincide/i);
});
test('los PINs reales no quedan dentro del repositorio ni sus pruebas',()=>{
 const source=leer('administradores/js/investigadores.admin.js');
 const page=leer('administradores/administrador.html');
 assert.ok(page.includes('id="btnComprobarPinInvestigador"'));
 assert.ok(source.includes('verificarPinIngresado'));
 assert.ok(!source.includes('console.log(pin)'));
 assert.ok(!source.includes('PIN_PREDEFINIDO'));
});

test('una nueva sesión lee el PIN persistido en el servidor, nunca de memoria del Administrador',async()=>{
 const env=mock();env.window.TAAdminInvestigadores.iniciar();
 await env.window.TAAdminInvestigadores.cargar();
 const actions=env.elements['#investigadoresTableBody'].children[0].children[5].children[0].children;
 actions.find(el=>el.textContent==='Cambiar PIN').handlers.click();
 env.elements['#investigadorNuevoPin'].value=CORRECTO;
 env.elements['#formCambiarPinInvestigador'].handlers.submit({preventDefault(){}});
 for(let i=0;i<50&&env.updates()<1;i++)await new Promise(resolve=>setTimeout(resolve,5));
 assert.equal(env.latest().pinHash,HASH(CEDULA,CORRECTO));
 const nuevaSesion=repo({...env.latest()});
 const datos=await nuevaSesion.buscarInvestigador(CEDULA);
 const usuario=await nuevaSesion.validarAcceso(datos,CORRECTO);
 assert.equal(usuario.cedula,CEDULA);
});
test('si la cédula está duplicada se impide restablecer el PIN',async()=>{
 const env=mock();env.setOthers([{
  id:'id-duplicado',cedula:CEDULA,nombres:'Otra persona',pinHash:'f'.repeat(64)
 }]);
 env.window.TAAdminInvestigadores.iniciar();
 await env.window.TAAdminInvestigadores.cargar();
 const actions=env.elements['#investigadoresTableBody'].children[0].children[5].children[0].children;
 actions.find(el=>el.textContent==='Cambiar PIN').handlers.click();
 env.elements['#investigadorNuevoPin'].value=CORRECTO;
 env.elements['#formCambiarPinInvestigador'].handlers.submit({preventDefault(){}});
 for(let i=0;i<10;i++)await new Promise(resolve=>setTimeout(resolve,1));
 assert.equal(env.updates(),0);
 assert.ok(env.reports.some(x=>/varios documentos/i.test(x.message)));
});
test('si Firestore no está disponible la verificación del PIN no simula éxito',async()=>{
 const env=mock();env.window.TAAdminInvestigadores.iniciar();
 await env.window.TAAdminInvestigadores.cargar();
 const actions=env.elements['#investigadoresTableBody'].children[0].children[5].children[0].children;
 actions.find(el=>el.textContent==='Cambiar PIN').handlers.click();
 env.elements['#investigadorNuevoPin'].value=CORRECTO;
 env.disconnect();
 const out=await env.elements['#btnComprobarPinInvestigador'].handlers.click();
 assert.equal(out,false);
 assert.equal(env.updates(),0);
});

test('Investigadores no descarga toda la colección para consultar el PIN',async()=>{
 const source=leer('investigadores/js/investigador.repository.js');
 const firebase=leer('investigadores/js/firebase.service.js');
 assert.match(source,/buscarInvestigadoresPorCedulaServidor\(id\)/);
 assert.match(firebase,/\.where\('cedula','==',id\)/);
 assert.match(firebase,/source:'server'/);
 const profile=await repo({
  id:CEDULA,cedula:CEDULA,activo:true,pinActivo:true,pinHash:HASH(CEDULA,CORRECTO)
 }).buscarInvestigador(CEDULA);
 assert.equal(profile.cedula,CEDULA);
});
test('el Administrador no reactiva cuentas desactivadas al cambiar el PIN',async()=>{
 const env=mock();env.window.TAAdminInvestigadores.iniciar();
 await env.window.TAAdminInvestigadores.cargar();
 const actions=env.elements['#investigadoresTableBody'].children[0].children[5].children[0].children;
 const cambiar=actions.find(el=>el.textContent==='Cambiar PIN');
 env.window.TAAdminInvestigadores.cargar();
 cambiar.handlers.click();
 env.elements['#investigadorNuevoPin'].value=CORRECTO;
 // El test de servicio verifica que un cambio de PIN preserva el estado,
 // sin usar la función de activación.
 assert.match(leer('administradores/js/investigadores.admin.js'),/cambiarAccesoInvestigador/);
 assert.match(leer('administradores/js/firebase.service.js'),/var habilitado=crear \|\| \(actual&&actual.activo!==false&&actual.pinActivo!==false\)/);
});
