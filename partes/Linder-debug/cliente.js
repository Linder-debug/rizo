import {
  Transaction,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { x402Client, x402HTTPClient } from "@x402/fetch";
import {
  createEd25519Signer,
  getNetworkPassphrase,
} from "@x402/stellar";
import { ExactStellarScheme } from "@x402/stellar/exact/client";

const NETWORK = "stellar:testnet";
const STELLAR_RPC_URL = "https://soroban-testnet.stellar.org";
const RESOURCE_URL = "http://localhost:3001/dato";
const EXPECTED_AMOUNT = "100000"; // 0.01 USDC, con 7 decimales.
const USDC_CONTRACT =
  "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";

async function main() {
  if (!process.env.AMIGO_SECRETA || !process.env.MI_PUBLICA) {
    throw new Error("Falta AMIGO_SECRETA o MI_PUBLICA en .env");
  }

  const signer = createEd25519Signer(
    process.env.AMIGO_SECRETA,
    NETWORK,
  );

  const client = new x402Client().register(
    NETWORK,
    new ExactStellarScheme(signer, {
      url: STELLAR_RPC_URL,
    }),
  );

  const httpClient = new x402HTTPClient(client);

  console.log(`Destino de la consulta: ${RESOURCE_URL}`);
  console.log(`Cuenta que paga: ${signer.address}`);

  // 1. Solicitar el dato sin adjuntar un pago.
  const firstResponse = await fetch(RESOURCE_URL);
  console.log(`Payment requested: ${firstResponse.status}`);

  if (firstResponse.status !== 402) {
    throw new Error(
      `Se esperaba HTTP 402, se recibió ${firstResponse.status}`,
    );
  }

  const paymentRequired = httpClient.getPaymentRequiredResponse(
    (name) => firstResponse.headers.get(name),
  );

  // Comprobar las condiciones antes de preparar el pago.
  const accepted = paymentRequired.accepts;

  if (!Array.isArray(accepted) || accepted.length !== 1) {
    throw new Error("Se esperaba una única opción de pago");
  }

  const requirement = accepted[0];

  if (
    requirement.scheme !== "exact" ||
    requirement.network !== NETWORK ||
    requirement.amount !== EXPECTED_AMOUNT ||
    requirement.asset !== USDC_CONTRACT ||
    requirement.payTo !== process.env.MI_PUBLICA
  ) {
    throw new Error(
      "Las condiciones recibidas no coinciden con el pago autorizado",
    );
  }

  console.log(
    "Condiciones verificadas: 0.01 USDC en Stellar Testnet a MI_PUBLICA",
  );

  // 2. Preparar el pago con la cuenta del amigo.
  let paymentPayload = await client.createPaymentPayload(
    paymentRequired,
  );

  const networkPassphrase = getNetworkPassphrase(NETWORK);
  const tx = new Transaction(
    paymentPayload.payload.transaction,
    networkPassphrase,
  );

  const envelope = tx.toEnvelope();

  if (envelope.type !== "envelopeTypeTx") {
    throw new Error("Se esperaba una transacción con envelope v1");
  }

  const txExt = envelope.value.tx.ext;
  const sorobanData =
    txExt.type === "sorobanData" ? txExt.value : undefined;

  // Ajuste de comisión que utiliza la guía del curso.
  if (sorobanData) {
    paymentPayload = {
      ...paymentPayload,
      payload: {
        ...paymentPayload.payload,
        transaction: TransactionBuilder.cloneFrom(tx, {
          fee: "1",
          sorobanData,
          networkPassphrase,
        })
          .build()
          .toXDR(),
      },
    };
  }

  // 3. Enviar la consulta con el pago firmado.
  const paymentHeaders =
    httpClient.encodePaymentSignatureHeader(paymentPayload);

  const paidResponse = await fetch(RESOURCE_URL, {
    method: "GET",
    headers: paymentHeaders,
  });

  const responseText = await paidResponse.text();
  const settlement = httpClient.getPaymentSettleResponse(
    (name) => paidResponse.headers.get(name),
  );

  console.log("Settlement response:", settlement);

  if (
    !settlement.success ||
    settlement.network !== NETWORK ||
    !/^[0-9a-f]{64}$/i.test(settlement.transaction ?? "")
  ) {
    throw new Error(
      "El resultado no confirma un pago exitoso en Stellar Testnet. Revisa la transacción antes de reintentar.",
    );
  }

  // Mostrar el comprobante aunque falle la entrega posterior del dato.
  console.log(`Hash: ${settlement.transaction}`);
  console.log(
    `Verlo: https://stellar.expert/explorer/testnet/tx/${settlement.transaction}`,
  );

  if (paidResponse.status !== 200) {
    throw new Error(
      `El pago fue confirmado, pero la API respondió HTTP ${paidResponse.status}. Revisa antes de reintentar.`,
    );
  }

  const data = JSON.parse(responseText);

  if (data.pagado !== true) {
    throw new Error(
      "El pago fue confirmado, pero la respuesta no contiene pagado: true",
    );
  }

  console.log(`Access Granted! 200 ${JSON.stringify(data)}`);
}

main().catch((error) => {
  console.error(
    "Cliente detenido:",
    error instanceof Error ? error.message : "Error desconocido",
  );
  process.exitCode = 1;
});
