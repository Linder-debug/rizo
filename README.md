# Rizo

**Track:** Agente que paga (x402) · Código 402, Stellar testnet.

**Qué hace:** un agente con wallet propia compra un dato a una API x402 en Stellar testnet (0.01 USDC de prueba por consulta), con tope de gasto por consulta y presupuesto acumulado, manejo de errores sin pagar a ciegas, y verificación del pago contra la red por RPC (contrato USDC, destinatario e importe en la misma transferencia).

## Equipo y partes

- **Linder-debug** (@linderlopezr): API x402, agente con tope de gasto, verificador RPC y pruebas → [`partes/Linder-debug/`](partes/Linder-debug/)
- **Gonza**: incorporación pendiente.

## Cómo ejecutar

```bash
cd partes/Linder-debug
npm ci
npm run test:local   # 18 pruebas sin RPC ni saldo
```

La suite completa (22 pruebas, incluidas las consultas RPC) se ejecuta desde `partes/Linder-debug` con `npm test` y requiere un `.env` con las cuentas de prueba.

La API, el agente y el verificador usan un `.env` privado (ver `.env.example` de la parte). Detalles y hashes de prueba en [`partes/Linder-debug/README.md`](partes/Linder-debug/README.md).

## Comprobante en Stellar testnet

Pago del verificador (sesión 4): [`56ad4636836de4efa6e2d4371838b8a7f931cdd6d99f2b661fee122ed5e5ffd7`](https://stellar.expert/explorer/testnet/tx/56ad4636836de4efa6e2d4371838b8a7f931cdd6d99f2b661fee122ed5e5ffd7)

## Diseño

Documentos de diseño de la demo en [`docs/`](docs/) y logo en [`assets/`](assets/).
