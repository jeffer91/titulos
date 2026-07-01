/* Pantalla administrativa para carga, listado y limpieza de estudiantes. */
(function () {
  'use strict';

  var repository = window.TAAdminRepository;
  var firebaseService = window.TAAdminFirebaseService;
  var importService = window.TAAdminEstudiantesImport;

  var estado = {
    estudiantesPreview: [],
    erroresPreview: [],
    ultimoPeriodo: ''
  };

  document.addEventListener('DOMContentLoaded', iniciar);

  function iniciar() {
    conectarEventos();
  }

  function conectarEventos() {
    var btnLeer = qs('#btnLeerArchivoEstudiantes');
    var btnGuardar = qs('#btnGuardarEstudiantes');
    var btnListar = qs('#btnListarEstudiantes');
    var btnLimpiar = qs('#btnLimpiarEstudiantesPeriodo');
    var periodoInput = qs('#estudiantesPeriodoInput');

    if (btnLeer) btnLeer.addEventListener('click', leerArchivoEstudiantes);
    if (btnGuardar) btnGuardar.addEventListener('click', guardarEstudiantes);
    if (btnListar) btnListar.addEventListener('click', listarEstudiantes);
    if (btnLimpiar) btnLimpiar.addEventListener('click', limpiarEstudiantesPeriodo);
    if (periodoInput) periodoInput.addEventListener('change', listarEstudiantesSilencioso);
  }

  function leerArchivoEstudiantes() {
    if (!firebaseListo()) return;

    var fileInput = qs('#archivoEstudiantesInput');
    var file = fileInput && fileInput.files ? fileInput.files[0] : null;
    var periodo = value('#estudiantesPeriodoInput');

    if (!periodo) {
      showStatus('#estudiantesMensaje', 'Ingresa el período al que pertenecen los estudiantes.', 'error');
      return;
    }

    if (!file) {
      showStatus('#estudiantesMensaje', 'Selecciona un archivo CSV, TXT, JSON o Excel.', 'error');
      return;
    }

    setLoading('#btnLeerArchivoEstudiantes', true, 'Leyendo...');
    showStatus('#estudiantesMensaje', 'Leyendo y validando archivo...', 'info');

    importService.leerArchivo(file, periodo)
      .then(function (resultado) {
        estado.estudiantesPreview = resultado.estudiantes;
        estado.erroresPreview = resultado.errores;
        estado.ultimoPeriodo = periodo;
        renderResumen(resultado);
        renderTablaEstudiantes(resultado.estudiantes, resultado.errores);

        if (!resultado.estudiantes.length) {
          showStatus('#estudiantesMensaje', 'No hay estudiantes válidos para guardar. Revisa los errores.', 'error');
          return;
        }

        showStatus('#estudiantesMensaje', 'Archivo leído. Estudiantes válidos: ' + resultado.totalValidos + '. Errores: ' + resultado.totalErrores + '.', resultado.totalErrores ? 'warning' : 'success');
      })
      .catch(function (error) {
        estado.estudiantesPreview = [];
        estado.erroresPreview = [];
        renderTablaEstudiantes([], [obtenerMensajeError(error)]);
        showStatus('#estudiantesMensaje', 'No se pudo leer el archivo: ' + obtenerMensajeError(error), 'error');
      })
      .finally(function () {
        setLoading('#btnLeerArchivoEstudiantes', false);
      });
  }

  function guardarEstudiantes() {
    if (!firebaseListo()) return;

    var periodo = value('#estudiantesPeriodoInput');

    if (!periodo) {
      showStatus('#estudiantesMensaje', 'Ingresa el período antes de guardar.', 'error');
      return;
    }

    if (!estado.estudiantesPreview.length) {
      showStatus('#estudiantesMensaje', 'Primero lee y valida un archivo de estudiantes.', 'warning');
      return;
    }

    if (estado.ultimoPeriodo && estado.ultimoPeriodo !== periodo) {
      showStatus('#estudiantesMensaje', 'El período cambió después de leer el archivo. Vuelve a leer el archivo para evitar errores.', 'error');
      return;
    }

    setLoading('#btnGuardarEstudiantes', true, 'Guardando...');
    showStatus('#estudiantesMensaje', 'Guardando estudiantes en Firebase...', 'info');

    repository.guardarEstudiantes(estado.estudiantesPreview, periodo)
      .then(function (respuesta) {
        showStatus('#estudiantesMensaje', 'Estudiantes guardados correctamente: ' + respuesta.total + '.', 'success');
        return listarEstudiantesSilencioso();
      })
      .catch(function (error) {
        showStatus('#estudiantesMensaje', 'No se pudieron guardar estudiantes: ' + obtenerMensajeError(error), 'error');
      })
      .finally(function () {
        setLoading('#btnGuardarEstudiantes', false);
      });
  }

  function listarEstudiantes() {
    if (!firebaseListo()) return;

    var periodo = value('#estudiantesPeriodoInput');
    if (!periodo) {
      showStatus('#estudiantesMensaje', 'Ingresa el período para listar estudiantes.', 'error');
      return;
    }

    setLoading('#btnListarEstudiantes', true, 'Listando...');
    showStatus('#estudiantesMensaje', 'Consultando estudiantes del período...', 'info');

    repository.listarEstudiantesPorPeriodo(periodo)
      .then(function (estudiantes) {
        renderResumen({ totalFilas: estudiantes.length, totalValidos: estudiantes.length, totalErrores: 0, errores: [] });
        renderTablaEstudiantes(estudiantes, []);
        showStatus('#estudiantesMensaje', 'Estudiantes encontrados: ' + estudiantes.length + '.', 'success');
      })
      .catch(function (error) {
        showStatus('#estudiantesMensaje', 'No se pudieron listar estudiantes: ' + obtenerMensajeError(error), 'error');
      })
      .finally(function () {
        setLoading('#btnListarEstudiantes', false);
      });
  }

  function listarEstudiantesSilencioso() {
    var periodo = value('#estudiantesPeriodoInput');
    if (!firebaseListo(false) || !periodo) return Promise.resolve();

    return repository.listarEstudiantesPorPeriodo(periodo)
      .then(function (estudiantes) {
        renderTablaEstudiantes(estudiantes, []);
        renderResumen({ totalFilas: estudiantes.length, totalValidos: estudiantes.length, totalErrores: 0, errores: [] });
      })
      .catch(function () {
        return null;
      });
  }

  function limpiarEstudiantesPeriodo() {
    if (!firebaseListo()) return;

    var periodo = value('#estudiantesPeriodoInput');
    if (!periodo) {
      showStatus('#estudiantesMensaje', 'Ingresa el período que deseas limpiar.', 'error');
      return;
    }

    if (!confirm('¿Eliminar todos los estudiantes del período ' + periodo + '? Esta acción no elimina títulos enviados.')) return;

    setLoading('#btnLimpiarEstudiantesPeriodo', true, 'Limpiando...');
    showStatus('#estudiantesMensaje', 'Eliminando estudiantes del período...', 'info');

    repository.limpiarEstudiantesPorPeriodo(periodo)
      .then(function (respuesta) {
        estado.estudiantesPreview = [];
        estado.erroresPreview = [];
        renderResumen({ totalFilas: 0, totalValidos: 0, totalErrores: 0, errores: [] });
        renderTablaEstudiantes([], []);
        showStatus('#estudiantesMensaje', 'Limpieza completada. Estudiantes eliminados: ' + respuesta.total + '.', 'success');
      })
      .catch(function (error) {
        showStatus('#estudiantesMensaje', 'No se pudo limpiar estudiantes: ' + obtenerMensajeError(error), 'error');
      })
      .finally(function () {
        setLoading('#btnLimpiarEstudiantesPeriodo', false);
      });
  }

  function renderResumen(resultado) {
    setText('#estudiantesTotalFilas', String(resultado.totalFilas || 0));
    setText('#estudiantesTotalValidos', String(resultado.totalValidos || 0));
    setText('#estudiantesTotalErrores', String(resultado.totalErrores || 0));
  }

  function renderTablaEstudiantes(estudiantes, errores) {
    var container = qs('#estudiantesPreview');
    if (!container) return;

    container.innerHTML = '';

    if (errores && errores.length) {
      var errorBox = document.createElement('div');
      errorBox.className = 'error-list';
      errorBox.innerHTML = '<strong>Errores detectados</strong>';
      var ul = document.createElement('ul');
      errores.slice(0, 20).forEach(function (error) {
        var li = document.createElement('li');
        li.textContent = error;
        ul.appendChild(li);
      });
      if (errores.length > 20) {
        var extra = document.createElement('li');
        extra.textContent = 'Y ' + (errores.length - 20) + ' errores más.';
        ul.appendChild(extra);
      }
      errorBox.appendChild(ul);
      container.appendChild(errorBox);
    }

    if (!estudiantes.length) {
      var empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'No hay estudiantes para mostrar.';
      container.appendChild(empty);
      return;
    }

    var tableWrap = document.createElement('div');
    tableWrap.className = 'table-wrap';

    var table = document.createElement('table');
    table.className = 'data-table';
    table.innerHTML = '<thead><tr><th>Cédula</th><th>Nombres</th><th>Carrera</th><th>Período</th><th>Estado</th></tr></thead>';

    var tbody = document.createElement('tbody');
    estudiantes.slice(0, 120).forEach(function (estudiante) {
      var tr = document.createElement('tr');
      tr.appendChild(td(estudiante.numeroIdentificacion || estudiante.cedula));
      tr.appendChild(td(estudiante.nombres || estudiante.nombreCompleto));
      tr.appendChild(td(estudiante.nombreCarrera || estudiante.carrera));
      tr.appendChild(td(estudiante.periodoId));
      tr.appendChild(td(estudiante.estadoMatricula || estudiante.estado || 'ACTIVO'));
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    tableWrap.appendChild(table);
    container.appendChild(tableWrap);

    if (estudiantes.length > 120) {
      var note = document.createElement('p');
      note.className = 'muted';
      note.textContent = 'Mostrando 120 de ' + estudiantes.length + ' estudiantes.';
      container.appendChild(note);
    }
  }

  function td(value) {
    var cell = document.createElement('td');
    cell.textContent = value || '—';
    return cell;
  }

  function firebaseListo(mostrarMensaje) {
    var shouldShow = mostrarMensaje !== false;
    if (firebaseService && firebaseService.estaListo && firebaseService.estaListo()) return true;
    if (shouldShow) showStatus('#estudiantesMensaje', 'Firebase no está conectado. Revisa la configuración del módulo administrador.', 'warning');
    return false;
  }

  function qs(selector) {
    return document.querySelector(selector);
  }

  function value(selector) {
    var element = qs(selector);
    return element ? String(element.value || '').trim() : '';
  }

  function setText(selector, text) {
    var element = qs(selector);
    if (element) element.textContent = text || '0';
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
