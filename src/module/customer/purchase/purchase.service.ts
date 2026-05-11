import prisma from '@/config/prisma';
import { CreatePurchaseInput, UpdatePurchaseInput, PurchaseFilters } from './purchase.schema';
import { redis } from '@/config/redis';
import {
  PaginatedResult,
  getPrismaPaginationParams,
  buildPaginatedResult,
  PaginationQuery,
} from '@/utils/pagination';
import { Purchase, PurchaseStatus } from '@prisma/client';
import { NotFoundAppError } from '@/utils/domain-errors';
import {
  assertPurchaseCanBeCompleted,
  assertSupplierPartner,
  buildPurchaseListCacheKey,
  buildPurchaseWhereClause,
  isUuid,
  PURCHASE_CACHE_PREFIX,
  PURCHASE_CACHE_TTL_LIST,
  PURCHASE_CACHE_TTL_SINGLE,
  resolvePurchaseSocietyId,
  shouldCompletePurchase,
} from './purchase.helpers';
import {
  applyPurchaseCompletionEffects,
  invalidatePurchaseCaches,
} from './purchase.service.support';

export const getAllPurchases = async (
  paginationQuery?: PaginationQuery,
  filters?: PurchaseFilters
): Promise<PaginatedResult<Purchase>> => {
  const page = paginationQuery?.page ?? 1;
  const limit = paginationQuery?.limit ?? 10;
  const sortBy = paginationQuery?.sortBy || 'createdAt';
  const sortOrder = paginationQuery?.sortOrder || 'desc';

  let resolvedSocietyId = filters?.societyId;
  if (!resolvedSocietyId && filters?.societyCode) {
    const societyId = await resolvePurchaseSocietyId(filters.societyCode);
    if (!societyId) {
      return buildPaginatedResult([], page, limit, 0);
    }
    resolvedSocietyId = societyId;
  }

  const cacheKey = buildPurchaseListCacheKey(page, limit, sortBy, sortOrder, filters, resolvedSocietyId);

  const cached = await redis.get<PaginatedResult<Purchase>>(cacheKey);
  if (cached) return cached;

  const prismaParams = getPrismaPaginationParams(page, limit, sortBy, sortOrder);
  const whereClause = buildPurchaseWhereClause(filters, resolvedSocietyId);

  const [data, total] = await prisma.$transaction([
    prisma.purchase.findMany({
      where: whereClause,
      skip: prismaParams.skip,
      take: prismaParams.take,
      orderBy: prismaParams.orderBy ?? { createdAt: sortOrder },
      include: {
        society: { select: { id: true, name: true } },
        provider: { select: { id: true, firstName: true, lastName: true, companyName: true, documentNumber: true } },
        purchaseDetails: true,
        currency: true,
        branchOffice: { select: { id: true, name: true } },
        documentType: true,
      },
    }),
    prisma.purchase.count({ where: whereClause }),
  ]);

  const result = buildPaginatedResult(data, page, limit, total);

  // 3. Set Cache
  await redis.set(cacheKey, result, PURCHASE_CACHE_TTL_LIST);

  return result;
}

export const getPurchaseById = async (id: string) => {
  const cacheKey = `${PURCHASE_CACHE_PREFIX}${id}`;

  // Try Cache
  const cached = await redis.get<Purchase>(cacheKey);
  if (cached) return cached;

  const purchase = await prisma.purchase.findUnique({
    where: { id },
    include: {
      society: true,
      provider: true,
      purchaseDetails: {
        include: {
          product: true
        }
      },
      currency: true,
      branchOffice: true,
      documentType: true,
      tax: true
    },
  })

  if (purchase) await redis.set(cacheKey, purchase, PURCHASE_CACHE_TTL_SINGLE);

  return purchase;
}

export const createPurchase = async (data: CreatePurchaseInput) => {
  const isPurchaseSocietyUuid = isUuid(data.societyId);
  if (!isPurchaseSocietyUuid) {
    const society = await prisma.society.findUnique({ where: { code: data.societyId } });
    if (!society) {
      throw new NotFoundAppError(`Sociedad con código ${data.societyId} no encontrada`, {
        societyCode: data.societyId,
      });
    }
    data.societyId = society.id;
  }

  await assertSupplierPartner(data.providerId);

  const created = await prisma.purchase.create({
    data,
    include: {
      purchaseDetails: true
    }
  })

  await invalidatePurchaseCaches(data.societyId);

  return created;
}

export const updatePurchase = async (id: string, data: UpdatePurchaseInput) => {
  if (data.providerId) {
    await assertSupplierPartner(data.providerId);
  }

  const currentPurchase = await prisma.purchase.findUnique({
    where: { id },
    include: { purchaseDetails: true }
  });

  if (!currentPurchase) throw new NotFoundAppError('Compra no encontrada', { purchaseId: id });

  const isCompleting = shouldCompletePurchase(currentPurchase.status, data.status);
  if (isCompleting) {
    assertPurchaseCanBeCompleted(currentPurchase);
  }

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.purchase.update({
      where: { id },
      data,
      include: {
        purchaseDetails: true
      }
    });

    if (isCompleting) {
      await applyPurchaseCompletionEffects(tx, updated);
    }

    return updated;
  });

  await invalidatePurchaseCaches(result.societyId, id);

  return result;
}

export const deletePurchase = async (id: string, deletedBy?: string) => {
  const deleted = await prisma.purchase.update({
    where: { id },
    data: {
      status: 'REJECTED',
      updatedBy: deletedBy,
    },
  });

  await invalidatePurchaseCaches(deleted.societyId, id);

  return deleted;
}
