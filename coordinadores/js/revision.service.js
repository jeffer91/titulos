/* Servicio de escritura para revisión de títulos del módulo coordinadores. */
(function () {
  'use strict';

  var firebaseService = window.TACoordinadorFirebaseService;

  function guardarRevision(collectionName, documentId, data) {
    if (!firebaseService || typeof firebaseService.guardarDocumento !== 'function') {
      var error = new Error('No se cargó el backend propio de Coordinadores.');
      error.codigo = 'BACKEND_COORDINADORES_NO_DISPONIBLE';
      return Promise.reject(error);
    }

    return firebaseService.guardarDocumento(collectionName, documentId, data || {}, { merge: true });
  }

  function registrarLog(collectionName, data) {
    if (!firebaseService || typeof firebaseService.agregarDocumento !== 'function') {
      var error = new Error('No se cargó el backend propio de Coordinadores.');
      error.codigo = 'BACKEND_COORDINADORES_NO_DISPONIBLE';
      return Promise.reject(error);
    }

    return firebaseService.agregarDocumento(collectionName, data || {});
  }

  function serverTimestamp() {
    if (!window.firebase || !window.firebase.firestore) return new Date().toISOString();
    return window.firebase.firestore.FieldValue.serverTimestamp();
  }

  window.TACoordRevisionService = Object.freeze({
    guardarRevision: guardarRevision,
    registrarLog: registrarLog,
    serverTimestamp: serverTimestamp
  });
})();
