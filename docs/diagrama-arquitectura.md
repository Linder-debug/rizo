# Diagrama de arquitectura de Rizo

[Arquitectura, decisiones y estado](arquitectura.md)

## Componentes

El agente, la API y el registro local existen en la base curricular. El verificador S4, con borde discontinuo, está propuesto para Rizo. Stellar testnet y sus servicios son dependencias externas.

```mermaid
flowchart TD
    A["Agente CLI · base existente"]
    J["Registro local · base existente"]
    B["API /dato · base existente"]
    F["Facilitador x402"]
    S["Stellar testnet"]
    V["Verificador CLI S4 · propuesto"]

    A <-->|"Consulta y respuesta HTTP"| B
    A <-->|"Estado por ID"| J
    B -->|"Verifica y liquida"| F
    F -->|"Liquidación"| S
    A -->|"Consulta saldo por Horizon"| S
    A -.->|"Hash del recibo"| V
    V -.->|"Consulta el mismo hash por RPC"| S

    classDef proposed fill:none,stroke-dasharray:5 4
    class V proposed
```

## Secuencia prevista de la demo

El pago nuevo y la evidencia de S4 siguen pendientes. Los montos ilustran los criterios de aceptación del plan.

```mermaid
sequenceDiagram
    participant A as Agente CLI
    participant B as API /dato
    participant F as Facilitador x402
    participant S as Stellar testnet
    participant V as Verificador S4 propuesto

    A->>B: GET /dato sin pago
    B-->>A: HTTP 402 · oferta de 0.01 USDC de prueba
    A->>A: Comprueba oferta, tope, presupuesto y saldo
    alt Precio excede el tope
        Note over A: Rechazo antes de firmar · 0 firmas y 0 envíos con pago
    else Precio dentro del tope y demás validaciones correctas
        A->>A: Firma y guarda la operación pendiente
        A->>B: Envía la solicitud con pago
        B->>F: Verifica y liquida el pago
        F->>S: Liquida en testnet
        F-->>B: Resultado de liquidación
        B-->>A: HTTP 200 · dato y recibo con hash
        A-->>V: Hash del mismo recibo
        V->>S: Consulta el hash por RPC
        S-->>V: Estado, ledger y eventos disponibles
        V->>V: Comprueba contrato USDC, monto y destinatario
    end
```

Si el envío queda incierto, el agente conserva el pendiente en el registro local y bloquea nuevos pagos hasta revisar el caso.
