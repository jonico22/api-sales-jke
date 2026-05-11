# Contexto Del Proyecto

## Resumen

`api-sales-jke` es un backend monolítico en Node.js + TypeScript + Express + Prisma orientado a ventas, inventario, compras, caja, consignaciones, archivos y dashboard para un modelo multiempresa basado en `Society`.

El proyecto sigue teniendo bastante lógica de negocio en servicios grandes, pero ya muestra una mejora clara respecto al estado previo: hoy existe una base real de pruebas unitarias, se introdujeron errores tipados, se extrajo parte de la lógica de `order` e `inventory` a helpers/support files y varios controladores fueron normalizados.

## Stack principal

- Node.js + TypeScript
- Express 5
- Prisma ORM + PostgreSQL
- Redis
- BullMQ
- Pino + New Relic
- Zod
- Cloudflare R2 / S3 compatible
- Vitest + cobertura V8

## Estado actual verificado

Verificado localmente el 2026-04-08:

- `npm run build` OK
- `npm test` OK
- 21 archivos de prueba passing
- 3 suites de integración preparadas y skipped por default
- 119 pruebas passing
- 8 pruebas de integración skipped por default
- Existe infraestructura de testing documentada en `TESTING.md`
- Hay cambios locales amplios en curso, todavía sin confirmar en git

## Estructura actual

### Entrada y configuración

- `src/index.ts`: bootstrap de Express, Redis, Prisma, worker y healthcheck
- `src/config/*`: entorno, logger, Prisma, Redis, colas, R2, Swagger, timezone
- `src/routes/index.ts`: registro central de rutas

### Módulos de dominio

Patrón más frecuente por módulo:

- `*.controller.ts`
- `*.route.ts`
- `*.service.ts`
- `*.schema.ts` o `*.validation.ts`

Dominios principales:

- sociedades
- sucursales
- productos
- categorías
- socios de negocio
- compras
- órdenes
- pagos
- caja
- kardex / inventario
- consignaciones
- archivos
- dashboard
- impuestos, monedas y unidades de medida

### Infraestructura funcional

- `src/config/redis.ts`: cache y pub/sub base
- `src/config/event-publisher.ts`: publicación de eventos de notificaciones y realtime
- `src/config/queue.ts`: cola BullMQ
- `src/worker/report.worker.ts`: generación asíncrona de reportes Excel
- `src/services/excel.service.ts`: exportación a Excel

## Avances ya realizados

### 1. Testing base ya implementado

Antes el proyecto no tenía una suite ejecutable. Eso ya cambió.

Hoy existe:

- `vitest.config.mjs` con alias `@/`, entorno `node` y cobertura con V8
- `tests/setup/test-env.ts` con defaults seguros para pruebas
- pruebas unitarias de utilidades:
  - `AppError`
  - `asyncHandler`
  - `errorHandler`
  - `controller-helpers`
- pruebas unitarias de módulos críticos:
  - `order`
  - `inventory`
- pruebas unitarias de configuración:
  - `envs`
- pruebas unitarias de controladores en:
  - `cashShift`
  - `currency`
  - `dashboard`
  - `file`
  - `purchase`
  - `purchaseDetail`
- base de integration tests con Prisma real para:
  - `order`
  - `inventory`
  - `purchase`

### 2. Refactor inicial de `order` e `inventory`

Se observa una separación parcial de responsabilidades:

- `src/module/customer/order/order.helpers.ts`
- `src/module/customer/order/order.service.support.ts`
- `src/module/inventory/inventory.helpers.ts`
- `src/module/inventory/inventory.service.support.ts`

Esto ya encapsula mejor:

- armado de cache keys
- resolución de entidades
- invalidación de cache
- efectos de inventario
- side effects diferidos
- construcción de reportes
- utilidades para transacciones de kardex

Todavía no es una capa de dominio completa, pero sí es un paso real para reducir tamaño y complejidad de los servicios principales.

### 3. Manejo de errores más consistente

Se fortaleció la base de errores con:

- `src/utils/AppError.ts`
- `src/utils/domain-errors.ts`
- `src/utils/errorHandler.ts`

Ahora existen errores tipados para:

- validación
- no encontrado
- conflicto
- reglas de dominio

Además, el error handler ya registra con logger estructurado y devuelve `code`, `message` y `details`.

### 4. Helpers compartidos para controladores

Se agregó `src/utils/controller-helpers.ts` para reutilizar:

- composición de errores de `safeParse`
- lectura uniforme de query params

Esto reduce duplicación en varios controladores refactorizados.

### 5. Validación de entorno fortalecida

`src/config/envs.ts` ya no depende de validaciones manuales mínimas. Ahora usa `zod` para:

- validar `DATABASE_URL`
- restringir `NODE_ENV`
- aplicar defaults tipados
- exponer flags derivadas como `isProd` y `REDIS_ENABLED`

Además, esta pieza ya tiene cobertura unitaria.

### 6. Avance en estandarización de schemas y naming

Se incorporaron nuevos archivos `*.schema.ts` en módulos que antes dependían más de validación dispersa, por ejemplo:

- `branchOffice`
- `branchOfficeProduct`
- `businessPartner`
- `purchaseDetail`

También ya empezó la transición de naming desde `bussinesspartner` hacia `businessPartner`, manteniendo compatibilidad por ruta:

- `/business-partners`
- `/bussinesspartners`

## Modelo de negocio principal

La entidad central es `Society`, que funciona como tenant. Desde allí se relacionan:

- productos y categorías
- sucursales
- compras
- ventas (`Order`)
- pagos (`OrderPayment`)
- caja (`CashShift`, `CashMovement`)
- archivos
- favoritos
- configuración regional

El modelo de datos sigue orientado a operación comercial real:

- control de stock por sucursal
- kardex valorizado
- ventas con reserva y confirmación de stock
- consignaciones salientes y liquidaciones
- branding y límites por sociedad
- adjuntos y reportes temporales

## Fortalezas actuales

- Dominio funcional amplio para operación comercial real
- Prisma aporta tipado y consistencia en acceso a datos
- Ya hay una base útil de pruebas automatizadas
- Refactor inicial visible en `order` e `inventory`
- Hay cache por Redis y procesamiento async con BullMQ
- Se usan validaciones con Zod en varios módulos
- El manejo de errores está mejor encaminado que antes

## Hallazgos técnicos vigentes

### 1. Los servicios grandes siguen siendo un punto crítico

Aunque hubo extracción parcial, siguen siendo piezas complejas:

- `src/module/customer/order/order.service.ts`
- `src/module/inventory/inventory.service.ts`
- `src/module/customer/product/product.service.ts`

Todavía mezclan reglas de negocio, acceso a datos, cache y efectos secundarios.

### 2. Faltan más pruebas de integración y flujos completos

La infraestructura de integración ya existe, pero todavía faltan más escenarios de alto valor para:

- crear orden
- reservar stock
- completar venta
- cancelar reserva
- ajuste de inventario
- compras con impacto real en stock

### 3. El acoplamiento con infraestructura sigue presente

El dominio aún conoce detalles concretos de:

- Redis
- invalidación de cache
- publicación realtime
- notificaciones
- side effects con `setImmediate`

La separación mejoró, pero todavía no hay adaptadores claros para aislar infraestructura.

### 4. La validación de entorno mejoró, pero todavía puede crecer

`src/config/envs.ts` ya fue endurecido con `zod`, pero aún se puede ampliar con validación más específica para:

- Redis
- R2/S3
- flags opcionales
- configuraciones operativas sensibles

### 5. Persisten inconsistencias de diseño

Siguen visibles algunos puntos de deuda técnica:

- coexistencia de `schema` y `validation`
- mezcla de naming legacy y naming corregido
- `require` puntual en dashboard dentro de `src/routes/index.ts`
- uso de `console.*` en side effects de soporte

### 6. Riesgo de divergencia en stock

La lógica de stock continúa distribuida entre:

- `product.stock`
- `branchOfficeProduct.availableStock`
- `branchOfficeProduct.physicalStock`
- `branchOfficeProduct.reservedStock`
- `inventoryTransaction`

La lógica existe y ahora está algo más encapsulada, pero sigue necesitando reglas formales y pruebas de integración para evitar inconsistencias.

## Pendientes reales a documentar y ejecutar

### Prioridad 1

1. Agregar pruebas de integración para órdenes e inventario
2. Terminar de centralizar reglas de stock y transiciones
3. Sustituir `console.*` residuales por logging estructurado
4. Completar normalización de errores tipados en todos los módulos críticos

### Prioridad 2

5. Encapsular Redis, realtime y notificaciones detrás de adaptadores
6. Robustecer validación de variables de entorno con Zod u otro esquema fuerte
7. Separar mejor bootstrap, workers y side effects
8. Consolidar resolución de tenant y entidades compartidas

### Prioridad 3

9. Terminar limpieza de naming legacy (`bussinesspartner`, `branchoffice`, etc.)
10. Unificar `schema.ts` como convención
11. Formalizar guía de arquitectura, cache y reglas de stock
12. Llevar testing y build a CI con cobertura mínima

## Roadmap sugerido

### Fase 1

- mantener verde la suite actual
- agregar integration tests para `OrderService` e `InventoryService`
- consolidar flujo de stock con casos borde
- reemplazar logs residuales no estructurados

### Fase 2

- extraer servicios/adaptadores de dominio e infraestructura
- endurecer validación de entorno
- aislar mejor side effects y background jobs

### Fase 3

- completar limpieza de naming y convenciones
- formalizar documentación arquitectónica
- incorporar calidad continua en CI

## Archivos clave para continuar

- `src/index.ts`
- `src/routes/index.ts`
- `src/config/envs.ts`
- `src/config/redis.ts`
- `src/config/event-publisher.ts`
- `src/config/queue.ts`
- `src/module/customer/order/order.service.ts`
- `src/module/customer/order/order.helpers.ts`
- `src/module/customer/order/order.service.support.ts`
- `src/module/inventory/inventory.service.ts`
- `src/module/inventory/inventory.helpers.ts`
- `src/module/inventory/inventory.service.support.ts`
- `src/module/customer/product/product.service.ts`
- `src/module/customer/dashboard/dashboard.service.ts`
- `src/utils/AppError.ts`
- `src/utils/domain-errors.ts`
- `src/utils/errorHandler.ts`
- `tests/setup/test-env.ts`
- `vitest.config.mjs`
- `TESTING.md`
- `prisma/schema.prisma`
- `package.json`

## Recomendación práctica inmediata

El mejor siguiente paso ya no es "instalar una base de testing", porque eso ya está hecho.

Ahora conviene avanzar en este orden:

1. integration tests para órdenes e inventario
2. formalizar reglas de stock como fuente de verdad
3. seguir extrayendo lógica de servicios grandes
4. endurecer validación de entorno y observabilidad
