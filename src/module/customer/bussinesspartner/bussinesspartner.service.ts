import prisma from '@/config/prisma';
import { z } from 'zod';
import { CreateBussinessPartnerInput, UpdateBussinessPartnerInput } from './bussinesspartner.schema';
import {
    PaginatedResult,
    getPrismaPaginationParams,
    buildPaginatedResult,
    PaginationQuery,
} from '@/utils/pagination';
import { BussinessPartner } from '@prisma/client';

export const BussinessPartnerService = {
    /**
     * Obtener todos los socios de negocio con paginación
     */
    async getAll(
        paginationQuery?: PaginationQuery,
        societyId?: string
    ): Promise<PaginatedResult<BussinessPartner>> {
        const page = paginationQuery?.page ?? 1;
        const limit = paginationQuery?.limit ?? 10;
        const sortBy = paginationQuery?.sortBy;
        const sortOrder = paginationQuery?.sortOrder ?? 'desc';

        const prismaParams = getPrismaPaginationParams(page, limit, sortBy, sortOrder);

        const whereClause = {
            isDeleted: false,
            ...(societyId && { societyId }),
        };

        const [data, total] = await prisma.$transaction([
            prisma.bussinessPartner.findMany({
                where: whereClause,
                skip: prismaParams.skip,
                take: prismaParams.take,
                orderBy: prismaParams.orderBy ?? { createdAt: sortOrder },
                include: {
                    documentType: true,
                    society: {
                        select: {
                            id: true,
                            name: true,
                            code: true,
                        },
                    },
                },
            }),
            prisma.bussinessPartner.count({ where: whereClause }),
        ]);

        return buildPaginatedResult(data, page, limit, total);
    },

    /**
     * Obtener un socio de negocio por ID
     */
    async getById(id: string) {
        return prisma.bussinessPartner.findFirst({
            where: { id, isDeleted: false },
            include: {
                documentType: true,
                society: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                    },
                },
            },
        });
    },

    /**
     * Crear un nuevo socio de negocio
     */
    async create(data: CreateBussinessPartnerInput) {
        return prisma.bussinessPartner.create({
            data: data as any, // Type assertion needed due to Zod/Prisma type mismatch
            include: {
                documentType: true,
                society: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                    },
                },
            },
        });
    },

    /**
     * Actualizar un socio de negocio
     */
    async update(id: string, data: UpdateBussinessPartnerInput) {
        return prisma.bussinessPartner.update({
            where: { id },
            data,
            include: {
                documentType: true,
                society: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                    },
                },
            },
        });
    },

    /**
     * Soft delete de un socio de negocio
     */
    async softDelete(id: string, updatedBy?: string) {
        return prisma.bussinessPartner.update({
            where: { id },
            data: {
                isDeleted: true,
                isActive: false,
                updatedBy,
            },
        });
    },

    /**
     * Hard delete de un socio de negocio (usar con precaución)
     */
    async hardDelete(id: string) {
        return prisma.bussinessPartner.delete({
            where: { id },
        });
    },

    /**
     * Buscar socios de negocio por email
     */
    async findByEmail(email: string) {
        return prisma.bussinessPartner.findUnique({
            where: { email },
            include: {
                documentType: true,
            },
        });
    },

    /**
     * Buscar socios de negocio por número de documento
     */
    async findByDocumentNumber(documentNumber: string) {
        return prisma.bussinessPartner.findUnique({
            where: { documentNumber },
            include: {
                documentType: true,
            },
        });
    },
};
