'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {preparar}=require('../administradores/js/admin.workflow');
const initial=()=>({estado:'PENDIENTE_COORDINADOR',estadoProceso:'PENDIENTE_COORDINADOR',titulosEnviados:[1,2,3].map(n=>({numero:n,tituloFinal:'Propuesta de prueba '+n})),tituloPreferidoNumero:1});
function run(d,accion,n=1,extras={}){return {...d,...preparar(d,{accion,propuestaNumero:n,motivo:'Revisión administrativa de prueba',estadoEsperado:d.estado,procesoEsperado:d.estadoProceso,tituloOriginalEsperado:d.titulosEnviados.find(p=>p.numero===n).tituloFinal,...extras},'2026-10-19T22:00:00Z')};}
test('dos aprobaciones sobre la misma propuesta cierran el proceso y conservan autoría',()=>{let d=run(initial(),'APROBAR_COORDINACION');assert.equal(d.estado,'PENDIENTE_INVESTIGADOR');assert.equal(d.procesoCerrado,false);assert.throws(()=>run(d,'APROBAR_INVESTIGACION',2),/misma propuesta/);d=run(d,'APROBAR_INVESTIGACION');assert.equal(d.estado,'APROBADO_FINAL');assert.equal(d.revisionCoordinador.origen,'ADMINISTRACION');assert.equal(d.revisionInvestigador.origen,'ADMINISTRACION');assert.equal(d.historialProceso.length,2);});
test('no permite investigación antes de coordinación ni una ficha obsoleta',()=>{assert.throws(()=>run(initial(),'APROBAR_INVESTIGACION'),/Coordinación/);assert.throws(()=>run(initial(),'APROBAR_COORDINACION',1,{estadoEsperado:'DEVUELTO'}),/cambió/);});
test('devolver a investigación conserva coordinación; devolver a coordinación reinicia ambas',()=>{let d=run(run(initial(),'APROBAR_COORDINACION'),'APROBAR_INVESTIGACION');assert.throws(()=>run(d,'ENVIAR_COORDINACION'),/reapertura/);let x=run(d,'ENVIAR_INVESTIGACION',1,{reabrirAprobado:true});assert.equal(x.estadoCoordinador,'VALIDADO');assert.equal(x.revisionInvestigador,null);x=run(d,'ENVIAR_COORDINACION',1,{reabrirAprobado:true});assert.equal(x.revisionCoordinador,null);assert.equal(x.tituloFinal,null);});
test('devolución al estudiante conserva propuestas y habilita reenvío',()=>{let d=run(initial(),'DEVOLVER_ESTUDIANTE');assert.equal(d.titulosEnviados.length,3);assert.equal(d.puedeReenviar,true);assert.equal(d.requiereAccionDe,'ESTUDIANTE');assert.ok(d.motivoDevolucion);});
test('borrado individual mantiene números estables y no altera aprobación de otra propuesta',()=>{let d=run(run(initial(),'APROBAR_COORDINACION'),'APROBAR_INVESTIGACION');d=run(d,'BORRAR_TITULO',2,{reabrirAprobado:true});assert.deepEqual(d.titulosEnviados.map(p=>p.numero),[1,3]);assert.equal(d.estado,'APROBADO_FINAL');assert.equal(d.titulo2,'');d=run(d,'BORRAR_TITULO',1,{reabrirAprobado:true});assert.equal(d.estado,'PENDIENTE_COORDINADOR');assert.equal(d.tituloPreferidoNumero,null);assert.equal(d.tituloFinal,null);d=run(d,'BORRAR_TITULO',3);assert.equal(d.estado,'BORRADOR_REINICIADO');assert.equal(d.puedeReenviar,true);});

test('Administración modifica y aprueba sin revisiones de otros roles',()=>{
 const d=run(initial(),'CORREGIR_APROBAR',3,{tituloCorregido:'Análisis de la seguridad ciudadana y prevención comunitaria en Quito'});
 assert.equal(d.estado,'APROBADO_FINAL');assert.equal(d.estadoProceso,'APROBADO_FINAL');
 assert.equal(d.procesoCerrado,true);assert.equal(d.aprobadoPorAdministracion,true);
 assert.equal(d.requiereAccionDe,'');assert.equal(d.tituloFinal,'Análisis de la seguridad ciudadana y prevención comunitaria en Quito');
 assert.equal(d.titulosEnviados[2].tituloFinal,d.tituloFinal);assert.equal(d.titulo3,d.tituloFinal);
 assert.equal(d.titulosEnviados[2].tituloOriginalAdministracion,'Propuesta de prueba 3');
 assert.equal(d.tituloPreferidoNumero,1);assert.equal(d.revisionCoordinador,null);
 assert.equal(d.revisionInvestigador,null);
 assert.equal(d.historialProceso[0].tituloOriginal,'Propuesta de prueba 3');
 assert.equal(d.historialProceso[0].tituloResultante,d.tituloFinal);
});
test('Administración aprueba también sin editar y sin doble aprobación',()=>{
 const d=run(initial(),'APROBAR',2);
 assert.equal(d.estadoProceso,'APROBADO_FINAL');assert.equal(d.tituloFinal,'Propuesta de prueba 2');
 assert.equal(d.aprobadoPorAdministracion,true);assert.equal(d.tituloAdminSeleccionadoNumero,2);
 assert.equal(d.investigacionRevisada,false);
});
test('Administración exige texto válido y reapertura para modificar uno aprobado',()=>{
 const corregido='Título administrativo completo corregido y definitivo';
 assert.throws(()=>run(initial(),'CORREGIR_APROBAR',1,{tituloCorregido:'corto'}),/20 y 260/);
 assert.throws(()=>run(initial(),'CORREGIR_APROBAR',1,{tituloCorregido:'Propuesta de prueba 1'}),/distinto/);
 let d=run(initial(),'CORREGIR_APROBAR',1,{tituloCorregido:corregido});
 assert.throws(()=>run(d,'CORREGIR_APROBAR',1,{tituloCorregido:'Otro título académico completo y corregido'}),/reapertura/);
 d=run(d,'CORREGIR_APROBAR',1,{tituloCorregido:'Otro título académico completo y corregido',reabrirAprobado:true});
 assert.equal(d.tituloFinal,'Otro título académico completo y corregido');
 assert.equal(d.historialProceso.length,2);assert.equal(d.historialProceso[1].tituloOriginal,corregido);
});

test('la aprobación directa limpia observaciones obsoletas pero mantiene su historial',()=>{
 const previa=initial();
 previa.estado='DEVUELTO';previa.estadoProceso='DEVUELTO';
 previa.estadoCoordinador='DEVUELTO';previa.comentarioCoordinador='Motivo antiguo coordinador';
 previa.observacionInvestigacion='Nota antigua de investigador';
 previa.ultimoCoordinador='Responsable anterior';
 previa.revisionCoordinador={estado:'DEVUELTO',observacion:'Motivo antiguo coordinador'};
 const d=run(previa,'CORREGIR_APROBAR',1,{tituloCorregido:'Evaluación del modelo de seguridad comunitaria en Quito'});
 assert.equal(d.estado,'APROBADO_FINAL');assert.equal(d.estadoCoordinador,'');
 assert.equal(d.comentarioCoordinador,'');assert.equal(d.observacionInvestigacion,'');
 assert.equal(d.ultimoCoordinador,'');assert.equal(d.revisionCoordinador,null);
 assert.equal(d.historialProceso[0].revisionCoordinadorAnterior.observacion,'Motivo antiguo coordinador');
});
test('las correcciones sucesivas conservan la primera propuesta original y las versiones anteriores',()=>{
 let d=run(initial(),'CORREGIR_APROBAR',1,{tituloCorregido:'Primera redacción corregida del título académico'});
 d=run(d,'CORREGIR_APROBAR',1,{tituloCorregido:'Segunda redacción corregida del título académico',reabrirAprobado:true});
 assert.equal(d.titulosEnviados[0].tituloOriginalAdministracion,'Propuesta de prueba 1');
 assert.equal(d.historialProceso[1].tituloOriginal,'Primera redacción corregida del título académico');
 assert.equal(d.tituloFinal,'Segunda redacción corregida del título académico');
});
test('la reapertura de un título aprobado exige justificación suficiente',()=>{
 const d=run(initial(),'APROBAR',1);
 assert.throws(()=>run(d,'CORREGIR_APROBAR',1,{
  tituloCorregido:'Título profesional corregido para la reapertura',
  reabrirAprobado:true,motivo:'Muy corto'
 }),/15 caracteres/);
});

test('resolución directa no aparenta una aprobación de Coordinación cuando no existió',()=>{
 const previa=initial();
 previa.tituloSeleccionadoTexto='Selección anterior sin validación';
 previa.tituloSeleccionadoNumero=1;
 const d=run(previa,'CORREGIR_APROBAR',2,{tituloCorregido:'Título definitivo establecido de forma directa por Administración'});
 assert.equal(d.estado,'APROBADO_FINAL');
 assert.equal(d.tituloAdminSeleccionadoNumero,2);
 assert.equal(d.tituloAdminSeleccionadoTexto,'Título definitivo establecido de forma directa por Administración');
 assert.equal(d.tituloSeleccionadoTexto,'');
 assert.equal(d.tituloSeleccionadoNumero,null);
 assert.equal(d.tituloCoordinador,null);
 assert.equal(d.revisionCoordinador,null);
 assert.equal(d.validadoCoordinador,false);
 assert.equal(d.validadoCoordinacion,false);
});
