import { createHash } from "node:crypto";
import { Transaction, TransactionBuilder, Networks } from "@stellar/stellar-sdk";
import { x402Client, x402HTTPClient } from "@x402/fetch";
import { createEd25519Signer } from "@x402/stellar";
import { ExactStellarScheme } from "@x402/stellar/exact/client";
import {
  BUDGET, CONTRACT, HORIZON, ISSUER, NETWORK, RPC, conBloqueo,
  errorSeguro, guardarEstado, leerEstado, reportarError, unidades,
} from "./estado-agente.js";

// Bloque 1 usa 1, bloque 2 usa 2 y bloque 3 usa 3.
const ETAPA = 3;
const API = "http://localhost:3001/dato";
const LIMIT = ETAPA >= 2 ? (process.env.TOPE ?? "$0.02") : "$0.02";
if (!/^\$\d+(\.\d{1,7})?$/.test(LIMIT)) throw errorSeguro("TOPE_INVALIDO");
const cap = unidades(LIMIT.slice(1));
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

// Solo se reintenta una consulta SIN firma. Cada petición tiene timeout.
async function consultarPrecio() {
  const attempts = ETAPA >= 3 ? 3 : 1;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(API, {
        redirect: "error", signal: AbortSignal.timeout(15000),
      });
      if (response.status === 402) return response;
      if (response.status < 500) throw errorSeguro("RESPUESTA_DISTINTA_DE_402");
      await response.body?.cancel();
    } catch (error) {
      if (error.code === "RESPUESTA_DISTINTA_DE_402") throw error;
    }
    console.log(`Consulta sin pago: intento ${attempt}/${attempts} fallido`);
    if (attempt < attempts) await sleep(attempt * 1000);
  }
  throw errorSeguro("API_NO_DISPONIBLE_CERO_FIRMAS_CERO_ENVIOS");
}

async function saldo(publicKey) {
  const response = await fetch(`${HORIZON}/accounts/${publicKey}`, {
    redirect: "error", signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw errorSeguro("SALDO_NO_CONFIRMADO");
  const account = await response.json();
  const balance = account.balances.find((b) => b.asset_code === "USDC" && b.asset_issuer === ISSUER);
  if (!balance) throw errorSeguro("FALTA_TRUSTLINE_USDC_CORRECTO");
  return unidades(balance.balance) - unidades(balance.selling_liabilities ?? "0");
}

function imprimirComprobante(record) {
  console.log(`Pago confirmado: ${record.amount} unidades mínimas de USDC`);
  console.log(`Hash: ${record.hash}`);
  console.log(`Verlo: https://stellar.expert/explorer/testnet/tx/${record.hash}`);
}

await conBloqueo(async (env) => {
  const id = process.argv[2];
  if (!id || !/^[a-zA-Z0-9_-]{1,64}$/.test(id)) {
    throw errorSeguro("INDICAR_ID_ESTABLE_DE_OPERACION");
  }
  const wallet = leerEstado("wallet", null);
  if (!env.AGENTE_SECRETA || !env.AGENTE_PUBLICA || !env.MI_PUBLICA || !wallet?.ready) {
    throw errorSeguro("WALLET_EXISTENTE_Y_PRESUPUESTO_CONFIRMADO_REQUERIDOS");
  }
  const signer = createEd25519Signer(env.AGENTE_SECRETA, NETWORK);
  if (signer.address !== env.AGENTE_PUBLICA || wallet.publicKey !== signer.address || wallet.owner !== env.MI_PUBLICA) {
    throw errorSeguro("CONFIGURACION_WALLET_NO_COINCIDE");
  }
  const journal = leerEstado("operaciones", {
    publicKey: signer.address, network: NETWORK, records: {},
  });
  if (journal.publicKey !== signer.address || journal.network !== NETWORK) {
    throw errorSeguro("HISTORIAL_NO_COINCIDE");
  }
  const previous = journal.records[id];
  if (previous) {
    if (previous.status === "pagado") {
      console.log("Operación ya pagada. Se devuelve el comprobante guardado.");
      imprimirComprobante(previous);
      return;
    }
    console.log(`Operación existente: ${previous.status}`);
    console.log(`Firmas=${previous.signatures}; envíos con pago=${previous.paidRequests}`);
    throw errorSeguro("MISMA_OPERACION_NO_SE_VUELVE_A_PAGAR");
  }
  if (Object.values(journal.records).some((r) => ["preparando", "pendiente"].includes(r.status))) {
    throw errorSeguro("HAY_OPERACION_INCIERTA_BLOQUEA_NUEVOS_PAGOS");
  }

  const counters = { signatures: 0, paidRequests: 0 };
  const auditedSigner = {
    ...signer,
    signAuthEntry: async (...args) => {
      counters.signatures++;
      return signer.signAuthEntry(...args);
    },
    signTransaction: async (...args) => {
      counters.signatures++;
      return signer.signTransaction(...args);
    },
  };
  const client = x402Client.fromConfig({
    schemes: [{
      network: NETWORK,
      client: new ExactStellarScheme(auditedSigner, { url: RPC }),
    }],
    spendControls: { maxAmountPerPayment: LIMIT },
  });
  const http = new x402HTTPClient(client);
  const first = await consultarPrecio();
  const required = http.getPaymentRequiredResponse((name) => first.headers.get(name));
  await first.body?.cancel();
  if (required.x402Version !== 2 || required.accepts.length !== 1) {
    throw errorSeguro("REQUISITOS_X402_INESPERADOS");
  }
  const offer = required.accepts[0];
  if (
    offer.network !== NETWORK || offer.scheme !== "exact" ||
    offer.asset !== CONTRACT || offer.payTo !== env.MI_PUBLICA ||
    offer.amount !== "100000" || offer.extra?.areFeesSponsored !== true ||
    (offer.extra?.paymentFlow != null && offer.extra.paymentFlow !== "authorization")
  ) {
    throw errorSeguro("PRECIO_ACTIVO_RED_O_DESTINO_INESPERADO");
  }
  const amount = BigInt(offer.amount);
  // API pública del SDK. spendControls se evalúa ANTES del esquema/firma.
  if (amount > cap) {
    let sdkRejected = false;
    try { client.selectPaymentRequirements(2, [offer]); }
    catch { sdkRejected = true; }
    journal.records[id] = {
      status: "rechazado_tope", amount: offer.amount, limit: LIMIT,
      ...counters, sdkRejected,
    };
    guardarEstado("operaciones", journal);
    console.log(`Rechazado por tope ${LIMIT}; firmas=0; envíos con pago=0; SDK rechazó=${sdkRejected}`);
    if (!sdkRejected) throw errorSeguro("SDK_NO_APLICO_TOPE_REVISAR_VERSION");
    process.exitCode = 2;
    return;
  }
  client.selectPaymentRequirements(2, [offer]);
  const spent = Object.values(journal.records)
    .filter((record) => record.status === "pagado")
    .reduce((sum, record) => sum + BigInt(record.amount), 0n);
  if (spent + amount > BUDGET) throw errorSeguro("PRESUPUESTO_TOTAL_005_AGOTADO");
  if (await saldo(signer.address) < amount) throw errorSeguro("SALDO_INSUFICIENTE_CERO_FIRMAS");
  const record = {
    status: "preparando", amount: offer.amount, limit: LIMIT,
    network: NETWORK, payTo: offer.payTo, ...counters,
  };
  journal.records[id] = record;
  guardarEstado("operaciones", journal);

  let payload;
  try {
    payload = await client.createPaymentPayload(required);
    // Misma adaptación de XDR que funcionó en la sesión 2.
    // La firma del agente está en las autorizaciones Soroban.
    const transaction = new Transaction(payload.payload.transaction, Networks.TESTNET);
    const envelope = transaction.toEnvelope();
    if (envelope.type !== "envelopeTypeTx" || envelope.value.tx.ext.type !== "sorobanData") {
      throw errorSeguro("XDR_SOROBAN_INESPERADO");
    }
    payload = {
      ...payload,
      payload: {
        ...payload.payload,
        transaction: TransactionBuilder.cloneFrom(transaction, {
          fee: "1", sorobanData: envelope.value.tx.ext.value,
          networkPassphrase: Networks.TESTNET,
        }).build().toXDR(),
      },
    };
  } catch {
    Object.assign(record, counters, { status: "fallo_preparacion" });
    guardarEstado("operaciones", journal);
    throw errorSeguro("PREPARACION_FALLO_SIN_ENVIAR_PAGO");
  }
  const headers = http.encodePaymentSignatureHeader(payload);
  record.payloadDigest = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  Object.assign(record, counters, { status: "pendiente", paidRequests: 1 });
  // Persistencia previa al único envío. Un cierre o timeout bloquea otro pago.
  guardarEstado("operaciones", journal);
  try {
    const response = await fetch(API, {
      method: "GET", headers, redirect: "error",
      signal: AbortSignal.timeout(90000),
    });
    const settlement = http.getPaymentSettleResponse((name) => response.headers.get(name));
    if (
      settlement.success !== true || settlement.network !== NETWORK ||
      settlement.payer !== signer.address || !/^[0-9a-f]{64}$/i.test(settlement.transaction ?? "")
    ) {
      throw errorSeguro("LIQUIDACION_NO_CONFIRMADA");
    }
    record.hash = settlement.transaction;
    record.status = "pagado";
    record.httpStatus = response.status;
    guardarEstado("operaciones", journal);
    imprimirComprobante(record);
    const data = await response.json();
    if (response.status !== 200 || data.pagado !== true) {
      throw errorSeguro("PAGO_CONFIRMADO_ENTREGA_DEL_DATO_FALLO");
    }
    record.delivered = true;
    guardarEstado("operaciones", journal);
    console.log(`Respuesta 200: ${JSON.stringify(data)}`);
    console.log(`Firmas=${record.signatures}; envíos con pago=${record.paidRequests}`);
  } catch {
    // Conserva pagado si ya había un recibo válido, o pendiente si es incierto.
    throw errorSeguro(record.status === "pagado"
      ? "PAGO_CONFIRMADO_REVISAR_ENTREGA_SIN_VOLVER_A_PAGAR"
      : "RESULTADO_INCIERTO_BLOQUEADO_REVISAR_HISTORIAL");
  }
}).catch(reportarError);
