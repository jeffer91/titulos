'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const src=fs.readFileSync(path.resolve(__dirname,'../../administradores/js/administrador.repository.js'),'utf8');
const {canonico,activos,camposConfig}=require('../services/periodos-activos');
const A='2026-02__2026-08', B='2026-05__2026-11', VIEJO='2025-11__2026-05';
function montar(data){
 let config=Object.assign({periodosActivos:[A],periodoActivoId:VIEJO,periodoActivo:{id:VIEJO}},data||{});
 const calls=[];
 const firebase={
  leerDocumento:async()=>({...config}),
  listarColeccion:async nombre=>{
   if(nombre==='periodos')return [
    {id:'2026-02',label:'Febrero 2026 a Agosto 2026'},
    {id:A,label:'Febrero 2026 a Agosto 2026'},
    {id:B,label:'Mayo 2026 a Noviembre 2026'},
    {id:VIEJO,label:'Enero 2024 a Agosto 2024'}
   ];
   if(nombre==='envios')return [
    {id:'un_envio',periodoId:A,cedula:'1711111111',carrera:'Marketing'},
    {id:'otro_envio',periodoId:B,cedula:'1722222222',carrera:'Marketing'}
   ];
   if(nombre==='Estudiante')return [
    {id:'1711111111',cedula:'1711111111',nombreCarrera:'Marketing',periodoId:A},
    {id:'1722222222',cedula:'1722222222',nombreCarrera:'Marketing',periodoId:B}
   ];
   return [];
  },
  cambiarPeriodoActivoAtomico:async(id,activar)=>{
   calls.push([id,activar]);
   const lista=[...activos(config)];
   const nuevos=activar?[...new Set([...lista,id])]:lista.filter(v=>v!==id);
   config={...config,...camposConfig(nuevos)};
   return {periodoId:id,activo:activar,periodosActivos:nuevos};
  }
 };
 const window={
  TA_ADMINISTRADORES_CONFIG:{
   collections:{config:'configuracion',periodos:'periodos',estudiantes:'Estudiante',titulos:'envios'},
   documents:{appConfig:'general'},
   defaultAppConfig:{periodosActivos:[],periodoActivoId:'',periodoActivo:''}
  },
  TAAdminFirebaseService:firebase,
  TAAdministradorSeguro:{activo:()=>false}
 };
 vm.runInNewContext(src,{window,Promise,Date,console,Set,Map});
 return {repo:window.TAAdministradorRepository,calls,get:()=>config,
  set(d){config=d;}};
}
test('Administración presenta una fila por período real y oculta alias incompletos',async()=>{
 const {repo}=montar();
 const lista=await repo.listarPeriodos();
 assert.deepEqual(Array.from(lista,x=>x.id).sort(),[VIEJO,A,B].sort());
 assert.equal(lista.find(p=>p.id===VIEJO).activo,false);
 assert.equal(lista.find(p=>p.id===A).activo,true);
 assert.equal(lista.find(p=>p.id===VIEJO).label,'Noviembre 2025 a Mayo 2026');
 assert.equal(repo.normalizarPeriodoIdCanonico('2026-02'),'');
 assert.equal(repo.normalizarPeriodoIdCanonico('2026-02__2026-08'),A);
});
test('desactivar el único período no lo reactiva desde periodoActivoId',async()=>{
 const {repo,get,calls}=montar();
 await repo.cambiarEstadoPeriodo(A,false);
 const config=get();
 assert.deepEqual(Array.from(config.periodosActivos),[]);
 assert.equal(config.periodoActivoId,'');
 assert.equal((await repo.listarPeriodos()).filter(p=>p.activo).length,0);
 assert.deepEqual(calls,[[A,false]]);
});
test('reactivar otro período no incorpora el ID principal obsoleto',async()=>{
 const {repo,get}=montar();
 await repo.cambiarEstadoPeriodo(B,true);
 assert.deepEqual(Array.from(get().periodosActivos),[A,B]);
 assert.equal((await repo.listarPeriodos()).find(x=>x.id===VIEJO).activo,false);
});
test('sin lista explícita permite migrar el principal legado válido, no IDs abreviados',async()=>{
 const {repo,set}=montar();
 set({periodoActivoId:VIEJO});
 const a=await repo.listarPeriodos();
 assert.equal(a.find(p=>p.id===VIEJO).activo,true);
 set({periodoActivoId:'2026-02',periodoActivoDesactivado:true});
 const b=await repo.listarPeriodos();
 assert.equal(b.filter(p=>p.activo).length,0);
});
test('rechaza activar ID incompleto sin llamar a Firebase',async()=>{
 const {repo,calls}=montar();
 await assert.rejects(()=>repo.cambiarEstadoPeriodo('2026-02',true),/ID completo/);
 assert.equal(calls.length,0);
});
