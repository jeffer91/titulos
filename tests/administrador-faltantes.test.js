'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'administradores', 'administrador.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'administradores', 'css', 'administrador.css'), 'utf8');
const app = fs.readFileSync(path.join(ROOT, 'administradores', 'js', 'administrador.app.js'), 'utf8');
const repoCode = fs.readFileSync(path.join(ROOT, 'administradores', 'js', 'administrador.repository.js'), 'utf8');

assert.strictEqual(html.includes('class="global-nav"'), false, 'Administrador no debe conservar navegación global superior.');
assert(html.includes('class="admin-sidebar"'), 'Debe existir menú lateral.');
assert(html.includes('data-admin-tab="faltantes"'), 'Debe existir Faltantes en el menú.');
assert(html.includes('id="panelFaltantes"'), 'Debe existir panel Faltantes.');
assert(html.includes('id="faltantesCoordinacionBody"'), 'Debe existir tabla de Coordinación.');
assert(html.includes('id="faltantesInvestigacionBody"'), 'Debe existir tabla de Investigación.');
assert(html.includes('id="inicioCoordinacionPendientes"'), 'Inicio debe separar Coordinación.');
assert(html.includes('id="inicioInvestigacionPendientes"'), 'Inicio debe separar Investigación.');
assert(css.includes('.admin-shell') && css.includes('.admin-sidebar'), 'CSS debe usar layout lateral compacto.');
assert(app.includes('faltantes: window.TAAdminFaltantes'), 'App debe registrar módulo Faltantes.');

const context = {
  console,
  Promise,
  Date,
  JSON,
  Number,
  String,
  Object,
  Array,
  RegExp,
  Intl,
  window: {
    TA_ADMINISTRADORES_CONFIG: {
      firebase: {},
      textos: { firebaseError: 'error' },
      collections: {
        config: 'configuracion',
        estudiantes: 'Estudiante',
        titulos: 'envios',
        coordinadores: 'coordinadores',
        periodos: 'periodos',
        titulosHistorial: 'versiones_envio'
      },
      documents: { appConfig: 'general' },
      defaultAppConfig: {},
      estadosTitulo: {
        sinEnviar: 'SIN_ENVIAR',
        enviado: 'ENVIADO',
        pendiente: 'PENDIENTE',
        devuelto: 'DEVUELTO',
        aprobado: 'APROBADO'
      },
      normalizacion: { agruparOnlineVista: true }
    },
    TAAdminFirebaseService: {}
  }
};

vm.createContext(context);
vm.runInContext(repoCode, context, { filename: 'administrador.repository.js' });
const repository = context.window.TAAdministradorRepository;
const propuestas = [{numero:1,tituloFinal:'A'},{numero:2,tituloFinal:'B'},{numero:3,tituloFinal:'C'}];

assert.strictEqual(
  repository.obtenerEtapaRevision({
    titulosEnviados: propuestas,
    estado: 'PENDIENTE_REVISION',
    estadoProceso: 'PENDIENTE_COORDINADOR',
    estadoCoordinador: 'PENDIENTE'
  }),
  'COORDINACION'
);

assert.strictEqual(
  repository.obtenerEtapaRevision({
    titulosEnviados: propuestas,
    estado: 'PENDIENTE_INVESTIGADOR',
    estadoProceso: 'PENDIENTE_INVESTIGADOR',
    estadoCoordinador: 'VALIDADO',
    estadoInvestigador: 'PENDIENTE',
    validadoCoordinador: true
  }),
  'INVESTIGACION'
);

assert.strictEqual(
  repository.obtenerEtapaRevision({
    titulosEnviados: propuestas,
    estado: 'APROBADO_FINAL',
    estadoProceso: 'APROBADO_FINAL',
    estadoCoordinador: 'VALIDADO',
    estadoInvestigador: 'APROBADO',
    investigacionRevisada: true
  }),
  '',
  'APROBADO_FINAL nunca debe contarse como faltante.'
);

assert.strictEqual(
  repository.clasificarEstadoTitulo({
    titulosEnviados: propuestas,
    estado: 'APROBADO_FINAL',
    estadoProceso: 'APROBADO_FINAL',
    estadoCoordinador: 'VALIDADO',
    estadoInvestigador: 'APROBADO'
  }),
  'APROBADO',
  'El estado final debe prevalecer sobre VALIDADO de Coordinación.'
);

assert.strictEqual(
  repository.obtenerEtapaRevision({
    titulosEnviados: propuestas,
    estado: 'PENDIENTE_INVESTIGADOR',
    estadoProceso: 'PENDIENTE_INVESTIGADOR',
    estadoCoordinador: 'VALIDADO',
    estadoInvestigador: 'APROBADO',
    investigacionRevisada: true
  }),
  '',
  'Una revisión ya resuelta no debe volver a aparecer en Investigación aunque el proceso legacy esté atrasado.'
);

console.log('OK administrador-faltantes: layout, colas y estados finales verificados.');
