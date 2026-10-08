'use strict';
const {crearHandler} = require('../shared/http');
function crearModulo({auth,origins}) {
  return crearHandler({modulo:'estudiantes',rol:'estudiante',auth,origins});
}
module.exports = {crearModulo};
