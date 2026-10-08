/* Bloque 3: activar SOLO tras desplegar Functions, provisionar Auth y verificar reglas.
 * El modo heredado sigue activo mientras habilitado=false. */
(function(){
 'use strict';
 window.TA_COORDINADORES_SEGURIDAD=Object.freeze({
  habilitado:false,
  apiBase:'https://us-central1-titulos-ec2fa.cloudfunctions.net/coordinadoresApi'
 });
})();
