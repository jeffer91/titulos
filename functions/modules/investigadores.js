'use strict';
const {crearHandler} = require('../shared/http');
function crearModulo({auth,origins}) {
  return crearHandler({modulo:'investigadores',rol:'investigador',auth,origins});
}
module.exports = {crearModulo};
