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
import { asyncHandler } from '@/utils/asyncHandler';
import { formatSafeParseErrors, getQueryString } from '@/utils/controller-helpers';

export const CashShiftController = {

    openShift: asyncHandler(async (req: Request, res: Response) => {
        const { body } = openShiftSchema.parse({ body: req.body });
        const shift = await CashShiftService.openShift(body);
        res.status(201).json(shift);
    }),

    closeShift: asyncHandler(async (req: Request, res: Response) => {
        const { params } = cashShiftIdSchema.parse({ params: req.params });
        const { body } = closeShiftSchema.parse({ body: req.body, params: req.params });
        const data = { ...body, id: params.id };
        const shift = await CashShiftService.closeShift(data);
        res.json(shift);
    }),

    getById: asyncHandler(async (req: Request, res: Response) => {
        const { params } = cashShiftIdSchema.parse({ params: req.params });
        const shift = await CashShiftService.getById(params.id);
        if (!shift) return res.status(404).json({ message: 'Caja no encontrada' });
        res.json(shift);
    }),

    getAll: asyncHandler(async (req: Request, res: Response) => {
        const paginationParse = paginationQuerySchema.safeParse({ query: req.query });
        const filtersParse = cashShiftFiltersSchema.safeParse({ query: req.query });

        if (!paginationParse.success || !filtersParse.success) {
            return res.status(400).json(formatSafeParseErrors(paginationParse, filtersParse));
        }

        const result = await CashShiftService.getAll(paginationParse.data.query, filtersParse.data.query);
        res.json(result);
    }),

    addManualMovement: asyncHandler(async (req: Request, res: Response) => {
        const { body } = addManualMovementSchema.parse({ body: req.body });
        const userId = req.body.userId || 'unknown-user';

        const movement = await CashShiftService.addManualMovement({ ...body, userId });
        res.status(201).json(movement);
    }),

    getCreatedByUsers: asyncHandler(async (req: Request, res: Response) => {
        const societyIdOrCode = getQueryString(req, 'societyCode', 'societyId');
        const users = await CashShiftService.getCreatedByUsers(societyIdOrCode);
        res.json(users);
    }),

    getCurrentShift: asyncHandler(async (req: Request, res: Response) => {
        const { query } = getCurrentShiftSchema.parse({ query: req.query });
        const { branchId, userId, societyId, societyCode } = query;

        const shift = await CashShiftService.getCurrentShift(branchId, userId, societyCode || societyId);
        res.json(shift);
    }),

    getForSelect: asyncHandler(async (req: Request, res: Response) => {
        const societyIdOrCode = getQueryString(req, 'societyCode', 'societyId');
        const branchId = req.query.branchId as string | undefined;
        const status = req.query.status as string | undefined;
        const result = await CashShiftService.getForSelect(societyIdOrCode, branchId, status);
        res.json(result);
    })
};
