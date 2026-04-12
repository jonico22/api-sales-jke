# Guia de APIs de Dashboard y Analytics

Esta guia define los contratos actuales para frontend durante la migracion por etapas.

## Guia visual para frontend

### Libreria recomendada por vista

- `Dashboard`: usar `Tremor`
- `Analytics`: usar `ECharts`

### Regla de uso

- usar `Tremor` para cards, metricas resumidas, sparklines, donuts pequeños, barras compactas y bloques de lectura rapida;
- usar `ECharts` para series historicas, comparativos por dia/semana/mes, cash flow detallado, distribuciones grandes y vistas exploratorias;
- no mezclar componentes pesados de `ECharts` en el dashboard principal si existe una version compacta suficiente en `Tremor`.

### Objetivo visual

El frontend debe verse moderno, consistente y alineado con la identidad actual de la aplicacion.

Lineamientos:
- reutilizar la paleta principal de la aplicacion para estados y series;
- mantener una sola escala de colores por dominio:
  - ventas: color primario de la marca
  - ingresos positivos: verde de la app
  - egresos: rojo o color de alerta de la app
  - advertencias o low stock: amarillo/naranja de la app
- evitar colores genericos que no existan ya en el sistema visual;
- conservar el mismo radio, sombra, spacing y tipografia de las cards actuales;
- priorizar fondos limpios y contraste alto;
- evitar dashboards saturados de colores o efectos.

### Distribucion recomendada

- `Dashboard`:
  - cards KPI
  - micrograficos
  - comparaciones compactas
  - alertas cortas
- `Analytics`:
  - graficos amplios
  - filtros por rango
  - comparativos
  - tablas de apoyo

### Mapeo visual recomendado

| Vista | Libreria | Tipo de componente |
|-------|----------|--------------------|
| Dashboard | Tremor | KPI cards |
| Dashboard | Tremor | Spark area / line |
| Dashboard | Tremor | Donut compacto de metodos de pago |
| Dashboard | Tremor | Barras compactas ingreso vs egreso |
| Dashboard | Tremor | Lista corta de top productos / sucursales |
| Analytics | ECharts | Line / area de ventas por periodo |
| Analytics | ECharts | Barra comparativa por sucursal |
| Analytics | ECharts | Donut o rose chart de pagos/categorias |
| Analytics | ECharts | Grafico combinado income vs expense |
| Analytics | ECharts | Graficos con filtros y comparacion de periodos |

## Etapa 1: Dashboard APIs

El dashboard queda orientado a widgets compactos, micrograficos y alertas operativas. Debe poder dibujar 4, 5 o 6 bloques sin depender todavia del modulo `analytics`.

### 1. `GET /dashboard/stats`
Bloques pequeños con KPIs dinamicos.

Query params:
- `societyCode` o `societyId` requerido
- `branchId` opcional

Respuesta:
```json
{
  "salesToday": 0,
  "salesThisWeek": 0,
  "salesThisMonth": 0,
  "completedOrdersToday": 0,
  "completedOrdersThisWeek": 0,
  "completedOrdersThisMonth": 0,
  "averageTicketToday": 0,
  "averageTicketThisWeek": 0,
  "averageTicketThisMonth": 0
}
```

Uso recomendado:
- cards superiores
- 4 a 6 bloques pequeños

### 2. `GET /dashboard/overview`
Endpoint agregado para graficos compactos del dashboard.

Query params:
- `societyCode` o `societyId` requerido
- `branchId` opcional
- `dateFrom` opcional `YYYY-MM-DD`
- `dateTo` opcional `YYYY-MM-DD`
- `granularity` opcional `day | week | month`
- `limit` opcional

Comportamiento del rango:
- `day` en dashboard se interpreta como una vista intradia y la API responde por horas (`00:00` a `23:00`) tomando `dateTo` como dia de referencia
- `week` y `month` muestran el periodo actual en formato diario cuando no llega un rango completo explicito
- si el cliente envia `dateFrom` y `dateTo`, la API respeta ese rango
- este comportamiento aplica a `salesTrend` y `cashFlowMini`
- para vistas historicas completas usar `GET /analytics/*`

Respuesta:
```json
{
  "salesTrend": [
    { "label": "2026-04-01", "value": 0 }
  ],
  "paymentMethods": [
    { "method": "CASH", "amount": 0, "percentage": 0, "transactions": 0 }
  ],
  "cashFlowMini": [
    { "label": "2026-04-01", "income": 0, "expense": 0, "net": 0 }
  ],
  "topProducts": [
    {
      "productId": "uuid",
      "productName": "Producto",
      "category": "Categoria",
      "soldUnits": 0,
      "revenue": 0,
      "stockRemaining": 0
    }
  ],
  "topBranches": [
    {
      "branchId": "uuid",
      "branch": "Sucursal",
      "revenue": 0,
      "orders": 0,
      "averageTicket": 0
    }
  ]
}
```

Uso recomendado:
- 2 graficos medianos
- 2 graficos chicos
- mini tendencia de ventas
- metodos de pago compactos
- comparacion compacta ingreso vs egreso
- top productos
- top sucursales

### 3. `GET /dashboard/alerts/low-stock`
Bloque final operativo.

Query params:
- `societyCode` o `societyId` requerido
- `branchId` opcional
- `limit` opcional

Respuesta:
```json
{
  "count": 2,
  "items": [
    {
      "productId": "uuid",
      "productName": "Producto",
      "branchId": "uuid",
      "branchName": "Sucursal",
      "availableStock": 1,
      "minStock": 5,
      "status": "warning"
    }
  ]
}
```

Uso recomendado:
- lista corta
- panel de atencion inmediata

### 4. `GET /dashboard/catalog-summary`
Bloque secundario para metricas lentas o acumuladas.

Query params:
- `societyCode` o `societyId` requerido
- `branchId` opcional

Respuesta:
```json
{
  "totalStockValue": 0,
  "lowStockItems": 0,
  "newProductsThisMonth": 0,
  "activeProducts": 0
}
```

Uso recomendado:
- modulo secundario de inventario/catalogo
- no usar como KPI principal del dashboard

## Mapeo de widgets del dashboard

| Widget | Endpoint recomendado |
|--------|----------------------|
| Bloque pequeño 1 | `GET /dashboard/stats` |
| Bloque pequeño 2 | `GET /dashboard/stats` |
| Bloque pequeño 3 | `GET /dashboard/stats` |
| Bloque pequeño 4 | `GET /dashboard/stats` |
| Bloque pequeño 5 opcional | `GET /dashboard/stats` |
| Bloque pequeño 6 opcional | `GET /dashboard/stats` |
| Grafico mediano 1 | `GET /dashboard/overview` |
| Grafico mediano 2 | `GET /dashboard/overview` |
| Grafico chico 1 | `GET /dashboard/overview` |
| Grafico chico 2 | `GET /dashboard/overview` |
| Bloque final operativo | `GET /dashboard/alerts/low-stock` |
| Bloque secundario de catalogo | `GET /dashboard/catalog-summary` |

## Etapa 2: Analytics APIs

El modulo `analytics` concentrara las vistas detalladas y filtrables. Estas rutas son las oficiales para la pantalla de analitica y para migrar progresivamente los charts legacy.

### Filtros comunes

Query params soportados por `GET /analytics/*`:
- `societyCode` o `societyId` requerido
- `branchId` opcional
- `dateFrom` opcional `YYYY-MM-DD`
- `dateTo` opcional `YYYY-MM-DD`
- `granularity` opcional `day | week | month`
- `comparePrevious` opcional `true | false`
- `limit` opcional

Defaults:
- si no llega rango, usa ultimos 30 dias
- `granularity` se resuelve automaticamente segun el rango
- timezone oficial: `America/Lima`

### 1. `GET /analytics/summary`
```json
{
  "range": {
    "dateFrom": "2026-04-01",
    "dateTo": "2026-04-30",
    "granularity": "day"
  },
  "totals": {
    "sales": 0,
    "expenses": 0,
    "grossProfitEstimate": 0,
    "orders": 0,
    "averageTicket": 0,
    "unitsSold": 0
  },
  "comparison": {
    "salesPct": 0,
    "ordersPct": 0,
    "averageTicketPct": 0
  }
}
```

### 2. `GET /analytics/sales/trend`
```json
{
  "range": {
    "dateFrom": "2026-04-01",
    "dateTo": "2026-04-30",
    "granularity": "week"
  },
  "series": [
    {
      "label": "2026-04-07",
      "sales": 0,
      "orders": 0,
      "averageTicket": 0
    }
  ],
  "previousPeriod": [
    { "label": "2026-03-10", "sales": 0 }
  ]
}
```

### 3. `GET /analytics/cash-flow/trend`
```json
{
  "range": {
    "dateFrom": "2026-04-01",
    "dateTo": "2026-04-30",
    "granularity": "week"
  },
  "series": [
    { "label": "2026-04-07", "income": 0, "expense": 0, "net": 0 }
  ]
}
```

### 4. `GET /analytics/sales/by-category`
```json
{
  "range": {
    "dateFrom": "2026-04-01",
    "dateTo": "2026-04-30"
  },
  "items": [
    {
      "categoryId": "uuid",
      "category": "Categoria",
      "revenue": 0,
      "unitsSold": 0,
      "percentage": 0
    }
  ]
}
```

### 5. `GET /analytics/sales/by-branch`
```json
{
  "range": {
    "dateFrom": "2026-04-01",
    "dateTo": "2026-04-30"
  },
  "items": [
    {
      "branchId": "uuid",
      "branch": "Sucursal",
      "revenue": 0,
      "orders": 0,
      "averageTicket": 0
    }
  ]
}
```

### 6. `GET /analytics/payments/distribution`
```json
{
  "range": {
    "dateFrom": "2026-04-01",
    "dateTo": "2026-04-30"
  },
  "items": [
    {
      "method": "CASH",
      "amount": 0,
      "percentage": 0,
      "transactions": 0
    }
  ]
}
```

### 7. `GET /analytics/products/top`
```json
{
  "range": {
    "dateFrom": "2026-04-01",
    "dateTo": "2026-04-30"
  },
  "items": [
    {
      "productId": "uuid",
      "productName": "Producto",
      "category": "Categoria",
      "soldUnits": 0,
      "revenue": 0,
      "stockRemaining": 0
    }
  ]
}
```

### 8. `GET /analytics/inventory/low-stock`
```json
{
  "items": [
    {
      "productId": "uuid",
      "productName": "Producto",
      "category": "Categoria",
      "branchId": "uuid",
      "branchName": "Sucursal",
      "availableStock": 0,
      "physicalStock": 0,
      "minStock": 0,
      "gap": 0
    }
  ]
}
```
