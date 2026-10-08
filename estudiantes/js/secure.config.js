/* Activación gradual: true SOLO tras provisionar estudiantes y reglas Firestore.
 * Nunca interpretar una cédula conocida como prueba de identidad. */
(function(){
 'use strict';
 window.TA_ESTUDIANTES_SEGURIDAD=Object.freeze({
   habilitado:false,
   apiBase:'https://us-central1-titulos-ec2fa.cloudfunctions.net/estudiantesApi'
 });
})();
