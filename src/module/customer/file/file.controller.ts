import { Request, Response } from 'express';
import { FileService } from './file.service';
import { createFileSchema, updateFileSchema, fileIdSchema, fileFiltersSchema } from './file.schema';
import { paginationQuerySchema } from '@/schemas/pagination.schema';
import { StorageService } from './storage.service';
import multer from 'multer';
import prisma from '@/config/prisma';

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
    upload: async (req: Request, res: Response) => {
        if (!req.file) {
            return res.status(400).json({ message: 'No se ha proporcionado ningún archivo' });
        }

        const societyId = req.query.societyId as string;
        if (!societyId) {
            return res.status(400).json({ message: 'societyId es requerido' });
        }

        const category = (req.query.category as string) || 'GENERAL';
        try {
            // 0. Resolver Sociedad (por ID o Código)
            let society = await prisma.society.findUnique({ where: { code: societyId } });
            if (!society) {
                const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(societyId);
                if (isUuid) {
                    society = await prisma.society.findUnique({ where: { id: societyId } });
                }
            }

            if (!society) {
                return res.status(404).json({ message: 'Sociedad no encontrada' });
            }

            const targetSocietyId = society.id;

            // Folder logic: 
            // GENERAL -> societies/{id}/files/
            // REPORT  -> societies/{id}/reports/ (so R2 lifecycle can delete it later)
            const folder = category === 'REPORT'
                ? `societies/${targetSocietyId}/reports`
                : `societies/${targetSocietyId}/files`;

            // Validar Límite de Almacenamiento (Solo para GENERAL)
            if (category !== 'REPORT') {
                const currentUsage = await prisma.file.aggregate({
                    where: {
                        societyId: targetSocietyId,
                        category: 'GENERAL' // Solo contamos archivos que NO son reportes
                    },
                    _sum: { size: true }
                });
                const totalSize = (currentUsage._sum.size || 0) + req.file.size;
                // Fallback to 150MB (157286400) if limit is 0 (due to older records without default)
                let limit = Number(society.storageLimit);
                if (!limit || limit === 0) {
                    limit = 157286400;
                }

                if (totalSize > limit) {
                    const limitMB = (limit / (1024 * 1024)).toFixed(2);
                    return res.status(400).json({
                        message: `Espacio insuficiente. Has excedido tu límite de ${limitMB} MB.`
                    });
                }
            }

            // 1. Subir a R2
            const uploadResult = await StorageService.uploadFile(
                req.file.buffer,
                req.file.originalname,
                folder,
                req.file.mimetype
            );

            // 2. Guardar Metadata en BD
            const expiresAt = category === 'REPORT'
                ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // +7 días
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
        } catch (error: any) {
            console.error(error);
            res.status(500).json({ message: error.message || 'Error al procesar la subida' });
        }
    },
    /**
     * Obtener todos los archivos con paginación
     */
    getAll: async (req: Request, res: Response) => {
        const paginationParse = paginationQuerySchema.safeParse({ query: req.query });
        const filtersParse = fileFiltersSchema.safeParse({ query: req.query });

        if (!paginationParse.success || !filtersParse.success) {
            return res.status(400).json({
                ...(paginationParse.error?.format?.() ?? {}),
                ...(filtersParse.error?.format?.() ?? {}),
            });
        }

        const result = await FileService.getAll(
            paginationParse.data.query,
            filtersParse.data.query
        );
        res.json(result);
    },

    /**
     * Obtener archivo por ID
     */
    getById: async (req: Request, res: Response) => {
        const parse = fileIdSchema.safeParse({ params: req.params });
        if (!parse.success) {
            return res.status(400).json(parse.error.format());
        }

        const file = await FileService.getById(parse.data.params.id);
        if (!file) {
            return res.status(404).json({ message: 'Archivo no encontrado' });
        }
        res.json(file);
    },

    /**
     * Crear un nuevo archivo (Metadata)
     */
    create: async (req: Request, res: Response) => {
        const parse = createFileSchema.safeParse({ body: req.body });
        if (!parse.success) {
            return res.status(400).json(parse.error.format());
        }

        const result = await FileService.create(parse.data.body);
        res.status(201).json(result);
    },

    /**
     * Actualizar un archivo (Metadata)
     */
    update: async (req: Request, res: Response) => {
        const idParse = fileIdSchema.safeParse({ params: req.params });
        const bodyParse = updateFileSchema.safeParse({ body: req.body });

        if (!idParse.success || !bodyParse.success) {
            return res.status(400).json({
                ...(idParse.error?.format?.() ?? {}),
                ...(bodyParse.error?.format?.() ?? {}),
            });
        }

        const result = await FileService.update(idParse.data.params.id, bodyParse.data.body);
        res.json(result);
    },

    /**
     * Eliminar un archivo (Hard Delete)
     */
    delete: async (req: Request, res: Response) => {
        const parse = fileIdSchema.safeParse({ params: req.params });
        if (!parse.success) {
            return res.status(400).json(parse.error.format());
        }

        const result = await FileService.delete(parse.data.params.id);
        res.json({ message: 'Archivo eliminado permanentemente', data: result });
    },
};
