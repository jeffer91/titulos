'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const src=fs.readFileSync(path.resolve(__dirname,'../../coordinadores/js/coordinador.repository.js'),'utf8');
const ACTIVO='2026-05__2026-11',INACTIVO='2026-04__2026-09';
const coordinador={id:'c1',nombre:'Coordinación',carreras:['Marketing'],email:'coord@itsqmet.edu.ec'};
const docs=[
 {id:'activo',cedula:'1712345678',periodoId:ACTIVO,carreraNombre:'Marketing',estado:'PENDIENTE_REVISION'},
 {id:'inactivo',cedula:'1712345679',periodoId:INACTIVO,carreraNombre:'Marketing',estado:'PENDIENTE_REVISION'},
 {id:'incompleto',cedula:'1712345670',periodoId:'2026-05',carreraNombre:'Marketing',estado:'PENDIENTE_REVISION'}
];
function montar(){
 let general={periodosActivos:[ACTIVO],periodoActivoId:ACTIVO};
 const operaciones={lecturas:0,listados:0,escrituras:0,logs:0};
 const firebase={
  leerDocumento:async(coleccion,id)=>{
   assert.equal(coleccion,'configuracion');assert.equal(id,'general');
   operaciones.lecturas++;return general;
  },
  listarDocumentos:async()=>{operaciones.listados++;return docs;},
  guardarDocumento:async()=>{operaciones.escrituras++;return true;},
  agregarDocumento:async()=>{operaciones.logs++;return true;}
 };
 const window={
  TA_COORDINADORES_CONFIG:{collections:{config:'configuracion',titulos:'envios',logs:'workflow_events'},documents:{appConfig:'general'}},
  TACoordinadorFirebaseService:firebase,
  TACoordinadorSeguro:{activo:()=>false}
 };
 vm.runInNewContext(src,{window,console,Set,Date,Promise});
 return {repository:window.TACoordRepository,operaciones,
  setConfig(value){general=value;},
  setDocs(value){docs.splice(0,docs.length,...value);}};
}
test('frontend legado: solo períodos ACTIVOS aparecen en revisión de Coordinadores',async()=>{
 const {repository,operaciones}=montar();
 const rows=await repository.listarTitulosParaCoordinador(coordinador);
 assert.deepEqual(Array.from(rows,x=>x.id),['activo']);
 assert.equal(operaciones.lecturas,1);
 assert.equal(operaciones.listados,1);
});
test('desactivación en Administración oculta registros; reactivarlos vuelve a mostrarlos',async()=>{
 const {repository,setConfig}=montar();
 const lista=()=>repository.listarTitulosParaCoordinador(coordinador);
 setConfig({periodosActivos:[INACTIVO],periodoActivoId:ACTIVO});
 assert.deepEqual(Array.from(await lista(),x=>x.id),['inactivo']);
 setConfig({periodosActivos:[ACTIVO,INACTIVO]});
 assert.deepEqual(Array.from(await lista(),x=>x.id).sort(),['activo','inactivo']);
 setConfig({periodosActivos:[],periodoActivoId:ACTIVO});
 assert.deepEqual(Array.from(await lista(),x=>x.id),[]);
});
test('ningún período activo: no consulta títulos y rechaza IDs abreviados',async()=>{
 const {repository,operaciones,setConfig}=montar();
 setConfig({periodosActivos:['2026-05']});
 assert.deepEqual(Array.from(await repository.listarTitulosParaCoordinador(coordinador),x=>x.id),[]);
 assert.equal(operaciones.listados,0);
});
test('si falla lectura de configuración NO muestra títulos antiguos',async()=>{
 const {repository,operaciones,setConfig}=montar();
 setConfig(null);
 await assert.rejects(()=>repository.listarTitulosParaCoordinador(coordinador),e=>e.codigo==='CONFIGURACION_PERIODOS_NO_DISPONIBLE');
 assert.equal(operaciones.listados,0);
});
test('el coordinador no puede guardar una revisión desde una pestaña desactualizada',async()=>{
 const {repository,operaciones,setConfig}=montar();
 const row=repository.normalizarTitulo(docs[0]);
 setConfig({periodosActivos:[INACTIVO],periodoActivoId:INACTIVO});
 await assert.rejects(()=>repository.revisarTitulo(row,'DEVOLVER','Corrige esta delimitación.',coordinador),
  e=>e.codigo==='PERIODO_DESACTIVADO');
 assert.equal(operaciones.escrituras,0);
 assert.equal(operaciones.logs,0);
});
