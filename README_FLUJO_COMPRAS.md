# Flujo de Compras para Frontend

Esta guia explica como consumir el flujo de compras desde frontend, que recursos cargar primero y cuales son las rutas reales de la API.

Base URL:

```text
/api
```

## Indice

- [Resumen del flujo](#resumen-del-flujo)
- [Uso como Orden de Compra sin migraciones](#uso-como-orden-de-compra-sin-migraciones)
- [Importante sobre proveedores](#importante-sobre-proveedores)
- [Catalogos que frontend deberia cargar primero](#catalogos-que-frontend-deberia-cargar-primero)
- [Modulo 1. Cabecera de compra](#modulo-1-cabecera-de-compra)
- [Modulo 2. Detalles de compra](#modulo-2-detalles-de-compra)
- [Paso final. Completar la compra](#paso-final-completar-la-compra)
- [Implementacion sugerida en frontend](#implementacion-sugerida-en-frontend)
- [Reglas de UI recomendadas por estado](#reglas-de-ui-recomendadas-por-estado)
- [Ruta sugerida para la UI](#ruta-sugerida-para-la-ui)
- [Casos comunes en frontend](#casos-comunes-en-frontend)
- [Resumen de rutas](#resumen-de-rutas)
- [Errores frecuentes que frontend deberia contemplar](#errores-frecuentes-que-frontend-deberia-contemplar)

---

## Resumen del flujo

El flujo de compras en backend se maneja en dos capas:

1. `purchase`: cabecera de la compra.
2. `purchaseDetail`: lineas o items de la compra.

Flujo recomendado en frontend:

1. Cargar catalogos necesarios.
2. Seleccionar o crear proveedor.
3. Crear la cabecera de compra en estado `PENDING`.
4. Agregar uno o varios detalles de compra.
5. Refrescar la compra para mostrar totales recalculados.
6. Cuando todo este correcto, actualizar la compra a `COMPLETED`.

## Uso como Orden de Compra sin migraciones

Con el backend actual, frontend puede implementar la idea de orden de compra usando el mismo modulo de `purchases`.

Mapeo recomendado:

- `PENDING` = orden de compra abierta / emitida / en edicion.
- `COMPLETED` = orden de compra recepcionada y ya ingresada a inventario.
- `REJECTED` = orden de compra anulada o descartada.

Esto funciona bien porque:

- la compra se puede crear primero sin mover stock.
- los detalles se pueden agregar y editar mientras siga en `PENDING`.
- el stock solo entra cuando la compra pasa a `COMPLETED`.

### Importante para frontend

No existe un modulo separado llamado `purchase-order`.

Entonces la implementacion recomendada es:

1. En UI, mostrar `Purchase` como "Orden de compra".
2. Crear siempre en estado `PENDING`.
3. Permitir editar cabecera y detalles mientras este en `PENDING`.
4. Cuando llegue la mercaderia y se confirme, cambiar a `COMPLETED`.
5. Si se cancela, usar `DELETE /api/purchases/:id`, que realmente la pasa a `REJECTED`.

### Limitaciones actuales

Con lo que existe hoy, frontend no deberia asumir:

- aprobacion por multiples etapas.
- recepcion parcial con ingreso parcial a inventario.
- conversion formal de orden de compra a otro documento separado.
- estados adicionales como `DRAFT`, `APPROVED`, `SENT` o `PARTIALLY_RECEIVED`.

La forma segura de implementarlo es tratarlo como:

- orden abierta (`PENDING`)
- orden cerrada con ingreso (`COMPLETED`)
- orden anulada (`REJECTED`)

---

## Importante sobre proveedores

Si, los proveedores usan la misma tabla de socios de negocio: `BussinessPartner`.

Para que un socio pueda usarse como proveedor:

- `type` debe ser `SUPPLIER` o `BOTH`.

Rutas utiles:

- `GET /api/business-partners/select?type=SUPPLIER&societyCode=SOC-001`
- `GET /api/business-partners?type=SUPPLIER&societyCode=SOC-001`
- `POST /api/business-partners`

Ejemplo para crear proveedor:

```json
{
  "type": "SUPPLIER",
  "typeBP": "LEGAL_ENTITY",
  "documentNumber": "20123456789",
  "companyName": "Proveedor Demo SAC",
  "tradeName": "Proveedor Demo",
  "contactEmail": "compras@proveedor-demo.com",
  "phone": "987654321",
  "address": "Av. Demo 123",
  "societyId": "SOC-001"
}
```

Notas:

- `societyId` en business partners acepta id o codigo de sociedad.
- Si intentas crear una compra con un partner de tipo `CUSTOMER`, backend la rechazara.

---

## Catalogos que frontend deberia cargar primero

Antes de abrir la pantalla de compra, lo normal es cargar estos recursos:

### Sociedad

- Normalmente frontend ya trabaja dentro de una sociedad.
- Las compras aceptan `societyId` y el backend tambien permite codigo de sociedad al crear.

### Proveedores

Ruta recomendada:

```text
GET /api/business-partners/select?type=SUPPLIER&societyCode=SOC-001
```

Tambien puedes traer `BOTH` con:

```text
GET /api/business-partners/select?type=BOTH&societyCode=SOC-001
```

### Sucursales

Rutas:

- `GET /api/branch-offices/select`
- `GET /api/branch-offices?societyId=SOC-001`

La compra requiere `branchOfficeId`.

### Productos

Rutas:

- `GET /api/products/select?societyId=SOC-001`
- `GET /api/products?societyId=SOC-001`

Los detalles de compra requieren `productId`.

### Monedas

Rutas:

- `GET /api/currencies`
- `GET /api/currencies/select`

La compra requiere `currencyId`.

### Impuestos

Rutas:

- `GET /api/taxes`

`taxId` en compra es opcional.

### Tipo de documento

`documentTypeId` existe en el modelo de compra, pero no veo una ruta publica dedicada en este proyecto para listar `ReceiptType`.

Para frontend:

- tratar `documentTypeId` como opcional.
- si van a usarlo, conviene confirmar de donde saldra ese catalogo antes de integrarlo.

---

## Modulo 1. Cabecera de compra

Endpoint base:

```text
/api/purchases
```

Operaciones:

- `GET /` lista compras.
- `GET /:id` obtiene una compra por id.
- `POST /` crea una compra.
- `PUT /:id` actualiza una compra.
- `DELETE /:id` no elimina fisicamente; cambia el estado a `REJECTED`.

### Estados de compra

El enum actual es:

- `PENDING`
- `COMPLETED`
- `REJECTED`

Comportamiento importante:

- una compra nueva normalmente debe empezar en `PENDING`.
- cuando pasa a `COMPLETED`, backend ingresa stock a inventario.
- una compra `COMPLETED` ya no deberia seguir editandose en detalle.

Si frontend la presenta como orden de compra:

- `PENDING` se renderiza como `Orden abierta`.
- `COMPLETED` se renderiza como `Recepcionada`.
- `REJECTED` se renderiza como `Anulada`.

### Payload para crear compra

Ejemplo minimo recomendado:

```json
{
  "societyId": "SOC-001",
  "providerId": "3ef7c2a4-8fa8-45fb-bded-73c516df8032",
  "currencyId": "0a66065d-08bb-476d-b2b5-1d0ce17ac7f8",
  "exchangeRate": 1,
  "branchOfficeId": "2a41beaa-f40b-4f0d-9005-657f0ea13f2a",
  "status": "PENDING",
  "subTotal": 0,
  "taxAmount": 0,
  "totalAmount": 0,
  "purchaseDate": "2026-04-08",
  "notes": "Compra de reposicion",
  "paymentMethod": "TRANSFER",
  "createdBy": "user-uuid"
}
```

Campos relevantes:

- `societyId`: UUID o codigo de sociedad.
- `providerId`: debe pertenecer a un `BusinessPartner` tipo `SUPPLIER` o `BOTH`.
- `currencyId`: obligatorio.
- `branchOfficeId`: obligatorio.
- `subTotal`, `taxAmount`, `totalAmount`: se pueden iniciar en cero.
- `taxId`: opcional.
- `documentTypeId`: opcional.
- `documentNumber`: opcional.
- `purchaseCode`: opcional.
- `dueDate`: opcional.

### Ejemplo de creacion

```bash
curl -X POST http://localhost:3000/api/purchases \
  -H "Content-Type: application/json" \
  -d '{
    "societyId": "SOC-001",
    "providerId": "PROVIDER_ID",
    "currencyId": "CURRENCY_ID",
    "exchangeRate": 1,
    "branchOfficeId": "BRANCH_ID",
    "status": "PENDING",
    "subTotal": 0,
    "taxAmount": 0,
    "totalAmount": 0
  }'
```

### Filtros de listado

`GET /api/purchases`

Query params disponibles:

- `societyId`
- `societyCode`
- `providerId`
- `status`
- `purchaseDateFrom`
- `purchaseDateTo`
- `minAmount`
- `maxAmount`
- `documentNumber`
- `page`
- `limit`
- `sortBy`
- `sortOrder`

Ejemplo:

```text
GET /api/purchases?societyCode=SOC-001&status=PENDING&page=1&limit=20
```

---

## Modulo 2. Detalles de compra

Endpoint base:

```text
/api/purchase-details
```

Operaciones:

- `GET /` lista detalles.
- `GET /:id` obtiene un detalle.
- `POST /` crea una linea.
- `PUT /:id` actualiza una linea.
- `DELETE /:id` elimina una linea.

### Regla importante

Mientras la compra este `PENDING`, frontend puede crear, editar o borrar detalles.

Si la compra ya esta `COMPLETED`:

- backend rechazara modificaciones en `purchaseDetail`.

### Payload para crear detalle

```json
{
  "purchaseId": "4c6e7d01-728f-4b4c-956c-a7f2e0a08b9e",
  "productId": "98664aa0-a5f5-469e-8ff7-061864c6b1e8",
  "quantity": 10,
  "unitPrice": 50,
  "subtotal": 500,
  "taxAmount": 90,
  "total": 590,
  "receivedQuantity": 0,
  "expirationDate": "2026-12-31"
}
```

Campos:

- `purchaseId`: obligatorio.
- `productId`: obligatorio.
- `quantity`: entero positivo.
- `unitPrice`: obligatorio.
- `subtotal`: obligatorio.
- `taxAmount`: opcional, default `0`.
- `total`: obligatorio.
- `receivedQuantity`: opcional, default `0`.
- `expirationDate`: opcional.

### Comportamiento importante de backend

Cada vez que se crea, actualiza o elimina un detalle:

- backend recalcula `subTotal`, `taxAmount` y `totalAmount` de la compra.

Eso significa que frontend puede:

1. enviar la linea.
2. volver a consultar `GET /api/purchases/:id`.
3. mostrar los totales recalculados por backend.

### Filtros de detalles

`GET /api/purchase-details`

Query params disponibles:

- `purchaseId`
- `productId`
- `expirationDateFrom`
- `expirationDateTo`
- `page`
- `limit`
- `sortBy`
- `sortOrder`

Ejemplo:

```text
GET /api/purchase-details?purchaseId=4c6e7d01-728f-4b4c-956c-a7f2e0a08b9e
```

---

## Paso final. Completar la compra

Cuando el usuario ya reviso la cabecera y todos los detalles:

```bash
curl -X PUT http://localhost:3000/api/purchases/PURCHASE_ID \
  -H "Content-Type: application/json" \
  -d '{
    "status": "COMPLETED",
    "updatedBy": "user-uuid"
  }'
```

### Que valida backend antes de completar

Backend valida:

- que la compra tenga al menos un detalle.
- que los totales de la compra coincidan con la suma de los detalles.

Si no coincide:

- devuelve error y no completa la compra.

### Que pasa al completar

Al pasar a `COMPLETED`, backend:

1. incrementa stock global del producto.
2. incrementa `physicalStock` y `availableStock` en `branchOfficeProduct`.
3. actualiza `lastRestockedAt`.
4. actualiza `priceCost` del producto con el `unitPrice` del detalle.
5. registra movimiento de inventario tipo `PURCHASE_ENTRY`.

Para frontend esto significa:

- despues de completar, ya no deberias permitir editar detalles.
- conviene refrescar compra, productos y stock de sucursal.

---

## Implementacion sugerida en frontend

### Pantalla 1. Lista de ordenes de compra

Usar:

```text
GET /api/purchases?societyCode=SOC-001
```

Mostrar columnas sugeridas:

- `purchaseCode`
- `documentNumber`
- proveedor
- `purchaseDate`
- `dueDate`
- sucursal
- `totalAmount`
- `status`

Filtros recomendados:

- proveedor
- estado
- rango de fechas
- numero de documento
- monto minimo y maximo

### Pantalla 2. Crear orden de compra

Secuencia recomendada:

1. cargar catalogos.
2. capturar cabecera.
3. crear `Purchase` en `PENDING`.
4. guardar `purchaseId`.
5. navegar a pantalla de detalle o habilitar el editor de lineas.

Payload recomendado:

```json
{
  "societyId": "SOC-001",
  "providerId": "PROVIDER_ID",
  "currencyId": "CURRENCY_ID",
  "exchangeRate": 1,
  "branchOfficeId": "BRANCH_ID",
  "status": "PENDING",
  "purchaseCode": "OC-000123",
  "documentNumber": "OC-000123",
  "notes": "Orden de compra de reposicion",
  "subTotal": 0,
  "taxAmount": 0,
  "totalAmount": 0
}
```

Notas:

- Si quieren manejar un correlativo visual de orden de compra, pueden usar `purchaseCode`.
- Si quieren mostrar un numero documental visible al usuario, tambien pueden usar `documentNumber`.
- Ambos campos ya existen y no requieren cambios de esquema.

### Pantalla 3. Editar lineas de la orden

Usar:

- `POST /api/purchase-details`
- `PUT /api/purchase-details/:id`
- `DELETE /api/purchase-details/:id`
- `GET /api/purchase-details?purchaseId=...`

Comportamiento recomendado:

1. cada vez que agregas o editas una linea, refrescar la compra.
2. leer los totales recalculados desde `GET /api/purchases/:id`.
3. bloquear edicion si la compra ya no esta en `PENDING`.

### Pantalla 4. Confirmar recepcion

Cuando la orden ya llego fisicamente:

```text
PUT /api/purchases/:id
```

Payload:

```json
{
  "status": "COMPLETED",
  "updatedBy": "user-uuid"
}
```

Efecto funcional:

- la orden deja de ser editable.
- se ingresa stock.
- se actualizan existencias del producto y de la sucursal.

---

### Pantalla 5. Anular orden

Usar:

```text
DELETE /api/purchases/:id
```

Resultado real:

- el backend no elimina el registro.
- lo cambia a `REJECTED`.

En UI puedes mostrarlo como:

- `Orden anulada`

---

## Reglas de UI recomendadas por estado

### Cuando el estado es `PENDING`

Permitir:

- editar cabecera
- agregar detalles
- editar detalles
- eliminar detalles
- completar orden
- anular orden

### Cuando el estado es `COMPLETED`

Permitir:

- solo lectura

Bloquear:

- editar cabecera
- crear detalles
- editar detalles
- eliminar detalles
- volver a completar

### Cuando el estado es `REJECTED`

Permitir:

- solo lectura

Bloquear:

- cualquier edicion operativa

---

## Ruta sugerida para la UI

Orden de carga recomendado:

1. `GET /api/business-partners/select?type=SUPPLIER&societyCode=SOC-001`
2. `GET /api/branch-offices/select`
3. `GET /api/products/select?societyId=SOC-001`
4. `GET /api/currencies/select`
5. `GET /api/taxes`

Luego:

1. `POST /api/purchases`
2. `POST /api/purchase-details` una o varias veces
3. `GET /api/purchases/:id`
4. `PUT /api/purchases/:id` con `status = COMPLETED`

## Casos comunes en frontend

### Crear compra y luego agregar detalles

Este es el flujo mas seguro:

1. crear cabecera con totales en cero.
2. guardar `purchaseId`.
3. agregar detalles.
4. consultar compra actualizada.
5. completar.

### Usar compras como ordenes de compra

Implementacion recomendada sin migraciones:

1. llamar "Orden de compra" al modulo en frontend.
2. internamente seguir usando `/api/purchases`.
3. crear orden en `PENDING`.
4. cargar detalles.
5. completar cuando se recepciona.

Con esto ya tienes una orden de compra operativa sin crear nuevas tablas.

---

### Editar una compra pendiente

Permitido:

- actualizar cabecera.
- crear, editar y eliminar detalles.

No permitido despues de completar:

- modificar detalles de compra.

### Eliminar compra

La ruta es:

```text
DELETE /api/purchases/:id
```

Pero el comportamiento real es soft delete funcional:

- backend cambia el estado a `REJECTED`.

No elimina fisicamente el registro.

---

## Resumen de rutas

### Compras

- `GET /api/purchases`
- `GET /api/purchases/:id`
- `POST /api/purchases`
- `PUT /api/purchases/:id`
- `DELETE /api/purchases/:id`

### Detalles de compra

- `GET /api/purchase-details`
- `GET /api/purchase-details/:id`
- `POST /api/purchase-details`
- `PUT /api/purchase-details/:id`
- `DELETE /api/purchase-details/:id`

### Catalogos relacionados

- `GET /api/business-partners`
- `GET /api/business-partners/select`
- `POST /api/business-partners`
- `GET /api/branch-offices`
- `GET /api/branch-offices/select`
- `GET /api/products`
- `GET /api/products/select`
- `GET /api/currencies`
- `GET /api/currencies/select`
- `GET /api/taxes`

---

## Errores frecuentes que frontend deberia contemplar

- proveedor no registrado como `SUPPLIER` o `BOTH`.
- intento de completar una compra sin detalles.
- intento de completar una compra cuyos totales no coinciden con los detalles.
- intento de modificar detalles cuando la compra ya esta `COMPLETED`.
- uso de `documentTypeId` sin tener un catalogo confirmado para ese campo.
