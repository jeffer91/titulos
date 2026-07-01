/* Pantalla administrativa para gestión de coordinadores. */
(function () {
  'use strict';

  var repository = window.TAAdminRepository;
  var firebaseService = window.TAAdminFirebaseService;

  var estado = {
    coordinadores: []
  };

  document.addEventListener('DOMContentLoaded', iniciar);

  function iniciar() {
    conectarEventos();
  }

  function conectarEventos() {
    var form = qs('#formCoordinador');
    var btnCargar = qs('#btnCargarCoordinadores');
    var btnLimpiar = qs('#btnLimpiarCoordinador');
    var lista = qs('#coordinadoresLista');

    if (form) form.addEventListener('submit', guardarCoordinador);
    if (btnCargar) btnCargar.addEventListener('click', cargarCoordinadores);
    if (btnLimpiar) btnLimpiar.addEventListener('click', limpiarFormulario);
    if (lista) lista.addEventListener('click', manejarAccionCoordinador);
  }

  function cargarCoordinadores() {
    if (!firebaseListo()) return;

    setLoading('#btnCargarCoordinadores', true, 'Cargando...');
    showStatus('#coordinadoresMensaje', 'Cargando coordinadores...', 'info');

    repository.listarCoordinadores()
      .then(function (coordinadores) {
        estado.coordinadores = coordinadores;
        renderCoordinadores(coordinadores);
        showStatus('#coordinadoresMensaje', 'Coordinadores cargados: ' + coordinadores.length + '.', 'success');
      })
      .catch(function (error) {
        showStatus('#coordinadoresMensaje', 'No se pudieron cargar coordinadores: ' + obtenerMensajeError(error), 'error');
      })
      .finally(function () {
        setLoading('#btnCargarCoordinadores', false);
      });
  }

  function guardarCoordinador(event) {
    event.preventDefault();
    if (!firebaseListo()) return;

    var data = leerFormulario();
    var validacion = validarCoordinador(data);
    if (!validacion.ok) {
      showStatus('#coordinadoresMensaje', validacion.mensaje, 'error');
      return;
    }

    setLoading('#btnGuardarCoordinador', true, 'Guardando...');
    showStatus('#coordinadoresMensaje', 'Guardando coordinador...', 'info');

    repository.guardarCoordinador(data)
      .then(function () {
        showStatus('#coordinadoresMensaje', 'Coordinador guardado correctamente.', 'success');
        limpiarFormulario();
        cargarCoordinadores();
      })
      .catch(function (error) {
        showStatus('#coordinadoresMensaje', 'No se pudo guardar coordinador: ' + obtenerMensajeError(error), 'error');
      })
      .finally(function () {
        setLoading('#btnGuardarCoordinador', false);
      });
  }

  function manejarAccionCoordinador(event) {
    var button = event.target.closest('button[data-action]');
    if (!button) return;

    var action = button.dataset.action;
    var id = button.dataset.id;

    if (action === 'editar') editarCoordinador(id);
    if (action === 'eliminar') eliminarCoordinador(id, button);
  }

  function editarCoordinador(id) {
    var coordinador = buscarCoordinador(id);
    if (!coordinador) {
      showStatus('#coordinadoresMensaje', 'No se encontró el coordinador seleccionado.', 'error');
      return;
    }

    pintarFormulario(coordinador);
    showStatus('#coordinadoresMensaje', 'Coordinador cargado para edición.', 'info');
    qs('#coordEmailInput').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function eliminarCoordinador(id, button) {
    if (!firebaseListo()) return;
    if (!confirm('¿Eliminar este coordinador? Esta acción no elimina títulos ni estudiantes.')) return;

    setLoadingElement(button, true, 'Eliminando...');
    showStatus('#coordinadoresMensaje', 'Eliminando coordinador...', 'info');

    repository.eliminarCoordinador(id)
      .then(function () {
        showStatus('#coordinadoresMensaje', 'Coordinador eliminado correctamente.', 'success');
        cargarCoordinadores();
      })
      .catch(function (error) {
        showStatus('#coordinadoresMensaje', 'No se pudo eliminar coordinador: ' + obtenerMensajeError(error), 'error');
      })
      .finally(function () {
        setLoadingElement(button, false);
      });
  }

  function renderCoordinadores(coordinadores) {
    var container = qs('#coordinadoresLista');
    if (!container) return;

    container.innerHTML = '';

    if (!coordinadores.length) {
      var empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'Todavía no hay coordinadores creados.';
      container.appendChild(empty);
      return;
    }

    var tableWrap = document.createElement('div');
    tableWrap.className = 'table-wrap';

    var table = document.createElement('table');
    table.className = 'data-table';
    table.innerHTML = '<thead><tr><th>Nombre</th><th>Email</th><th>Carreras</th><th>Estado</th><th>Acciones</th></tr></thead>';

    var tbody = document.createElement('tbody');
    coordinadores.forEach(function (coordinador) {
      var tr = document.createElement('tr');
      tr.appendChild(td(coordinador.nombres));
      tr.appendChild(td(coordinador.email));
      tr.appendChild(td((coordinador.carreras || []).join(', ')));
      tr.appendChild(td(coordinador.activo ? 'ACTIVO' : 'INACTIVO'));

      var actions = document.createElement('td');
      var edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'btn btn--ghost';
      edit.textContent = 'Editar';
      edit.dataset.action = 'editar';
      edit.dataset.id = coordinador.id;

      var remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn btn--danger';
      remove.textContent = 'Eliminar';
      remove.dataset.action = 'eliminar';
      remove.dataset.id = coordinador.id;

      var group = document.createElement('div');
      group.className = 'table-actions';
      group.appendChild(edit);
      group.appendChild(remove);
      actions.appendChild(group);
      tr.appendChild(actions);

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    tableWrap.appendChild(table);
    container.appendChild(tableWrap);
  }

  function leerFormulario() {
    return {
      email: value('#coordEmailInput'),
      nombres: value('#coordNombresInput'),
      carreras: value('#coordCarrerasInput'),
      activo: value('#coordActivoInput'),
      observacion: value('#coordObservacionInput')
    };
  }

  function pintarFormulario(coordinador) {
    setValue('#coordEmailInput', coordinador.email || '');
    setValue('#coordNombresInput', coordinador.nombres || '');
    setValue('#coordCarrerasInput', Array.isArray(coordinador.carreras) ? coordinador.carreras.join(', ') : '');
    setValue('#coordActivoInput', String(Boolean(coordinador.activo)));
    setValue('#coordObservacionInput', coordinador.observacion || '');
  }

  function limpiarFormulario() {
    pintarFormulario({
      email: '',
      nombres: '',
      carreras: [],
      activo: true,
      observacion: ''
    });
  }

  function validarCoordinador(data) {
    if (!data.email) return { ok: false, mensaje: 'Ingresa el correo del coordinador.' };
    if (data.email.indexOf('@') === -1) return { ok: false, mensaje: 'Ingresa un correo válido.' };
    if (!data.nombres) return { ok: false, mensaje: 'Ingresa los nombres del coordinador.' };
    if (!data.carreras) return { ok: false, mensaje: 'Ingresa al menos una carrera asignada.' };
    return { ok: true, mensaje: '' };
  }

  function buscarCoordinador(id) {
    return estado.coordinadores.filter(function (coordinador) {
      return coordinador.id === id;
    })[0] || null;
  }

  function td(valueToShow) {
    var cell = document.createElement('td');
    cell.textContent = valueToShow || '—';
    return cell;
  }

  function firebaseListo() {
    if (firebaseService && firebaseService.estaListo && firebaseService.estaListo()) return true;
    showStatus('#coordinadoresMensaje', 'Firebase no está conectado. Revisa la configuración del módulo administrador.', 'warning');
    return false;
  }

  function qs(selector) {
    return document.querySelector(selector);
  }

  function value(selector) {
    var element = qs(selector);
    return element ? String(element.value || '').trim() : '';
  }

  function setValue(selector, valueToSet) {
    var element = qs(selector);
    if (element) element.value = valueToSet == null ? '' : String(valueToSet);
  }

  function showStatus(selector, message, type) {
    var element = qs(selector);
    if (!element) return;
    element.classList.remove('is-info', 'is-success', 'is-warning', 'is-error');
    if (type) element.classList.add('is-' + type);
    element.textContent = message || '';
  }

  function setLoading(selector, loading, text) {
    setLoadingElement(qs(selector), loading, text);
  }

  function setLoadingElement(button, loading, text) {
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
