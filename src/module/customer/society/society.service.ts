
import prisma from '@/config/prisma';
import { redis } from '@/config/redis';
import { Society, PartnerType } from '@prisma/client';
import {
  PaginatedResult,
  getPrismaPaginationParams,
  buildPaginatedResult,
  PaginationQuery,
} from '@/utils/pagination';
import { formatToLimaTime, convertLimaDateRangeToUTC } from '@/utils/dateFormatter';

// Constantes de cache
const CACHE_PREFIX = 'societies:';
const CACHE_TTL_LIST = 300; // 5 minutos
const CACHE_TTL_SINGLE = 600; // 10 minutos
const CACHE_TTL_SELECT = 900; // 15 minutos

export interface SocietyFilters {
  search?: string;
  isActive?: boolean;
  createdBy?: string;
  createdAtFrom?: string;
  createdAtTo?: string;
  updatedAtFrom?: string;
  updatedAtTo?: string;
}

export const SocietyService = {

  create: async (data: any) => {
    let { taxIds, mainCurrencyId, ...rest } = data;
    // Extract Legal Entity data
    const { ruc, businessName, tradeName, address, email, phone, ...societyData } = rest;

    // 1. Default Currency: PEN
    if (!mainCurrencyId) {
      const defaultCurrency = await prisma.currency.findUnique({ where: { code: 'PEN' } });
      if (defaultCurrency) mainCurrencyId = defaultCurrency.id;
    }

    // 2. Default Tax: IGV
    if (!taxIds || taxIds.length === 0) {
      const defaultTax = await prisma.tax.findUnique({ where: { code: 'IGV' } });
      if (defaultTax) taxIds = [defaultTax.id];
    }

    // Use transaction to handle Society + Legal Entity (BusinessPartner)
    const result = await prisma.$transaction(async (tx) => {
      // A. Create Society
      const createdSociety = await tx.society.create({
        data: {
          ...societyData,
          ...(mainCurrencyId && { mainCurrency: { connect: { id: mainCurrencyId } } }),
          ...(taxIds && taxIds.length > 0 && {
            taxes: { connect: taxIds.map((id: string) => ({ id })) }
          }),
          // Create default Branch Office
          BranchOffice: {
            create: {
              name: 'Oficina Principal',
              code: 'ALM-PRINCIPAL',
              isMain: true,
              isActive: true,
              address: address || undefined, // Use legal address if provided
              phone: phone || undefined,
              email: email || undefined
            }
          }
        },
        include: { mainCurrency: true, taxes: true, logo: true }
      });

      // B. Optional: Create Legal Entity (BusinessPartner)
      if (ruc || businessName) {
        // Check if a BusinessPartner with this RUC already exists
        let legalEntity = null;
        if (ruc) {
          legalEntity = await tx.bussinessPartner.findUnique({
            where: { documentNumber: ruc }
          });
        }

        if (!legalEntity && (ruc || businessName)) {
          // si enviar el ruc debe asociarle el tipo de documento
          const documentType = await tx.documentType.findUnique({ where: { code: 'RUC' } });

          legalEntity = await tx.bussinessPartner.create({
            data: {
              societyId: createdSociety.id,
              type: PartnerType.BOTH,
              typeBP: 'COMPANY',
              tradeName: tradeName,
              // Ensure null if empty string to avoid unique constraint issues
              documentNumber: ruc || null,
              typeDocId: ruc ? documentType?.id : null,
              address: address,
              // Check if email provided, else generic
              email: email || `legal.${createdSociety.code}.${Date.now()}@placeholder.com`,
              phone: phone,
              isActive: true,
              isDeleted: false,
            }
          });
        }

        // C. Link back to Society
        if (legalEntity) {
          await tx.society.update({
            where: { id: createdSociety.id },
            data: { legalEntityId: legalEntity.id }
          });
          // Update local object reference
          createdSociety.legalEntityId = legalEntity.id;
        }
      }

      // D. Create "General Public" BusinessPartner (Default Customer)
      await tx.bussinessPartner.create({
        data: {
          societyId: createdSociety.id,
          type: PartnerType.CUSTOMER, // General Public is a Customer
          typeBP: 'PERSON',
          firstName: 'PÚBLICO',
          lastName: 'GENERAL',
          email: `general.${createdSociety.code}@system.local`, // Ensure uniqueness per society
          documentNumber: null, // Allowed by Postgres unique constraint (multiple nulls)
          isActive: true,
          isDeleted: false,
        }
      });

      return createdSociety;
    });

    // Invalidate Cache
    await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);
    await redis.deleteKeysByPrefix(`${CACHE_PREFIX}select:`);

    return result;
  },

  getAll: async (
    paginationQuery?: PaginationQuery,
    filters?: SocietyFilters
  ): Promise<PaginatedResult<any>> => { // Change return type to any since shape is custom
    const page = paginationQuery?.page ?? 1;
    const limit = paginationQuery?.limit ?? 10;
    const sortBy = paginationQuery?.sortBy ?? 'createdAt';
    const sortOrder = paginationQuery?.sortOrder ?? 'desc';

    // Cache Key
    const cacheKeyParts = [
      CACHE_PREFIX,
      'list',
      filters?.isActive !== undefined ? filters.isActive : 'all',
      filters?.search || 'all',
      filters?.createdAtFrom || 'all',
      filters?.createdAtTo || 'all',
      page,
      limit,
      sortBy,
      sortOrder
    ];
    const cacheKey = cacheKeyParts.join(':');

    // 1. Try Cache
    const cached = await redis.get<PaginatedResult<any>>(cacheKey);
    if (cached) return cached;

    // 2. Database Query
    const prismaParams = getPrismaPaginationParams(page, limit, sortBy, sortOrder);
    const whereClause: any = { isDeleted: false };

    if (filters?.search) {
      whereClause.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { code: { contains: filters.search, mode: 'insensitive' } }
      ];
    }

    if (filters?.isActive !== undefined) {
      whereClause.isActive = filters.isActive;
    }

    if (filters?.createdAtFrom || filters?.createdAtTo) {
      whereClause.createdAt = {};
      const dateRange = convertLimaDateRangeToUTC(filters.createdAtFrom, filters.createdAtTo);
      if (dateRange.from) whereClause.createdAt.gte = dateRange.from;
      if (dateRange.to) whereClause.createdAt.lte = dateRange.to;
    }

    const [data, total] = await prisma.$transaction([
      prisma.society.findMany({
        where: whereClause,
        skip: prismaParams.skip,
        take: prismaParams.take,
        orderBy: prismaParams.orderBy ?? { createdAt: sortOrder },
        include: {
          mainCurrency: true,
          taxes: true,
          logo: true,
          legalEntity: true
        }
      }),
      prisma.society.count({ where: whereClause }),
    ]);

    const result = buildPaginatedResult(data, page, limit, total);

    // 3. Set Cache
    await redis.set(cacheKey, result, CACHE_TTL_LIST);

    return result;
  },

  getByCode: async (code: string) => {
    const cacheKey = `${CACHE_PREFIX}${code}`;

    const cached = await redis.get<any>(cacheKey);
    if (cached) return cached;

    const society = await prisma.society.findUnique({
      where: { code },
      select: {
        id: true,
        name: true,
        code: true,
        isActive: true,
        legalEntityId: true,
        stockNotificationFrequency: true,
        salesNotificationFrequency: true,
        backupFrequency: true,
        dataRetentionDays: true,
        uiConfig: true,
        mainCurrency: {
          select: { id: true, name: true, code: true, symbol: true }
        },
        taxes: {
          select: { id: true, name: true, value: true, code: true }
        },
        logo: {
          select: { id: true, path: true }
        },
        legalEntity: true,
        // Optional: Regional configs if needed by frontend logic (formats etc), 
        // but strictly removing dates/users as requested.
        subscriptionId: true, // Needed for permission checks usually
      }
    });

    if (society) await redis.set(cacheKey, society, CACHE_TTL_SINGLE);

    return society;
  },

  update: async (code: string, data: any) => {
    const { taxIds, mainCurrencyId, ...rest } = data;

    const updated = await prisma.society.update({
      where: { code },
      data: {
        ...rest,
        ...(mainCurrencyId && { mainCurrency: { connect: { id: mainCurrencyId } } }),
        ...(taxIds && {
          taxes: { set: taxIds.map((id: string) => ({ id })) }
        })
      },
      // Return full object on update or optimized? usually full to update state
      // but let's keep it consistent with getByCode for now or let it return default include
      select: {
        id: true,
        name: true,
        code: true,
        isActive: true,
        mainCurrency: {
          select: { id: true, name: true, code: true, symbol: true }
        },
        taxes: {
          select: { id: true, name: true, value: true, code: true }
        },
        logo: {
          select: { id: true, path: true }
        }
      }
    });

    // Invalidate Cache
    await redis.del(`${CACHE_PREFIX}${code}`); // Invalidate single
    await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);
    await redis.deleteKeysByPrefix(`${CACHE_PREFIX}select:`);

    return updated;
  },

  delete: async (code: string) => {
    // Soft Delete
    const deleted = await prisma.society.update({
      where: { code },
      data: { isDeleted: true, isActive: false }
    });

    await redis.del(`${CACHE_PREFIX}${code}`);
    await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);
    await redis.deleteKeysByPrefix(`${CACHE_PREFIX}select:`);

    return deleted;
  }
};
