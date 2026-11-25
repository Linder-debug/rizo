import { rpc, Asset, Networks } from "@stellar/stellar-sdk";
import { fileURLToPath } from "node:url";


const RPC_URL = "https://soroban-testnet.stellar.org";
const server = new rpc.Server(RPC_URL);
// El contrato de USDC en testnet (el mismo USDC de las sesiones 1 a 3)
const USDC = new Asset("USDC", "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5");
const USDC_CONTRATO = USDC.contractId(Networks.TESTNET);


// Revisa en la red que el pago sea el que esperas. Devuelve { ok, motivos }.
export async function verificar(hash, { destino, monto }, consulta = server) {
  // No usar Number ni redondear: USDC tiene exactamente 7 decimales.
  if (typeof monto !== "string" || !/^\d+(\.\d{1,7})?$/.test(monto)) {
    return { ok: false, motivos: ["monto inválido: usa un decimal positivo con hasta 7 decimales"] };
  }
  const [entero, fraccion = ""] = monto.split(".");
  const esperado = BigInt(entero) * 10000000n + BigInt(fraccion.padEnd(7, "0"));
  if (esperado <= 0n) return { ok: false, motivos: ["monto inválido: debe ser mayor que cero"] };
  const tx = await consulta.getTransaction(hash);
  if (tx.status !== "SUCCESS") return { ok: false, motivos: [`la transacción no está confirmada (${tx.status})`] };


  // Los eventos dicen lo que de verdad se movió: "transfer" de USDC, de quién, a quién y cuánto
  const eventos = JSON.parse(JSON.stringify(tx.events?.contractEventsXdr ?? [])).flat();
  const transferencias = eventos.filter((e) => {
    const v0 = e?.body?.v0;
    // USDC puede añadir un cuarto topic. Validamos los tres primeros;
    // los metadatos adicionales no sustituyen contrato, destinatario ni importe.
    return v0?.topics?.length >= 3 && v0.topics[0]?.symbol === "transfer"
      && typeof v0.topics[1]?.address === "string"
      && typeof v0.topics[2]?.address === "string"
      && /^-?\d+$/.test(String(v0.data?.i128 ?? ""));
  });
  if (!transferencias.length) return { ok: false, motivos: ["no hay ninguna transferencia válida en esta transacción"] };
  const usdc = transferencias.filter((e) => e.contract_id === USDC_CONTRATO);
  if (!usdc.length) return { ok: false, motivos: ["no es USDC: ninguna transferencia pertenece al contrato esperado"] };
  const alDestino = usdc.filter((e) => e.body.v0.topics[2].address === destino);
  if (!alDestino.length) return { ok: false, motivos: [`ninguna transferencia USDC tiene el destinatario esperado: ${destino}`] };
  // Contrato, destinatario e importe deben coincidir en UN MISMO evento.
  const pago = alDestino.find((e) => BigInt(e.body.v0.data.i128) === esperado);
  if (!pago) return { ok: false, motivos: [`ninguna transferencia USDC al destinatario tiene el monto esperado: ${monto}`] };
  const [, de, a] = pago.body.v0.topics.map((t) => t.address);
  return { ok: true, motivos: [], de, a, monto: Number(esperado) / 1e7 };
}


// Si lo corres desde la terminal: npm run verificar -- <hash>
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const hash = process.argv[2];
  if (!/^[0-9a-f]{64}$/.test(hash || "")) {
    console.log("Uso: npm run verificar -- <hash de 64 caracteres>");
    process.exit(1);
  }
  const destino = process.env.DESTINO || process.env.MI_PUBLICA; // por defecto: tu cuenta
  const monto = process.env.MONTO || "0.01"; // lo que cobra tu API
  console.log(`🔎 ${hash}\nEsperado: ${monto} USDC a ${destino}`);
  const r = await verificar(hash, { destino, monto });
  if (r.ok) {
    console.log(`✅ ACEPTADO: ${r.monto} USDC de ${r.de} a ${r.a}`);
  } else {
    console.log(`❌ RECHAZADO: ${r.motivos.join("; ")}`);
    process.exit(1);
  }
}
