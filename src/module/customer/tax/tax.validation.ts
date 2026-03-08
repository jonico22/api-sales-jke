import { z } from 'zod';
import { TaxType } from '@prisma/client';

export const createTaxSchema = z.object({
    body: z.object({
        code: z.string().min(1),
        name: z.string().min(1),
        value: z.number().min(0),
        type: z.nativeEnum(TaxType),
        description: z.string().optional(),

        // Si se envía, es privado para esa Society
        societyId: z.string().uuid().optional(),

        isActive: z.boolean().default(true),
    })
});

export const updateTaxSchema = z.object({
    body: createTaxSchema.shape.body.partial()
});

export const taxFiltersSchema = z.object({
    query: z.object({
        societyId: z.string().optional(), // Para filtrar los visibles por esta society
        search: z.string().optional(),
    })
});
