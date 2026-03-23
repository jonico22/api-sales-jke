import { Request, Response } from 'express';
import { CashShiftService } from './cashShift.service';
import {
    openShiftSchema,
    closeShiftSchema,
    addManualMovementSchema,
    cashShiftIdSchema,
    cashShiftFiltersSchema,
    getCurrentShiftSchema
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
            const { body } = addManualMovementSchema.parse({ body: req.body });
            const userId = req.body.userId || 'unknown-user';

            const movement = await CashShiftService.addManualMovement({ ...body, userId });
            res.status(201).json(movement);
        } catch (error: any) {
            res.status(500).json({ message: 'Error agregando movimiento', error: error.message });
        }
    },

    getCreatedByUsers: async (req: Request, res: Response) => {
        try {
            const societyIdOrCode = req.query.societyCode as string || req.query.societyId as string;
            const users = await CashShiftService.getCreatedByUsers(societyIdOrCode);
            res.json(users);
        } catch (error: any) {
            res.status(500).json({ message: 'Error obteniendo usuarios de cajas', error: error.message });
        }
    },

    getCurrentShift: async (req: Request, res: Response) => {
        try {
            const { query } = getCurrentShiftSchema.parse({ query: req.query });
            const { branchId, userId, societyId, societyCode } = query;

            const shift = await CashShiftService.getCurrentShift(branchId, userId, societyCode || societyId);
            res.json(shift);
        } catch (error: any) {
            res.status(500).json({ message: 'Error obteniendo estado de caja', error: error.message });
        }
    },

    getForSelect: async (req: Request, res: Response) => {
        try {
            const societyIdOrCode = (req.query.societyCode || req.query.societyId) as string | undefined;
            const branchId = req.query.branchId as string | undefined;
            const status = req.query.status as string | undefined;
            const result = await CashShiftService.getForSelect(societyIdOrCode, branchId, status);
            res.json(result);
        } catch (error: any) {
            res.status(500).json({ message: 'Error obteniendo cajas para selector', error: error.message });
        }
    }
};
