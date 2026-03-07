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

---
*Nota: Estos endpoints se han diseñado para alimentar componentes de gráficos modernos como Recharts, Tremor o Chart.js en el frontend.*
