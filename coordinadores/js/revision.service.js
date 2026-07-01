/* Servicio de escritura para revisión de títulos del módulo coordinadores. */
(function () {
  'use strict';

  var firebaseService = window.TACoordFirebaseService;

  function guardarRevision(collectionName, documentId, data) {
    var db = firebaseService.getDb();
    var payload = Object.assign({}, data || {}, {
      actualizadoEn: serverTimestamp()
    });

    return db.collection(collectionName).doc(documentId).set(payload, { merge: true });
  }

  function registrarLog(collectionName, data) {
    var db = firebaseService.getDb();
    var payload = Object.assign({}, data || {}, {
      creadoEn: serverTimestamp(),
      actualizadoEn: serverTimestamp()
    });

    return db.collection(collectionName).add(payload);
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
