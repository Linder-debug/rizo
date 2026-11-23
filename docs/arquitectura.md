# Arquitectura de Rizo

Rizo es una demo de Código 402. Un agente de terminal compra un dato de ejemplo en una API con x402 y USDC de prueba, aplica un tope antes de firmar y permite comprobar la transferencia en Stellar testnet.

## Decisiones y estado

| Estado | Qué abarca |
| --- | --- |
| **Acordado** | Nombre Rizo y alcance del plan técnico corregido. Una consulta pagada en testnet, control de gasto, verificación del mismo pago y casos negativos. |
| **Base existente en el repositorio curricular** | API, agente CLI y persistencia local. El README de origen registra un hash S3 y reporta rechazo por tope y API caída. |
| **Diseño propuesto para Rizo** | Reutilizar esa base e incorporar el verificador CLI S4 como componente separado, con el hash devuelto por el flujo de compra como entrada. Sin endpoints adicionales. |
| **Pendiente de implementación o verificación** | Recuperar o reconstruir el trabajo local de S4 e integrarlo. Validar el entorno Windows, ejecutar el pago nuevo y conservar la evidencia de los cuatro casos S4. La sesión 5 y la acreditación del historial previo también siguen pendientes. **No hay pago nuevo confirmado.** |

Quedan fuera del alcance mainnet, dinero real, interfaz web, proveedor de datos real, LLM, operación multiusuario y garantías distribuidas de cobro único.

## Componentes e interfaces

| Componente | Responsabilidad |
| --- | --- |
| **Agente CLI · base existente** | Recibe un ID estable de operación y un tope configurable. Valida la oferta x402 v2, red, contrato, destinatario, precio, presupuesto y saldo antes de firmar. Devuelve el estado, el hash o un motivo de rechazo seguro. |
| **API · base existente** | `GET /dato` devuelve HTTP 402 con la oferta ante una solicitud sin pago. Con pago válido, devuelve HTTP 200, el dato y un recibo de liquidación. Usa el esquema `exact` e integra el facilitador x402. |
| **Stellar testnet · dependencia externa** | El facilitador verifica y liquida el pago. El agente consulta saldo por Horizon. La RPC permite consultar la transacción y sus eventos. |
| **Registro local · base existente** | Guarda las operaciones por ID, ligadas a wallet y red. Persiste el estado pendiente antes del envío y guarda el recibo cuando lo obtiene. |
| **Verificador CLI S4 · propuesto** | Recibe hash hexadecimal de 64 caracteres, monto y destinatario esperados. Acepta si RPC devuelve `SUCCESS` y la transferencia del contrato USDC esperado coincide en monto y destino. Devuelve el resultado y, cuando estén disponibles, ledger y enlace. `NOT_FOUND` deja la operación sin confirmar. |

[Ver diagrama de arquitectura y secuencia](diagrama-arquitectura.md)

## Decisión de gasto y estado local

La demo prevé una oferta de **0.01 USDC de prueba** y un tope de **0.02 USDC** para el flujo permitido. El agente comprueba los requisitos, prepara la firma y persiste el pendiente antes de enviar el pago. Si la operación devuelve HTTP 200 con un recibo válido, la verificación S4 usa el hash de ese recibo.

Con un tope de **0.005 USDC** para la misma oferta, el agente debe rechazar antes de firmar, con **0 firmas y 0 envíos con pago**. Si la API está caída, los tres intentos de consulta ocurren antes de la fase de pago. Saldo insuficiente y autorización expirada quedan como casos adicionales por reproducir.

Si el resultado del envío es incierto, el registro local conserva el estado pendiente y el agente bloquea nuevos pagos hasta revisar el caso. Un ID ya pagado recupera el recibo previo. Si existe un recibo válido pero falla la entrega del dato, se preserva el estado pagado. Estos controles dependen de conservar el registro local.

## Evidencia y configuración

- **Compra nueva:** correlacionar ID, HTTP 200, monto y hash. Conservar ledger y enlace de la verificación del mismo hash.
- **Verificación S4:** demostrar aceptación del pago correcto y rechazo ante monto incorrecto, destinatario incorrecto y hash inexistente.
- **Controles:** conservar salida del rechazo por tope y de la API caída. Vincular la evidencia a la versión demostrada.
- **Configuración:** mantener las claves en `.env` local. Excluir ese archivo, el estado de la wallet, el registro privado y los XDR firmados del repositorio y de las capturas. Validar permisos, bloqueo y escritura persistente en Windows antes de ejecutar la demo.

La aprobación del alcance define qué construir. La ejecución técnica, el pago y la publicación tienen aprobación separada.

**Referencias.** Plan técnico corregido de la demo v0.1, [repositorio curricular](https://github.com/Linder-debug/codigo-402) y [guía S4](https://docs.google.com/document/d/1xs0VdRgy8pJYrTpHWevsW4DESNYSN47w85fqR5l3hvY/edit).
