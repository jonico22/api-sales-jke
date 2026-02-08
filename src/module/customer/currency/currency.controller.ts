import { Request, Response } from 'express';
import { CurrencyService } from './currency.service';
import { createCurrencySchema, updateCurrencySchema, currencyFiltersSchema } from './currency.validation';

import { paginationQuerySchema } from '@/schemas/pagination.schema';

export const CurrencyController = {
    getAll: async (req: Request, res: Response) => {
        const paginationParse = paginationQuerySchema.safeParse({ query: req.query });
        const filtersParse = currencyFiltersSchema.safeParse({ query: req.query });

        if (!paginationParse.success || !filtersParse.success) {
            return res.status(400).json({
                ...(paginationParse.error?.format?.() ?? {}),
                ...(filtersParse.error?.format?.() ?? {}),
            });
        }

        const result = await CurrencyService.getAll(
            paginationParse.data.query,
            filtersParse.data.query
        );
        res.json(result);
    },

    getForSelect: async (req: Request, res: Response) => {
        try {
            const result = await CurrencyService.getForSelect();
            res.json(result);
        } catch (error: any) {
            res.status(500).json({ message: 'Error retrieving currencies', error: error.message });
        }
    },

    create: async (req: Request, res: Response) => {
        const parse = createCurrencySchema.safeParse({ body: req.body });
        if (!parse.success) return res.status(400).json(parse.error.format());

        const result = await CurrencyService.create(parse.data.body);
        res.status(201).json(result);
    },

    update: async (req: Request, res: Response) => {
        const { id } = req.params;
        const parse = updateCurrencySchema.safeParse({ body: req.body });
        if (!parse.success) return res.status(400).json(parse.error.format());

        const result = await CurrencyService.update(id, parse.data.body);
        res.json(result);
    }
};
