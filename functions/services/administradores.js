'use strict';
const person=require('./admin-personal');
const {publicConfig,validate,safeProvider,fail,text}=require('./admin-config');
const adminFields=['id','nombreCarrera','codigoCarrera','carrera','nombre','codigo','activo'];

function documento(snap){return snap&&snap.exists?{...snap.data(),id:snap.id}:null;}
function safe(d,fields){const o={};for(const k of fields)if(d&&d[k]!==undefined)o[k]=d[k];return o;}
function bodyObject(b){if(!b||typeof b!=='object'||Array.isArray(b))fail(400,'SOLICITUD_INVALIDA');return b;}
function crearRutasAdministradores({db,authAdmin}){
 if(!db)throw Error('BASE_ADMINISTRADOR_REQUERIDA');
 return {
  '/configuracion':{method:'GET',async handle(){
   const snap=await db.collection('configuracion').doc('general').get();
   return publicConfig(documento(snap)||{});
  }},
  '/configuracion/guardar':{method:'POST',async handle({body,usuario}){
   const data=validate(bodyObject(body));
   const time=new Date().toISOString();
   await db.runTransaction(async tx=>{
    const ref=db.collection('configuracion').doc('general');
    const previous=await tx.get(ref);
    tx.set(ref,{...data,actualizadoEn:time},{merge:true});
    tx.set(db.collection('workflow_events').doc(),{
     tipo:'ADMIN_CONFIGURACION',modulo:'administradores',entidad:'configuracion',
     entidadId:'general',camposModificados:Object.keys(data),
     fechaLocal:time,realizadoPorUid:usuario.uid
    });
   });
   return {guardado:true,campos:Object.keys(data)};
  }},
  '/coordinadores':{method:'GET',async handle(){return person.listar(db,'coordinador');}},
  '/coordinadores/crear':{method:'POST',async handle({body,usuario}){
   return person.crear(db,'coordinador',bodyObject(body),usuario);
  }},
  '/coordinadores/estado':{method:'POST',async handle({body,usuario}){
   return person.estadoAcceso(db,'coordinador',bodyObject(body),usuario);
  }},
  '/coordinadores/carrera':{method:'POST',async handle({body,usuario}){
   return person.asignar(db,'coordinador',bodyObject(body),usuario);
  }},
  '/investigadores':{method:'GET',async handle(){return person.listar(db,'investigador');}},
  '/investigadores/crear':{method:'POST',async handle({body,usuario}){
   return person.crear(db,'investigador',bodyObject(body),usuario);
  }},
  '/investigadores/estado':{method:'POST',async handle({body,usuario}){
   return person.estadoAcceso(db,'investigador',bodyObject(body),usuario);
  }},
  '/investigadores/carrera':{method:'POST',async handle({body,usuario}){
   return person.asignar(db,'investigador',bodyObject(body),usuario);
  }},
  '/periodos':{method:'GET',async handle(){
   const [snap,configSnap]=await Promise.all([
    db.collection('periodos').limit(501).get(),
    db.collection('configuracion').doc('general').get()
   ]);
   if(snap.docs.length>500)fail(409,'PAGINACION_PERIODOS_REQUERIDA');
   const c=documento(configSnap)||{};
   const activos=new Set(c.periodosActivos||[]);
   if(c.periodoActivoId)activos.add(c.periodoActivoId);
   return snap.docs.map(documento).map(d=>({
    id:d.id,label:text(d.label||d.periodoLabel||d.nombre||d.id),
    activo:activos.has(d.id)
   }));
  }},
  '/carreras':{method:'GET',async handle(){
   const snap=await db.collection('carreras').limit(501).get();
   if(snap.docs.length>500)fail(409,'PAGINACION_CARRERAS_REQUERIDA');
   return snap.docs.map(documento).map(d=>safe(d,adminFields));
  }},
  '/proveedores':{method:'GET',async handle(){
   const snap=await db.collection('ia').limit(30).get();
   // Claves privadas, API keys, tokens y encabezados nunca salen del backend.
   return snap.docs.map(documento).map(safeProvider);
  }},
  '/usuarios/rol':{method:'POST',async handle({usuario,body}){
   bodyObject(body);
   if(!authAdmin||typeof authAdmin.getUser!=='function')fail(503,'AUTH_ADMIN_NO_DISPONIBLE');
   const uid=text(body.uid),role=text(body.role);
   if(!/^[A-Za-z0-9:_-]{1,128}$/.test(uid)||
     !['estudiante','coordinador','investigador','administrador'].includes(role))
     fail(422,'VINCULO_USUARIO_INVALIDO');
   // No permitimos que una API HTTP otorgue el rol administrador a otra cuenta.
   // La cuenta administradora inicial se provisiona fuera del navegador.
   if(role==='administrador')fail(403,'ALTA_ADMINISTRADOR_RESTRINGIDA');
   const target=await authAdmin.getUser(uid);
   if(target.disabled)fail(403,'CUENTA_DESHABILITADA');
   const claims=target.customClaims||{};
   const roles=Array.isArray(claims.roles)?claims.roles.filter(x=>x!=='administrador'):
     typeof claims.role==='string'?[claims.role].filter(x=>x!=='administrador'):[];
   const updated={...claims,roles:[...new Set([...roles,role])]};
   if(role==='estudiante'){
    if(!/^\d{10}$/.test(text(body.cedula)))fail(422,'CEDULA_VERIFICADA_REQUERIDA');
    // Esta API no valida identidad estudiantil contra documento o matrícula.
    // El alta de estudiante requiere proceso académico aparte (bloque 6).
    fail(403,'ALTA_ESTUDIANTE_REQUIERE_VERIFICACION_ACADEMICA');
   }
   await authAdmin.setCustomUserClaims(uid,updated);
   await db.collection('workflow_events').add({
    tipo:'ADMIN_ASIGNAR_ROL',modulo:'administradores',entidad:'firebase_auth',
    entidadId:uid,rol:role,realizadoPorUid:usuario.uid,fechaLocal:new Date().toISOString()
   });
   return {uid,role,asignado:true};
  }}
 };
}
module.exports={crearRutasAdministradores};
