/* Gestión de investigadores y activación de PIN desde Administrador. */
(function () {
  'use strict';

  var ui = window.TAAdminUI;
  var firebaseService = window.TAAdminFirebaseService;
  var config = window.TA_ADMINISTRADORES_CONFIG;
  var investigadores = [];

  function iniciar() {
    var actualizar = ui.qs('#btnActualizarInvestigadores');
    var form = ui.qs('#formCrearInvestigador');
    var aplicarPines = ui.qs('#btnAplicarPinesInvestigadores');
    var limpiarPines = ui.qs('#btnLimpiarPinesInvestigadores');

    if (actualizar) actualizar.addEventListener('click', cargar);
    if (form) form.addEventListener('submit', crearInvestigador);
    if (aplicarPines) aplicarPines.addEventListener('click', aplicarPinesMasivos);
    if (limpiarPines) limpiarPines.addEventListener('click', function () {
      ui.setValue('#investigadoresBulkInput', '');
      ui.showStatus('#investigadoresBulkMensaje', '', '');
    });
  }

  function cargar() {
    ui.showStatus('#investigadoresMensaje', 'Cargando investigadores...', 'info');

    return firebaseService.listarDocumentos(config.collections.investigadores, { limit: 1000 })
      .then(function (docs) {
        investigadores = (docs || []).map(normalizarInvestigador).sort(function (a, b) {
          return a.nombre.localeCompare(b.nombre);
        });
        renderResumen();
        renderTabla();
        ui.showStatus('#investigadoresMensaje', 'Investigadores actualizados.', 'success');
        return investigadores;
      })
      .catch(function (error) {
        ui.showStatus('#investigadoresMensaje', mensaje(error, 'No se pudieron cargar los investigadores.'), 'error');
        throw error;
      });
  }

  function crearInvestigador(event) {
    event.preventDefault();

    var cedula = soloNumeros(ui.value('#investigadorCedulaInput'));
    var nombre = limpiar(ui.value('#investigadorNombreInput'));
    var email = limpiar(ui.value('#investigadorEmailInput')).toLowerCase();
    var button = ui.qs('#btnCrearInvestigador');

    if (cedula.length !== 10) {
      ui.showStatus('#investigadoresMensaje', 'La cédula debe tener 10 dígitos.', 'error');
      return;
    }
    if (!nombre) {
      ui.showStatus('#investigadoresMensaje', 'Ingresa el nombre del investigador.', 'error');
      return;
    }

    ui.setLoading(button, true, 'Guardando...');

    firebaseService.leerDocumento(config.collections.investigadores, cedula)
      .then(function (existente) {
        if (existente) throw new Error('Ya existe un investigador con esa cédula.');

        return firebaseService.guardarDocumento(config.collections.investigadores, cedula, {
          cedula: cedula,
          nombres: nombre,
          email: email,
          rol: 'investigador',
          activo: true,
          pinCreado: false,
          pinActivo: false,
          origen: 'administrador'
        }, { merge: false });
      })
      .then(function () {
        ui.setValue('#investigadorCedulaInput', '');
        ui.setValue('#investigadorNombreInput', '');
        ui.setValue('#investigadorEmailInput', '');
        ui.showStatus('#investigadoresMensaje', 'Investigador registrado. Ahora puede crear su PIN en el primer ingreso.', 'success');
        return cargar();
      })
      .catch(function (error) {
        ui.showStatus('#investigadoresMensaje', mensaje(error, 'No se pudo registrar el investigador.'), 'error');
      })
      .finally(function () {
        ui.setLoading(button, false);
      });
  }

  function aplicarPinesMasivos() {
    var button = ui.qs('#btnAplicarPinesInvestigadores');
    var texto = ui.value('#investigadoresBulkInput');
    var filas;

    try {
      filas = parsearCargaMasiva(texto);
    } catch (error) {
      ui.showStatus('#investigadoresBulkMensaje', mensaje(error, 'No se pudo interpretar la lista.'), 'error');
      return;
    }

    if (!filas.length) {
      ui.showStatus('#investigadoresBulkMensaje', 'Pega al menos un investigador con cédula y PIN.', 'error');
      return;
    }

    ui.setLoading(button, true, 'Aplicando...');
    ui.showStatus('#investigadoresBulkMensaje', 'Protegiendo y activando ' + filas.length + ' accesos...', 'info');

    var resultados = [];
    var cadena = Promise.resolve();

    filas.forEach(function (fila) {
      cadena = cadena.then(function () {
        return prepararAccesoInvestigador(fila)
          .then(function () {
            resultados.push({ cedula: fila.cedula, ok: true });
          })
          .catch(function (error) {
            resultados.push({
              cedula: fila.cedula,
              ok: false,
              error: error && error.message ? error.message : 'Error desconocido'
            });
          });
      });
    });

    cadena
      .then(function () {
        var correctos = resultados.filter(function (item) { return item.ok; }).length;
        var fallidos = resultados.filter(function (item) { return !item.ok; });

        if (!fallidos.length) {
          ui.setValue('#investigadoresBulkInput', '');
          ui.showStatus(
            '#investigadoresBulkMensaje',
            correctos + ' investigadores quedaron con PIN creado y acceso activo.',
            'success'
          );
          return cargar();
        }

        ui.showStatus(
          '#investigadoresBulkMensaje',
          correctos + ' accesos aplicados. ' + fallidos.length + ' con error: ' +
          fallidos.map(function (item) { return item.cedula + ' (' + item.error + ')'; }).join(', '),
          correctos ? 'warning' : 'error'
        );

        return cargar();
      })
      .finally(function () {
        ui.setLoading(button, false);
      });
  }

  function parsearCargaMasiva(texto) {
    var lineas = String(texto || '')
      .split(/\r?\n/)
      .map(function (linea) { return linea.trim(); })
      .filter(Boolean);

    return lineas.map(function (linea, index) {
      var partes;

      if (linea.indexOf('|') !== -1) partes = linea.split('|');
      else if (linea.indexOf('\t') !== -1) partes = linea.split('\t');
      else if (linea.indexOf(';') !== -1) partes = linea.split(';');
      else partes = linea.split(',');

      partes = partes.map(limpiar);

      var nombres = '';
      var apellidos = '';
      var cedula = '';
      var pin = '';

      if (partes.length >= 4) {
        nombres = partes[0];
        apellidos = partes[1];
        cedula = soloNumeros(partes[2]);
        pin = soloNumeros(partes[3]);
      } else if (partes.length === 3) {
        nombres = partes[0];
        cedula = soloNumeros(partes[1]);
        pin = soloNumeros(partes[2]);
      } else {
        throw new Error('Fila ' + (index + 1) + ': usa Nombres | Apellidos | Cédula | PIN.');
      }

      if (cedula.length !== 10) {
        throw new Error('Fila ' + (index + 1) + ': la cédula debe tener 10 dígitos.');
      }

      if (!/^\d{4,8}$/.test(pin)) {
        throw new Error('Fila ' + (index + 1) + ': el PIN debe tener entre 4 y 8 dígitos.');
      }

      return {
        nombres: limpiar((nombres + ' ' + apellidos).trim()),
        cedula: cedula,
        pin: pin
      };
    });
  }

  function prepararAccesoInvestigador(fila) {
    var ahora = new Date().toISOString();

    return hashPin(fila.cedula, fila.pin)
      .then(function (hash) {
        return firebaseService.leerDocumento(config.collections.investigadores, fila.cedula)
          .then(function (existente) {
            var docId = fila.cedula;

            if (existente) {
              return { docId: docId, existente: existente, hash: hash };
            }

            return firebaseService.listarDocumentos(config.collections.investigadores, { limit: 1000 })
              .then(function (docs) {
                var encontrado = (docs || []).filter(function (item) {
                  return soloNumeros(item.cedula || item.identificacion || item.numeroIdentificacion || item.id || item._docId) === fila.cedula;
                })[0] || null;

                return {
                  docId: encontrado ? (encontrado.id || encontrado._docId || fila.cedula) : fila.cedula,
                  existente: encontrado,
                  hash: hash
                };
              });
          });
      })
      .then(function (resultado) {
        var existente = resultado.existente || {};

        return firebaseService.guardarDocumento(config.collections.investigadores, resultado.docId, {
          cedula: fila.cedula,
          nombres: fila.nombres || existente.nombres || existente.nombre || existente.nombreCompleto || '',
          rol: 'investigador',
          activo: true,
          pinHash: resultado.hash,
          pinCreado: true,
          pinActivo: true,
          pinCreadoEn: existente.pinCreadoEn || ahora,
          pinActivadoEn: ahora,
          pinActivadoPor: 'administrador_carga_masiva',
          pinDesactivadoEn: null
        }, { merge: true });
      });
  }

  function hashPin(cedula, pin) {
    if (!window.crypto || !window.crypto.subtle || !window.TextEncoder) {
      return Promise.reject(new Error('Este navegador no permite proteger los PIN. Abre el administrador mediante HTTPS.'));
    }

    var texto = new TextEncoder().encode('titulos-investigador-v1|' + cedula + '|' + pin);

    return window.crypto.subtle.digest('SHA-256', texto)
      .then(function (buffer) {
        return Array.prototype.map.call(new Uint8Array(buffer), function (byte) {
          return byte.toString(16).padStart(2, '0');
        }).join('');
      });
  }

  function cambiarAcceso(investigador, activar, button) {
    if (activar && !investigador.pinCreado) {
      ui.showStatus('#investigadoresMensaje', 'El investigador todavía no ha creado su PIN.', 'error');
      return;
    }

    ui.setLoading(button, true, activar ? 'Activando...' : 'Desactivando...');

    firebaseService.guardarDocumento(config.collections.investigadores, investigador.id, {
      pinActivo: Boolean(activar),
      pinActivadoEn: activar ? new Date().toISOString() : null,
      pinActivadoPor: activar ? 'administrador' : '',
      pinDesactivadoEn: activar ? null : new Date().toISOString()
    }, { merge: true })
      .then(function () {
        ui.showStatus('#investigadoresMensaje', activar ? 'PIN activado correctamente.' : 'Acceso del investigador desactivado.', 'success');
        return cargar();
      })
      .catch(function (error) {
        ui.showStatus('#investigadoresMensaje', mensaje(error, 'No se pudo actualizar el acceso.'), 'error');
      })
      .finally(function () {
        ui.setLoading(button, false);
      });
  }

  function restablecerPin(investigador, button) {
    ui.confirmar({
      titulo: 'Restablecer PIN',
      mensaje: 'Se eliminará el PIN de ' + investigador.nombre + '. En su siguiente ingreso tendrá que crear uno nuevo y volverá a requerir activación.',
      onConfirm: function () {
        ui.setLoading(button, true, 'Restableciendo...');
        firebaseService.guardarDocumento(config.collections.investigadores, investigador.id, {
          pinHash: '',
          pinCreado: false,
          pinActivo: false,
          pinCreadoEn: null,
          pinActivadoEn: null,
          pinActivadoPor: '',
          pinRestablecidoEn: new Date().toISOString()
        }, { merge: true })
          .then(cargar)
          .catch(function (error) {
            ui.showStatus('#investigadoresMensaje', mensaje(error, 'No se pudo restablecer el PIN.'), 'error');
          })
          .finally(function () {
            ui.setLoading(button, false);
          });
      }
    });
  }

  function renderResumen() {
    ui.setText('#investigadoresTotal', investigadores.length);
    ui.setText('#investigadoresPendientes', investigadores.filter(function (item) {
      return item.pinCreado && !item.pinActivo;
    }).length);
    ui.setText('#investigadoresActivos', investigadores.filter(function (item) {
      return item.pinCreado && item.pinActivo;
    }).length);
  }

  function renderTabla() {
    var body = ui.qs('#investigadoresTableBody');
    if (!body) return;

    body.innerHTML = '';
    if (!investigadores.length) {
      ui.limpiarTabla('#investigadoresTableBody', 6, 'No hay investigadores registrados.');
      return;
    }

    investigadores.forEach(function (investigador) {
      var tr = document.createElement('tr');
      var acciones = document.createElement('div');
      var acceso = document.createElement('button');
      var reset = document.createElement('button');

      tr.innerHTML =
        '<td><strong>' + ui.escapeHtml(investigador.cedula) + '</strong></td>' +
        '<td>' + ui.escapeHtml(investigador.nombre) + '</td>' +
        '<td>' + ui.escapeHtml(investigador.email || '—') + '</td>' +
        '<td></td><td></td><td class="text-right"></td>';

      tr.children[3].appendChild(ui.crearBadge(investigador.pinCreado ? 'Creado' : 'Sin crear', investigador.pinCreado ? 'primary' : 'muted'));
      tr.children[4].appendChild(ui.crearBadge(investigador.pinActivo ? 'Activo' : (investigador.pinCreado ? 'Pendiente' : 'Sin PIN'), investigador.pinActivo ? 'success' : (investigador.pinCreado ? 'warning' : 'muted')));

      acciones.className = 'table-actions';
      acceso.type = 'button';
      acceso.className = 'btn btn--small ' + (investigador.pinActivo ? 'btn--ghost' : 'btn--primary');
      acceso.textContent = investigador.pinActivo ? 'Desactivar' : 'Activar PIN';
      acceso.disabled = !investigador.pinCreado;
      acceso.addEventListener('click', function () {
        cambiarAcceso(investigador, !investigador.pinActivo, acceso);
      });
      acciones.appendChild(acceso);

      if (investigador.pinCreado) {
        reset.type = 'button';
        reset.className = 'btn btn--small btn--secondary';
        reset.textContent = 'Restablecer';
        reset.addEventListener('click', function () { restablecerPin(investigador, reset); });
        acciones.appendChild(reset);
      }

      tr.children[5].appendChild(acciones);
      body.appendChild(tr);
    });
  }

  function normalizarInvestigador(data) {
    return {
      id: data.id || data._docId || soloNumeros(data.cedula || data.identificacion),
      cedula: soloNumeros(data.cedula || data.identificacion || data.numeroIdentificacion || data.id),
      nombre: limpiar(data.nombres || data.nombre || data.nombreCompleto || 'Sin nombre'),
      email: limpiar(data.email || data.correo || '').toLowerCase(),
      pinCreado: Boolean(data.pinCreado || data.pinHash),
      pinActivo: Boolean(data.pinActivo),
      activo: data.activo !== false,
      raw: data
    };
  }

  function soloNumeros(value) { return String(value || '').replace(/\D/g, ''); }
  function limpiar(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
  function mensaje(error, fallback) { return error && error.message ? error.message : fallback; }

  window.TAAdminInvestigadores = Object.freeze({ iniciar: iniciar, cargar: cargar });
})();
