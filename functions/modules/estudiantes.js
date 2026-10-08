'use strict';
const {crearHandler} = require('../shared/http');
const {crearRutasEstudiantes}=require('../services/estudiantes');

function crearModulo({auth,origins,operativa,academica,geminiKey}) {
  const routes=crearRutasEstudiantes({operativa,academica,geminiKey});
  return crearHandler({modulo:'estudiantes',rol:'estudiante',auth,origins,routes});
}
module.exports={crearModulo};
