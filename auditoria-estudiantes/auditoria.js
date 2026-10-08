(function () {
  'use strict';

  var COL_ENV = 'auditoria_envios';
  var COL_EVT = 'auditoria_eventos';
  var flow = document.querySelector('#flow');
  var logEl = document.querySelector('#log');
  var transportEl = document.querySelector('#transport');
  var runAll = document.querySelector('#runAll');
  var cleanupBtn = document.querySelector('#cleanup');
  var resetBtn = document.querySelector('#resetFlow');
  var transportBtn = document.querySelector('#runTransport');

  var audit = {
    runId: '',
    docId: '',
    eventIds: [],
    inicioMs: 0,
    datos: null
  };

  document.addEventListener('DOMContentLoaded', function () {
    runAll.addEventListener('click', ejecutarFlujoCompleto);
    cleanupBtn.addEventListener('click', limpiarManual);
    resetBtn.addEventListener('click', reiniciarPanel);
    transportBtn.addEventListener('click', ejecutarTransporteReal);
  });

  function ejecutarFlujoCompleto() {
    reiniciarPanel();
    audit.inicioMs = Date.now();
    audit.runId = 'AUDIT_' + Date.now();
    audit.datos = leerDatosFormulario();
    audit.docId = audit.datos.periodo + '__' + audit.datos.cedula;
    setText('#metricRun', audit.runId);
    setText('#metricDoc', audit.docId);
    setText('#runInfo', 'Ejecución activa: ' + audit.runId);
    bloquear(true);
    log('INICIO flujo E2E · ' + audit.runId);

    return inicializarFirebase()
      .then(function () { return paso1CrearEnvio(); })
      .then(function () { return paso2ConsultarEstudiante(); })
      .then(function () { return paso3ValidarCoordinacion(); })
      .then(function () { return paso4VerificarInvestigacion(); })
      .then(function () { return paso5AprobarInvestigacion(); })
      .then(function () { return paso6ConsultarFinal(); })
      .then(function () { return paso7Limpiar(); })
      .then(function () {
        var total = Date.now() - audit.inicioMs;
        setText('#metricTime', total + ' ms');
        setText('#runInfo', 'Auditoría completada sin bloquearse.');
        log('FIN flujo E2E · OK · ' + total + ' ms');
      })
      .catch(function (error) {
        var total = Date.now() - audit.inicioMs;
        setText('#metricTime', total + ' ms');
        setText('#runInfo', 'Auditoría detenida: ' + mensaje(error));
        log('FIN flujo E2E · ERROR · ' + mensaje(error));
      })
      .finally(function () {
        bloquear(false);
      });
  }

  function paso1CrearEnvio() {
    var d = audit.datos;
    var ahora = new Date().toISOString();
    var propuestas = [
      { numero: 1, tituloFinal: d.titulo1, preferido: false },
      { numero: 2, tituloFinal: d.titulo2, preferido: true },
      { numero: 3, tituloFinal: d.titulo3, preferido: false }
    ];
    var payload = {
      id: audit.docId,
      auditoriaRunId: audit.runId,
      esAuditoria: true,
      cedula: d.cedula,
      numeroIdentificacion: d.cedula,
      nombres: d.nombres,
      carrera: d.carrera,
      carreraNombre: d.carrera,
      periodoId: d.periodo,
      periodoCanonicoId: d.periodo,
      periodoNombre: formatearPeriodo(d.periodo),
      titulo1: d.titulo1,
      titulo2: d.titulo2,
      titulo3: d.titulo3,
      titulosEnviados: propuestas,
      propuestasDetalle: propuestas,
      tituloPreferidoNumero: 2,
      tituloPreferidoTexto: d.titulo2,
      tituloElegido: d.titulo2,
      estado: 'PENDIENTE_REVISION',
      estadoProceso: 'PENDIENTE_COORDINADOR',
      estadoCoordinador: 'PENDIENTE',
      coordinadorRevisado: false,
      validadoCoordinador: false,
      estadoInvestigador: '',
      investigacionRevisada: false,
      requiereAccionDe: 'COORDINACION',
      requiereRevision: true,
      tituloCoordinador: null,
      tituloFinal: null,
      fechaEnvio: ahora,
      actualizadoEnLocal: ahora,
      origenCaptura: 'auditoria-e2e'
    };

    return ejecutarPaso(1, {
      estado: 'PENDIENTE_REVISION',
      estadoProceso: 'PENDIENTE_COORDINADOR',
      estadoCoordinador: 'PENDIENTE',
      titulos: 3
    }, function () {
      var fb = window.TAFirebaseService;
      return fb.guardarDocumento(COL_ENV, audit.docId, payload, { merge: false })
        .then(function () { return registrarEvento('01_ENVIO_ESTUDIANTE', 'estudiantes', payload.estado, payload.estadoProceso); })
        .then(function () { return fb.leerDocumento(COL_ENV, audit.docId); })
        .then(function (doc) {
          validar(Boolean(doc), 'El documento simulado no pudo leerse después de crearse.');
          validar(doc.estado === 'PENDIENTE_REVISION', 'Estado inicial incorrecto.');
          validar(doc.estadoProceso === 'PENDIENTE_COORDINADOR', 'estadoProceso inicial incorrecto.');
          validar(Array.isArray(doc.titulosEnviados) && doc.titulosEnviados.length === 3, 'No viajaron los tres títulos.');
          return resumenDocumento(doc);
        });
    });
  }

  function paso2ConsultarEstudiante() {
    return ejecutarPaso(2, {
      documento: audit.docId,
      encontrado: true,
      estadoProceso: 'PENDIENTE_COORDINADOR',
      tituloPreferido: audit.datos.titulo2
    }, function () {
      return leerPorRestAislado(COL_ENV, audit.docId).then(function (doc) {
        validar(Boolean(doc), 'El alumno simulado no pudo recuperar su documento por REST.');
        validar(doc.estadoProceso === 'PENDIENTE_COORDINADOR', 'El alumno recibió un estadoProceso distinto al esperado.');
        validar((doc.tituloPreferidoTexto || doc.tituloElegido) === audit.datos.titulo2, 'El título preferido no coincide.');
        return resumenDocumento(doc);
      });
    });
  }

  function paso3ValidarCoordinacion() {
    var ahora = new Date().toISOString();
    var revision = {
      estado: 'VALIDADO',
      accion: 'VALIDAR',
      resultado: 'APROBADO_SIN_CAMBIOS',
      observacion: '',
      coordinadorId: 'AUDIT_COORD',
      coordinadorEmail: 'auditoria.coordinacion@itsqmet.local',
      coordinadorNombre: 'AUDITORÍA COORDINACIÓN',
      tituloSeleccionadoNumero: 2,
      tituloSeleccionadoTextoOriginal: audit.datos.titulo2,
      tituloSeleccionadoTexto: audit.datos.titulo2,
      corrigioTitulo: false,
      fechaLocal: ahora
    };
    var payload = {
      revisionCoordinador: revision,
      coordinadorRevisado: true,
      estado: 'PENDIENTE_INVESTIGADOR',
      estadoProceso: 'PENDIENTE_INVESTIGADOR',
      estadoCoordinador: 'VALIDADO',
      validadoCoordinacion: true,
      validadoCoordinador: true,
      resultadoCoordinador: 'APROBADO_SIN_CAMBIOS',
      tituloCoordinadorNumero: 2,
      tituloCoordinador: audit.datos.titulo2,
      comentarioCoordinador: '',
      fechaValidacionCoordinador: ahora,
      fechaResolucion: ahora,
      requiereAccionDe: 'INVESTIGACION',
      requiereRevision: false,
      permitirReenvio: false,
      puedeReenviar: false,
      devueltoPor: '',
      estadoInvestigador: 'PENDIENTE',
      actualizadoPorModulo: 'auditoria-coordinadores'
    };

    return ejecutarPaso(3, {
      estado: 'PENDIENTE_INVESTIGADOR',
      estadoCoordinador: 'VALIDADO',
      estadoInvestigador: 'PENDIENTE',
      tituloCoordinador: audit.datos.titulo2
    }, function () {
      var fb = window.TAFirebaseService;
      return fb.guardarDocumento(COL_ENV, audit.docId, payload, { merge: true })
        .then(function () { return registrarEvento('02_VALIDACION_COORDINACION', 'coordinadores', payload.estado, payload.estadoProceso); })
        .then(function () { return fb.leerDocumento(COL_ENV, audit.docId); })
        .then(function (doc) {
          validar(doc.estadoProceso === 'PENDIENTE_INVESTIGADOR', 'Coordinación no habilitó Investigación.');
          validar(doc.estadoCoordinador === 'VALIDADO', 'estadoCoordinador no quedó VALIDADO.');
          validar(doc.tituloCoordinador === audit.datos.titulo2, 'No viajó el título seleccionado por Coordinación.');
          return resumenDocumento(doc);
        });
    });
  }

  function paso4VerificarInvestigacion() {
    return ejecutarPaso(4, {
      encontradoEnCola: true,
      mismoDocumento: audit.docId,
      estadoProceso: 'PENDIENTE_INVESTIGADOR'
    }, function () {
      var fb = window.TAFirebaseService;
      return fb.consultarColeccion(COL_ENV, 'estadoProceso', '==', 'PENDIENTE_INVESTIGADOR', 20)
        .then(function (docs) {
          var doc = (docs || []).filter(function (item) { return item.id === audit.docId; })[0] || null;
          validar(Boolean(doc), 'Investigación no encontró el documento habilitado por Coordinación.');
          validar(doc.estadoCoordinador === 'VALIDADO', 'Investigación recibió un documento sin validación de Coordinación.');
          return Object.assign({ encontradosEnCola: (docs || []).length }, resumenDocumento(doc));
        });
    });
  }

  function paso5AprobarInvestigacion() {
    var ahora = new Date().toISOString();
    var revision = {
      estado: 'APROBADO',
      accion: 'APROBAR',
      observacion: '',
      investigadorId: 'AUDIT_INV',
      investigadorCedula: '9999999998',
      investigadorNombre: 'AUDITORÍA INVESTIGACIÓN',
      investigadorEmail: 'auditoria.investigacion@itsqmet.local',
      fechaLocal: ahora
    };
    var payload = {
      estadoInvestigador: 'APROBADO',
      revisionInvestigador: revision,
      investigacionRevisada: true,
      investigacionRevisadaEn: ahora,
      observacionInvestigacion: '',
      fechaResolucionInvestigacion: ahora,
      estado: 'APROBADO_FINAL',
      estadoProceso: 'APROBADO_FINAL',
      resultadoInvestigacion: 'APROBADO_SIN_CAMBIOS',
      tituloFinalInvestigacion: audit.datos.titulo2,
      tituloFinal: audit.datos.titulo2,
      requiereAccionDe: '',
      requiereRevision: false,
      permitirReenvio: false,
      puedeReenviar: false,
      devueltoPor: '',
      fechaResolucion: ahora,
      actualizadoPorModulo: 'auditoria-investigadores'
    };

    return ejecutarPaso(5, {
      estado: 'APROBADO_FINAL',
      estadoProceso: 'APROBADO_FINAL',
      estadoInvestigador: 'APROBADO',
      tituloFinal: audit.datos.titulo2
    }, function () {
      var fb = window.TAFirebaseService;
      return fb.guardarDocumento(COL_ENV, audit.docId, payload, { merge: true })
        .then(function () { return registrarEvento('03_APROBACION_INVESTIGACION', 'investigadores', payload.estado, payload.estadoProceso); })
        .then(function () { return fb.leerDocumento(COL_ENV, audit.docId); })
        .then(function (doc) {
          validar(doc.estado === 'APROBADO_FINAL', 'Investigación no dejó estado APROBADO_FINAL.');
          validar(doc.estadoProceso === 'APROBADO_FINAL', 'estadoProceso final incorrecto.');
          validar(doc.estadoInvestigador === 'APROBADO', 'estadoInvestigador final incorrecto.');
          validar(doc.tituloFinal === audit.datos.titulo2, 'El título final no coincide con el seleccionado por Coordinación.');
          setText('#metricState', doc.estado);
          return resumenDocumento(doc);
        });
    });
  }

  function paso6ConsultarFinal() {
    return ejecutarPaso(6, {
      encontrado: true,
      estado: 'APROBADO_FINAL',
      tituloFinal: audit.datos.titulo2
    }, function () {
      return leerPorRestAislado(COL_ENV, audit.docId).then(function (doc) {
        validar(Boolean(doc), 'El alumno no pudo recuperar el expediente final.');
        validar(doc.estado === 'APROBADO_FINAL', 'El alumno recibió un estado final incorrecto.');
        validar(doc.tituloFinal === audit.datos.titulo2, 'El alumno recibió un título final distinto.');
        return resumenDocumento(doc);
      });
    });
  }

  function paso7Limpiar() {
    return ejecutarPaso(7, {
      envioEliminado: true,
      eventosEliminados: true
    }, function () {
      return borrarDatosSimulados().then(function (resultado) {
        validar(resultado.envioEliminado, 'No se pudo eliminar el envío simulado.');
        validar(resultado.eventosEliminados, 'No se pudieron eliminar todos los eventos simulados.');
        return resultado;
      });
    });
  }

  function ejecutarPaso(numero, esperado, fn) {
    var card = flow.querySelector('[data-step="' + numero + '"]');
    var inicio = performance.now();
    actualizarPaso(card, 'running', 'Ejecutando', esperado, null, '');

    return Promise.resolve()
      .then(fn)
      .then(function (obtenido) {
        var ms = Math.round(performance.now() - inicio);
        actualizarPaso(card, 'ok', 'OK', esperado, obtenido, ms + ' ms');
        log('Paso ' + numero + ' OK · ' + ms + ' ms');
        return obtenido;
      })
      .catch(function (error) {
        var ms = Math.round(performance.now() - inicio);
        actualizarPaso(card, 'error', 'ERROR', esperado, {
          error: mensaje(error),
          codigo: error && (error.code || error.codigo) || ''
        }, ms + ' ms');
        log('Paso ' + numero + ' ERROR · ' + ms + ' ms · ' + mensaje(error));
        throw error;
      });
  }

  function inicializarFirebase() {
    var fb = window.TAFirebaseService;
    var config = window.TA_ESTUDIANTES_CONFIG;
    if (!fb || !config) return Promise.reject(new Error('Dependencias Firebase no disponibles.'));

    return timeoutDuro(fb.iniciar(config.firebase), 6000, 'TIMEOUT_FIREBASE_AUDITORIA')
      .then(function (resultado) {
        if (!resultado || resultado.ok === false) throw new Error(resultado && resultado.mensaje || 'Firebase no inició.');
        log('Firebase Títulos inicializada para auditoría.');
        return true;
      });
  }

  function registrarEvento(tipo, modulo, estado, estadoProceso) {
    var id = audit.runId + '__' + completar(String(audit.eventIds.length + 1), 2) + '__' + tipo;
    audit.eventIds.push(id);
    return window.TAFirebaseService.guardarDocumento(COL_EVT, id, {
      auditoriaRunId: audit.runId,
      esAuditoria: true,
      tipo: tipo,
      modulo: modulo,
      entidadId: audit.docId,
      estado: estado,
      estadoProceso: estadoProceso,
      fechaLocal: new Date().toISOString()
    }, { merge: false });
  }

  function leerPorRestAislado(collection, documentId) {
    var cfg = window.TA_CONSULTA_ESTADO_CONFIG || {};
    var url = construirUrlRest(cfg, collection, documentId);
    return fetchControlado(url, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      headers: { 'Accept': 'application/json' }
    }, 4500)
      .then(function (response) {
        return response.text().then(function (texto) {
          var body = parse(texto);
          if (response.status === 404) return null;
          if (!response.ok) {
            var err = new Error('REST ' + response.status + ': ' + ((body && body.error && body.error.message) || response.statusText));
            err.codigo = body && body.error && body.error.status || ('HTTP_' + response.status);
            throw err;
          }
          var service = window.TAConsultaEstadoService;
          return service && service.normalizarDocumentoRest
            ? service.normalizarDocumentoRest(body)
            : body;
        });
      });
  }

  function borrarDatosSimulados() {
    var fb = window.TAFirebaseService;
    var db;
    try { db = fb.getDbTitulos(); } catch (error) { return Promise.reject(error); }

    var ops = [
      db.collection(COL_ENV).doc(audit.docId).delete()
        .then(function () { return true; })
        .catch(function (error) { log('No se pudo borrar envío: ' + mensaje(error)); return false; })
    ];

    audit.eventIds.forEach(function (id) {
      ops.push(
        db.collection(COL_EVT).doc(id).delete()
          .then(function () { return true; })
          .catch(function (error) { log('No se pudo borrar evento ' + id + ': ' + mensaje(error)); return false; })
      );
    });

    return Promise.all(ops).then(function (resultados) {
      return {
        envioEliminado: resultados[0] === true,
        eventosEliminados: resultados.slice(1).every(Boolean),
        totalEventos: audit.eventIds.length
      };
    });
  }

  function limpiarManual() {
    if (!audit.docId) {
      setText('#runInfo', 'No hay una ejecución activa para limpiar.');
      return;
    }
    bloquear(true);
    inicializarFirebase()
      .then(borrarDatosSimulados)
      .then(function (r) {
        setText('#runInfo', r.envioEliminado ? 'Datos simulados limpiados.' : 'No se pudo limpiar completamente.');
      })
      .catch(function (e) {
        setText('#runInfo', 'Error al limpiar: ' + mensaje(e));
      })
      .finally(function () { bloquear(false); });
  }

  function ejecutarTransporteReal() {
    transportEl.innerHTML = '';
    var cedula = limpiarCedula(valor('#realCedula'));
    var periodo = String(valor('#realPeriodo') || '').trim();
    var cfg = window.TA_CONSULTA_ESTADO_CONFIG || {};
    var id = periodo + '__' + cedula;
    var url = construirUrlRest(cfg, cfg.collection || 'envios', id);

    transportBtn.disabled = true;

    return testTransporte('A', 'GET exacto simple', function () {
      return fetchControlado(url, {
        method: 'GET', mode: 'cors', credentials: 'omit', cache: 'no-store',
        headers: { 'Accept': 'application/json' }
      }, 4500).then(resumenHttp);
    })
    .then(function () {
      return testTransporte('B', 'GET con Cache-Control', function () {
        return fetchControlado(url, {
          method: 'GET', mode: 'cors', credentials: 'omit', cache: 'no-store',
          headers: { 'Accept':'application/json', 'Cache-Control':'no-cache' }
        }, 4500).then(resumenHttp);
      });
    })
    .then(function () {
      return testTransporte('C', 'TAConsultaEstadoService.consultar()', function () {
        return timeoutDuro(window.TAConsultaEstadoService.consultar(periodo, cedula), 5200, 'TIMEOUT_SERVICIO');
      });
    })
    .finally(function () { transportBtn.disabled = false; });
  }

  function testTransporte(codigo, nombre, fn) {
    var div = document.createElement('article');
    div.className = 'test';
    div.innerHTML = '<strong>' + esc(codigo + ' · ' + nombre) + '</strong><div class="muted" data-status>Ejecutando…</div><pre data-detail></pre>';
    transportEl.appendChild(div);
    var inicio = performance.now();

    return Promise.resolve().then(fn).then(function (r) {
      var ms = Math.round(performance.now() - inicio);
      var ok = r && r.ok !== false && Number(r.status || 200) < 400;
      div.className = 'test ' + (ok ? 'ok' : 'warn');
      div.querySelector('[data-status]').textContent = (ok ? 'OK' : 'NO EXITOSO') + ' · ' + ms + ' ms';
      div.querySelector('[data-detail]').textContent = JSON.stringify(r, null, 2);
      return r;
    }).catch(function (e) {
      var ms = Math.round(performance.now() - inicio);
      div.className = 'test error';
      div.querySelector('[data-status]').textContent = 'ERROR · ' + ms + ' ms';
      div.querySelector('[data-detail]').textContent = JSON.stringify({ error: mensaje(e), codigo: e && (e.codigo || e.code) || '' }, null, 2);
      return null;
    });
  }

  function resumenHttp(response) {
    return response.text().then(function (texto) {
      var body = parse(texto);
      var doc = body && body.fields && window.TAConsultaEstadoService && window.TAConsultaEstadoService.normalizarDocumentoRest
        ? window.TAConsultaEstadoService.normalizarDocumentoRest(body)
        : null;
      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        estado: doc && (doc.estado || doc.estadoProceso),
        tituloFinal: doc && (doc.tituloFinal || doc.tituloFinalInvestigacion),
        errorFirebase: body && body.error && { status: body.error.status, message: body.error.message }
      };
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

  function resumenDocumento(doc) {
    doc = doc || {};
    return {
      id: doc.id || doc._docId || '',
      cedula: doc.cedula || doc.numeroIdentificacion || '',
      periodoId: doc.periodoId || '',
      estado: doc.estado || '',
      estadoProceso: doc.estadoProceso || '',
      estadoCoordinador: doc.estadoCoordinador || '',
      estadoInvestigador: doc.estadoInvestigador || '',
      tituloCoordinador: doc.tituloCoordinador || '',
      tituloFinal: doc.tituloFinal || '',
      requiereAccionDe: doc.requiereAccionDe || '',
      actualizadoPorModulo: doc.actualizadoPorModulo || '',
      auditoriaRunId: doc.auditoriaRunId || ''
    };
  }

  function actualizarPaso(card, clase, badge, esperado, obtenido, tiempo) {
    if (!card) return;
    card.className = 'step ' + (clase || '');
    card.querySelector('[data-badge]').textContent = badge || '';
    card.querySelector('[data-expected]').textContent = JSON.stringify(esperado || {}, null, 2);
    card.querySelector('[data-actual]').textContent = obtenido ? JSON.stringify(obtenido, null, 2) : '—';
    card.querySelector('[data-time]').textContent = tiempo || '';
  }

  function reiniciarPanel() {
    Array.prototype.forEach.call(flow.querySelectorAll('[data-step]'), function (card) {
      card.className = 'step';
      card.querySelector('[data-badge]').textContent = 'Pendiente';
      card.querySelector('[data-expected]').textContent = '—';
      card.querySelector('[data-actual]').textContent = '—';
      card.querySelector('[data-time]').textContent = '';
    });
    logEl.textContent = '';
    setText('#metricRun', '—');
    setText('#metricDoc', '—');
    setText('#metricState', '—');
    setText('#metricTime', '—');
    setText('#runInfo', 'Sin ejecución activa.');
  }

  function leerDatosFormulario() {
    return {
      cedula: limpiarCedula(valor('#cedula')),
      periodo: String(valor('#periodo') || '').trim(),
      nombres: String(valor('#nombres') || '').trim(),
      carrera: String(valor('#carrera') || '').trim(),
      titulo1: String(valor('#titulo1') || '').trim(),
      titulo2: String(valor('#titulo2') || '').trim(),
      titulo3: String(valor('#titulo3') || '').trim()
    };
  }

  function construirUrlRest(cfg, collection, documentId) {
    var base = String(cfg.firestoreRestBase || 'https://firestore.googleapis.com/v1').replace(/\/$/, '');
    return base + '/projects/' + encodeURIComponent(cfg.projectId || '') +
      '/databases/' + encodeURIComponent(cfg.databaseId || '(default)') +
      '/documents/' + encodeURIComponent(collection) +
      '/' + encodeURIComponent(documentId) +
      '?key=' + encodeURIComponent(cfg.apiKey || '');
  }

  function validar(condicion, mensajeError) {
    if (!condicion) throw new Error(mensajeError || 'Validación fallida.');
  }

  function bloquear(valor) {
    runAll.disabled = Boolean(valor);
    cleanupBtn.disabled = Boolean(valor);
  }

  function log(texto) {
    logEl.textContent += (logEl.textContent ? '\n' : '') + new Date().toISOString() + '  ' + texto;
  }

  function valor(selector) {
    var el = document.querySelector(selector);
    return el ? el.value : '';
  }

  function setText(selector, value) {
    var el = document.querySelector(selector);
    if (el) el.textContent = String(value === undefined || value === null ? '' : value);
  }

  function limpiarCedula(value) {
    var cedula = String(value || '').replace(/\D/g, '');
    return cedula.length === 9 ? '0' + cedula : cedula;
  }

  function completar(texto, largo) {
    texto = String(texto || '');
    while (texto.length < largo) texto = '0' + texto;
    return texto;
  }

  function formatearPeriodo(periodo) {
    var m = String(periodo || '').match(/(\d{4})-(\d{2})__(\d{4})-(\d{2})/);
    if (!m) return periodo;
    var meses = {'01':'Enero','02':'Febrero','03':'Marzo','04':'Abril','05':'Mayo','06':'Junio','07':'Julio','08':'Agosto','09':'Septiembre','10':'Octubre','11':'Noviembre','12':'Diciembre'};
    return (meses[m[2]] || m[2]) + ' ' + m[1] + ' a ' + (meses[m[4]] || m[4]) + ' ' + m[3];
  }

  function parse(texto) {
    try { return JSON.parse(texto || ''); } catch (e) { return { rawText: texto }; }
  }

  function mensaje(error) {
    return error && error.message ? String(error.message) : String(error || '');
  }

  function esc(value) {
    return String(value || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }
})();