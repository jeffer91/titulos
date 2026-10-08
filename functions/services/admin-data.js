'use strict';
// Listas explícitas para reportes de Administración: sin claves, tokens ni documentos completos.
const {fail}=require('./admin-config');
const STUDENT=[
 'id','cedula','numeroIdentificacion','identificacion','nombres','nombre','nombreCompleto',
 'nombreCarreraActual','codigoCarreraActual','nombreCarrera','codigoCarrera','carrera',
 'periodoId','ultimoPeriodoId','periodoNombre','periodoLabel','periodo','sede',
 'estado','estadoMatricula','eliminado'
];
const MATRICULA=[
 'id','cedula','numeroIdentificacion','nombres','nombreCarrera','codigoCarrera','carrera',
 'periodoId','periodoNombre','periodoLabel','sede','estadoMatricula','estado','jornada',
 'modalidadTitulacion','modalidad','retirado','eliminado'
];
const ENVIO=[
 'id','cedula','numeroIdentificacion','nombres','nombre','nombreCompleto','carrera','nombreCarrera',
 'carreraNombre','codigoCarrera','carreraCodigo','periodoId','periodoCanonicoId','periodoLabel',
 'periodoNombre','sede','modalidad','tipoTrabajo','estado','estadoProceso','estadoCoordinador',
 'estadoInvestigador','resultadoCoordinador','resultadoInvestigacion','titulosEnviados',
 'propuestasDetalle','titulo1','titulo2','titulo3','tituloPreferidoNumero','tituloElegido',
 'tituloPreferidoTexto','tituloCoordinador','tituloFinalInvestigacion','tituloFinal',
 'revisionCoordinador','revisionInvestigador','validadoCoordinador','coordinadorRevisado',
 'investigacionRevisada','fechaEnvio','fechaValidacionCoordinador','fechaResolucion',
 'fechaResolucionInvestigacion','investigacionRevisadaEn','actualizadoEnLocal','creadoEn',
 'numeroEnvios','intentosUsados','numeroReenvios','devueltoPor','observacionDevolucion',
 'requiereRevision','requiereAccionDe','permitirReenvio','puedeReenviar','telegram','telegramUser'
];
const text=value=>String(value===undefined||value===null?'':value).trim();
const cedula=v=>text(v).replace(/\D/g,'');
function proyectar(src,fields,id){
 const result={id,_docId:id};
 for(const field of fields)if(src&&src[field]!==undefined)result[field]=src[field];
 // Document identity is server-side, never allow a user field to redefine it.
 result.id=id;result._docId=id;
 return result;
}
async function paginas(db,col,fields,max=5000,page=250){
 let last=null,found=[];
 for(let p=0;p<Math.ceil(max/page)+1;p++){
  let q=db.collection(col).orderBy('__name__').limit(page);
  if(last)q=q.startAfter(last);
  const snap=await q.get();
  for(const d of snap.docs)found.push(proyectar(d.data(),fields,d.id));
  if(found.length>max)fail(409,'PAGINACION_OBLIGATORIA');
  if(snap.docs.length<page)return found;
  last=snap.docs[snap.docs.length-1];
 }
 fail(409,'PAGINACION_OBLIGATORIA');
}
async function estudiantes(academica){
 if(!academica)fail(503,'ACADEMICO_NO_DISPONIBLE');
 const [raw,matriculas]=await Promise.all([
  paginas(academica,'Estudiante',STUDENT),
  paginas(academica,'matriculas',MATRICULA)
 ]);
 const byCedula=new Map(raw.filter(e=>e.eliminado!==true).map(e=>[cedula(e.cedula||e.numeroIdentificacion||e.id),e]));
 const fusionados=matriculas.filter(m=>m.eliminado!==true&&m.retirado!==true).map(m=>{
  const id=cedula(m.cedula||m.numeroIdentificacion);
  const e=byCedula.get(id)||{};
  return {...e,...m,cedula:id,nombres:e.nombres||e.nombreCompleto||m.nombres||'',
   nombreCarrera:m.nombreCarrera||m.carrera||e.nombreCarreraActual||e.nombreCarrera||'',
   codigoCarrera:m.codigoCarrera||e.codigoCarreraActual||'',sede:m.sede||e.sede||'',
   periodoId:m.periodoId||m.periodoIdOriginal||'',id:m.id,_docId:m._docId};
 });
 const conMatricula=new Set(fusionados.map(m=>m.cedula));
 for(const [id,e] of byCedula)if(id&&!conMatricula.has(id))fusionados.push({
  ...e,cedula:id,nombreCarrera:e.nombreCarreraActual||e.nombreCarrera||'',
  codigoCarrera:e.codigoCarreraActual||e.codigoCarrera||'',periodoId:e.periodoId||e.ultimoPeriodoId||''
 });
 return fusionados;
}
async function envios(operativa){return paginas(operativa,'envios',ENVIO);}
async function archivar(operativa,body,actor){
 const id=text(body&&body.tituloId),motivo=text(body&&body.motivo);
 if(!id||id.length>180||id.includes('/')||motivo.length>400)fail(422,'ARCHIVO_INVALIDO');
 const ref=operativa.collection('envios').doc(id),ahora=new Date().toISOString();
 const v=await operativa.runTransaction(async tx=>{
  const snap=await tx.get(ref);
  if(!snap.exists)fail(404,'ENVIO_NO_ENCONTRADO');
  const original=snap.data();
  if(original.estado==='BORRADOR_REINICIADO'||original.estado==='ARCHIVADO')fail(409,'YA_ARCHIVADO');
  const archiveId=id+'__'+Date.now();
  // Si cambia otra decisión durante la transacción, Firestore reintenta o aborta.
  tx.set(operativa.collection('versiones_envio').doc(archiveId),{
   ...proyectar(original,ENVIO,archiveId),idOriginal:id,envioId:id,
   archivadoEn:ahora,motivoArchivo:motivo||'Reinicio administrativo'
  });
  const changes={estado:'BORRADOR_REINICIADO',estadoProceso:'BORRADOR_REINICIADO',
   intentosUsados:0,actualizadoEnLocal:ahora,requiereAccionDe:'ESTUDIANTE',
   permitirReenvio:true,puedeReenviar:true};
  tx.set(ref,changes,{merge:true});
  tx.set(operativa.collection('workflow_events').doc(),{
   tipo:'ADMIN_ARCHIVAR_INTENTO',modulo:'administradores',entidad:'envios',
   entidadId:id,tituloId:id,motivo:motivo||'Reinicio administrativo',
   fechaLocal:ahora,realizadoPorUid:actor.uid
  });
  return {id,archiveId};
 });
 return v;
}
module.exports={estudiantes,envios,archivar,paginas,proyectar};
