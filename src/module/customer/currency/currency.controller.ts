import { Request, Response } from 'express';
import { CurrencyService } from './currency.service';
import { createCurrencySchema, updateCurrencySchema, currencyFiltersSchema } from './currency.validation';

import { paginationQuerySchema } from '@/schemas/pagination.schema';
import { asyncHandler } from '@/utils/asyncHandler';
import { formatSafeParseErrors, getQueryString } from '@/utils/controller-helpers';

export const CurrencyController = {
    getAll: asyncHandler(async (req: Request, res: Response) => {
        const paginationParse = paginationQuerySchema.safeParse({ query: req.query });
        const filtersParse = currencyFiltersSchema.safeParse({ query: req.query });

        if (!paginationParse.success || !filtersParse.success) {
            return res.status(400).json(formatSafeParseErrors(paginationParse, filtersParse));
        }

        const result = await CurrencyService.getAll(
            paginationParse.data.query,
            filtersParse.data.query
        );
        res.json(result);
    }),

    getForSelect: asyncHandler(async (req: Request, res: Response) => {
        const societyCode = getQueryString(req, 'societyCode', 'societyId');
        const result = await CurrencyService.getForSelect(societyCode);
        res.json(result);
    }),

    create: asyncHandler(async (req: Request, res: Response) => {
        const parse = createCurrencySchema.safeParse({ body: req.body });
        if (!parse.success) return res.status(400).json(parse.error.format());

        const result = await CurrencyService.create(parse.data.body);
        res.status(201).json(result);
    }),

    update: asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const parse = updateCurrencySchema.safeParse({ body: req.body });
        if (!parse.success) return res.status(400).json(parse.error.format());

        const result = await CurrencyService.update(id, parse.data.body);
        res.json(result);
    })
};
