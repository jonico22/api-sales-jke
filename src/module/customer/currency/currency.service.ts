import prisma from '@/config/prisma';
import { createCurrencySchema } from './currency.validation';
import { z } from 'zod';

type CreateCurrencyInput = z.infer<typeof createCurrencySchema>['body'];

export const CurrencyService = {
    create: async (data: CreateCurrencyInput) => {
        return prisma.currency.create({ data });
    },

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

        return prisma.currency.findMany({
            where: whereClause,
            orderBy: { code: 'asc' }
        });
    },

    findById: async (id: string) => {
        return prisma.currency.findUnique({ where: { id } });
    },

    update: async (id: string, data: any) => {
        return prisma.currency.update({ where: { id }, data });
    }
};
