'use strict';

// La lista periodosActivos del Administrador es la fuente de verdad.
// IDs parciales (ej. 2026-02) y etiquetas no conceden acceso a revisión.
const COMPLETO=/^(\d{4})[-_](0?[1-9]|1[0-2])(?:__|[-_\s]+)(\d{4})[-_](0?[1-9]|1[0-2])$/;
function canonico(input){
 const value=String(input===undefined||input===null?'':input).trim();
 const m=COMPLETO.exec(value);
 if(!m)return '';
 const pad=s=>String(s).padStart(2,'0');
 return m[1]+'-'+pad(m[2])+'__'+m[3]+'-'+pad(m[4]);
}

const MESES=['Enero','Febrero','Marzo','Abril','Mayo','Junio',
 'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
function etiqueta(id){
 const value=canonico(id),m=/^(\d{4})-(\d{2})__(\d{4})-(\d{2})$/.exec(value);
 if(!m)return '';
 return MESES[Number(m[2])-1]+' '+m[1]+' a '+MESES[Number(m[4])-1]+' '+m[3];
}
function camposConfig(lista){
 const ids=[...new Set(lista.map(canonico).filter(Boolean))].slice(0,30);
 const principal=ids[0]||'',label=principal?etiqueta(principal):'';
 return {periodosActivos:ids,periodosActivosLabels:ids.map(etiqueta),
  periodoActivo:principal?{id:principal,label}:null,
  periodoActivoId:principal,periodoActivoLabel:label,
  periodoActivoIdNormalizado:principal?principal.replace(/[^0-9A-Za-z]+/g,'_').replace(/^_+|_+$/g,''):'',
  periodoActivoDesactivado:!principal};
}
function editarLista(config,id,habilitar){
 const original=[...activos(config)];
 if(habilitar&&!original.includes(id))original.push(id);
 if(!habilitar)return original.filter(x=>x!==id);
 return original;
}
async function actualizarEstado(db,usuario,body){
 const id=canonico(body&&body.periodoId);
 if(!id||!(body&&typeof body.activo==='boolean')){
  const e=new Error('PERIODO_INVALIDO');e.code=e.message;e.status=422;throw e;
 }
 const ref=db.collection('configuracion').doc('general');
 const ahora=new Date().toISOString();
 return db.runTransaction(async tx=>{
  const snapshot=await tx.get(ref);
  const lista=editarLista(snapshot.exists?snapshot.data():{},id,body.activo);
  if(lista.length>30){
   const e=new Error('LIMITE_PERIODOS_ACTIVOS');e.code=e.message;e.status=422;throw e;
  }
  const campos=camposConfig(lista);
  tx.set(ref,{...campos,actualizadoEn:ahora},{merge:true});
  tx.set(db.collection('workflow_events').doc(),{
   tipo:'ADMIN_CAMBIO_PERIODO',modulo:'administradores',entidad:'configuracion',
   entidadId:'general',periodoId:id,estado:body.activo?'ACTIVO':'DESACTIVADO',
   periodosActivos:campos.periodosActivos,fechaLocal:ahora,
   realizadoPorUid:usuario.uid
  });
  return {periodoId:id,activo:body.activo,...campos};
 });
}

function periodoTitulo(doc){
 if(!doc||typeof doc!=='object')return '';
 return canonico(doc.periodoCanonicoId)||canonico(doc.periodoId)||canonico(doc.periodo&&doc.periodo.id)||'';
}
function activos(config){
 if(!config||typeof config!=='object')return new Set();
 // Un array vacío explícito significa TODOS DESACTIVADOS, incluso si quedó un ID principal antiguo.
 if(Array.isArray(config.periodosActivos))return new Set(config.periodosActivos.map(canonico).filter(Boolean));
 if(config.periodoActivoDesactivado===true)return new Set();
 const principal=config.periodoActivoId||config.periodoActivo&&config.periodoActivo.id||config.periodoActivo;
 const id=canonico(principal);return id?new Set([id]):new Set();
}
function permitido(doc,lista){const periodo=periodoTitulo(doc);return Boolean(periodo&&lista.has(periodo));}
function validar(doc,lista){
 if(!permitido(doc,lista)){
  const e=new Error('PERIODO_DESACTIVADO');e.status=409;e.code='PERIODO_DESACTIVADO';throw e;
 }
}
async function cargar(db){
 const snap=await db.collection('configuracion').doc('general').get();
 if(!snap.exists){const e=new Error('CONFIGURACION_PERIODOS_NO_DISPONIBLE');e.status=503;e.code='CONFIGURACION_PERIODOS_NO_DISPONIBLE';throw e;}
 return activos(snap.data());
}
module.exports={canonico,etiqueta,camposConfig,actualizarEstado,periodoTitulo,activos,permitido,validar,cargar};
