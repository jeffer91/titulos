'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const P='2026-05__2026-11';
const P2='2026-04__2026-09';
const sent={id:'doc1',cedula:'1700000001',periodoId:P,carreraNombre:'SEGURIDAD ONLINE',
 estado:'PENDIENTE_INVESTIGADOR',estadoProceso:'PENDIENTE_INVESTIGADOR',
 estadoCoordinador:'VALIDADO',estadoInvestigador:'PENDIENTE',
 titulosEnviados:[{numero:1,tituloFinal:'Diagnóstico de seguridad pública en Quito'}]};
const approved={id:'doc2',cedula:'1700000002',periodoId:P,carreraNombre:'CONTABILIDAD',
 estado:'APROBADO_FINAL',estadoProceso:'APROBADO_FINAL',procesoCerrado:true,
 titulosEnviados:[{numero:1,tituloFinal:'Evaluación contable'}]};
const alumnos=[
 {id:'1700000001',cedula:'1700000001',periodoId:P,nombres:'A',nombreCarrera:'SEGURIDAD ONLINE',sede:'Matriz'},
 {id:'1700000002',cedula:'1700000002',periodoId:P,nombres:'B',nombreCarrera:'CONTABILIDAD',sede:'Sur'},
 {id:'1700000003',cedula:'1700000003',periodoId:P,nombres:'C',nombreCarrera:'CONTABILIDAD',sede:'Sur'},
 {id:'1700000004',cedula:'1700000004',periodoId:P2,nombres:'D',nombreCarrera:'SEGURIDAD ONLINE',sede:'Matriz'}
];
function montar(){
 const calls={};const observar=nombre=>{calls[nombre]=(calls[nombre]||0)+1;};
 const service={
   listarColeccion:async col=>{observar(col);return col==='envios'?[sent,approved]:col==='Estudiante'?alumnos:col==='periodos'?[]:[];},
   leerDocumento:async()=>{observar('configuracion');return {periodosActivos:[P],periodoActivoId:P};},
   iniciar:async()=>({ok:true})
 };
 const window={TA_ADMINISTRADORES_CONFIG:{
   collections:{estudiantes:'Estudiante',titulos:'envios',config:'configuracion',periodos:'periodos'},
   documents:{appConfig:'general'},defaultAppConfig:{periodosActivos:[]},
   estadosTitulo:{sinEnviar:'SIN_ENVIAR',pendiente:'PENDIENTE',enviado:'ENVIADO',devuelto:'DEVUELTO',aprobado:'APROBADO'},
   normalizacion:{agruparOnlineVista:false}
 },TAAdminFirebaseService:service};
 vm.runInNewContext(read('administradores/js/administrador.repository.js'),{window,console,Promise,Date,Set,Intl});
 return {repo:window.TAAdministradorRepository,calls};
}
test('Inicio, Faltantes, Estudiantes y Estadísticas comparten consultas simultáneas',async()=>{
 const {repo,calls}=montar();
 await Promise.all([
  repo.listarPeriodos(),repo.listarEstudiantesConTitulos(P),
  repo.obtenerFaltantesRevision(P),repo.listarTitulos(),repo.listarEstudiantes()
 ]);
 assert.equal(calls.envios,1);
 assert.equal(calls.Estudiante,1);
 assert.equal(calls.configuracion,1);
 assert.equal(calls.periodos,1);
 await repo.obtenerFaltantesRevision(P);
 await repo.listarEstudiantesConTitulos(P2);
 assert.equal(calls.envios,1);
 assert.equal(calls.Estudiante,1);
 assert.equal(repo.fechaUltimaLectura()>0,true);
 repo.invalidarDatosCompartidos();
 assert.equal(repo.fechaUltimaLectura(),0);
 await repo.listarEstudiantesConTitulos(P);
 assert.equal(calls.envios,2);
 assert.equal(calls.Estudiante,2);
});
function estadisticas(){
 const window={TAAdministradorRepository:{
  obtenerEtapaRevision:t=>t.estadoProceso==='PENDIENTE_INVESTIGADOR'?'INVESTIGACION':'',
  clasificarEstadoTitulo:t=>t.estado==='DEVUELTO'?'DEVUELTO':'PENDIENTE'
 },TAAdminUI:{}};
 vm.runInNewContext(read('administradores/js/estadisticas.admin.js'),{window,console,Intl,Set,Date});
 return window.TAAdminEstadisticas;
}
test('estadísticas cuentan sin enviar dentro de faltantes y usan período-carrera-sede-modalidad',async()=>{
 const {repo}=montar(),e=estadisticas(),students=await repo.listarEstudiantesConTitulos('');
 const filtradas=e.filtrar(students,{periodo:'__TODOS_ACTIVOS__',carrera:'',sede:'',modalidad:''},[P]);
 assert.equal(filtradas.length,3);
 const c=e.contar(filtradas);
 assert.equal(c.total,3);
 assert.equal(c.aprobados,1);
 assert.equal(c.faltan,2);
 assert.equal(c.INVESTIGACION,1);
 assert.equal(c.SIN_ENVIO,1);
 assert.equal(c.aprobados+c.faltan,c.total);
 const carrera=e.filtrar(filtradas,{periodo:'__TODOS_ACTIVOS__',carrera:'CONTABILIDAD',sede:'Sur',modalidad:''},[P]);
 assert.equal(carrera.length,2);
 assert.equal(e.contar(carrera).aprobados,1);
 const online=e.filtrar(students,{periodo:'__TODOS_ACTIVOS__',carrera:'',sede:'',modalidad:'ONLINE'},[P]);
 assert.equal(online.length,1);
 const historico=e.filtrar(students,{periodo:P2,carrera:'',sede:'',modalidad:''},[P]);
 assert.equal(historico.length,1);
 assert.equal(e.agrupar(filtradas).reduce((total,grupo)=>total+grupo.total,0),3);
});
test('página carga Estadísticas antes de arrancar el Administrador y ofrece actualización explícita',()=>{
 const html=read('administradores/administrador.html');
 assert.match(html,/data-admin-tab="estadisticas"/);
 assert.match(html,/id="panelEstadisticas"/);
 assert.match(html,/id="btnActualizarDatosAdmin"/);
 assert(html.indexOf('js/estadisticas.admin.js')<html.indexOf('js/administrador.app.js'));
});
