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
module.exports={canonico,periodoTitulo,activos,permitido,validar,cargar};
