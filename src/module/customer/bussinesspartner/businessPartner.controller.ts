import { Request, Response } from 'express';
import { BusinessPartnerService } from './businessPartner.service';
import {
    createBusinessPartnerSchema,
    updateBusinessPartnerSchema,
    businessPartnerIdSchema,
    businessPartnerFiltersSchema,
} from './businessPartner.schema';
import { paginationQuerySchema } from '@/schemas/pagination.schema';
import { asyncHandler } from '@/utils/asyncHandler';
import { formatSafeParseErrors, getQueryString } from '@/utils/controller-helpers';

export const BusinessPartnerController = {
    getAll: asyncHandler(async (req: Request, res: Response) => {
        const paginationParse = paginationQuerySchema.safeParse({ query: req.query });
        const filtersParse = businessPartnerFiltersSchema.safeParse({ query: req.query });

        if (!paginationParse.success || !filtersParse.success) {
            return res.status(400).json(formatSafeParseErrors(paginationParse, filtersParse));
        }

        const result = await BusinessPartnerService.getAll(
            paginationParse.data.query,
            undefined,
            filtersParse.data.query
        );
        res.json(result);
    }),

    getById: asyncHandler(async (req: Request, res: Response) => {
        const parse = businessPartnerIdSchema.safeParse({ params: req.params });
        if (!parse.success) return res.status(400).json(parse.error.format());

        const result = await BusinessPartnerService.getById(parse.data.params.id);
        if (!result) {
            return res.status(404).json({ message: 'Socio de negocio no encontrado' });
        }
        res.json(result);
    }),

    create: asyncHandler(async (req: Request, res: Response) => {
        const parse = createBusinessPartnerSchema.safeParse({ body: req.body });
        if (!parse.success) return res.status(400).json(parse.error.format());

        if (parse.data.body.email) {
            const existingByEmail = await BusinessPartnerService.findByEmail(parse.data.body.email);
            if (existingByEmail) {
                return res.status(409).json({ message: 'El email ya está registrado' });
            }
        }

        if (parse.data.body.documentNumber) {
            const existingByDoc = await BusinessPartnerService.findByDocumentNumber(
                parse.data.body.documentNumber
            );
            if (existingByDoc) {
                return res.status(409).json({ message: 'El número de documento ya está registrado' });
            }
        }

        const result = await BusinessPartnerService.create(parse.data.body);
        res.status(201).json(result);
    }),

    update: asyncHandler(async (req: Request, res: Response) => {
        const idParse = businessPartnerIdSchema.safeParse({ params: req.params });
        const bodyParse = updateBusinessPartnerSchema.safeParse({ body: req.body });

        if (!idParse.success || !bodyParse.success) {
            return res.status(400).json(formatSafeParseErrors(idParse, bodyParse));
        }

        const existing = await BusinessPartnerService.getById(idParse.data.params.id);
        if (!existing) {
            return res.status(404).json({ message: 'Socio de negocio no encontrado' });
        }

        if (bodyParse.data.body.email && bodyParse.data.body.email !== existing.email) {
            const existingByEmail = await BusinessPartnerService.findByEmail(bodyParse.data.body.email);
            if (existingByEmail) {
                return res.status(409).json({ message: 'El email ya está registrado' });
            }
        }

        const result = await BusinessPartnerService.update(
            idParse.data.params.id,
            bodyParse.data.body
        );
        res.json(result);
    }),

    getForSelect: asyncHandler(async (req: Request, res: Response) => {
        const societyCode = getQueryString(req, 'societyCode', 'societyId');
        const type = req.query.type as any;

        const result = await BusinessPartnerService.getForSelect(societyCode, type);
        res.json(result);
    }),

    delete: asyncHandler(async (req: Request, res: Response) => {
        const parse = businessPartnerIdSchema.safeParse({ params: req.params });
        if (!parse.success) return res.status(400).json(parse.error.format());

        const existing = await BusinessPartnerService.getById(parse.data.params.id);
        if (!existing) {
            return res.status(404).json({ message: 'Socio de negocio no encontrado' });
        }

        await BusinessPartnerService.softDelete(parse.data.params.id, req.body?.updatedBy);
        res.status(204).send();
    }),
};

export const BussinessPartnerController = BusinessPartnerController;
