import { Request, Response } from 'express';
import { TaxService } from './tax.service';
import { createTaxSchema, updateTaxSchema, taxFiltersSchema } from './tax.validation';

export const TaxController = {
    getAll: async (req: Request, res: Response) => {
        const parse = taxFiltersSchema.safeParse({ query: req.query });
        if (!parse.success) return res.status(400).json(parse.error.format());

        // Se asume que el user tiene un societyId en su token/contexto, 
        // o se pasa por query params para filtrar
        const filters = {
            societyId: parse.data.query.societyId, // Puede venir del frontend si hay selector de society
            search: parse.data.query.search
        };

        const result = await TaxService.findAll(filters);
        res.json(result);
    },

    create: async (req: Request, res: Response) => {
        const parse = createTaxSchema.safeParse({ body: req.body });
        if (!parse.success) return res.status(400).json(parse.error.format());

        const result = await TaxService.create(parse.data.body);
        res.status(201).json(result);
    },

    update: async (req: Request, res: Response) => {
        // Simple update logic
        const { id } = req.params;
        const parse = updateTaxSchema.safeParse({ body: req.body });
        if (!parse.success) return res.status(400).json(parse.error.format());

        const result = await TaxService.update(id, parse.data.body);
        res.json(result);
    }
};
