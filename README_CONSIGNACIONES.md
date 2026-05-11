# Modulo de Consignaciones

Esta guia resume como usar los servicios de consignacion expuestos por la API.

Base URL:

```text
/api
```

Flujo recomendado:

1. Crear un acuerdo de consignacion saliente.
2. Registrar los productos entregados bajo ese acuerdo.
3. Registrar las ventas externas reportadas por el consignatario.
4. Registrar una o mas liquidaciones contra las ventas acumuladas.

## Servicios disponibles

### 1. Acuerdos de consignacion saliente

Endpoint base:

```text
/api/outgoing-consignment-agreements
```

Operaciones:

- `POST /` crea un acuerdo.
- `GET /` lista acuerdos con filtros y paginacion.
- `GET /:id` obtiene un acuerdo por id.
- `PUT /:id` actualiza un acuerdo.
- `DELETE /:id` elimina un acuerdo.

Payload de ejemplo para crear:

```json
{
  "societyId": "SOC-001",
  "branchId": "2a41beaa-f40b-4f0d-9005-657f0ea13f2a",
  "partnerId": "5dc25791-42c2-4fd0-b331-0ec4434db9b7",
  "startDate": "2026-04-01",
  "endDate": "2026-04-30",
  "commissionRate": 0.15,
  "currencyId": "0a66065d-08bb-476d-b2b5-1d0ce17ac7f8",
  "totalValue": 0,
  "creditLimit": 5000,
  "agreementCode": "CONS-2026-0001",
  "status": "ACTIVE",
  "notes": "Acuerdo de abril",
  "createdBy": "admin@jke.local"
}
```

Notas:

- `societyId` acepta UUID o codigo de sociedad.
- `status` usa el enum `ACTIVE | EXPIRED | TERMINATED | PENDING`.
- `commissionRate` se guarda como decimal. Por ejemplo `0.15` representa 15%.

Filtros disponibles en `GET /`:

- `societyId`
- `societyCode`
- `branchId`
- `partnerId`
- `status`
- `search`
- `page`
- `limit`
- `sortBy`
- `sortOrder`

Ejemplo:

```text
GET /api/outgoing-consignment-agreements?societyId=SOC-001&status=ACTIVE&page=1&limit=20
```

### 2. Entregas de productos en consignacion

Endpoint base:

```text
/api/delivered-consignment-agreements
```

Operaciones:

- `POST /` crea una entrega.
- `GET /` lista entregas.
- `GET /:id` obtiene una entrega.
- `PUT /:id` actualiza una entrega.
- `DELETE /:id` elimina una entrega.

Payload de ejemplo para crear:

```json
{
  "consignmentAgreementId": "0f97b6c1-0b8e-4b67-a9cf-f2321f873cb1",
  "productId": "98664aa0-a5f5-469e-8ff7-061864c6b1e8",
  "branchId": "2a41beaa-f40b-4f0d-9005-657f0ea13f2a",
  "deliveredStock": 12,
  "costPrice": 80,
  "suggestedSalePrice": 120,
  "taxAmount": 0,
  "deliveryDate": "2026-04-02",
  "status": "active",
  "notes": "Primera entrega"
}
```

Notas:

- Si no envias `remainingStock`, la API lo inicializa igual a `deliveredStock`.
- Si no envias `totalCost`, la API calcula `deliveredStock * costPrice`.
- Si no envias `totalValue`, la API calcula `deliveredStock * suggestedSalePrice`.
- `remainingStock` no puede ser mayor que `deliveredStock`.

Filtros disponibles en `GET /`:

- `societyId`
- `societyCode`
- `consignmentAgreementId`
- `productId`
- `branchId`
- `status`
- `deliveryDateFrom`
- `deliveryDateTo`
- `page`
- `limit`
- `sortBy`
- `sortOrder`

Ejemplo:

```text
GET /api/delivered-consignment-agreements?consignmentAgreementId=0f97b6c1-0b8e-4b67-a9cf-f2321f873cb1
```

### 3. Ventas externas de consignacion

Endpoint base:

```text
/api/external-consignment-sales
```

Operaciones:

- `POST /` crea una venta reportada.
- `GET /` lista ventas.
- `GET /:id` obtiene una venta.
- `PUT /:id` actualiza una venta.
- `DELETE /:id` elimina una venta.

Payload de ejemplo para crear:

```json
{
  "deliveredConsignmentId": "9c38f8b2-b67d-4f46-a6a1-51984ed93853",
  "soldQuantity": 3,
  "reportedSaleDate": "2026-04-05",
  "reportedSalePrice": 360,
  "unitSalePrice": 120,
  "totalCommissionAmount": 54,
  "remarks": "Venta reportada por el consignatario",
  "documentReference": "FAC-EXT-1001"
}
```

Notas:

- `netTotal` es opcional. Si no lo envias, la API calcula `reportedSalePrice - totalCommissionAmount`.
- La API valida que `soldQuantity` no exceda el stock disponible de la entrega.
- Al crear, actualizar o eliminar una venta, la API recalcula `remainingStock` y el `status` de la entrega asociada.
- Cuando el stock llega a cero, la entrega pasa a `sold_out`.

Filtros disponibles en `GET /`:

- `deliveredConsignmentId`
- `reportedSaleDateFrom`
- `reportedSaleDateTo`
- `minSalePrice`
- `maxSalePrice`
- `page`
- `limit`
- `sortBy`
- `sortOrder`

Ejemplo:

```text
GET /api/external-consignment-sales?deliveredConsignmentId=9c38f8b2-b67d-4f46-a6a1-51984ed93853
```

### 4. Liquidaciones recibidas de consignacion

Endpoint base:

```text
/api/received-consignment-settlements
```

Operaciones:

- `POST /` crea una liquidacion.
- `GET /` lista liquidaciones.
- `GET /:id` obtiene una liquidacion.
- `PUT /:id` actualiza una liquidacion.
- `DELETE /:id` elimina una liquidacion.

Payload de ejemplo para crear:

```json
{
  "outgoingAgreementId": "0f97b6c1-0b8e-4b67-a9cf-f2321f873cb1",
  "orderPaymentId": "c8f94ea3-2dfa-4c2a-a5b7-4d82578e9e80",
  "settlementDate": "2026-04-08",
  "totalReportedSalesAmount": 360,
  "consigneeCommissionAmount": 54,
  "totalReceivedAmount": 306,
  "status": "PENDING",
  "receiptReference": "LIQ-00045",
  "settlementNotes": "Primera liquidacion",
  "currencyId": "0a66065d-08bb-476d-b2b5-1d0ce17ac7f8",
  "createdBy": "admin@jke.local"
}
```

Notas:

- `status` usa el enum `PENDING | PAID`.
- La API valida que `totalReceivedAmount = totalReportedSalesAmount - consigneeCommissionAmount`.
- La API valida que el acumulado de liquidaciones no exceda lo vendido en las ventas externas del acuerdo.
- Puedes asociar opcionalmente un `orderPaymentId`.

Filtros disponibles en `GET /`:

- `societyId`
- `societyCode`
- `outgoingAgreementId`
- `status`
- `settlementDateFrom`
- `settlementDateTo`
- `page`
- `limit`
- `sortBy`
- `sortOrder`

Ejemplo:

```text
GET /api/received-consignment-settlements?societyCode=SOC-001&status=PENDING
```

## Flujo completo de ejemplo

### Paso 1. Crear acuerdo

```bash
curl -X POST http://localhost:3000/api/outgoing-consignment-agreements \
  -H "Content-Type: application/json" \
  -d '{
    "societyId": "SOC-001",
    "branchId": "2a41beaa-f40b-4f0d-9005-657f0ea13f2a",
    "partnerId": "5dc25791-42c2-4fd0-b331-0ec4434db9b7",
    "startDate": "2026-04-01",
    "endDate": "2026-04-30",
    "commissionRate": 0.15,
    "currencyId": "0a66065d-08bb-476d-b2b5-1d0ce17ac7f8"
  }'
```

### Paso 2. Registrar entrega

```bash
curl -X POST http://localhost:3000/api/delivered-consignment-agreements \
  -H "Content-Type: application/json" \
  -d '{
    "consignmentAgreementId": "AGREEMENT_ID",
    "productId": "PRODUCT_ID",
    "branchId": "BRANCH_ID",
    "deliveredStock": 12,
    "costPrice": 80,
    "suggestedSalePrice": 120
  }'
```

### Paso 3. Registrar venta externa

```bash
curl -X POST http://localhost:3000/api/external-consignment-sales \
  -H "Content-Type: application/json" \
  -d '{
    "deliveredConsignmentId": "DELIVERY_ID",
    "soldQuantity": 3,
    "reportedSaleDate": "2026-04-05",
    "reportedSalePrice": 360,
    "unitSalePrice": 120,
    "totalCommissionAmount": 54
  }'
```

### Paso 4. Registrar liquidacion

```bash
curl -X POST http://localhost:3000/api/received-consignment-settlements \
  -H "Content-Type: application/json" \
  -d '{
    "outgoingAgreementId": "AGREEMENT_ID",
    "settlementDate": "2026-04-08",
    "totalReportedSalesAmount": 360,
    "consigneeCommissionAmount": 54,
    "totalReceivedAmount": 306,
    "status": "PENDING",
    "currencyId": "CURRENCY_ID"
  }'
```

## Recomendaciones de uso

- Crea primero el acuerdo y usa su `id` para las entregas.
- Usa el `id` de la entrega para registrar ventas externas.
- Antes de liquidar, valida que las ventas externas del acuerdo ya esten registradas.
- Usa `societyCode` o `societyId` en los listados segun tu flujo. Ambos son soportados en filtros de consignacion.
- Evita setear manualmente `remainingStock`, `totalCost`, `totalValue` y `netTotal` salvo que tengas un caso controlado.

## Errores comunes

- Intentar vender mas unidades de las entregadas o disponibles.
- Enviar una liquidacion cuyo neto no coincide con ventas menos comision.
- Crear una liquidacion acumulada mayor a las ventas externas realmente registradas.
- Usar un `outgoingAgreementId` en liquidaciones que no tenga entregas o ventas asociadas.
