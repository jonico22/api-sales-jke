import prisma from '@/config/prisma';
import { redis } from '@/config/redis';
import { CashShift, CashMovement, ShiftStatus, MovementType, PaymentMethodOrder } from '@prisma/client';
import {
    PaginatedResult,
    getPrismaPaginationParams,
    buildPaginatedResult,
    PaginationQuery,
} from '@/utils/pagination';
import { z } from 'zod';
import { openShiftSchema, closeShiftSchema, addManualMovementSchema, cashShiftFiltersSchema } from './cashShift.schema'; // [UPDATED] from .validation

type OpenShiftInput = z.infer<typeof openShiftSchema>['body']; // [UPDATED] schema has body wrapper
type CloseShiftInput = z.infer<typeof closeShiftSchema>['body'] & { id: string }; // [UPDATED] body + params logic in service
type AddManualMovementInput = z.infer<typeof addManualMovementSchema>['body']; // [UPDATED]
type CashShiftFilters = z.infer<typeof cashShiftFiltersSchema>['query']; // [UPDATED]

const CACHE_PREFIX = 'cashShifts:';
const CACHE_TTL_LIST = 300;
const CACHE_TTL_SINGLE = 600;

export const CashShiftService = {

    openShift: async (data: OpenShiftInput) => {
        // 1. Validate if user already has an OPEN shift in this branch
        const existingOpen = await prisma.cashShift.findFirst({
            where: {
                userId: data.userId,
                branchId: data.branchId,
                status: ShiftStatus.OPEN,
                societyId: data.societyId // Scope by society
            }
        });

        if (existingOpen) {
            throw new Error(`El usuario ya tiene una caja abierta (ID: ${existingOpen.id}) en esta sucursal.`);
        }

        const shift = await prisma.cashShift.create({
            data: {
                societyId: data.societyId,
                branchId: data.branchId,
                userId: data.userId,
                initialAmount: data.initialAmount,
                status: ShiftStatus.OPEN,
                // Default snapshots are 0
            }
        });

        // Invalidate list cache
        await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);
        return shift;
    },

    closeShift: async (data: CloseShiftInput) => {
        const shift = await prisma.cashShift.findUnique({ where: { id: data.id } });
        if (!shift) throw new Error('Caja no encontrada.');
        if (shift.status === ShiftStatus.CLOSED) throw new Error('Esta caja ya está cerrada.');

        // Validate Closing User (Optional/Strict mode)
        if (data.userId && shift.userId !== data.userId) {
            // Allow Admin override? For now, warn or throw.
            // console.warn('Different user closing shift');
        }

        // 1. Calculate Aggregates from Database (Source of Truth)
        // We sum all movements by PaymentMethod and Type
        const movements = await prisma.cashMovement.findMany({
            where: { shiftId: shift.id }
        });

        let incomeCash = 0;
        let incomeCard = 0;
        let incomeTransfer = 0;
        let expenseCash = 0;

        for (const mov of movements) {
            const amount = Number(mov.amount); // Careful with Decimal to Number precision (usually fine for currency sums in JS if < 2^53)
            // Ideally use Decimal.js but standard JS number is often accepted if not banking core.
            // Prisma returns Decimal as string or object. We should use Number() for calculation here or Decimal library.

            if (mov.type === MovementType.INCOME) {
                if (mov.paymentMethod === PaymentMethodOrder.CASH) incomeCash += amount;
                else if (mov.paymentMethod === PaymentMethodOrder.CARD) incomeCard += amount;
                else if (mov.paymentMethod === PaymentMethodOrder.YAPE || mov.paymentMethod === PaymentMethodOrder.PLIN || mov.paymentMethod === PaymentMethodOrder.TRANSFER) incomeTransfer += amount;
                // OTHER maps to? Let's treat as Transfer or separate? Schema has limited fields. Assuming Transfer for digital.
            } else if (mov.type === MovementType.EXPENSE) {
                if (mov.paymentMethod === PaymentMethodOrder.CASH) expenseCash += amount;
                // Expenses in Card/Transfer usually rare for petty cash, but could happen. 
                // Schema 'expenseCash' implies only cash expenses are tracked for drawer reconciliation.
            }
        }

        // System Total Cash in Drawer = Initial + IncomeCash - ExpenseCash
        const initial = Number(shift.initialAmount);
        const finalSystem = initial + incomeCash - expenseCash;
        const finalReported = data.finalReportedAmount;
        const difference = finalReported - finalSystem;

        // 2. Update Shift
        const closedShift = await prisma.cashShift.update({
            where: { id: shift.id },
            data: {
                status: ShiftStatus.CLOSED,
                closedAt: new Date(),
                finalReportedAmount: finalReported,
                finalSystemAmount: finalSystem,
                difference: difference,
                // Snapshots
                incomeCash,
                incomeCard,
                incomeTransfer,
                expenseCash
            }
        });

        await redis.del(`${CACHE_PREFIX}${shift.id}`);
        await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);

        return closedShift;
    },

    getById: async (id: string) => {
        const cacheKey = `${CACHE_PREFIX}${id}`;
        const cached = await redis.get<any>(cacheKey); // Type 'any' due to include
        if (cached) return cached;

        const shift = await prisma.cashShift.findUnique({
            where: { id },
            include: {
                movements: {
                    orderBy: { createdAt: 'desc' },
                    include: { orderPayment: true } // See linked sales
                },
                branch: { select: { name: true } }
            }
        });

        if (shift) await redis.set(cacheKey, shift, CACHE_TTL_SINGLE);
        return shift;
    },

    getAll: async (paginationQuery?: PaginationQuery, filters?: CashShiftFilters) => {
        const page = paginationQuery?.page ?? 1;
        const limit = paginationQuery?.limit ?? 10;
        const sortBy = paginationQuery?.sortBy ?? 'createdAt';
        const sortOrder = paginationQuery?.sortOrder ?? 'desc';

        const cacheKey = `${CACHE_PREFIX}list:${JSON.stringify({ paginationQuery, filters })}`; // Simple key
        const cached = await redis.get(cacheKey);
        if (cached) return cached;

        const whereClause: any = {
            ...(filters?.societyId && { societyId: filters.societyId }),
            ...(filters?.branchId && { branchId: filters.branchId }),
            ...(filters?.userId && { userId: filters.userId }),
            ...(filters?.status && { status: filters.status }),
        };

        if (filters?.dateFrom || filters?.dateTo) {
            whereClause.openedAt = {};
            if (filters.dateFrom) whereClause.openedAt.gte = new Date(filters.dateFrom);
            if (filters.dateTo) whereClause.openedAt.lte = new Date(filters.dateTo);
        }

        const [data, total] = await prisma.$transaction([
            prisma.cashShift.findMany({
                where: whereClause,
                include: { branch: { select: { name: true } } },
                skip: (page - 1) * limit,
                take: limit,
                orderBy: { [sortBy]: sortOrder }
            }),
            prisma.cashShift.count({ where: whereClause })
        ]);

        const result = buildPaginatedResult(data, page, limit, total);
        await redis.set(cacheKey, result, CACHE_TTL_LIST);
        return result;
    },

    addManualMovement: async (data: AddManualMovementInput & { userId: string }) => {
        const shift = await prisma.cashShift.findUnique({ where: { id: data.shiftId } });
        if (!shift || shift.status === ShiftStatus.CLOSED) throw new Error('Caja cerrada o no encontrada.');

        // Create Movement
        const movement = await prisma.cashMovement.create({
            data: {
                shiftId: data.shiftId,
                type: data.type,
                amount: data.amount,
                currencyId: data.currencyId,
                paymentMethod: data.paymentMethod,
                description: data.description,
                createdBy: data.userId
            }
        });

        // Invalidate Cache
        await redis.del(`${CACHE_PREFIX}${shift.id}`);

        return movement;
    },

    // Helper for OrderService integration
    registerPaymentMovement: async (paymentData: any, userId: string, branchId: string, societyId: string) => {
        // Find OPEN shift for this user/branch
        const shift = await prisma.cashShift.findFirst({
            where: {
                userId,
                branchId,
                status: ShiftStatus.OPEN,
                societyId
            }
        });

        if (!shift) {
            // Optional: Allow payment without open shift? 
            // Business Rule: Usually strictly require Open Shift for physical payments (CASH). 
            // For Online (YAPE/CARD), maybe loose? 
            // Let's Log a warning or create a "System Shift" or just skip linking.
            // User requested "saldo se actualice automaticamente".
            // If no shift, we can't update.
            // We'll return null to indicate no link.
            return null;
        }

        // Create INCOME movement
        return prisma.cashMovement.create({
            data: {
                shiftId: shift.id,
                type: MovementType.INCOME,
                amount: paymentData.amount,
                currencyId: paymentData.currencyId,
                paymentMethod: paymentData.paymentMethod,
                description: `Venta (Pago ${paymentData.id})`,
                orderPaymentId: paymentData.id,
                createdBy: userId
            }
        });
    }
};
