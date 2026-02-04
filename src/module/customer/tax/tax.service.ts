import prisma from '@/config/prisma';
import { createTaxSchema } from './tax.validation';
import { z } from 'zod';

type CreateTaxInput = z.infer<typeof createTaxSchema>['body'];

export const TaxService = {
    create: async (data: CreateTaxInput) => {
        return prisma.tax.create({ data });
    },

    /**
     * Obtiene todos los impuestos Globales (societyId = null) 
     * Y los propios de la society solicitante.
     */
    findAll: async (filters: { societyId?: string; search?: string }) => {
        const whereClause: any = {
            isActive: true,
            OR: [
                { societyId: null }, // Globales
            ]
        };

        if (filters.societyId) {
            whereClause.OR.push({ societyId: filters.societyId });
        }

        if (filters.search) {
            whereClause.AND = [
                {
                    OR: [
                        { name: { contains: filters.search, mode: 'insensitive' } },
                        { code: { contains: filters.search, mode: 'insensitive' } }
                    ]
                }
            ];
        }

        return prisma.tax.findMany({
            where: whereClause,
            orderBy: { name: 'asc' }
        });
    },

    findById: async (id: string) => {
        return prisma.tax.findUnique({ where: { id } });
    },

    update: async (id: string, data: any) => {
        return prisma.tax.update({ where: { id }, data });
    },

    delete: async (id: string) => {
        // Soft-delete o hard delete si prefieres? Por ahora inactive
        return prisma.tax.update({ where: { id }, data: { isActive: false } });
    }
};
