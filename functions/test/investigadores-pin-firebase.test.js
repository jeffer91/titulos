'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../../administradores/js/firebase.service.js'),'utf8');
const cedula='1712345678';
const hash='a'.repeat(64);
function backend(){
 const collections=new Map(),reads=[];
 const getCollection=name=>{if(!collections.has(name))collections.set(name,new Map());return collections.get(name);};
 let nextId=0,offline=false,denyAudit=false;
 function ref(coll,id){
  return {id,coll,
   async get(opts){
    reads.push({coll,id,source:opts&&opts.source});
    if(offline)throw Error('NETWORK_OFFLINE');
    const data=getCollection(coll).get(id);
    return {id,exists:!!data,data:()=>data?{...data}:undefined};
   }
  };
 }
 const db={
  collection(name){
   return {
    doc(id){return ref(name,id||'auto-'+(++nextId));},
    limit(max){return {async get(opts){
     assert.equal(opts.source,'server');
     if(offline)throw Error('NETWORK_OFFLINE');
     const docs=[...getCollection(name)].slice(0,max).map(([id,data])=>({
      id,exists:true,data:()=>({...data})
     }));
     return {forEach(fn){docs.forEach(fn);}};
    }}}
   };
  },
  async runTransaction(work){
   const changes=[];
   const tx={
    async get(r){return r.get();},
    set(r,data,options){
     if(denyAudit&&r.coll==='workflow_events')throw Error('AUDIT_DENIED');
     changes.push({r,data,options});
    }
   };
   const result=await work(tx);
   for(const {r,data,options} of changes){
    const table=getCollection(r.coll);
    const prev=table.get(r.id)||{};
    table.set(r.id,options&&options.merge?{...prev,...data}:{...data});
   }
   return result;
  }
 };
 const firestore=()=>db;
 firestore.FieldValue={serverTimestamp:()=>({serverClock:true})};
 const window={
  TA_ADMIN_SEGURIDAD:{habilitado:false},
  TA_ADMIN_ACADEMICO_FIREBASE_CONFIG:null,
  TA_ADMIN_FIREBASE_CONFIG:{
   apiKey:'public',authDomain:'example.firebaseapp.com',
   projectId:'demo-project',appId:'web-test'
  },
  firebase:{
   app(){throw Error('not initialized');},
   initializeApp(){return {name:'test'};},
   firestore
  }
 };
 vm.runInNewContext(source,{window,Promise,Date,Error,Number,String,Object,console,
  document:{getElementById(){return null;},head:{appendChild(){}}}});
 const svc=window.TAAdminFirebaseService;
 return {
  async init(){assert.equal((await svc.iniciar()).ok,true);},
  svc,reads,collections,
  setOffline(v){offline=v;},denyAudit(v){denyAudit=v;},
  doc:()=>getCollection('investigadores').get(cedula),
  log:()=>[...getCollection('workflow_events').values()]
 };
}
test('PIN en Firestore se guarda una vez en transacción y queda tras cambiar sesión',async()=>{
 const b=backend();await b.init();
 const first=await b.svc.guardarPinInvestigador({
  docId:cedula,cedula,nombre:'Investigador ficticio',email:'prueba@example.com',
  hash,crear:true
 });
 assert.equal(first.revision,1);
 assert.equal(b.doc().pinHash,hash);
 assert.equal(b.doc().pinActivo,true);
 assert.equal(b.doc().pinRevision,1);
 assert.equal(b.log().length,1);
 assert.equal(b.log()[0].pinHash,undefined);
 assert.equal(b.log()[0].pin,undefined);
 // Lectura desde servidor en otra pantalla: no almacenamiento temporal en memoria.
 const actual=await b.svc.leerDocumentoServidor('investigadores',cedula);
 assert.equal(actual.pinHash,hash);
 assert.ok(b.reads.some(x=>x.source==='server'));
});
test('al cambiar PIN se preservan los otros datos y aumenta la revisión',async()=>{
 const b=backend();await b.init();
 await b.svc.guardarPinInvestigador({docId:cedula,cedula,nombre:'Persona',hash,crear:true});
 const next='b'.repeat(64);
 const result=await b.svc.guardarPinInvestigador({docId:cedula,cedula,hash:next,crear:false});
 assert.equal(result.revision,2);
 assert.equal(b.doc().pinHash,next);
 assert.equal(b.doc().nombres,'Persona');
 assert.equal(b.log().length,2);
 assert.ok(b.log().every(x=>!Object.prototype.hasOwnProperty.call(x,'pinHash')));
});
test('transacción impide sobrescribir registro ajeno y no crea evento',async()=>{
 const b=backend();await b.init();
 await b.svc.guardarPinInvestigador({docId:cedula,cedula,nombre:'Persona',hash,crear:true});
 const logs=b.log().length;
 b.collections.get('investigadores').get(cedula).cedula='1722222222';
 await assert.rejects(()=>b.svc.guardarPinInvestigador({docId:cedula,cedula,hash:'b'.repeat(64),crear:false}),
  /cédula/i);
 assert.equal(b.log().length,logs);
 assert.equal(b.doc().pinHash,hash);
});
test('si el registro de auditoría falla, no se confirma el cambio de PIN',async()=>{
 const b=backend();await b.init();
 await b.svc.guardarPinInvestigador({docId:cedula,cedula,nombre:'Persona',hash,crear:true});
 b.denyAudit(true);
 await assert.rejects(()=>b.svc.guardarPinInvestigador({docId:cedula,cedula,hash:'b'.repeat(64),crear:false}),
  /AUDIT_DENIED/);
 assert.equal(b.doc().pinHash,hash);
 assert.equal(b.doc().pinRevision,1);
});
test('sin red la verificación de servidor falla en vez de aceptar caché',async()=>{
 const b=backend();await b.init();
 await b.svc.guardarPinInvestigador({docId:cedula,cedula,nombre:'Persona',hash,crear:true});
 b.setOffline(true);
 await assert.rejects(()=>b.svc.leerDocumentoServidor('investigadores',cedula),/NETWORK_OFFLINE/);
});
