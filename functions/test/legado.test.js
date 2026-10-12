'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.resolve(__dirname,'../../investigadores/js/investigador.repository.js'),'utf8');
test('PIN desactivado no se reactiva desde el navegador',()=>{
  assert.match(src,/if\s*\(!actual\.pinActivo\)/);
  assert.doesNotMatch(src,/pinActivadoPor: 'validacion_pin'/);
});
test('cola institucional exige acceso activo y no asignaciones por carrera',()=>{
  assert.match(src,/investigador\.activo === false/);
  assert.match(src,/!investigador\.pinActivo/);
  assert.doesNotMatch(src,/perteneceAlInvestigador/);
});
