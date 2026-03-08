import { z } from 'zod';

export const createCurrencySchema = z.object({
    body: z.object({
        name: z.string().min(1),
        code: z.string().min(3).max(3), // ISO Code usually 3 chars
        symbol: z.string().min(1),

        // Si se envía, es privado para esa Society
        societyId: z.string().uuid().optional(),

        isActive: z.boolean().default(true),
    })
});

export const updateCurrencySchema = z.object({
    body: createCurrencySchema.shape.body.partial()
});

export const currencyFiltersSchema = z.object({
    query: z.object({
        societyCode: z.string().optional(),
        societyId: z.string().optional(),
        search: z.string().optional(),
    })
});
