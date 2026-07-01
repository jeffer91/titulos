/* Controlador principal del módulo coordinadores. */
(function () {
  'use strict';

  var config = window.TA_COORDINADORES_CONFIG;
  var firebaseService = window.TACoordFirebaseService;
  var repository = window.TACoordRepository;

  var estado = {
    firebaseListo: false,
    appConfig: null,
    coordinador: null,
    titulos: []
  };

  document.addEventListener('DOMContentLoaded', iniciar);

  function iniciar() {
    actualizarModoEjecucion();
    conectarEventos();
    bloquearConsulta(true);
    renderDiagnosticoBase();
    iniciarFirebase();
  }

  function conectarEventos() {
    var form = qs('#formCoordinador');
    if (form) form.addEventListener('submit', consultarTitulos);
  }

  function iniciarFirebase() {
    setText('#estadoGeneral', 'Conectando Firebase');
    setText('#projectIdTexto', config.firebase.projectId || '—');
    setText('#firebaseMensaje', 'Inicializando conexión con Firebase...');

    if (!firebaseService || !repository) {
      estado.firebaseListo = false;
      setText('#estadoGeneral', 'Archivos incompletos');
      setText('#firebaseMensaje', 'No se cargaron los servicios Firebase del módulo coordinadores.');
      renderDiagnosticoBase('error', 'Archivos incompletos.');
      bloquearConsulta(true);
      return;
    }

    firebaseService.iniciar(config.firebase).then(function (resultado) {
      estado.firebaseListo = resultado.ok;

      if (!resultado.ok) {
        setText('#estadoGeneral', 'Firebase pendiente');
        setText('#firebaseMensaje', resultado.mensaje);
        renderDiagnosticoBase('pending', resultado.mensaje);
        bloquearConsulta(true);
        return;
      }

      setText('#estadoGeneral', 'Firebase conectado');
      setText('#firebaseMensaje', resultado.mensaje);
      bloquearConsulta(false);
      cargarConfigApp();
      renderDiagnosticoBase('ok', 'Firebase conectado.');
    });
  }

  function cargarConfigApp() {
    repository.cargarConfigApp()
      .then(function (appConfig) {
        estado.appConfig = appConfig;
        setText('#periodoActivoTexto', appConfig.periodoActivo || 'Sin período activo');
        if (appConfig.periodoActivo) setValue('#periodoInput', appConfig.periodoActivo);
      })
      .catch(function (error) {
        setText('#periodoActivoTexto', 'No disponible');
        showStatus('#consultaMensaje', 'No se pudo leer la configuración general: ' + obtenerMensajeError(error), 'warning');
      });
  }

  function consultarTitulos(event) {
    event.preventDefault();

    if (!estado.firebaseListo) {
      showStatus('#consultaMensaje', 'Firebase no está conectado.', 'warning');
      return;
    }

    var email = value('#coordEmailInput');
    var periodoId = value('#periodoInput');
    var estadoFiltro = value('#estadoFiltroInput') || 'TODOS';

    if (!email) {
      showStatus('#consultaMensaje', 'Ingresa el correo del coordinador.', 'error');
      return;
    }

    if (!periodoId) {
      showStatus('#consultaMensaje', 'Ingresa el período para consultar títulos.', 'error');
      return;
    }

    setLoading('#btnConsultarTitulos', true, 'Consultando...');
    showStatus('#consultaMensaje', 'Validando coordinador y consultando títulos...', 'info');
    renderTitulos([]);

    repository.buscarCoordinadorPorEmail(email)
      .then(function (coordinador) {
        estado.coordinador = coordinador;
        renderCoordinador(coordinador);
        return repository.listarTitulosParaCoordinador(coordinador, {
          periodoId: periodoId,
          estado: estadoFiltro
        });
      })
      .then(function (titulos) {
        estado.titulos = titulos;
        renderResumen(titulos);
        renderTitulos(titulos);
        showStatus('#consultaMensaje', 'Títulos encontrados para revisión: ' + titulos.length + '.', 'success');
      })
      .catch(function (error) {
        estado.titulos = [];
        renderResumen([]);
        renderTitulos([]);
        showStatus('#consultaMensaje', 'No se pudo consultar: ' + obtenerMensajeError(error), 'error');
      })
      .finally(function () {
        setLoading('#btnConsultarTitulos', false);
      });
  }

  function renderCoordinador(coordinador) {
    setText('#coordNombreTexto', coordinador.nombres || coordinador.email);
    setText('#coordCarrerasTexto', 'Carreras asignadas: ' + coordinador.carreras.join(', '));
    show('#seccionCoordinador');
  }

  function renderResumen(titulos) {
    var enviados = titulos.filter(function (titulo) {
      return String(titulo.estado || '').toUpperCase() === 'ENVIADO';
    }).length;

    setText('#totalTitulosTexto', String(titulos.length));
    setText('#totalEnviadosTexto', String(enviados));
    setText('#totalCarreraTexto', String(titulos.length));
  }

  function renderTitulos(titulos) {
    var container = qs('#titulosLista');
    if (!container) return;

    container.innerHTML = '';

    if (!titulos.length) {
      var empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'No hay títulos para mostrar con los filtros seleccionados.';
      container.appendChild(empty);
      return;
    }

    titulos.forEach(function (titulo) {
      container.appendChild(crearTituloCard(titulo));
    });
  }

  function crearTituloCard(titulo) {
    var card = document.createElement('article');
    card.className = 'title-item';

    var top = document.createElement('div');
    top.className = 'title-item__top';

    var info = document.createElement('div');
    var h3 = document.createElement('h3');
    h3.textContent = titulo.tituloPreferidoTexto || 'Sin título preferido';
    var meta = document.createElement('div');
    meta.className = 'title-meta';
    meta.appendChild(crearBadge(titulo.estado || 'ENVIADO', claseEstado(titulo.estado)));
    meta.appendChild(crearBadge(titulo.nombres || 'Sin nombres'));
    meta.appendChild(crearBadge(titulo.cedula || 'Sin cédula'));
    meta.appendChild(crearBadge(titulo.carrera || 'Sin carrera'));
    meta.appendChild(crearBadge('Preferido: propuesta ' + (titulo.tituloPreferidoNumero || 1)));

    info.appendChild(h3);
    info.appendChild(meta);

    var actions = document.createElement('div');
    actions.className = 'form-actions';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn--secondary';
    btn.textContent = 'Ver propuestas';
    btn.addEventListener('click', function () {
      togglePropuestas(card);
    });
    actions.appendChild(btn);

    top.appendChild(info);
    top.appendChild(actions);

    var propuestas = document.createElement('div');
    propuestas.className = 'proposal-list is-hidden';
    (titulo.titulosEnviados || []).forEach(function (propuesta) {
      propuestas.appendChild(crearPropuestaItem(propuesta, titulo.tituloPreferidoNumero));
    });

    card.appendChild(top);
    card.appendChild(propuestas);
    return card;
  }

  function crearPropuestaItem(propuesta, preferidoNumero) {
    var item = document.createElement('div');
    item.className = 'proposal-item';

    var strong = document.createElement('strong');
    strong.textContent = 'Propuesta ' + propuesta.numero + (Number(propuesta.numero) === Number(preferidoNumero) ? ' · preferida' : '');

    var titulo = document.createElement('p');
    titulo.textContent = 'Título: ' + (propuesta.tituloFinal || '—');

    var tema = document.createElement('p');
    tema.textContent = 'Tema: ' + (propuesta.temaGeneral || '—');

    var problema = document.createElement('p');
    problema.textContent = 'Problema: ' + (propuesta.problemaNecesidad || '—');

    item.appendChild(strong);
    item.appendChild(titulo);
    item.appendChild(tema);
    item.appendChild(problema);
    return item;
  }

  function crearBadge(text, extraClass) {
    var badge = document.createElement('span');
    badge.className = 'title-badge' + (extraClass ? ' ' + extraClass : '');
    badge.textContent = text || '—';
    return badge;
  }

  function claseEstado(estado) {
    var normalized = String(estado || '').toUpperCase();
    if (normalized.indexOf('APROBADO') !== -1) return 'is-aprobado';
    if (normalized.indexOf('DEVUELTO') !== -1) return 'is-devuelto';
    return 'is-enviado';
  }

  function togglePropuestas(card) {
    var propuestas = card.querySelector('.proposal-list');
    if (!propuestas) return;
    propuestas.classList.toggle('is-hidden');
  }

  function renderDiagnosticoBase(firebaseEstado, detalle) {
    var container = qs('#diagnosticoModulo');
    if (!container) return;

    var items = [
      { titulo: 'HTML independiente', descripcion: 'Pantalla de coordinadores lista.', estado: 'ok' },
      { titulo: 'CSS propio', descripcion: 'Estilos propios del módulo coordinadores.', estado: 'ok' },
      { titulo: 'JS propio', descripcion: 'Controlador y repositorio independientes.', estado: 'ok' },
      { titulo: 'Firebase', descripcion: detalle || 'Pendiente de conexión.', estado: firebaseEstado || 'pending' },
      { titulo: 'Listado de títulos', descripcion: 'Filtra títulos por período, estado y carreras asignadas.', estado: firebaseEstado === 'ok' ? 'ok' : 'pending' },
      { titulo: 'Revisión', descripcion: 'Aprobación y devolución se agregan en el siguiente bloque.', estado: 'pending' }
    ];

    container.innerHTML = '';
    items.forEach(function (item) {
      var card = document.createElement('div');
      card.className = 'diagnostic-item ' + claseDiagnostico(item.estado);

      var title = document.createElement('strong');
      title.textContent = item.titulo;

      var description = document.createElement('p');
      description.textContent = item.descripcion;

      card.appendChild(title);
      card.appendChild(description);
      container.appendChild(card);
    });
  }

  function claseDiagnostico(estadoItem) {
    if (estadoItem === 'ok') return 'is-ok';
    if (estadoItem === 'error') return 'is-error';
    return 'is-pending';
  }

  function bloquearConsulta(disabled) {
    var form = qs('#formCoordinador');
    if (!form) return;
    Array.prototype.slice.call(form.querySelectorAll('input, select, button')).forEach(function (element) {
      element.disabled = Boolean(disabled);
    });
  }

  function actualizarModoEjecucion() {
    setText('#modoEjecucionTexto', detectarModoEjecucion());
  }

  function detectarModoEjecucion() {
    if (window.location.protocol === 'file:') return 'Doble click';
    if (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost') return 'Live Server';
    if (window.navigator && /Electron/i.test(window.navigator.userAgent)) return 'Electron';
    return 'Web';
  }

  function qs(selector) {
    return document.querySelector(selector);
  }

  function show(selector) {
    var element = qs(selector);
    if (element) element.classList.remove('is-hidden');
  }

  function value(selector) {
    var element = qs(selector);
    return element ? String(element.value || '').trim() : '';
  }

  function setValue(selector, valueToSet) {
    var element = qs(selector);
    if (element) element.value = valueToSet == null ? '' : String(valueToSet);
  }

  function setText(selector, text) {
    var element = qs(selector);
    if (element) element.textContent = text || '—';
  }

  function showStatus(selector, message, type) {
    var element = qs(selector);
    if (!element) return;
    element.classList.remove('is-info', 'is-success', 'is-warning', 'is-error');
    if (type) element.classList.add('is-' + type);
    element.textContent = message || '';
  }

  function setLoading(selector, loading, text) {
    var button = qs(selector);
    if (!button) return;

    if (loading) {
      if (!button.dataset.originalText) button.dataset.originalText = button.textContent;
      button.textContent = text || 'Cargando...';
      button.disabled = true;
      return;
    }

    button.disabled = false;
    if (button.dataset.originalText) {
      button.textContent = button.dataset.originalText;
      delete button.dataset.originalText;
    }
  }

  function obtenerMensajeError(error) {
    return error && error.message ? error.message : String(error || 'Error desconocido');
  }
})();
