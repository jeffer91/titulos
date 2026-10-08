'use strict';
const {crearHandler} = require('../shared/http');
function crearModulo({auth,origins}) {
  return crearHandler({modulo:'coordinadores',rol:'coordinador',auth,origins});
}
module.exports = {crearModulo};
