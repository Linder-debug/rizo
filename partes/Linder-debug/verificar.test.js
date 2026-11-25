import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { verificar } from "./verificar.js";


// Lee el comprobante de S4 del README de esta parte, independientemente del cwd.
const readme = readFileSync(new URL("./README.md", import.meta.url), "utf8");
const HASH = readme.match(/^- Hash S4: `([0-9a-f]{64})`$/m)?.[1];
assert.ok(HASH, "Falta el comprobante S4 en README.md");
const YO = process.env.MI_PUBLICA;


test("acepta el pago correcto: 0.01 USDC a tu cuenta", async () => {
  const r = await verificar(HASH, { destino: YO, monto: "0.01" });
  assert.equal(r.ok, true, r.motivos.join("; "));
});


test("rechaza si el monto no es el esperado", async () => {
  const r = await verificar(HASH, { destino: YO, monto: "0.05" });
  assert.equal(r.ok, false);
  assert.match(r.motivos.join(), /monto/);
});


test("rechaza si el destinatario no es el esperado", async () => {
  const r = await verificar(HASH, { destino: process.env.AMIGO_PUBLICA, monto: "0.01" });
  assert.equal(r.ok, false);
  assert.match(r.motivos.join(), /destinatario/);
});


test("rechaza un hash que no existe", async () => {
  const r = await verificar("0".repeat(64), { destino: YO, monto: "0.01" });
  assert.equal(r.ok, false);
});