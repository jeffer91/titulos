'use strict';
const person=require('./admin-personal');
const periodos=require('./periodos-activos');
const adminData=require('./admin-data');
const {publicConfig,validate,safeProvider,fail,text}=require('./admin-config');
const adminFields=['id','nombreCarrera','codigoCarrera','carrera','nombre','codigo','activo'];

function documento(snap){return snap&&snap.exists?{...snap.data(),id:snap.id}:null;}
function safe(d,fields){const o={};for(const k of fields)if(d&&d[k]!==undefined)o[k]=d[k];return o;}
function bodyObject(b){if(!b||typeof b!=='object'||Array.isArray(b))fail(400,'SOLICITUD_INVALIDA');return b;}
function crearRutasAdministradores({db,authAdmin,academica}){
 if(!db)throw Error('BASE_ADMINISTRADOR_REQUERIDA');
 return {
  '/estudiantes':{method:'GET',async handle(){
    return adminData.estudiantes(academica);
  }},
  '/envios':{method:'GET',async handle(){
    return adminData.envios(db);
  }},
  '/envios/archivar':{method:'POST',async handle({usuario,body}){
    return adminData.archivar(db,body,usuario);
  }},
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
  '/periodos/estado':{method:'POST',async handle({usuario,body}){
   return periodos.actualizarEstado(db,usuario,bodyObject(body));
  }},
  '/periodos':{method:'GET',async handle(){
   const [snap,configSnap]=await Promise.all([
    db.collection('periodos').limit(501).get(),
    db.collection('configuracion').doc('general').get()
   ]);
   if(snap.docs.length>500)fail(409,'PAGINACION_PERIODOS_REQUERIDA');
   const c=documento(configSnap)||{};
   const activos=periodos.activos(c),mapa=new Map();
   for(const d of snap.docs.map(documento)){
    const id=periodos.canonico(d.periodoId)||periodos.canonico(d.id);
    if(id)mapa.set(id,{id,label:periodos.etiqueta(id),origen:'periodos',activo:activos.has(id)});
   }
   for(const id of activos)if(!mapa.has(id))mapa.set(id,{
    id,label:periodos.etiqueta(id),origen:'config',activo:true
   });
   return [...mapa.values()].sort((a,b)=>a.activo===b.activo?
    a.id.localeCompare(b.id):a.activo?-1:1);
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
   // El administrador nunca puede convertir en "usuario normal" a un administrador existente.
   if(claims.role==='administrador'||Array.isArray(claims.roles)&&claims.roles.includes('administrador'))
     fail(403,'CUENTA_ADMINISTRATIVA_PROTEGIDA');
   const roles=Array.isArray(claims.roles)?claims.roles.filter(x=>['estudiante','coordinador','investigador'].includes(x)):
     typeof claims.role==='string'&&['estudiante','coordinador','investigador'].includes(claims.role)?[claims.role]:[];
   // Una cuenta solo recibe un rol operativo si su perfil real está vinculado,
   // activo y corresponde al UID o al correo VERIFICADO por Firebase.
   if(role==='coordinador'||role==='investigador'){
    const collection=role==='coordinador'?'coordinadores':'investigadores';
    const col=db.collection(collection);
    const byUid=await col.where('authUid','==',uid).limit(2).get();
    let perfiles=byUid.docs.map(documento);
    if(!perfiles.length&&target.emailVerified===true&&target.email){
     const email=String(target.email).trim().toLowerCase();
     const byEmail=await col.where('email','==',email).limit(2).get();
     perfiles=byEmail.docs.map(documento);
     if(!perfiles.length){
      const byCorreo=await col.where('correo','==',email).limit(2).get();
      perfiles=byCorreo.docs.map(documento);
     }
    }
    if(perfiles.length!==1)fail(403,'PERFIL_NO_VINCULADO_O_AMBIGUO');
    const vinculo=perfiles[0];
    if(vinculo.activo===false||String(vinculo.estado||'').toUpperCase()==='INACTIVO')
      fail(403,'PERFIL_INACTIVO');
    if(vinculo.authUid&&vinculo.authUid!==uid)fail(403,'VINCULO_UID_INCORRECTO');
    if(!vinculo.authUid&&(!target.emailVerified||!target.email||
      String(vinculo.email||vinculo.correo||'').trim().toLowerCase()!==String(target.email).trim().toLowerCase()))
      fail(403,'EMAIL_NO_VERIFICADO');
   }
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
