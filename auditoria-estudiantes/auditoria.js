(function () {
  'use strict';

  var tests = document.querySelector('#tests');
  var logEl = document.querySelector('#log');
  var button = document.querySelector('#ejecutar');

  document.addEventListener('DOMContentLoaded', function () {
    button.addEventListener('click', ejecutar);
  });

  function ejecutar() {
    var cedula = limpiarCedula(valor('#cedula'));
    var periodo = String(valor('#periodo') || '').trim();
    var cfg = window.TA_CONSULTA_ESTADO_CONFIG || {};
    var id = periodo + '__' + cedula;
    var url = construirUrl(cfg, id);

    tests.innerHTML = '';
    logEl.textContent = '';
    button.disabled = true;

    log('Inicio auditoría');
    log('Documento esperado: ' + id);
    log('Proyecto: ' + String(cfg.projectId || ''));
    log('Colección: ' + String(cfg.collection || ''));

    return ejecutarTest('A', 'GET exacto simple (sin cabeceras extra)', function () {
      return fetchControlado(url, {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
        headers: { 'Accept': 'application/json' }
      }, 4500).then(resumenHttp);
    })
    .then(function () {
      return ejecutarTest('B', 'GET exacto con Cache-Control (compara preflight)', function () {
        return fetchControlado(url, {
          method: 'GET',
          mode: 'cors',
          credentials: 'omit',
          cache: 'no-store',
          headers: {
            'Accept': 'application/json',
            'Cache-Control': 'no-cache'
          }
        }, 4500).then(resumenHttp);
      });
    })
    .then(function () {
      return ejecutarTest('C', 'TAConsultaEstadoService.consultar()', function () {
        var service = window.TAConsultaEstadoService;
        if (!service || typeof service.consultar !== 'function') throw new Error('TAConsultaEstadoService no disponible');
        return timeoutDuro(service.consultar(periodo, cedula), 5200, 'TIMEOUT_SERVICIO').then(function (r) {
          return {
            ok: Boolean(r && r.encontrado),
            status: r && r.status,
            ruta: r && r.ruta,
            estrategia: r && r.estrategia,
            documentoId: r && r.documentoId,
            estado: r && r.envio && (r.envio.estado || r.envio.estadoProceso),
            tituloFinal: r && r.envio && (r.envio.tituloFinal || r.envio.tituloFinalInvestigacion),
            raw: r
          };
        });
      });
    })
    .then(function () {
      return ejecutarTest('D', 'TAEstudianteRepository.consultarEnvio()', function () {
        var repo = window.TAEstudianteRepository;
        if (!repo || typeof repo.consultarEnvio !== 'function') throw new Error('TAEstudianteRepository no disponible');
        return timeoutDuro(repo.consultarEnvio(periodo, cedula), 5600, 'TIMEOUT_REPOSITORY').then(function (envio) {
          return {
            ok: Boolean(envio),
            estado: envio && (envio.estado || envio.estadoProceso),
            tituloFinal: envio && (envio.tituloFinal || envio.tituloFinalInvestigacion),
            diagnostico: envio && envio._consultaDiagnostico || (repo.obtenerDiagnosticoEnvio && repo.obtenerDiagnosticoEnvio()),
            raw: envio
          };
        });
      });
    })
    .catch(function (error) {
      log('Auditoría interrumpida: ' + mensaje(error));
    })
    .finally(function () {
      button.disabled = false;
      log('Fin auditoría');
    });
  }

  function ejecutarTest(codigo, nombre, fn) {
    var card = crearCard(codigo, nombre);
    var inicio = performance.now();
    card.className = 'test running';
    estadoCard(card, 'Ejecutando…', '');

    return Promise.resolve()
      .then(fn)
      .then(function (resultado) {
        var ms = Math.round(performance.now() - inicio);
        var exito = resultado && resultado.ok !== false && Number(resultado.status || 200) < 400;
        card.className = 'test ' + (exito ? 'ok' : 'warn');
        estadoCard(card, exito ? 'OK' : 'RESPUESTA NO EXITOSA', ms + ' ms');
        detalleCard(card, resultado);
        log(codigo + ' ' + nombre + ': ' + (exito ? 'OK' : 'NO EXITOSO') + ' · ' + ms + ' ms');
        return resultado;
      })
      .catch(function (error) {
        var ms = Math.round(performance.now() - inicio);
        card.className = 'test error';
        estadoCard(card, 'ERROR', ms + ' ms');
        detalleCard(card, {
          error: mensaje(error),
          codigo: error && error.codigo || '',
          name: error && error.name || ''
        });
        log(codigo + ' ' + nombre + ': ERROR · ' + ms + ' ms · ' + mensaje(error));
        return null;
      });
  }

  function fetchControlado(url, options, ms) {
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var opts = Object.assign({}, options || {});
    var timer;

    if (controller) opts.signal = controller.signal;
    if (controller) timer = setTimeout(function () { controller.abort(); }, ms);

    return timeoutDuro(fetch(url, opts), ms + 300, 'TIMEOUT_FETCH')
      .finally(function () { if (timer) clearTimeout(timer); });
  }

  function timeoutDuro(promesa, ms, codigo) {
    var timer;
    return Promise.race([
      Promise.resolve(promesa),
      new Promise(function (_, reject) {
        timer = setTimeout(function () {
          var e = new Error(codigo || 'TIMEOUT');
          e.codigo = codigo || 'TIMEOUT';
          reject(e);
        }, ms);
      })
    ]).finally(function () { if (timer) clearTimeout(timer); });
  }

  function resumenHttp(response) {
    return response.text().then(function (texto) {
      var body = parse(texto);
      var doc = body && body.fields ? normalizarFirestore(body) : null;
      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        corsVisible: true,
        estado: doc && (doc.estado || doc.estadoProceso),
        tituloFinal: doc && (doc.tituloFinal || doc.tituloFinalInvestigacion),
        errorFirebase: body && body.error && {
          status: body.error.status,
          message: body.error.message
        },
        raw: doc || body
      };
    });
  }

  function normalizarFirestore(doc) {
    var service = window.TAConsultaEstadoService;
    if (service && typeof service.normalizarDocumentoRest === 'function') {
      return service.normalizarDocumentoRest(doc);
    }
    return doc;
  }

  function construirUrl(cfg, id) {
    var base = String(cfg.firestoreRestBase || 'https://firestore.googleapis.com/v1').replace(/\/$/, '');
    return base + '/projects/' +
      encodeURIComponent(cfg.projectId || '') +
      '/databases/' + encodeURIComponent(cfg.databaseId || '(default)') +
      '/documents/' + encodeURIComponent(cfg.collection || 'envios') +
      '/' + encodeURIComponent(id) +
      '?key=' + encodeURIComponent(cfg.apiKey || '');
  }

  function crearCard(codigo, nombre) {
    var div = document.createElement('article');
    div.className = 'test';
    div.innerHTML = '<strong>' + esc(codigo + ' · ' + nombre) + '</strong><div class="meta" data-status>Preparando…</div><pre data-detail></pre>';
    tests.appendChild(div);
    return div;
  }

  function estadoCard(card, estado, tiempo) {
    var node = card.querySelector('[data-status]');
    if (node) node.textContent = estado + (tiempo ? ' · ' + tiempo : '');
  }

  function detalleCard(card, data) {
    var node = card.querySelector('[data-detail]');
    if (node) node.textContent = JSON.stringify(data, null, 2);
  }

  function log(texto) {
    var now = new Date().toISOString();
    logEl.textContent += (logEl.textContent ? '\n' : '') + now + '  ' + texto;
  }

  function valor(sel) {
    var el = document.querySelector(sel);
    return el ? el.value : '';
  }

  function limpiarCedula(v) {
    var s = String(v || '').replace(/\D/g, '');
    return s.length === 9 ? '0' + s : s;
  }

  function parse(t) {
    try { return JSON.parse(t || ''); } catch (e) { return { rawText: t }; }
  }

  function mensaje(e) {
    return e && e.message ? String(e.message) : String(e || '');
  }

  function esc(v) {
    return String(v || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }
})();