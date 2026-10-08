'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.resolve(__dirname,'../../investigadores/js/investigador.repository.js'),'utf8');
test('PIN desactivado no se reactiva desde el navegador',()=>{
  assert.match(src,/if \(!investigador\.pinActivo\) \{/);
  assert.doesNotMatch(src,/pinActivadoPor: 'validacion_pin'/);
});
test('sin carreras asignadas no se obtienen títulos',()=>{
  assert.match(src,/if \(!carreras\.length\) return false;/);
  assert.match(src,/if \(!perteneceAlInvestigador\(titulo, investigador\)\)/);
});
