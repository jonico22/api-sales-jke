import { Request, Response } from 'express';
import { UnitOfMeasureService } from './unit-of-measure.service';
import { createUnitOfMeasureSchema, updateUnitOfMeasureSchema, unitOfMeasureIdSchema, unitOfMeasureFiltersSchema } from './unit-of-measure.schema';
import { paginationQuerySchema } from '@/schemas/pagination.schema';

export const UnitOfMeasureController = {
    getAll: async (req: Request, res: Response) => {
        const paginationParse = paginationQuerySchema.safeParse({ query: req.query });
        const filtersParse = unitOfMeasureFiltersSchema.safeParse({ query: req.query });

        if (!paginationParse.success || !filtersParse.success) {
            return res.status(400).json({
                ...(paginationParse.error?.format?.() ?? {}),
                ...(filtersParse.error?.format?.() ?? {}),
            });
        }

        const result = await UnitOfMeasureService.getAll(
            paginationParse.data.query,
            filtersParse.data.query
        );
        res.json(result);
    },

    getById: async (req: Request, res: Response) => {
        const parse = unitOfMeasureIdSchema.safeParse({ params: req.params });
        if (!parse.success) return res.status(400).json(parse.error.format());

        const item = await UnitOfMeasureService.getById(parse.data.params.id);
        if (!item) return res.status(404).json({ message: 'Unidad de medida no encontrada' });
        res.json(item);
    },

    create: async (req: Request, res: Response) => {
        const parse = createUnitOfMeasureSchema.safeParse({ body: req.body });
        if (!parse.success) return res.status(400).json(parse.error.format());

        try {
            const result = await UnitOfMeasureService.create(parse.data.body);
            res.status(201).json(result);
        } catch (error: any) {
            res.status(400).json({ message: error.message });
        }
    },

    update: async (req: Request, res: Response) => {
        const idParse = unitOfMeasureIdSchema.safeParse({ params: req.params });
        const bodyParse = updateUnitOfMeasureSchema.safeParse({ body: req.body });

        if (!idParse.success || !bodyParse.success) {
            return res.status(400).json({
                ...(idParse.error?.format?.() ?? {}),
                ...(bodyParse.error?.format?.() ?? {}),
            });
        }

        const result = await UnitOfMeasureService.update(idParse.data.params.id, bodyParse.data.body);
        res.json(result);
    },

    delete: async (req: Request, res: Response) => {
        const parse = unitOfMeasureIdSchema.safeParse({ params: req.params });
        if (!parse.success) return res.status(400).json(parse.error.format());

        const result = await UnitOfMeasureService.delete(parse.data.params.id, req.body?.updatedBy);
        res.json({ message: 'Unidad de medida eliminada', data: result });
    },

    getForSelect: async (req: Request, res: Response) => {
        const societyCode = (req.query.societyCode || req.query.societyId) as string | undefined;
        const result = await UnitOfMeasureService.getForSelect(societyCode);
        res.json(result);
    }
};
