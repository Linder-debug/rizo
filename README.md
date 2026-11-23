# Rizo

Propuesta de demo de un agente que consulta una API de datos y decide si paga según un tope de gasto, usando x402 sobre Stellar testnet con USDC de prueba.

## Estado

Este repositorio reúne la documentación y los recursos visuales de preparación. No contiene todavía la implementación de la demo ni acredita una ejecución nueva. La evidencia del bootcamp se mantiene separada en [codigo-402](https://github.com/Linder-debug/codigo-402).

El flujo previsto es recibir HTTP 402, validar precio, red y esquema, rechazar antes de firmar si supera el tope, o enviar el pago y recibir HTTP 200 con dato y recibo. Un verificador externo propuesto consultará la red por RPC para comprobar el mismo hash, contrato, monto y destino.

La nueva ejecución y los casos S4 siguen pendientes de comprobación. Esta documentación no autoriza pagos, despliegues ni el uso de fondos reales.

## Documentos y logo

- [Plan técnico de la demo v0.1, corregido](docs/plan-tecnico-demo-v0.1.pdf)
- [Infografía de Rizo](docs/infografia-rizo.png)
- [Presentación de Rizo](docs/presentacion-rizo.pdf)
- [Logo Rizo V1](assets/logo/rizo-v1.png)

La infografía es una copia visual con una flecha corregida. La presentación es una copia visual de siete diapositivas, no editable, con dos textos corregidos para distinguir lo propuesto de lo comprobado. Los originales de NotebookLM conservan sus versiones anteriores. El logo V1 es una propuesta, no una identidad final aprobada.
