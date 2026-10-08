'use strict';
const {crearHandler}=require('../shared/http');
const {crearRutasInvestigadores}=require('../services/investigadores');
function crearModulo({auth,origins,db}){
 return crearHandler({modulo:'investigadores',rol:'investigador',auth,origins,routes:crearRutasInvestigadores({db})});
}
module.exports={crearModulo};
