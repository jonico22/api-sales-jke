import prisma from '@/config/prisma';
import { redis } from '@/config/redis';
import logger from '@/config/logger';
import { ShiftStatus, MovementType } from '@prisma/client';
import {
    PaginatedResult,
    getPrismaPaginationParams,
    buildPaginatedResult,
    PaginationQuery,
} from '@/utils/pagination';
import { formatToLimaTime } from '@/utils/dateFormatter';
import { AddManualMovementInput, CashShiftFilters, CloseShiftInput, OpenShiftInput } from './cashShift.schema';
import { ConflictAppError, NotFoundAppError } from '@/utils/domain-errors';
import {
    aggregateCashShiftMovements,
    buildCashShiftListCacheKey,
    buildCashShiftSelectCacheKey,
    buildCashShiftSelectWhereClause,
    buildCashShiftWhereClause,
    buildCurrentShiftWhereClause,
    CASH_SHIFT_CACHE_PREFIX,
    CASH_SHIFT_CACHE_TTL_LIST,
    CASH_SHIFT_CACHE_TTL_SINGLE,
    CASH_SHIFT_SELECT_TTL,
    resolveCashShiftSocietyId,
    resolveMovementFieldToUpdate,
} from './cashShift.helpers';
import {
    scheduleCashShiftCacheInvalidation,
} from './cashShift.service.support';

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

        scheduleCashShiftCacheInvalidation(
            'cashShift.open.side-effects',
            { shiftId: shift.id, branchId: shift.branchId, userId: shift.userId }
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
        const movementGroups = await prisma.cashMovement.groupBy({
            by: ['type', 'paymentMethod'],
            _sum: { amount: true },
            where: { shiftId: shift.id }
        });

        const {
            incomeCash,
            incomeCard,
            incomeYape,
            incomePlin,
            incomeTransfer,
            expenseCash,
        } = aggregateCashShiftMovements(movementGroups);

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

        scheduleCashShiftCacheInvalidation(
            'cashShift.close.side-effects',
            { shiftId: shift.id },
            { shiftId: shift.id }
        );

        return closedShift;
    },

    getById: async (id: string) => {
        const cacheKey = `${CASH_SHIFT_CACHE_PREFIX}${id}`;
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

        if (shift) await redis.set(cacheKey, shift, CASH_SHIFT_CACHE_TTL_SINGLE);
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
            const societyId = await resolveCashShiftSocietyId(filters.societyCode);
            if (!societyId) {
                return buildPaginatedResult([], page, limit, 0);
            }
            resolvedSocietyId = societyId;
        }

        const cacheKey = buildCashShiftListCacheKey(resolvedSocietyId, paginationQuery, filters);
        const cached = await redis.get(cacheKey);
        if (cached) return cached;

        const prismaParams = getPrismaPaginationParams(page, limit, sortBy, sortOrder);
        const whereClause = buildCashShiftWhereClause(resolvedSocietyId, filters);

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
        await redis.set(cacheKey, result, CASH_SHIFT_CACHE_TTL_LIST);
        return result;
    },

    getCurrentShift: async (branchId: string, userId: string, societyIdOrCode?: string) => {
        const where = await buildCurrentShiftWhereClause(branchId, userId, societyIdOrCode);

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

        const fieldToUpdate = resolveMovementFieldToUpdate(data.type, data.paymentMethod);

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

        scheduleCashShiftCacheInvalidation(
            'cashShift.manual-movement.side-effects',
            { shiftId: shift.id, movementType: data.type, paymentMethod: data.paymentMethod },
            { shiftId: shift.id }
        );

        return movement;
    },

    /**
     * Get unique users who have created shifts
     */
    getCreatedByUsers: async (societyIdOrCode?: string): Promise<string[]> => {
        const whereClause: any = { userId: { not: null } };

        if (societyIdOrCode) {
            const resolvedSocietyId = await resolveCashShiftSocietyId(societyIdOrCode);
            if (!resolvedSocietyId) {
                return [];
            }
            whereClause.societyId = resolvedSocietyId;
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
        const targetStatus = status || ShiftStatus.OPEN;
        const cacheKey = buildCashShiftSelectCacheKey(societyIdOrCode, branchId, targetStatus);

        const cached = await redis.get<any[]>(cacheKey);
        if (cached) return cached;

        const whereClause = await buildCashShiftSelectWhereClause(societyIdOrCode, branchId, status);
        if (!whereClause) return [];

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
        await redis.set(cacheKey, formatted, CASH_SHIFT_SELECT_TTL);
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
            await redis.del(`${CASH_SHIFT_CACHE_PREFIX}${shift.id}`);
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
