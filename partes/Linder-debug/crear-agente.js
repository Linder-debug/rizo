import {
  Asset, BASE_FEE, Horizon, Keypair, Networks, Operation, TransactionBuilder,
} from "@stellar/stellar-sdk";
import {
  HORIZON, ISSUER, conBloqueo, errorSeguro, guardarArchivo,
  guardarEstado, leerEstado, reportarError, unidades,
} from "./estado-agente.js";

const horizon = new Horizon.Server(HORIZON, { timeout: 20000 });
const usdc = new Asset("USDC", ISSUER);

async function buscarAccount(publicKey) {
  try { return await horizon.loadAccount(publicKey); }
  catch (error) {
    if (error.response?.status === 404) return null;
    throw errorSeguro("LECTURA_CUENTA_NO_CONFIRMADA");
  }
}

async function buscarTransaction(hash) {
  try { return await horizon.transactions().transaction(hash).call(); }
  catch (error) {
    if (error.response?.status === 404) return null;
    throw errorSeguro("LECTURA_TRANSACCION_NO_CONFIRMADA");
  }
}

// Conserva el XDR y hash ANTES de enviarlo. Solo reenvía el MISMO XDR.
async function enviarUnaVez(state, step, build) {
  let entry = state.steps[step];
  if (!entry) {
    const tx = await build();
    entry = { xdr: tx.toXDR(), hash: Buffer.from(tx.hash()).toString("hex"), confirmed: false };
    state.steps[step] = entry;
    guardarEstado("wallet", state);
  }
  const known = await buscarTransaction(entry.hash);
  if (known?.successful === false) throw errorSeguro("TRANSACCION_FALLIDA_REQUIERE_REVISION");
  if (known?.successful === true) {
    entry.confirmed = true;
    guardarEstado("wallet", state);
    return entry.hash;
  }
  if (entry.confirmed) throw errorSeguro("HISTORIAL_TESTNET_NO_COINCIDE_REVISAR_RESET");
  const tx = TransactionBuilder.fromXDR(entry.xdr, Networks.TESTNET);
  try { await horizon.submitTransaction(tx); }
  catch {
    // Un timeout o error de envío no autoriza construir otro pago.
    const observed = await buscarTransaction(entry.hash);
    if (!observed?.successful) throw errorSeguro("ENVIO_PENDIENTE_REVISAR_HASH_GUARDADO");
  }
  const observed = await buscarTransaction(entry.hash);
  if (!observed?.successful) throw errorSeguro("CONFIRMACION_PENDIENTE");
  entry.confirmed = true;
  guardarEstado("wallet", state);
  return entry.hash;
}

await conBloqueo(async (env, contents) => {
  const command = process.argv[2];
  if (!["crear", "preparar", "estado"].includes(command)) {
    throw errorSeguro("USO_crear_preparar_estado");
  }
  let state = leerEstado("wallet", null);
  let created = false;
  const hasPublic = Boolean(env.AGENTE_PUBLICA);
  const hasSecret = Boolean(env.AGENTE_SECRETA);
  if (hasPublic !== hasSecret) throw errorSeguro("WALLET_INCOMPLETA_NO_REGENERAR");
  if (!hasPublic) {
    if (command !== "crear" || state || leerEstado("operaciones", null)) {
      throw errorSeguro("FALTA_WALLET_CREACION_EXPLICITA_REQUERIDA");
    }
    // La clave se guarda antes de Friendbot, trustline y financiación.
    const pair = Keypair.random();
    const base = contents.replace(/^[ \t]*(?:export[ \t]+)?AGENTE_(PUBLICA|SECRETA)[ \t]*=.*(?:\r?\n|$)/gm, "");
    guardarArchivo(".env", `${base}\nAGENTE_PUBLICA=${pair.publicKey()}\nAGENTE_SECRETA=${pair.secret()}\n`);
    env.AGENTE_PUBLICA = pair.publicKey();
    env.AGENTE_SECRETA = pair.secret();
    created = true;
  }
  const agent = Keypair.fromSecret(env.AGENTE_SECRETA);
  if (agent.publicKey() !== env.AGENTE_PUBLICA) throw errorSeguro("WALLET_NO_COINCIDE");
  if (state && state.publicKey !== agent.publicKey()) throw errorSeguro("WALLET_CAMBIO_REVISAR_ESTADO");
  if (!state) {
    if (!created) throw errorSeguro("WALLET_PREEXISTENTE_SIN_DIARIO_REQUIERE_REVISION");
    state = { publicKey: agent.publicKey(), steps: {}, ready: false };
    guardarEstado("wallet", state);
  }
  console.log(`Wallet del agente: ${agent.publicKey()}`);
  if (command === "crear") {
    console.log("Wallet guardada. Conserva la misma wallet al continuar.");
    return;
  }
  if (command === "estado") {
    console.log(`Financiación confirmada: ${state.ready}`);
    for (const [name, entry] of Object.entries(state.steps)) {
      console.log(`${name}: ${entry.hash} · confirmado=${entry.confirmed}`);
    }
    return;
  }
  const owner = Keypair.fromSecret(env.MI_SECRETA);
  if (owner.publicKey() !== env.MI_PUBLICA || owner.publicKey() === agent.publicKey()) {
    throw errorSeguro("ORIGEN_DE_FINANCIACION_INVALIDO");
  }
  if (state.owner && state.owner !== owner.publicKey()) throw errorSeguro("ORIGEN_CAMBIO");
  state.owner = owner.publicKey();
  guardarEstado("wallet", state);
  if (state.ready) {
    console.log("Presupuesto inicial de 0.05 USDC ya confirmado. Sin recarga.");
    return;
  }
  let account = await buscarAccount(agent.publicKey());
  if (!account) {
    const response = await fetch(`https://friendbot.stellar.org?addr=${agent.publicKey()}`, {
      signal: AbortSignal.timeout(20000), redirect: "error",
    });
    if (!response.ok) throw errorSeguro("FRIENDBOT_NO_CONFIRMADO");
    account = await buscarAccount(agent.publicKey());
    if (!account) throw errorSeguro("ACTIVACION_PENDIENTE_MISMA_WALLET");
  }
  const trust = account.balances.find((b) => b.asset_code === "USDC" && b.asset_issuer === ISSUER);
  if (!trust || state.steps.trustline) {
    await enviarUnaVez(state, "trustline", async () => {
      const source = await horizon.loadAccount(agent.publicKey());
      const tx = new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
        .addOperation(Operation.changeTrust({ asset: usdc })).setTimeout(120).build();
      tx.sign(agent);
      return tx;
    });
  }
  const hash = await enviarUnaVez(state, "presupuesto", async () => {
    const source = await horizon.loadAccount(owner.publicKey());
    const balance = source.balances.find((b) => b.asset_code === "USDC" && b.asset_issuer === ISSUER);
    if (!balance || unidades(balance.balance) - unidades(balance.selling_liabilities ?? "0") < 500000n) {
      throw errorSeguro("ORIGEN_SIN_005_USDC_DISPONIBLES");
    }
    const tx = new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
      .addOperation(Operation.payment({ destination: agent.publicKey(), asset: usdc, amount: "0.05" }))
      .setTimeout(120).build();
    tx.sign(owner);
    return tx;
  });
  state.ready = true;
  guardarEstado("wallet", state);
  console.log("Presupuesto inicial confirmado: 0.05 USDC de Testnet");
  console.log(`Hash: ${hash}`);
  console.log(`Verlo: https://stellar.expert/explorer/testnet/tx/${hash}`);
}).catch(reportarError);
