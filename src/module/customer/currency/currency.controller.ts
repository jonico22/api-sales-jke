import { Request, Response } from 'express';
import { CurrencyService } from './currency.service';
import { createCurrencySchema, updateCurrencySchema, currencyFiltersSchema } from './currency.validation';

export const CurrencyController = {
    getAll: async (req: Request, res: Response) => {
        const parse = currencyFiltersSchema.safeParse({ query: req.query });
        if (!parse.success) return res.status(400).json(parse.error.format());

        // User context or query param
        const filters = {
            societyId: parse.data.query.societyId,
            search: parse.data.query.search
        };

        const result = await CurrencyService.findAll(filters);
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
