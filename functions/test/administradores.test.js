'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {crearRutasAdministradores}=require('../services/administradores');
const {publicConfig,validate,safeProvider}=require('../services/admin-config');

function memoria(initial={}) {
 const tables=Object.fromEntries(Object.entries(initial).map(([name,items])=>[name,new Map(Object.entries(items))]));
 const rows=name=>tables[name]||(tables[name]=new Map());
 let seq=0;
 function snapshot(name,id){const d=rows(name).get(id);return {id,exists:!!d,data:()=>d?{...d}:undefined};}
 function collection(name) {
  return {
   doc(id){const key=id||'auto-'+(++seq);return {name,id:key,get:async()=>snapshot(name,key)};},
   where(key,op,value){
    assert.equal(op,'==');
    return {limit(n){return {get:async()=>({docs:[...rows(name)].filter(([id,x])=>x[key]===value).slice(0,n).map(([id])=>snapshot(name,id))})};}};
   },
   limit(limit){return {get:async()=>({docs:[...rows(name).keys()].slice(0,limit).map(id=>snapshot(name,id))})};},
   async add(data){const id='auto-'+(++seq);rows(name).set(id,{...data});return {id};}
  };
 }
 return {tables,collection,async runTransaction(fn){
  const pending=[],tx={
   get:ref=>ref.get(),
   set(ref,data,opt){pending.push({ref,data,opt});}
  };
  const result=await fn(tx);
  for(const {ref,data,opt} of pending){
   const before=rows(ref.name).get(ref.id)||{};
   rows(ref.name).set(ref.id,opt&&opt.merge?{...before,...data}:{...data});
  }
  return result;
 }};
}
function seed() {
 return {
  configuracion:{general:{
    procesoActivo:true,periodoActivoId:'2026-04__2026-09',
    sheetsToken:'NO_COMPARTIR',apiKey:'NO_COMPARTIR',sheetsActivo:true
  }},
  coordinadores:{
   c1:{id:'c1',nombre:'Coordinación Uno',email:'uno@example.edu',activo:true,
    authUid:'uid1',carreras:['Marketing']},
   c2:{id:'c2',nombre:'Coordinación Dos',email:'dos@example.edu',activo:true,
    authUid:'uid2',carreras:['Software']}
  },
  investigadores:{i1:{
   cedula:'1700000000',nombres:'Investigador Uno',email:'inv@example.edu',
   pinHash:'HASH_PRIVADO_NO_DEVOLVER',activo:true,pinActivo:true,pinCreado:true,
   carrerasNombres:['Marketing']
  }},
  ia:{gemini:{nombre:'Gemini',apiKey:'CLAVE_PRIVADA',key:'SEGUNDA_CLAVE',
   endpoint:'https://ejemplo.test/token/SECRETO?api_key=PRIVADO',activo:true,modelo:'gemini'}},
  periodos:{'2026-04__2026-09':{label:'Abril a septiembre 2026'}},
  carreras:{marketing:{nombreCarrera:'Marketing'},software:{nombreCarrera:'Software'}},
  workflow_events:{}
 };
}
const actor={uid:'uid-admin',rol:'administrador'};
function setup(data=seed(),authAdmin={}) {
 const db=memoria(data);
 return {db,rutas:crearRutasAdministradores({db,authAdmin})};
}
test('configuración publica y endpoint no filtran secretos',async()=>{
 const raw=seed().configuracion.general;
 const publicData=publicConfig(raw);
 assert.equal(publicData.sheetsToken,undefined);
 assert.equal(publicData.apiKey,undefined);
 assert.equal(publicData.sheetsActivo,false);
 const {rutas}=setup();
 const fromBackend=await rutas['/configuracion'].handle({usuario:actor});
 assert.equal(fromBackend.sheetsToken,undefined);
 assert.equal(fromBackend.sheetsActivo,false);
});
test('rechaza cambios de claves, campos desconocidos y valores incorrectos',()=>{
 assert.throws(()=>validate({sheetsToken:'robado'}),e=>e.code==='CAMPO_NO_AUTORIZADO');
 assert.throws(()=>validate({apiKey:'robado'}),e=>e.code==='CAMPO_NO_AUTORIZADO');
 assert.throws(()=>validate({procesoActivo:'true'}),e=>e.status===422);
 assert.throws(()=>validate({propuestasObligatorias:2}),e=>e.status===422);
 assert.deepEqual(validate({maxIntentos:2,procesoActivo:false}),{maxIntentos:2,procesoActivo:false});
});
test('actualizar configuración usa transacción, sin borrar secretos anteriores',async()=>{
 const {db,rutas}=setup();
 const result=await rutas['/configuracion/guardar'].handle({usuario:actor,body:{procesoActivo:false,maxIntentos:2}});
 assert.equal(result.guardado,true);
 assert.equal(db.tables.configuracion.get('general').procesoActivo,false);
 assert.equal(db.tables.configuracion.get('general').sheetsToken,'NO_COMPARTIR');
 assert.equal(db.tables.workflow_events.size,1);
});
test('listado de investigadores oculta pinHash y listado de IA oculta claves y URL secreta',async()=>{
 const {rutas}=setup();
 const investigadores=await rutas['/investigadores'].handle({usuario:actor});
 assert.equal(investigadores.length,1);
 assert.equal(investigadores[0].pinHash,undefined);
 const ia=await rutas['/proveedores'].handle({usuario:actor});
 assert.equal(ia[0].apiKey,undefined);
 assert.equal(ia[0].key,undefined);
 assert.equal(ia[0].endpoint,'');
 assert.equal(safeProvider({id:'test',apiKey:'private'}).apiKey,undefined);
});
test('crear coordinador requiere vinculo Auth y registra evento',async()=>{
 const {db,rutas}=setup();
 await assert.rejects(()=>rutas['/coordinadores/crear'].handle({usuario:actor,body:{nombre:'Nuevo Coordinador'}}),
  e=>e.code==='VINCULO_AUTENTICACION_REQUERIDO');
 const result=await rutas['/coordinadores/crear'].handle({usuario:actor,body:{
  nombre:'Nuevo Coordinador',email:'nuevo@example.edu',authUid:'firebaseUid123'
 }});
 assert.equal(result.authUid,'firebaseUid123');
 assert.equal(result.carreras.length,0);
 assert.equal(db.tables.workflow_events.size,1);
 await assert.rejects(()=>rutas['/coordinadores/crear'].handle({usuario:actor,body:{
  nombre:'Nuevo Coordinador',email:'nuevo@example.edu'
 }}),e=>e.status===409);
});
test('desactivar coordinador retira asignaciones',async()=>{
 const {db,rutas}=setup();
 const result=await rutas['/coordinadores/estado'].handle({usuario:actor,body:{id:'c1',activo:false}});
 assert.equal(result.activo,false);
 assert.deepEqual(result.carreras,[]);
 assert.equal(db.tables.coordinadores.get('c1').activo,false);
 assert.equal(db.tables.workflow_events.size,1);
});
test('carrera exclusiva: prohíbe duplicar asignación de coordinadores',async()=>{
 const {rutas,db}=setup();
 await assert.rejects(()=>rutas['/coordinadores/carrera'].handle({usuario:actor,body:{
  id:'c1',carrera:'Software'
 }}),e=>e.code==='CARRERA_YA_ASIGNADA');
 assert.deepEqual(db.tables.coordinadores.get('c1').carreras,['Marketing']);
 const data=await rutas['/coordinadores/carrera'].handle({usuario:actor,body:{
  id:'c1',carrera:'Administración'
 }});
 assert.ok(data.carreras.includes('Administración'));
 assert.equal(db.tables.workflow_events.size,1);
});
test('crear investigador no necesita ni guarda PIN; acceso requiere vínculo real',async()=>{
 const {db,rutas}=setup();
 await assert.rejects(()=>rutas['/investigadores/crear'].handle({usuario:actor,body:{nombre:'Docente Tres',cedula:'1234567890'}}),
  e=>e.status===422);
 const d=await rutas['/investigadores/crear'].handle({usuario:actor,body:{
  nombre:'Docente Tres',cedula:'1712345678',email:'docente@example.edu',authUid:'uidDocente'
 }});
 assert.equal(d.pinHash,undefined);
 assert.equal(d.pinCreado,false);
 assert.equal(db.tables.investigadores.get('1712345678').pinHash,undefined);
});
test('desactivar investigador revoca inmediatamente su acceso administrativo',async()=>{
 const {db,rutas}=setup();
 const r=await rutas['/investigadores/estado'].handle({usuario:actor,body:{id:'i1',activo:false}});
 assert.equal(r.pinActivo,false);
 assert.equal(db.tables.investigadores.get('i1').activo,false);
 assert.equal(db.tables.workflow_events.size,1);
});
test('ninguna ruta administrativa ofrece acceso directo a documentos envios arbitrarios',()=>{
 const {rutas}=setup();
 assert.equal(rutas['/coleccion'],undefined);
 assert.equal(rutas['/eliminar'],undefined);
 assert.equal(rutas['/envios/borrar'],undefined);
});

test('solo se pueden asignar roles operativos, nunca crear otro administrador desde API',async()=>{
 const calls=[];
 const authAdmin={getUser:async uid=>({uid,disabled:false,customClaims:{roles:[]},email:'inv@example.edu',emailVerified:true}),
  setCustomUserClaims:async(uid,claims)=>{calls.push({uid,claims});}};
 const {rutas,db}=setup(seed(),authAdmin);
 await assert.rejects(()=>rutas['/usuarios/rol'].handle({usuario:actor,body:{
  uid:'admin-target',role:'administrador'
 }}),e=>e.code==='ALTA_ADMINISTRADOR_RESTRINGIDA');
 await assert.rejects(()=>rutas['/usuarios/rol'].handle({usuario:actor,body:{
  uid:'alumno-1',role:'estudiante',cedula:'1712345678'
 }}),e=>e.code==='ALTA_ESTUDIANTE_REQUIERE_VERIFICACION_ACADEMICA');
 await assert.rejects(()=>rutas['/usuarios/rol'].handle({usuario:actor,body:{uid:'uidDocente',role:'coordinador'}}),
  e=>e.code==='PERFIL_NO_VINCULADO_O_AMBIGUO');
 const ok=await rutas['/usuarios/rol'].handle({usuario:actor,body:{uid:'uidDocente',role:'investigador'}});
 assert.equal(ok.asignado,true);
 assert.deepEqual(calls,[{uid:'uidDocente',claims:{roles:['investigador']}}]);
 assert.equal(db.tables.workflow_events.size,1);
});
test('el handler rechaza llamadas administrativas sin rol aunque haya token de otro perfil',async()=>{
 const {crearModulo}=require('../modules/administradores');
 const {db}=setup();
 let verified=0;
 const auth={async verifyIdToken(token,checkRevoked){
  verified++;assert.equal(checkRevoked,true);
  return {uid:'usuario-normal',roles:['coordinador']};
 }};
 const req={method:'GET',path:'/coordinadores',headers:{authorization:'Bearer token'}};
 const res={statusCode:200,body:null,headers:{},
  setHeader(k,v){this.headers[k]=v;return this;},
  status(v){this.statusCode=v;return this;},
  json(x){this.body=x;return this;},end(){return this;}};
 await crearModulo({db,auth})(req,res);
 assert.equal(res.statusCode,403);
 assert.equal(verified,1);
 assert.equal(res.body.codigo,'ROL_NO_AUTORIZADO');
});

test('listar periodos deduplica IDs, ignora abreviados y usa fechas reales del ID',async()=>{
 const data=seed();
 data.configuracion.general={
  periodosActivos:['2026-02__2026-08'],
  periodoActivoId:'2025-11__2026-05',
  periodoActivo:{id:'2025-11__2026-05',label:'Período anterior'}
 };
 data.periodos={
  '2026-02':{label:'Febrero 2026 a Agosto 2026'},
  '2026-02__2026-08':{label:'Mayo de 2026 (incorrecto)'},
  '2025-11__2026-05':{label:'Otro período'}
 };
 const {rutas}=setup(data);
 const lista=await rutas['/periodos'].handle({usuario:actor});
 assert.deepEqual(lista.map(x=>x.id),['2026-02__2026-08','2025-11__2026-05']);
 assert.deepEqual(lista.map(x=>x.activo),[true,false]);
 assert.equal(lista[0].label,'Febrero 2026 a Agosto 2026');
});
test('activar y desactivar periodos es transaccional y no resucita el principal antiguo',async()=>{
 const data=seed();
 data.configuracion.general.periodosActivos=['2026-02__2026-08','2026-05__2026-11'];
 data.configuracion.general.periodoActivoId='2025-11__2026-05';
 const {rutas,db}=setup(data);
 const call=(periodoId,activo)=>rutas['/periodos/estado'].handle({usuario:actor,body:{periodoId,activo}});
 await call('2026-02__2026-08',false);
 let config=db.tables.configuracion.get('general');
 assert.deepEqual(config.periodosActivos,['2026-05__2026-11']);
 assert.equal(config.periodoActivoId,'2026-05__2026-11');
 assert.equal(config.periodoActivoLabel,'Mayo 2026 a Noviembre 2026');
 assert.deepEqual(config.periodosActivosLabels,['Mayo 2026 a Noviembre 2026']);
 await call('2026-05__2026-11',false);
 config=db.tables.configuracion.get('general');
 assert.deepEqual(config.periodosActivos,[]);
 assert.equal(config.periodoActivoId,'');
 assert.equal(config.periodoActivoDesactivado,true);
 assert.equal(db.tables.workflow_events.size,2);
 await call('2026-02__2026-08',true);
 assert.deepEqual(db.tables.configuracion.get('general').periodosActivos,['2026-02__2026-08']);
 assert.equal(db.tables.workflow_events.size,3);
});
test('rechazar ID abreviado no modifica Firestore',async()=>{
 const {rutas,db}=setup();
 await assert.rejects(()=>rutas['/periodos/estado'].handle({usuario:actor,body:{
  periodoId:'2026-02',activo:true
 }}),e=>e.status===422);
 assert.equal(db.tables.workflow_events.size,0);
 assert.throws(()=>validate({periodosActivos:['2026-02']}),e=>e.status===422);
 assert.throws(()=>validate({periodoActivoId:'2026-10'}),e=>e.status===422);
 assert.deepEqual(validate({periodosActivos:['2026-02__2026-08']}),
  {periodosActivos:['2026-02__2026-08']});
});
