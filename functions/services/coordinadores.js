'use strict';

// Seguridad de Coordinadores: identidad, carrera y estado SIEMPRE desde Firestore en servidor.
// El navegador solo envía IDs y decisiones; jamás perfiles ni carreras autodeclarados.
const periodos=require('./periodos-activos');
const CAMPOS_CARRERAS=['carrerasNombres','carreras','carrerasAsignadas','carrerasIds','carrera'];
const CAMPOS_BUSQUEDA=['carreraNombre','carrera','nombreCarrera','carreraCodigo','codigoCarrera'];
const CAMPOS_TITULO=[
 'id','cedula','numeroIdentificacion','nombres','nombreCompleto','nombre','carreraNombre','carrera',
 'nombreCarrera','carreraCodigo','codigoCarrera','periodoId','periodoCanonicoId','periodoNombre','periodoLabel',
 'tipoTrabajo','tipoTrabajoLabel','modalidadTitulacion','modalidad','tipo','estado','estadoProceso',
 'estadoCoordinador','estadoInvestigador','revisionCoordinador','revisionInvestigador',
 'tituloCoordinadorNumero','tituloCoordinador','tituloPreferidoNumero','tituloPreferidoTexto',
 'tituloElegido','titulosEnviados','propuestas','propuestasDetalle','titulo1','titulo2','titulo3',
 'fechaEnvio','enviadoEn','creadoEn','actualizadoEnLocal','actualizadoEn','intentosUsados','numeroEnvios',
 'historialProceso','validadoCoordinador','coordinadorRevisado','devueltoPor','resultadoCoordinador',
 'puedeReenviar','permitirReenvio','requiereRevision','requiereAccionDe','observacionDevolucion'
];
const CAMPOS_HISTORIAL=[
 'id','envioId','idOriginal','tituloId','versionActual','numeroVersion','fechaEnvio','creadoEn','archivadoEn',
 'estado','estadoProceso','titulosEnviados','propuestasDetalle','tituloPreferidoTexto','revisionCoordinador',
 'revisionInvestigador','observacionDevolucion','periodoId'
];
const CAMPOS_LOG=[
 'id','tipo','accion','modulo','entidad','entidadId','tituloId','estado','revision','fechaLocal',
 'creadoEn','actualizadoEn','numeroEnvios','periodoId'
];
function rechazo(status,code) {const e=new Error(code);e.status=status;e.code=code;throw e;}
function texto(v){return String(v===undefined||v===null?'':v).replace(/\s+/g,' ').trim();}
function clave(v){return texto(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();}
function idSeguro(v){const id=texto(v);if(!id||id.length>180||id.indexOf('/')!==-1)rechazo(400,'TITULO_ID_INVALIDO');return id;}
function filtro(data,fields){const result={};for(const x of fields)if(data&&data[x]!==undefined)result[x]=data[x];return result;}
function doc(snap){return snap&&snap.exists?{...snap.data(),id:snap.id}:null;}
function carrerasDe(raw) {
 const salida=[];
 const agregar=valor=>{
   if(Array.isArray(valor)){valor.forEach(agregar);return;}
   if(valor&&typeof valor==='object'){agregar(valor.nombreCarrera||valor.carrera||valor.nombre||valor.codigo||valor.id||'');return;}
   texto(valor).split(/[,;|]/).forEach(v=>{if(texto(v))salida.push(texto(v));});
 };
 CAMPOS_CARRERAS.forEach(c=>agregar(raw&&raw[c]));
 return [...new Map(salida.map(v=>[clave(v),v])).values()];
}
function activo(raw){return raw&&raw.activo!==false&&clave(raw.estado||'ACTIVO')!=='INACTIVO';}
function perfilPublico(raw){
 return {id:raw.id,nombre:texto(raw.nombre||raw.nombres||raw.nombreCompleto||raw.email||raw.correo),
   email:texto(raw.email||raw.correo).toLowerCase(),carreras:carrerasDe(raw),activo:activo(raw)};
}
function permitida(titulo,perfil) {
 const nombre=clave(titulo.carreraNombre||titulo.carrera||titulo.nombreCarrera);
 const codigo=clave(titulo.carreraCodigo||titulo.codigoCarrera);
 if(!nombre&&!codigo)return false;
 // Ni substrings ni comodines implícitos: un nombre similar no concede otro programa.
 return carrerasDe(perfil).some(c=>{
   const v=clave(c);
   return v && v!=='*'&&v!=='TODOS'&&v!=='TODAS'&&v!=='ALL'&&(v===nombre||v===codigo);
 });
}
async function obtenerPerfil(db,usuario) {
 if(!usuario||!usuario.uid)rechazo(401,'SESION_REQUERIDA');
 // Se admite vincular el documento con authUid. Alternativamente correo VERIFICADO y único.
 let lista=[];
 const porUid=await db.collection('coordinadores').where('authUid','==',usuario.uid).limit(2).get();
 lista=porUid.docs.map(doc);
 if(!lista.length&&usuario.emailVerified===true&&usuario.email) {
  const email=texto(usuario.email).toLowerCase();
  const query=await db.collection('coordinadores').where('email','==',email).limit(2).get();
  lista=query.docs.map(doc);
  if(!lista.length) {
    const otros=await db.collection('coordinadores').where('correo','==',email).limit(2).get();
    lista=otros.docs.map(doc);
  }
 }
 if(lista.length!==1)rechazo(403,lista.length?'PERFIL_DUPLICADO':'COORDINADOR_NO_VINCULADO');
 const perfil=lista[0];
 if(perfil.authUid&&perfil.authUid!==usuario.uid)rechazo(403,'CUENTA_NO_COINCIDE');
 if(!activo(perfil))rechazo(403,'COORDINADOR_INACTIVO');
 if(!carrerasDe(perfil).length)rechazo(403,'SIN_CARRERAS_ASIGNADAS');
 return perfil;
}
async function consultarTitulos(db,perfil) {
 const habilitados=await periodos.cargar(db);
 const carreras=carrerasDe(perfil).filter(c=>!['*','TODOS','TODAS','ALL'].includes(clave(c)));
 if(!carreras.length)return {titulos:[],truncado:false};
 const consultas=[];
 // Las consultas se limitan DESDE FIRESTORE, no se descarga la base global.
 for(const carrera of carreras) {
   // Campo canónico nuevo + variantes exactas para documentos legados.
   consultas.push(db.collection('envios').where('carreraClave','==',clave(carrera)).limit(500).get());
   for(const value of new Set([carrera,carrera.toUpperCase(),carrera.toLowerCase(),clave(carrera)]))
     for(const campo of CAMPOS_BUSQUEDA)
       consultas.push(db.collection('envios').where(campo,'==',value).limit(500).get());
 }
 const resultados=await Promise.all(consultas);
 const mapa=new Map();let truncado=false;
 for(const grupo of resultados){
   if(grupo.docs.length>=500)truncado=true;
   for(const snap of grupo.docs){
     const d=doc(snap);
     if(d&&permitida(d,perfil)&&periodos.permitido(d,habilitados))mapa.set(d.id,filtro(d,CAMPOS_TITULO));
   }
 }
 const titulos=[...mapa.values()].sort((a,b)=>texto(b.fechaEnvio||b.actualizadoEnLocal).localeCompare(texto(a.fechaEnvio||a.actualizadoEnLocal)));
 return {titulos:titulos.slice(0,2500),truncado:truncado||titulos.length>2500};
}
async function historial(db,perfil,id) {
 const snap=await db.collection('envios').doc(id).get();
 const titulo=doc(snap);
 if(!titulo)rechazo(404,'TITULO_NO_ENCONTRADO');
 if(!permitida(titulo,perfil))rechazo(403,'CARRERA_NO_AUTORIZADA');
 const [a,b,logs,logsAlt]=await Promise.all([
   db.collection('versiones_envio').where('envioId','==',id).limit(100).get(),
   db.collection('versiones_envio').where('idOriginal','==',id).limit(100).get(),
   db.collection('workflow_events').where('tituloId','==',id).limit(200).get(),
   db.collection('workflow_events').where('entidadId','==',id).limit(200).get()
 ]);
 const unique=(x,y)=>[...new Map([...x.docs,...y.docs].map(z=>[z.id,doc(z)])).values()];
 return {
  proceso:Array.isArray(titulo.historialProceso)?titulo.historialProceso.slice(-100):[],
  archivos:unique(a,b).map(v=>filtro(v,CAMPOS_HISTORIAL)),
  logs:unique(logs,logsAlt).map(v=>filtro(v,CAMPOS_LOG))
 };
}
function originales(titulo){
 let items=Array.isArray(titulo.titulosEnviados)&&titulo.titulosEnviados.length
  ? titulo.titulosEnviados
  : Array.isArray(titulo.propuestasDetalle)&&titulo.propuestasDetalle.length?titulo.propuestasDetalle:[];
 if(!items.length)items=[1,2,3].map(numero=>({numero,tituloFinal:texto(titulo['titulo'+numero])})).filter(x=>x.tituloFinal);
 return items.map(x=>({...x}));
}
function tituloNum(items,numero){const x=items.find(v=>Number(v.numero)===numero);return x?texto(x.tituloFinal||x.titulo):'';}
async function revisar(db,perfil,actor,body) {
 if(!body||typeof body!=='object'||Array.isArray(body))rechazo(400,'REVISION_INVALIDA');
 const id=idSeguro(body.tituloId);
 const accion=clave(body.accion);
 if(!['VALIDAR','VALIDAR_CORRECCION','DEVOLVER'].includes(accion))rechazo(422,'ACCION_INVALIDA');
 const comentario=texto(body.observacion);
 const corrected=texto(body.tituloCorregidoTexto);
 if(comentario.length>2000||corrected.length>260)rechazo(422,'TEXTO_MUY_LARGO');
 const aprobar=accion!=='DEVOLVER',corregir=accion==='VALIDAR_CORRECCION';
 if((!aprobar||corregir)&&!comentario)rechazo(422,'OBSERVACION_REQUERIDA');
 if(corregir&&corrected.length<20)rechazo(422,'TITULO_CORREGIDO_INVALIDO');
 const seleccionado=Number(body.tituloSeleccionadoNumero||0);
 if(aprobar&&![1,2,3].includes(seleccionado))rechazo(422,'SELECCION_REQUERIDA');
 const ahora=new Date().toISOString(),ref=db.collection('envios').doc(id);
 const result=await db.runTransaction(async tx=>{
  // PERFIL RELEÍDO DENTRO DE LA TRANSACCIÓN: revocaciones y reasignaciones inmediatas.
  const perfilActual=doc(await tx.get(db.collection('coordinadores').doc(perfil.id)));
  if(!activo(perfilActual)||!carrerasDe(perfilActual).length)rechazo(403,'PERFIL_REVOCADO');
  if(perfilActual.authUid&&perfilActual.authUid!==actor.uid)rechazo(403,'CUENTA_NO_COINCIDE');
  if(!perfilActual.authUid&&(!actor.emailVerified||!actor.email||texto(perfilActual.email||perfilActual.correo).toLowerCase()!==actor.email))
    rechazo(403,'VINCULO_CORREO_REVOCADO');
  // La configuración se relee DENTRO de la transacción para bloquear una revisión
  // si Administración desactivó el período mientras el expediente estaba abierto.
  const configuracion=await tx.get(db.collection('configuracion').doc('general'));
  if(!configuracion.exists)rechazo(503,'CONFIGURACION_PERIODOS_NO_DISPONIBLE');
  const titulo=doc(await tx.get(ref));
  if(!titulo)rechazo(404,'TITULO_NO_ENCONTRADO');
  if(!permitida(titulo,perfilActual))rechazo(403,'CARRERA_NO_AUTORIZADA');
  periodos.validar(titulo,periodos.activos(configuracion.data()));
  const estado=clave(titulo.estadoProceso||titulo.estado);
  if(!['PENDIENTE_COORDINADOR','PENDIENTE_REVISION','ENVIADO','PENDIENTE'].includes(estado))
    rechazo(409,'REVISION_NO_DISPONIBLE');
  if(titulo.coordinadorRevisado===true||titulo.validadoCoordinador===true)
    rechazo(409,'REVISION_YA_REALIZADA');
  const items=originales(titulo);
  const original=aprobar?tituloNum(items,seleccionado):'';
  if(aprobar&&!original)rechazo(422,'TITULO_NO_DISPONIBLE');
  if(corregir&&corrected===original)rechazo(422,'CORRECCION_IGUAL_A_ORIGINAL');
  const final=corregir?corrected:original;
  const actualizados=items.map(x=>{
    if(!corregir||Number(x.numero)!==seleccionado)return x;
    return {...x,tituloOriginalCoordinacion:original,tituloCorregidoCoordinacion:final,
      corregidoCoordinacion:true,tituloFinal:final,titulo:final};
  });
  const identidad=perfilPublico(perfilActual);
  const revision={
    estado:aprobar?'VALIDADO':'DEVUELTO',accion,
    resultado:corregir?'APROBADO_CON_CORRECCION':(aprobar?'APROBADO_SIN_CAMBIOS':'DEVUELTO'),
    observacion:comentario,coordinadorId:perfil.id,coordinadorEmail:identidad.email,
    coordinadorNombre:identidad.nombre,tituloSeleccionadoNumero:aprobar?seleccionado:null,
    tituloSeleccionadoTextoOriginal:original,tituloSeleccionadoTexto:final,
    corrigioTitulo:corregir,fechaLocal:ahora
  };
  const payload={
    revisionCoordinador:revision,revision:revision,coordinadorRevisado:true,
    revisadoPor:identidad.email||perfil.id,revisadoPorNombre:identidad.nombre,
    coordinador:identidad.nombre,ultimoCoordinador:identidad.nombre,
    revisadoEnLocal:ahora,actualizadoEnLocal:ahora,actualizadoPorModulo:'coordinadores'
  };
  if(aprobar)Object.assign(payload,{
    estado:'PENDIENTE_INVESTIGADOR',estadoProceso:'PENDIENTE_INVESTIGADOR',
    estadoCoordinador:'VALIDADO',validadoCoordinacion:true,validadoCoordinador:true,
    resultadoCoordinador:revision.result,tituloCoordinadorNumero:seleccionado,
    tituloCoordinador:final,tituloCoordinadorAntes:original,
    tituloCoordinadorCorregido:corregir?final:'',comentarioCoordinador:comentario,
    fechaValidacionCoordinador:ahora,fechaResolucion:ahora,
    titulosEnviados:actualizados,propuestasDetalle:actualizados,
    titulo1:tituloNum(actualizados,1),titulo2:tituloNum(actualizados,2),titulo3:tituloNum(actualizados,3),
    requiereAccionDe:'INVESTIGACION',requiereRevision:false,
    permitirReenvio:false,puedeReenviar:false,devueltoPor:'',estadoInvestigador:'PENDIENTE'
  });
  else Object.assign(payload,{
    estado:'DEVUELTO',estadoProceso:'DEVUELTO',estadoCoordinador:'DEVUELTO',
    validadoCoordinacion:false,validadoCoordinador:false,resultadoCoordinador:'DEVUELTO',
    comentarioCoordinador:comentario,observacion:comentario,observacionDevolucion:comentario,
    fechaResolucion:ahora,requiereAccionDe:'ESTUDIANTE',requiereRevision:true,
    permitirReenvio:true,puedeReenviar:true,devueltoPor:'COORDINADOR',intentosUsados:0
  });
  const prev=Array.isArray(titulo.historialProceso)?titulo.historialProceso.slice(-99):[];
  payload.historialProceso=prev.concat([{
    version:prev.length+1,fechaEnvio:texto(titulo.fechaEnvio)||ahora,
    tituloPreferidoNumero:titulo.tituloPreferidoNumero,titulosEnviados:items,revisionCoordinador:revision
  }]);
  const evt=db.collection('workflow_events').doc();
  tx.set(ref,payload,{merge:true});
  tx.set(evt,{
    tipo:'REVISION_TITULO_COORDINADOR',accion,modulo:'coordinadores',entidad:'envios',
    entidadId:id,tituloId:id,cedula:titulo.cedula||titulo.numeroIdentificacion||'',
    nombres:titulo.nombres||'',carrera:titulo.carreraNombre||titulo.carrera||'',
    periodoId:titulo.periodoId||titulo.periodoCanonicoId||'',
    estado:payload.estado,revision,fechaLocal:ahora,creadoEn:ahora,
    realizadoPorUid:actor.uid
  });
  return {...titulo,...payload};
 });
 return filtro(result,CAMPOS_TITULO);
}
function crearRutasCoordinadores({db}) {
 if(!db)throw new Error('BASE_COORDINADORES_REQUERIDA');
 return {
  '/perfil':{method:'GET',async handle({usuario}){return perfilPublico(await obtenerPerfil(db,usuario));}},
  '/titulos':{method:'GET',async handle({usuario}){
    const perfil=await obtenerPerfil(db,usuario);
    return consultarTitulos(db,perfil);
  }},
  '/historial':{method:'GET',async handle({usuario,query}){
    const perfil=await obtenerPerfil(db,usuario);
    return historial(db,perfil,idSeguro(query.tituloId));
  }},
  '/revision':{method:'POST',async handle({usuario,body}){
    const perfil=await obtenerPerfil(db,usuario);
    return revisar(db,perfil,usuario,body);
  }}
 };
}
module.exports={crearRutasCoordinadores,obtenerPerfil,permitida,carrerasDe,revisar,perfilPublico};
