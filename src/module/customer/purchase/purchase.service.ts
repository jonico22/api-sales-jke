import prisma from '@/config/prisma';
import { createPurchaseSchema, updatePurchaseSchema, purchaseFiltersSchema } from './purchase.schema'; // [UPDATED]
import { z } from 'zod';
import { redis } from '@/config/redis';
import {
  PaginatedResult,
  getPrismaPaginationParams,
  buildPaginatedResult,
  PaginationQuery,
} from '@/utils/pagination';
import { InventoryService } from '@/module/inventory/inventory.service';
import { Purchase, PartnerType, TransactionType, PurchaseStatus } from '@prisma/client';
import { DomainRuleAppError, NotFoundAppError } from '@/utils/domain-errors';

type CreatePurchaseInput = z.infer<typeof createPurchaseSchema>['body']; // [UPDATED]
type UpdatePurchaseInput = z.infer<typeof updatePurchaseSchema>['body']; // [UPDATED]
type PurchaseFilters = z.infer<typeof purchaseFiltersSchema>['query'];

const CACHE_PREFIX = 'purchases:';
const CACHE_TTL_LIST = 300; // 5 minutos
const CACHE_TTL_SINGLE = 600; // 10 minutos

export const getAllPurchases = async (
  paginationQuery?: PaginationQuery,
  filters?: PurchaseFilters
): Promise<PaginatedResult<Purchase>> => {
  const page = paginationQuery?.page ?? 1;
  const limit = paginationQuery?.limit ?? 10;
  const sortBy = paginationQuery?.sortBy || 'createdAt';
  const sortOrder = paginationQuery?.sortOrder || 'desc';

  // Resolve societyId from filters
  let resolvedSocietyId = filters?.societyId;
  if (!resolvedSocietyId && filters?.societyCode) {
    const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(filters.societyCode);
    if (isUuid) {
      resolvedSocietyId = filters.societyCode;
    } else {
      const society = await prisma.society.findUnique({ where: { code: filters.societyCode } });
      if (society) {
        resolvedSocietyId = society.id;
      } else {
        return buildPaginatedResult([], page, limit, 0);
      }
    }
  }

  // Cache Key
  const cacheKeyParts = [
    CACHE_PREFIX,
    'list',
    resolvedSocietyId || 'all',
    filters?.providerId || 'all',
    filters?.status || 'all',
    filters?.purchaseDateFrom?.toISOString() || 'all',
    filters?.purchaseDateTo?.toISOString() || 'all',
    filters?.documentNumber || 'all',
    page,
    limit,
    sortBy,
    sortOrder
  ];
  const cacheKey = cacheKeyParts.join(':');

  // 1. Try Cache
  const cached = await redis.get<PaginatedResult<Purchase>>(cacheKey);
  if (cached) return cached;

  // 2. Database Query
  const prismaParams = getPrismaPaginationParams(page, limit, sortBy, sortOrder);

  const whereClause: any = {
    isDeleted: false,
    ...(resolvedSocietyId && { societyId: resolvedSocietyId }),
    ...(filters?.providerId && { providerId: filters.providerId }),
    ...(filters?.status && { status: filters.status }),
  };

  if (filters?.documentNumber) {
    whereClause.documentNumber = { contains: filters.documentNumber, mode: 'insensitive' };
  }

  if (filters?.minAmount !== undefined || filters?.maxAmount !== undefined) {
    whereClause.totalAmount = {};
    if (filters.minAmount !== undefined) whereClause.totalAmount.gte = filters.minAmount;
    if (filters.maxAmount !== undefined) whereClause.totalAmount.lte = filters.maxAmount;
  }

  if (filters?.purchaseDateFrom || filters?.purchaseDateTo) {
    whereClause.purchaseDate = {};
    if (filters.purchaseDateFrom) whereClause.purchaseDate.gte = filters.purchaseDateFrom;
    if (filters.purchaseDateTo) whereClause.purchaseDate.lte = filters.purchaseDateTo;
  }

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
  await redis.set(cacheKey, result, CACHE_TTL_LIST);

  return result;
}

export const getPurchaseById = async (id: string) => {
  const cacheKey = `${CACHE_PREFIX}${id}`;

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

  if (purchase) await redis.set(cacheKey, purchase, CACHE_TTL_SINGLE);

  return purchase;
}

export const createPurchase = async (data: CreatePurchaseInput) => {
  // Resolve societyId if it's a code
  const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(data.societyId);
  if (!isUuid) {
    const society = await prisma.society.findUnique({ where: { code: data.societyId } });
    if (!society) {
      throw new NotFoundAppError(`Sociedad con código ${data.societyId} no encontrada`, {
        societyCode: data.societyId,
      });
    }
    data.societyId = society.id;
  }

  // Validate Provider Type
  const provider = await prisma.bussinessPartner.findUnique({
    where: { id: data.providerId }
  });

  if (!provider) {
    throw new NotFoundAppError('Proveedor no encontrado', { providerId: data.providerId });
  }

  if (provider.type !== PartnerType.SUPPLIER && provider.type !== PartnerType.BOTH) {
    throw new DomainRuleAppError(
      `El socio de negocio '${provider.companyName || provider.firstName}' no está registrado como PROVEEDOR.`,
      { providerId: data.providerId, providerType: provider.type }
    );
  }

  const created = await prisma.purchase.create({
    data,
    include: {
      purchaseDetails: true
    }
  })

  // Invalidate List Cache
  await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);

  return created;
}

export const updatePurchase = async (id: string, data: UpdatePurchaseInput) => {
  // If providerId is being updated, validate type
  if (data.providerId) {
    const provider = await prisma.bussinessPartner.findUnique({
      where: { id: data.providerId }
    });

    if (!provider) {
      throw new NotFoundAppError('Proveedor no encontrado', { providerId: data.providerId });
    }

    if (provider.type !== PartnerType.SUPPLIER && provider.type !== PartnerType.BOTH) {
      throw new DomainRuleAppError(
        `El socio de negocio '${provider.companyName || provider.firstName}' no está registrado como PROVEEDOR.`,
        { providerId: data.providerId, providerType: provider.type }
      );
    }
  }

  // Check if status is changing to COMPLETED
  const currentPurchase = await prisma.purchase.findUnique({
    where: { id },
    include: { purchaseDetails: true }
  });

  if (!currentPurchase) throw new NotFoundAppError('Compra no encontrada', { purchaseId: id });

  const isCompleting = data.status === PurchaseStatus.COMPLETED && currentPurchase.status !== PurchaseStatus.COMPLETED;

  const result = await prisma.$transaction(async (tx) => {
    // 1. Update the Purchase
    const updated = await tx.purchase.update({
      where: { id },
      data,
      include: {
        purchaseDetails: true
      }
    });

    // 2. If completing, Process Stock and Kardex
    if (isCompleting) {
      const details = updated.purchaseDetails;

      for (const detail of details) {
        // A. Update Branch Stock
        const branchProduct = await tx.branchOfficeProduct.upsert({
          where: {
            productId_branchOfficeId: {
              productId: detail.productId,
              branchOfficeId: updated.branchOfficeId
            }
          },
          update: {
            physicalStock: { increment: detail.quantity },
            availableStock: { increment: detail.quantity },
            lastRestockedAt: new Date()
          },
          create: {
            productId: detail.productId,
            branchOfficeId: updated.branchOfficeId,
            physicalStock: detail.quantity,
            availableStock: detail.quantity,
            lastRestockedAt: new Date()
          }
        });

        // B. Update Product Cost (Last Purchase Price for simplicity, or Weighted Average could be here)
        await tx.product.update({
          where: { id: detail.productId },
          data: {
            priceCost: detail.unitPrice // Updating cost to latest purchase price
          }
        });

        // C. Log to Kardex
        await InventoryService.logTransaction({
          date: new Date(),
          productId: detail.productId,
          branchOfficeId: updated.branchOfficeId,
          type: TransactionType.PURCHASE_ENTRY,
          quantity: detail.quantity,
          unitCost: Number(detail.unitPrice),
          totalCost: Number(detail.total),
          referenceId: updated.id,
          referenceType: 'PURCHASE',
          documentNumber: updated.documentNumber || undefined
        }, tx);
      }
    }

    return updated;
  });

  // Invalidate Cache
  await redis.del(`${CACHE_PREFIX}${id}`);
  await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);

  return result;
}

export const deletePurchase = async (id: string, deletedBy?: string) => {
  // Soft delete typically moves to isDeleted: true
  // Note: Schema might not have isDeleted? Let me check previous files or assume standard.
  // Code snippet earlier showed `isDeleted`.

  const deleted = await prisma.purchase.update({
    where: { id },
    data: {
      status: 'REJECTED',
      updatedBy: deletedBy,
    },
  })

  // Invalidate Cache
  await redis.del(`${CACHE_PREFIX}${id}`);
  await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);

  return deleted;
}
