# Testing

## Estado actual

Verificado localmente el 2026-04-08:

- `npm test` OK
- 20 archivos de prueba passing
- 2 archivos de integración skipped por default
- 115 pruebas passing
- 3 pruebas de integración skipped por default
- `npm run build` OK

El proyecto ya no está en una etapa de "arranque de testing". Hoy existe una base funcional de pruebas unitarias que cubre utilidades compartidas, controladores y partes importantes de `order` e `inventory`.

## Stack

- Vitest
- Node test environment
- Alias support with `@/`
- Coverage via V8
- Thread pool for fast and sandbox-friendly execution

## Commands

- `npm test`: run all tests once
- `npm run test:integration`: run integration tests with `RUN_INTEGRATION_TESTS=true`
- `npm run test:watch`: watch mode for local development
- `npm run test:coverage`: generate coverage report

## Current setup

- Global setup file: `tests/setup/test-env.ts`
- Config file: `vitest.config.mjs`
- Config loader: native
- Test discovery: `tests/**/*.test.ts`
- Coverage output: `coverage/`

## Default test environment

The setup file defines safe defaults so tests can import application modules without failing immediately on missing environment variables:

- `NODE_ENV=test`
- `TZ=America/Lima`
- `DATABASE_URL` placeholder
- `DIRECT_URL` placeholder
- `REDIS_ENABLED=false`
- `REDIS_URL` placeholder

It also restores and clears Vitest mocks after each test.

## Current coverage map

### Shared utilities

- `tests/unit/utils/AppError.test.ts`
- `tests/unit/utils/asyncHandler.test.ts`
- `tests/unit/utils/controller-helpers.test.ts`
- `tests/unit/utils/errorHandler.test.ts`

### Configuration

- `tests/unit/config/envs.test.ts`

### Order domain

- `tests/unit/module/customer/order/order.controller.test.ts`
- `tests/unit/module/customer/order/order.helpers.test.ts`
- `tests/unit/module/customer/order/order.service.support.test.ts`
- `tests/unit/module/customer/order/order.service.test.ts`

### Inventory domain

- `tests/unit/module/inventory/inventory.controller.test.ts`
- `tests/unit/module/inventory/inventory.helpers.test.ts`
- `tests/unit/module/inventory/inventory.service.support.test.ts`
- `tests/unit/module/inventory/inventory.service.test.ts`

### Other controllers already covered

- `cashShift`
- `currency`
- `dashboard`
- `file`
- `purchase`
- `purchaseDetail`

### Integration test base

- `tests/integration/helpers/integration-db.ts`
- `tests/integration/module/customer/order/order.service.integration.test.ts`
- `tests/integration/module/inventory/inventory.service.integration.test.ts`
- `tests/integration/module/customer/purchase/purchase.service.integration.test.ts`

These suites are opt-in and only run when `RUN_INTEGRATION_TESTS=true`.
By default, `npm test` keeps them skipped so the normal local workflow does not fail when the PostgreSQL test database is not available.

## Conventions

- Unit tests: `tests/unit/**`
- Integration tests: `tests/integration/**`
- One test file per service, helper or utility
- Prefer mocking Prisma, Redis and external publishers in unit tests
- Reserve real database usage for integration flows only
- Keep setup defaults in `tests/setup/test-env.ts` minimal and deterministic

## What is still missing

The main gap is no longer the absence of integration infrastructure. The highest-value missing layer now is expanding the number of covered business flows on top of the new real-DB test base.

Priority candidates:

- order creation end-to-end with stock reservation
- order completion with stock confirmation
- reservation cancellation
- manual inventory adjustment with kardex record
- purchase flow with stock impact
- cache invalidation assertions on critical write paths

## Recommended next step

Expand the existing integration suites in `tests/integration/**`.

Suggested next scenarios:

- reject order with insufficient stock
- cancel reserved stock correctly
- validate kardex filters through `InventoryService.getAll`
- cover purchase completion with stock impact

## Practical note

Because the project still has significant business logic in services and side effects around Redis, notifications and inventory, every new refactor in `order`, `inventory` or `product` should add or update tests in the same change set.
