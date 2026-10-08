'use strict';
// Prueba de integración simulada de extremo a extremo: los cuatro módulos usan
// el mismo backend operativo, pero nunca comparten permisos de usuario.
const test=require('node:test');
const assert=require('node:assert/strict');
const estudiantes=require('../modules/estudiantes').crearModulo;
const coordinadores=require('../modules/coordinadores').crearModulo;
const investigadores=require('../modules/investigadores').crearModulo;
const administradores=require('../modules/administradores').crearModulo;

function db(seed={}){
 const sets=Object.fromEntries(Object.entries(seed).map(([k,v])=>[k,new Map(Object.entries(v))]));
 const collection=k=>sets[k]||(sets[k]=new Map());
 let n=0;
 function snap(k,id){const data=collection(k).get(id);return {id,exists:!!data,data:()=>data&&{...data}};}
 function query(k,filters=[],last=null,max=Infinity){
  return {
   where(key,op,value){assert.equal(op,'==');return query(k,[...filters,[key,value]],last,max);},
   orderBy(field){assert.equal(field,'__name__');return query(k,filters,last,max);},
   limit(num){return query(k,filters,last,num);},
   startAfter(value){return query(k,filters,value.id,max);},
   async get(){
    const matches=[...collection(k)].sort(([a],[b])=>a.localeCompare(b)).filter(([id,d])=>
     (!last||id>last)&&filters.every(([field,value])=>field.split('.').reduce((v,key)=>v&&v[key],d)===value));
    const docs=matches.slice(0,max).map(([id])=>snap(k,id));return {docs,empty:!docs.length};
   }
  };
 }
 return {sets,
  collection(k){
   return {...query(k),doc(id){const key=id||'auto-'+(++n);return {k,id:key,get:async()=>snap(k,key)};}};
  },
  async runTransaction(work){
   const writes=[];
   const tx={get:ref=>ref.get(),set:(ref,value,options)=>{writes.push({ref,value,options});}};
   const result=await work(tx);
   for(const {ref,value,options} of writes){
    const m=collection(ref.k),prior=m.get(ref.id)||{};
    m.set(ref.id,options&&options.merge?{...prior,...value}:{...value});
   }return result;
  }
 };
}
const cedula='1712345678',periodo='2026-04__2026-09',id=periodo+'__'+cedula;
function base(){
 const operativa=db({
  configuracion:{general:{periodoActivoId:periodo,maxIntentos:3,procesoActivo:true,iaActiva:false}},
  coordinadores:{c1:{authUid:'coord-auth',nombre:'Coordinador',email:'coord@itsqmet.edu.ec',activo:true,carreras:['Marketing']}},
  investigadores:{i1:{authUid:'inv-auth',nombre:'Investigador',cedula:'1700000000',
    email:'inv@itsqmet.edu.ec',activo:true,pinActivo:true,carreras:['Marketing']}},
  envios:{},versiones_envio:{},workflow_events:{},carreras:{}
 });
 const academica=db({
  Estudiante:{[cedula]:{cedula,nombres:'ESTUDIANTE DEMO'}},
  matriculas:{m1:{cedula,periodoId:periodo,nombreCarrera:'Marketing',codigoCarrera:'MKT',estadoMatricula:'ACTIVO'}}
 });
 const claims={
  alumno:{uid:'student-auth',roles:['estudiante'],cedula},
  coord:{uid:'coord-auth',roles:['coordinador'],email:'coord@itsqmet.edu.ec',email_verified:true},
  inv:{uid:'inv-auth',roles:['investigador'],email:'inv@itsqmet.edu.ec',email_verified:true},
  admin:{uid:'admin-auth',roles:['administrador']}
 };
 const auth={async verifyIdToken(token,checkRevoked){
  assert.equal(checkRevoked,true);
  if(!claims[token])throw Error('token desconocido');return claims[token];
 },getUser:async uid=>({uid,disabled:false,emailVerified:true,email:'inv@itsqmet.edu.ec',customClaims:{}})};
 const opts={db:operativa,operativa,academica,auth,geminiKey:()=>''};
 const handlers={estudiantes:estudiantes(opts),coordinadores:coordinadores(opts),
  investigadores:investigadores(opts),administradores:administradores(opts)};
 async function send(module,token,path,method='GET',body={},query={}){
  const req={method,path,headers:{origin:'https://jeffer91.github.io',authorization:'Bearer '+token},body,query};
  const res={statusCode:200,body:null,headers:{},setHeader(k,v){this.headers[k]=v;return this;},
   status(s){this.statusCode=s;return this;},json(x){this.body=x;return this;},end(){return this;}};
  await handlers[module](req,res);return res;
 }
 return {operativa,academica,send};
}
const propuestas=[
 {numero:1,tituloFinal:'Diagnóstico de estrategias comerciales de una organización'},
 {numero:2,tituloFinal:'Propuesta de mejora de procesos comerciales del instituto'},
 {numero:3,tituloFinal:'Evaluación de resultados de marketing en negocios locales'}
];
test('flujo integrado: estudiante -> coordinación -> investigación -> administrador',async()=>{
 const {send,operativa}=base();
 const enviado=await send('estudiantes','alumno','/envio','POST',{
  cedula,periodoId:periodo,titulosEnviados:propuestas,tituloPreferidoNumero:2
 });
 assert.equal(enviado.statusCode,200,JSON.stringify(enviado.body));
 assert.equal(enviado.body.data.id,id);
 const cola=await send('coordinadores','coord','/titulos');
 assert.equal(cola.statusCode,200);
 assert.deepEqual(cola.body.data.titulos.map(t=>t.id),[id]);
 const validacion=await send('coordinadores','coord','/revision','POST',{
  tituloId:id,accion:'VALIDAR',tituloSeleccionadoNumero:2
 });
 assert.equal(validacion.statusCode,200,JSON.stringify(validacion.body));
 const revision=await send('investigadores','inv','/cola');
 assert.equal(revision.statusCode,200);
 assert.deepEqual(revision.body.data.titulos.map(t=>t.id),[id]);
 const aprobado=await send('investigadores','inv','/revision','POST',{tituloId:id,accion:'APROBAR'});
 assert.equal(aprobado.statusCode,200,JSON.stringify(aprobado.body));
 assert.equal(aprobado.body.data.estado,'APROBADO_FINAL');
 const expediente=await send('estudiantes','alumno','/expediente','GET',{}, {periodoId:periodo});
 assert.equal(expediente.statusCode,200);
 assert.equal(expediente.body.data.envio.estado,'APROBADO_FINAL');
 const general=await send('administradores','admin','/envios');
 assert.equal(general.statusCode,200,JSON.stringify(general.body));
 assert.equal(general.body.data[0].estado,'APROBADO_FINAL');
 assert.equal(operativa.sets.workflow_events.size,3);
 const replay=await send('investigadores','inv','/revision','POST',{tituloId:id,accion:'DEVOLVER',observacion:'Intento repetido'});
 assert.equal(replay.statusCode,409);
});
test('aislamiento: otros roles no pueden reutilizar rutas ajenas',async()=>{
 const {send}=base();
 const pruebas=[
  ['estudiantes','coord','/expediente'],
  ['coordinadores','alumno','/titulos'],
  ['investigadores','coord','/cola'],
  ['administradores','inv','/envios'],
  ['administradores','alumno','/coordinadores']
 ];
 for(const [app,token,path] of pruebas){
  const r=await send(app,token,path);
  assert.equal(r.statusCode,403,app+' '+path);
  assert.equal(r.body.codigo,'ROL_NO_AUTORIZADO');
 }
 const invalid=await send('administradores','ninguno','/envios');
 assert.equal(invalid.statusCode,401);
});
test('perfil sin carrera y sesión de estudiante sin cédula no reciben datos',async()=>{
 const {operativa,send}=base();
 operativa.sets.coordinadores.get('c1').carreras=[];
 const cola=await send('coordinadores','coord','/titulos');
 assert.equal(cola.statusCode,403);
 const wrong=await send('estudiantes','alumno','/expediente','GET',{}, {cedula:'1720000000'});
 assert.equal(wrong.statusCode,403);
});
test('consultas académicas y reportes no entregan claves de configuración',async()=>{
 const {operativa,send}=base();
 operativa.sets.configuracion.get('general').sheetsToken='SECRETO';
 const e=await send('administradores','admin','/estudiantes');
 assert.equal(e.statusCode,200,JSON.stringify(e.body));
 assert.equal(e.body.data[0].cedula,cedula);
 assert.equal(e.body.data[0].sheetsToken,undefined);
 const config=await send('administradores','admin','/configuracion');
 assert.equal(config.body.data.sheetsToken,undefined);
});
