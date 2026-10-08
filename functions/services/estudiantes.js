'use strict';

// Servicio exclusivo del estudiante: no aceptar cédulas ni roles autodeclarados.
const ID=/^\d{10}$/;
const PERIOD=/^\d{4}-(0[1-9]|1[0-2])__\d{4}-(0[1-9]|1[0-2])$/;
const FIELDS_ENVIO=[
 'id','cedula','numeroIdentificacion','nombres','carrera','nombreCarrera','carreraNombre','codigoCarrera','carreraCodigo',
 'periodoId','periodoCanonicoId','periodoNombre','periodoLabel','sede','modalidad','estado','estadoProceso',
 'titulosEnviados','propuestasDetalle','titulo1','titulo2','titulo3','tituloElegido','tituloPreferidoNumero','tituloPreferidoTexto',
 'tituloVisible','tituloCoordinador','tituloFinal','tituloFinalInvestigacion','observacionDevolucion',
 'observacionInvestigacion','estadoCoordinador','estadoInvestigador','resultadoInvestigacion','resultadoCoordinador',
 'comentarioCoordinador','revisionCoordinador','revisionInvestigador','validadoCoordinador','coordinadorRevisado',
 'investigacionRevisada','fechaValidacionCoordinador','fechaResolucionInvestigacion','fechaResolucion',
 'fechaEnvio','creadoEn','actualizadoEn','actualizadoEnLocal','requiereRevision','requiereAccionDe',
 'permitirReenvio','puedeReenviar','devueltoPor','numeroEnvios','numeroReenvios','intentosUsados',
 'versionActual','versionActualId','historialProceso','telegram','telegramUser'
];
const FIELDS_EVENTO=['id','tipo','accion','modulo','estado','estadoProceso','fechaLocal','creadoEn','actualizadoEn','revision','observacion','numeroEnvios'];
const FIELDS_VERSION=['id','envioId','tituloId','versionActual','numeroVersion','fechaEnvio','creadoEn','archivadoEn','estado','estadoProceso','titulosEnviados','propuestasDetalle','tituloPreferidoTexto','revisionCoordinador','revisionInvestigador','observacionDevolucion'];

function falla(status,code) {const e=new Error(code);e.status=status;e.code=code;throw e;}
function limpio(s){return String(s===undefined||s===null?'':s).replace(/\s+/g,' ').trim();}
function cedulaValor(value){const s=limpio(value);return ID.test(s)?s:'';}
function periodoValor(value){const s=limpio(value);return PERIOD.test(s)?s:'';}
function propios(actor) {
  const cedula=cedulaValor(actor&&actor.cedula);
  if(!cedula) falla(403,'IDENTIDAD_ESTUDIANTE_NO_VERIFICADA');
  return cedula;
}
function campos(obj,names){
  const salida={};
  for(const n of names)if(obj&&obj[n]!==undefined)salida[n]=obj[n];
  return salida;
}
function periodoDocumento(data){
  return limpio(data&& (data.periodoId||data.periodoCanonicoId||data.periodoNombre||data.periodoLabel));
}
function modoPeriodo(a,b){return Boolean(a&&b&&a===b);}
function datos(snapshot) {return snapshot&&snapshot.exists?{...snapshot.data(),id:snapshot.id}:null;}
function normalizarConfig(raw) {
  const d=raw||{};
  return {
    procesoActivo:d.procesoActivo!==false && d.enviosHabilitados!==false,
    periodoActivoId:periodoValor(d.periodoActivoId||d.periodoActivo&&d.periodoActivo.id||d.periodoActivo),
    periodoActivoLabel:limpio(d.periodoActivoLabel||''),
    periodosActivos:Array.isArray(d.periodosActivos)?d.periodosActivos.filter(periodoValor).slice(0,30):[],
    periodosActivosLabels:Array.isArray(d.periodosActivosLabels)?d.periodosActivosLabels.slice(0,30).map(limpio):[],
    maxIntentos:Math.max(1,Math.min(Number(d.maxIntentos)||1,5)),
    propuestasObligatorias:3,
    iaActiva:d.iaActiva!==false,
    proveedorIA:'gemini', // No enviar tokens ni proveedor con credenciales.
    sheetsActivo:false // Los respaldos con token no deben salir desde navegador.
  };
}
async function configCompleta(operativa) {
 const snap=await operativa.collection('configuracion').doc('general').get();
 if (!snap.exists) falla(503,'CONFIGURACION_NO_DISPONIBLE');
 return {raw:datos(snap)||{},publica:normalizarConfig(datos(snap))};
}
async function informacionAcademica(academica,cedula,config,periodoSolicitado) {
 // Dos consultas INDEPENDIENTES y simultáneas; un error nunca equivale a "no existe".
 if (periodoSolicitado && !periodoValor(periodoSolicitado)) falla(400,'PERIODO_INVALIDO');
 const [estSnap,matSnap]=await Promise.all([
   academica.collection('Estudiante').doc(cedula).get(),
   academica.collection('matriculas').where('cedula','==',cedula).limit(100).get()
 ]);
 let estudiante=datos(estSnap);
 if(!estudiante) {
   const alt=await academica.collection('Estudiante').where('cedula','==',cedula).limit(1).get();
   estudiante=alt.empty?null:datos(alt.docs[0]);
 }
 if(!estudiante||estudiante.eliminado===true)falla(404,'ESTUDIANTE_NO_ENCONTRADO');
 if(cedulaValor(estudiante.cedula||estudiante.numeroIdentificacion||estudiante.id)!==cedula)falla(403,'IDENTIDAD_NO_COINCIDE');
 const mats=matSnap.docs.map(datos).filter(m=>m&&m.eliminado!==true&&m.retirado!==true&&limpio(m.estadoMatricula||'ACTIVO').toUpperCase()==='ACTIVO'&&cedulaValor(m.cedula)===cedula);
 const p=periodoValor(periodoSolicitado)||config.periodoActivoId;
 let mat=p?mats.find(m=>modoPeriodo(periodoValor(m.periodoId),p)):null;
 if(!mat&&!p)mat=mats.slice().sort((a,b)=>limpio(b.periodoId).localeCompare(limpio(a.periodoId)))[0];
 if(!mat)falla(403,'MATRICULA_PERIODO_NO_AUTORIZADA');
 return {
  estudiante:campos(estudiante,['cedula','nombres','nombreCompleto','nombre','correoInstitucional','correoPersonal','celular']),
  matricula:campos(mat,['periodoId','nombreCarrera','codigoCarrera','sede','estadoMatricula','modalidadTitulacion','modalidad','jornada']),
  periodoId:periodoValor(mat.periodoId)
 };
}
async function envioExistente(db,cedula,periodo){
 const id=periodo+'__'+cedula;
 const principal=datos(await db.collection('envios').doc(id).get());
 if(principal&&cedulaValor(principal.cedula||principal.numeroIdentificacion)===cedula&&modoPeriodo(periodoValor(periodoDocumento(principal)),periodo))return principal;
 // Compatibilidad con documentos antiguos por cédula / numeroIdentificacion.
 const [a,b]=await Promise.all([
  db.collection('envios').where('cedula','==',cedula).limit(100).get(),
  db.collection('envios').where('numeroIdentificacion','==',cedula).limit(100).get()
 ]);
 const mapa=new Map();
 [...a.docs,...b.docs].forEach(snap=>{
  const doc=datos(snap);
  if(doc&&cedulaValor(doc.cedula||doc.numeroIdentificacion)===cedula&&modoPeriodo(periodoValor(periodoDocumento(doc)),periodo))mapa.set(doc.id,doc);
 });
 return [...mapa.values()].sort((a,b)=>limpio(b.actualizadoEnLocal||b.fechaEnvio).localeCompare(limpio(a.actualizadoEnLocal||a.fechaEnvio)))[0]||null;
}
function validarTitulos(body){
 const lista=body&&body.titulosEnviados;
 if(!Array.isArray(lista)||lista.length!==3)falla(422,'TRES_TITULOS_REQUERIDOS');
 const nums=new Set();
 const result=lista.map((p,i)=>{
  const numero=Number(p&&p.numero||i+1);
  const titulo=limpio(p&&(p.tituloFinal||p.titulo||p.texto||p.tituloOriginal));
  if(!Number.isInteger(numero)||numero<1||numero>3||nums.has(numero)||titulo.length<20||titulo.length>260)falla(422,'TITULOS_INVALIDOS');
  nums.add(numero);
  return {numero,tituloFinal:titulo,tituloOriginal:limpio(p.tituloOriginal||'').slice(0,260),preferido:false};
 }).sort((a,b)=>a.numero-b.numero);
 const preferido=Number(body&&body.tituloPreferidoNumero);
 if(![1,2,3].includes(preferido))falla(422,'TITULO_PREFERIDO_INVALIDO');
 result.forEach(p=>p.preferido=p.numero===preferido);
 return {propuestas:result,preferido};
}
function infoPublica(academicaData,cedula){
 const e=academicaData.estudiante, m=academicaData.matricula;
 return {
  cedula,nombres:limpio(e.nombres||e.nombreCompleto||e.nombre),
  carrera:limpio(m.nombreCarrera),nombreCarrera:limpio(m.nombreCarrera),
  carreraClave:limpio(m.nombreCarrera).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase(),
  codigoCarrera:limpio(m.codigoCarrera),sede:limpio(m.sede),
  modalidad:limpio(m.modalidadTitulacion||m.modalidad||m.jornada),
  periodoId:academicaData.periodoId,estadoMatricula:limpio(m.estadoMatricula||'ACTIVO').toUpperCase(),
  puedeEnviarTitulo:true
 };
}
function safeEnvio(data) {return data?campos(data,FIELDS_ENVIO):null;}
function safeVersion(d){return campos(d,FIELDS_VERSION);}
function safeEvento(d){return campos(d,FIELDS_EVENTO);}

function crearRutasEstudiantes({operativa,academica,geminiKey}) {
  if(!operativa||!academica) throw Error('BASES_ESTUDIANTE_REQUERIDAS');
  return {
    '/configuracion':{method:'GET',async handle({usuario}){
      propios(usuario);
      return (await configCompleta(operativa)).publica;
    }},
    '/expediente':{method:'GET',async handle({usuario,query}){
      const cedula=propios(usuario);
      if(query.cedula&&limpio(query.cedula)!==cedula)falla(403,'CEDULA_AJENA_NO_AUTORIZADA');
      const config=(await configCompleta(operativa)).publica;
      const academico=await informacionAcademica(academica,cedula,config,query.periodoId);
      const envio=await envioExistente(operativa,cedula,academico.periodoId);
      return {config,estudiante:infoPublica(academico,cedula),envio:safeEnvio(envio)};
    }},
    '/historial':{method:'GET',async handle({usuario,query}){
      const cedula=propios(usuario);
      const config=(await configCompleta(operativa)).publica;
      const academico=await informacionAcademica(academica,cedula,config,query.periodoId);
      const periodo=academico.periodoId;
      const envio=await envioExistente(operativa,cedula,periodo);
      if(!envio)return {versiones:[],eventos:[]};
      // Queries específicas, nunca listar 2500 documentos al estudiante.
      const [versions,versionsAlt,events,eventsAlt]=await Promise.all([
        operativa.collection('versiones_envio').where('envioId','==',envio.id).limit(100).get(),
        operativa.collection('versiones_envio').where('tituloId','==',envio.id).limit(100).get(),
        operativa.collection('workflow_events').where('tituloId','==',envio.id).limit(150).get(),
        operativa.collection('workflow_events').where('entidadId','==',envio.id).limit(150).get()
      ]);
      const match=d=>(!d.cedula||cedulaValor(d.cedula)===cedula)&&(!periodoDocumento(d)||modoPeriodo(periodoValor(periodoDocumento(d)),periodo));
      return {
        versiones:[...new Map([...versions.docs,...versionsAlt.docs].map(d=>[d.id,datos(d)])).values()].filter(match).map(safeVersion),
        eventos:[...new Map([...events.docs,...eventsAlt.docs].map(d=>[d.id,datos(d)])).values()].filter(match).map(safeEvento)
      };
    }},
    '/envio':{method:'POST',async handle({usuario,body}){
      const cedula=propios(usuario);
      if(!body||typeof body!=='object'||Array.isArray(body))falla(400,'FORMULARIO_INVALIDO');
      if(JSON.stringify(body).length>35000)falla(413,'FORMULARIO_DEMASIADO_GRANDE');
      if(body.cedula&&limpio(body.cedula)!==cedula)falla(403,'CEDULA_AJENA_NO_AUTORIZADA');
      const config=(await configCompleta(operativa)).publica;
      if(!config.procesoActivo)falla(403,'PROCESO_CERRADO');
      const academic=await informacionAcademica(academica,cedula,config,body.periodoId);
      if(body.periodoId&&periodoValor(body.periodoId)!==academic.periodoId)falla(403,'PERIODO_AJENO_NO_AUTORIZADO');
      const {propuestas,preferido}=validarTitulos(body);
      const periodo=academic.periodoId,id=periodo+'__'+cedula;
      const historico=await envioExistente(operativa,cedula,periodo);
      if(historico&&historico.id!==id)falla(409,'ENVIO_HISTORICO_DUPLICADO');
      const ref=operativa.collection('envios').doc(id);
      const ahora=new Date().toISOString();
      const resultado=await operativa.runTransaction(async tx=>{
        const prev=datos(await tx.get(ref));
        if(prev&&!((prev.permitirReenvio===true)||(prev.puedeReenviar===true)))falla(409,'ENVIO_YA_REGISTRADO');
        const version=Number(prev&&prev.versionActual||0)+1;
        const numeroEnvios=Number(prev&&(prev.numeroEnvios||prev.intentosUsados)||0)+1;
        const info=infoPublica(academic,cedula);
        const datosEnvio={
          ...info,id,numeroIdentificacion:cedula,carreraNombre:info.carrera,carreraCodigo:info.codigoCarrera,
          periodoCanonicoId:periodo,periodoNombre:periodo,periodoLabel:periodo,
          titulosEnviados:propuestas,propuestasDetalle:propuestas,
          titulo1:propuestas[0].tituloFinal,titulo2:propuestas[1].tituloFinal,titulo3:propuestas[2].tituloFinal,
          tituloPreferidoNumero:preferido,tituloElegido:propuestas[preferido-1].tituloFinal,
          tituloPreferidoTexto:propuestas[preferido-1].tituloFinal,
          telegram:limpio(body.telegramUser||body.telegram||'').slice(0,60),
          estado:'PENDIENTE_REVISION',estadoProceso:'PENDIENTE_COORDINADOR',requiereAccionDe:'COORDINACION',
          requiereRevision:true,permitirReenvio:false,puedeReenviar:false,devueltoPor:'',
          observacionDevolucion:'',validadoCoordinador:false,coordinadorRevisado:false,
          revisionCoordinador:null,revisionInvestigador:null,estadoCoordinador:'PENDIENTE',
          estadoInvestigador:'',investigacionRevisada:false,resultadoCoordinador:null,
          tituloCoordinador:null,resultadoInvestigacion:null,tituloFinalInvestigacion:null,tituloFinal:null,
          numeroEnvios,numeroReenvios:prev?Number(prev.numeroReenvios||0)+1:0,
          intentosUsados:numeroEnvios,versionActual:version,
          versionActualId:id+'__v'+String(version).padStart(3,'0'),
          fechaEnvio:ahora,actualizadoEnLocal:ahora,actualizadoEn:ahora,
          origenCaptura:'estudiantes-api-segura'
        };
        if(!prev)datosEnvio.creadoEn=ahora;
        tx.set(ref,datosEnvio,{merge:!!prev});
        const versionRef=operativa.collection('versiones_envio').doc(datosEnvio.versionActualId);
        tx.set(versionRef,{
          envioId:id,tituloId:id,cedula,periodoId:periodo,versionActual:version,
          titulosEnviados:propuestas,tituloPreferidoTexto:datosEnvio.tituloPreferidoTexto,
          fechaEnvio:ahora,creadoEn:ahora,estado:datosEnvio.estado
        });
        const eventoRef=operativa.collection('workflow_events').doc();
        tx.set(eventoRef,{tituloId:id,entidadId:id,entidad:'envios',cedula,periodoId:periodo,
          tipo:prev?'REENVIO_ESTUDIANTE':'ENVIO_ESTUDIANTE',
          accion:prev?'REENVIO_ESTUDIANTE':'ENVIO_ESTUDIANTE',modulo:'estudiantes',
          numeroEnvios,fechaLocal:ahora,creadoEn:ahora,estado:datosEnvio.estado});
        return datosEnvio;
      });
      return {id,data:safeEnvio(resultado),mensaje:'Envío registrado correctamente.'};
    }},
    '/proveedores':{method:'GET',async handle({usuario}){
      propios(usuario);
      if (!(await configCompleta(operativa)).publica.iaActiva) return [];
      const key=typeof geminiKey==='function'?geminiKey():'';
      return key?[{id:'gemini',activo:true,modelo:'gemini-2.5-flash'}]:[];
    }},
    '/ia':{method:'POST',async handle({usuario,body}){
      propios(usuario);
      if (!(await configCompleta(operativa)).publica.iaActiva) falla(403,'IA_DESACTIVADA');
      const key=typeof geminiKey==='function'?geminiKey():'';
      if(!key)falla(503,'IA_NO_CONFIGURADA');
      const prompt=limpio(body&&body.prompt);
      if(prompt.length<25||prompt.length>6000)falla(422,'PROMPT_INVALIDO');
      // Cuota atómica para no generar gastos ilimitados con una sesión comprometida.
      const hoy=new Date().toISOString().slice(0,10);
      const cuota=operativa.collection('ia_cuotas').doc(usuario.uid+'__'+hoy);
      await operativa.runTransaction(async tx=>{
        const snap=await tx.get(cuota);
        const n=Number(snap.exists&&snap.data().total||0);
        if(n>=20)falla(429,'LIMITE_DIARIO_IA');
        tx.set(cuota,{total:n+1,fecha:hoy,uid:usuario.uid},{merge:true});
      });
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),20000);
      try {
        const response=await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',{
          method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},
          body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{temperature:0.7,maxOutputTokens:450}}),
          signal:controller.signal
        });
        if(!response.ok)falla(503,'IA_PROVEEDOR_ERROR');
        const data=await response.json();
        const texto=(data.candidates||[]).flatMap(x=>x.content&&x.content.parts||[]).map(x=>x.text||'').join('\n').slice(0,4000);
        if(!texto)falla(503,'IA_RESPUESTA_VACIA');
        return {texto,proveedor:'gemini'};
      } catch (error) {
        if(error&&error.status)throw error;
        falla(503,'IA_PROVEEDOR_NO_DISPONIBLE');
      } finally {clearTimeout(timer);}
    }}
  };
}
module.exports={crearRutasEstudiantes,validarTitulos,normalizarConfig,cedulaValor,periodoValor,safeEnvio,infoPublica};
