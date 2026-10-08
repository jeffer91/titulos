'use strict';
const FIELDS=['id','cedula','numeroIdentificacion','nombres','carrera','carreraNombre','nombreCarrera','carreraCodigo','codigoCarrera','periodoId','periodoCanonicoId','periodoNombre','periodoLabel','tipoTrabajo','modalidadTitulacion','estado','estadoProceso','estadoCoordinador','estadoInvestigador','validadoCoordinador','coordinadorRevisado','revisionCoordinador','revisionInvestigador','investigacionRevisada','investigacionRevisadaEn','fechaValidacionCoordinador','fechaResolucionInvestigacion','fechaEnvio','fechaResolucion','creadoEn','actualizadoEnLocal','numeroEnvios','numeroReenvios','tituloPreferidoNumero','tituloCoordinadorNumero','tituloPreferidoTexto','tituloElegido','tituloCoordinador','tituloFinal','tituloFinalInvestigacion','resultadoCoordinador','resultadoInvestigacion','titulosEnviados','propuestasDetalle','titulo1','titulo2','titulo3','devueltoPor','observacionDevolucion','puedeReenviar','permitirReenvio'];
const CARRERAS=['carrerasNombres','carreras','carrerasAsignadas','carrerasIds'];
const CAMPOS=['carreraNombre','carrera','nombreCarrera','carreraCodigo','codigoCarrera'];
const limpiar=x=>String(x===undefined||x===null?'':x).replace(/\s+/g,' ').trim();
const clave=x=>limpiar(x).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
function negar(status,code){let e=new Error(code);e.status=status;e.code=code;throw e;}
function doc(snap){return snap&&snap.exists?{...snap.data(),id:snap.id}:null;}
function filtrar(d){let r={};for(let k of FIELDS)if(d&&d[k]!==undefined)r[k]=d[k];return r;}
function carreras(raw){
 let a=[];function add(x){
  if(Array.isArray(x)){x.forEach(add);return;}
  if(x&&typeof x==='object'){add(x.nombreCarrera||x.carrera||x.nombre||x.codigo||x.id);return;}
  limpiar(x).split(/[,;|]/).forEach(v=>{if(limpiar(v))a.push(limpiar(v));});
 }
 CARRERAS.forEach(c=>add(raw&&raw[c]));
 return [...new Map(a.map(v=>[clave(v),v])).values()];
}
function activo(p){return Boolean(p&&p.activo!==false&&clave(p.estado||'ACTIVO')!=='INACTIVO'&&p.pinActivo===true);}
function perfilPublico(p){return {id:p.id,cedula:limpiar(p.cedula||p.identificacion||p.numeroIdentificacion||p.id).replace(/\D/g,''),
 nombre:limpiar(p.nombres||p.nombre||p.nombreCompleto),email:limpiar(p.email||p.correo).toLowerCase(),
 carreras:carreras(p),activo:activo(p),pinActivo:activo(p),pinCreado:p.pinCreado===true};}
function permitida(t,p){
 const n=clave(t.carreraNombre||t.carrera||t.nombreCarrera),c=clave(t.carreraCodigo||t.codigoCarrera);
 if(!n&&!c)return false;
 return carreras(p).some(v=>{v=clave(v);return v&&!['*','TODAS','TODOS','ALL'].includes(v)&&(v===n||v===c);});
}
async function perfil(db,actor){
 if(!actor||!actor.uid)negar(401,'SESION_REQUERIDA');
 const q=await db.collection('investigadores').where('authUid','==',actor.uid).limit(2).get();
 let list=q.docs.map(doc);
 if(!list.length&&actor.emailVerified===true&&actor.email){
  const email=limpiar(actor.email).toLowerCase();
  const a=await db.collection('investigadores').where('email','==',email).limit(2).get();
  list=a.docs.map(doc);
  if(!list.length){const b=await db.collection('investigadores').where('correo','==',email).limit(2).get();list=b.docs.map(doc);}
 }
 if(list.length!==1)negar(403,list.length?'PERFIL_AMBIGUO':'INVESTIGADOR_NO_VINCULADO');
 const p=list[0];
 if(p.authUid&&p.authUid!==actor.uid)negar(403,'CUENTA_NO_COINCIDE');
 if(!p.authUid&&(!actor.emailVerified||!actor.email||limpiar(p.email||p.correo).toLowerCase()!==actor.email))negar(403,'CORREO_NO_VERIFICADO');
 if(!activo(p))negar(403,'INVESTIGADOR_DESACTIVADO');
 if(!carreras(p).length)negar(403,'SIN_CARRERAS_ASIGNADAS');
 return p;
}
function pendiente(t){
 const estado=clave(t.estado),proceso=clave(t.estadoProceso),coord=clave(t.estadoCoordinador);
 const validado=t.validadoCoordinador===true||t.coordinadorRevisado===true||coord==='VALIDADO'||clave(t.revisionCoordinador&&t.revisionCoordinador.estado)==='VALIDADO';
 if(!validado||(estado!=='PENDIENTE_INVESTIGADOR'&&proceso!=='PENDIENTE_INVESTIGADOR'))return false;
 if(['DEVUELTO','APROBADO_FINAL'].includes(estado)||['DEVUELTO','APROBADO_FINAL'].includes(proceso))return false;
 if(t.investigacionRevisada===true||t.revisionInvestigador&&clave(t.revisionInvestigador.estado)!=='PENDIENTE')return false;
 if(t.estadoInvestigador&&clave(t.estadoInvestigador)!=='PENDIENTE')return false;
 return true;
}
function fecha(t){
 const v=t.fechaValidacionCoordinador||t.revisionCoordinador&&t.revisionCoordinador.fechaLocal||t.revisadoEnLocal||t.fechaResolucion||t.fechaEnvio||t.creadoEn;
 if(v&&typeof v.toDate==='function')return v.toDate().getTime();
 if(v&&typeof v.seconds==='number')return v.seconds*1000;
 return Date.parse(v||'')||Number.MAX_SAFE_INTEGER;
}
async function cola(db,p){
 const consultas=[];
 for(const carrera of carreras(p))if(!['*','TODAS','TODOS','ALL'].includes(clave(carrera))){
  consultas.push(db.collection('envios').where('carreraClave','==',clave(carrera)).limit(400).get());
  for(const valor of new Set([carrera,carrera.toUpperCase(),carrera.toLowerCase(),clave(carrera)]))
   for(const campo of CAMPOS)consultas.push(db.collection('envios').where(campo,'==',valor).limit(400).get());
 }
 const grupos=await Promise.all(consultas);
 const mapa=new Map();let truncado=false;
 for(const g of grupos){if(g.docs.length>=400)truncado=true;
  for(const s of g.docs){const t=doc(s);if(t&&permitida(t,p)&&pendiente(t))mapa.set(t.id,t);}
 }
 const orden=[...mapa.values()].sort((a,b)=>fecha(a)-fecha(b)||limpiar(a.nombres).localeCompare(limpiar(b.nombres)));
 return {titulos:orden.slice(0,2500).map(filtrar),truncado:truncado||orden.length>2500};
}
function propia(t,p){
 const r=t&&t.revisionInvestigador;
 if(!r||!r.estado||clave(r.estado)==='PENDIENTE')return false;
 const publicP=perfilPublico(p);
 return Boolean(r.investigadorId&&limpiar(r.investigadorId)===p.id||
  r.investigadorCedula&&limpiar(r.investigadorCedula)===publicP.cedula||
  r.investigadorEmail&&limpiar(r.investigadorEmail).toLowerCase()===publicP.email);
}
async function revisados(db,p){
 const pub=perfilPublico(p);
 const filtros=[['revisionInvestigador.investigadorId',p.id],
  ['revisionInvestigador.investigadorCedula',pub.cedula],
  ['revisionInvestigador.investigadorEmail',pub.email]].filter(x=>x[1]);
 const resultados=await Promise.all(filtros.map(x=>db.collection('envios').where(x[0],'==',x[1]).limit(500).get()));
 const mapa=new Map();let truncado=false;
 for(const grupo of resultados){if(grupo.docs.length>=500)truncado=true;
  for(const s of grupo.docs){const d=doc(s);if(propia(d,p))mapa.set(d.id,d);}
 }
 const items=[...mapa.values()].sort((a,b)=>fechaRevision(b)-fechaRevision(a));
 return {titulos:items.slice(0,2500).map(filtrar),truncado:truncado||items.length>2500};
}
function fechaRevision(t){
 const v=t.revisionInvestigador&&t.revisionInvestigador.fechaLocal||t.fechaResolucionInvestigacion||t.investigacionRevisadaEn;
 if(v&&typeof v.toDate==='function')return v.toDate().getTime();
 if(v&&typeof v.seconds==='number')return v.seconds*1000;
 return Date.parse(v||'')||0;
}

const {revisar}=require('./investigadores.revision');
function crearRutasInvestigadores({db}){
 if(!db)throw Error('BASE_INVESTIGADORES_REQUERIDA');
 return {
  '/perfil':{method:'GET',async handle({usuario}){return perfilPublico(await perfil(db,usuario));}},
  '/cola':{method:'GET',async handle({usuario}){return cola(db,await perfil(db,usuario));}},
  '/revisados':{method:'GET',async handle({usuario}){return revisados(db,await perfil(db,usuario));}},
  '/revision':{method:'POST',async handle({usuario,body}){
   const p=await perfil(db,usuario);
   return revisar(db,p,usuario,body,{activo,carreras,permitida,pendiente,perfilPublico,filtrar});
  }}
 };
}
module.exports={crearRutasInvestigadores,perfil,perfilPublico,permitida,carreras,activo,pendiente,revisar};
