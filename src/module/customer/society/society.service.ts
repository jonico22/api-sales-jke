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
        const legalEntity = await tx.bussinessPartner.create({
          data: {
            societyId: createdSociety.id,
            type: PartnerType.BOTH, // The society itself acts as both Customer (inter-company) and Supplier
            typeBP: 'COMPANY', // Hardcoded as Company for the Society itself
            companyName: businessName,
            tradeName: tradeName,
            documentNumber: ruc,
            // If ruc provided, try to find DocumentType? For now assuming standard handling or manual mapping if needed. 
            // In schema 'typeDocId' is optional. We could default to 'RUC' if we fetched it, but keeping it simple.
            address: address,
            email: email || `legal.${createdSociety.code}@placeholder.com`, // Email is unique, fallback if not provided?
            // Better to ONLY set if email is truthy. 
            // But schema says email is String @unique (Required). 
            // Reviewing schema: email String @unique.
            // So we MUST provide an email.
            phone: phone,
            isActive: true,
            isDeleted: false,
          }
        });

        // C. Link back to Society
        await tx.society.update({
          where: { id: createdSociety.id },
          data: { legalEntityId: legalEntity.id }
        });

        // Return updated society with legal entity? 
        // For consistency, we might just return the originally created one, 
        // or re-fetch if we need the legalEntity populated. 
        // The original return 'created' was 'include: ...'. 
        // Let's stick to returning 'createdSociety' but usually the caller might want to know about the legal link.
        // We can attach the legalEntityId manually to the result object if needed.
        createdSociety.legalEntityId = legalEntity.id;
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
  ): Promise<PaginatedResult<Society>> => {
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
    const cached = await redis.get<PaginatedResult<Society>>(cacheKey);
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
        include: { mainCurrency: true, taxes: true, logo: true }
      }),
      prisma.society.count({ where: whereClause }),
    ]);

    // Format Dates
    const formattedData = data.map(item => ({
      ...item,
      createdAt: formatToLimaTime(item.createdAt) as any,
      updatedAt: item.updatedAt ? formatToLimaTime(item.updatedAt) as any : item.updatedAt,
    }));

    const result = buildPaginatedResult(formattedData, page, limit, total);

    // 3. Set Cache
    await redis.set(cacheKey, result, CACHE_TTL_LIST);

    return result;
  },

  getByCode: async (code: string) => {
    const cacheKey = `${CACHE_PREFIX}${code}`;

    const cached = await redis.get<Society>(cacheKey);
    if (cached) return cached;

    const society = await prisma.society.findUnique({
      where: { code },
      include: { mainCurrency: true, taxes: true, logo: true }
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
      include: { mainCurrency: true, taxes: true, logo: true }
    });

    // Invalidate Cache
    await redis.del(`${CACHE_PREFIX}${code}`); // Invalidate single
    await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);
    await redis.deleteKeysByPrefix(`${CACHE_PREFIX}select:`);

    return updated;
  },

  delete: async (code: string) => {
    // Soft Delete usually implies updating isActive/isDeleted, but schema might not have isDeleted on Society?
    // Checking previous code: it was 'prisma.society.delete'. If we want soft delete standard, we need to check schema.
    // Assuming hard delete for now based on previous code, OR check if Society has isDeleted.
    // Schema lines 135: `isDeleted Boolean @default(false)`. Yes, it has it.

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
