import { Request, Response } from 'express';
import { CashShiftService } from './cashShift.service';
import {
    openShiftSchema,
    closeShiftSchema,
    addManualMovementSchema,
    cashShiftIdSchema,
    cashShiftFiltersSchema
} from './cashShift.schema'; // [UPDATED]
import { paginationQuerySchema } from '@/schemas/pagination.schema';

export const CashShiftController = {

    openShift: async (req: Request, res: Response) => {
        try {
            const { body } = openShiftSchema.parse({ body: req.body }); // [UPDATED] Wrapped
            const shift = await CashShiftService.openShift(body);
            res.status(201).json(shift);
        } catch (error: any) {
            if (error.message.includes('ya tiene una caja abierta')) {
                return res.status(409).json({ message: error.message });
            }
            res.status(500).json({ message: 'Error abriendo caja', error: error.message });
        }
    },

    closeShift: async (req: Request, res: Response) => {
        try {
            const { params } = cashShiftIdSchema.parse({ params: req.params });
            const { body } = closeShiftSchema.parse({ body: req.body, params: req.params }); // Logic check: schema validation
            const data = { ...body, id: params.id };
            const shift = await CashShiftService.closeShift(data);
            res.json(shift);
        } catch (error: any) {
            if (error.message.includes('cerrada') || error.message.includes('no encontrada')) {
                return res.status(400).json({ message: error.message });
            }
            res.status(500).json({ message: 'Error cerrando caja', error: error.message });
        }
    },

    getById: async (req: Request, res: Response) => {
        try {
            const { params } = cashShiftIdSchema.parse({ params: req.params });
            const shift = await CashShiftService.getById(params.id);
            if (!shift) return res.status(404).json({ message: 'Caja no encontrada' });
            res.json(shift);
        } catch (error: any) {
            res.status(500).json({ message: 'Error obteniendo caja', error: error.message });
        }
    },

    getAll: async (req: Request, res: Response) => {
        try {
            const paginationParse = paginationQuerySchema.safeParse({ query: req.query });
            const filtersParse = cashShiftFiltersSchema.safeParse({ query: req.query });

            if (!paginationParse.success || !filtersParse.success) {
                return res.status(400).json({
                    ...(paginationParse.error?.format?.() ?? {}),
                    ...(filtersParse.error?.format?.() ?? {})
                });
            }

            const result = await CashShiftService.getAll(paginationParse.data.query, filtersParse.data.query);
            res.json(result);
        } catch (error: any) {
            res.status(500).json({ message: 'Error listando cajas', error: error.message });
        }
    },

    addManualMovement: async (req: Request, res: Response) => {
        try {
            // Manual movement requires ShiftID in body or params? Schema has it.
            // Usually POST /cash-shifts/:id/movements or POST /cash-movements
            // Let's assume POST /cash-shifts/movements and body has shiftId OR POST /cash-shifts/:id/movements
            // Design: "addManualMovementSchema" has shiftId. 
            // User might send it in body.
            // Also strictly we need userId who is adding this.
            // If auth middleware populates req.user.id... assuming for now passed in body or token -> logic
            // Since no auth middleware in context, assuming passed in body or extracted.
            // Schema manual movement doesn't enforce userId, but service needs it.
            // I will attach a dummy or req.body.userId if provided.

            const { body } = addManualMovementSchema.parse({ body: req.body });
            const userId = req.body.userId || 'unknown-user'; // Fallback if not strictly enforced by middleware yet

            const movement = await CashShiftService.addManualMovement({ ...body, userId });
            res.status(201).json(movement);
        } catch (error: any) {
            res.status(500).json({ message: 'Error agregando movimiento', error: error.message });
        }
    }
};
