import prisma from '@/config/prisma';
import { redis } from '@/config/redis';
import logger from '@/config/logger';
import { CashShift, CashMovement, ShiftStatus, MovementType, PaymentMethodOrder } from '@prisma/client';
import {
    PaginatedResult,
    getPrismaPaginationParams,
    buildPaginatedResult,
    PaginationQuery,
} from '@/utils/pagination';
import { z } from 'zod';
import { formatToLimaTime, convertLimaDateRangeToUTC } from '@/utils/dateFormatter';
import { openShiftSchema, closeShiftSchema, addManualMovementSchema, cashShiftFiltersSchema } from './cashShift.schema'; // [UPDATED] from .validation
import { ConflictAppError, NotFoundAppError } from '@/utils/domain-errors';
import { runInBackground } from '@/utils/background-task';

type OpenShiftInput = z.infer<typeof openShiftSchema>['body']; // [UPDATED] schema has body wrapper
type CloseShiftInput = z.infer<typeof closeShiftSchema>['body'] & { id: string }; // [UPDATED] body + params logic in service
type AddManualMovementInput = z.infer<typeof addManualMovementSchema>['body']; // [UPDATED]
type CashShiftFilters = z.infer<typeof cashShiftFiltersSchema>['query']; // [UPDATED]

const CACHE_PREFIX = 'cashShifts:';
const CACHE_TTL_LIST = 300;
const CACHE_TTL_SINGLE = 600;

const invalidateCashShiftCaches = async (input?: { shiftId?: string }) => {
    const operations = [redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`)];

    if (input?.shiftId) {
        operations.push(redis.del(`${CACHE_PREFIX}${input.shiftId}`));
    } else {
        operations.push(redis.deleteKeysByPrefix(`${CACHE_PREFIX}`));
    }

    await Promise.all(operations);
};

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
            throw new ConflictAppError(
                `El usuario ya tiene una caja abierta (ID: ${existingOpen.id}) en esta sucursal.`,
                { shiftId: existingOpen.id, branchId: data.branchId, userId: data.userId }
            );
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

        // BACKGROUND: Invalidate cache
        runInBackground(
            {
                taskName: 'cashShift.open.side-effects',
                context: { shiftId: shift.id, branchId: shift.branchId, userId: shift.userId },
            },
            async () => {
                await invalidateCashShiftCaches();
            }
        );

        return shift;
    },

    closeShift: async (data: CloseShiftInput) => {
        const shift = await prisma.cashShift.findUnique({ where: { id: data.id } });
        if (!shift) throw new NotFoundAppError('Caja no encontrada.', { shiftId: data.id });
        if (shift.status === ShiftStatus.CLOSED) {
            throw new ConflictAppError('Esta caja ya está cerrada.', { shiftId: data.id });
        }

        // Validate Closing User (Optional/Strict mode)
        if (data.userId && shift.userId !== data.userId) {
            // Allow Admin override for now; this remains a business-policy decision.
        }

        // 1. Calculate Aggregates from Database (Source of Truth)
        // We sum all movements by PaymentMethod and Type
        const movements = await prisma.cashMovement.findMany({
            where: { shiftId: shift.id }
        });

        let incomeCash = 0;
        let incomeCard = 0;
        let incomeYape = 0;
        let incomePlin = 0;
        let incomeTransfer = 0;
        let expenseCash = 0;

        for (const mov of movements) {
            const amount = Number(mov.amount);

            if (mov.type === MovementType.INCOME) {
                if (mov.paymentMethod === PaymentMethodOrder.CASH) incomeCash += amount;
                else if (mov.paymentMethod === PaymentMethodOrder.CARD) incomeCard += amount;
                else if (mov.paymentMethod === PaymentMethodOrder.YAPE) incomeYape += amount;
                else if (mov.paymentMethod === PaymentMethodOrder.PLIN) incomePlin += amount;
                else if (mov.paymentMethod === PaymentMethodOrder.TRANSFER) incomeTransfer += amount;
                else if (mov.paymentMethod === PaymentMethodOrder.OTHER) incomeTransfer += amount;
            } else if (mov.type === MovementType.EXPENSE) {
                if (mov.paymentMethod === PaymentMethodOrder.CASH) expenseCash += amount;
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
                incomeYape,
                incomePlin,
                incomeTransfer,
                expenseCash,
                // Detailed reporting
                reportedCashAmount: data.reportedCashAmount,
                reportedCardAmount: data.reportedCardAmount,
                reportedYapeAmount: data.reportedYapeAmount,
                reportedPlinAmount: data.reportedPlinAmount,
                reportedTransferAmount: data.reportedTransferAmount,
                observations: data.observations
            }
        });

        // BACKGROUND: Invalidate cache
        runInBackground(
            {
                taskName: 'cashShift.close.side-effects',
                context: { shiftId: shift.id },
            },
            async () => {
                await invalidateCashShiftCaches({ shiftId: shift.id });
            }
        );

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
        const sortBy = paginationQuery?.sortBy || 'createdAt';
        const sortOrder = paginationQuery?.sortOrder || 'desc';

        // Resolve societyId from filters
        let resolvedSocietyId = filters?.societyId;
        if (!resolvedSocietyId && filters?.societyCode) {
            const society = await prisma.society.findUnique({ where: { code: filters.societyCode } });
            if (society) {
                resolvedSocietyId = society.id;
            } else {
                return buildPaginatedResult([], page, limit, 0);
            }
        }

        const prefix = resolvedSocietyId || 'all';
        const cacheKey = `${CACHE_PREFIX}list:${prefix}:${JSON.stringify({ paginationQuery, filters })}`;
        const cached = await redis.get(cacheKey);
        if (cached) return cached;

        const prismaParams = getPrismaPaginationParams(page, limit, sortBy, sortOrder);
        const whereClause: any = {};

        if (resolvedSocietyId) {
            whereClause.societyId = resolvedSocietyId;
        }

        if (filters?.branchId) whereClause.branchId = filters.branchId;
        if (filters?.userId) whereClause.userId = filters.userId;
        if (filters?.status) whereClause.status = filters.status;

        if (filters?.dateFrom || filters?.dateTo) {
            const dateRange = convertLimaDateRangeToUTC(filters.dateFrom, filters.dateTo);
            whereClause.openedAt = {};
            if (dateRange.from) whereClause.openedAt.gte = dateRange.from;
            if (dateRange.to) whereClause.openedAt.lte = dateRange.to;
        }

        const [data, total] = await prisma.$transaction([
            prisma.cashShift.findMany({
                where: whereClause,
                include: { branch: { select: { name: true } } },
                skip: prismaParams.skip,
                take: prismaParams.take,
                orderBy: prismaParams.orderBy ?? { createdAt: sortOrder }
            }),
            prisma.cashShift.count({ where: whereClause })
        ]);

        // Format dates to Lima time
        const formattedData = data.map(item => ({
            ...item,
            openedAt: formatToLimaTime(item.openedAt) as any,
            closedAt: item.closedAt ? formatToLimaTime(item.closedAt) as any : null,
            createdAt: formatToLimaTime((item as any).createdAt) as any,
        }));

        const result = buildPaginatedResult(formattedData, page, limit, total);
        await redis.set(cacheKey, result, CACHE_TTL_LIST);
        return result;
    },

    getCurrentShift: async (branchId: string, userId: string, societyIdOrCode?: string) => {
        // Find OPEN shift for this user/branch
        const where: any = {
            userId,
            branchId,
            status: ShiftStatus.OPEN
        };

        if (societyIdOrCode) {
            const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(societyIdOrCode);
            if (isUuid) {
                where.societyId = societyIdOrCode;
            } else {
                const society = await prisma.society.findUnique({ where: { code: societyIdOrCode } });
                if (society) {
                    where.societyId = society.id;
                }
            }
        }

        const shift = await prisma.cashShift.findFirst({
            where,
            include: {
                branch: { select: { name: true } }
            }
        });

        return shift;
    },

    addManualMovement: async (data: AddManualMovementInput & { userId: string }) => {
        const shift = await prisma.cashShift.findUnique({ where: { id: data.shiftId } });
        if (!shift) throw new NotFoundAppError('Caja no encontrada.', { shiftId: data.shiftId });
        if (shift.status === ShiftStatus.CLOSED) {
            throw new ConflictAppError('Caja cerrada o no encontrada.', { shiftId: data.shiftId });
        }

        // 1. Map payment method to the corresponding shift field
        let fieldToUpdate: string | null = null;
        if (data.type === MovementType.INCOME) {
            const incomeFieldMap: Record<string, string> = {
                CASH: 'incomeCash',
                CARD: 'incomeCard',
                YAPE: 'incomeYape',
                PLIN: 'incomePlin',
                TRANSFER: 'incomeTransfer',
                OTHER: 'incomeTransfer',
            };
            fieldToUpdate = incomeFieldMap[data.paymentMethod];
        } else if (data.type === MovementType.EXPENSE) {
            // Expenses are usually CASH in this context
            fieldToUpdate = 'expenseCash';
        }

        // 2. Create Movement and Update Shift totals in parallel
        const [movement] = await prisma.$transaction([
            prisma.cashMovement.create({
                data: {
                    shiftId: data.shiftId,
                    type: data.type,
                    amount: data.amount,
                    currencyId: data.currencyId,
                    paymentMethod: data.paymentMethod,
                    description: data.description,
                    createdBy: data.userId
                }
            }),
            ...(fieldToUpdate ? [
                prisma.cashShift.update({
                    where: { id: data.shiftId },
                    data: { [fieldToUpdate]: { increment: Number(data.amount) } }
                })
            ] : [])
        ]);

        // BACKGROUND: Invalidate Cache
        runInBackground(
            {
                taskName: 'cashShift.manual-movement.side-effects',
                context: { shiftId: shift.id, movementType: data.type, paymentMethod: data.paymentMethod },
            },
            async () => {
                await invalidateCashShiftCaches({ shiftId: shift.id });
            }
        );

        return movement;
    },

    /**
     * Get unique users who have created shifts
     */
    getCreatedByUsers: async (societyIdOrCode?: string): Promise<string[]> => {
        const whereClause: any = { userId: { not: null } };

        if (societyIdOrCode) {
            const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(societyIdOrCode);
            if (isUuid) {
                whereClause.societyId = societyIdOrCode;
            } else {
                const society = await prisma.society.findUnique({ where: { code: societyIdOrCode } });
                if (society) {
                    whereClause.societyId = society.id;
                } else {
                    return [];
                }
            }
        }

        const result = await prisma.cashShift.findMany({
            where: whereClause,
            distinct: ['userId'],
            select: { userId: true }
        });

        return result
            .map(item => item.userId)
            .filter((id): id is string => typeof id === 'string' && id.length > 0);
    },

    /**
     * Obtener turnos de caja para select/dropdown
     * Filtra por sociedad y/o sucursal, retorna data mínima para dropdowns
     */
    getForSelect: async (societyIdOrCode?: string, branchId?: string, status?: string) => {
        // Default to OPEN if no status is provided, as selects usually want active shifts
        const targetStatus = status || ShiftStatus.OPEN;
        const cacheKey = `${CACHE_PREFIX}select:${societyIdOrCode || 'all'}:${branchId || 'all'}:${targetStatus}`;

        const cached = await redis.get<any[]>(cacheKey);
        if (cached) return cached;

        const whereClause: any = { status: targetStatus };

        // Resolver sociedad por código o UUID
        if (societyIdOrCode) {
            const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(societyIdOrCode);
            if (isUuid) {
                whereClause.societyId = societyIdOrCode;
            } else {
                const society = await prisma.society.findUnique({ where: { code: societyIdOrCode } });
                if (!society) return [];
                whereClause.societyId = society.id;
            }
        }

        if (branchId) whereClause.branchId = branchId;
        if (status) whereClause.status = status;

        const shifts = await prisma.cashShift.findMany({
            where: whereClause,
            select: {
                id: true,
                userId: true,
                status: true,
                openedAt: true,
                closedAt: true,
                branch: { select: { id: true, name: true, code: true } },
            },
            orderBy: { openedAt: 'desc' },
        });

        const formatted = shifts.map(s => ({
            ...s,
            openedAt: formatToLimaTime(s.openedAt),
            closedAt: s.closedAt ? formatToLimaTime(s.closedAt) : null,
        }));

        // Cache corto (30 seg) porque el estado cambia frecuentemente
        await redis.set(cacheKey, formatted, 30);
        return formatted;
    },

    registerPaymentMovement: async (paymentData: any, userId: string, branchId: string, societyId: string) => {
        logger.debug({
            msg: 'Registering cash shift payment movement',
            userId,
            branchId,
            societyId,
            paymentId: paymentData?.id,
        });

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
            logger.warn({
                msg: 'Open cash shift not found for payment movement',
                userId,
                branchId,
                societyId,
                paymentId: paymentData?.id,
            });
            return null;
        }

        try {
            // Map payment method to the corresponding shift income field
            const incomeFieldMap: Record<string, string> = {
                CASH: 'incomeCash',
                CARD: 'incomeCard',
                YAPE: 'incomeYape',
                PLIN: 'incomePlin',
                TRANSFER: 'incomeTransfer',
                OTHER: 'incomeTransfer',
            };
            const incomeField = incomeFieldMap[paymentData.paymentMethod];

            // Run both in parallel: create movement + update shift running total
            const [movement] = await Promise.all([
                prisma.cashMovement.create({
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
                }),
                incomeField
                    ? prisma.cashShift.update({
                        where: { id: shift.id },
                        data: { [incomeField]: { increment: Number(paymentData.amount) } }
                    })
                    : Promise.resolve(null)
            ]);

            // Invalidate shift cache so the movement appears immediately on next query
            await redis.del(`${CACHE_PREFIX}${shift.id}`);
            return movement;
        } catch (error) {
            logger.error({
                msg: 'Failed to create cash movement from payment',
                paymentData,
                userId,
                shiftId: shift.id,
                err: error,
            });
            throw error;
        }
    }
};
