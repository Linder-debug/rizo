import test from "node:test";
import assert from "node:assert/strict";
import { x402Client } from "@x402/fetch";
import { ExactStellarScheme } from "@x402/stellar/exact/client";
import { CONTRACT, NETWORK } from "./estado-agente.js";

test("spendControls rechaza 0.01 USDC con tope 0.005 antes de construir o firmar", async () => {
  let signatures = 0;
  let preparations = 0;
  const scheme = new ExactStellarScheme({
    address: "GBKR2TIZ2NP6QJD6WN7XEM3F6PZ7QASI6QC4T4P5TLALYZZC6O77TKBS",
    signAuthEntry: async () => { signatures++; throw new Error("NO_DEBE_FIRMAR"); },
  });
  // Conserva el descubrimiento de activos y los controles del SDK real.
  // Intercepta la preparación antes de que pueda consultar una red.
  scheme.createPaymentPayload = async () => {
    preparations++;
    throw new Error("NO_DEBE_PREPARAR");
  };
  const client = x402Client.fromConfig({
    schemes: [{ network: NETWORK, client: scheme }],
    spendControls: { maxAmountPerPayment: "$0.005" },
  });
  await assert.rejects(client.createPaymentPayload({
    x402Version: 2,
    resource: { url: "http://localhost:3001/dato" },
    accepts: [{
      network: NETWORK, scheme: "exact", amount: "100000", asset: CONTRACT,
      payTo: "GD2CDCU433RK3R2V4NAQX2NBATEIGV47OLRAW734NZ35HGQUS53WQC5Y",
      maxTimeoutSeconds: 300, extra: { areFeesSponsored: true },
    }],
  }), /spendControls.*maxAmountPerPayment/);
  assert.equal(preparations, 0);
  assert.equal(signatures, 0);
});
