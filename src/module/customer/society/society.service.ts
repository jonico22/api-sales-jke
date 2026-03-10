
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
const CACHE_TTL_SINGLE = 1800; // 30 minutos (society config cambia poco)
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

    // ─── 1. PARALLEL: Default Currency + Tax ─────────────────────────
    const [defaultCurrency, defaultTax] = await Promise.all([
      !mainCurrencyId ? prisma.currency.findUnique({ where: { code: 'PEN' } }) : null,
      !taxIds || taxIds.length === 0 ? prisma.tax.findUnique({ where: { code: 'IGV' } }) : null
    ]);

    if (!mainCurrencyId && defaultCurrency) mainCurrencyId = defaultCurrency.id;
    if ((!taxIds || taxIds.length === 0) && defaultTax) taxIds = [defaultTax.id];

    // ─── 2. Transacción de creación ──────────────────────────────────
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
              address: address || undefined,
              phone: phone || undefined,
              email: email || undefined
            }
          }
        },
        include: { mainCurrency: true, taxes: true, logo: true }
      });

      // B. Optional: Create Legal Entity (BusinessPartner)
      if (ruc || businessName) {
        let legalEntity = null;
        if (ruc) {
          legalEntity = await tx.bussinessPartner.findUnique({
            where: { documentNumber: ruc }
          });
        }

        if (!legalEntity && (ruc || businessName)) {
          const documentType = await tx.documentType.findUnique({ where: { code: 'RUC' } });

          legalEntity = await tx.bussinessPartner.create({
            data: {
              societyId: createdSociety.id,
              type: PartnerType.BOTH,
              typeBP: 'COMPANY',
              tradeName: tradeName,
              documentNumber: ruc || null,
              typeDocId: ruc ? documentType?.id : null,
              address: address,
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
          createdSociety.legalEntityId = legalEntity.id;
        }
      }

      // D. Create "General Public" BusinessPartner (Default Customer)
      await tx.bussinessPartner.create({
        data: {
          societyId: createdSociety.id,
          type: PartnerType.CUSTOMER,
          typeBP: 'PERSON',
          firstName: 'PÚBLICO',
          lastName: 'GENERAL',
          email: `general.${createdSociety.code}@system.local`,
          documentNumber: null,
          isActive: true,
          isDeleted: false,
        }
      });

      return createdSociety;
    });

    // ─── 3. BACKGROUND: Cache Invalidation ────────────────────────────
    setImmediate(async () => {
      try {
        await Promise.all([
          redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`),
          redis.deleteKeysByPrefix(`${CACHE_PREFIX}select:`)
        ]);
      } catch (error) {
        console.error('[SocietyService] ❌ Error en background (create):', error);
      }
    });

    return result;
  },

  getById: async (id: string) => {
    const cacheKey = `${CACHE_PREFIX}${id}`;
    const cached = await redis.get<Society>(cacheKey);
    if (cached) return cached;

    const society = await prisma.society.findUnique({
      where: { id },
      include: {
        legalEntity: true,
        mainCurrency: true,
        logo: true
      }
    });

    if (society) await redis.set(cacheKey, society, CACHE_TTL_SINGLE);
    return society;
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
    const cacheKey = `${CACHE_PREFIX}code:${code.toUpperCase()}`;

    const cached = await redis.get<any>(cacheKey);
    if (cached) return cached;

    const society = await prisma.society.findUnique({
      where: { code: code },
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
        storageLimit: true,
        maxUsers: true,
        maxProducts: true,
        usedStorage: true,
        totalProducts: true,
        totalUsers: true,
        mainCurrency: {
          select: { id: true, name: true, code: true, symbol: true }
        },
        taxes: {
          select: { id: true, name: true, value: true, code: true }
        },
        logo: {
          select: { id: true, path: true }
        },
        legalEntity: {
          select: {
            id: true,
            companyName: true,
            tradeName: true,
            documentNumber: true,
            address: true,
            email: true,
            phone: true,
          }
        },
        subscriptionId: true,
      }
    });

    if (society) await redis.set(cacheKey, society, CACHE_TTL_SINGLE);

    return society;
  },

  update: async (code: string, data: any) => {
    const { taxIds, mainCurrencyId, logoId, ...rest } = data;

    const updated = await prisma.society.update({
      where: { code },
      data: {
        ...rest,
        ...(logoId && { logo: { connect: { id: logoId } } }), // Usar sintaxis relacional imperativa
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
        storageLimit: true,
        maxUsers: true,
        maxProducts: true,
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

    // ─── BACKGROUND: Cache Invalidation ────────────────────────────
    const updatedId = updated.id;
    setImmediate(async () => {
      try {
        await Promise.all([
          redis.del(`${CACHE_PREFIX}code:${code.toUpperCase()}`),
          redis.del(`${CACHE_PREFIX}${code}`),
          redis.del(`${CACHE_PREFIX}${updatedId}`),
          redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`),
          redis.deleteKeysByPrefix(`${CACHE_PREFIX}select:`)
        ]);
      } catch (error) {
        console.error('[SocietyService] ❌ Error en background (update):', error);
      }
    });

    return updated;
  },

  delete: async (code: string) => {
    // Soft Delete
    const deleted = await prisma.society.update({
      where: { code },
      data: { isDeleted: true, isActive: false }
    });

    // ─── BACKGROUND: Cache Invalidation ────────────────────────────
    setImmediate(async () => {
      try {
        await Promise.all([
          redis.del(`${CACHE_PREFIX}code:${code.toUpperCase()}`),
          redis.del(`${CACHE_PREFIX}${code}`),
          redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`),
          redis.deleteKeysByPrefix(`${CACHE_PREFIX}select:`)
        ]);
      } catch (error) {
        console.error('[SocietyService] ❌ Error en background (delete):', error);
      }
    });

    return deleted;
  }
};
