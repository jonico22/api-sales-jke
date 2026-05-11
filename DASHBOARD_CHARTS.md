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
    "current": {
      "dateFrom": "2026-04-01",
      "dateTo": "2026-04-30",
      "granularity": "day"
    },
    "previous": {
      "dateFrom": "2026-03-01",
      "dateTo": "2026-03-31",
      "granularity": "day"
    }
  },
  "totals": {
    "sales": 0,
    "expenses": 0,
    "grossProfitEstimate": 0,
    "orders": 0,
    "averageTicket": 0,
    "unitsSold": 0
  },
  "previousTotals": {
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
  },
  "comparisonByMetric": {
    "sales": {
      "current": 0,
      "previous": 0,
      "delta": 0,
      "deltaPct": 0
    }
  }
}
```

Notas:
- `totals` mantiene el periodo actual.
- `previousTotals` expone el bloque anterior completo para comparacion.
- `comparison` conserva los porcentajes historicos para compatibilidad.
- `comparisonByMetric` es el contrato recomendado para cards comparativas en analytics.

Uso recomendado en frontend:
- usar `comparisonByMetric.sales`, `comparisonByMetric.orders` y `comparisonByMetric.averageTicket` como cards principales de comparacion;
- usar `comparisonByMetric.expenses`, `comparisonByMetric.grossProfitEstimate` y `comparisonByMetric.unitsSold` como cards secundarias o panel de detalle;
- evitar renderizar `totals` y `previousTotals` como dos bloques separados si ya se muestra `comparisonByMetric`, porque eso duplica informacion;
- si `comparePrevious=false`, tratar `previous`, `previousTotals`, `delta` y `deltaPct` como `null` y mostrar solo el valor actual.

Ejemplo de mapeo para cards:
```json
[
  {
    "title": "Ventas",
    "value": "comparisonByMetric.sales.current",
    "previous": "comparisonByMetric.sales.previous",
    "delta": "comparisonByMetric.sales.delta",
    "deltaPct": "comparisonByMetric.sales.deltaPct"
  },
  {
    "title": "Ordenes",
    "value": "comparisonByMetric.orders.current",
    "previous": "comparisonByMetric.orders.previous",
    "delta": "comparisonByMetric.orders.delta",
    "deltaPct": "comparisonByMetric.orders.deltaPct"
  },
  {
    "title": "Ticket promedio",
    "value": "comparisonByMetric.averageTicket.current",
    "previous": "comparisonByMetric.averageTicket.previous",
    "delta": "comparisonByMetric.averageTicket.delta",
    "deltaPct": "comparisonByMetric.averageTicket.deltaPct"
  }
]
```

### 2. `GET /analytics/sales/trend`
```json
{
  "range": {
    "current": {
      "dateFrom": "2026-04-01",
      "dateTo": "2026-04-30",
      "granularity": "week"
    },
    "previous": {
      "dateFrom": "2026-03-01",
      "dateTo": "2026-03-31",
      "granularity": "week"
    }
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
  ],
  "previousPeriodAligned": [
    {
      "label": "2026-04-07",
      "sourceLabel": "2026-03-31",
      "sales": 0
    }
  ]
}
```

Notas:
- `previousPeriod` representa el bloque historico anterior completo.
- `previousPeriodAligned` alinea la comparacion al eje visible del grafico usando el periodo inmediatamente anterior a cada punto visible.
- para graficos de barras o lineas con `comparePrevious=true`, frontend debe preferir `previousPeriodAligned`.

Uso recomendado en frontend:
- usar `series` como serie principal visible;
- usar `previousPeriodAligned` como segunda serie cuando el objetivo sea comparar sobre el mismo eje del grafico;
- usar `previousPeriod` solo para tooltips avanzados, tablas auxiliares o vistas donde importe mostrar el rango historico real sin alinear;
- para comparacion visual principal, no mezclar `summary` con una segunda serie inventada en frontend: la comparacion del grafico debe salir de este endpoint;
- ejemplo mensual: si el rango visible es `2026-03` a `2026-04`, la serie alineada sera `2026-03 <- 2026-02` y `2026-04 <- 2026-03`.

### 3. `GET /analytics/cash-flow/trend`
```json
{
  "range": {
    "current": {
      "dateFrom": "2026-04-01",
      "dateTo": "2026-04-30",
      "granularity": "week"
    },
    "previous": {
      "dateFrom": "2026-03-01",
      "dateTo": "2026-03-31",
      "granularity": "week"
    }
  },
  "series": [
    { "label": "2026-04-07", "income": 0, "expense": 0, "net": 0 }
  ],
  "previousPeriod": [
    { "label": "2026-03-07", "income": 0, "expense": 0, "net": 0 }
  ],
  "previousPeriodAligned": [
    {
      "label": "2026-04-07",
      "sourceLabel": "2026-03-07",
      "income": 0,
      "expense": 0,
      "net": 0
    }
  ]
}
```

Notas:
- usar `series` para el periodo actual;
- usar `previousPeriodAligned` como segunda serie en graficos comparativos de cash flow;
- `previousPeriod` queda disponible para tooltips o tablas historicas;
- ejemplo mensual: si el rango visible es `2026-03` a `2026-04`, la serie alineada sera `2026-03 <- 2026-02` y `2026-04 <- 2026-03`.

### 4. `GET /analytics/sales/by-category`
```json
{
  "range": {
    "current": {
      "dateFrom": "2026-04-01",
      "dateTo": "2026-04-30",
      "granularity": "month"
    },
    "previous": {
      "dateFrom": "2026-03-01",
      "dateTo": "2026-03-31",
      "granularity": "month"
    }
  },
  "items": [
    {
      "categoryId": "uuid",
      "category": "Categoria",
      "revenue": 0,
      "unitsSold": 0,
      "percentage": 0,
      "previous": {
        "revenue": 0,
        "unitsSold": 0,
        "percentage": 0
      },
      "comparison": {
        "revenue": {
          "current": 0,
          "previous": 0,
          "delta": 0,
          "deltaPct": 0
        },
        "unitsSold": {
          "current": 0,
          "previous": 0,
          "delta": 0,
          "deltaPct": 0
        }
      }
    }
  ]
}
```

Uso recomendado en frontend:
- barra 1: `revenue`
- barra 2: `previous.revenue`
- label auxiliar: `comparison.revenue.deltaPct`
- para un grafico de barras comparativas, usar una categoria por item y dos series: `Actual` y `Anterior`;
- si el espacio es reducido, ordenar por `revenue` actual y mostrar la variacion porcentual en tooltip o badge;
- si `previous` es `null`, renderizar solo la barra actual.

### 5. `GET /analytics/sales/by-branch`
```json
{
  "range": {
    "current": {
      "dateFrom": "2026-04-01",
      "dateTo": "2026-04-30",
      "granularity": "month"
    },
    "previous": {
      "dateFrom": "2026-03-01",
      "dateTo": "2026-03-31",
      "granularity": "month"
    }
  },
  "items": [
    {
      "branchId": "uuid",
      "branch": "Sucursal",
      "revenue": 0,
      "orders": 0,
      "averageTicket": 0,
      "previous": {
        "revenue": 0,
        "orders": 0,
        "averageTicket": 0
      },
      "comparison": {
        "revenue": {
          "current": 0,
          "previous": 0,
          "delta": 0,
          "deltaPct": 0
        }
      }
    }
  ]
}
```

Uso recomendado en frontend:
- serie principal: `revenue`
- serie comparativa: `previous.revenue`
- metrica auxiliar en tooltip: `comparison.orders.deltaPct` o `comparison.averageTicket.deltaPct`
- recomendado para barras horizontales o columnas agrupadas por sucursal.

### 6. `GET /analytics/payments/distribution`
```json
{
  "range": {
    "current": {
      "dateFrom": "2026-04-01",
      "dateTo": "2026-04-30",
      "granularity": "month"
    },
    "previous": {
      "dateFrom": "2026-03-01",
      "dateTo": "2026-03-31",
      "granularity": "month"
    }
  },
  "items": [
    {
      "method": "CASH",
      "amount": 0,
      "percentage": 0,
      "transactions": 0,
      "previous": {
        "amount": 0,
        "percentage": 0,
        "transactions": 0
      },
      "comparison": {
        "amount": {
          "current": 0,
          "previous": 0,
          "delta": 0,
          "deltaPct": 0
        }
      }
    }
  ]
}
```

Uso recomendado en frontend:
- si quieres comparacion clara, preferir barras agrupadas por metodo en vez de donut;
- serie principal: `amount`
- serie comparativa: `previous.amount`
- usar `percentage` y `previous.percentage` solo como apoyo visual o tooltip;
- mostrar `comparison.amount.deltaPct` como etiqueta de variacion por metodo.

### 7. `GET /analytics/products/top`
```json
{
  "range": {
    "current": {
      "dateFrom": "2026-04-01",
      "dateTo": "2026-04-30",
      "granularity": "month"
    },
    "previous": {
      "dateFrom": "2026-03-01",
      "dateTo": "2026-03-31",
      "granularity": "month"
    }
  },
  "items": [
    {
      "productId": "uuid",
      "productName": "Producto",
      "category": "Categoria",
      "soldUnits": 0,
      "revenue": 0,
      "stockRemaining": 0,
      "previous": {
        "soldUnits": 0,
        "revenue": 0
      },
      "comparison": {
        "soldUnits": {
          "current": 0,
          "previous": 0,
          "delta": 0,
          "deltaPct": 0
        },
        "revenue": {
          "current": 0,
          "previous": 0,
          "delta": 0,
          "deltaPct": 0
        }
      }
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

Uso recomendado:
- tabla operativa o lista de atencion inmediata;
- no usar este endpoint para historico comparativo, porque representa el estado actual.
- esta ruta se mantiene y no debe ser reemplazada por la ruta `trend`;
- usar `GET /analytics/inventory/low-stock` para el estado actual;
- usar `GET /analytics/inventory/low-stock/trend` para el grafico historico/comparativo.

### 9. `GET /analytics/inventory/low-stock/trend`
```json
{
  "range": {
    "current": {
      "dateFrom": "2026-03-01",
      "dateTo": "2026-04-30",
      "granularity": "month"
    },
    "previous": {
      "dateFrom": "2026-01-01",
      "dateTo": "2026-02-28",
      "granularity": "month"
    }
  },
  "series": [
    {
      "label": "2026-03",
      "lowStockCount": 12,
      "criticalCount": 4
    }
  ],
  "previousPeriod": [
    {
      "label": "2026-02",
      "lowStockCount": 10,
      "criticalCount": 3
    }
  ],
  "previousPeriodAligned": [
    {
      "label": "2026-03",
      "sourceLabel": "2026-02",
      "lowStockCount": 10,
      "criticalCount": 3
    }
  ]
}
```

Notas:
- `lowStockCount` cuenta productos cuyo stock historico estimado al cierre del bucket queda en o por debajo del minimo configurado;
- `criticalCount` cuenta productos con stock en `0` o negativo al cierre del bucket;
- la serie historica se apoya en `InventoryTransaction` como snapshot de stock por fecha;
- cuando un producto no tiene movimientos historicos, el sistema toma el stock actual como snapshot base disponible.

Uso recomendado en frontend:
- grafico principal: barras o lineas con `series.lowStockCount`;
- segunda serie comparativa: `previousPeriodAligned.lowStockCount`;
- serie secundaria opcional: `criticalCount`;
- combinar este endpoint con `GET /analytics/inventory/low-stock` si se quiere drilldown desde el grafico a la lista actual.

## Recomendacion de composicion para la pantalla de Analytics

Objetivo:
- que `dashboard` siga siendo compacto y operativo;
- que `analytics` sea comparativo, historico y grafico.

Distribucion sugerida:
- fila 1:
  - card `Ventas` desde `GET /analytics/summary`
  - card `Ordenes` desde `GET /analytics/summary`
  - card `Ticket promedio` desde `GET /analytics/summary`
- fila 2:
  - grafico principal `Ventas por periodo` desde `GET /analytics/sales/trend?comparePrevious=true`
- fila 3:
  - grafico `Cash flow` desde `GET /analytics/cash-flow/trend?comparePrevious=true`
  - grafico `Ventas por sucursal` desde `GET /analytics/sales/by-branch?comparePrevious=true`
- fila 4:
  - grafico `Ventas por categoria` desde `GET /analytics/sales/by-category?comparePrevious=true`
  - grafico `Distribucion de pagos` desde `GET /analytics/payments/distribution?comparePrevious=true`
- fila 5 opcional:
  - tabla o barras `Top productos` desde `GET /analytics/products/top?comparePrevious=true`
  - grafico `Tendencia low stock` desde `GET /analytics/inventory/low-stock/trend?comparePrevious=true`
  - tabla `Low stock actual` desde `GET /analytics/inventory/low-stock`

## Regla rapida para frontend

- si necesitas cards comparativas: usar `GET /analytics/summary`;
- si necesitas lineas, barras o areas con comparacion entre periodos: usar `GET /analytics/*` con `comparePrevious=true`;
- si necesitas vista compacta de dashboard: usar `GET /dashboard/stats` y `GET /dashboard/overview`;
- no usar `GET /analytics/summary` para construir una grafica historica.

## Handoff Corto Para Frontend

- `Ventas por categoria`: endpoint `GET /analytics/sales/by-category?comparePrevious=true`
- `Ventas por categoria`: eje/categorias `item.category`
- `Ventas por categoria`: serie `Actual` `item.revenue`
- `Ventas por categoria`: serie `Anterior` `item.previous?.revenue ?? 0`
- `Ventas por categoria`: badge o tooltip `item.comparison.revenue.deltaPct`

- `Distribucion de pagos`: endpoint `GET /analytics/payments/distribution?comparePrevious=true`
- `Distribucion de pagos`: eje/categorias `item.method`
- `Distribucion de pagos`: serie `Actual` `item.amount`
- `Distribucion de pagos`: serie `Anterior` `item.previous?.amount ?? 0`
- `Distribucion de pagos`: badge o tooltip `item.comparison.amount.deltaPct`

- `Ventas por sucursal`: endpoint `GET /analytics/sales/by-branch?comparePrevious=true`
- `Ventas por sucursal`: eje/categorias `item.branch`
- `Ventas por sucursal`: serie `Actual` `item.revenue`
- `Ventas por sucursal`: serie `Anterior` `item.previous?.revenue ?? 0`
- `Ventas por sucursal`: badge o tooltip `item.comparison.revenue.deltaPct`

- `Tendencia low stock`: endpoint `GET /analytics/inventory/low-stock/trend?comparePrevious=true`
- `Tendencia low stock`: eje/categorias `point.label`
- `Tendencia low stock`: serie `Actual` `point.lowStockCount`
- `Tendencia low stock`: serie `Anterior` `previousPeriodAligned[index]?.lowStockCount ?? 0`
- `Tendencia low stock`: serie opcional `Critico` `point.criticalCount`

## Decision Rapida Para Frontend En Low Stock

- `GET /analytics/inventory/low-stock`: usar para tabla, lista o panel operativo del estado actual
- `GET /analytics/inventory/low-stock/trend`: usar para grafico historico o comparativo
- no reemplazar la ruta actual `low-stock`;
- ambas rutas se complementan y cumplen objetivos distintos.
