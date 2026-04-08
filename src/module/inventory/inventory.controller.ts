
import { NextFunction, Request, Response } from 'express';
import { InventoryService } from './inventory.service';
import { inventoryFilterSchema, createAdjustmentSchema } from './inventory.schema';

export const InventoryController = {
    getAll: async (req: Request, res: Response, next: NextFunction) => {
        try {
            // Validate/Parse Query
            const validation = inventoryFilterSchema.safeParse({ query: req.query });

            if (!validation.success) {
                return res.status(400).json({
                    message: 'Parámetros inválidos',
                    errors: validation.error.format()
                });
            }

            const { query } = validation.data;

            // Convert query to PaginationQuery match
            // paginationQuery: { page: number, limit: number ... }
            const paginationQuery = {
                page: Number(query.page) || 1,
                limit: Number(query.limit) || 20,
                sortBy: 'date',
                sortOrder: 'desc' as const
            };

            const result = await InventoryService.getAll(paginationQuery, query);
            res.json(result);
        } catch (error: any) {
            next(error);
        }
    },

    createAdjustment: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const validation = createAdjustmentSchema.safeParse({ body: req.body });
            if (!validation.success) {
                return res.status(400).json({
                    message: 'Datos inválidos',
                    errors: validation.error.format()
                });
            }

            const result = await InventoryService.createAdjustment(validation.data.body);
            res.status(201).json(result);
        } catch (error: any) {
            next(error);
        }
    }
};
