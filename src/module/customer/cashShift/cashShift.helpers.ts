import prisma from '@/config/prisma';
import { ShiftStatus, MovementType, PaymentMethodOrder } from '@prisma/client';
import { convertLimaDateRangeToUTC } from '@/utils/dateFormatter';
import { PaginationQuery } from '@/utils/pagination';
import { CashShiftFilters } from './cashShift.schema';

export const CASH_SHIFT_CACHE_PREFIX = 'cashShifts:';
export const CASH_SHIFT_CACHE_TTL_LIST = 300;
export const CASH_SHIFT_CACHE_TTL_SINGLE = 600;
export const CASH_SHIFT_SELECT_TTL = 30;

export const isUuid = (value: string) =>
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(value);

export const buildCashShiftListCacheKey = (
  resolvedSocietyId: string | undefined,
  paginationQuery?: PaginationQuery,
  filters?: CashShiftFilters
) =>
  [
    CASH_SHIFT_CACHE_PREFIX.replace(/:$/, ''),
    'list',
    resolvedSocietyId || 'all',
    filters?.branchId || 'all',
    filters?.userId || 'all',
    filters?.status || 'all',
    filters?.dateFrom || 'all',
    filters?.dateTo || 'all',
    paginationQuery?.page ?? 1,
    paginationQuery?.limit ?? 10,
    paginationQuery?.sortBy || 'createdAt',
    paginationQuery?.sortOrder || 'desc',
  ].join(':');

export const resolveCashShiftSocietyId = async (societyIdOrCode?: string) => {
  if (!societyIdOrCode) {
    return undefined;
  }

  if (isUuid(societyIdOrCode)) {
    return societyIdOrCode;
  }

  const society = await prisma.society.findUnique({
    where: { code: societyIdOrCode },
    select: { id: true },
  });

  return society?.id ?? null;
};

export const buildCashShiftWhereClause = (
  resolvedSocietyId?: string,
  filters?: CashShiftFilters
) => {
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

  return whereClause;
};

export const buildCurrentShiftWhereClause = async (
  branchId: string,
  userId: string,
  societyIdOrCode?: string
) => {
  const where: any = {
    userId,
    branchId,
    status: ShiftStatus.OPEN,
  };

  if (!societyIdOrCode) {
    return where;
  }

  const resolvedSocietyId = await resolveCashShiftSocietyId(societyIdOrCode);
  if (resolvedSocietyId) {
    where.societyId = resolvedSocietyId;
  }

  return where;
};

export const buildCashShiftSelectCacheKey = (
  societyIdOrCode?: string,
  branchId?: string,
  status?: string
) => `${CASH_SHIFT_CACHE_PREFIX}select:${societyIdOrCode || 'all'}:${branchId || 'all'}:${status || ShiftStatus.OPEN}`;

export const buildCashShiftSelectWhereClause = async (
  societyIdOrCode?: string,
  branchId?: string,
  status?: string
) => {
  const targetStatus = status || ShiftStatus.OPEN;
  const whereClause: any = { status: targetStatus };

  if (societyIdOrCode) {
    const resolvedSocietyId = await resolveCashShiftSocietyId(societyIdOrCode);
    if (!resolvedSocietyId) {
      return null;
    }
    whereClause.societyId = resolvedSocietyId;
  }

  if (branchId) whereClause.branchId = branchId;
  if (status) whereClause.status = status;

  return whereClause;
};

export const resolveMovementFieldToUpdate = (
  type: MovementType,
  paymentMethod: PaymentMethodOrder
) => {
  if (type === MovementType.INCOME) {
    const incomeFieldMap: Record<string, string> = {
      CASH: 'incomeCash',
      CARD: 'incomeCard',
      YAPE: 'incomeYape',
      PLIN: 'incomePlin',
      TRANSFER: 'incomeTransfer',
      OTHER: 'incomeTransfer',
    };
    return incomeFieldMap[paymentMethod];
  }

  if (type === MovementType.EXPENSE) {
    return 'expenseCash';
  }

  return null;
};

export const aggregateCashShiftMovements = (
  movementGroups: Array<{
    type: MovementType;
    paymentMethod: PaymentMethodOrder;
    _sum: { amount: unknown };
  }>
) => {
  let incomeCash = 0;
  let incomeCard = 0;
  let incomeYape = 0;
  let incomePlin = 0;
  let incomeTransfer = 0;
  let expenseCash = 0;

  for (const mov of movementGroups) {
    const amount = Number(mov._sum.amount || 0);

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

  return {
    incomeCash,
    incomeCard,
    incomeYape,
    incomePlin,
    incomeTransfer,
    expenseCash,
  };
};
