import prisma from '@/config/prisma';
import {
  createReceivedConsignmentSettlementSchema,
  updateReceivedConsignmentSettlementSchema,
  filterReceivedConsignmentSettlementSchema,
} from './receivedConsignmentSettlement.validation';
import { z } from 'zod';
import { redis } from '@/config/redis';
import {
  PaginatedResult,
  getPrismaPaginationParams,
  buildPaginatedResult,
  PaginationQuery,
} from '@/utils/pagination';
import { ReceivedConsignmentSettlement } from '@prisma/client';
import { DomainRuleAppError, NotFoundAppError } from '@/utils/domain-errors';

type CreateInput = z.infer<typeof createReceivedConsignmentSettlementSchema>;
type UpdateInput = z.infer<typeof updateReceivedConsignmentSettlementSchema>;
type Filters = z.infer<typeof filterReceivedConsignmentSettlementSchema>['query'];
type SettlementValidationClient = Pick<
  typeof prisma,
  'outgoingConsignmentAgreement' | 'deliveredConsignmentAgreement' | 'externalConsignmentSale' | 'receivedConsignmentSettlement'
>;

const CACHE_PREFIX = 'settlements:';
const CACHE_TTL_LIST = 300; // 5 minutos
const CACHE_TTL_SINGLE = 600; // 10 minutos
const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const LIST_CACHE_PREFIX = `${CACHE_PREFIX}list:`;

const resolveSocietyFilter = async (societyIdOrCode?: string) => {
  if (!societyIdOrCode) return undefined;
  if (UUID_REGEX.test(societyIdOrCode)) return societyIdOrCode;

  const society = await prisma.society.findUnique({ where: { code: societyIdOrCode } });
  return society?.id;
};

const assertConsignmentSettlementTotals = (input: {
  totalReportedSalesAmount: number;
  consigneeCommissionAmount: number;
  totalReceivedAmount: number;
}) => {
  const expectedReceivedAmount = Number(
    (input.totalReportedSalesAmount - input.consigneeCommissionAmount).toFixed(2)
  );
  const actualReceivedAmount = Number(input.totalReceivedAmount.toFixed(2));

  if (expectedReceivedAmount !== actualReceivedAmount) {
    throw new DomainRuleAppError(
      'El monto recibido debe ser igual al total reportado menos la comisión del consignatario',
      {
        totalReportedSalesAmount: input.totalReportedSalesAmount,
        consigneeCommissionAmount: input.consigneeCommissionAmount,
        totalReceivedAmount: input.totalReceivedAmount,
        expectedReceivedAmount,
      }
    );
  }
};

const getAgreementSalesTotals = async (tx: SettlementValidationClient, outgoingAgreementId: string) => {
  const deliveries = await tx.deliveredConsignmentAgreement.findMany({
    where: { consignmentAgreementId: outgoingAgreementId },
    select: { id: true },
  });

  const deliveredConsignmentIds = deliveries.map((delivery) => delivery.id);
  if (deliveredConsignmentIds.length === 0) {
    return {
      totalReportedSalesAmount: 0,
      consigneeCommissionAmount: 0,
      totalReceivedAmount: 0,
    };
  }

  const salesTotals = await tx.externalConsignmentSale.aggregate({
    where: {
      deliveredConsignmentId: { in: deliveredConsignmentIds },
    },
    _sum: {
      reportedSalePrice: true,
      totalCommissionAmount: true,
      netTotal: true,
    },
  });

  return {
    totalReportedSalesAmount: Number(salesTotals._sum.reportedSalePrice ?? 0),
    consigneeCommissionAmount: Number(salesTotals._sum.totalCommissionAmount ?? 0),
    totalReceivedAmount: Number(salesTotals._sum.netTotal ?? 0),
  };
};

const validateSettlementAgainstAgreement = async (
  tx: SettlementValidationClient,
  outgoingAgreementId: string,
  nextAmounts: {
    totalReportedSalesAmount: number;
    consigneeCommissionAmount: number;
    totalReceivedAmount: number;
  },
  currentSettlementId?: string
) => {
  const agreement = await tx.outgoingConsignmentAgreement.findUnique({
    where: { id: outgoingAgreementId },
    select: { id: true },
  });

  if (!agreement) {
    throw new NotFoundAppError('Acuerdo de consignación no encontrado', { outgoingAgreementId });
  }

  const agreementTotals = await getAgreementSalesTotals(tx, outgoingAgreementId);
  const previousSettlementsTotals = await tx.receivedConsignmentSettlement.aggregate({
    where: {
      outgoingAgreementId,
      ...(currentSettlementId ? { NOT: { id: currentSettlementId } } : {}),
    },
    _sum: {
      totalReportedSalesAmount: true,
      consigneeCommissionAmount: true,
      totalReceivedAmount: true,
    },
  });

  const cumulativeTotals = {
    totalReportedSalesAmount:
      Number(previousSettlementsTotals._sum.totalReportedSalesAmount ?? 0) +
      nextAmounts.totalReportedSalesAmount,
    consigneeCommissionAmount:
      Number(previousSettlementsTotals._sum.consigneeCommissionAmount ?? 0) +
      nextAmounts.consigneeCommissionAmount,
    totalReceivedAmount:
      Number(previousSettlementsTotals._sum.totalReceivedAmount ?? 0) +
      nextAmounts.totalReceivedAmount,
  };

  if (cumulativeTotals.totalReportedSalesAmount > agreementTotals.totalReportedSalesAmount + 0.001) {
    throw new DomainRuleAppError('La liquidación excede el total de ventas reportadas del acuerdo', {
      agreementTotals,
      cumulativeTotals,
      outgoingAgreementId,
    });
  }

  if (cumulativeTotals.consigneeCommissionAmount > agreementTotals.consigneeCommissionAmount + 0.001) {
    throw new DomainRuleAppError('La liquidación excede la comisión acumulada del acuerdo', {
      agreementTotals,
      cumulativeTotals,
      outgoingAgreementId,
    });
  }

  if (cumulativeTotals.totalReceivedAmount > agreementTotals.totalReceivedAmount + 0.001) {
    throw new DomainRuleAppError('La liquidación excede el neto recibido acumulado del acuerdo', {
      agreementTotals,
      cumulativeTotals,
      outgoingAgreementId,
    });
  }
};

export const createReceivedConsignmentSettlement = async (input: CreateInput) => {
  assertConsignmentSettlementTotals(input);

  const created = await prisma.$transaction(async (tx) => {
    await validateSettlementAgainstAgreement(tx, input.outgoingAgreementId, {
      totalReportedSalesAmount: input.totalReportedSalesAmount,
      consigneeCommissionAmount: input.consigneeCommissionAmount,
      totalReceivedAmount: input.totalReceivedAmount,
    });

    return tx.receivedConsignmentSettlement.create({ data: input });
  });

  // Invalidate List Cache
  await redis.deleteKeysByPrefix(LIST_CACHE_PREFIX);

  return created;
};

export const updateReceivedConsignmentSettlement = async (id: string, input: UpdateInput) => {
  const updated = await prisma.$transaction(async (tx) => {
    const existing = await tx.receivedConsignmentSettlement.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundAppError('Liquidación de consignación no encontrada', { id });
    }

    const nextData = {
      outgoingAgreementId: input.outgoingAgreementId ?? existing.outgoingAgreementId,
      totalReportedSalesAmount: input.totalReportedSalesAmount ?? Number(existing.totalReportedSalesAmount),
      consigneeCommissionAmount:
        input.consigneeCommissionAmount ?? Number(existing.consigneeCommissionAmount),
      totalReceivedAmount: input.totalReceivedAmount ?? Number(existing.totalReceivedAmount),
    };

    assertConsignmentSettlementTotals(nextData);
    await validateSettlementAgainstAgreement(tx, nextData.outgoingAgreementId, nextData, id);

    return tx.receivedConsignmentSettlement.update({ where: { id }, data: input });
  });

  // Invalidate Cache
  await redis.del(`${CACHE_PREFIX}${id}`);
  await redis.deleteKeysByPrefix(LIST_CACHE_PREFIX);

  return updated;
};

export const deleteReceivedConsignmentSettlement = async (id: string) => {
  const deleted = await prisma.receivedConsignmentSettlement.delete({ where: { id } });

  // Invalidate Cache
  await redis.del(`${CACHE_PREFIX}${id}`);
  await redis.deleteKeysByPrefix(LIST_CACHE_PREFIX);

  return deleted;
};

export const getReceivedConsignmentSettlementById = async (id: string) => {
  const cacheKey = `${CACHE_PREFIX}${id}`;

  // Try Cache
  const cached = await redis.get<ReceivedConsignmentSettlement>(cacheKey);
  if (cached) return cached;

  const item = await prisma.receivedConsignmentSettlement.findUnique({
    where: { id },
    include: {
      outgoingAgreement: { select: { id: true, agreementCode: true } },
      orderPayment: true,
      currency: true,
    },
  });

  if (item) await redis.set(cacheKey, item, CACHE_TTL_SINGLE);

  return item;
};

export const getAllReceivedConsignmentSettlements = async (
  paginationQuery?: PaginationQuery,
  filters?: Filters
): Promise<PaginatedResult<ReceivedConsignmentSettlement>> => {
  const page = paginationQuery?.page ?? 1;
  const limit = paginationQuery?.limit ?? 10;
  const sortBy = paginationQuery?.sortBy || 'createdAt';
  const sortOrder = paginationQuery?.sortOrder || 'desc';

  // Resolve societyId from filters
  let resolvedSocietyId: string | undefined;
  const societyCode = filters?.societyCode || filters?.societyId;

  if (societyCode) {
    resolvedSocietyId = await resolveSocietyFilter(societyCode);
    if (!resolvedSocietyId) {
      return buildPaginatedResult([], page, limit, 0);
    }
  }

  // Cache Key
  const cacheKeyParts = [
    LIST_CACHE_PREFIX.slice(0, -1),
    resolvedSocietyId || 'all',
    filters?.status || 'all',
    filters?.settlementDateFrom?.toISOString() || 'all',
    filters?.settlementDateTo?.toISOString() || 'all',
    page,
    limit,
    sortBy,
    sortOrder
  ];
  const cacheKey = cacheKeyParts.join(':');

  // 1. Try Cache
  const cached = await redis.get<PaginatedResult<ReceivedConsignmentSettlement>>(cacheKey);
  if (cached) return cached;

  // 2. Database Query
  const prismaParams = getPrismaPaginationParams(page, limit, sortBy, sortOrder);

  const where: any = {};
  if (resolvedSocietyId) where.outgoingAgreement = { societyId: resolvedSocietyId };
  if (filters?.outgoingAgreementId) where.outgoingAgreementId = filters.outgoingAgreementId;
  if (filters?.status) where.status = filters.status;

  if (filters?.settlementDateFrom || filters?.settlementDateTo) {
    where.settlementDate = {};
    if (filters.settlementDateFrom) where.settlementDate.gte = filters.settlementDateFrom;
    if (filters.settlementDateTo) where.settlementDate.lte = filters.settlementDateTo;
  }

  const [data, total] = await prisma.$transaction([
    prisma.receivedConsignmentSettlement.findMany({
      where,
      skip: prismaParams.skip,
      take: prismaParams.take,
      orderBy: prismaParams.orderBy ?? { createdAt: sortOrder },
      include: {
        outgoingAgreement: { select: { id: true, agreementCode: true } },
        currency: true,
      },
    }),
    prisma.receivedConsignmentSettlement.count({ where }),
  ]);

  const result = buildPaginatedResult(data, page, limit, total);

  // 3. Set Cache
  await redis.set(cacheKey, result, CACHE_TTL_LIST);

  return result;
};
