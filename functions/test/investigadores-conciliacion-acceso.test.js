'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const script = fs.readFileSync(path.join(__dirname, '../../administradores/js/investigadores.admin.js'), 'utf8');
const cedula = '0000000000';
const pin = '1000';
const coincidencia = '0'.repeat(64);

function preparar(hashAlmacenado, habilitado) {
  const campo = { value: cedula + ';' + pin };
  const tabla = { children: [], appendChild(nodo) { this.children.push(nodo); } };
  const elementos = {
    '#pinConciliacionEntrada': campo,
    '#pinConciliacionBody': tabla,
    '#btnAuditarPinesInvestigadores': {}
  };
  const mensajes = [];
  const perfil = {
    id: cedula, cedula, nombres: 'Perfil de prueba', activo: true,
    pinCreado: true, pinActivo: habilitado,
    pinHash: hashAlmacenado, pinRevision: 2
  };
  const ui = {
    qs(selector) { return elementos[selector] || null; },
    setLoading() {},
    showStatus(_selector, mensaje) { mensajes.push(mensaje); },
    escapeHtml(value) { return String(value); },
    setValue(selector, value) { if (elementos[selector]) elementos[selector].value = value; }
  };
  const firebase = {
    async buscarInvestigadoresPorCedulaServidor() { return [{ ...perfil }]; },
    async leerDocumentoServidor() { return { ...perfil }; },
    async cambiarAccesoInvestigador(opcion) {
      if (opcion.revisionEsperada !== perfil.pinRevision) throw Error('Revisión obsoleta');
      perfil.activo = opcion.activo;
      perfil.pinActivo = opcion.activo;
      return { activo: perfil.activo, pinActivo: perfil.pinActivo };
    },
    async guardarPinInvestigador(opcion) {
      if (opcion.revisionEsperada !== perfil.pinRevision) throw Error('Revisión obsoleta');
      perfil.pinHash = opcion.hash;
      perfil.pinRevision += 1;
      return { revision: perfil.pinRevision, activo: perfil.activo, pinActivo: perfil.pinActivo };
    }
  };
  const ventana = {
    TAAdminUI: ui, TAAdminFirebaseService: firebase,
    TA_ADMINISTRADORES_CONFIG: { collections: { investigadores: 'investigadores' } },
    TAAdministradorSeguro: { activo() { return false; } },
    crypto: { subtle: { async digest() { return new Uint8Array(32).buffer; } } },
    TextEncoder, confirm() { return true; }
  };
  const documento = {
    createElement(etiqueta) {
      const e = {
        textContent: '', children: etiqueta === 'tr' ? Array.from({ length: 4 }, () => ({})) : [],
        handlers: {},
        appendChild(nodo) { this.children.push(nodo); },
        addEventListener(evento, callback) { this.handlers[evento] = callback; }
      };
      return e;
    }
  };
  vm.runInNewContext(script, { window: ventana, document: documento, TextEncoder, Uint8Array, Promise, Date, console });
  return { panel: ventana.TAAdminInvestigadores, perfil, campo, tabla, mensajes };
}

test('PIN coincidente e inactivo ofrece reactivación sin alterar la credencial', async () => {
  const sistema = preparar(coincidencia, false);
  const resultado = await sistema.panel.auditarPines();
  assert.equal(resultado[0].pinCoincide, true);
  assert.equal(resultado[0].activo, false);
  const boton = sistema.tabla.children.at(-1).children[3].children[0];
  assert.equal(boton.textContent, 'Reactivar');
  assert.equal(await boton.handlers.click(), true);
  assert.equal(sistema.perfil.pinActivo, true);
  assert.equal(sistema.perfil.pinHash, coincidencia);
});

test('PIN distinto se restablece sin activar la cuenta automáticamente', async () => {
  const sistema = preparar('a'.repeat(64), false);
  const resultado = await sistema.panel.auditarPines();
  assert.equal(resultado[0].resultado, 'PIN diferente');
  const resetear = sistema.tabla.children.at(-1).children[3].children[0];
  assert.equal(resetear.textContent, 'Restablecer');
  assert.equal(await resetear.handlers.click(), true);
  assert.equal(sistema.perfil.pinHash, coincidencia);
  assert.equal(sistema.perfil.pinActivo, false);
  const reactivar = sistema.tabla.children.at(-1).children[3].children[0];
  assert.equal(reactivar.textContent, 'Reactivar');
  assert.equal(await reactivar.handlers.click(), true);
  assert.equal(sistema.perfil.pinActivo, true);
});

test('PIN modificado después de la conciliación no se puede reactivar', async () => {
  const sistema = preparar(coincidencia, false);
  await sistema.panel.auditarPines();
  sistema.perfil.pinRevision += 1;
  const boton = sistema.tabla.children.at(-1).children[3].children[0];
  assert.equal(await boton.handlers.click(), false);
  assert.equal(sistema.perfil.pinActivo, false);
});
