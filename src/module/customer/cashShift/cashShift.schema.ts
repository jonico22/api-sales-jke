import { z } from 'zod';
import { registry } from '@/config/swagger';
import { MovementType, PaymentMethodOrder, ShiftStatus } from '@prisma/client';

// Schema base para CashShift
export const CashShiftSchema = registry.register(
    'CashShift',
    z.object({
        id: z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
        societyId: z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
        branchId: z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
        userId: z.string().openapi({ example: 'user-auth0-id', description: 'ID del usuario cajero' }),
        status: z.nativeEnum(ShiftStatus).openapi({ example: ShiftStatus.OPEN }),
        openedAt: z.date().openapi({ example: '2024-02-01T08:00:00Z' }),
        closedAt: z.date().nullable().openapi({ example: '2024-02-01T18:00:00Z' }),
        initialAmount: z.number().openapi({ example: 100.00, description: 'Monto inicial en caja' }),
        finalReportedAmount: z.number().nullable().openapi({ example: 1500.00 }),
        finalSystemAmount: z.number().nullable().openapi({ example: 1500.00 }),
        difference: z.number().nullable().openapi({ example: 0.00 }),
        incomeCash: z.number().openapi({ example: 1000.00 }),
        incomeCard: z.number().openapi({ example: 500.00 }),
        incomeTransfer: z.number().openapi({ example: 200.00 }),
        expenseCash: z.number().openapi({ example: 50.00 }),
    })
);

export const openShiftSchema = z.object({
    body: registry.register('OpenShift', z.object({
        societyId: z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
        branchId: z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
        userId: z.string().openapi({ example: 'user-id', description: 'ID del usuario (opcional si se toma del token)' }),
        initialAmount: z.coerce.number().nonnegative().openapi({ example: 100.00, description: 'Sencillo inicial' }),
    }))
});

export const closeShiftSchema = z.object({
    params: z.object({
        id: z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' })
    }),
    body: registry.register('CloseShift', z.object({
        finalReportedAmount: z.coerce.number().nonnegative().openapi({ example: 1500.00, description: 'Monto real contado en caja' }),
        userId: z.string().optional().openapi({ example: 'user-id', description: 'ID del usuario que cierra' }),
    }))
});

export const addManualMovementSchema = z.object({
    body: registry.register('AddManualMovement', z.object({
        shiftId: z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
        type: z.nativeEnum(MovementType).openapi({ example: MovementType.EXPENSE, description: 'INCOME o EXPENSE' }),
        amount: z.coerce.number().positive().openapi({ example: 50.00 }),
        description: z.string().min(1).openapi({ example: 'Pago de limpieza', description: 'Motivo del movimiento' }),
        currencyId: z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
        paymentMethod: z.nativeEnum(PaymentMethodOrder).default(PaymentMethodOrder.CASH).openapi({ example: PaymentMethodOrder.CASH }),
        userId: z.string().optional().openapi({ example: 'user-id', description: 'Usuario que registra' }),
    }))
});

export const cashShiftIdSchema = z.object({
    params: z.object({
        id: z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
    })
});

export const cashShiftFiltersSchema = z.object({
    query: z.object({
        societyId: z.string().uuid().optional().openapi({ example: 'uuid' }),
        branchId: z.string().uuid().optional().openapi({ example: 'uuid' }),
        userId: z.string().optional().openapi({ example: 'user-id' }),
        status: z.nativeEnum(ShiftStatus).optional().openapi({ example: ShiftStatus.OPEN }),
        dateFrom: z.string().optional().openapi({ example: '2024-01-01' }),
        dateTo: z.string().optional().openapi({ example: '2024-01-31' }),

        // Pagination
        page: z.string().transform(val => parseInt(val)).optional().openapi({ example: '1' }),
        limit: z.string().transform(val => parseInt(val)).optional().openapi({ example: '10' }),
        sortBy: z.string().optional().openapi({ example: 'createdAt' }),
        sortOrder: z.string().optional().openapi({ example: 'desc' }),
    })
});
