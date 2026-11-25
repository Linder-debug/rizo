# Rizo · Parte de Linder-debug

API x402, cliente y agente de Código 402 en Stellar testnet. La API cobra 0.01 USDC de prueba por `GET /dato`. El agente aplica un tope por consulta de 0.02 USDC por defecto y un presupuesto acumulado de 0.05 USDC. El verificador S4 coteja contrato, destinatario e importe en la misma transferencia y conserva el soporte del evento USDC de cuatro topics.

## Preparación

1. Coloca `partes/Linder-debug/` dentro de tu copia local del repositorio Rizo. Entra en esa carpeta desde la raíz con `cd partes/Linder-debug`. Los comandos siguientes se ejecutan allí. Se necesita Git, Node.js 22 o superior y npm.
2. Ejecuta `npm ci`. El manifiesto conserva las versiones y los rangos del ZIP de S4.
3. Para reutilizar las cuentas y la wallet del agente, usa tu `.env` privado y su directorio `.codigo402-agente/` asociado. Conserva el registro de operaciones junto con la wallet. `.env.example` muestra los nombres esperados sin valores.
4. Para una preparación nueva, los scripts de apoyo son `npm run cuentas` para crear cuentas de prueba, `npm run usdc` para obtener saldo de prueba y los subcomandos de `npm run agente-wallet -- <acción>` para preparar el agente. Ejecuta `npm run agente-wallet -- crear`, luego `npm run agente-wallet -- preparar`. Consulta el estado con `npm run agente-wallet -- estado`. La inicialización y la financiación pueden emitir transacciones de testnet.

## Ejecutar la parte

En una terminal, ejecuta `npm run api`. En otra terminal, desde la misma carpeta:

- `curl -i http://localhost:3001/dato` muestra el HTTP 402 sin pago.
- `npm run agente -- <ID_OPERACION>` realiza la compra con saldo de prueba cuando aplica. Usa un ID estable. Si ya está pagado, recupera el comprobante guardado. Si un intento queda incierto, revisa el registro antes de continuar.
- `npm run verificar -- <HASH>` consulta el hash sin enviar pago. Usa `MI_PUBLICA` como destinatario y 0.01 como monto por defecto. Para comprobantes de otras cuentas puedes configurar `DESTINO` y `MONTO`.
- `npm run cliente` ejecuta el cliente de S2 y puede efectuar un pago. `npm run pagar` ejecuta el script del primer pago de apoyo.

## Pruebas

- `npm run test:local` ejecuta el verificador con respuestas simuladas y las pruebas de tope. No necesita `.env`, RPC ni saldo.
- `npm run test:red` consulta los cuatro casos de S4 contra RPC. Usa el hash S4 de este README y requiere `MI_PUBLICA` como destinatario original y `AMIGO_PUBLICA` como destinatario alternativo. No envía pagos. La disponibilidad de un hash histórico depende de la retención de la RPC.
- `npm test` conserva el comando de S4 que ejecuta el conjunto completo, incluidas las consultas de red.

## Comprobantes históricos de Stellar testnet

Los hashes proceden del README adjunto de S4. Son referencias de las sesiones originales. El empaquetado de Rizo no creó ni confirmó una transacción adicional.

- S1 · Primer pago: [6a8c31c936dc7ad7d48edc72887ecff5ac0e6e6c1d8c363986a499949e90e5c9](https://stellar.expert/explorer/testnet/tx/6a8c31c936dc7ad7d48edc72887ecff5ac0e6e6c1d8c363986a499949e90e5c9).
- S2 · Cliente, 0.01 USDC y HTTP 200: [b351d7040c015f9d9914574bb0fa72bcb1d541c7e8dcf0c0467d22bf48845514](https://stellar.expert/explorer/testnet/tx/b351d7040c015f9d9914574bb0fa72bcb1d541c7e8dcf0c0467d22bf48845514).
- S3 · Agente, 0.01 USDC: [142fe781a7d4811c3d3436714d38c8333e771315ffa4c09f420fbb4650d85d28](https://stellar.expert/explorer/testnet/tx/142fe781a7d4811c3d3436714d38c8333e771315ffa4c09f420fbb4650d85d28).
- Hash S4: `56ad4636836de4efa6e2d4371838b8a7f931cdd6d99f2b661fee122ed5e5ffd7`
- [Ver comprobante S4 en Stellar Expert](https://stellar.expert/explorer/testnet/tx/56ad4636836de4efa6e2d4371838b8a7f931cdd6d99f2b661fee122ed5e5ffd7).
