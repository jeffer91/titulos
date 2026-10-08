/*
  Seguimiento público de títulos para estudiantes.
  Si la cédula ya tiene un envío en titulos-ec2fa/envios, la consulta deja de tratarlo
  como error y muestra el estado de Coordinación, Investigación, títulos e historial.
*/
(function () {
  'use strict';

  var repositoryOriginal = window.TAEstudianteRepository;
  var recomendacionesOriginal = window.TAEstudianteRecomendacionesController;
  var firebaseService = window.TAEstudianteFirebaseService;
  var ultimoResultado = null;
  var instalado = false;

  instalar();

  function instalar() {
    if (instalado || !repositoryOriginal || !recomendacionesOriginal) return;
    instalado = true;
    envolverRepositorio();
    envolverRecomendaciones();
    inyectarEstilos();
  }

  function envolverRepositorio() {
    var copia = copiarObjeto(repositoryOriginal);

    copia.consultarEstudianteCompleto = function (cedula) {
      var appConfig = null;
      var estudiante = null;

      ultimoResultado = null;

      return repositoryOriginal.cargarConfiguracionApp()
        .then(function (config) {
          appConfig = config || {};
          return repositoryOriginal.buscarEstudiantePorCedula(cedula, appConfig);
        })
        .then(function (dataEstudiante) {
          estudiante = dataEstudiante;

          if (!estudiante) {
            return repositoryOriginal.consultarEstudianteCompleto(cedula);
          }

          return repositoryOriginal.consultarEnvio(estudiante.periodoId, estudiante.cedula || cedula)
            .then(function (envio) {
              if (!envio) {
                return repositoryOriginal.consultarEstudianteCompleto(cedula);
              }

              return cargarSeguimiento(envio, estudiante).then(function (seguimiento) {
                ultimoResultado = {
                  estudiante: estudiante,
                  appConfig: appConfig,
                  envioExistente: envio,
                  seguimiento: seguimiento,
                  modoConsulta: 'SEGUIMIENTO'
                };

                return {
                  ok: true,
                  data: ultimoResultado,
                  mensaje: ''
                };
              });
            });
        });
    };

    window.TAEstudianteRepository = Object.freeze(copia);
  }

  function envolverRecomendaciones() {
    var copia = copiarObjeto(recomendacionesOriginal);

    copia.mostrarModalRecomendaciones = function (opciones) {
      if (ultimoResultado && ultimoResultado.envioExistente && !(opciones && opciones.forzarFormulario)) {
        mostrarSeguimiento(ultimoResultado);
        return true;
      }

      return recomendacionesOriginal.mostrarModalRecomendaciones(opciones);
    };

    copia.cerrarRecomendaciones = function (opciones) {
      if (ultimoResultado && ultimoResultado.envioExistente && !(opciones && opciones.forzarFormulario)) {
        mostrarSeguimiento(ultimoResultado);
        return true;
      }

      return recomendacionesOriginal.cerrarRecomendaciones(opciones);
    };

    window.TAEstudianteRecomendacionesController = Object.freeze(copia);
  }

  function cargarSeguimiento(envio, estudiante) {
    return Promise.all([
      cargarVersiones(envio),
      cargarEventos(envio)
    ]).then(function (resultados) {
      return {
        envio: envio,
        estudiante: estudiante,
        versiones: resultados[0] || [],
        eventos: resultados[1] || [],
        historialProceso: Array.isArray(envio.historialProceso) ? envio.historialProceso.slice() : []
      };
    }).catch(function () {
      return {
        envio: envio,
        estudiante: estudiante,
        versiones: [],
        eventos: [],
        historialProceso: Array.isArray(envio.historialProceso) ? envio.historialProceso.slice() : []
      };
    });
  }

  function cargarVersiones(envio) {
    if (!firebaseService || typeof firebaseService.consultarColeccion !== 'function') {
      return Promise.resolve([]);
    }

    var id = limpiar(envio && envio.id);
    var cedula = soloNumeros(envio && (envio.cedula || envio.numeroIdentificacion));
    var periodo = limpiar(envio && (envio.periodoId || envio.periodoCanonicoId));

    return consultarConFallback([
      ['versiones_envio', 'envioId', id],
      ['versiones_envio', 'idOriginal', id],
      ['versiones_envio', 'tituloId', id],
      ['versiones_envio', 'cedula', cedula],
      ['versiones_envio', 'numeroIdentificacion', cedula]
    ], 120).then(function (items) {
      return (items || []).filter(function (item) {
        var periodoItem = limpiar(item.periodoId || item.periodoCanonicoId || item.periodo || '');
        return !periodo || !periodoItem || periodoItem === periodo;
      }).sort(function (a, b) {
        return fechaMs(b.fechaEnvio || b.archivadoEn || b.creadoEn || b.actualizadoEn) -
          fechaMs(a.fechaEnvio || a.archivadoEn || a.creadoEn || a.actualizadoEn);
      });
    });
  }

  function cargarEventos(envio) {
    if (!firebaseService || typeof firebaseService.consultarColeccion !== 'function') {
      return Promise.resolve([]);
    }

    var id = limpiar(envio && envio.id);
    var cedula = soloNumeros(envio && (envio.cedula || envio.numeroIdentificacion));
    var periodo = limpiar(envio && (envio.periodoId || envio.periodoCanonicoId));

    return consultarConFallback([
      ['workflow_events', 'tituloId', id],
      ['workflow_events', 'entidadId', id],
      ['workflow_events', 'cedula', cedula]
    ], 300).then(function (items) {
      return (items || []).filter(function (item) {
        var periodoItem = limpiar(item.periodoId || item.periodo || '');
        return !periodo || !periodoItem || periodoItem === periodo;
      }).sort(function (a, b) {
        return fechaMs(b.creadoEn || b.fechaLocal || b.actualizadoEn) -
          fechaMs(a.creadoEn || a.fechaLocal || a.actualizadoEn);
      });
    });
  }

  function consultarConFallback(consultas, limite) {
    var indice = 0;

    function siguiente() {
      if (indice >= consultas.length) return Promise.resolve([]);

      var item = consultas[indice++];
      if (!item[2]) return siguiente();

      return firebaseService.consultarColeccion(item[0], item[1], '==', item[2], limite)
        .then(function (docs) {
          return docs && docs.length ? docs : siguiente();
        })
        .catch(function () {
          return siguiente();
        });
    }

    return siguiente();
  }

  function mostrarSeguimiento(resultado) {
    resultado = resultado || ultimoResultado || {};
    ultimoResultado = resultado;

    var envio = resultado.envioExistente || {};
    var estudiante = resultado.estudiante || {};
    var seguimiento = resultado.seguimiento || {};
    var panel = obtenerPanel();
    var estados = calcularEstados(envio);

    /*
      Un envío existente SIEMPRE entra a seguimiento.
      Se cierran las rutas de registro nuevo para impedir que otro controlador
      vuelva a mostrar el formulario por accidente.
    */
    ocultar('#consultaCard');
    ocultar('#seccionEstudiante');
    ocultar('#formPropuestas');
    ocultar('#comprobanteFinal');
    cerrarModal('#modalRecomendaciones');
    cerrarModal('#modalResumen');
    mostrar('#wizardSteps');
    sincronizarCabeceraSeguimiento(estudiante, envio, estados);

    panel.innerHTML = construirHtmlSeguimiento(estudiante, envio, seguimiento, estados);
    panel.classList.remove('is-hidden');
    panel.setAttribute('aria-hidden', 'false');

    conectarAcciones(panel, envio);

    window.setTimeout(function () {
      if (panel && panel.scrollIntoView) {
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 80);
  }

  function obtenerPanel() {
    var panel = document.querySelector('#seguimientoTituloPanel');
    if (panel) return panel;

    panel = document.createElement('section');
    panel.id = 'seguimientoTituloPanel';
    panel.className = 'card seguimiento-titulo is-hidden';
    panel.setAttribute('aria-hidden', 'true');

    var wizard = document.querySelector('#wizardSteps') || document.querySelector('main');
    if (wizard) wizard.appendChild(panel);

    return panel;
  }

  function construirHtmlSeguimiento(estudiante, envio, seguimiento, estados) {
    var propuestas = obtenerPropuestas(envio);
    var revisionCoord = envio.revisionCoordinador || {};
    var revisionInv = envio.revisionInvestigador || {};
    var tituloCoord = estados.coordinacionAprobada
      ? obtenerTituloCoordinacion(envio)
      : '';
    var tituloFinal = obtenerTituloFinal(envio, tituloCoord, estados);
    var historial = construirHistorial(seguimiento, envio);
    var puedeReenviar = envio.puedeReenviar === true || envio.permitirReenvio === true;

    return [
      '<div class="seguimiento-head">',
        '<div>',
          '<p class="section-kicker">Seguimiento de titulación</p>',
          '<h2>Estado de mi título</h2>',
          '<p>Consulta el avance de tus títulos sin volver a enviar información.</p>',
        '</div>',
        '<span class="seguimiento-badge ' + claseEstado(estados.general.tipo) + '">' + escapar(estados.general.label) + '</span>',
      '</div>',

      renderEstadoPrincipal(estados, puedeReenviar),

      '<div class="seguimiento-student-grid">',
        dato('Estudiante', estudiante.nombres || envio.nombres || envio.nombreCompleto || '—'),
        dato('Cédula', estudiante.cedula || envio.cedula || envio.numeroIdentificacion || '—'),
        dato('Carrera', estudiante.carrera || envio.carreraNombre || envio.carrera || '—'),
        dato('Período', estudiante.periodoLabel || envio.periodoNombre || envio.periodoId || '—'),
      '</div>',

      '<div class="seguimiento-progress">',
        renderPasoRevision('1', 'Revisión inicial', estados.coordinacion, revisionCoord, envio),
        '<div class="seguimiento-progress__line"></div>',
        renderPasoRevision('2', 'Investigación', estados.investigacion, revisionInv, envio),
        '<div class="seguimiento-progress__line"></div>',
        renderPasoFinal(estados, tituloFinal),
      '</div>',

      '<section class="seguimiento-section">',
        '<div class="seguimiento-section__head"><div><span>Títulos registrados</span><h3>Tus títulos</h3></div><small>' + propuestas.length + ' registrado' + (propuestas.length === 1 ? '' : 's') + '</small></div>',
        propuestas.length ? propuestas.map(function (p) {
          return renderPropuesta(p, envio, tituloCoord, tituloFinal);
        }).join('') : '<div class="seguimiento-empty">No se encontraron títulos registrados en este envío.</div>',
      '</section>',

      (tituloCoord ? [
        '<section class="seguimiento-section seguimiento-section--selected">',
          '<span class="seguimiento-label">Título seleccionado en la revisión inicial</span>',
          '<p class="seguimiento-title-text">' + escapar(tituloCoord) + '</p>',
        '</section>'
      ].join('') : ''),

      (tituloFinal ? [
        '<section class="seguimiento-section seguimiento-section--final">',
          '<span class="seguimiento-label">Título final aprobado</span>',
          '<p class="seguimiento-title-text">' + escapar(tituloFinal) + '</p>',
        '</section>'
      ].join('') : ''),

      renderObservaciones(envio, revisionCoord, revisionInv),

      '<section class="seguimiento-section seguimiento-section--history">',
        '<div class="seguimiento-section__head"><div><span>Proceso</span><h3>Historial</h3></div><small>' + historial.length + '</small></div>',
        historial.length ? '<div class="seguimiento-history seguimiento-history--compact">' + historial.map(renderHistorial).join('') + '</div>' : '<div class="seguimiento-empty">Sin movimientos anteriores.</div>',
      '</section>',

      '<div class="seguimiento-actions">',
        '<button type="button" class="btn btn--ghost" id="btnSeguimientoNuevaConsulta">Consultar otra cédula</button>',
      '</div>'
    ].join('');
  }

  function calcularEstados(envio) {
    envio = envio || {};

    var revisionCoord = envio.revisionCoordinador || {};
    var revisionInv = envio.revisionInvestigador || {};
    var canonico = resolverEstadoCanonico(envio);
    var coord = normalizarEstado(envio.estadoCoordinador || revisionCoord.estado || '');
    var inv = normalizarEstado(envio.estadoInvestigador || revisionInv.estado || '');

    var coordDevuelto = canonico === 'DEVUELTO_COORDINACION';
    var invDevuelto = canonico === 'DEVUELTO_INVESTIGACION';
    var finalAprobado = canonico === 'APROBADO_FINAL';

    var coordAprobado = finalAprobado ||
      canonico === 'INVESTIGACION_PENDIENTE' ||
      invDevuelto ||
      coord === 'VALIDADO' ||
      coord === 'APROBADO' ||
      coord === 'APROBADO_CON_OBSERVACION' ||
      envio.validadoCoordinador === true ||
      envio.validadoCoordinacion === true ||
      Boolean(obtenerTituloCoordinacion(envio));

    var invAprobado = finalAprobado ||
      inv === 'APROBADO' ||
      inv === 'APROBADO_CON_OBSERVACION';

    var estadoCoord = coordDevuelto
      ? estado('Devuelto', 'danger')
      : coordAprobado
        ? estado('Aprobado', 'success')
        : estado('Pendiente', 'pending');

    var estadoInv = invDevuelto
      ? estado('Devuelto', 'danger')
      : finalAprobado
        ? estado(inv === 'APROBADO_CON_OBSERVACION' ? 'Aprobado con observación' : 'Aprobado', inv === 'APROBADO_CON_OBSERVACION' ? 'warning' : 'success')
        : coordAprobado
          ? estado('Pendiente', 'pending')
          : estado('Aún no habilitado', 'muted');

    var estadoGeneral;

    if (finalAprobado) {
      estadoGeneral = estado('Aprobación final', 'success');
    } else if (coordDevuelto || invDevuelto) {
      estadoGeneral = estado('Requiere corrección', 'danger');
    } else if (canonico === 'INVESTIGACION_PENDIENTE' || coordAprobado) {
      estadoGeneral = estado('Pendiente de revisión de Investigación', 'pending');
    } else {
      estadoGeneral = estado('Pendiente de revisión de Coordinación', 'pending');
    }

    return {
      canonico: canonico,
      general: estadoGeneral,
      coordinacion: estadoCoord,
      investigacion: estadoInv,
      finalAprobado: finalAprobado,
      coordinacionAprobada: coordAprobado,
      investigacionAprobada: invAprobado,
      coordinacionDevuelta: coordDevuelto,
      investigacionDevuelta: invDevuelto
    };
  }

  function resolverEstadoCanonico(envio) {
    envio = envio || {};

    var general = aliasEstado(envio.estado);
    var proceso = aliasEstado(envio.estadoProceso);
    var coord = normalizarEstado(envio.estadoCoordinador || (envio.revisionCoordinador && envio.revisionCoordinador.estado) || '');
    var inv = normalizarEstado(envio.estadoInvestigador || (envio.revisionInvestigador && envio.revisionInvestigador.estado) || '');
    var devueltoPor = normalizarEstado(envio.devueltoPor || '');

    if (
      general === 'APROBADO_FINAL' ||
      proceso === 'APROBADO_FINAL' ||
      envio.procesoCerrado === true ||
      ((inv === 'APROBADO' || inv === 'APROBADO_CON_OBSERVACION') && envio.investigacionRevisada === true)
    ) {
      return 'APROBADO_FINAL';
    }

    if (
      general === 'DEVUELTO_INVESTIGACION' ||
      proceso === 'DEVUELTO_INVESTIGACION' ||
      inv === 'DEVUELTO' ||
      ((general === 'DEVUELTO' || proceso === 'DEVUELTO') &&
        (devueltoPor === 'INVESTIGACION' || devueltoPor === 'INVESTIGADOR'))
    ) {
      return 'DEVUELTO_INVESTIGACION';
    }

    if (
      general === 'DEVUELTO_COORDINACION' ||
      proceso === 'DEVUELTO_COORDINACION' ||
      coord === 'DEVUELTO' ||
      ((general === 'DEVUELTO' || proceso === 'DEVUELTO') &&
        (!devueltoPor || devueltoPor === 'COORDINADOR' || devueltoPor === 'COORDINACION'))
    ) {
      return 'DEVUELTO_COORDINACION';
    }

    if (
      general === 'INVESTIGACION_PENDIENTE' ||
      proceso === 'INVESTIGACION_PENDIENTE' ||
      coord === 'VALIDADO' ||
      coord === 'APROBADO' ||
      coord === 'APROBADO_CON_OBSERVACION' ||
      envio.validadoCoordinador === true ||
      envio.validadoCoordinacion === true ||
      Boolean(obtenerTituloCoordinacion(envio))
    ) {
      return 'INVESTIGACION_PENDIENTE';
    }

    if (
      general === 'COORDINACION_PENDIENTE' ||
      proceso === 'COORDINACION_PENDIENTE' ||
      general === 'PENDIENTE_REVISION' ||
      proceso === 'PENDIENTE_REVISION' ||
      (Array.isArray(envio.titulosEnviados) && envio.titulosEnviados.length)
    ) {
      return 'COORDINACION_PENDIENTE';
    }

    return 'COORDINACION_PENDIENTE';
  }

  function aliasEstado(valor) {
    var estadoNormal = normalizarEstado(valor);
    var aliases = {
      PENDIENTE_COORDINADOR: 'COORDINACION_PENDIENTE',
      COORDINACION_PENDIENTE: 'COORDINACION_PENDIENTE',
      PENDIENTE_REVISION: 'COORDINACION_PENDIENTE',
      PENDIENTE_INVESTIGADOR: 'INVESTIGACION_PENDIENTE',
      INVESTIGACION_PENDIENTE: 'INVESTIGACION_PENDIENTE',
      DEVUELTO_COORDINADOR: 'DEVUELTO_COORDINACION',
      DEVUELTO_COORDINACION: 'DEVUELTO_COORDINACION',
      DEVUELTO_INVESTIGADOR: 'DEVUELTO_INVESTIGACION',
      DEVUELTO_INVESTIGACION: 'DEVUELTO_INVESTIGACION',
      APROBADO_FINAL: 'APROBADO_FINAL'
    };

    return aliases[estadoNormal] || estadoNormal;
  }

  function obtenerTituloCoordinacion(envio) {
    envio = envio || {};
    var revision = envio.revisionCoordinador || {};
    var directo = limpiar(
      revision.tituloSeleccionadoTexto ||
      envio.tituloCoordinador ||
      envio.tituloSeleccionadoTexto ||
      ''
    );

    if (directo) return directo;

    var numero = Number(
      revision.tituloSeleccionadoNumero ||
      envio.tituloCoordinadorNumero ||
      envio.tituloSeleccionadoNumero ||
      0
    );

    if (!numero) return '';

    var propuesta = obtenerPropuestas(envio).filter(function (item) {
      return Number(item.numero) === numero;
    })[0];

    return propuesta ? limpiar(propuesta.tituloFinal || propuesta.titulo || '') : '';
  }

  function obtenerTituloFinal(envio, tituloCoord, estados) {
    envio = envio || {};
    var revisionInv = envio.revisionInvestigador || {};

    var directo = limpiar(
      envio.tituloFinal ||
      envio.tituloFinalInvestigacion ||
      revisionInv.tituloFinal ||
      revisionInv.tituloSeleccionadoTexto ||
      ''
    );

    if (directo) return directo;
    if (estados && estados.finalAprobado) return limpiar(tituloCoord);

    return '';
  }

  function sincronizarCabeceraSeguimiento(estudiante, envio, estados) {
    var badge = document.querySelector('#estadoProcesoBadge');
    var periodo = document.querySelector('#periodoActivoBadge');

    if (badge && estados && estados.general) {
      badge.textContent = estados.general.label;
      badge.className = 'status-pill ' + (
        estados.general.tipo === 'success' ? 'status-pill--success' :
        estados.general.tipo === 'danger' ? 'status-pill--danger' :
        'status-pill--info'
      );
    }

    if (periodo) {
      periodo.textContent =
        (estudiante && (estudiante.periodoLabel || estudiante.periodoId)) ||
        envio.periodoNombre ||
        envio.periodoLabel ||
        envio.periodoId ||
        'Período por confirmar';
    }
  }

  function cerrarModal(selector) {
    var modal = document.querySelector(selector);
    if (!modal) return;
    modal.classList.add('is-hidden');
    modal.setAttribute('aria-hidden', 'true');
  }

  function renderEstadoPrincipal(estados, puedeReenviar) {
    var label = estados && estados.general ? estados.general.label : 'Pendiente de revisión';
    var tipo = estados && estados.general ? estados.general.tipo : 'pending';
    var detalle = 'Tus títulos fueron recibidos correctamente y están esperando la primera revisión.';

    if (estados && estados.finalAprobado) {
      detalle = 'Tu proceso de revisión terminó y ya cuentas con una aprobación final.';
    } else if (tipo === 'danger') {
      detalle = 'Revisa la observación y corrige tus títulos para reenviarlos.';
    } else if (estados && estados.coordinacionAprobada) {
      detalle = 'La revisión inicial ya terminó. Tu título continúa con la revisión de Investigación.';
    }

    return [
      '<section class="seguimiento-status-hero ' + claseEstado(tipo) + '">',
        '<div class="seguimiento-status-hero__icon" aria-hidden="true">' + (tipo === 'success' ? '✓' : tipo === 'danger' ? '!' : '•') + '</div>',
        '<div class="seguimiento-status-hero__body">',
          '<span>Estado actual</span>',
          '<strong>' + escapar(label) + '</strong>',
          '<p>' + escapar(detalle) + '</p>',
          puedeReenviar ? '<div class="seguimiento-status-hero__action"><button type="button" class="btn btn--danger" id="btnSeguimientoCorregir">Corregir mis títulos</button></div>' : '',
        '</div>',
      '</section>'
    ].join('');
  }

  function renderPasoRevision(numero, nombre, estadoPaso, revision, envio) {
    revision = revision || {};
    var esRevisionInicial = nombre === 'Revisión inicial';
    var fecha = revision.fechaLocal || revision.fecha ||
      (esRevisionInicial ? envio.fechaValidacionCoordinador : envio.fechaResolucionInvestigacion);
    var responsable = esRevisionInicial
      ? (revision.coordinadorNombre || revision.coordinadorEmail || envio.ultimoCoordinador || envio.coordinador || '')
      : (revision.investigadorNombre || revision.investigadorEmail || '');

    return [
      '<article class="seguimiento-step">',
        '<div class="seguimiento-step__number ' + claseEstado(estadoPaso.tipo) + '">' + numero + '</div>',
        '<div><span>' + escapar(nombre) + '</span><strong>' + escapar(estadoPaso.label) + '</strong>',
        responsable ? '<small>' + escapar(responsable) + '</small>' : '',
        fecha ? '<small>' + escapar(formatearFecha(fecha)) + '</small>' : '',
        '</div>',
      '</article>'
    ].join('');
  }

  function renderPasoFinal(estados, tituloFinal) {
    var estadoFinal = estados.finalAprobado ? estado('Aprobado', 'success') : estado('Pendiente', 'muted');
    return [
      '<article class="seguimiento-step">',
        '<div class="seguimiento-step__number ' + claseEstado(estadoFinal.tipo) + '">3</div>',
        '<div><span>Aprobación final</span><strong>' + escapar(estadoFinal.label) + '</strong>',
        tituloFinal ? '<small>Título definitivo disponible</small>' : '<small>Se activa al completar las dos revisiones</small>',
        '</div>',
      '</article>'
    ].join('');
  }

  function renderPropuesta(propuesta, envio, tituloCoord, tituloFinal) {
    var numero = Number(propuesta.numero || 0);
    var texto = limpiar(propuesta.tituloFinal || propuesta.titulo || propuesta.texto || '');
    var tags = [];

    if (numero && Number(envio.tituloPreferidoNumero || 0) === numero) tags.push('Preferido por ti');
    if (texto && tituloCoord && normalizarComparacion(texto) === normalizarComparacion(tituloCoord)) tags.push('Seleccionado en revisión');
    if (texto && tituloFinal && normalizarComparacion(texto) === normalizarComparacion(tituloFinal)) tags.push('Título final');

    return [
      '<article class="seguimiento-propuesta">',
        '<div class="seguimiento-propuesta__meta"><strong>Título ' + escapar(numero || '') + '</strong>',
        tags.length ? '<div>' + tags.map(function (tag) { return '<span class="seguimiento-mini-tag">' + escapar(tag) + '</span>'; }).join('') + '</div>' : '',
        '</div>',
        '<p>' + escapar(texto || 'Título no disponible') + '</p>',
      '</article>'
    ].join('');
  }

  function renderObservaciones(envio, coord, inv) {
    var items = [];
    var obsCoord = limpiar(coord.observacion || envio.comentarioCoordinador || '');
    var obsInv = limpiar(inv.observacion || envio.observacionInvestigacion || '');
    var devolucion = limpiar(envio.observacionDevolucion || '');

    if (obsCoord) items.push({ titulo: 'Observación de la revisión inicial', texto: obsCoord });
    if (obsInv) items.push({ titulo: 'Observación de Investigación', texto: obsInv });
    if (devolucion && !items.some(function (item) { return item.texto === devolucion; })) {
      items.push({ titulo: 'Motivo de devolución', texto: devolucion });
    }

    if (!items.length) return '';

    return [
      '<section class="seguimiento-section">',
        '<div class="seguimiento-section__head"><div><span>Revisión</span><h3>Observaciones</h3></div></div>',
        items.map(function (item) {
          return '<div class="seguimiento-note"><strong>' + escapar(item.titulo) + '</strong><p>' + escapar(item.texto) + '</p></div>';
        }).join(''),
      '</section>'
    ].join('');
  }

  function construirHistorial(seguimiento, envio) {
    seguimiento = seguimiento || {};
    var salida = [];
    var vistos = {};
    var eventos = Array.isArray(seguimiento.eventos) ? seguimiento.eventos.slice() : [];

    /*
      workflow_events es la fuente principal porque representa acciones reales.
      Las otras colecciones se usan solo como respaldo para registros antiguos.
    */
    if (eventos.length) {
      eventos.slice(0, 40).forEach(function (evento) {
        var item = resumirEventoHistorial(evento);
        if (item) agregarHistorialCompacto(salida, vistos, item);
      });
    } else {
      (seguimiento.historialProceso || []).forEach(function (item) {
        var revCoord = item.revisionCoordinador || {};
        var revInv = item.revisionInvestigador || {};
        var revision = revInv.estado ? revInv : revCoord;
        var estado = normalizarEstado(revision.estado || item.estado || item.estadoProceso || '');

        if (estado === 'DEVUELTO') {
          agregarHistorialCompacto(salida, vistos, {
            titulo: 'Devuelto',
            fecha: revision.fechaLocal || revision.fecha || item.fecha || item.actualizadoEn || item.fechaEnvio,
            estado: 'DEVUELTO',
            observacion: revision.observacion || item.observacion || ''
          });
        } else if (estado === 'VALIDADO' || estado.indexOf('APROBADO') !== -1) {
          agregarHistorialCompacto(salida, vistos, {
            titulo: 'Aprobado',
            fecha: revision.fechaLocal || revision.fecha || item.fecha || item.actualizadoEn || item.fechaEnvio,
            estado: 'APROBADO',
            observacion: revision.observacion || item.observacion || ''
          });
        }
      });

      (seguimiento.versiones || []).forEach(function (version) {
        agregarHistorialCompacto(salida, vistos, {
          titulo: Number(version.numeroReenvios || 0) > 0 ? 'Reenviado' : 'Enviado',
          fecha: version.fechaEnvio || version.creadoEn || version.actualizadoEn,
          estado: 'PENDIENTE_REVISION',
          observacion: ''
        });
      });
    }

    salida.sort(function (a, b) { return fechaMs(b.fecha) - fechaMs(a.fecha); });
    return salida.slice(0, 12);
  }

  function resumirEventoHistorial(evento) {
    evento = evento || {};
    var accion = normalizarEstado(evento.accion || evento.tipo || '');
    var revision = evento.revision || {};
    var estadoRevision = normalizarEstado(revision.estado || evento.estado || '');
    var fecha = evento.creadoEn || evento.fechaLocal || evento.actualizadoEn || revision.fechaLocal || revision.fecha || '';
    var observacion = limpiar(revision.observacion || evento.observacion || '');

    if (accion.indexOf('REENVIO_ESTUDIANTE') !== -1 || accion === 'REENVIO') {
      return { titulo: 'Reenviado', fecha: fecha, estado: 'PENDIENTE_REVISION', observacion: '' };
    }

    if (accion.indexOf('ENVIO_ESTUDIANTE') !== -1 || accion === 'ENVIO') {
      return { titulo: 'Enviado', fecha: fecha, estado: 'PENDIENTE_REVISION', observacion: '' };
    }

    if (
      accion === 'DEVOLVER' ||
      estadoRevision === 'DEVUELTO' ||
      accion.indexOf('DEVUELTO') !== -1
    ) {
      return { titulo: 'Devuelto', fecha: fecha, estado: 'DEVUELTO', observacion: observacion };
    }

    if (
      accion === 'VALIDAR_CORRECCION' ||
      normalizarEstado(revision.resultado) === 'APROBADO_CON_CORRECCION'
    ) {
      return { titulo: 'Aprobado con corrección', fecha: fecha, estado: 'APROBADO_CON_CORRECCION', observacion: observacion };
    }

    if (
      accion === 'VALIDAR' ||
      accion === 'APROBAR' ||
      accion === 'APROBAR_OBSERVACION' ||
      estadoRevision === 'VALIDADO' ||
      estadoRevision === 'APROBADO' ||
      estadoRevision === 'APROBADO_CON_OBSERVACION'
    ) {
      return {
        titulo: estadoRevision === 'APROBADO_CON_OBSERVACION' ? 'Aprobado con observación' : 'Aprobado',
        fecha: fecha,
        estado: estadoRevision || 'APROBADO',
        observacion: observacion
      };
    }

    return null;
  }

  function agregarHistorialCompacto(salida, vistos, item) {
    if (!item || !item.fecha || !item.titulo) return;

    var minuto = Math.floor(fechaMs(item.fecha) / 60000);
    var clave = [
      normalizarEstado(item.titulo),
      limpiar(item.observacion).toLowerCase(),
      minuto
    ].join('|');

    if (vistos[clave]) return;
    vistos[clave] = true;
    salida.push(item);
  }


  function agregarHistorial(salida, vistos, item) {
    var clave = [
      normalizarEstado(item.estado),
      limpiar(item.detalle).toLowerCase(),
      limpiar(item.observacion).toLowerCase(),
      fechaMs(item.fecha)
    ].join('|');

    if (vistos[clave]) return;
    vistos[clave] = true;
    salida.push(item);
  }

  function renderHistorial(item) {
    return [
      '<article class="seguimiento-history__item seguimiento-history__item--compact">',
        '<div class="seguimiento-history__dot"></div>',
        '<div class="seguimiento-history__body">',
          '<div class="seguimiento-history__top">',
            '<strong>' + escapar(item.titulo || 'Movimiento') + '</strong>',
            '<time>' + escapar(formatearFechaHistorial(item.fecha)) + '</time>',
          '</div>',
          item.observacion ? '<p class="seguimiento-history__obs">' + escapar(item.observacion) + '</p>' : '',
        '</div>',
      '</article>'
    ].join('');
  }

  function conectarAcciones(panel, envio) {
    var nueva = panel.querySelector('#btnSeguimientoNuevaConsulta');
    var corregir = panel.querySelector('#btnSeguimientoCorregir');

    if (nueva) {
      nueva.addEventListener('click', function () {
        window.location.reload();
      });
    }

    if (corregir) {
      corregir.addEventListener('click', function () {
        var state = window.TAEstudianteState;
        var formularioController = window.TAEstudianteFormularioController;
        var paginacion = window.TAEstudiantePaginacion;
        var estado = state && typeof state.obtener === 'function' ? state.obtener() : {};
        var datos = {
          estudiante: estado.estudiante || (ultimoResultado && ultimoResultado.estudiante) || {},
          appConfig: estado.appConfig || (ultimoResultado && ultimoResultado.appConfig) || {},
          envioExistente: envio,
          forzarReenvio: true
        };

        if (!(envio.puedeReenviar === true || envio.permitirReenvio === true)) return;

        /*
          El reenvío debe abrir directamente el formulario editable con los títulos
          ya registrados. Antes solo se mostraba el contenedor visual y la
          paginación seguía en "consulta", por lo que Continuar podía quedar bloqueado.
        */
        if (
          formularioController &&
          typeof formularioController.inicializarFormularioTrasConsulta === 'function'
        ) {
          formularioController.inicializarFormularioTrasConsulta(datos);
        } else {
          mostrar('#wizardSteps');
          mostrar('#seccionEstudiante');
          mostrar('#formPropuestas');
        }

        panel.classList.add('is-hidden');
        panel.setAttribute('aria-hidden', 'true');

        if (paginacion) {
          if (typeof paginacion.habilitarHasta === 'function') {
            paginacion.habilitarHasta('propuesta1');
          }
          if (typeof paginacion.irA === 'function') {
            paginacion.irA('propuesta1', true, { forzar: true });
          }
        }

        if (window.TATitulosExternos && typeof window.TATitulosExternos.actualizarEstados === 'function') {
          window.setTimeout(window.TATitulosExternos.actualizarEstados, 0);
        }
      });
    }
  }

  function obtenerPropuestas(envio) {
    envio = envio || {};
    var lista = [];

    if (Array.isArray(envio.titulosEnviados) && envio.titulosEnviados.length) lista = envio.titulosEnviados;
    else if (Array.isArray(envio.propuestas) && envio.propuestas.length) lista = envio.propuestas;
    else if (Array.isArray(envio.propuestasDetalle) && envio.propuestasDetalle.length) lista = envio.propuestasDetalle;

    if (lista.length) {
      return lista.map(function (item, index) {
        item = item || {};
        var titulo = limpiar(item.tituloFinal || item.titulo || item.texto || item.tituloPropuesto || '');
        if (!titulo) return null;
        return Object.assign({}, item, {
          numero: Number(item.numero || index + 1),
          tituloFinal: titulo
        });
      }).filter(Boolean);
    }

    return [1, 2, 3].map(function (numero) {
      var texto = limpiar(envio['titulo' + numero]);
      return texto ? { numero: numero, tituloFinal: texto } : null;
    }).filter(Boolean);
  }

  function obtenerTituloPrincipal(data) {
    return limpiar(
      data.tituloFinal ||
      data.tituloFinalInvestigacion ||
      data.tituloCoordinador ||
      data.tituloElegido ||
      data.tituloPreferidoTexto ||
      data.titulo1 || ''
    );
  }

  function etiquetaEvento(evento) {
    var tipo = normalizarEstado(evento && (evento.accion || evento.tipo || ''));
    if (tipo.indexOf('COORDINADOR') !== -1) return 'Revisión de Coordinación';
    if (tipo.indexOf('INVESTIGADOR') !== -1 || tipo.indexOf('INVESTIGACION') !== -1) return 'Revisión de Investigación';
    if (tipo.indexOf('REENVIO') !== -1) return 'Reenvío del estudiante';
    if (tipo.indexOf('ENVIO') !== -1) return 'Envío del estudiante';
    if (tipo.indexOf('ARCHIV') !== -1) return 'Versión archivada';
    return formatearEstado(tipo || 'MOVIMIENTO');
  }

  function dato(label, valor) {
    return '<div class="seguimiento-dato"><span>' + escapar(label) + '</span><strong>' + escapar(valor || '—') + '</strong></div>';
  }

  function estado(label, tipo) {
    return { label: label, tipo: tipo };
  }

  function claseEstado(tipo) {
    tipo = limpiar(tipo).toLowerCase();
    if (tipo === 'success') return 'is-success';
    if (tipo === 'danger') return 'is-danger';
    if (tipo === 'warning') return 'is-warning';
    if (tipo === 'pending') return 'is-pending';
    return 'is-muted';
  }

  function formatearEstado(valor) {
    var texto = limpiar(valor).replace(/_/g, ' ').toLowerCase();
    if (!texto) return 'Movimiento';
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  }

  function normalizarEstado(valor) {
    return limpiar(valor).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_').toUpperCase();
  }

  function normalizarComparacion(valor) {
    return limpiar(valor).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
  }

  function formatearFechaHistorial(valor) {
    var fecha = fechaDate(valor);
    if (!fecha) return '';

    try {
      return new Intl.DateTimeFormat('es-EC', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      }).format(fecha);
    } catch (error) {
      return fecha.toLocaleString();
    }
  }

  function formatearFecha(valor) {
    var fecha = fechaDate(valor);
    if (!fecha) return 'Sin fecha';

    try {
      return new Intl.DateTimeFormat('es-EC', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
      }).format(fecha);
    } catch (error) {
      return fecha.toLocaleString();
    }
  }

  function fechaDate(valor) {
    if (!valor) return null;
    if (valor && typeof valor.toDate === 'function') return valor.toDate();
    if (valor && typeof valor.seconds === 'number') return new Date(valor.seconds * 1000);
    var fecha = new Date(valor);
    return isNaN(fecha.getTime()) ? null : fecha;
  }

  function fechaMs(valor) {
    var fecha = fechaDate(valor);
    return fecha ? fecha.getTime() : 0;
  }

  function copiarObjeto(objeto) {
    var copia = {};
    Object.keys(objeto || {}).forEach(function (key) { copia[key] = objeto[key]; });
    return copia;
  }

  function mostrar(selector) {
    var element = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!element) return;
    element.classList.remove('is-hidden');
    element.setAttribute('aria-hidden', 'false');
  }

  function ocultar(selector) {
    var element = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!element) return;
    element.classList.add('is-hidden');
    element.setAttribute('aria-hidden', 'true');
  }

  function limpiar(valor) {
    return String(valor === undefined || valor === null ? '' : valor).replace(/\s+/g, ' ').trim();
  }

  function soloNumeros(valor) {
    return String(valor || '').replace(/\D/g, '');
  }

  function escapar(valor) {
    return limpiar(valor)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function inyectarEstilos() {
    if (document.querySelector('#seguimientoTituloStyles')) return;

    var style = document.createElement('style');
    style.id = 'seguimientoTituloStyles';
    style.textContent = [
      '.seguimiento-titulo{max-width:1040px;margin:0 auto 28px;padding:28px}',
      '.seguimiento-head{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;margin-bottom:22px}',
      '.seguimiento-head h2{margin:4px 0 8px;font-size:clamp(1.55rem,3vw,2.1rem)}',
      '.seguimiento-head p{margin:0;max-width:700px}',
      '.seguimiento-badge{display:inline-flex;align-items:center;justify-content:center;padding:9px 13px;border-radius:999px;font-weight:800;font-size:.82rem;white-space:nowrap;border:1px solid transparent}',
      '.seguimiento-badge.is-success,.seguimiento-step__number.is-success{background:#e7f7ef;color:#087443;border-color:#b8e8cf}',
      '.seguimiento-badge.is-danger,.seguimiento-step__number.is-danger{background:#fff0f0;color:#a52323;border-color:#f1c4c4}',
      '.seguimiento-badge.is-warning,.seguimiento-step__number.is-warning{background:#fff7df;color:#8a5b00;border-color:#f1dda1}',
      '.seguimiento-badge.is-pending,.seguimiento-step__number.is-pending{background:#edf4ff;color:#174f97;border-color:#c8daf4}',
      '.seguimiento-badge.is-muted,.seguimiento-step__number.is-muted{background:#f2f4f7;color:#697386;border-color:#dde2e8}',
      '.seguimiento-status-hero{display:grid;grid-template-columns:auto 1fr;gap:13px;align-items:center;margin:0 0 14px;padding:16px 18px;border-radius:16px;border:1px solid #b8d4ef;background:linear-gradient(135deg,#edf6ff,#f8fbff);box-shadow:0 8px 22px rgba(18,81,145,.08)}',
      '.seguimiento-status-hero__icon{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;background:#0b5da7;color:#fff;font-size:1.2rem;font-weight:950;box-shadow:0 7px 17px rgba(11,93,167,.18)}',
      '.seguimiento-status-hero__body span{display:block;color:#5f7590;font-size:.67rem;font-weight:900;letter-spacing:.09em;text-transform:uppercase;margin-bottom:2px}',
      '.seguimiento-status-hero__body strong{display:block;color:#0b4f8d;font-size:clamp(1.18rem,2vw,1.55rem);line-height:1.15}',
      '.seguimiento-status-hero__body p{margin:4px 0 0;color:#526a84;font-size:.82rem;line-height:1.4}',
      '.seguimiento-status-hero.is-success{border-color:#a9d9c2;background:linear-gradient(135deg,#edf9f3,#fbfffd)}',
      '.seguimiento-status-hero.is-success .seguimiento-status-hero__icon{background:#087a4b}',
      '.seguimiento-status-hero.is-success .seguimiento-status-hero__body strong{color:#087044}',
      '.seguimiento-status-hero.is-danger{border-color:#efc2c2;background:linear-gradient(135deg,#fff2f2,#fffafa)}',
      '.seguimiento-status-hero.is-danger .seguimiento-status-hero__icon{background:#a52323}',
      '.seguimiento-status-hero.is-danger .seguimiento-status-hero__body strong{color:#922020}',
      '.seguimiento-student-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:22px}',
      '.seguimiento-dato{padding:13px 14px;border:1px solid #dfe6ef;border-radius:13px;background:#fbfcfe;min-width:0}',
      '.seguimiento-dato span,.seguimiento-label{display:block;font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:#607089;margin-bottom:5px}',
      '.seguimiento-dato strong{display:block;font-size:.92rem;overflow-wrap:anywhere}',
      '.seguimiento-progress{display:grid;grid-template-columns:1fr 28px 1fr 28px 1fr;align-items:center;margin:4px 0 24px;padding:17px;border:1px solid #dfe6ef;border-radius:16px;background:#fff}',
      '.seguimiento-progress__line{height:2px;background:#dbe3ec}',
      '.seguimiento-step{display:flex;gap:10px;align-items:center;min-width:0}',
      '.seguimiento-step__number{width:35px;height:35px;flex:0 0 35px;border-radius:50%;display:grid;place-items:center;font-weight:900;border:1px solid transparent}',
      '.seguimiento-step span{display:block;font-size:.71rem;color:#6b788b;text-transform:uppercase;font-weight:800;letter-spacing:.04em}',
      '.seguimiento-step strong{display:block;font-size:.91rem;margin:2px 0}',
      '.seguimiento-step small{display:block;color:#78869a;font-size:.75rem;overflow-wrap:anywhere}',
      '.seguimiento-section{padding:18px;border:1px solid #dfe6ef;border-radius:16px;background:#fff;margin-top:12px}',
      '.seguimiento-section--selected{border-color:#bcd5f4;background:#f7fbff}',
      '.seguimiento-section--final{border-color:#b6e5ca;background:#f4fcf7}',
      '.seguimiento-section__head{display:flex;justify-content:space-between;gap:14px;align-items:flex-end;margin-bottom:12px}',
      '.seguimiento-section__head span{display:block;font-size:.7rem;text-transform:uppercase;letter-spacing:.06em;font-weight:800;color:#6c7b90}',
      '.seguimiento-section__head h3{margin:2px 0 0;font-size:1.08rem}',
      '.seguimiento-section__head small{color:#728096}',
      '.seguimiento-propuesta{padding:13px 0;border-top:1px solid #edf0f4}',
      '.seguimiento-propuesta:first-of-type{border-top:0;padding-top:2px}',
      '.seguimiento-propuesta p{margin:7px 0 0;line-height:1.48}',
      '.seguimiento-propuesta__meta{display:flex;justify-content:space-between;gap:10px;align-items:center}',
      '.seguimiento-mini-tag{display:inline-flex;padding:4px 7px;border-radius:999px;background:#eef3f8;color:#43536a;font-size:.68rem;font-weight:800;margin-left:5px}',
      '.seguimiento-title-text{font-size:1rem;line-height:1.55;font-weight:750;margin:4px 0 0}',
      '.seguimiento-note{padding:11px 13px;background:#f8fafc;border-radius:12px;margin-top:8px}',
      '.seguimiento-note p{margin:5px 0 0;line-height:1.45}',
      '.seguimiento-history{position:relative}',
      '.seguimiento-history__item{display:grid;grid-template-columns:14px 1fr;gap:11px;padding:10px 0}',
      '.seguimiento-history__dot{width:10px;height:10px;border-radius:50%;background:#7890ad;margin-top:7px;box-shadow:0 0 0 4px #eef3f8}',
      '.seguimiento-history__body{min-width:0;padding-bottom:10px;border-bottom:1px solid #edf0f4}',
      '.seguimiento-history__top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}',
      '.seguimiento-history__top time{font-size:.72rem;color:#78869a;white-space:nowrap}',
      '.seguimiento-history__title{font-weight:700;margin:7px 0 0;line-height:1.45}',
      '.seguimiento-history__obs{margin:6px 0 0;color:#58677d;line-height:1.45}',
      '.seguimiento-empty{padding:14px;border-radius:12px;background:#f7f9fb;color:#68778b;text-align:center}',
      '.seguimiento-actions{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap;margin-top:18px}',
      '@media(max-width:780px){.seguimiento-titulo{padding:18px}.seguimiento-head{display:block}.seguimiento-badge{margin-top:12px}.seguimiento-student-grid{grid-template-columns:1fr 1fr}.seguimiento-progress{grid-template-columns:1fr;gap:10px}.seguimiento-progress__line{width:2px;height:18px;margin-left:17px}.seguimiento-section__head,.seguimiento-history__top,.seguimiento-propuesta__meta{align-items:flex-start;flex-direction:column}.seguimiento-history__top time{white-space:normal}}',
      '@media(max-width:480px){.seguimiento-status-hero{grid-template-columns:1fr;text-align:center;padding:14px}.seguimiento-status-hero__icon{margin:0 auto}.seguimiento-student-grid{grid-template-columns:1fr}.seguimiento-actions .btn{width:100%}}'
    ].join('');

    document.head.appendChild(style);
  }

  window.TAEstudianteSeguimiento = Object.freeze({
    mostrar: mostrarSeguimiento,
    cargar: cargarSeguimiento,
    calcularEstados: calcularEstados,
    ultimo: function () { return ultimoResultado; }
  });
})();