/* Gestión simple de investigadores y PIN desde Administrador. */
(function () {
  'use strict';

  var ui = window.TAAdminUI;
  var firebaseService = window.TAAdminFirebaseService;
  var config = window.TA_ADMINISTRADORES_CONFIG;
  var seguro = window.TAAdministradorSeguro;
  function modoSeguro(){return Boolean(seguro && seguro.activo && seguro.activo());}

  var investigadores = [];
  var investigadorPinActual = null;
  var pinesSesion = {};

  function iniciar() {
    if(modoSeguro()){
      var pin=document.getElementById('investigadorPinCrear');
      if(pin){pin.required=false;pin.disabled=true;}
    }
    var actualizar = ui.qs('#btnActualizarInvestigadores');
    var abrirCrear = ui.qs('#btnAbrirCrearInvestigador');
    var formCrear = ui.qs('#formCrearInvestigador');
    var formPin = ui.qs('#formCambiarPinInvestigador');

    if (actualizar) actualizar.addEventListener('click', cargar);
    if (abrirCrear) abrirCrear.addEventListener('click', abrirModalCrearInvestigador);
    if (formCrear) formCrear.addEventListener('submit', crearInvestigador);
    if (formPin) formPin.addEventListener('submit', guardarPinIndividual);

    conectarCierreModal(
      '#modalCrearInvestigador',
      ['#btnCerrarCrearInvestigador', '#btnCancelarCrearInvestigador', '#backdropCrearInvestigador'],
      cerrarModalCrearInvestigador
    );

    conectarCierreModal(
      '#modalPinInvestigador',
      ['#btnCerrarPinInvestigador', '#btnCancelarPinInvestigador', '#backdropPinInvestigador'],
      cerrarModalPin
    );

    var generarCrear = ui.qs('#btnGenerarPinCrear');
    var generarCambio = ui.qs('#btnGenerarPinCambio');
    var copiarCrear = ui.qs('#btnCopiarPinCreado');
    var copiarCambio = ui.qs('#btnCopiarPinCambiado');
    var comprobarPin = ui.qs('#btnComprobarPinInvestigador');
    if(comprobarPin)comprobarPin.addEventListener('click',verificarPinIngresado);

    if (generarCrear) generarCrear.addEventListener('click', function () {
      ui.setValue('#investigadorPinCrear', generarPin4());
    });

    if (generarCambio) generarCambio.addEventListener('click', function () {
      ui.setValue('#investigadorNuevoPin', generarPin4());
    });

    if (copiarCrear) copiarCrear.addEventListener('click', function () {
      copiarTexto(ui.qs('#crearInvestigadorPinVisible') ? ui.qs('#crearInvestigadorPinVisible').textContent : '', '#crearInvestigadorMensaje');
    });

    if (copiarCambio) copiarCambio.addEventListener('click', function () {
      copiarTexto(ui.qs('#cambiarPinVisible') ? ui.qs('#cambiarPinVisible').textContent : '', '#modalPinInvestigadorMensaje');
    });
  }

  function conectarCierreModal(selectorModal, selectores, handler) {
    selectores.forEach(function (selector) {
      var node = ui.qs(selector);
      if (node) node.addEventListener('click', handler);
    });

    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return;
      var modal = ui.qs(selectorModal);
      if (modal && !modal.classList.contains('is-hidden')) handler();
    });
  }

  function cargar() {
    ui.showStatus('#investigadoresMensaje', 'Cargando investigadores...', 'info');

    var consulta = modoSeguro() ? seguro.investigadores() :
      firebaseService.listarDocumentos(config.collections.investigadores, { limit: 1000 });
    return consulta.then(function (docs) {
        investigadores = (docs || []).map(normalizarInvestigador).sort(function (a, b) {
          return a.nombre.localeCompare(b.nombre);
        });

        renderResumen();
        renderTabla();
        ui.showStatus('#investigadoresMensaje', '', '');
        return investigadores;
      })
      .catch(function (error) {
        ui.showStatus('#investigadoresMensaje', mensaje(error, 'No se pudieron cargar los investigadores.'), 'error');
        throw error;
      });
  }

  function abrirModalCrearInvestigador() {
    limpiarFormularioCrear();

    var modal = ui.qs('#modalCrearInvestigador');
    if (modal) {
      modal.classList.remove('is-hidden');
      modal.setAttribute('aria-hidden', 'false');
    }

    var input = ui.qs('#investigadorCedulaInput');
    if (input) window.setTimeout(function () { input.focus(); }, 40);
  }

  function cerrarModalCrearInvestigador() {
    var modal = ui.qs('#modalCrearInvestigador');
    if (modal) {
      modal.classList.add('is-hidden');
      modal.setAttribute('aria-hidden', 'true');
    }
    limpiarFormularioCrear();
  }

  function limpiarFormularioCrear() {
    ui.setValue('#investigadorCedulaInput', '');
    ui.setValue('#investigadorNombreInput', '');
    ui.setValue('#investigadorEmailInput', '');
    ui.setValue('#investigadorPinCrear', '');
    ui.setText('#crearInvestigadorPinVisible', '—');
    ui.showStatus('#crearInvestigadorMensaje', '', '');

    var recibo = ui.qs('#crearInvestigadorRecibo');
    if (recibo) recibo.classList.add('is-hidden');

    var button = ui.qs('#btnCrearInvestigador');
    if (button) {
      button.disabled = false;
      button.textContent = 'Guardar investigador';
    }
  }

  function crearInvestigador(event) {
    event.preventDefault();

    var cedula = soloNumeros(ui.value('#investigadorCedulaInput'));
    var nombre = limpiar(ui.value('#investigadorNombreInput'));
    var email = limpiar(ui.value('#investigadorEmailInput')).toLowerCase();
    var pin = soloNumeros(ui.value('#investigadorPinCrear'));
    var button = ui.qs('#btnCrearInvestigador');

    if (cedula.length !== 10) {
      ui.showStatus('#crearInvestigadorMensaje', 'La cédula debe tener 10 dígitos.', 'error');
      return;
    }

    if (!nombre) {
      ui.showStatus('#crearInvestigadorMensaje', 'Ingresa los nombres y apellidos.', 'error');
      return;
    }

    if (!/^\d{4}$/.test(pin)) {
      ui.showStatus('#crearInvestigadorMensaje', 'El PIN debe tener exactamente 4 dígitos.', 'error');
      return;
    }

    ui.setLoading(button, true, 'Guardando...');
    ui.showStatus('#crearInvestigadorMensaje', 'Guardando y verificando el acceso...', 'info');

    resolverDocumentoInvestigador(cedula)
      .then(function (resultado) {
        if (resultado.existente) throw new Error('Ya existe un investigador con esa cédula.');
        return hashPin(cedula, pin);
      })
      .then(function (hash) {
        var ahora = new Date().toISOString();

        return firebaseService.guardarDocumento(config.collections.investigadores, cedula, {
          cedula: cedula,
          nombres: nombre,
          email: email,
          rol: 'investigador',
          activo: true,
          pinHash: hash,
          pinCreado: true,
          pinActivo: true,
          pinCreadoEn: ahora,
          pinActivadoEn: ahora,
          pinActivadoPor: 'administrador_alta',
          pinDesactivadoEn: null,
          origen: 'administrador'
        }, { merge: false })
          .then(function () {
            return verificarPinGuardado(cedula, hash);
          })
          .then(function () {
            return firebaseService.guardarDocumento(config.collections.investigadores, cedula, {
              pinVerificadoEn: new Date().toISOString(),
              pinVerificadoPor: 'administrador_alta'
            }, { merge: true });
          });
      })
      .then(function () {
        pinesSesion[cedula] = pin;
        ui.setText('#crearInvestigadorPinVisible', pin);

        var recibo = ui.qs('#crearInvestigadorRecibo');
        if (recibo) recibo.classList.remove('is-hidden');

        ui.showStatus(
          '#crearInvestigadorMensaje',
          'Investigador creado. El acceso ya está activo.',
          'success'
        );

        if (button) {
          button.disabled = true;
          button.textContent = 'Investigador guardado';
        }

        return cargar();
      })
      .catch(function (error) {
        ui.showStatus('#crearInvestigadorMensaje', mensaje(error, 'No se pudo crear el investigador.'), 'error');
      })
      .finally(function () {
        if (button && !button.disabled) ui.setLoading(button, false);
      });
  }

  function abrirModalPin(investigador) {
    investigadorPinActual = investigador;

    ui.setText('#modalPinInvestigadorTitulo', investigador.pinCreado ? 'Cambiar PIN' : 'Asignar PIN');
    ui.setText('#modalPinInvestigadorSubtitulo', investigador.nombre + ' · ' + investigador.cedula);
    ui.setValue('#investigadorNuevoPin', '');
    ui.setText('#cambiarPinVisible', '—');
    ui.showStatus('#modalPinInvestigadorMensaje', '', '');

    var recibo = ui.qs('#cambiarPinRecibo');
    if (recibo) recibo.classList.add('is-hidden');

    var button = ui.qs('#btnGuardarPinInvestigador');
    if (button) {
      button.disabled = false;
      button.textContent = investigador.pinCreado ? 'Guardar nuevo PIN' : 'Guardar PIN';
    }

    var modal = ui.qs('#modalPinInvestigador');
    if (modal) {
      modal.classList.remove('is-hidden');
      modal.setAttribute('aria-hidden', 'false');
    }

    var input = ui.qs('#investigadorNuevoPin');
    if (input) window.setTimeout(function () { input.focus(); }, 40);
  }

  function cerrarModalPin() {
    investigadorPinActual = null;

    var modal = ui.qs('#modalPinInvestigador');
    if (modal) {
      modal.classList.add('is-hidden');
      modal.setAttribute('aria-hidden', 'true');
    }

    ui.setValue('#investigadorNuevoPin', '');
    ui.setText('#cambiarPinVisible', '—');
    ui.showStatus('#modalPinInvestigadorMensaje', '', '');

    var recibo = ui.qs('#cambiarPinRecibo');
    if (recibo) recibo.classList.add('is-hidden');
  }

  // Comprueba el PIN indicado contra la versión almacenada SIN modificar el registro
  // ni enviar PIN, hash o cédula a logs externos. No sustituye a Auth seguro.
  function verificarPinIngresado() {
    if(modoSeguro())return;
    var actual = investigadorPinActual;
    var pin = ui.value('#investigadorNuevoPin');
    var button = ui.qs('#btnComprobarPinInvestigador');
    if(!actual || !/^\d{4}$/.test(pin)){
      ui.showStatus('#modalPinInvestigadorMensaje','Selecciona al investigador e ingresa un PIN de 4 dígitos.','warning');
      return;
    }
    ui.setLoading(button,true,'Comprobando...');
    ui.showStatus('#modalPinInvestigadorMensaje','Comprobando el PIN guardado sin modificarlo...','info');
    return Promise.all([
      hashPin(actual.cedula,pin),
      firebaseService.leerDocumento(config.collections.investigadores,actual.id)
    ]).then(function(resultados){
      var esperado=resultados[0],doc=resultados[1];
      if(!doc)throw new Error('El documento de este investigador no existe en Firebase.');
      var cedulaGuardada=soloNumeros(doc.cedula||doc.identificacion||doc.numeroIdentificacion||doc.id);
      if(cedulaGuardada!==actual.cedula){
        throw new Error('La cédula guardada no corresponde a este investigador. No se cambiará su PIN.');
      }
      if(!doc.pinHash){
        ui.showStatus('#modalPinInvestigadorMensaje','No hay PIN registrado para esta cédula. Usa Guardar y verificar para asignarlo.','warning');
        return false;
      }
      if(String(doc.pinHash).toLowerCase()!==esperado){
        ui.showStatus('#modalPinInvestigadorMensaje',
          'El PIN ingresado NO coincide con el guardado en Firebase. Usa Guardar y verificar para restablecerlo.', 'warning');
        return false;
      }
      if(doc.activo===false||doc.pinActivo!==true){
        ui.showStatus('#modalPinInvestigadorMensaje','El PIN coincide, pero el acceso está desactivado. Actívalo desde Administración.','warning');
        return true;
      }
      ui.showStatus('#modalPinInvestigadorMensaje','PIN correcto: coincide con el hash de Firebase y el acceso está activo.','success');
      return true;
    }).catch(function(error){
      ui.showStatus('#modalPinInvestigadorMensaje',mensaje(error,'No se pudo verificar el PIN.'),'warning');
      return false;
    }).finally(function(){ui.setLoading(button,false);});
  }

  function guardarPinIndividual(event) {
    event.preventDefault();
    if(modoSeguro()){
      ui.showStatus('#modalPinInvestigadorMensaje',
        'El modo seguro utiliza Firebase Authentication. No se permite actualizar PINs heredados.', 'warning');
      return;
    }

    if (!investigadorPinActual) {
      ui.showStatus('#modalPinInvestigadorMensaje', 'Selecciona nuevamente al investigador.', 'error');
      return;
    }

    var pin = soloNumeros(ui.value('#investigadorNuevoPin'));
    var button = ui.qs('#btnGuardarPinInvestigador');
    var investigador = investigadorPinActual;

    if (!/^\d{4}$/.test(pin)) {
      ui.showStatus('#modalPinInvestigadorMensaje', 'El PIN debe tener exactamente 4 dígitos.', 'error');
      return;
    }

    ui.setLoading(button, true, 'Guardando...');
    ui.showStatus('#modalPinInvestigadorMensaje', 'Guardando y verificando el PIN...', 'info');

    // Verificar que el documento a modificar pertenece a la cédula mostrada.
    firebaseService.leerDocumento(config.collections.investigadores, investigador.id)
      .then(function(doc){
        if(!doc)throw new Error('No existe este investigador. Actualiza la lista antes de asignar un PIN.');
        var cedulaGuardada=soloNumeros(doc.cedula||doc.identificacion||doc.numeroIdentificacion||doc.id);
        if(cedulaGuardada!==investigador.cedula)
          throw new Error('La cédula y el registro de Firebase no coinciden. No se modificó el PIN.');
        return hashPin(investigador.cedula,pin);
      })
      .then(function (hash) {
        var ahora = new Date().toISOString();

        return firebaseService.guardarDocumento(config.collections.investigadores, investigador.id, {
          cedula: investigador.cedula,
          nombres: investigador.nombre,
          activo: true,
          pinHash: hash,
          pinCreado: true,
          pinActivo: true,
          pinCreadoEn: investigador.raw && investigador.raw.pinCreadoEn || ahora,
          pinActivadoEn: ahora,
          pinActivadoPor: 'administrador_pin',
          pinDesactivadoEn: null
        }, { merge: true })
          .then(function () {
            return verificarPinGuardado(investigador.id, hash);
          })
          .then(function () {
            return firebaseService.guardarDocumento(config.collections.investigadores, investigador.id, {
              pinVerificadoEn: new Date().toISOString(),
              pinVerificadoPor: 'administrador_pin'
            }, { merge: true });
          });
      })
      .then(function () {
        pinesSesion[investigador.cedula] = pin;
        ui.setText('#cambiarPinVisible', pin);

        var recibo = ui.qs('#cambiarPinRecibo');
        if (recibo) recibo.classList.remove('is-hidden');

        ui.showStatus(
          '#modalPinInvestigadorMensaje',
          'PIN guardado. El acceso está activo.',
          'success'
        );

        if (button) {
          button.disabled = true;
          button.textContent = 'PIN guardado';
        }

        return cargar();
      })
      .catch(function (error) {
        ui.showStatus('#modalPinInvestigadorMensaje', mensaje(error, 'No se pudo guardar el PIN.'), 'error');
      })
      .finally(function () {
        if (button && !button.disabled) ui.setLoading(button, false);
      });
  }

  function cambiarAcceso(investigador, activar, button) {
    if (activar && !investigador.pinCreado) {
      abrirModalPin(investigador);
      return;
    }

    ui.setLoading(button, true, activar ? 'Activando...' : 'Desactivando...');

    firebaseService.guardarDocumento(config.collections.investigadores, investigador.id, {
      activo: Boolean(activar),
      pinActivo: Boolean(activar && investigador.pinCreado),
      pinActivadoEn: activar ? new Date().toISOString() : investigador.raw && investigador.raw.pinActivadoEn || null,
      pinActivadoPor: activar ? 'administrador' : investigador.raw && investigador.raw.pinActivadoPor || '',
      pinDesactivadoEn: activar ? null : new Date().toISOString()
    }, { merge: true })
      .then(function () {
        ui.showStatus(
          '#investigadoresMensaje',
          activar ? 'Acceso reactivado.' : 'Acceso desactivado.',
          'success'
        );
        return cargar();
      })
      .catch(function (error) {
        ui.showStatus('#investigadoresMensaje', mensaje(error, 'No se pudo actualizar el acceso.'), 'error');
      })
      .finally(function () {
        ui.setLoading(button, false);
      });
  }

  function renderResumen() {
    ui.setText('#investigadoresTotal', investigadores.length);
    ui.setText('#investigadoresActivos', investigadores.filter(function (item) {
      return item.activo && item.pinCreado && item.pinActivo;
    }).length);
    ui.setText('#investigadoresSinPin', investigadores.filter(function (item) {
      return !item.pinCreado;
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
      var pinButton = document.createElement('button');
      var accesoButton = document.createElement('button');
      var pinSesion = pinesSesion[investigador.cedula] || '';

      tr.innerHTML =
        '<td><strong>' + ui.escapeHtml(investigador.cedula) + '</strong></td>' +
        '<td>' + ui.escapeHtml(investigador.nombre) + '</td>' +
        '<td>' + ui.escapeHtml(investigador.email || '—') + '</td>' +
        '<td></td><td></td><td class="text-right"></td>';

      if (pinSesion) {
        var pinVisible = document.createElement('button');
        pinVisible.type = 'button';
        pinVisible.className = 'pin-visible-chip';
        pinVisible.textContent = pinSesion;
        pinVisible.title = 'Copiar PIN';
        pinVisible.addEventListener('click', function () {
          copiarTexto(pinSesion, '#investigadoresMensaje');
        });
        tr.children[3].appendChild(pinVisible);
      } else {
        tr.children[3].appendChild(ui.crearBadge(
          investigador.pinCreado ? '••••' : 'Sin PIN',
          investigador.pinCreado ? 'primary' : 'muted'
        ));
      }

      tr.children[4].appendChild(ui.crearBadge(
        investigador.activo && investigador.pinCreado && investigador.pinActivo ? 'Activo' : 'Sin acceso',
        investigador.activo && investigador.pinCreado && investigador.pinActivo ? 'success' : 'muted'
      ));

      acciones.className = 'table-actions';

      pinButton.type = 'button';
      pinButton.className = 'btn btn--small btn--secondary';
      pinButton.textContent = investigador.pinCreado ? 'Cambiar PIN' : 'Asignar PIN';
      pinButton.addEventListener('click', function () {
        abrirModalPin(investigador);
      });
      acciones.appendChild(pinButton);

      if (investigador.pinCreado) {
        accesoButton.type = 'button';
        accesoButton.className = 'btn btn--small ' +
          (investigador.activo && investigador.pinActivo ? 'btn--ghost' : 'btn--primary');
        accesoButton.textContent = investigador.activo && investigador.pinActivo ? 'Desactivar' : 'Reactivar';
        accesoButton.addEventListener('click', function () {
          cambiarAcceso(investigador, !(investigador.activo && investigador.pinActivo), accesoButton);
        });
        acciones.appendChild(accesoButton);
      }

      tr.children[5].appendChild(acciones);
      body.appendChild(tr);
    });
  }

  function resolverDocumentoInvestigador(cedula) {
    return firebaseService.leerDocumento(config.collections.investigadores, cedula)
      .then(function (existente) {
        if (existente) return { docId: cedula, existente: existente };

        return firebaseService.listarDocumentos(config.collections.investigadores, { limit: 1000 })
          .then(function (docs) {
            var encontrado = (docs || []).filter(function (item) {
              return soloNumeros(
                item.cedula ||
                item.identificacion ||
                item.numeroIdentificacion ||
                item.id ||
                item._docId
              ) === cedula;
            })[0] || null;

            return {
              docId: encontrado ? (encontrado.id || encontrado._docId || cedula) : cedula,
              existente: encontrado
            };
          });
      });
  }

  function verificarPinGuardado(docId, hashEsperado) {
    return firebaseService.leerDocumento(config.collections.investigadores, docId)
      .then(function (doc) {
        if (!doc) throw new Error('Firebase no devolvió el registro después de guardarlo.');

        if (String(doc.pinHash || '') !== String(hashEsperado || '')) {
          throw new Error('El PIN guardado no coincide con el PIN solicitado.');
        }

        if (doc.pinActivo !== true || doc.activo === false) {
          throw new Error('El PIN fue guardado, pero el acceso no quedó activo.');
        }

        return doc;
      });
  }

  function hashPin(cedula, pin) {
    if (!window.crypto || !window.crypto.subtle || !window.TextEncoder) {
      return Promise.reject(new Error('Este navegador no permite proteger el PIN. Abre el administrador mediante HTTPS.'));
    }

    var texto = new TextEncoder().encode('titulos-investigador-v1|' + cedula + '|' + pin);

    return window.crypto.subtle.digest('SHA-256', texto)
      .then(function (buffer) {
        return Array.prototype.map.call(new Uint8Array(buffer), function (byte) {
          return byte.toString(16).padStart(2, '0');
        }).join('');
      });
  }

  function generarPin4() {
    var numero;

    if (window.crypto && window.crypto.getRandomValues) {
      var valores = new Uint32Array(1);
      window.crypto.getRandomValues(valores);
      numero = 1000 + (valores[0] % 9000);
    } else {
      numero = Math.floor(1000 + Math.random() * 9000);
    }

    return String(numero);
  }

  function copiarTexto(texto, selectorMensaje) {
    var valor = limpiar(texto);
    if (!valor || valor === '—') return;

    var ok = function () {
      ui.showStatus(selectorMensaje, 'PIN copiado.', 'success');
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(valor).then(ok).catch(function () {
        copiarTextoFallback(valor);
        ok();
      });
      return;
    }

    copiarTextoFallback(valor);
    ok();
  }

  function copiarTextoFallback(texto) {
    var area = document.createElement('textarea');
    area.value = texto;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    try { document.execCommand('copy'); } catch (error) {}
    document.body.removeChild(area);
  }

  function normalizarInvestigador(data) {
    return {
      id: data.id || data._docId || soloNumeros(data.cedula || data.identificacion),
      cedula: soloNumeros(data.cedula || data.identificacion || data.numeroIdentificacion || data.id),
      nombre: limpiar(data.nombres || data.nombre || data.nombreCompleto || 'Sin nombre'),
      email: limpiar(data.email || data.correo || '').toLowerCase(),
      pinCreado: Boolean(data.pinCreado || data.pinHash),
      pinActivo: Boolean(data.pinActivo),
      pinVerificado: Boolean(data.pinVerificadoEn),
      activo: data.activo !== false,
      raw: data
    };
  }

  function soloNumeros(value) {
    return String(value || '').replace(/\D/g, '');
  }

  function limpiar(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function mensaje(error, fallback) {
    return error && error.message ? error.message : fallback;
  }

  window.TAAdminInvestigadores = Object.freeze({
    iniciar: iniciar,
    cargar: cargar
  });
})();
