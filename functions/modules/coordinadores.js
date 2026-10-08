'use strict';
const {crearHandler}=require('../shared/http');
const {crearRutasCoordinadores}=require('../services/coordinadores');
function crearModulo({auth,origins,db}){
  return crearHandler({modulo:'coordinadores',rol:'coordinador',auth,origins,routes:crearRutasCoordinadores({db})});
}
module.exports={crearModulo};
