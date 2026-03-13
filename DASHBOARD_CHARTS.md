# Guía de Endpoints para Gráficos del Dashboard

Esta guía detalla los endpoints disponibles para alimentar los gráficos analíticos del dashboard de la plataforma, basados en el esquema de Prisma actual.

## 1. Rendimiento de Ventas (Sales Performance)
**Objetivo:** Mostrar la tendencia de ventas por mes en el año actual.
- **Endpoint:** `GET /dashboard/charts/sales-performance`
- **Descripción:** Devuelve un arreglo con la suma del `totalAmount` de las órdenes completadas, agrupadas por mes.
- **Estructura Esperada (Ejemplo):**
  ```json
  [
    { "name": "Jan", "total": 15400.50 },
    { "name": "Feb", "total": 18200.00 },
    { "name": "Mar", "total": 9500.20 }
  ]
  ```

## 2. Reporte de Ingresos por Categoría (Revenue Report)
**Objetivo:** Visualizar qué categorías de productos generan más ingresos.
- **Endpoint:** `GET /dashboard/charts/revenue-by-category`
- **Descripción:** Calcula los ingresos basado en los items vendidos agrupados por su categoría principal.
- **Estructura Esperada (Ejemplo):**
  ```json
  [
    { "category": "Laptops", "revenue": 50000, "percentage": 54.72 },
    { "category": "Accesorios", "revenue": 15000, "percentage": 16.41 }
  ]
  ```

## 3. Top 5 Productos Más Vendidos (Best Sellers)
**Objetivo:** Mostrar los productos de mayor rotación.
- **Endpoint:** `GET /dashboard/charts/top-products`
- **Descripción:** Retorna los productos ordenados por cantidad de ventas.
- **Estructura Esperada (Ejemplo):**
  ```json
  [
    { "id": "uuid-1", "name": "Teclado Mecánico RGB", "soldUnits": 340 },
    { "id": "uuid-2", "name": "Mouse Inalámbrico", "soldUnits": 280 }
  ]
  ```

## 4. Métodos de Pago (Payment Methods)
**Objetivo:** Analizar la preferencia de pago de los clientes.
- **Endpoint:** `GET /dashboard/charts/payment-methods`
- **Descripción:** Agrupa y suma las ventas según el método de pago utilizado.
- **Estructura Esperada (Ejemplo):**
  ```json
  [
    { "method": "EFECTIVO", "value": 8000 },
    { "method": "YAPE", "value": 12000 },
    { "method": "TARJETA", "value": 5500 }
  ]
  ```

## 5. Rendimiento por Sucursal (Branch Performance)
**Objetivo:** Identificar qué tienda o local genera más ingresos en el mes actual.
- **Endpoint:** `GET /dashboard/charts/branch-performance`
- **Descripción:** Agrupa y suma el `totalAmount` de las órdenes completadas por cada sucursal.
- **Estructura Esperada (Ejemplo):**
  ```json
  [
    { "branch": "Sede Principal (Lima)", "revenue": 12500.00 },
    { "branch": "Sede Norte", "revenue": 8300.50 }
  ]
  ```

## 6. Flujo de Caja Mensual (Cash Flow)
**Objetivo:** Comparar la entrada de dinero por ventas versus la salida por compras a proveedores.
- **Endpoint:** `GET /dashboard/charts/cash-flow`
- **Descripción:** Compara la suma de `Order.totalAmount` (Ventas/Ingresos) vs `Purchase.totalAmount` (Compras/Egresos) a lo largo del año.
- **Estructura Esperada (Ejemplo):**
  ```json
  [
    { "period": "Ene", "income": 15000.00, "expense": 12000.50 },
    { "period": "Feb", "income": 18200.00, "expense": 9500.00 }
  ]
  ```


## 7. API de Sucursales (Branch Offices)

Base URL: `GET /api/branch-offices`

### 7.1 Listar Sucursales (Paginado)
- **Endpoint:** `GET /api/branch-offices`
- **Descripción:** Obtiene todas las sucursales con paginación, filtros y búsqueda.
- **Query Parameters:**

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `societyId` | `uuid` | No | Filtrar por ID de sociedad |
| `societyCode` | `string` | No | Filtrar por código de sociedad |
| `search` | `string` | No | Buscar por nombre, código o dirección |
| `isMain` | `boolean` | No | Filtrar por sucursal principal |
| `isActive` | `boolean` | No | Filtrar por estado activo |
| `code` | `string` | No | Filtrar por código interno |
| `createdBy` | `string` | No | Filtrar por usuario creador |
| `createdAtFrom` | `string` | No | Fecha inicio de creación (YYYY-MM-DD) |
| `createdAtTo` | `string` | No | Fecha fin de creación |
| `updatedAtFrom` | `string` | No | Fecha inicio de actualización |
| `updatedAtTo` | `string` | No | Fecha fin de actualización |
| `page` | `number` | No | Página (default: 1) |
| `limit` | `number` | No | Resultados por página (default: 10) |
| `sortBy` | `string` | No | Campo para ordenar (default: `createdAt`) |
| `sortOrder` | `string` | No | `asc` o `desc` (default: `desc`) |

- **Respuesta:**
  ```json
  {
    "data": [
      {
        "id": "uuid",
        "name": "Sede Principal",
        "address": "Av. Lima 123",
        "phone": "01-234567",
        "code": "SP-001",
        "email": "sede@empresa.com",
        "isMain": true,
        "isActive": true,
        "societyId": "uuid",
        "society": { "id": "uuid", "name": "Mi Empresa SAC", ... },
        "createdAt": "01/02/2025 08:30",
        "updatedAt": "15/02/2025 14:20"
      }
    ],
    "meta": {
      "page": 1,
      "limit": 10,
      "total": 3,
      "totalPages": 1,
      "hasNextPage": false,
      "hasPreviousPage": false
    }
  }
  ```

### 7.2 Selector de Sucursales (Select/Dropdown)
- **Endpoint:** `GET /api/branch-offices/select`
- **Query Parameters:** `societyCode` (opcional)
- **Descripción:** Retorna lista simplificada para dropdowns/selects (solo `id`, `name`, `code`).
- **Respuesta:**
  ```json
  [
    { "id": "uuid-1", "name": "Sede Principal", "code": "SP-001" },
    { "id": "uuid-2", "name": "Sede Norte", "code": "SN-002" }
  ]
  ```

### 7.3 Detalle de Sucursal
- **Endpoint:** `GET /api/branch-offices/:id`
- **Respuesta:** Objeto completo de la sucursal con datos de la sociedad.

### 7.4 Crear Sucursal
- **Endpoint:** `POST /api/branch-offices`
- **Body:**
  ```json
  {
    "name": "Sede Sur",
    "address": "Av. Sur 456",
    "phone": "01-987654",
    "code": "SS-003",
    "email": "sur@empresa.com",
    "isMain": false,
    "societyId": "uuid-sociedad",
    "isActive": true,
    "createdBy": "user-id"
  }
  ```

### 7.5 Actualizar Sucursal
- **Endpoint:** `PUT /api/branch-offices/:id`
- **Body:** Mismos campos que crear (todos opcionales).

### 7.6 Eliminar Sucursal (Soft Delete)
- **Endpoint:** `DELETE /api/branch-offices/:id`
- **Descripción:** Marca `isDeleted=true` e `isActive=false`. No borra físicamente.

---

## 8. API de Caja / Turnos (Cash Shifts)

Base URL: `GET /api/cash-shifts`

### Enums de Referencia
| Enum | Valores |
|------|---------|
| `ShiftStatus` | `OPEN`, `CLOSED` |
| `MovementType` | `INCOME`, `EXPENSE` |
| `PaymentMethodOrder` | `CASH`, `CARD`, `YAPE`, `PLIN`, `TRANSFER`, `OTHER` |

### 8.1 Abrir Caja
- **Endpoint:** `POST /api/cash-shifts/open`
- **Descripción:** Abre un nuevo turno de caja. Solo se permite **una caja abierta por usuario/sucursal** (retorna `409` si ya existe una abierta).
- **Body:**
  ```json
  {
    "societyId": "uuid-sociedad",
    "branchId": "uuid-sucursal",
    "userId": "user-id-cajero",
    "initialAmount": 100.00
  }
  ```
- **Respuesta (201):**
  ```json
  {
    "id": "uuid-shift",
    "societyId": "uuid",
    "branchId": "uuid",
    "userId": "user-id",
    "status": "OPEN",
    "openedAt": "2025-02-01T13:00:00.000Z",
    "initialAmount": 100.00,
    "incomeCash": 0,
    "incomeCard": 0,
    "incomeTransfer": 0,
    "expenseCash": 0
  }
  ```
- **Errores:**
  - `409`: `El usuario ya tiene una caja abierta (ID: xxx) en esta sucursal.`

### 8.2 Cerrar Caja
- **Endpoint:** `POST /api/cash-shifts/close/:id`
- **Descripción:** Cierra un turno de caja. Calcula automáticamente los acumulados (ingresos/egresos por método) y la diferencia entre lo reportado y lo calculado por el sistema.
- **Body:**
  ```json
  {
    "finalReportedAmount": 1500.00,
    "userId": "user-id"
  }
  ```
- **Respuesta:**
  ```json
  {
    "id": "uuid-shift",
    "status": "CLOSED",
    "openedAt": "2025-02-01T13:00:00.000Z",
    "closedAt": "2025-02-01T23:00:00.000Z",
    "initialAmount": 100.00,
    "finalReportedAmount": 1500.00,
    "finalSystemAmount": 1480.00,
    "difference": 20.00,
    "incomeCash": 1200.00,
    "incomeCard": 300.00,
    "incomeTransfer": 150.00,
    "expenseCash": 270.00
  }
  ```
- **Cálculos automáticos:**
  - `finalSystemAmount` = `initialAmount` + `incomeCash` - `expenseCash`
  - `difference` = `finalReportedAmount` - `finalSystemAmount`
  - Valores positivos de `difference` = sobrante, negativos = faltante
- **Errores:**
  - `400`: `Esta caja ya está cerrada.`
  - `400`: `Caja no encontrada.`

### 8.3 Listar Turnos (Paginado)
- **Endpoint:** `GET /api/cash-shifts`
- **Query Parameters:**

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `societyId` | `uuid` | Filtrar por sociedad |
| `branchId` | `uuid` | Filtrar por sucursal |
| `userId` | `string` | Filtrar por cajero |
| `status` | `OPEN/CLOSED` | Filtrar por estado |
| `dateFrom` | `string` | Fecha inicio (YYYY-MM-DD) |
| `dateTo` | `string` | Fecha fin |
| `page` | `number` | Página (default: 1) |
| `limit` | `number` | Resultados por página (default: 10) |
| `sortBy` | `string` | Campo de orden (default: `createdAt`) |
| `sortOrder` | `string` | `asc/desc` (default: `desc`) |

- **Respuesta:**
  ```json
  {
    "data": [
      {
        "id": "uuid-shift",
        "status": "OPEN",
        "userId": "user-id",
        "openedAt": "2025-02-01T13:00:00.000Z",
        "initialAmount": 100.00,
        "branch": { "name": "Sede Principal" },
        "incomeCash": 800.00,
        "incomeCard": 200.00,
        "incomeTransfer": 100.00,
        "expenseCash": 50.00
      }
    ],
    "meta": { "page": 1, "limit": 10, "total": 5, "totalPages": 1 }
  }
  ```

### 8.4 Detalle de Turno
- **Endpoint:** `GET /api/cash-shifts/:id`
- **Descripción:** Retorna el turno con **todos sus movimientos** (ventas, gastos manuales) ordenados por fecha.
- **Respuesta:**
  ```json
  {
    "id": "uuid-shift",
    "status": "OPEN",
    "initialAmount": 100.00,
    "branch": { "name": "Sede Principal" },
    "movements": [
      {
        "id": "uuid-mov",
        "type": "INCOME",
        "amount": 250.00,
        "paymentMethod": "CASH",
        "description": "Venta (Pago uuid-pago)",
        "createdAt": "2025-02-01T15:30:00.000Z",
        "orderPayment": {
          "id": "uuid-pago",
          "amount": 250.00,
          "paymentMethod": "CASH"
        }
      },
      {
        "id": "uuid-mov-2",
        "type": "EXPENSE",
        "amount": 30.00,
        "paymentMethod": "CASH",
        "description": "Pago de limpieza",
        "createdAt": "2025-02-01T16:00:00.000Z",
        "orderPayment": null
      }
    ]
  }
  ```

### 8.5 Agregar Movimiento Manual
- **Endpoint:** `POST /api/cash-shifts/movements`
- **Descripción:** Registra un ingreso o egreso manual en una caja abierta. Solo funciona si el turno está `OPEN`.
- **Body:**
  ```json
  {
    "shiftId": "uuid-shift",
    "type": "EXPENSE",
    "amount": 50.00,
    "description": "Pago de limpieza",
    "currencyId": "uuid-moneda",
    "paymentMethod": "CASH",
    "userId": "user-id"
  }
  ```
- **Respuesta (201):**
  ```json
  {
    "id": "uuid-movement",
    "shiftId": "uuid-shift",
    "type": "EXPENSE",
    "amount": 50.00,
    "paymentMethod": "CASH",
    "description": "Pago de limpieza",
    "createdAt": "2025-02-01T16:00:00.000Z"
  }
  ```
- **Errores:**
  - `500`: `Caja cerrada o no encontrada.`

### 8.6 Registro Automático de Pagos (Interno)
> **Nota:** Este método (`registerPaymentMovement`) es utilizado internamente por `OrderPaymentService` cuando se registra un pago. No es un endpoint público. Automáticamente crea un movimiento `INCOME` en la caja abierta del usuario que procesa el pago.

---

## 9. API de Movimientos entre Sucursales (Internal Transfers)

Base URL: `/api/branch-movements`

### 9.1 Listar Movimientos (Paginado)
- **Endpoint:** `GET /api/branch-movements`
- **Descripción:** Obtiene el historial de traslados entre sucursales.
- **Query Parameters:**

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `societyId` | `uuid` | Filtrar por ID de sociedad |
| `societyCode` | `string` | Filtrar por código de sociedad |
| `originBranchId` | `uuid` | Sucursal de salida |
| `destinationBranchId` | `uuid` | Sucursal de destino |
| `productId` | `uuid` | Producto trasladado |
| `status` | `enum` | `PENDING`, `COMPLETED`, `CANCELLED` |
| `dateFrom` | `string` | Fecha inicio (YYYY-MM-DD) |
| `dateTo` | `string` | Fecha fin |
| `page`, `limit` | `number` | Paginación |

### 9.2 Crear Traslado (Paso 1: Reserva)
- **Endpoint:** `POST /api/branch-movements`
- **Descripción:** Inicia un traslado. **Reserva** el stock en la sucursal de origen (lo quita de `availableStock` y lo pone en `reservedStock`). El estado inicial es `PENDING`.
- **Body:**
  ```json
  {
    "originBranchId": "uuid",
    "destinationBranchId": "uuid",
    "productId": "uuid",
    "quantityMoved": 10,
    "notes": "Traslado semanal",
    "referenceCode": "GUIA-001",
    "createdBy": "user-uuid"
  }
  ```

### 9.3 Confirmar Recepción (Paso 2: Completar)
- **Endpoint:** `PUT /api/branch-movements/:id`
- **Descripción:** Confirma la llegada de los productos a la sucursal de destino.
- **Acción:** Resta definitivamente el stock de la sucursal de origen y lo suma a la de destino.
- **Body:**
  ```json
  {
    "status": "COMPLETED"
  }
  ```

### 9.4 Cancelar Traslado
- **Endpoint:** `PUT /api/branch-movements/:id`
- **Descripción:** Revierte el traslado mientras esté `PENDING`. Devuelve el stock reservado a `availableStock` en el origen.
- **Body:**
  ```json
  {
    "status": "CANCELLED",
    "cancellationReason": "Error en pedido"
  }
  ```

### 9.5 Traslados en Bloque (Bulk Transfer)
- **Endpoint:** `POST /api/branch-movements/bulk`
- **Descripción:** Permite mover varios productos a la vez entre las mismas sucursales. La operación es **atómica** (se procesan todos o ninguno).
- **Body:**
  ```json
  {
    "originBranchId": "uuid",
    "destinationBranchId": "uuid",
    "items": [
      { "productId": "uuid-1", "quantityMoved": 5, "notes": "Item 1" },
      { "productId": "uuid-2", "quantityMoved": 15 }
    ],
    "referenceCode": "GUIA-BULK-001",
    "createdBy": "user-uuid"
  }
  ```
- **Respuesta:**
  ```json
  {
    "batchId": "BATCH-XXXXX",
    "count": 2,
    "movements": [ ... ]
  }
  ```

*Nota: Estos endpoints se han diseñado para alimentar componentes de gráficos modernos como Recharts, Tremor o Chart.js en el frontend.*

 ## 10. API de Inventario por Sucursal (Branch Office Products)
 
 Base URL: `/api/branch-office-products`
 
 ### 10.1 Listar Inventario (Paginado)
 - **Endpoint:** `GET /api/branch-office-products`
 - **Descripción:** Obtiene el stock disponible y físico de productos por sucursal.
 - **Query Parameters:**
 
 | Parámetro | Tipo | Descripción |
 |-----------|------|-------------|
 | `societyId` | `uuid` | Filtrar por ID de sociedad |
 | `societyCode` | `string` | Filtrar por código de sociedad |
 | `branchOfficeId` | `uuid` | Filtrar por sucursal específica |
 | `productId` | `uuid` | Filtrar por un producto específico |
 | `productName` | `string` | Buscar por nombre de producto (parcial) |
 | `location` | `string` | Filtrar por ubicación en almacén |
 | `lowStock` | `boolean` | Filtrar productos con stock bajo |
 | `isActive` | `boolean` | Filtrar por estado activo |
 | `stockFrom` | `number` | Stock físico mínimo |
 | `stockTo` | `number` | Stock físico máximo |
 | `page`, `limit` | `number` | Paginación |
 
 - **Respuesta:**
   ```json
   {
     "data": [
       {
         "id": "uuid",
         "productId": "uuid",
         "branchOfficeId": "uuid",
         "availableStock": 45,
         "physicalStock": 50,
         "reservedStock": 5,
         "location": "A-01-05",
         "product": { "name": "Producto A", "code": "PROD-001", ... },
         "branchOffice": { "name": "Sede Principal", ... }
       }
     ]
   }
   ```
 
 ### 10.2 Detalle de Inventario
 - **Endpoint:** `GET /api/branch-office-products/:id`
 - **Respuesta:** Incluye el detalle del producto y la sucursal.
 
 ### 10.3 Crear Registro de Stock
 - **Endpoint:** `POST /api/branch-office-products`
 - **Body:** `productId`, `branchOfficeId`, `physicalStock`, `availableStock`, etc.
 
 ### 10.4 Actualizar Stock/Ubicación
 - **Endpoint:** `PUT /api/branch-office-products/:id`
 - **Body:** Campos opcionales para actualizar stock o ubicación.
 
 ### 10.5 Eliminar Registro (Hard Delete)
 - **Endpoint:** `DELETE /api/branch-office-products/:id`
 
 ---
 *Nota: Estos endpoints se han diseñado para alimentar componentes de gráficos modernos como Recharts, Tremor o Chart.js en el frontend.*
