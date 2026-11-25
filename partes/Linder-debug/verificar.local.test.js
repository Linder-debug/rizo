import { test } from "node:test";
import assert from "node:assert/strict";
import { Asset, Networks } from "@stellar/stellar-sdk";
import { verificar } from "./verificar.js";

// Forma JSON de los ContractEvent del SDK 17.4.0, agrupados por operación.
const USDC = new Asset("USDC", "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5").contractId(Networks.TESTNET);
const HASH = "a".repeat(64);
const DESTINO = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
const ORIGEN = "GBKR2TIZ2NP6QJD6WN7XEM3F6PZ7QASI6QC4T4P5TLALYZZC6O77TKBS";
function transferencia({ contrato = USDC, destino = DESTINO, unidades = "100000" } = {}) {
  return { contract_id: contrato, body: { v0: {
    topics: [{ symbol: "transfer" }, { address: ORIGEN }, { address: destino }],
    data: { i128: unidades },
  } } };
}
function rpcSimulado(eventos, status = "SUCCESS") {
  return { getTransaction: async (hash) => {
    assert.equal(hash, HASH);
    return { status, events: { contractEventsXdr: eventos } };
  } };
}
function revisar(eventos, monto = "0.01", status) {
  return verificar(HASH, { destino: DESTINO, monto }, rpcSimulado(eventos, status));
}

test("local: acepta 0.01 USDC exactos", async () => {
  const r = await revisar([[transferencia()]]);
  assert.deepEqual(r, { ok: true, motivos: [], de: ORIGEN, a: DESTINO, monto: 0.01 });
});
function transferenciaCuatroTopics(opciones) {
  const evento = transferencia(opciones);
  // Fixture sintética con la estructura de cuatro topics reportada por Linder.
  // No es una captura RPC: el cuarto topic es metadato y no decide la aceptación.
  evento.body.v0.topics.push({ string: "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5" });
  return evento;
}
test("local: acepta transferencia USDC con cuatro topics (regresión del evento reportado)", async () => {
  const r = await revisar([[transferenciaCuatroTopics()]]);
  assert.deepEqual(r, { ok: true, motivos: [], de: ORIGEN, a: DESTINO, monto: 0.01 });
});
test("local: cuatro topics no permiten contrato incorrecto", async () => {
  const r = await revisar([[transferenciaCuatroTopics({ contrato: "OTRO_CONTRATO" })]]);
  assert.equal(r.ok, false);
  assert.match(r.motivos.join(), /no es USDC/);
});
test("local: cuatro topics no permiten destinatario incorrecto", async () => {
  const r = await revisar([[transferenciaCuatroTopics({ destino: ORIGEN })]]);
  assert.equal(r.ok, false);
  assert.match(r.motivos.join(), /destinatario/);
});
test("local: cuatro topics no permiten importe incorrecto", async () => {
  const r = await revisar([[transferenciaCuatroTopics({ unidades: "500000" })]]);
  assert.equal(r.ok, false);
  assert.match(r.motivos.join(), /monto/);
});
test("local: menos de tres topics no es una transferencia válida", async () => {
  const evento = transferencia();
  evento.body.v0.topics.pop();
  const r = await revisar([[evento]]);
  assert.equal(r.ok, false);
  assert.match(r.motivos.join(), /transferencia válida/);
});
test("local: rechaza el octavo decimal en vez de redondearlo a 0.01", async () => {
  let consultas = 0;
  const r = await verificar(HASH, { destino: DESTINO, monto: "0.010000001" }, {
    getTransaction: async () => { consultas++; throw new Error("NO_DEBE_CONSULTAR"); },
  });
  assert.equal(r.ok, false);
  assert.match(r.motivos.join(), /monto inválido/);
  assert.equal(consultas, 0);
});
test("local: conserva exactitud por encima del rango entero seguro de Number", async () => {
  const eventos = [[transferencia({ unidades: "9007199254740993" })]];
  assert.equal((await revisar(eventos, "900719925.4740993")).ok, true);
  assert.equal((await revisar(eventos, "900719925.4740992")).ok, false);
});
test("local: busca el pago correcto entre operaciones y transferencias ajenas", async () => {
  const r = await revisar([
    [transferencia({ contrato: "OTRO_CONTRATO" }), transferencia({ destino: ORIGEN })],
    [transferencia({ unidades: "500000" }), transferencia()],
  ]);
  assert.equal(r.ok, true);
  assert.equal(r.a, DESTINO);
  assert.equal(r.monto, 0.01);
});
test("local: rechaza contrato incorrecto aunque coincidan monto y destinatario", async () => {
  const r = await revisar([[transferencia({ contrato: "OTRO_CONTRATO" })]]);
  assert.equal(r.ok, false);
  assert.match(r.motivos.join(), /no es USDC/);
});
test("local: no combina condiciones de distintas transferencias", async () => {
  const r = await revisar([[transferencia({ destino: ORIGEN }), transferencia({ unidades: "500000" })]]);
  assert.equal(r.ok, false);
  assert.match(r.motivos.join(), /monto/);
});
test("local: rechaza destinatario incorrecto", async () => {
  const r = await revisar([[transferencia({ destino: ORIGEN })]]);
  assert.equal(r.ok, false);
  assert.match(r.motivos.join(), /destinatario/);
});
test("local: admite la unidad mínima de USDC", async () => {
  assert.equal((await revisar([[transferencia({ unidades: "1" })]], "0.0000001")).ok, true);
});
test("local: rechaza formatos inválidos e importes no positivos", async () => {
  for (const monto of ["0", "-0.01", "1e-2", "NaN", "Infinity", "0,01", "", " 0.01", 0.01]) {
    assert.equal((await revisar([[transferencia()]], monto)).ok, false, String(monto));
  }
});
test("local: SUCCESS sin eventos no confirma un pago", async () => {
  const r = await verificar(HASH, { destino: DESTINO, monto: "0.01" }, {
    getTransaction: async () => ({ status: "SUCCESS" }),
  });
  assert.equal(r.ok, false);
});
test("local: eventos ajenos o incompletos no impiden encontrar el pago", async () => {
  assert.equal((await revisar([[{}, { body: { v0: { topics: [{ symbol: "mint" }] } } }, transferencia()]])).ok, true);
});
test("local: NOT_FOUND y FAILED no confirman un pago", async () => {
  for (const status of ["NOT_FOUND", "FAILED"]) {
    const r = await revisar([[transferencia()]], "0.01", status);
    assert.equal(r.ok, false);
    assert.match(r.motivos.join(), /no está confirmada/);
  }
});
