import { Request, Response } from 'express';
import { FileService } from './file.service';
import { createFileSchema, updateFileSchema, fileIdSchema, fileFiltersSchema } from './file.schema';
import { paginationQuerySchema } from '@/schemas/pagination.schema';
import { StorageService } from './storage.service';
import multer from 'multer';
import prisma from '@/config/prisma';
import { asyncHandler } from '@/utils/asyncHandler';
import { NotFoundAppError, ValidationAppError } from '@/utils/domain-errors';
import { formatSafeParseErrors } from '@/utils/controller-helpers';

// Multer Memory Storage for R2 Upload
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB Limit
}).single('file'); // 'file' is the field name

export const FileController = {
    // Middleware de subida
    uploadMiddleware: upload,

    /**
     * Subir nuevo archivo (Físico + Metadata)
     */
    upload: asyncHandler(async (req: Request, res: Response) => {
        if (!req.file) {
            return res.status(400).json({ message: 'No se ha proporcionado ningún archivo' });
        }

        const societyId = req.query.societyId as string;
        if (!societyId) {
            return res.status(400).json({ message: 'societyId es requerido' });
        }

        const category = (req.query.category as string) || 'GENERAL';
        // 0. Resolver Sociedad (por ID o Código)
        let society = await prisma.society.findUnique({ where: { code: societyId } });
        if (!society) {
            const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(societyId);
            if (isUuid) {
                society = await prisma.society.findUnique({ where: { id: societyId } });
            }
        }

        if (!society) {
            throw new NotFoundAppError('Sociedad no encontrada', { societyIdOrCode: societyId });
        }

        const targetSocietyId = society.id;

        const folder = category === 'REPORT'
            ? `societies/${targetSocietyId}/reports`
            : `societies/${targetSocietyId}/files`;

        if (category !== 'REPORT') {
            const currentUsage = await prisma.file.aggregate({
                where: {
                    societyId: targetSocietyId,
                    category: 'GENERAL'
                },
                _sum: { size: true }
            });
            const totalSize = (currentUsage._sum.size || 0) + req.file.size;
            let limit = Number(society.storageLimit);
            if (!limit || limit === 0) {
                limit = 157286400;
            }

            if (totalSize > limit) {
                const limitMB = (limit / (1024 * 1024)).toFixed(2);
                throw new ValidationAppError(
                    `Espacio insuficiente. Has excedido tu límite de ${limitMB} MB.`,
                    { limitBytes: limit, attemptedSize: totalSize }
                );
            }
        }

        const uploadResult = await StorageService.uploadFile(
            req.file.buffer,
            req.file.originalname,
            folder,
            req.file.mimetype
        );

        const expiresAt = category === 'REPORT'
            ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
            : null;

        const fileData = await FileService.create({
            name: uploadResult.originalName,
            path: uploadResult.url,
            key: uploadResult.key,
            mimeType: req.file.mimetype,
            size: req.file.size,
            storageType: 'EXTERNAL',
            societyId: targetSocietyId,
            category: category as any,
            expiresAt: expiresAt
        });

        res.status(201).json(fileData);
    }),
    /**
     * Obtener todos los archivos con paginación
     */
    getAll: asyncHandler(async (req: Request, res: Response) => {
        const paginationParse = paginationQuerySchema.safeParse({ query: req.query });
        const filtersParse = fileFiltersSchema.safeParse({ query: req.query });

        if (!paginationParse.success || !filtersParse.success) {
            return res.status(400).json(formatSafeParseErrors(paginationParse, filtersParse));
        }

        const result = await FileService.getAll(
            paginationParse.data.query,
            filtersParse.data.query
        );
        res.json(result);
    }),

    /**
     * Obtener archivo por ID
     */
    getById: asyncHandler(async (req: Request, res: Response) => {
        const parse = fileIdSchema.safeParse({ params: req.params });
        if (!parse.success) {
            return res.status(400).json(parse.error.format());
        }

        const file = await FileService.getById(parse.data.params.id);
        if (!file) {
            return res.status(404).json({ message: 'Archivo no encontrado' });
        }
        res.json(file);
    }),

    /**
     * Crear un nuevo archivo (Metadata)
     */
    create: asyncHandler(async (req: Request, res: Response) => {
        const parse = createFileSchema.safeParse({ body: req.body });
        if (!parse.success) {
            return res.status(400).json(parse.error.format());
        }

        const result = await FileService.create(parse.data.body);
        res.status(201).json(result);
    }),

    /**
     * Actualizar un archivo (Metadata)
     */
    update: asyncHandler(async (req: Request, res: Response) => {
        const idParse = fileIdSchema.safeParse({ params: req.params });
        const bodyParse = updateFileSchema.safeParse({ body: req.body });

        if (!idParse.success || !bodyParse.success) {
            return res.status(400).json(formatSafeParseErrors(idParse, bodyParse));
        }

        const result = await FileService.update(idParse.data.params.id, bodyParse.data.body);
        res.json(result);
    }),

    /**
     * Eliminar un archivo (Hard Delete)
     */
    delete: asyncHandler(async (req: Request, res: Response) => {
        const parse = fileIdSchema.safeParse({ params: req.params });
        if (!parse.success) {
            return res.status(400).json(parse.error.format());
        }

        const result = await FileService.delete(parse.data.params.id);
        res.json({ message: 'Archivo eliminado permanentemente', data: result });
    }),
};
