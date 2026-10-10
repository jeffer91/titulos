'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, '../estudiantes/js/', name), 'utf8');
const cedula = '0000000001';
const periodo = '2026-05__2026-11';
const config = {apiKey:'mock',authDomain:'mock.invalid',projectId:'test-only',appId:'mock'};
async function service(options={}) {
  const stats={fetch:0,aborted:false,events:[]};
  const db={settings(){},collection(name){assert.equal(name,'envios');return {where(field,op,value){
    assert.equal(field,'cedula');assert.equal(value,cedula);
    return {limit(){return {get(opts){assert.equal(opts.source,'server');
      if(options.hang)return new Promise(()=>{});
      if(options.error)return Promise.reject(Object.assign(new Error(options.error),{code:options.error}));
      return Promise.resolve({docs:(options.docs||[]).map(d=>({id:d.id,data:()=>d}))});
    }}}};
  }}}};
  const firebase={app:()=>({options:config}),initializeApp:()=>({options:config}),firestore:()=>db};
  const context={console,AbortController,Promise,setTimeout,clearTimeout,
    fetch:async(url,init)=>{
      stats.fetch++;assert(url.startsWith('https://firestore.googleapis.com/v1/projects/test-only/'));
      stats.body=JSON.parse(init.body);assert.equal(stats.body.structuredQuery.where.compositeFilter.filters.length,4);
      if(options.restHang)return new Promise((resolve,reject)=>init.signal.addEventListener('abort',()=>{stats.aborted=true;reject(new Error('aborted'));}));
      if(options.restError)throw new TypeError('Network unavailable');
      return {ok:options.status!==403,status:options.status||200,json:async()=>options.body===undefined?[{readTime:'2026-01-01T00:00:00Z'}]:options.body};
    },window:{firebase,setTimeout:(fn,ms)=>setTimeout(fn,ms/100),clearTimeout}}
  vm.createContext(context);vm.runInContext(read('firebase.service.js'),context);
  const svc=context.window.TAEstudianteFirebaseService;
  await svc.iniciar({academico:config,titulos:config});
  return {stats,query:()=>svc.consultarEnviosIdentidadServidor(cedula,(...args)=>stats.events.push(args),d=>d.periodoId===periodo)};
}
test('SDK servidor devuelve envío sin REST',async()=>{
  const e=await service({docs:[{id:'actual',cedula,periodoId:periodo}]});assert.equal((await e.query())[0].id,'actual');assert.equal(e.stats.fetch,0);
});
test('SDK bloqueado se recupera mediante REST conservando ceros y campos históricos',async()=>{
  const e=await service({hang:true,body:[{document:{name:'projects/test-only/databases/(default)/documents/envios/legacy',fields:{numeroIdentificacion:{integerValue:'1'},periodoId:{stringValue:periodo},estado:{stringValue:'APROBADO_FINAL'}}}}]});
  assert.equal((await e.query())[0].estado,'APROBADO_FINAL');assert.equal(e.stats.fetch,1);
  const filters=e.stats.body.structuredQuery.where.compositeFilter.filters;
  assert.equal(filters[0].fieldFilter.value.stringValue,cedula);assert.equal(filters[3].fieldFilter.value.integerValue,'1');
});
test('otro período activa búsqueda compatible; ausencia confirmada devuelve vacío',async()=>{
  const e=await service({docs:[{id:'otro',periodoId:'2025-01__2025-06'}]});assert.equal((await e.query()).length,0);assert.equal(e.stats.fetch,1);
});
test('permisos SDK denegados nunca activan REST',async()=>{
  const e=await service({error:'permission-denied'});await assert.rejects(e.query(),/permission-denied/);assert.equal(e.stats.fetch,0);
});
test('unavailable usa alternativa; denegación REST conserva código real',async()=>{
  const e=await service({error:'unavailable',status:403,body:{error:{status:'PERMISSION_DENIED',message:'Missing permissions'}}});
  await assert.rejects(e.query(),e=>e.codigo==='PERMISSION_DENIED'&&e.httpStatus===403);
});
test('ambos transportes bloqueados terminan y cancelan REST',async()=>{
  const e=await service({hang:true,restHang:true});await assert.rejects(e.query(),e=>e.codigo==='TIMEOUT');assert.equal(e.stats.aborted,true);
});
test('respuesta malformada, red y consulta truncada nunca equivalen a sin envío',async()=>{
  for(const opts of [{body:[]},{body:{}},{body:[{error:{message:'failure'}}]},{restError:true},{docs:Array.from({length:100},(_,i)=>({id:String(i),periodoId:periodo}))}]){
    const e=await service(opts);await assert.rejects(e.query());
  }
});

// DOM mínimo para ejecutar el controlador completo sin red ni dependencias.
function controller(mode) {
  const nodes=new Map(),listeners={};let rendered=0,tracking=0;
  function node(key){if(nodes.has(key))return nodes.get(key);const classes=new Set();const n={textContent:'',value:cedula,style:{},dataset:{},hidden:false,
    classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x)},
    setAttribute(){},removeAttribute(){},addEventListener(){},appendChild(){},
    querySelector:s=>node(key+' '+s),querySelectorAll:()=>[],scrollIntoView(){}};
    nodes.set(key,n);return n;
  }
  const document={body:node('body'),documentElement:node('html'),querySelector:s=>node(s),querySelectorAll:()=>[],getElementById:id=>node(id)};
  const quiet={log(){},warn(){},error(){},info(){}};
  const window={setTimeout:(fn,ms)=>setTimeout(fn,ms===8000?40:ms),clearTimeout,addEventListener:(name,fn)=>listeners[name]=fn,
    TA_ESTUDIANTES_CONFIG:{defaultAppConfig:{procesoActivo:true}},TAEstudianteFirebaseService:{iniciar:async()=>({ok:true}),estaListo:()=>true},
    TAEstudianteValidaciones:{validarCedulaBasica:()=>({ok:true,data:cedula})},
    TAEstudianteUI:{clearFieldErrors(){},hide(){},show(){},setFormDisabled(){},showStatus(){},setLoading:(button,busy)=>button.disabled=busy,renderStudent:()=>rendered++},
    TAEstudianteSeguimiento:{mostrar:()=>tracking++},
    TAEstudianteRepository:{cargarConfiguracionApp:async()=>({procesoActivo:true}),buscarEstudiantePorCedula:async()=>({cedula,periodoId:periodo}),consultarEnvio:()=>{
      listeners['ta:consulta-titulo-ruta']({detail:{ruta:'TITULOS_SDK',estado:'CONSULTANDO'}});
      if(mode==='hang')return new Promise(()=>{});
      if(mode==='error')return Promise.reject(Object.assign(new Error('Sin permiso'),{code:'permission-denied'}));
      return Promise.resolve(mode==='found'?{id:'mock',estado:'APROBADO_FINAL'}:null);
    }}
  };
  const ctx={window,document,console:quiet,navigator:{},setTimeout,clearTimeout};vm.createContext(ctx);
  vm.runInContext(read('estudiante.state.js'),ctx);vm.runInContext(read('estudiante.consulta.controller.js'),ctx);
  return {window,node,get rendered(){return rendered},get tracking(){return tracking},run:()=>window.TAEstudianteConsultaController.manejarConsulta({preventDefault(){},submitter:node('button')})};
}
test('controlador termina con seguimiento o formulario según existencia confirmada',async()=>{
  for(const mode of ['found','empty']){const e=controller(mode);const result=await e.run();assert(result);assert.equal(e.node('button').disabled,false);assert.equal(e.tracking,mode==='found'?1:0);assert.equal(e.rendered,mode==='empty'?1:0);}
});
test('controlador bloqueado conserva diagnóstico, termina con error y admite reintento',async()=>{
  for(const mode of ['error','hang']){
    const e=controller(mode),pending=e.run();await new Promise(r=>setTimeout(r,5));
    if(mode==='hang'){
      const text=e.node('#consultaProcesoBloque [data-diagnostico-texto]').textContent;
      assert(text.includes('Cédula: '+cedula));assert(text.includes('Período: '+periodo));assert(!text.includes('RUTAS_PARALELAS'));
    }
    assert.equal(await pending,null);assert.equal(e.node('button').disabled,false);assert.equal(e.rendered,0);
    assert.equal(e.node('#consultaProcesoBloque [data-proceso-retry]').classList.contains('is-hidden'),false);
    assert.equal(e.node('#consultaProcesoBloque .consulta-bloque__spinner').hidden,true);
    const text=e.node('#consultaProcesoBloque [data-proceso-error]').textContent;
    assert(text.includes(mode==='hang'?'TIMEOUT':'Sin permiso'));
    e.window.TAEstudianteRepository.consultarEnvio=async()=>null;
    assert((await e.run()).modoConsulta==='NUEVO');assert.equal(e.rendered,1);
  }
});

test('observador visual no vuelve a modificar su propio texto de éxito',()=>{
  let writes=0,callback,text='1';
  const circle={dataset:{},get textContent(){return text},set textContent(value){writes++;text=value}};
  const panel={classList:{contains:()=>false,add(){}},querySelector:()=>null,querySelectorAll:selector=>selector==='.seguimiento-step__number.is-success'?[circle]:[]};
  function MutationObserver(fn){callback=fn;this.observe=()=>{};}
  const context={window:{MutationObserver},MutationObserver,document:{getElementById:()=>true,querySelector:()=>panel}};
  vm.createContext(context);vm.runInContext(read('seguimiento.visual.js'),context);
  assert.equal(writes,1);callback();callback();assert.equal(writes,1);
});
