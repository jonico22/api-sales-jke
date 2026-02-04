import { Request, Response } from 'express';
import { FileService } from './file.service';
import { createFileSchema, updateFileSchema, fileIdSchema, fileFiltersSchema } from './file.schema';
import { paginationQuerySchema } from '@/schemas/pagination.schema';

export const FileController = {
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
