'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {crearRutasEstudiantes,validarTitulos,normalizarConfig,periodoValor}=require('../services/estudiantes');

function memoria(inicial={}) {
  const collections={};
  for(const name of Object.keys(inicial))collections[name]=new Map(Object.entries(inicial[name]));
  function table(name){return collections[name]||(collections[name]=new Map());}
  function snap(name,id){const d=table(name).get(id);return {id,exists:!!d,data:()=>d&&{...d}};}
  function coll(name){
    return {
      doc(id){return {collection:name,id,async get(){return snap(name,id);}};},
      where(field,operator,value){
        assert.equal(operator,'==');
        return {limit(n){return {async get(){
          const docs=[...table(name)].filter(([_,data])=>data[field]===value).slice(0,n).map(([id])=>snap(name,id));
          return {docs,empty:docs.length===0};
        }};}};
      }
    };
  }
  return {
    collections,collection:coll,
    async runTransaction(fn){
      const writes=[];
      const tx={get:ref=>ref.get(),set(ref,data,options){writes.push({ref,data,options});}};
      const result=await fn(tx);
      writes.forEach(({ref,data,options})=>{
        const previo=table(ref.collection).get(ref.id)||{};
        table(ref.collection).set(ref.id,options&&options.merge?{...previo,...data}:{...data});
      });
      return result;
    }
  };
}
const cedula='1712345678',otra='1700000000',periodo='2026-04__2026-09';
const usuario={uid:'uid-demo',rol:'estudiante',cedula};
const propuesta={cedula,periodoId:periodo,tituloPreferidoNumero:2,titulosEnviados:[
  {numero:1,tituloFinal:'Diagnóstico del proceso de ventas de una empresa'},
  {numero:2,tituloFinal:'Propuesta de mejora del sistema de ventas empresariales'},
  {numero:3,tituloFinal:'Evaluación de resultados del proceso de ventas institucional'}
]};
function montar({envios={}}={}){
  const operativa=memoria({configuracion:{general:{procesoActivo:true,periodoActivoId:periodo,iaActiva:true,
    sheetsToken:'NO_FILTRES',apiKey:'NO_FILTRES'}},envios,versiones_envio:{},workflow_events:{}});
  const academica=memoria({Estudiante:{[cedula]:{cedula,nombres:'Estudiante real',nombreCarreraActual:'Software'}},
    matriculas:{m1:{cedula,periodoId:periodo,nombreCarrera:'Software',codigoCarrera:'SW',estadoMatricula:'ACTIVO'}}});
  return {operativa,academica,rutas:crearRutasEstudiantes({operativa,academica,geminiKey:()=>''})};
}
test('la configuración jamás incluye secretos',()=>{
  const c=normalizarConfig({procesoActivo:true,periodoActivoId:periodo,apiKey:'secreto',sheetsToken:'token'});
  assert.equal(c.apiKey,undefined);assert.equal(c.sheetsToken,undefined);assert.equal(c.sheetsActivo,false);
});
test('deben existir exactamente tres títulos y uno preferido válido',()=>{
  assert.equal(validarTitulos(propuesta).propuestas.length,3);
  assert.throws(()=>validarTitulos({...propuesta,titulosEnviados:propuesta.titulosEnviados.slice(0,2)}),e=>e.status===422);
  assert.throws(()=>validarTitulos({...propuesta,tituloPreferidoNumero:4}),e=>e.status===422);
  assert.equal(periodoValor('sin-periodo'),'');
});
test('una cuenta sin cédula verificada no obtiene datos',async()=>{
  const {rutas}=montar();
  await assert.rejects(()=>rutas['/expediente'].handle({usuario:{uid:'u',rol:'estudiante'},query:{cedula}}),e=>e.status===403);
});
test('no permite acceder a la cédula de otra persona',async()=>{
  const {rutas}=montar();
  await assert.rejects(()=>rutas['/expediente'].handle({usuario,query:{cedula:otra}}),e=>e.status===403);
});
test('expediente devuelve identidad y período académico autorizado',async()=>{
  const {rutas}=montar();
  const data=await rutas['/expediente'].handle({usuario,query:{cedula,periodoId:periodo}});
  assert.equal(data.estudiante.cedula,cedula);
  assert.equal(data.estudiante.carrera,'Software');
  assert.equal(data.envio,null);
  assert.equal(data.config.apiKey,undefined);
});
test('envío transaccional deriva nombres y carrera desde el servidor',async()=>{
  const {rutas,operativa}=montar();
  const res=await rutas['/envio'].handle({usuario,body:{...propuesta,nombres:'FALSO',carrera:'OTRA CARRERA'}});
  assert.equal(res.id,periodo+'__'+cedula);
  assert.equal(res.data.nombres,'Estudiante real');
  assert.equal(res.data.carrera,'Software');
  assert.equal(operativa.collections.envios.size,1);
  assert.equal(operativa.collections.versiones_envio.size,1);
  assert.equal(operativa.collections.workflow_events.size,1);
  const hist=await rutas['/historial'].handle({usuario,query:{periodoId:periodo}});
  assert.equal(hist.versiones.length,1);
  assert.equal(hist.eventos.length,1);
  await assert.rejects(()=>rutas['/envio'].handle({usuario,body:propuesta}),e=>e.status===409);
});
test('no se puede escribir una cédula o un período ajeno',async()=>{
  const {rutas}=montar();
  await assert.rejects(()=>rutas['/envio'].handle({usuario,body:{...propuesta,cedula:otra}}),e=>e.status===403);
  await assert.rejects(()=>rutas['/envio'].handle({usuario,body:{...propuesta,periodoId:'2025-04__2025-09'}}),e=>e.status===403);
});
test('reenvío requiere habilitación expresa y se desactiva tras guardar',async()=>{
  const previo={...propuesta,id:periodo+'__'+cedula,estado:'DEVUELTO',permitirReenvio:true,numeroEnvios:1,versionActual:1};
  const {rutas}=montar({envios:{[periodo+'__'+cedula]:previo}});
  const res=await rutas['/envio'].handle({usuario,body:propuesta});
  assert.equal(res.data.numeroEnvios,2);
  assert.equal(res.data.permitirReenvio,false);
});
test('sin secreto de servidor no se ofrecen claves de IA',async()=>{
  const {rutas}=montar();
  assert.deepEqual(await rutas['/proveedores'].handle({usuario}),[]);
  await assert.rejects(()=>rutas['/ia'].handle({usuario,body:{prompt:'Texto académico de prueba suficientemente extenso.'}}),e=>e.code==='IA_NO_CONFIGURADA');
});
