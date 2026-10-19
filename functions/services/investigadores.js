'use strict';
const periodos=require('./periodos-activos');
const FIELDS=['id','cedula','numeroIdentificacion','nombres','carrera','carreraNombre','nombreCarrera','carreraCodigo','codigoCarrera','periodoId','periodoCanonicoId','periodoNombre','periodoLabel','tipoTrabajo','modalidadTitulacion','estado','estadoProceso','estadoCoordinador','estadoInvestigador','validadoCoordinador','validadoCoordinacion','coordinadorRevisado','revisionCoordinador','revisionInvestigador','investigacionRevisada','investigacionRevisadaEn','fechaValidacionCoordinador','fechaColaInvestigacion','fechaResolucionInvestigacion','fechaEnvio','fechaResolucion','creadoEn','actualizadoEnLocal','numeroEnvios','numeroReenvios','tituloPreferidoNumero','tituloCoordinadorNumero','tituloAdminSeleccionadoNumero','tituloAdminSeleccionadoTexto','habilitadoInvestigacionPorAdmin','revisionAdministrativa','tituloPreferidoTexto','tituloElegido','tituloCoordinador','tituloFinal','tituloFinalInvestigacion','resultadoCoordinador','resultadoInvestigacion','titulosEnviados','propuestasDetalle','titulo1','titulo2','titulo3','devueltoPor','observacionDevolucion','puedeReenviar','permitirReenvio'];
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
// Investigación es una cola institucional; el acceso depende del perfil activo.
function permitida(t,p){return Boolean(t && activo(p));}
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
 return p;
}
function pendiente(t){
 if(!t)return false;
 const estado=clave(t.estado),proceso=clave(t.estadoProceso);
 const coord=clave(t.estadoCoordinador||(t.revisionCoordinador&&t.revisionCoordinador.estado));
 const inv=clave(t.estadoInvestigador||(t.revisionInvestigador&&t.revisionInvestigador.estado));
 const cerrados=['APROBADO_FINAL','DEVUELTO','ARCHIVADO','BORRADOR_REINICIADO'];
 if(cerrados.includes(estado)||cerrados.includes(proceso)||coord==='DEVUELTO')return false;
 if(t.investigacionRevisada===true||(inv&&inv!=='PENDIENTE'))return false;
 const validado=t.validadoCoordinador===true||t.validadoCoordinacion===true||t.coordinadorRevisado===true||
  ['VALIDADO','APROBADO','APROBADO_CON_OBSERVACION'].includes(coord)||
  estado==='PENDIENTE_INVESTIGADOR'||proceso==='PENDIENTE_INVESTIGADOR';
 return validado&&Array.isArray(t.titulosEnviados)&&t.titulosEnviados.length>0;
}
function fecha(t){
 const v=t.fechaValidacionCoordinador||t.revisionCoordinador&&t.revisionCoordinador.fechaLocal||t.revisadoEnLocal||t.fechaResolucion||t.fechaEnvio||t.creadoEn;
 if(v&&typeof v.toDate==='function')return v.toDate().getTime();
 if(v&&typeof v.seconds==='number')return v.seconds*1000;
 return Date.parse(v||'')||Number.MAX_SAFE_INTEGER;
}
async function cola(db,p){
 // Paginar por documento evita que los expedientes antiguos oculten pendientes nuevos.
 const habilitados=await periodos.cargar(db);
  const mapa=new Map();let cursor=null;
 do {
  let query=db.collection('envios').orderBy('__name__').limit(500);
  if(cursor)query=query.startAfter(cursor);
  const page=await query.get();
  for(const snap of page.docs){const t=doc(snap);if(permitida(t,p)&&pendiente(t)&&periodos.permitido(t,habilitados))mapa.set(t.id,t);}
  cursor=page.docs.length===500?page.docs[page.docs.length-1]:null;
 }while(cursor);
 const orden=[...mapa.values()].sort((a,b)=>fecha(a)-fecha(b)||limpiar(a.nombres).localeCompare(limpiar(b.nombres)));
 return {titulos:orden.map(filtrar),truncado:false};
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
  const resultados=await Promise.all([
    ...filtros.map(x=>db.collection('envios').where(x[0],'==',x[1]).limit(500).get()),
    db.collection('workflow_events').where('revision.investigadorId','==',p.id).limit(500).get()
  ]);
  const mapa=new Map();let truncado=false;
  function agregar(t,idBase){
    if(!propia(t,p))return;
    const r=t.revisionInvestigador||{};
    const key=idBase+'|'+limpiar(r.fechaLocal||'')+'|'+clave(r.estado);
    if(!mapa.has(key))mapa.set(key,t);
  }
  resultados.slice(0,-1).forEach(grupo=>{
    if(grupo.docs.length>=500)truncado=true;
    grupo.docs.forEach(s=>{const t=doc(s);if(t)agregar(t,t.id);});
  });
  const eventos=resultados[resultados.length-1];
  if(eventos.docs.length>=500)truncado=true;
  eventos.docs.forEach(s=>{
    const e=doc(s),r=e&&e.revision||{};
    if(!e||e.modulo!=='investigadores'||limpiar(r.investigadorId)!==p.id)return;
    if(!['APROBADO','APROBADO_CON_OBSERVACION','DEVUELTO'].includes(clave(r.estado)))return;
    const id=limpiar(e.tituloId||e.entidadId);
    if(!id)return;
    agregar({
      id:id+'__revision__'+s.id,cedula:e.cedula||'',carreraNombre:e.carrera||'',
      periodoId:e.periodoId||'',fechaResolucionInvestigacion:r.fechaLocal||e.fechaLocal||'',
      estadoInvestigador:r.estado,revisionInvestigador:r,investigacionRevisada:true
    },id);
  });
  // Recuperar rondas históricas incluso si no hubo evento secundario.
  let cursor=null;
  do {
    let query=db.collection('envios').orderBy('__name__').limit(500);
    if(cursor)query=query.startAfter(cursor);
    const page=await query.get();
    for(const snap of page.docs){
      const expediente=doc(snap);
      if(!expediente)continue;
      (Array.isArray(expediente.historialProceso)?expediente.historialProceso:[]).forEach((h,i)=>{
        const r=h&&h.revisionInvestigador;
        if(!r||!['APROBADO','APROBADO_CON_OBSERVACION','DEVUELTO'].includes(clave(r.estado)))return;
        agregar({...expediente,
          id:expediente.id+'__historico__'+String(h.version||i),
          revisionInvestigador:r,estadoInvestigador:r.estado,investigacionRevisada:true,
          fechaResolucionInvestigacion:r.fechaLocal||r.fecha||h.fechaArchivo||'',
          tituloCoordinador:h.tituloCoordinador||expediente.tituloCoordinador||'',
          historialProceso:[]},expediente.id);
      });
    }
    cursor=page.docs.length===500?page.docs[page.docs.length-1]:null;
  }while(cursor);
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
