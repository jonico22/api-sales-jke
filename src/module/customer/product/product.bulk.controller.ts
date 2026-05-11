import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import prisma from '@/config/prisma';
import { ProductBulkService } from './product.bulk.service';
import { AppError } from '@/utils/AppError';

// Ensure upload directory exists
const uploadDir = path.join(process.cwd(), 'uploads', 'temp');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Use memory storage to avoid stream issues
const storage = multer.memoryStorage();

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB max
        files: 1
    },
    fileFilter: (req, file, cb) => {
        const allowedMimeTypes = ['text/csv', 'application/vnd.ms-excel', 'text/plain'];
        if (allowedMimeTypes.includes(file.mimetype) || file.originalname.endsWith('.csv')) {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten archivos CSV.'));
        }
    },
});

export class ProductBulkController {

    static uploadMiddleware = upload.single('file');

    static async bulkUpload(req: Request, res: Response) {
        let tempFilePath: string | null = null;

        try {
            if (!req.file) {
                return res.status(400).json({
                    status: 'error',
                    message: 'No se ha subido ningún archivo.'
                });
            }

            const societyCode = req.query.societyCode as string;
            const createdBy = req.query.createdBy as string;

            if (!societyCode) {
                return res.status(400).json({
                    status: 'error',
                    message: 'societyCode es requerido.'
                });
            }

            if (!createdBy) {
                return res.status(400).json({
                    status: 'error',
                    message: 'createdBy es requerido.'
                });
            }

            // Find society by code
            const society = await prisma.society.findUnique({
                where: { code: societyCode },
                select: { id: true }
            });

            if (!society) {
                return res.status(404).json({
                    status: 'error',
                    message: `No se encontró una sociedad con el código: ${societyCode}`
                });
            }

            // Write buffer to temporary file
            tempFilePath = path.join(uploadDir, `${Date.now()}-${req.file.originalname}`);
            fs.writeFileSync(tempFilePath, req.file.buffer);

            const result = await ProductBulkService.processBulkUpload(tempFilePath, society.id, createdBy);

            res.status(200).json({
                status: 'success',
                message: 'Carga masiva de productos procesada',
                details: result,
            });
        } catch (error: any) {
            // Clean up temp file on error
            if (tempFilePath && fs.existsSync(tempFilePath)) {
                try {
                    fs.unlinkSync(tempFilePath);
                } catch (cleanupError) {
                    console.error('Error cleaning up file:', cleanupError);
                }
            }

            const statusCode = error instanceof AppError ? error.statusCode : 500;
            res.status(statusCode).json({
                status: 'error',
                message: error.message || 'Error interno en carga masiva',
                error: error.message
            });
        }
    }
}
