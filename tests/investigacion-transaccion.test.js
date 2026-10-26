'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const firebase=fs.readFileSync(path.join(root,'investigadores/js/firebase.service.js'),'utf8');
const repositorio=fs.readFileSync(path.join(root,'investigadores/js/investigador.repository.js'),'utf8');

function escenario(){
 const title={id:'e1',estado:'PENDIENTE_INVESTIGADOR',estadoProceso:'PENDIENTE_INVESTIGADOR',
  estadoCoordinador:'VALIDADO',validadoCoordinador:true,periodoId:'2026-05__2026-11',
  tituloCoordinadorNumero:1,tituloCoordinador:'Primera propuesta',tituloPreferidoNumero:3,
  titulosEnviados:[{numero:1,tituloFinal:'Primera propuesta'},{numero:2,tituloFinal:'Segunda propuesta'},
    {numero:3,tituloFinal:'Tercera propuesta'}]};
 const rows={envios:{e1:{...title}},investigadores:{i1:{activo:true,pinActivo:true}},
  configuracion:{general:{periodosActivos:['2026-05__2026-11']}},workflow_events:{}};
 let n=0;
 const db={collection:name=>({doc:id=>{
  const ref={name,id:id||'event-'+(++n)};
  return {...ref,get:async()=>({id:ref.id,exists:Boolean(rows[name][ref.id]),data:()=>rows[name][ref.id]})};
 }}),runTransaction:async fn=>{
  const writes=[];
  const tx={get:async ref=>({id:ref.id,exists:Boolean(rows[ref.name][ref.id]),
   data:()=>rows[ref.name][ref.id]}),
   set:(ref,val,opts)=>writes.push({ref,val,opts})};
  const result=await fn(tx);
  writes.forEach(({ref,val,opts})=>{
   rows[ref.name][ref.id]=opts&&opts.merge?{...rows[ref.name][ref.id],...val}:val;
  });
  return result;
 }};
 const window={TA_INVESTIGADORES_CONFIG:{collections:{config:'configuracion',titulos:'envios',logs:'workflow_events'}},
  firebase:{firestore:{FieldValue:{serverTimestamp:()=>({server:true})}}}};
 const source=firebase.replace('  window.TAInvestigadorFirebaseService = Object.freeze({',
  '  db = fakeDb; initialized = true;\n  window.TAInvestigadorFirebaseService = Object.freeze({');
 assert.notEqual(source,firebase);
 new Function('window','fakeDb','console',source)(window,db,console);
 new Function('window','console',repositorio)(window,console);
 const repo=window.TAInvestigadorRepository;
 const investigador={id:'i1',nombre:'Revisor',activo:true,pinActivo:true};
 const view=()=>({...title,raw:{...title}});
 return {rows,repo,view,investigador,events:()=>Object.keys(rows.workflow_events).length};
}

test('dos pestañas no pueden aprobar un mismo expediente dos veces',async()=>{
 const e=escenario(),a=e.view(),b=e.view();
 await e.repo.revisarTitulo(a,'APROBAR','',e.investigador,2,'Segunda propuesta');
 await assert.rejects(()=>e.repo.revisarTitulo(b,'APROBAR','',e.investigador,3,'Tercera propuesta'),
  /resuelto|pendiente/i);
 assert.equal(e.rows.envios.e1.tituloFinal,'Segunda propuesta');
 assert.equal(e.rows.envios.e1.tituloInvestigadorNumero,2);
 assert.equal(e.events(),1);
});
test('modificación concurrente de Coordinación invalida una pestaña abierta',async()=>{
 const e=escenario(),abierta=e.view();
 e.rows.envios.e1.tituloCoordinadorNumero=2;
 await assert.rejects(()=>e.repo.revisarTitulo(abierta,'APROBAR','',e.investigador,3,'Tercera propuesta'),
  /cambió|Actualiza/i);
 assert.equal(e.rows.envios.e1.estado,'PENDIENTE_INVESTIGADOR');
 assert.equal(e.events(),0);
});
test('el cierre de un período impide la transacción y no crea auditorías incompletas',async()=>{
 const e=escenario();
 e.rows.configuracion.general.periodosActivos=[];
 await assert.rejects(()=>e.repo.revisarTitulo(e.view(),'APROBAR','',e.investigador,2,'Segunda propuesta'),
  /desactivado/i);
 assert.equal(e.events(),0);
 assert.equal(e.rows.envios.e1.estado,'PENDIENTE_INVESTIGADOR');
});
test('el historial y el expediente se escriben juntos',async()=>{
 const e=escenario();
 await e.repo.revisarTitulo(e.view(),'APROBAR','Redacción delimitada académicamente',e.investigador,2,
  'Evaluación de procesos administrativos en Quito durante 2026');
 assert.equal(e.events(),1);
 assert.equal(e.rows.envios.e1.tituloFinal,'Evaluación de procesos administrativos en Quito durante 2026');
 assert.equal(e.rows.envios.e1.revisionInvestigador.corrigioTitulo,true);
 const event=Object.values(e.rows.workflow_events)[0];
 assert.equal(event.revision.tituloSeleccionadoTextoOriginal,'Segunda propuesta');
});


// Un simple cambio de metadata no invalida una selección académica intacta.
test('metadatos auxiliares no provocan falsos conflictos de revisión',async()=>{
 const e=escenario(),abierta=e.view();
 e.rows.envios.e1.actualizadoEnLocal='2026-10-26T12:00:00-05:00';
 await e.repo.revisarTitulo(abierta,'APROBAR','',e.investigador,2,'Segunda propuesta');
 assert.equal(e.rows.envios.e1.estadoProceso,'APROBADO_FINAL');
 assert.equal(e.events(),1);
});
test('cambio de versión académica bloquea guardados obsoletos aun con mismo estado',async()=>{
 const e=escenario(),abierta=e.view();
 e.rows.envios.e1.versionActual=2;
 e.rows.envios.e1.versionActualId='e1__v002';
 await assert.rejects(()=>e.repo.revisarTitulo(abierta,'APROBAR','',e.investigador,2,'Segunda propuesta'),
  /cambi[oó]|Actualiza/i);
 assert.equal(e.events(),0);
 assert.equal(e.rows.envios.e1.estadoProceso,'PENDIENTE_INVESTIGADOR');
});


test('aprobar con observación guarda el título, observación e historial de forma atómica',async()=>{
 const e=escenario(),abierta=e.view();
 const observacion='Se aprueba el título con observaciones académicas de redacción.';
 await e.repo.revisarTitulo(abierta,'APROBAR_OBSERVACION',observacion,e.investigador,2,'Segunda propuesta');
 const guardado=e.rows.envios.e1;
 assert.equal(guardado.estado,'APROBADO_FINAL');
 assert.equal(guardado.estadoProceso,'APROBADO_FINAL');
 assert.equal(guardado.estadoInvestigador,'APROBADO_CON_OBSERVACION');
 assert.equal(guardado.resultadoInvestigacion,'APROBADO_CON_OBSERVACION');
 assert.equal(guardado.observacionInvestigacion,observacion);
 assert.equal(guardado.revisionInvestigador.observacion,observacion);
 assert.equal(guardado.tituloInvestigadorNumero,2);
 assert.equal(guardado.tituloFinal,'Segunda propuesta');
 assert.equal(e.events(),1);
 assert.equal(Object.values(e.rows.workflow_events)[0].revision.observacion,observacion);
 await assert.rejects(()=>e.repo.revisarTitulo(abierta,'APROBAR_OBSERVACION',observacion,e.investigador,2,'Segunda propuesta'),
  /resuelto|pendiente/i);
 assert.equal(e.events(),1);
});

test('aprobar con observación no guarda si falta comentario y no se invalida por metadatos',async()=>{
 const e=escenario(),abierta=e.view();
 await assert.rejects(()=>e.repo.revisarTitulo(abierta,'APROBAR_OBSERVACION','',e.investigador,2,'Segunda propuesta'),
  /observación/i);
 assert.equal(e.events(),0);
 e.rows.envios.e1.actualizadoEnLocal='2026-10-26T12:45:00-05:00';
 await e.repo.revisarTitulo(abierta,'APROBAR_OBSERVACION','Revisar delimitación temporal',e.investigador,2,'Segunda propuesta');
 assert.equal(e.rows.envios.e1.estadoProceso,'APROBADO_FINAL');
 assert.equal(e.events(),1);
});


test('cambios en metadatos de propuestas no bloquean una decisión idéntica',async()=>{
 const e=escenario(),abierta=e.view();
 e.rows.envios.e1.titulosEnviados=e.rows.envios.e1.titulosEnviados.map(p=>({...p}));
 e.rows.envios.e1.titulosEnviados[1].editorInterno='Coordinación';
 e.rows.envios.e1.revisionCoordinador={estado:'VALIDADO',tituloSeleccionadoNumero:1};
 abierta.raw.revisionCoordinador={estado:'VALIDADO',tituloSeleccionadoNumero:1};
 await e.repo.revisarTitulo(abierta,'APROBAR_OBSERVACION','Observación académica informativa',
  e.investigador,2,'Segunda propuesta');
 assert.equal(e.rows.envios.e1.estadoProceso,'APROBADO_FINAL');
 assert.equal(e.events(),1);
});
test('cambio real del texto de una propuesta bloquea la aprobación sin escribir',async()=>{
 const e=escenario(),abierta=e.view();
 e.rows.envios.e1.titulosEnviados=e.rows.envios.e1.titulosEnviados.map(p=>({...p}));
 e.rows.envios.e1.titulosEnviados[1].tituloFinal='Propuesta modificada por Coordinación';
 await assert.rejects(()=>e.repo.revisarTitulo(abierta,'APROBAR_OBSERVACION',
  'Observación académica informativa',e.investigador,2,'Segunda propuesta'),
  /cambió|cambi[oó]|propuestas|Actualiza/i);
 assert.equal(e.events(),0);
});
test('rechazo de permisos no puede mostrarse como aprobación guardada',async()=>{
 const e=escenario(),abierta=e.view();
 e.rows.configuracion.general.periodosActivos=[];
 await assert.rejects(()=>e.repo.revisarTitulo(abierta,'APROBAR_OBSERVACION',
  'Se delimita la redacción académica',e.investigador,2,'Segunda propuesta'),/desactivado/i);
 assert.equal(e.events(),0);
});
