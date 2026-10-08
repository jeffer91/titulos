'use strict';
const {fail,text}=require('./admin-config');
const clean=x=>text(x).replace(/\s+/g,' ');
const normalized=x=>clean(x).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
function doc(s){return s&&s.exists?{...s.data(),id:s.id}:null;}
function cid(value){const id=clean(value);if(!id||id.length>160||id.includes('/'))fail(422,'ID_INVALIDO');return id;}
function correo(value){const email=clean(value).toLowerCase();return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)&&email.length<180?email:'';}
function uid(value){const u=clean(value);return u&&/^[A-Za-z0-9:_-]{1,128}$/.test(u)?u:'';}
function nombres(value){const n=clean(value);if(n.length<3||n.length>160)fail(422,'NOMBRE_INVALIDO');return n;}
function activo(p){return p&&p.activo!==false&&normalized(p.estado||'ACTIVO')!=='INACTIVO';}
function arrCarreras(p){
 const values=[];function add(a){
  if(Array.isArray(a)){a.forEach(add);return;}
  if(a&&typeof a==='object'){add(a.nombreCarrera||a.nombre||a.carrera||a.codigo||a.id||'');return;}
  clean(a).split(/[,;|]/).forEach(v=>{if(clean(v))values.push(clean(v));});
 }
 ['carrerasNombres','carreras','carrerasAsignadas','carrerasIds'].forEach(k=>add(p[k]));
 return [...new Map(values.map(v=>[normalized(v),v])).values()];
}
function safeCoordinator(p){
 return {id:p.id,nombre:clean(p.nombre||p.nombres||p.nombreCompleto),
  email:correo(p.email||p.correo),authUid:uid(p.authUid),activo:activo(p),
  carreras:arrCarreras(p),carrerasAsignadas:arrCarreras(p).map(nombreCarrera=>({nombreCarrera}))};
}
function safeInvestigator(p){
 return {id:p.id,cedula:clean(p.cedula||p.identificacion||p.id).replace(/\D/g,''),
  nombre:clean(p.nombres||p.nombre||p.nombreCompleto),email:correo(p.email||p.correo),
  authUid:uid(p.authUid),activo:activo(p),pinActivo:p.pinActivo===true,pinCreado:Boolean(p.pinCreado||p.pinHash),
  carreras:arrCarreras(p)};
}
async function listar(db,tipo){
 const col=tipo==='coordinador'?'coordinadores':'investigadores';
 const snap=await db.collection(col).limit(501).get();
 if(snap.docs.length>500)fail(409,'PAGINACION_REQUERIDA');
 return snap.docs.map(doc).map(tipo==='coordinador'?safeCoordinator:safeInvestigator)
  .sort((a,b)=>a.nombre.localeCompare(b.nombre));
}
async function crear(db,tipo,body,actor){
 if(!body||typeof body!=='object'||Array.isArray(body))fail(400,'DATOS_INVALIDOS');
 const name=nombres(body.nombre),mail=correo(body.email),authUid=uid(body.authUid);
 if(!mail&&!authUid)fail(422,'VINCULO_AUTENTICACION_REQUERIDO');
 const isCoordinator=tipo==='coordinador';
 const id=isCoordinator?
  cid('coordinador-'+name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')):
  clean(body.cedula);
 if(!isCoordinator&&!/^\d{10}$/.test(id))fail(422,'CEDULA_INVALIDA');
 const col=isCoordinator?'coordinadores':'investigadores';
 const ref=db.collection(col).doc(id);
 const now=new Date().toISOString();
 const result=await db.runTransaction(async tx=>{
  const existing=doc(await tx.get(ref));
  if(existing)fail(409,'PERFIL_EXISTENTE');
  const d=isCoordinator?{
   id,nombre:name,email:mail,activo:true,carreras:[],carrerasAsignadas:[],carrerasNombres:[]
  }:{
   id,cedula:id,nombres:name,email:mail,activo:true,
   pinActivo:true,pinCreado:false,carreras:[],carrerasNombres:[]
  };
  if(authUid)d.authUid=authUid;
  d.creadoEn=now;d.actualizadoEn=now;d.origen='administrador-api';
  tx.set(ref,d);
  tx.set(db.collection('workflow_events').doc(),{
   tipo:isCoordinator?'ADMIN_CREAR_COORDINADOR':'ADMIN_CREAR_INVESTIGADOR',modulo:'administradores',
   entidad:col,entidadId:id,fechaLocal:now,realizadoPorUid:actor.uid
  });
  return d;
 });
 return isCoordinator?safeCoordinator(result):safeInvestigator(result);
}
async function estadoAcceso(db,tipo,body,actor){
 const id=cid(body&&body.id);
 if(typeof body.activo!=='boolean')fail(422,'ESTADO_INVALIDO');
 const col=tipo==='coordinador'?'coordinadores':'investigadores';
 const now=new Date().toISOString(),ref=db.collection(col).doc(id);
 const updated=await db.runTransaction(async tx=>{
  const existing=doc(await tx.get(ref));
  if(!existing)fail(404,'PERFIL_NO_ENCONTRADO');
  const update={activo:body.activo,actualizadoEn:now};
  if(tipo==='coordinador'&&!body.activo)
   Object.assign(update,{carreras:[],carrerasNombres:[],carrerasAsignadas:[],carrerasIds:[],eliminadoEn:now});
  if(tipo==='investigador')
   Object.assign(update,{pinActivo:body.activo,pinDesactivadoEn:body.activo?null:now});
  tx.set(ref,update,{merge:true});
  tx.set(db.collection('workflow_events').doc(),{
   tipo:'ADMIN_CAMBIO_ACCESO',modulo:'administradores',entidad:col,entidadId:id,
   estado:body.activo?'ACTIVO':'INACTIVO',fechaLocal:now,realizadoPorUid:actor.uid
  });
  return {...existing,...update};
 });
 return tipo==='coordinador'?safeCoordinator(updated):safeInvestigator(updated);
}
async function asignar(db,tipo,body,actor){
 const id=cid(body&&body.id);
 const carrera=clean(body&&body.carrera);
 if(!carrera||carrera.length>180||['*','ALL','TODOS','TODAS'].includes(normalized(carrera)))fail(422,'CARRERA_INVALIDA');
 const col=tipo==='coordinador'?'coordinadores':'investigadores';
 const ref=db.collection(col).doc(id),now=new Date().toISOString();
 const result=await db.runTransaction(async tx=>{
  const old=doc(await tx.get(ref));
  if(!old)fail(404,'PERFIL_NO_ENCONTRADO');
  if(!activo(old))fail(403,'PERFIL_INACTIVO');
  if(tipo==='coordinador'&&body.asignar!==false){
   const todos=await tx.get(db.collection('coordinadores').limit(501));
   if(todos.docs.length>500)fail(409,'PAGINACION_COORDINADORES_REQUERIDA');
   for(const item of todos.docs){
    const otro=doc(item);
    if(otro.id===id||!activo(otro))continue;
    if(arrCarreras(otro).some(v=>normalized(v)===normalized(carrera)))fail(409,'CARRERA_YA_ASIGNADA');
   }
  }
  const carr=arrCarreras(old);
  const nueva=body.asignar===false?carr.filter(v=>normalized(v)!==normalized(carrera)):
   [...new Map([...carr,carrera].map(v=>[normalized(v),v])).values()];
  const patch={carreras:nueva,carrerasNombres:nueva,
   carrerasAsignadas:nueva.map(nombreCarrera=>({nombreCarrera})),
   actualizadoEn:now};
  tx.set(ref,patch,{merge:true});
  tx.set(db.collection('workflow_events').doc(),{
   tipo:'ADMIN_ASIGNAR_CARRERA',modulo:'administradores',entidad:col,entidadId:id,
   carrera,accion:body.asignar===false?'RETIRAR':'ASIGNAR',
   fechaLocal:now,realizadoPorUid:actor.uid
  });
  return {...old,...patch};
 });
 return tipo==='coordinador'?safeCoordinator(result):safeInvestigator(result);
}
module.exports={listar,crear,estadoAcceso,asignar,arrCarreras,safeCoordinator,safeInvestigator};
