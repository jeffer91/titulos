/* Busca el envío actual en paralelo para reducir la espera en titulos-ec2fa. */
(function () {
  'use strict';

  var base = window.TAEstudianteRepository;
  var fs = window.TAFirebaseService;
  var cfg = window.TA_ESTUDIANTES_CONFIG || {};
  if (!base || !fs || base.__lookupParalelo) return;

  var copia = copiar(base);
  copia.consultarEnvio = consultarEnvioParalelo;
  copia.__lookupParalelo = true;
  window.TAEstudianteRepository = Object.freeze(copia);

  function consultarEnvioParalelo(periodoId, cedulaIngresada) {
    var periodo = limpiar(periodoId);
    var cedula = soloNumeros(cedulaIngresada);
    var variantes = [cedula];
    var db = fs.getDbTitulos ? fs.getDbTitulos() : fs.getDb();
    var nombre = cfg.collections && cfg.collections.titulos ? cfg.collections.titulos : 'envios';
    var col = db.collection(nombre);
    var tareas = [];

    if (cedula.length === 9) variantes.push('0' + cedula);
    if (cedula.length === 10 && cedula.charAt(0) === '0') variantes.push(cedula.slice(1));
    variantes = unicos(variantes);

    variantes.forEach(function (v) {
      if (periodo) tareas.push(leerId(col, periodo + '__' + v, periodo));
      tareas.push(leerId(col, v, periodo));
      tareas.push(buscarCampo(col, 'cedula', v, periodo));
      tareas.push(buscarCampo(col, 'numeroIdentificacion', v, periodo));

      var n = Number(v);
      if (!isNaN(n)) {
        tareas.push(buscarCampo(col, 'cedula', n, periodo));
        tareas.push(buscarCampo(col, 'numeroIdentificacion', n, periodo));
      }
    });

    return timeout(primeroValido(tareas), 2800)
      .then(function (doc) { return doc ? normalizarEnvio(doc) : null; });
  }

  function leerId(col, id, periodo) {
    return col.doc(id).get().then(function (snap) {
      if (!snap.exists) return null;
      var doc = aDoc(snap);
      return coincidePeriodo(doc, periodo) ? doc : null;
    }).catch(function () { return null; });
  }

  function buscarCampo(col, campo, valor, periodo) {
    return col.where(campo, '==', valor).limit(10).get().then(function (snap) {
      var docs = (snap.docs || []).map(aDoc);
      for (var i = 0; i < docs.length; i += 1) {
        if (coincidePeriodo(docs[i], periodo, true)) return docs[i];
      }
      for (var j = 0; j < docs.length; j += 1) {
        if (!periodoDe(docs[j])) return docs[j];
      }
      return null;
    }).catch(function () { return null; });
  }

  function primeroValido(tareas) {
    return new Promise(function (resolve) {
      var pendientes = tareas.length;
      var terminado = false;
      if (!pendientes) return resolve(null);

      tareas.forEach(function (p) {
        Promise.resolve(p).then(function (valor) {
          if (terminado) return;
          if (valor) {
            terminado = true;
            resolve(valor);
            return;
          }
          pendientes -= 1;
          if (!pendientes) {
            terminado = true;
            resolve(null);
          }
        }).catch(function () {
          if (terminado) return;
          pendientes -= 1;
          if (!pendientes) {
            terminado = true;
            resolve(null);
          }
        });
      });
    });
  }

  function coincidePeriodo(doc, periodo, exacto) {
    if (!periodo) return true;
    var p = periodoDe(doc);
    if (!p) return !exacto;
    return limpiar(p) === limpiar(periodo);
  }

  function periodoDe(doc) {
    return doc && (doc.periodoId || doc.periodoCanonicoId || doc.periodoID || (doc.periodo && doc.periodo.id) || '');
  }

  function normalizarEnvio(data) {
    var propuestas = Array.isArray(data.titulosEnviados) && data.titulosEnviados.length
      ? data.titulosEnviados.slice()
      : [1,2,3].map(function (n) {
          var titulo = limpiar(data['titulo' + n]);
          return titulo ? { numero: n, tituloFinal: titulo, preferido: Number(data.tituloPreferidoNumero) === n } : null;
        }).filter(Boolean);

    var preferido = limpiar(data.tituloPreferidoTexto || data.tituloElegido || '');
    if (!preferido) {
      var elegido = propuestas.filter(function (p) { return Number(p.numero) === Number(data.tituloPreferidoNumero || 1); })[0];
      preferido = elegido ? limpiar(elegido.tituloFinal || elegido.titulo) : '';
    }

    return Object.assign({}, data, {
      id: data.id || data._docId || '',
      cedula: normalizarCedula(data.cedula || data.numeroIdentificacion || ''),
      titulosEnviados: propuestas,
      tituloPreferidoTexto: preferido,
      intentosUsados: Number(data.intentosUsados || data.numeroEnvios || 1),
      puedeReenviar: data.puedeReenviar === true || data.permitirReenvio === true
    });
  }

  function aDoc(snap) {
    return Object.assign({}, snap.data() || {}, { id: snap.id, _docId: snap.id });
  }

  function timeout(promesa, ms) {
    var timer;
    return Promise.race([
      promesa,
      new Promise(function (_, reject) {
        timer = setTimeout(function () { reject(new Error('La base de Títulos está tardando en responder. Intenta nuevamente.')); }, ms);
      })
    ]).finally(function () { if (timer) clearTimeout(timer); });
  }

  function copiar(obj) { var out = {}; Object.keys(obj || {}).forEach(function (k) { out[k] = obj[k]; }); return out; }
  function soloNumeros(v) { return String(v || '').replace(/\D/g, ''); }
  function normalizarCedula(v) { var c = soloNumeros(v); return c.length === 9 ? '0' + c : c; }
  function limpiar(v) { return String(v === undefined || v === null ? '' : v).replace(/\s+/g, ' ').trim(); }
  function unicos(lista) { return lista.filter(function (v, i, a) { return v && a.indexOf(v) === i; }); }
})();
