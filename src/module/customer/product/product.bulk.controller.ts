import { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { ProductBulkService } from './product.bulk.service';

// Configure Multer Storage (Temporary)
const upload = multer({
    dest: 'uploads/temp/',
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'text/csv' || file.mimetype === 'application/vnd.ms-excel') {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten archivos CSV.'));
        }
    },
});

export class ProductBulkController {
    // Middleware for route
    static uploadMiddleware = upload.single('file');

    static async bulkUpload(req: Request, res: Response) {
        try {
            if (!req.file) {
                return res.status(400).json({ message: 'No se ha subido ningún archivo.' });
            }

            const societyId = req.query.societyId as string; // Assuming passed in query or context

            // Ideally get societyId from authenticated user context (req.user.societyId)
            // For now, fail if not present or passed
            if (!societyId) {
                return res.status(400).json({ message: 'societyId es requerido.' });
            }

            const result = await ProductBulkService.processBulkUpload(req.file.path, societyId);

            res.status(200).json({
                message: 'Carga masiva procesada',
                details: result,
            });
        } catch (error: any) {
            console.error(error);
            res.status(500).json({ message: 'Error interno en carga masiva', error: error.message });
        }
    }
}
