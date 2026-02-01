import { Request, Response } from 'express';
import { BussinessPartnerService } from './bussinesspartner.service';
import {
    createBussinessPartnerSchema,
    updateBussinessPartnerSchema,
    bussinessPartnerIdSchema,
} from './bussinesspartner.schema';

export const BussinessPartnerController = {
    /**
     * GET /api/bussinesspartners
     * Obtener todos los socios de negocio
     */
    getAll: async (req: Request, res: Response) => {
        const societyId = req.query.societyId as string | undefined;
        const result = await BussinessPartnerService.getAll(societyId);
        res.json(result);
    },

    /**
     * GET /api/bussinesspartners/:id
     * Obtener un socio de negocio por ID
     */
    getById: async (req: Request, res: Response) => {
        const parse = bussinessPartnerIdSchema.safeParse({ params: req.params });
        if (!parse.success) return res.status(400).json(parse.error.format());

        const result = await BussinessPartnerService.getById(parse.data.params.id);
        if (!result) {
            return res.status(404).json({ message: 'Socio de negocio no encontrado' });
        }
        res.json(result);
    },

    /**
     * POST /api/bussinesspartners
     * Crear un nuevo socio de negocio
     */
    create: async (req: Request, res: Response) => {
        const parse = createBussinessPartnerSchema.safeParse({ body: req.body });
        if (!parse.success) return res.status(400).json(parse.error.format());

        // Verificar si el email ya existe
        const existingByEmail = await BussinessPartnerService.findByEmail(parse.data.body.email);
        if (existingByEmail) {
            return res.status(409).json({ message: 'El email ya está registrado' });
        }

        // Verificar si el documento ya existe (si se proporciona)
        if (parse.data.body.documentNumber) {
            const existingByDoc = await BussinessPartnerService.findByDocumentNumber(
                parse.data.body.documentNumber
            );
            if (existingByDoc) {
                return res.status(409).json({ message: 'El número de documento ya está registrado' });
            }
        }

        const result = await BussinessPartnerService.create(parse.data.body);
        res.status(201).json(result);
    },

    /**
     * PUT /api/bussinesspartners/:id
     * Actualizar un socio de negocio
     */
    update: async (req: Request, res: Response) => {
        const idParse = bussinessPartnerIdSchema.safeParse({ params: req.params });
        const bodyParse = updateBussinessPartnerSchema.safeParse({ body: req.body });

        if (!idParse.success || !bodyParse.success) {
            return res.status(400).json({
                ...(idParse.error?.format?.() ?? {}),
                ...(bodyParse.error?.format?.() ?? {}),
            });
        }

        // Verificar si el socio existe
        const existing = await BussinessPartnerService.getById(idParse.data.params.id);
        if (!existing) {
            return res.status(404).json({ message: 'Socio de negocio no encontrado' });
        }

        // Si se está actualizando el email, verificar que no exista
        if (bodyParse.data.body.email && bodyParse.data.body.email !== existing.email) {
            const existingByEmail = await BussinessPartnerService.findByEmail(bodyParse.data.body.email);
            if (existingByEmail) {
                return res.status(409).json({ message: 'El email ya está registrado' });
            }
        }

        const result = await BussinessPartnerService.update(
            idParse.data.params.id,
            bodyParse.data.body
        );
        res.json(result);
    },

    /**
     * DELETE /api/bussinesspartners/:id
     * Eliminar (soft delete) un socio de negocio
     */
    delete: async (req: Request, res: Response) => {
        const parse = bussinessPartnerIdSchema.safeParse({ params: req.params });
        if (!parse.success) return res.status(400).json(parse.error.format());

        const existing = await BussinessPartnerService.getById(parse.data.params.id);
        if (!existing) {
            return res.status(404).json({ message: 'Socio de negocio no encontrado' });
        }

        await BussinessPartnerService.softDelete(parse.data.params.id, req.body?.updatedBy);
        res.status(204).send();
    },
};
