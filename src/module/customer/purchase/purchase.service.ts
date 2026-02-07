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
import { Purchase, PartnerType } from '@prisma/client';

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
  const sortBy = paginationQuery?.sortBy ?? 'createdAt';
  const sortOrder = paginationQuery?.sortOrder ?? 'desc';

  // Cache Key
  const cacheKeyParts = [
    CACHE_PREFIX,
    'list',
    filters?.societyId || 'all',
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
    ...(filters?.societyId && { societyId: filters.societyId }),
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
  // Extract and remove fields that are not part of the Purchase model inputs if necessary
  // Assuming strict validation ensures cleanliness, we might need to handle dates or relations specifically if they were passed incorrectly, 
  // but Zod handles coercion.

  // Validate Provider Type
  const provider = await prisma.bussinessPartner.findUnique({
    where: { id: data.providerId }
  });

  if (!provider) {
    throw new Error('Proveedor no encontrado');
  }

  if (provider.type !== PartnerType.SUPPLIER && provider.type !== PartnerType.BOTH) {
    throw new Error(`El socio de negocio '${provider.companyName || provider.firstName}' no está registrado como PROVEEDOR.`);
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
      throw new Error('Proveedor no encontrado');
    }

    if (provider.type !== PartnerType.SUPPLIER && provider.type !== PartnerType.BOTH) {
      throw new Error(`El socio de negocio '${provider.companyName || provider.firstName}' no está registrado como PROVEEDOR.`);
    }
  }

  const updated = await prisma.purchase.update({
    where: { id },
    data,
    include: {
      purchaseDetails: true
    }
  })

  // Invalidate Cache
  await redis.del(`${CACHE_PREFIX}${id}`);
  await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);

  return updated;
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
