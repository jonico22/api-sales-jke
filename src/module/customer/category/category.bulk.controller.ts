import { Request, Response } from 'express';
import multer from 'multer';
import { CategoryBulkService } from './category.bulk.service';

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

export class CategoryBulkController {
    static uploadMiddleware = upload.single('file');

    static async bulkUpload(req: Request, res: Response) {
        try {
            if (!req.file) {
                return res.status(400).json({ message: 'No se ha subido ningún archivo.' });
            }

            const societyId = req.query.societyId as string;
            if (!societyId) {
                return res.status(400).json({ message: 'societyId es requerido.' });
            }

            const result = await CategoryBulkService.processBulkUpload(req.file.path, societyId);

            res.status(200).json({
                message: 'Carga masiva de categorías procesada',
                details: result,
            });
        } catch (error: any) {
            // Clean error message if it's our custom validation
            const msg = error.message.includes('Fila') ? error.message : 'Error interno en carga masiva';
            res.status(500).json({ message: msg, error: error.message });
        }
    }
}
