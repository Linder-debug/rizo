import express from "express";
import { paymentMiddlewareFromConfig } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactStellarScheme } from "@x402/stellar/exact/server";

const PORT = 3001;
const ROUTE = "/dato";
const PRICE = "$0.01";
const NETWORK = "stellar:testnet";
const FACILITATOR_URL = "https://www.x402.org/facilitator";
const PAY_TO = process.env.MI_PUBLICA;

if (!PAY_TO) {
  throw new Error("Falta MI_PUBLICA en .env");
}

const app = express();

// Información pública sobre el servicio.
app.get("/", (_, res) =>
  res.json({
    route: ROUTE,
    price: PRICE,
    network: NETWORK,
  }),
);

// Solicita el pago para acceder a GET /dato.
app.use(
  paymentMiddlewareFromConfig(
    {
      [`GET ${ROUTE}`]: {
        accepts: {
          scheme: "exact",
          price: PRICE,
          network: NETWORK,
          payTo: PAY_TO,
        },
      },
    },
    new HTTPFacilitatorClient({
      url: FACILITATOR_URL,
    }),
    [
      {
        network: NETWORK,
        server: new ExactStellarScheme(),
      },
    ],
  ),
);

app.get(ROUTE, (_, res) =>
  res.json({
    dato: "El código HTTP 402 significa Payment Required",
    pagado: true,
  }),
);

app.listen(PORT, () =>
  console.log(`API lista en http://localhost:${PORT}${ROUTE}`),
);
